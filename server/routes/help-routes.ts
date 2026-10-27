import { z } from 'zod';
import type { ContactLog, HelpRequest, HelpStatus, HelpStatusEvent, HelpUpdate, Priority } from '@/lib/shared-types';
import { logAudit } from '../audit';
import type { ApiContext } from '../context';
import {
  assertEntityInWorkspace,
  broadcastWorkspaceRefresh,
  designatedSecretary,
  jsonBody,
  organizationUsers,
  user,
  workspace,
} from '../context';
import { parseJson, placeholders, type SqlRow } from '../db';
import { notifyUsers } from '../notifications';
import { canViewPhone, hasPermission, isAdmin, maskPhone } from '../permissions';
import { attachmentFromRow, listAttachments } from '../storage';
import { HttpError, id, json, makeReference, nowIso, oneLine, smsUrl, telUrl, whatsappUrl } from '../utils';
import { contactLogSchema, helpCreateSchema, helpStatusSchema, helpUpdateSchema } from '../validation';

interface HelpRow extends SqlRow {
  id: string;
  organization_id: string;
  requester_id: string;
  assigned_to: string | null;
  status: string;
}

function mapHelp(row: SqlRow, ctx: ApiContext): HelpRequest {
  const auth = user(ctx);
  const requesterId = String(row.requester_id);
  const assigneeId = row.assigned_to ? String(row.assigned_to) : '';
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    requester_id: requesterId,
    assigned_to: row.assigned_to ? String(row.assigned_to) : null,
    client_request_id: String(row.client_request_id),
    reference: String(row.reference),
    request_type: String(row.request_type),
    subject: String(row.subject),
    description: String(row.description),
    location: String(row.location),
    priority: String(row.priority) as HelpRequest['priority'],
    status: String(row.status) as HelpStatus,
    channel: String(row.channel),
    submitted_at: String(row.submitted_at),
    acknowledged_at: row.acknowledged_at ? String(row.acknowledged_at) : null,
    resolved_at: row.resolved_at ? String(row.resolved_at) : null,
    closed_at: row.closed_at ? String(row.closed_at) : null,
    resolution_note: row.resolution_note ? String(row.resolution_note) : null,
    escalation_level: Number(row.escalation_level || 0),
    last_escalated_at: row.last_escalated_at ? String(row.last_escalated_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    requester_name: String(row.requester_name || ''),
    requester_role: row.requester_role ? (String(row.requester_role) as HelpRequest['requester_role']) : undefined,
    requester_phone: canViewPhone(auth, requesterId) ? String(row.requester_phone || '') : maskPhone(String(row.requester_phone || '')),
    assignee_name: row.assignee_name ? String(row.assignee_name) : undefined,
    assignee_phone: assigneeId && canViewPhone(auth, assigneeId) ? String(row.assignee_phone || '') : maskPhone(String(row.assignee_phone || '')),
  };
}

function canAccessHelp(ctx: ApiContext, row: SqlRow): boolean {
  const auth = user(ctx);
  if (isAdmin(auth) || hasPermission(auth, 'manage_help')) return true;
  return String(row.requester_id) === auth.user.id || String(row.assigned_to || '') === auth.user.id;
}

async function findHelp(ctx: ApiContext, options: { requireManage?: boolean } = {}): Promise<SqlRow> {
  const access = await workspace(ctx);
  const row = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'help_requests', ctx.params.id);
  if (!canAccessHelp(ctx, row)) throw new HttpError(403, 'You are not authorized to view this HELP request.');
  if (options.requireManage && !isAdmin(user(ctx)) && !hasPermission(user(ctx), 'manage_help')) {
    throw new HttpError(403, 'Only the assigned Secretary or an administrator can change this request.');
  }
  return row;
}

async function deliverySummary(ctx: ApiContext, notificationIds: string[]): Promise<Array<{ channel: string; status: string; count: number }>> {
  if (notificationIds.length === 0) return [];
  const result = await ctx.runtime.db.query<SqlRow>(
    `SELECT channel, status, COUNT(*)::int AS count
     FROM notification_deliveries
     WHERE notification_id IN (${placeholders(notificationIds)})
     GROUP BY channel, status ORDER BY channel, status`,
    notificationIds,
  );
  return result.rows.map((row) => ({ channel: String(row.channel), status: String(row.status), count: Number(row.count) }));
}

export async function listHelpRequestsRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const access = await workspace(ctx);
  const { search, status, priority } = {
    search: ctx.url.searchParams.get('search')?.trim() || '',
    status: ctx.url.searchParams.get('status') || '',
    priority: ctx.url.searchParams.get('priority') || '',
  };
  const params: unknown[] = [access.organization.id];
  const conditions = ['h.organization_id = $1'];
  if (!isAdmin(auth) && !hasPermission(auth, 'manage_help')) {
    params.push(auth.user.id);
    conditions.push(`(h.requester_id = $${params.length} OR h.assigned_to = $${params.length})`);
  }
  if (status) {
    params.push(status);
    conditions.push(`h.status = $${params.length}`);
  }
  if (priority) {
    params.push(priority);
    conditions.push(`h.priority = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(h.reference ILIKE $${params.length} OR h.subject ILIKE $${params.length} OR h.description ILIKE $${params.length} OR h.location ILIKE $${params.length})`);
  }
  params.push(200);
  const result = await ctx.runtime.db.query<SqlRow>(
    `SELECT h.*, requester.name AS requester_name, requester.role AS requester_role, requester.phone AS requester_phone,
            assignee.name AS assignee_name, assignee.phone AS assignee_phone
     FROM help_requests h
     JOIN users requester ON requester.id = h.requester_id
     LEFT JOIN users assignee ON assignee.id = h.assigned_to
     WHERE ${conditions.join(' AND ')}
     ORDER BY CASE h.status WHEN 'new' THEN 0 WHEN 'acknowledged' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'resolved' THEN 3 ELSE 4 END,
              CASE h.priority WHEN 'critical' THEN 0 WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
              h.submitted_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return json({ requests: result.rows.map((row) => mapHelp(row, ctx)) });
}

interface HelpCreateBody {
  organizationId: string;
  clientRequestId: string;
  requestType?: string;
  subject: string;
  description: string;
  location: string;
  priority?: Priority;
  channel?: string;
}

async function insertHelpRequest(ctx: ApiContext, body: HelpCreateBody, organizationId: string, assignedTo: string | null): Promise<{ row: SqlRow; duplicate: boolean }> {
  const auth = user(ctx);
  const existing = await ctx.runtime.db.query<SqlRow>(
    'SELECT * FROM help_requests WHERE client_request_id = $1 AND requester_id = $2',
    [body.clientRequestId, auth.user.id],
  );
  if (existing.rows[0]) return { row: existing.rows[0], duplicate: true };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reference = makeReference('HELP');
    const referenceExists = await ctx.runtime.db.query('SELECT 1 FROM help_requests WHERE reference = $1', [reference]);
    if (referenceExists.rows.length > 0) continue;
    const helpId = id('help');
    const result = await ctx.runtime.db.query<SqlRow>(
      `INSERT INTO help_requests
        (id, organization_id, requester_id, assigned_to, client_request_id, reference, request_type,
         subject, description, location, priority, status, channel, submitted_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'new', $12, NOW(), NOW(), NOW())
       ON CONFLICT DO NOTHING RETURNING *`,
      [
        helpId,
        organizationId,
        auth.user.id,
        assignedTo,
        body.clientRequestId,
        reference,
        body.requestType || 'Urgent Assistance',
        body.subject,
        body.description,
        body.location,
        body.priority || 'urgent',
        body.channel || 'in_app',
      ],
    );
    if (result.rows[0]) {
      await ctx.runtime.db.query(
        `INSERT INTO help_status_history
          (id, help_request_id, event_type, previous_status, new_status, actor_id, comment, created_at)
         VALUES ($1, $2, 'created', NULL, 'new', $3, 'Request submitted by the President.', NOW())`,
        [id('helpstatus'), helpId, auth.user.id],
      );
      return { row: result.rows[0], duplicate: false };
    }
    const duplicate = await ctx.runtime.db.query<SqlRow>(
      'SELECT * FROM help_requests WHERE client_request_id = $1 AND requester_id = $2',
      [body.clientRequestId, auth.user.id],
    );
    if (duplicate.rows[0]) return { row: duplicate.rows[0], duplicate: true };
  }
  throw new HttpError(409, 'A unique request reference could not be created. Please try again.');
}

export async function createHelpRequestRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  if (!hasPermission(auth, 'create_help') && !isAdmin(auth)) {
    throw new HttpError(403, 'This account cannot create presidential HELP requests.');
  }
  const body = await jsonBody(ctx, helpCreateSchema);
  const access = await workspace(ctx);
  if (body.organizationId !== access.organization.id) throw new HttpError(403, 'The selected workspace is not authorized.');
  const assignedTo = await designatedSecretary(ctx.runtime.db, access.organization.id);
  const { row, duplicate } = await insertHelpRequest(ctx, body, access.organization.id, assignedTo);

  if (duplicate) {
    const detail = await buildHelpDetail(ctx, String(row.id), row);
    return json({ request: detail, duplicate: true, message: 'This request was already submitted.' });
  }

  const primarySecretaries = await organizationUsers(ctx.runtime.db, access.organization.id, { primarySecretariesOnly: true });
  const admins = await organizationUsers(ctx.runtime.db, access.organization.id, { roles: ['system_admin'] });
  const recipients = Array.from(new Set([assignedTo || '', ...primarySecretaries, ...admins])).filter(Boolean);
  const secretaryNotifications = await notifyUsers(ctx.runtime, {
    userIds: recipients,
    organizationId: access.organization.id,
    type: 'help_new',
    title: 'Urgent HELP request',
    body: `${String(row.reference)} — ${oneLine(row.subject, 100)} at ${oneLine(row.location, 80)}.`,
    link: `/workspace/help/${String(row.id)}`,
    severity: body.priority === 'critical' || body.priority === 'urgent' ? 'critical' : 'warning',
    category: 'help',
    dedupeKey: `help-new:${String(row.id)}`,
    reason: 'help_new',
  });
  const requesterNotifications = await notifyUsers(ctx.runtime, {
    userIds: [auth.user.id],
    organizationId: access.organization.id,
    type: 'help_submitted',
    title: 'HELP request submitted',
    body: `Your request ${String(row.reference)} was saved and routed to the Secretariat.`,
    link: `/workspace/help/${String(row.id)}`,
    severity: 'success',
    category: 'help',
    dedupeKey: `help-submitted:${String(row.id)}`,
    reason: 'help_submitted',
  });

  if (assignedTo) {
    await ctx.runtime.db.query(
      `INSERT INTO messages
        (id, organization_id, sender_id, recipient_id, subject, body, help_request_id, delivered_at, read_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NULL, NOW())`,
      [id('message'), access.organization.id, auth.user.id, assignedTo, `HELP ${String(row.reference)}`, String(row.description), String(row.id)],
    );
  }

  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'help.submitted',
    entityType: 'help_request',
    entityId: String(row.id),
    metadata: { reference: String(row.reference), priority: body.priority, assignedTo },
    request: ctx.request,
  });
  await broadcastWorkspaceRefresh(ctx, access.organization.id, 'help_new');

  const detail = await buildHelpDetail(ctx, String(row.id), row);
  return json({
    request: detail,
    duplicate: false,
    reference: String(row.reference),
    assignedTo,
    message: 'HELP request saved and routed to the Secretariat.',
    deliveryStatus: await deliverySummary(ctx, [...secretaryNotifications, ...requesterNotifications].map((item) => item.id)),
  }, 201);
}

async function buildHelpDetail(ctx: ApiContext, helpId: string, row: SqlRow): Promise<HelpRequest> {
  const db = ctx.runtime.db;
  const [detailResult, attachments, updates, history, contacts] = await Promise.all([
    db.query<SqlRow>(
      `SELECT h.*, requester.name AS requester_name, requester.role AS requester_role, requester.phone AS requester_phone,
              assignee.name AS assignee_name, assignee.phone AS assignee_phone
       FROM help_requests h
       JOIN users requester ON requester.id = h.requester_id
       LEFT JOIN users assignee ON assignee.id = h.assigned_to
       WHERE h.id = $1`,
      [helpId],
    ),
    listAttachments(db, String(row.organization_id), 'help_request', helpId),
    db.query<SqlRow>(
      `SELECT hu.*, u.name AS user_name FROM help_updates hu
       JOIN users u ON u.id = hu.user_id WHERE hu.help_request_id = $1 ORDER BY hu.created_at ASC`,
      [helpId],
    ),
    db.query<SqlRow>(
      `SELECT hs.*, u.name AS actor_name FROM help_status_history hs
       JOIN users u ON u.id = hs.actor_id WHERE hs.help_request_id = $1 ORDER BY hs.created_at ASC`,
      [helpId],
    ),
    db.query<SqlRow>(
      `SELECT cl.*, u.name AS user_name FROM contact_logs cl
       JOIN users u ON u.id = cl.user_id WHERE cl.help_request_id = $1 ORDER BY cl.created_at DESC`,
      [helpId],
    ),
  ]);
  const mapped = mapHelp(detailResult.rows[0] || row, ctx);
  return {
    ...mapped,
    attachments,
    updates: updates.rows.map((item): HelpUpdate => ({
      id: String(item.id),
      help_request_id: String(item.help_request_id),
      user_id: String(item.user_id),
      kind: String(item.kind) as HelpUpdate['kind'],
      message: String(item.message),
      created_at: String(item.created_at),
      user_name: String(item.user_name || ''),
    })),
    history: history.rows.map((item): HelpStatusEvent => ({
      id: String(item.id),
      help_request_id: String(item.help_request_id),
      event_type: String(item.event_type) as HelpStatusEvent['event_type'],
      previous_status: item.previous_status ? (String(item.previous_status) as HelpStatus) : null,
      new_status: item.new_status ? (String(item.new_status) as HelpStatus) : null,
      actor_id: String(item.actor_id),
      comment: item.comment ? String(item.comment) : null,
      created_at: String(item.created_at),
      actor_name: String(item.actor_name || ''),
    })),
    contact_logs: contacts.rows.map((item): ContactLog => ({
      id: String(item.id),
      help_request_id: String(item.help_request_id),
      user_id: String(item.user_id),
      contact_user_id: item.contact_user_id ? String(item.contact_user_id) : null,
      channel: String(item.channel) as ContactLog['channel'],
      note: String(item.note || ''),
      created_at: String(item.created_at),
      user_name: String(item.user_name || ''),
    })),
  };
}

export async function getHelpRequestRoute(ctx: ApiContext): Promise<Response> {
  const row = await findHelp(ctx);
  return json({ request: await buildHelpDetail(ctx, String(row.id), row) });
}

const TRANSITIONS: Record<string, string[]> = {
  new: ['acknowledged', 'in_progress', 'resolved', 'closed'],
  acknowledged: ['in_progress', 'resolved', 'closed', 'new'],
  in_progress: ['resolved', 'closed', 'acknowledged'],
  resolved: ['closed', 'in_progress'],
  closed: ['in_progress'],
};

async function changeHelpStatus(
  ctx: ApiContext,
  row: SqlRow,
  nextStatus: HelpStatus,
  comment: string,
  resolutionNote: string,
  eventType: 'status_change' | 'reopened' = 'status_change',
): Promise<SqlRow> {
  const auth = user(ctx);
  const previousStatus = String(row.status) as HelpStatus;
  if (!TRANSITIONS[previousStatus]?.includes(nextStatus)) {
    throw new HttpError(400, `Changing a request from ${previousStatus} to ${nextStatus} is not permitted.`);
  }
  const now = nowIso();
  const acknowledgedAt = row.acknowledged_at ? String(row.acknowledged_at) : previousStatus === 'new' && nextStatus !== 'new' ? now : null;
  const resolvedAt = nextStatus === 'resolved' ? now : eventType === 'reopened' ? null : row.resolved_at ? String(row.resolved_at) : null;
  const closedAt = nextStatus === 'closed' ? now : eventType === 'reopened' ? null : row.closed_at ? String(row.closed_at) : null;
  const result = await ctx.runtime.db.query<SqlRow>(
    `UPDATE help_requests
     SET status = $2, acknowledged_at = $3::timestamptz, resolved_at = $4::timestamptz,
         closed_at = $5::timestamptz, resolution_note = $6
     WHERE id = $1 RETURNING *`,
    [String(row.id), nextStatus, acknowledgedAt, resolvedAt, closedAt, nextStatus === 'resolved' || nextStatus === 'closed' ? resolutionNote : eventType === 'reopened' ? null : row.resolution_note || null],
  );
  const historyId = id('helpstatus');
  await ctx.runtime.db.query(
    `INSERT INTO help_status_history
      (id, help_request_id, event_type, previous_status, new_status, actor_id, comment, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [historyId, String(row.id), eventType, previousStatus, nextStatus, auth.user.id, comment || null],
  );

  const requesterId = String(row.requester_id);
  const assigneeId = row.assigned_to ? String(row.assigned_to) : '';
  const recipients = eventType === 'reopened'
    ? Array.from(new Set([assigneeId, ...(await organizationUsers(ctx.runtime.db, String(row.organization_id), { primarySecretariesOnly: true }))])).filter(Boolean)
    : [requesterId];
  const title = nextStatus === 'acknowledged'
    ? 'HELP request acknowledged'
    : nextStatus === 'resolved'
      ? 'HELP request resolved'
      : nextStatus === 'closed'
        ? 'HELP request closed'
        : eventType === 'reopened'
          ? 'HELP request reopened'
          : 'HELP request status updated';
  await notifyUsers(ctx.runtime, {
    userIds: recipients,
    organizationId: String(row.organization_id),
    type: eventType === 'reopened' ? 'help_reopened' : 'help_status_changed',
    title,
    body: `${String(row.reference)} is now ${nextStatus.replaceAll('_', ' ')}.${comment ? ` ${comment}` : ''}`,
    link: `/workspace/help/${String(row.id)}`,
    severity: nextStatus === 'resolved' || nextStatus === 'closed' ? 'success' : 'warning',
    category: 'help',
    dedupeKey: `help-status:${historyId}`,
    reason: eventType === 'reopened' ? 'help_reopened' : 'help_status_changed',
  });
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: String(row.organization_id),
    action: eventType === 'reopened' ? 'help.reopened' : 'help.status_changed',
    entityType: 'help_request',
    entityId: String(row.id),
    metadata: { previousStatus, nextStatus, comment },
    request: ctx.request,
  });
  await broadcastWorkspaceRefresh(ctx, String(row.organization_id), 'help_status_changed');
  return result.rows[0] as SqlRow;
}

export async function acknowledgeHelpRoute(ctx: ApiContext): Promise<Response> {
  const row = await findHelp(ctx, { requireManage: true });
  if (String(row.status) !== 'new') {
    return json({ request: await buildHelpDetail(ctx, String(row.id), row), message: 'This request has already been acknowledged.' });
  }
  const updated = await changeHelpStatus(ctx, row, 'acknowledged', 'Receipt confirmed by the Secretariat.', '');
  return json({ request: await buildHelpDetail(ctx, String(row.id), updated), message: 'Request acknowledged.' });
}

export async function updateHelpStatusRoute(ctx: ApiContext): Promise<Response> {
  const row = await findHelp(ctx, { requireManage: true });
  const body = await jsonBody(ctx, helpStatusSchema);
  const updated = await changeHelpStatus(ctx, row, body.status, body.comment || '', body.resolutionNote || '');
  return json({ request: await buildHelpDetail(ctx, String(row.id), updated), message: `Request marked as ${body.status.replaceAll('_', ' ')}.` });
}

export async function reopenHelpRoute(ctx: ApiContext): Promise<Response> {
  const row = await findHelp(ctx);
  const auth = user(ctx);
  if (String(row.requester_id) !== auth.user.id && !isAdmin(auth)) {
    throw new HttpError(403, 'Only the requesting President or an administrator can reopen this request.');
  }
  if (!['resolved', 'closed'].includes(String(row.status))) {
    throw new HttpError(400, 'Only a resolved or closed request can be reopened.');
  }
  const updated = await changeHelpStatus(ctx, row, 'in_progress', 'Request reopened by the President.', '', 'reopened');
  return json({ request: await buildHelpDetail(ctx, String(row.id), updated), message: 'Request reopened. The full history is preserved.' });
}

export async function addHelpUpdateRoute(ctx: ApiContext): Promise<Response> {
  const row = await findHelp(ctx);
  const auth = user(ctx);
  const body = await jsonBody(ctx, helpUpdateSchema);
  const isRequester = String(row.requester_id) === auth.user.id;
  const kind = isRequester && body.kind === 'progress' ? 'follow_up' : (body.kind || 'progress');
  const updateId = id('helpupdate');
  await ctx.runtime.db.query(
    `INSERT INTO help_updates (id, help_request_id, user_id, kind, message, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [updateId, String(row.id), auth.user.id, kind, body.message],
  );

  let recipient = isRequester ? (row.assigned_to ? String(row.assigned_to) : '') : String(row.requester_id);
  if (!recipient) {
    const secretaries = await organizationUsers(ctx.runtime.db, String(row.organization_id), { primarySecretariesOnly: true });
    recipient = secretaries[0] || '';
  }
  if (recipient) {
    await ctx.runtime.db.query(
      `INSERT INTO messages
        (id, organization_id, sender_id, recipient_id, subject, body, help_request_id, delivered_at, read_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NULL, NOW())`,
      [id('message'), String(row.organization_id), auth.user.id, recipient, `HELP ${String(row.reference)} — ${kind.replaceAll('_', ' ')}`, body.message, String(row.id)],
    );
    await notifyUsers(ctx.runtime, {
      userIds: [recipient],
      organizationId: String(row.organization_id),
      type: kind === 'follow_up' ? 'help_follow_up' : 'help_progress',
      title: kind === 'follow_up' ? 'HELP follow-up message' : 'HELP progress update',
      body: `${String(row.reference)}: ${oneLine(body.message, 140)}`,
      link: `/workspace/help/${String(row.id)}`,
      severity: 'info',
      category: 'help',
      dedupeKey: `help-update:${updateId}`,
      reason: 'help_update',
    });
  }
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: String(row.organization_id),
    action: 'help.update_added',
    entityType: 'help_request',
    entityId: String(row.id),
    metadata: { kind },
    request: ctx.request,
  });
  await broadcastWorkspaceRefresh(ctx, String(row.organization_id), 'help_update');
  return json({ request: await buildHelpDetail(ctx, String(row.id), row), message: 'Update saved and delivered to the in-app inbox.' }, 201);
}

export async function logContactRoute(ctx: ApiContext): Promise<Response> {
  const row = await findHelp(ctx);
  const auth = user(ctx);
  const body = await jsonBody(ctx, contactLogSchema);
  const contactUserId = body.contactUserId || (String(row.requester_id) === auth.user.id ? (row.assigned_to ? String(row.assigned_to) : null) : String(row.requester_id));
  let contact: { phone: string; whatsapp: string; name: string } | null = null;
  let rawPhone = '';
  let rawWhatsapp = '';
  let contactAllowed = false;
  if (contactUserId) {
    const result = await ctx.runtime.db.query<SqlRow>(
      `SELECT u.id, u.name, u.phone, u.whatsapp_number
       FROM users u JOIN organization_members m ON m.user_id = u.id
       WHERE u.id = $1 AND m.organization_id = $2 AND u.is_active = TRUE`,
      [contactUserId, String(row.organization_id)],
    );
    if (result.rows[0]) {
      rawPhone = String(result.rows[0].phone || '');
      rawWhatsapp = String(result.rows[0].whatsapp_number || rawPhone);
      contactAllowed = canViewPhone(auth, contactUserId);
      contact = {
        name: String(result.rows[0].name || ''),
        phone: contactAllowed ? rawPhone : maskPhone(rawPhone),
        whatsapp: contactAllowed ? rawWhatsapp : maskPhone(rawWhatsapp),
      };
    }
  }
  const actionNote = body.note || (body.channel === 'call'
    ? 'Dialler prepared for the registered contact. Call placement is not confirmed by the system.'
    : body.channel === 'in_app'
      ? 'In-app message link opened.'
      : `${body.channel.toUpperCase()} composer opened for the registered contact. Delivery is not confirmed by the system.`);
  await ctx.runtime.db.query(
    `INSERT INTO contact_logs (id, help_request_id, user_id, contact_user_id, channel, note, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [id('contact'), String(row.id), auth.user.id, contactUserId, body.channel, actionNote],
  );
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: String(row.organization_id),
    action: 'help.contact_action',
    entityType: 'help_request',
    entityId: String(row.id),
    metadata: { channel: body.channel, contactUserId },
    request: ctx.request,
  });
  const message = `Hello, I am following up on HELP request ${String(row.reference)} — ${String(row.subject)}.`;
  return json({
    ok: true,
    message: actionNote,
    contact,
    links: contact && contactAllowed
      ? {
          call: telUrl(rawPhone),
          sms: smsUrl(rawPhone, message),
          whatsapp: whatsappUrl(rawWhatsapp, message),
        }
      : null,
  });
}

import { z } from 'zod';
import type { Announcement, DeliveryLog, DirectoryEntry, Message, Notification, SearchResult } from '@/lib/shared-types';
import { logAudit } from '../audit';
import type { ApiContext } from '../context';
import { broadcastWorkspaceRefresh, jsonBody, organizationUsers, user, workspace } from '../context';
import type { SqlRow } from '../db';
import { runMaintenance } from '../maintenance';
import { getProviderStatus, notificationFromRow, notifyUsers, unreadMessageCount, unreadNotificationCount } from '../notifications';
import { assertPermission, canViewPhone, hasPermission, isAdmin, maskPhone } from '../permissions';
import { HttpError, id, json, oneLine } from '../utils';
import { announcementSchema, messageSchema } from '../validation';

function mapMessage(row: SqlRow): Message {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    sender_id: String(row.sender_id),
    recipient_id: String(row.recipient_id),
    subject: String(row.subject || ''),
    body: String(row.body),
    help_request_id: row.help_request_id ? String(row.help_request_id) : null,
    delivered_at: String(row.delivered_at),
    read_at: row.read_at ? String(row.read_at) : null,
    created_at: String(row.created_at),
    sender_name: String(row.sender_name || ''),
    sender_role: row.sender_role ? (String(row.sender_role) as Message['sender_role']) : undefined,
    recipient_name: String(row.recipient_name || ''),
  };
}

function mapAnnouncement(row: SqlRow): Announcement {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    author_id: String(row.author_id),
    title: String(row.title),
    body: String(row.body),
    audience: String(row.audience) as Announcement['audience'],
    is_pinned: Boolean(row.is_pinned),
    created_at: String(row.created_at),
    author_name: String(row.author_name || ''),
  };
}

function mapDelivery(row: SqlRow): DeliveryLog {
  return {
    id: String(row.id),
    notification_id: row.notification_id ? String(row.notification_id) : null,
    user_id: String(row.user_id),
    channel: String(row.channel) as DeliveryLog['channel'],
    provider: String(row.provider || 'none'),
    status: String(row.status) as DeliveryLog['status'],
    recipient: String(row.recipient || ''),
    attempts: Number(row.attempts || 0),
    provider_message_id: row.provider_message_id ? String(row.provider_message_id) : null,
    last_error: row.last_error ? String(row.last_error) : null,
    sent_at: row.sent_at ? String(row.sent_at) : null,
    next_retry_at: row.next_retry_at ? String(row.next_retry_at) : null,
    created_at: String(row.created_at),
  };
}

export async function listNotificationsRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const access = await workspace(ctx, { requireRecords: false });
  const unreadOnly = ctx.url.searchParams.get('unread') === '1';
  const params: unknown[] = [auth.user.id, access.organization.id];
  let condition = '';
  if (unreadOnly) condition = ' AND is_read = FALSE';
  params.push(200);
  const result = await ctx.runtime.db.query<SqlRow>(
    `SELECT * FROM notifications
     WHERE user_id = $1 AND (organization_id IS NULL OR organization_id = $2)${condition}
     ORDER BY created_at DESC LIMIT $3`,
    params,
  );
  return json({
    notifications: result.rows.map(notificationFromRow) as Notification[],
    unreadCount: await unreadNotificationCount(ctx.runtime.db, auth.user.id),
  });
}

export async function markNotificationReadRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const result = await ctx.runtime.db.query<SqlRow>(
    `UPDATE notifications SET is_read = TRUE, read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [ctx.params.id, auth.user.id],
  );
  if (!result.rows[0]) return json({ error: 'Notification not found.' }, 404);
  return json({ notification: notificationFromRow(result.rows[0]), unreadCount: await unreadNotificationCount(ctx.runtime.db, auth.user.id) });
}

export async function markAllNotificationsReadRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  await ctx.runtime.db.query(
    'UPDATE notifications SET is_read = TRUE, read_at = COALESCE(read_at, NOW()) WHERE user_id = $1 AND is_read = FALSE',
    [auth.user.id],
  );
  return json({ ok: true, unreadCount: 0 });
}

export async function deliveryLogsRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  assertPermission(auth, 'view_delivery_logs');
  const access = await workspace(ctx, { requireRecords: false });
  const status = ctx.url.searchParams.get('status') || '';
  const channel = ctx.url.searchParams.get('channel') || '';
  const params: unknown[] = [];
  const conditions: string[] = [];
  if (!isAdmin(auth)) {
    params.push(access.organization.id);
    conditions.push(`(n.organization_id = $${params.length} OR n.organization_id IS NULL)`);
  }
  if (status) {
    params.push(status);
    conditions.push(`d.status = $${params.length}`);
  }
  if (channel) {
    params.push(channel);
    conditions.push(`d.channel = $${params.length}`);
  }
  params.push(300);
  const result = await ctx.runtime.db.query<SqlRow>(
    `SELECT d.*, u.name AS user_name, n.title AS notification_title
     FROM notification_deliveries d
     JOIN users u ON u.id = d.user_id
     LEFT JOIN notifications n ON n.id = d.notification_id
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY d.created_at DESC LIMIT $${params.length}`,
    params,
  );
  return json({
    deliveries: result.rows.map((row) => ({ ...mapDelivery(row), user_name: String(row.user_name || ''), notification_title: row.notification_title ? String(row.notification_title) : null })),
    providers: await getProviderStatus(ctx.runtime),
  });
}

export async function listMessagesRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const access = await workspace(ctx);
  const box = ctx.url.searchParams.get('box') || 'inbox';
  const helpRequestId = ctx.url.searchParams.get('helpRequestId') || '';
  const params: unknown[] = [access.organization.id, auth.user.id];
  let condition = '';
  if (helpRequestId) {
    params.push(helpRequestId);
    condition = ` AND m.help_request_id = $${params.length}`;
  } else if (box === 'inbox') {
    condition = ' AND m.recipient_id = $2';
  } else if (box === 'sent') {
    condition = ' AND m.sender_id = $2';
  } else {
    condition = ' AND (m.sender_id = $2 OR m.recipient_id = $2)';
  }
  params.push(200);
  const result = await ctx.runtime.db.query<SqlRow>(
    `SELECT m.*, sender.name AS sender_name, sender.role AS sender_role, recipient.name AS recipient_name
     FROM messages m JOIN users sender ON sender.id = m.sender_id JOIN users recipient ON recipient.id = m.recipient_id
     WHERE m.organization_id = $1${condition}
     ORDER BY m.created_at DESC LIMIT $${params.length}`,
    params,
  );
  return json({ messages: result.rows.map(mapMessage), unreadCount: await unreadMessageCount(ctx.runtime.db, auth.user.id) });
}

export async function createMessageRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const body = await jsonBody(ctx, messageSchema);
  const access = await workspace(ctx);
  if (body.organizationId !== access.organization.id) throw new HttpError(403, 'The selected workspace is not authorized.');
  const recipient = await ctx.runtime.db.query<SqlRow>(
    `SELECT u.id, u.name FROM users u JOIN organization_members m ON m.user_id = u.id
     WHERE u.id = $1 AND m.organization_id = $2 AND u.is_active = TRUE`,
    [body.recipientId, access.organization.id],
  );
  if (!recipient.rows[0]) throw new HttpError(400, 'The selected recipient is not available in this workspace.');
  const messageId = id('message');
  await ctx.runtime.db.query(
    `INSERT INTO messages
      (id, organization_id, sender_id, recipient_id, subject, body, help_request_id, delivered_at, read_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NULL, NOW())`,
    [messageId, access.organization.id, auth.user.id, body.recipientId, body.subject || '', body.body, body.helpRequestId || null],
  );
  await notifyUsers(ctx.runtime, {
    userIds: [body.recipientId],
    organizationId: access.organization.id,
    type: 'message_received',
    title: body.subject || 'New in-app message',
    body: `${auth.user.name}: ${oneLine(body.body, 140)}`,
    link: '/workspace/communication',
    severity: 'info',
    dedupeKey: `message:${messageId}`,
    reason: 'message_received',
  });
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'message.sent',
    entityType: 'message',
    entityId: messageId,
    metadata: { recipientId: body.recipientId },
    request: ctx.request,
  });
  await broadcastWorkspaceRefresh(ctx, access.organization.id, 'message_sent');
  const result = await ctx.runtime.db.query<SqlRow>(
    `SELECT m.*, sender.name AS sender_name, sender.role AS sender_role, recipient.name AS recipient_name
     FROM messages m JOIN users sender ON sender.id = m.sender_id JOIN users recipient ON recipient.id = m.recipient_id
     WHERE m.id = $1`,
    [messageId],
  );
  return json({ message: mapMessage(result.rows[0] as SqlRow), delivery: 'Saved to the in-app inbox. External delivery is reported separately.' }, 201);
}

export async function markMessageReadRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const result = await ctx.runtime.db.query<SqlRow>(
    `UPDATE messages SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND recipient_id = $2 RETURNING *`,
    [ctx.params.id, auth.user.id],
  );
  if (!result.rows[0]) return json({ error: 'Message not found.' }, 404);
  return json({ message: mapMessage(result.rows[0]), unreadCount: await unreadMessageCount(ctx.runtime.db, auth.user.id) });
}

export async function listAnnouncementsRoute(ctx: ApiContext): Promise<Response> {
  const access = await workspace(ctx);
  const result = await ctx.runtime.db.query<SqlRow>(
    `SELECT a.*, u.name AS author_name FROM announcements a JOIN users u ON u.id = a.author_id
     WHERE a.organization_id = $1 ORDER BY a.is_pinned DESC, a.created_at DESC LIMIT 100`,
    [access.organization.id],
  );
  return json({ announcements: result.rows.map(mapAnnouncement) });
}

export async function createAnnouncementRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  assertPermission(auth, 'create_announcements');
  const body = await jsonBody(ctx, announcementSchema);
  const access = await workspace(ctx);
  if (body.organizationId !== access.organization.id) throw new HttpError(403, 'The selected workspace is not authorized.');
  const announcementId = id('announcement');
  await ctx.runtime.db.query(
    `INSERT INTO announcements (id, organization_id, author_id, title, body, audience, is_pinned, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [announcementId, access.organization.id, auth.user.id, body.title, body.body, body.audience, body.isPinned],
  );
  const roles = body.audience === 'secretaries'
    ? ['school_secretary', 'zonal_secretary']
    : body.audience === 'executives'
      ? ['school_president', 'zonal_president', 'vice_president']
      : undefined;
  const recipients = await organizationUsers(ctx.runtime.db, access.organization.id, { roles, excludeUserIds: [auth.user.id] });
  await notifyUsers(ctx.runtime, {
    userIds: recipients,
    organizationId: access.organization.id,
    type: 'announcement',
    title: body.title,
    body: oneLine(body.body, 180),
    link: '/workspace/communication',
    severity: 'info',
    dedupeKey: `announcement:${announcementId}`,
    reason: 'announcement',
  });
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'announcement.created',
    entityType: 'announcement',
    entityId: announcementId,
    request: ctx.request,
  });
  await broadcastWorkspaceRefresh(ctx, access.organization.id, 'announcement_created');
  const result = await ctx.runtime.db.query<SqlRow>(
    'SELECT a.*, u.name AS author_name FROM announcements a JOIN users u ON u.id = a.author_id WHERE a.id = $1',
    [announcementId],
  );
  return json({ announcement: mapAnnouncement(result.rows[0] as SqlRow), recipients: recipients.length, message: 'Announcement published and notifications queued.' }, 201);
}

function maskEmail(value: string): string {
  const [name, domain] = value.split('@');
  if (!domain) return 'Not available';
  return `${name.slice(0, 1)}••••@${domain}`;
}

export async function directoryRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const access = await workspace(ctx);
  const search = ctx.url.searchParams.get('search')?.trim() || '';
  const role = ctx.url.searchParams.get('role') || '';
  const status = ctx.url.searchParams.get('status') || '';
  const params: unknown[] = [access.organization.id];
  const conditions = ['m.organization_id = $1'];
  if (role) {
    params.push(role);
    conditions.push(`u.role = $${params.length}`);
  }
  if (status) conditions.push(status === 'active' ? 'u.is_active = TRUE' : 'u.is_active = FALSE');
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(u.name ILIKE $${params.length} OR u.position ILIKE $${params.length} OR u.committee ILIKE $${params.length} OR u.organization ILIKE $${params.length})`);
  }
  params.push(300);
  const result = await ctx.runtime.db.query<SqlRow>(
    `SELECT u.*, m.membership_role, m.is_primary_secretary FROM users u
     JOIN organization_members m ON m.user_id = u.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY u.name ASC LIMIT $${params.length}`,
    params,
  );
  const entries: DirectoryEntry[] = result.rows.map((row) => {
    const rowUserId = String(row.id);
    const allowed = canViewPhone(auth, rowUserId);
    const phone = String(row.phone || '');
    const email = String(row.email || '');
    const whatsapp = String(row.whatsapp_number || phone);
    return {
      id: rowUserId,
      auth_user_id: row.auth_user_id ? String(row.auth_user_id) : null,
      name: String(row.name),
      email: allowed ? email : maskEmail(email),
      role: String(row.role) as DirectoryEntry['role'],
      position: String(row.position || ''),
      organization: String(row.organization || ''),
      phone: allowed ? phone : maskPhone(phone),
      whatsapp_number: allowed ? whatsapp : maskPhone(whatsapp),
      committee: row.committee ? String(row.committee) : null,
      responsibilities: row.responsibilities ? String(row.responsibilities) : null,
      avatar_color: String(row.avatar_color || '#0b1f3a'),
      is_active: Boolean(row.is_active),
      last_login_at: row.last_login_at ? String(row.last_login_at) : null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      membership_role: String(row.membership_role) as DirectoryEntry['membership_role'],
      is_primary_secretary: Boolean(row.is_primary_secretary),
    };
  });
  return json({ people: entries, contactAccess: hasPermission(auth, 'view_contact_details') || isAdmin(auth) });
}

export async function globalSearchRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const access = await workspace(ctx);
  const query = (ctx.url.searchParams.get('q') || '').trim();
  if (query.length < 2) return json({ results: [] });
  const like = `%${query}%`;
  const orgId = access.organization.id;
  const db = ctx.runtime.db;
  const results: SearchResult[] = [];

  const helpPrivileged = isAdmin(auth) || hasPermission(auth, 'manage_help');
  const helpCondition = helpPrivileged
    ? 'organization_id = $1'
    : 'organization_id = $1 AND (requester_id = $2 OR assigned_to = $2)';
  const helpLikeParam = helpPrivileged ? '$2' : '$3';
  const help = await db.query<SqlRow>(
    `SELECT id, reference, subject, status FROM help_requests WHERE ${helpCondition}
     AND (reference ILIKE ${helpLikeParam} OR subject ILIKE ${helpLikeParam} OR description ILIKE ${helpLikeParam}) ORDER BY submitted_at DESC LIMIT 10`,
    helpPrivileged ? [orgId, like] : [orgId, auth.user.id, like],
  );
  for (const row of help.rows) results.push({ id: String(row.id), type: 'help', title: String(row.subject), subtitle: `${String(row.reference)} • ${String(row.status)}`, link: `/workspace/help/${String(row.id)}`, badge: 'HELP' });

  const meetings = await db.query<SqlRow>(
    `SELECT id, title, status, starts_at FROM meetings WHERE organization_id = $1
     AND (title ILIKE $2 OR agenda ILIKE $2 OR minutes ILIKE $2) ORDER BY starts_at DESC LIMIT 10`,
    [orgId, like],
  );
  for (const row of meetings.rows) results.push({ id: String(row.id), type: 'meeting', title: String(row.title), subtitle: `${String(row.status)} • ${String(row.starts_at).slice(0, 10)}`, link: `/workspace/meetings/${String(row.id)}`, badge: 'Meeting' });

  const documentPrivileged = isAdmin(auth) || hasPermission(auth, 'manage_documents') || hasPermission(auth, 'review_documents');
  const documentCondition = documentPrivileged
    ? 'organization_id = $1'
    : "organization_id = $1 AND (created_by = $2 OR status IN ('approved','sent','answered','archived'))";
  const documentLikeParam = documentPrivileged ? '$2' : '$3';
  const documents = await db.query<SqlRow>(
    `SELECT id, title, reference, status FROM documents WHERE ${documentCondition}
     AND (title ILIKE ${documentLikeParam} OR reference ILIKE ${documentLikeParam} OR subject ILIKE ${documentLikeParam} OR content ILIKE ${documentLikeParam}) ORDER BY updated_at DESC LIMIT 10`,
    documentPrivileged ? [orgId, like] : [orgId, auth.user.id, like],
  );
  for (const row of documents.rows) results.push({ id: String(row.id), type: 'document', title: String(row.title), subtitle: `${String(row.reference)} • ${String(row.status)}`, link: `/workspace/documents/${String(row.id)}`, badge: 'Document' });

  const taskPrivileged = isAdmin(auth) || hasPermission(auth, 'manage_tasks');
  const taskCondition = taskPrivileged
    ? 'organization_id = $1'
    : 'organization_id = $1 AND (assigned_to = $2 OR assigned_by = $2)';
  const taskLikeParam = taskPrivileged ? '$2' : '$3';
  const tasks = await db.query<SqlRow>(
    `SELECT id, title, status, due_date FROM tasks WHERE ${taskCondition}
     AND (title ILIKE ${taskLikeParam} OR description ILIKE ${taskLikeParam}) ORDER BY due_date DESC LIMIT 10`,
    taskPrivileged ? [orgId, like] : [orgId, auth.user.id, like],
  );
  for (const row of tasks.rows) results.push({ id: String(row.id), type: 'task', title: String(row.title), subtitle: `${String(row.status)} • due ${String(row.due_date).slice(0, 10)}`, link: '/workspace/tasks', badge: 'Task' });

  if (isAdmin(auth) || hasPermission(auth, 'manage_correspondence') || hasPermission(auth, 'review_documents')) {
    const correspondence = await db.query<SqlRow>(
      `SELECT id, reference, subject, status FROM correspondence WHERE organization_id = $1
       AND (reference ILIKE $2 OR subject ILIKE $2 OR sender ILIKE $2 OR recipient ILIKE $2) ORDER BY received_at DESC LIMIT 10`,
      [orgId, like],
    );
    for (const row of correspondence.rows) results.push({ id: String(row.id), type: 'correspondence', title: String(row.subject), subtitle: `${String(row.reference)} • ${String(row.status)}`, link: '/workspace/correspondence', badge: 'Correspondence' });
  }

  if (hasPermission(auth, 'view_reports')) {
    const reports = await db.query<SqlRow>(
      `SELECT id, title, report_type, status FROM reports WHERE organization_id = $1 AND title ILIKE $2 ORDER BY created_at DESC LIMIT 10`,
      [orgId, like],
    );
    for (const row of reports.rows) results.push({ id: String(row.id), type: 'report', title: String(row.title), subtitle: `${String(row.report_type).replaceAll('_', ' ')} • ${String(row.status)}`, link: `/workspace/reports/${String(row.id)}`, badge: 'Report' });
  }

  const people = await db.query<SqlRow>(
    `SELECT u.id, u.name, u.position FROM users u JOIN organization_members m ON m.user_id = u.id
     WHERE m.organization_id = $1 AND (u.name ILIKE $2 OR u.position ILIKE $2) ORDER BY u.name LIMIT 10`,
    [orgId, like],
  );
  for (const row of people.rows) results.push({ id: String(row.id), type: 'user', title: String(row.name), subtitle: String(row.position || ''), link: '/workspace/directory', badge: 'Person' });

  return json({ results: results.slice(0, 40) });
}

export async function realtimeStreamRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  return ctx.runtime.hub.stream(auth.user.id, ctx.request);
}

export async function providerStatusRoute(ctx: ApiContext): Promise<Response> {
  user(ctx);
  return json({ providers: await getProviderStatus(ctx.runtime) });
}

export async function runMaintenanceRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  assertPermission(auth, 'run_maintenance');
  const summary = await runMaintenance(ctx.runtime, `user:${auth.user.id}`);
  await broadcastWorkspaceRefresh(ctx, (await workspace(ctx, { requireRecords: false })).organization.id, 'maintenance_completed');
  return json({ summary, message: 'Reminders, overdue checks, escalations and delivery retries completed.' });
}

export async function cronRoute(ctx: ApiContext): Promise<Response> {
  const configuredSecret = ctx.runtime.config.cronSecret;
  const authHeader = ctx.request.headers.get('authorization') || '';
  const querySecret = ctx.url.searchParams.get('secret') || '';
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : querySecret;
  if (!configuredSecret) {
    if (ctx.runtime.config.nodeEnv === 'production') return json({ error: 'Scheduled maintenance is not configured.' }, 503);
  } else if (provided !== configuredSecret) {
    return json({ error: 'Unauthorized scheduled task.' }, 401);
  }
  const summary = await runMaintenance(ctx.runtime, 'cron');
  return json({ ok: true, summary });
}

export async function healthRoute(ctx: ApiContext): Promise<Response> {
  const started = Date.now();
  await ctx.runtime.db.query('SELECT 1 AS ok');
  return json({
    ok: true,
    database: ctx.runtime.db.mode,
    realtimeConnections: ctx.runtime.hub.connectionCount(),
    latencyMs: Date.now() - started,
    serverTime: new Date().toISOString(),
  });
}

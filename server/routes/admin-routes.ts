import type { AdminUser, AuditLog, DeliveryLog } from '@/lib/shared-types';
import { createRemoteAuthUser, createSecurityLink, revokeAllSessions } from '../auth';
import { logAudit } from '../audit';
import type { ApiContext } from '../context';
import { jsonBody, user, workspace } from '../context';
import { parseJson, placeholders, type SqlRow } from '../db';
import { getProviderStatus } from '../notifications';
import { assertPermission } from '../permissions';
import { hashPassword, HttpError, id, json, token } from '../utils';
import { adminUserCreateSchema, adminUserUpdateSchema } from '../validation';

function requireAdmin(ctx: ApiContext): void {
  const auth = user(ctx);
  assertPermission(auth, 'manage_users');
  if (auth.user.role !== 'system_admin') throw new HttpError(403, 'Only the System Administrator can manage accounts.');
}

function mapUserRow(row: SqlRow): AdminUser {
  return {
    id: String(row.id),
    auth_user_id: row.auth_user_id ? String(row.auth_user_id) : null,
    name: String(row.name),
    email: String(row.email),
    role: String(row.role) as AdminUser['role'],
    position: String(row.position || ''),
    organization: String(row.organization || ''),
    phone: String(row.phone || ''),
    whatsapp_number: row.whatsapp_number ? String(row.whatsapp_number) : null,
    committee: row.committee ? String(row.committee) : null,
    responsibilities: row.responsibilities ? String(row.responsibilities) : null,
    avatar_color: String(row.avatar_color || '#0b1f3a'),
    is_active: Boolean(row.is_active),
    last_login_at: row.last_login_at ? String(row.last_login_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    organization_ids: [],
    session_count: Number(row.session_count || 0),
  };
}

export async function listAdminUsersRoute(ctx: ApiContext): Promise<Response> {
  requireAdmin(ctx);
  const result = await ctx.runtime.db.query<SqlRow>(
    `SELECT u.*, COUNT(DISTINCT s.id)::int AS session_count
     FROM users u
     LEFT JOIN sessions s ON s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > NOW()
     GROUP BY u.id ORDER BY u.name`,
  );
  const memberships = await ctx.runtime.db.query<SqlRow>('SELECT user_id, organization_id FROM organization_members ORDER BY organization_id');
  const byUser = new Map<string, string[]>();
  for (const row of memberships.rows) {
    const key = String(row.user_id);
    byUser.set(key, [...(byUser.get(key) || []), String(row.organization_id)]);
  }
  return json({ users: result.rows.map((row) => ({ ...mapUserRow(row), organization_ids: byUser.get(String(row.id)) || [] })) });
}

async function assertOrganizationsExist(ctx: ApiContext, organizationIds: string[]): Promise<void> {
  const result = await ctx.runtime.db.query<SqlRow>(
    `SELECT id FROM organizations WHERE id IN (${placeholders(organizationIds)})`,
    organizationIds,
  );
  if (result.rows.length !== organizationIds.length) throw new HttpError(400, 'One or more selected organizations do not exist.');
}

export async function createAdminUserRoute(ctx: ApiContext): Promise<Response> {
  requireAdmin(ctx);
  const auth = user(ctx);
  const body = await jsonBody(ctx, adminUserCreateSchema);
  const organizationIds = Array.from(new Set(body.organizationIds));
  await assertOrganizationsExist(ctx, organizationIds);
  const existing = await ctx.runtime.db.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [body.email]);
  if (existing.rows.length) throw new HttpError(409, 'An account with that email already exists.');
  if (!body.activateByLink && !body.temporaryPassword) throw new HttpError(400, 'Provide a temporary password or choose activation by secure link.');

  const temporaryPassword = body.temporaryPassword || token(18);
  const authUserId = await createRemoteAuthUser(ctx.runtime.config, body.email, temporaryPassword, body.name);
  const userId = id('user');
  await ctx.runtime.db.query(
    `INSERT INTO users
      (id, auth_user_id, name, email, password_hash, role, position, organization, phone, whatsapp_number,
       committee, responsibilities, avatar_color, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())`,
    [
      userId,
      authUserId,
      body.name,
      body.email.toLowerCase(),
      await hashPassword(temporaryPassword),
      body.role,
      body.position,
      body.organization,
      body.phone,
      body.whatsappNumber || body.phone,
      body.committee || '',
      body.responsibilities || '',
      '#0b1f3a',
      !body.activateByLink,
    ],
  );
  await ctx.runtime.db.query(
    `INSERT INTO notification_preferences (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [userId],
  );
  for (const organizationId of organizationIds) {
    await ctx.runtime.db.query(
      `INSERT INTO organization_members
        (organization_id, user_id, membership_role, is_primary_secretary, can_view_consolidated)
       VALUES ($1, $2, 'primary', $3, $4)
       ON CONFLICT (organization_id, user_id) DO UPDATE SET
         is_primary_secretary = EXCLUDED.is_primary_secretary,
         can_view_consolidated = EXCLUDED.can_view_consolidated`,
      [organizationId, userId, body.isPrimarySecretary, body.canViewConsolidated],
    );
  }

  let activation: Awaited<ReturnType<typeof createSecurityLink>> | null = null;
  if (body.activateByLink) {
    activation = await createSecurityLink(ctx.runtime.db, ctx.request, body.email, 'account_activation', ctx.runtime.config);
  }
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    action: 'admin.user_created',
    entityType: 'user',
    entityId: userId,
    metadata: { email: body.email, role: body.role, organizationIds, activationByLink: body.activateByLink },
    request: ctx.request,
  });
  return json({
    user: { id: userId, name: body.name, email: body.email, role: body.role, is_active: !body.activateByLink, organization_ids: organizationIds },
    activationUrl: activation?.resetUrl || null,
    emailStatus: activation?.emailStatus || 'not_requested',
    temporaryPassword: body.activateByLink ? null : temporaryPassword,
    message: body.activateByLink
      ? activation?.resetUrl
        ? 'Account created. Share the single-use activation link shown below.'
        : activation?.emailStatus === 'sent'
          ? 'Account created and activation email sent.'
          : 'Account created. Email delivery is not configured; use Admin tools to resend the activation link.'
      : 'Account created with the supplied temporary password.',
  }, 201);
}

export async function updateAdminUserRoute(ctx: ApiContext): Promise<Response> {
  requireAdmin(ctx);
  const auth = user(ctx);
  const body = await jsonBody(ctx, adminUserUpdateSchema);
  const existing = await ctx.runtime.db.query<SqlRow>('SELECT * FROM users WHERE id = $1', [ctx.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Account not found.');
  const row = existing.rows[0];
  const updates: string[] = [];
  const params: unknown[] = [ctx.params.id];
  const fields: Record<string, [unknown, string]> = {
    name: [body.name, 'name'],
    role: [body.role, 'role'],
    position: [body.position, 'position'],
    organization: [body.organization, 'organization'],
    phone: [body.phone, 'phone'],
    whatsappNumber: [body.whatsappNumber, 'whatsapp_number'],
    committee: [body.committee, 'committee'],
    responsibilities: [body.responsibilities, 'responsibilities'],
    isActive: [body.isActive, 'is_active'],
  };
  for (const [key, [value, column]] of Object.entries(fields)) {
    if (value !== undefined) {
      params.push(value);
      updates.push(`${column} = $${params.length}`);
    }
  }
  if (updates.length > 0) await ctx.runtime.db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $1`, params);
  if (body.isActive === false) await revokeAllSessions(ctx.runtime.db, ctx.params.id);
  if (body.organizationIds) {
    const organizationIds = Array.from(new Set(body.organizationIds));
    await assertOrganizationsExist(ctx, organizationIds);
    await ctx.runtime.db.query('DELETE FROM organization_members WHERE user_id = $1', [ctx.params.id]);
    for (const organizationId of organizationIds) {
      await ctx.runtime.db.query(
        `INSERT INTO organization_members (organization_id, user_id, membership_role, is_primary_secretary, can_view_consolidated)
         VALUES ($1, $2, 'primary', $3, $4) ON CONFLICT DO NOTHING`,
        [organizationId, ctx.params.id, String(row.role).includes('secretary'), String(row.role).includes('zonal')],
      );
    }
  }
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    action: 'admin.user_updated',
    entityType: 'user',
    entityId: ctx.params.id,
    metadata: body as unknown as Record<string, unknown>,
    request: ctx.request,
  });
  const result = await ctx.runtime.db.query<SqlRow>('SELECT * FROM users WHERE id = $1', [ctx.params.id]);
  return json({ user: mapUserRow(result.rows[0] as SqlRow), message: 'Account updated.' });
}

export async function resetUserPasswordRoute(ctx: ApiContext): Promise<Response> {
  requireAdmin(ctx);
  const auth = user(ctx);
  const result = await ctx.runtime.db.query<SqlRow>('SELECT id, email FROM users WHERE id = $1', [ctx.params.id]);
  if (!result.rows[0]) throw new HttpError(404, 'Account not found.');
  const link = await createSecurityLink(ctx.runtime.db, ctx.request, String(result.rows[0].email), 'password_reset', ctx.runtime.config);
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    action: 'admin.password_reset_link_created',
    entityType: 'user',
    entityId: ctx.params.id,
    metadata: { emailStatus: link.emailStatus },
    request: ctx.request,
  });
  return json({ ...link, message: link.resetUrl ? 'Secure reset link prepared.' : link.emailStatus === 'sent' ? 'Reset email sent.' : 'Email delivery is not configured; use the delivery log to verify.' });
}

export async function sendActivationLinkRoute(ctx: ApiContext): Promise<Response> {
  requireAdmin(ctx);
  const auth = user(ctx);
  const result = await ctx.runtime.db.query<SqlRow>('SELECT id, email FROM users WHERE id = $1', [ctx.params.id]);
  if (!result.rows[0]) throw new HttpError(404, 'Account not found.');
  const link = await createSecurityLink(ctx.runtime.db, ctx.request, String(result.rows[0].email), 'account_activation', ctx.runtime.config);
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    action: 'admin.activation_link_created',
    entityType: 'user',
    entityId: ctx.params.id,
    metadata: { emailStatus: link.emailStatus },
    request: ctx.request,
  });
  return json({ ...link, message: link.resetUrl ? 'Secure activation link prepared.' : link.emailStatus === 'sent' ? 'Activation email sent.' : 'Email delivery is not configured; use the delivery log to verify.' });
}

export async function adminAuditLogsRoute(ctx: ApiContext): Promise<Response> {
  requireAdmin(ctx);
  const search = ctx.url.searchParams.get('search')?.trim() || '';
  const action = ctx.url.searchParams.get('action') || '';
  const params: unknown[] = [];
  const conditions: string[] = [];
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(a.action ILIKE $${params.length} OR a.entity_type ILIKE $${params.length} OR u.name ILIKE $${params.length})`);
  }
  if (action) {
    params.push(action);
    conditions.push(`a.action = $${params.length}`);
  }
  params.push(500);
  const result = await ctx.runtime.db.query<SqlRow>(
    `SELECT a.*, u.name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY a.created_at DESC LIMIT $${params.length}`,
    params,
  );
  return json({
    logs: result.rows.map((row): AuditLog & { actor_name?: string } => ({
      id: String(row.id),
      actor_id: row.actor_id ? String(row.actor_id) : null,
      organization_id: row.organization_id ? String(row.organization_id) : null,
      action: String(row.action),
      entity_type: String(row.entity_type),
      entity_id: row.entity_id ? String(row.entity_id) : null,
      metadata: parseJson(row.metadata, {} as Record<string, unknown>),
      ip_address: String(row.ip_address || ''),
      user_agent: String(row.user_agent || ''),
      created_at: String(row.created_at),
      actor_name: row.actor_name ? String(row.actor_name) : undefined,
    })),
  });
}

export async function adminDeliveryLogsRoute(ctx: ApiContext): Promise<Response> {
  requireAdmin(ctx);
  const status = ctx.url.searchParams.get('status') || '';
  const channel = ctx.url.searchParams.get('channel') || '';
  const params: unknown[] = [];
  const conditions: string[] = [];
  if (status) {
    params.push(status);
    conditions.push(`d.status = $${params.length}`);
  }
  if (channel) {
    params.push(channel);
    conditions.push(`d.channel = $${params.length}`);
  }
  params.push(500);
  const result = await ctx.runtime.db.query<SqlRow>(
    `SELECT d.*, u.name AS user_name, n.title AS notification_title
     FROM notification_deliveries d JOIN users u ON u.id = d.user_id
     LEFT JOIN notifications n ON n.id = d.notification_id
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY d.created_at DESC LIMIT $${params.length}`,
    params,
  );
  return json({
    deliveries: result.rows.map((row): DeliveryLog & { user_name?: string; notification_title?: string | null } => ({
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
      user_name: String(row.user_name || ''),
      notification_title: row.notification_title ? String(row.notification_title) : null,
    })),
    providers: await getProviderStatus(ctx.runtime),
  });
}

export async function adminProviderStatusRoute(ctx: ApiContext): Promise<Response> {
  requireAdmin(ctx);
  return json({ providers: await getProviderStatus(ctx.runtime), organization: (await workspace(ctx, { requireRecords: false })).organization });
}

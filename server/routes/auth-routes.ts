import { z } from 'zod';
import type { AuditLog, NotificationPreferences, UserSession } from '@/lib/shared-types';
import {
  authenticate,
  buildAuthUser,
  changeOwnPassword,
  createSecurityLink,
  login,
  logout,
  revokeAllSessions,
  resetPasswordWithToken,
} from '../auth';
import { logAudit } from '../audit';
import type { ApiContext } from '../context';
import { jsonBody, user, workspace } from '../context';
import { parseJson, type SqlRow } from '../db';
import { assertPermission } from '../permissions';
import { getProviderStatus } from '../notifications';
import { json, clearSessionCookie, id } from '../utils';
import {
  forgotPasswordSchema,
  loginSchema,
  orgSettingsSchema,
  passwordChangeSchema,
  preferencesSchema,
  profileUpdateSchema,
  pushSubscriptionSchema,
  resetPasswordSchema,
} from '../validation';

function mapSession(row: SqlRow, currentSessionId: string): UserSession {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    device: String(row.device || 'Unknown device'),
    ip_address: String(row.ip_address || ''),
    created_at: String(row.created_at),
    last_seen_at: String(row.last_seen_at),
    expires_at: String(row.expires_at),
    is_current: String(row.id) === currentSessionId,
  };
}

function mapAudit(row: SqlRow): AuditLog {
  return {
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
  };
}

function mapPreferences(row: SqlRow | undefined): NotificationPreferences {
  return {
    in_app: row ? row.in_app !== false : true,
    email: row ? row.email !== false : true,
    sms: Boolean(row?.sms),
    whatsapp: Boolean(row?.whatsapp),
    push: row ? row.push !== false : true,
    meeting_reminders: row ? row.meeting_reminders !== false : true,
    task_reminders: row ? row.task_reminders !== false : true,
    help_alerts: row ? row.help_alerts !== false : true,
  };
}

export async function loginRoute(ctx: ApiContext): Promise<Response> {
  const body = await jsonBody(ctx, loginSchema);
  const result = await login(ctx.runtime.db, ctx.request, body.email, body.password, ctx.runtime.config);
  return json(
    {
      user: result.user,
      csrfToken: result.csrfToken,
      ...(result.sessionToken ? { sessionToken: result.sessionToken } : {}),
    },
    200,
    { 'Set-Cookie': result.cookie },
  );
}

export async function logoutRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const cookie = await logout(ctx.runtime.db, ctx.request, auth, ctx.runtime.config);
  return json({ ok: true }, 200, { 'Set-Cookie': cookie });
}

export async function logoutAllRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  await revokeAllSessions(ctx.runtime.db, auth.user.id);
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    action: 'auth.logout_all',
    entityType: 'user',
    entityId: auth.user.id,
    request: ctx.request,
  });
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(ctx.runtime.config.sessionCookie) });
}

export async function meRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const fresh = await authenticate(ctx.runtime.db, ctx.request, ctx.runtime.config);
  return json({
    user: fresh?.user || auth.user,
    serverTime: new Date().toISOString(),
    providerStatus: await getProviderStatus(ctx.runtime),
    config: {
      showResetLinks: ctx.runtime.config.showResetLinks,
      maxUploadBytes: ctx.runtime.config.maxUploadBytes,
      supabaseAuthEnabled: ctx.runtime.config.supabase.authEnabled,
      realtimeMode: fresh?.user.realtime.mode || auth.user.realtime.mode,
    },
  });
}

export async function forgotPasswordRoute(ctx: ApiContext): Promise<Response> {
  const body = await jsonBody(ctx, forgotPasswordSchema);
  const result = await createSecurityLink(ctx.runtime.db, ctx.request, body.email, 'password_reset', ctx.runtime.config);
  return json(result);
}

export async function resetPasswordRoute(ctx: ApiContext): Promise<Response> {
  const body = await jsonBody(ctx, resetPasswordSchema);
  await resetPasswordWithToken(ctx.runtime.db, ctx.request, body.token, body.password, ctx.runtime.config);
  return json({ ok: true, message: 'Your password has been updated. Please sign in.' });
}

export async function updateProfileRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const body = await jsonBody(ctx, profileUpdateSchema);
  await ctx.runtime.db.query(
    `UPDATE users SET name = $2, phone = $3, whatsapp_number = $4, committee = $5, responsibilities = $6
     WHERE id = $1`,
    [auth.user.id, body.name, body.phone, body.whatsapp_number || null, body.committee || '', body.responsibilities || ''],
  );
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    action: 'profile.updated',
    entityType: 'user',
    entityId: auth.user.id,
    request: ctx.request,
  });
  const updated = await buildAuthUser(ctx.runtime.db, auth.user.id, ctx.runtime.config, auth.csrfToken);
  return json({ user: updated });
}

export async function changePasswordRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const body = await jsonBody(ctx, passwordChangeSchema);
  await changeOwnPassword(ctx.runtime.db, ctx.request, auth, body.currentPassword, body.newPassword, ctx.runtime.config);
  return json({ ok: true, message: 'Password updated. Other devices have been signed out.' });
}

export async function sessionsRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const result = await ctx.runtime.db.query<SqlRow>(
    `SELECT id, user_id, device, ip_address, created_at, last_seen_at, expires_at
     FROM sessions
     WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
     ORDER BY last_seen_at DESC`,
    [auth.user.id],
  );
  return json({ sessions: result.rows.map((row) => mapSession(row, auth.sessionId)) });
}

export async function revokeSessionRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const sessionId = ctx.params.id;
  const result = await ctx.runtime.db.query(
    'UPDATE sessions SET revoked_at = NOW() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL',
    [sessionId, auth.user.id],
  );
  if (result.rowCount === 0) return json({ error: 'Session not found.' }, 404);
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    action: 'session.revoked',
    entityType: 'session',
    entityId: sessionId,
    request: ctx.request,
  });
  return json({ ok: true, currentSessionRevoked: sessionId === auth.sessionId });
}

export async function activityRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const result = await ctx.runtime.db.query<SqlRow>(
    `SELECT a.*, u.name AS actor_name
     FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.actor_id = $1
     ORDER BY a.created_at DESC LIMIT 100`,
    [auth.user.id],
  );
  return json({ activity: result.rows.map(mapAudit) });
}

export async function getPreferencesRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const result = await ctx.runtime.db.query<SqlRow>('SELECT * FROM notification_preferences WHERE user_id = $1', [auth.user.id]);
  return json({ preferences: mapPreferences(result.rows[0]) });
}

export async function updatePreferencesRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const body = await jsonBody(ctx, preferencesSchema);
  await ctx.runtime.db.query(
    `INSERT INTO notification_preferences
      (user_id, in_app, email, sms, whatsapp, push, meeting_reminders, task_reminders, help_alerts)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id) DO UPDATE SET
       in_app = EXCLUDED.in_app,
       email = EXCLUDED.email,
       sms = EXCLUDED.sms,
       whatsapp = EXCLUDED.whatsapp,
       push = EXCLUDED.push,
       meeting_reminders = EXCLUDED.meeting_reminders,
       task_reminders = EXCLUDED.task_reminders,
       help_alerts = EXCLUDED.help_alerts`,
    [auth.user.id, body.in_app, body.email, body.sms, body.whatsapp, body.push, body.meeting_reminders, body.task_reminders, body.help_alerts],
  );
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    action: 'notification.preferences_updated',
    entityType: 'user',
    entityId: auth.user.id,
    request: ctx.request,
  });
  return json({ preferences: body });
}

export async function pushPublicKeyRoute(ctx: ApiContext): Promise<Response> {
  const key = ctx.runtime.config.providers.vapidPublicKey;
  return json({ publicKey: key || null, configured: Boolean(key) });
}

export async function pushSubscribeRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const body = await jsonBody(ctx, pushSubscriptionSchema);
  await ctx.runtime.db.query(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth_key, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth_key = EXCLUDED.auth_key`,
    [
      id('push'),
      auth.user.id,
      body.endpoint,
      body.keys.p256dh,
      body.keys.auth,
      ctx.request.headers.get('user-agent') || '',
    ],
  );
  return json({ ok: true });
}

export async function pushUnsubscribeRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const schema = z.object({ endpoint: z.string().url().optional() });
  let endpoint: string | undefined;
  try {
    endpoint = (await ctx.request.json() as { endpoint?: string }).endpoint;
  } catch {
    endpoint = undefined;
  }
  const parsed = schema.safeParse({ endpoint });
  if (!parsed.success && endpoint) return json({ error: 'Invalid subscription endpoint.' }, 400);
  if (endpoint) {
    await ctx.runtime.db.query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [auth.user.id, endpoint]);
  } else {
    await ctx.runtime.db.query('DELETE FROM push_subscriptions WHERE user_id = $1', [auth.user.id]);
  }
  return json({ ok: true });
}

export async function organizationsRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  return json({ organizations: auth.user.organizations });
}

export async function organizationSettingsRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const access = await workspace(ctx, { requireRecords: false });
  if (ctx.params.id && ctx.params.id !== access.organization.id) {
    const organization = auth.user.organizations.find((item) => item.id === ctx.params.id);
    if (!organization) return json({ error: 'Organization not found.' }, 404);
    return json({ organization });
  }
  return json({ organization: access.organization });
}

export async function updateOrganizationSettingsRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  assertPermission(auth, 'manage_settings');
  const access = await workspace(ctx);
  const body = await jsonBody(ctx, orgSettingsSchema);
  const result = await ctx.runtime.db.query<SqlRow>(
    `UPDATE organizations SET letterhead_name = $2, address = $3, phone = $4, email = $5, motto = $6, region = $7
     WHERE id = $1 RETURNING *`,
    [access.organization.id, body.letterheadName, body.address, body.phone, body.email, body.motto, body.region],
  );
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'organization.settings_updated',
    entityType: 'organization',
    entityId: access.organization.id,
    request: ctx.request,
  });
  return json({ organization: result.rows[0] });
}

import type { AuthUser, MembershipRole, Organization, Role, User } from '@/lib/shared-types';
import { BRAND } from '../lib/brand';
import { logAudit } from './audit';
import { getConfig, publicRealtimeConfig, type AppConfig } from './config';
import type { Database, SqlRow } from './db';
import type { AuthContext } from './permissions';
import { permissionsForRole } from './permissions';
import { sendEmail, type ProviderResult } from './providers';
import {
  addDays,
  clearSessionCookie,
  hashPassword,
  HttpError,
  id,
  nowIso,
  parseCookies,
  sessionCookie,
  sha256,
  token,
  verifyPassword,
} from './utils';

const SESSION_COOKIE = 'srcpro_session';

interface SessionRow extends SqlRow {
  id: string;
  user_id: string;
  csrf_token: string;
  realtime_token: string;
  expires_at: string;
}

function userFromRow(row: SqlRow): User {
  return {
    id: String(row.id),
    auth_user_id: row.auth_user_id ? String(row.auth_user_id) : null,
    name: String(row.name),
    email: String(row.email),
    role: String(row.role) as Role,
    position: String(row.position ?? ''),
    organization: String(row.organization ?? ''),
    phone: String(row.phone ?? ''),
    whatsapp_number: row.whatsapp_number ? String(row.whatsapp_number) : null,
    committee: row.committee ? String(row.committee) : null,
    responsibilities: row.responsibilities ? String(row.responsibilities) : null,
    avatar_color: String(row.avatar_color ?? '#0b1f3a'),
    is_active: Boolean(row.is_active),
    last_login_at: row.last_login_at ? String(row.last_login_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function organizationFromRow(row: SqlRow): Organization & { membership_role: MembershipRole; can_view_consolidated: boolean; is_primary_secretary: boolean } {
  return {
    id: String(row.id),
    name: String(row.name),
    type: String(row.type) as Organization['type'],
    parent_id: row.parent_id ? String(row.parent_id) : null,
    code: String(row.code),
    letterhead_name: String(row.letterhead_name ?? ''),
    address: String(row.address ?? ''),
    phone: String(row.phone ?? ''),
    email: String(row.email ?? ''),
    motto: String(row.motto ?? ''),
    region: String(row.region ?? ''),
    status: String(row.status) as Organization['status'],
    created_at: String(row.created_at),
    membership_role: String(row.membership_role) as MembershipRole,
    can_view_consolidated: Boolean(row.can_view_consolidated),
    is_primary_secretary: Boolean(row.is_primary_secretary),
  };
}

export async function buildAuthUser(db: Database, userId: string, config: AppConfig, csrfToken: string): Promise<AuthUser> {
  const userResult = await db.query<SqlRow>('SELECT * FROM users WHERE id = $1', [userId]);
  const userRow = userResult.rows[0];
  if (!userRow) throw new HttpError(401, 'Your account is no longer available.');
  const orgResult = await db.query<SqlRow>(
    `SELECT o.*, m.membership_role, m.can_view_consolidated, m.is_primary_secretary
     FROM organizations o
     JOIN organization_members m ON m.organization_id = o.id
     WHERE m.user_id = $1 AND o.status = 'active'
     ORDER BY CASE o.type WHEN 'zonal' THEN 0 WHEN 'school' THEN 1 ELSE 2 END, o.name`,
    [userId],
  );
  const user = userFromRow(userRow);
  const realtime = publicRealtimeConfig(config);
  return {
    ...user,
    organizations: orgResult.rows.map(organizationFromRow),
    permissions: permissionsForRole(user.role),
    csrf_token: csrfToken,
    realtime,
  };
}

export function sessionTokenFromRequest(request: Request): string | null {
  const cookieToken = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE];
  if (cookieToken) return cookieToken;
  const authorization = (request.headers.get('authorization') || '').trim();
  if (authorization.toLowerCase().startsWith('bearer ')) {
    const bearer = authorization.slice(7).trim();
    if (bearer) return bearer;
  }
  const headerToken = (request.headers.get('x-session-token') || '').trim();
  if (headerToken) return headerToken;
  try {
    const queryToken = new URL(request.url).searchParams.get('session_token');
    if (queryToken) return queryToken.trim();
  } catch {
    // Request URLs without an origin cannot carry the fallback.
  }
  return null;
}

export async function authenticate(db: Database, request: Request, config = getConfig()): Promise<AuthContext | null> {
  const rawToken = sessionTokenFromRequest(request);
  if (!rawToken) return null;
  const tokenHash = sha256(rawToken);
  const result = await db.query<SessionRow>(
    `SELECT s.id, s.user_id, s.csrf_token, s.realtime_token, s.expires_at, u.is_active
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
    [tokenHash],
  );
  const session = result.rows[0];
  if (!session || !session.is_active) return null;
  await db.query('UPDATE sessions SET last_seen_at = NOW() WHERE id = $1', [session.id]);
  const user = await buildAuthUser(db, String(session.user_id), config, String(session.csrf_token));
  user.realtime = {
    ...user.realtime,
    channel: user.realtime.mode === 'supabase' ? `${config.supabase.realtimePrefix}:${session.realtime_token}` : undefined,
  };
  return {
    user,
    sessionId: String(session.id),
    csrfToken: String(session.csrf_token),
    realtimeToken: String(session.realtime_token),
    sessionExpiresAt: String(session.expires_at),
  };
}

export function requireAuth(auth: AuthContext | null): AuthContext {
  if (!auth) throw new HttpError(401, 'Please sign in to continue.');
  return auth;
}

export function requireCsrf(auth: AuthContext, request: Request): void {
  const headerToken = request.headers.get('x-csrf-token') || '';
  let queryToken = '';
  try {
    queryToken = new URL(request.url).searchParams.get('csrf_token') || '';
  } catch {
    // Request URLs without an origin cannot carry the fallback.
  }
  if (headerToken !== auth.csrfToken && queryToken !== auth.csrfToken) {
    throw new HttpError(403, 'The security token is missing or invalid. Refresh the page and try again.');
  }
}

interface CreatedSession {
  rawToken: string;
  cookie: string;
  csrfToken: string;
  realtimeToken: string;
  sessionId: string;
  expiresAt: string;
}

async function createSession(db: Database, config: AppConfig, userId: string, request: Request): Promise<CreatedSession> {
  const rawToken = token(32);
  const csrfToken = token(24);
  const realtimeToken = token(24);
  const sessionId = id('session');
  const expiresAt = addDays(new Date(), config.sessionTtlDays).toISOString();
  await db.query(
    `INSERT INTO sessions
      (id, user_id, token_hash, csrf_token, realtime_token, device, ip_address, expires_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, NOW())`,
    [
      sessionId,
      userId,
      sha256(rawToken),
      csrfToken,
      realtimeToken,
      (request.headers.get('user-agent') || '').slice(0, 300),
      (request.headers.get('x-forwarded-for')?.split(',')[0] || '').trim().slice(0, 100),
      expiresAt,
    ],
  );
  await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [userId]);
  return {
    rawToken,
    cookie: sessionCookie(rawToken, config.sessionTtlDays * 24 * 60 * 60, config.sessionCookie),
    csrfToken,
    realtimeToken,
    sessionId,
    expiresAt,
  };
}

interface SupabaseAuthClient {
  auth: {
    signInWithPassword(credentials: { email: string; password: string }): Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
  };
}

async function verifyWithSupabase(config: AppConfig, email: string, password: string): Promise<string | null> {
  if (!config.supabase.authEnabled) return null;
  const module = await import('@supabase/supabase-js');
  const createClient = module.createClient as unknown as (url: string, key: string, options?: Record<string, unknown>) => SupabaseAuthClient;
  const client = createClient(config.supabase.url, config.supabase.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new HttpError(401, 'The email or password is incorrect.');
  return data.user.id;
}

export interface LoginResult {
  user: AuthUser;
  cookie: string;
  csrfToken: string;
  sessionToken: string | null;
}

export async function login(db: Database, request: Request, emailInput: string, password: string, config = getConfig()): Promise<LoginResult> {
  const email = emailInput.trim().toLowerCase();
  const result = await db.query<SqlRow>('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  const row = result.rows[0];
  if (!row || !Boolean(row.is_active)) throw new HttpError(401, 'The email or password is incorrect.');

  const authUserId = await verifyWithSupabase(config, email, password);
  if (config.supabase.authEnabled && authUserId) {
    if (String(row.auth_user_id || '') !== authUserId) {
      await db.query('UPDATE users SET auth_user_id = $1 WHERE id = $2', [authUserId, row.id]);
    }
  } else {
    const valid = await verifyPassword(password, row.password_hash ? String(row.password_hash) : null);
    if (!valid) throw new HttpError(401, 'The email or password is incorrect.');
  }

  const created = await createSession(db, config, String(row.id), request);
  const user = await buildAuthUser(db, String(row.id), config, created.csrfToken);
  user.realtime = {
    ...user.realtime,
    channel: user.realtime.mode === 'supabase' ? `${config.supabase.realtimePrefix}:${created.realtimeToken}` : undefined,
  };

  await logAudit(db, {
    actorId: String(row.id),
    action: 'auth.login',
    entityType: 'session',
    entityId: created.sessionId,
    metadata: { method: config.supabase.authEnabled ? 'supabase-auth' : 'local-password' },
    request,
  });
  return {
    user,
    cookie: created.cookie,
    csrfToken: created.csrfToken,
    sessionToken: config.previewSessionFallback ? created.rawToken : null,
  };
}

export function rawSessionToken(request: Request): string | null {
  return sessionTokenFromRequest(request);
}

export async function logout(db: Database, request: Request, auth: AuthContext, config: AppConfig = getConfig()): Promise<string> {
  const rawToken = rawSessionToken(request);
  if (rawToken) {
    await db.query('UPDATE sessions SET revoked_at = NOW() WHERE token_hash = $1', [sha256(rawToken)]);
  }
  await logAudit(db, {
    actorId: auth.user.id,
    action: 'auth.logout',
    entityType: 'session',
    entityId: auth.sessionId,
    request,
  });
  return clearSessionCookie(config.sessionCookie);
}

export async function revokeAllSessions(db: Database, userId: string, exceptSessionId?: string): Promise<void> {
  if (exceptSessionId) {
    await db.query('UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL', [userId, exceptSessionId]);
  } else {
    await db.query('UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
  }
}

interface SupabaseAdminClient {
  auth: {
    admin: {
      createUser(attributes: Record<string, unknown>): Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
      updateUserById(userId: string, attributes: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
    };
  };
}

async function getSupabaseAdmin(config: AppConfig): Promise<SupabaseAdminClient | null> {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) return null;
  const module = await import('@supabase/supabase-js');
  const createClient = module.createClient as unknown as (url: string, key: string, options?: Record<string, unknown>) => SupabaseAdminClient;
  return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createRemoteAuthUser(
  config: AppConfig,
  email: string,
  password: string,
  name: string,
): Promise<string | null> {
  if (!config.supabase.authEnabled) return null;
  const client = await getSupabaseAdmin(config);
  if (!client) throw new HttpError(500, 'Remote authentication is enabled but the service role key is missing.');
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error || !data.user) throw new HttpError(400, error?.message || 'The remote authentication account could not be created.');
  return data.user.id;
}

export async function updateRemotePassword(config: AppConfig, authUserId: string | null, password: string): Promise<void> {
  if (!config.supabase.authEnabled || !authUserId) return;
  const client = await getSupabaseAdmin(config);
  if (!client) throw new HttpError(500, 'Remote authentication is enabled but the service role key is missing.');
  const { error } = await client.auth.admin.updateUserById(authUserId, { password });
  if (error) throw new HttpError(400, error.message || 'The remote password could not be updated.');
}

function resetLink(config: AppConfig, rawToken: string, purpose: string): string {
  const base = config.appBaseUrl.replace(/\/$/, '');
  return `${base}/reset-password?token=${encodeURIComponent(rawToken)}&purpose=${encodeURIComponent(purpose)}`;
}

async function recordSecurityDelivery(
  db: Database,
  userId: string,
  recipient: string,
  result: ProviderResult,
): Promise<void> {
  const { status, provider, providerMessageId, lastError, attempts } = {
    status: !result.configured ? 'not_configured' : result.ok ? 'sent' : 'failed',
    provider: result.provider,
    providerMessageId: result.providerMessageId ?? null,
    lastError: result.error ?? null,
    attempts: 1,
  };
  await db.query(
    `INSERT INTO notification_deliveries
      (id, notification_id, user_id, channel, provider, status, recipient, attempts,
       provider_message_id, last_error, sent_at, next_retry_at, created_at)
     VALUES ($1, NULL, $2, 'email', $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, NOW())`,
    [
      id('delivery'),
      userId,
      provider,
      status,
      recipient,
      attempts,
      providerMessageId,
      lastError,
      status === 'sent' ? nowIso() : null,
      status === 'failed' ? addDays(new Date(), 0).toISOString() : null,
    ],
  );
}

export interface SecurityLinkResult {
  message: string;
  resetUrl: string | null;
  emailStatus: 'sent' | 'failed' | 'not_configured' | 'no_account';
}

export async function createSecurityLink(
  db: Database,
  request: Request,
  emailInput: string,
  purpose: 'password_reset' | 'account_activation',
  config = getConfig(),
): Promise<SecurityLinkResult> {
  const email = emailInput.trim().toLowerCase();
  const activeCondition = purpose === 'account_activation' ? '' : ' AND is_active = TRUE';
  const result = await db.query<SqlRow>(
    `SELECT id, email, name FROM users WHERE LOWER(email) = LOWER($1)${activeCondition}`,
    [email],
  );
  const user = result.rows[0];
  const genericMessage = 'If the account exists, a secure link has been prepared.';
  if (!user) return { message: genericMessage, resetUrl: null, emailStatus: 'no_account' };

  const rawToken = token(32);
  const expiresAt = addDays(new Date(), purpose === 'account_activation' ? 3 : 1).toISOString();
  await db.query(
    `INSERT INTO password_tokens
      (id, user_id, token_hash, purpose, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5::timestamptz, NULL)`,
    [id('ptoken'), String(user.id), sha256(rawToken), purpose, expiresAt],
  );

  const link = resetLink(config, rawToken, purpose);
  const subject = purpose === 'account_activation' ? `Activate your ${BRAND.name} account` : `Reset your ${BRAND.name} password`;
  const body = `${purpose === 'account_activation' ? 'Activate your account' : 'Reset your password'} using this single-use link:\n\n${link}\n\nThis link expires soon. If you did not request it, contact your system administrator.`;
  const emailResult = await sendEmail(config, String(user.email), subject, body);
  await recordSecurityDelivery(db, String(user.id), String(user.email), emailResult);
  await logAudit(db, {
    actorId: String(user.id),
    action: purpose === 'account_activation' ? 'auth.activation_link_created' : 'auth.password_reset_requested',
    entityType: 'user',
    entityId: String(user.id),
    metadata: { emailStatus: emailResult.ok ? 'sent' : emailResult.configured ? 'failed' : 'not_configured' },
    request,
  });

  return {
    message: genericMessage,
    resetUrl: config.showResetLinks ? link : null,
    emailStatus: emailResult.ok ? 'sent' : emailResult.configured ? 'failed' : 'not_configured',
  };
}

export async function resetPasswordWithToken(
  db: Database,
  request: Request,
  rawToken: string,
  newPassword: string,
  config = getConfig(),
): Promise<void> {
  const result = await db.query<SqlRow>(
    `SELECT t.id, t.user_id, t.purpose, u.auth_user_id
     FROM password_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > NOW()`,
    [sha256(rawToken)],
  );
  const tokenRow = result.rows[0];
  if (!tokenRow) throw new HttpError(400, 'This secure link is invalid or has expired.');
  await updateRemotePassword(config, tokenRow.auth_user_id ? String(tokenRow.auth_user_id) : null, newPassword);
  const passwordHash = await hashPassword(newPassword);
  await db.query('UPDATE users SET password_hash = $1, is_active = TRUE WHERE id = $2', [passwordHash, String(tokenRow.user_id)]);
  await db.query('UPDATE password_tokens SET used_at = NOW() WHERE id = $1', [String(tokenRow.id)]);
  await revokeAllSessions(db, String(tokenRow.user_id));
  await logAudit(db, {
    actorId: String(tokenRow.user_id),
    action: tokenRow.purpose === 'account_activation' ? 'auth.account_activated' : 'auth.password_reset_completed',
    entityType: 'user',
    entityId: String(tokenRow.user_id),
    request,
  });
}

export async function changeOwnPassword(
  db: Database,
  request: Request,
  auth: AuthContext,
  currentPassword: string,
  newPassword: string,
  config = getConfig(),
): Promise<void> {
  const result = await db.query<SqlRow>('SELECT password_hash, auth_user_id FROM users WHERE id = $1', [auth.user.id]);
  const row = result.rows[0];
  if (!row || !(await verifyPassword(currentPassword, row.password_hash ? String(row.password_hash) : null))) {
    throw new HttpError(400, 'The current password is incorrect.');
  }
  await updateRemotePassword(config, row.auth_user_id ? String(row.auth_user_id) : null, newPassword);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(newPassword), auth.user.id]);
  await revokeAllSessions(db, auth.user.id, auth.sessionId);
  await logAudit(db, {
    actorId: auth.user.id,
    action: 'auth.password_changed',
    entityType: 'user',
    entityId: auth.user.id,
    request,
  });
}

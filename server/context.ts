import type { ZodSchema } from 'zod';
import { requireAuth } from './auth';
import type { AuthContext, OrganizationAccess } from './permissions';
import { getOrganizationAccess, requestedOrganizationId } from './permissions';
import { readJson, HttpError, formToObject, parseJsonField } from './utils';
import type { Runtime } from './runtime';
import { placeholders, parseJson, type Database, type SqlRow } from './db';
import { publishRealtime, type RealtimePayload } from './realtime';
import { nowIso } from './utils';

export interface ApiContext {
  request: Request;
  url: URL;
  method: string;
  path: string;
  params: Record<string, string>;
  runtime: Runtime;
  auth: AuthContext | null;
}

export function user(ctx: ApiContext): AuthContext {
  return requireAuth(ctx.auth);
}

export async function workspace(ctx: ApiContext, options: { requireRecords?: boolean } = {}): Promise<OrganizationAccess> {
  return getOrganizationAccess(ctx.runtime.db, user(ctx), requestedOrganizationId(ctx.request), options);
}

export function requestedOrgId(ctx: ApiContext): string | null {
  return requestedOrganizationId(ctx.request);
}

export async function jsonBody<T>(ctx: ApiContext, schema: ZodSchema<T>): Promise<T> {
  return readJson(ctx.request, schema);
}

export async function formBody(ctx: ApiContext): Promise<{ form: FormData; fields: Record<string, string> }> {
  try {
    const form = await ctx.request.formData();
    return { form, fields: formToObject(form) };
  } catch {
    throw new HttpError(400, 'A valid multipart form is required.');
  }
}

export function parseFieldJson<T>(fields: Record<string, string>, key: string, fallback: T): T {
  return parseJsonField(fields[key], fallback);
}

export function parseJsonColumn<T>(value: unknown, fallback: T): T {
  return parseJson(value, fallback);
}

export async function organizationUsers(
  db: Database,
  organizationId: string,
  options: { roles?: string[]; primarySecretariesOnly?: boolean; excludeUserIds?: string[] } = {},
): Promise<string[]> {
  const params: unknown[] = [organizationId];
  const conditions = ['m.organization_id = $1', 'u.is_active = TRUE'];
  if (options.roles?.length) {
    params.push(...options.roles);
    conditions.push(`u.role IN (${placeholders(options.roles, params.length - options.roles.length + 1)})`);
  }
  if (options.primarySecretariesOnly) conditions.push('m.is_primary_secretary = TRUE');
  if (options.excludeUserIds?.length) {
    params.push(...options.excludeUserIds);
    conditions.push(`u.id NOT IN (${placeholders(options.excludeUserIds, params.length - options.excludeUserIds.length + 1)})`);
  }
  const result = await db.query<{ id: string }>(
    `SELECT DISTINCT u.id FROM users u
     JOIN organization_members m ON m.user_id = u.id
     WHERE ${conditions.join(' AND ')}`,
    params,
  );
  return result.rows.map((row) => String(row.id));
}

export async function designatedSecretary(db: Database, organizationId: string): Promise<string | null> {
  const result = await db.query<{ id: string }>(
    `SELECT u.id
     FROM users u
     JOIN organization_members m ON m.user_id = u.id
     WHERE u.is_active = TRUE
       AND (
         (m.organization_id = $1 AND m.is_primary_secretary = TRUE)
         OR (
           m.organization_id = (SELECT parent_id FROM organizations WHERE id = $1)
           AND m.is_primary_secretary = TRUE
         )
       )
     ORDER BY CASE WHEN m.organization_id = $1 THEN 0 ELSE 1 END, u.role, u.name
     LIMIT 1`,
    [organizationId],
  );
  return result.rows[0]?.id ? String(result.rows[0].id) : null;
}

export async function assertEntityInWorkspace(
  db: Database,
  organizationId: string,
  table: 'help_requests' | 'meetings' | 'tasks' | 'documents' | 'correspondence' | 'calendar_events' | 'reports' | 'briefing_packs' | 'resolutions' | 'templates' | 'document_submissions',
  entityId: string,
): Promise<SqlRow> {
  const result = await db.query<SqlRow>(`SELECT * FROM ${table} WHERE id = $1`, [entityId]);
  const row = result.rows[0];
  if (!row || String(row.organization_id || '') !== organizationId) {
    throw new HttpError(404, 'The requested record was not found in this workspace.');
  }
  return row;
}

export async function broadcastWorkspaceRefresh(ctx: ApiContext, organizationId: string, reason: string): Promise<void> {
  const recipients = await organizationUsers(ctx.runtime.db, organizationId);
  const payload: RealtimePayload = { type: 'refresh', reason, at: nowIso() };
  await publishRealtime(ctx.runtime.db, ctx.runtime.hub, ctx.runtime.config, recipients, payload);
}

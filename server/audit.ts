import type { Database } from './db';
import { getIpAddress, getUserAgent, id } from './utils';

interface AuditInput {
  actorId: string | null;
  organizationId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  request?: Request;
}

export async function logAudit(db: Database, input: AuditInput): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_logs
        (id, actor_id, organization_id, action, entity_type, entity_id, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
      [
        id('audit'),
        input.actorId,
        input.organizationId ?? null,
        input.action,
        input.entityType,
        input.entityId ?? null,
        JSON.stringify(input.metadata ?? {}),
        input.request ? getIpAddress(input.request) : '',
        input.request ? getUserAgent(input.request) : '',
      ],
    );
  } catch (error) {
    console.error('[audit] failed to write log', error);
  }
}

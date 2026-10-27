import type { Attachment } from '@/lib/shared-types';
import type { Database, SqlRow } from './db';
import type { Runtime } from './runtime';
import { HttpError, id, safeFileName } from './utils';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const ENTITY_TABLES: Record<string, string> = {
  help_request: 'help_requests',
  document: 'documents',
  task: 'tasks',
  correspondence: 'correspondence',
  meeting: 'meetings',
  document_submission: 'document_submissions',
};

interface SupabaseStorageClient {
  storage: {
    from(bucket: string): {
      upload(path: string, data: Uint8Array, options: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
      download(path: string): Promise<{ data: Blob | null; error: { message: string } | null }>;
    };
  };
}

let storageClientPromise: Promise<SupabaseStorageClient> | null = null;

async function getStorageClient(runtime: Runtime): Promise<SupabaseStorageClient | null> {
  const { url, serviceRoleKey } = runtime.config.supabase;
  if (!url || !serviceRoleKey) return null;
  if (!storageClientPromise) {
    storageClientPromise = (async () => {
      const module = await import('@supabase/supabase-js');
      const createClient = module.createClient as unknown as (url: string, key: string, options?: Record<string, unknown>) => SupabaseStorageClient;
      return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    })();
  }
  return storageClientPromise;
}

export function attachmentFromRow(row: SqlRow): Attachment {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    entity_type: String(row.entity_type) as Attachment['entity_type'],
    entity_id: String(row.entity_id),
    file_name: String(row.file_name),
    mime_type: String(row.mime_type),
    size_bytes: Number(row.size_bytes),
    uploaded_by: String(row.uploaded_by),
    storage_provider: String(row.storage_provider) as Attachment['storage_provider'],
    created_at: String(row.created_at),
  };
}

export async function entityOrganizationId(
  db: Database,
  entityType: string,
  entityId: string,
): Promise<string | null> {
  const table = ENTITY_TABLES[entityType];
  if (!table) return null;
  const result = await db.query<{ organization_id: string }>(`SELECT organization_id FROM ${table} WHERE id = $1`, [entityId]);
  return result.rows[0] ? String(result.rows[0].organization_id) : null;
}

export async function listAttachments(
  db: Database,
  organizationId: string,
  entityType: string,
  entityId: string,
): Promise<Attachment[]> {
  const result = await db.query<SqlRow>(
    `SELECT * FROM attachments
     WHERE organization_id = $1 AND entity_type = $2 AND entity_id = $3
     ORDER BY created_at DESC`,
    [organizationId, entityType, entityId],
  );
  return result.rows.map(attachmentFromRow);
}

function mimeFromFileName(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'txt') return 'text/plain';
  if (extension === 'doc') return 'application/msword';
  if (extension === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return '';
}

export interface SaveAttachmentInput {
  organizationId: string;
  entityType: Attachment['entity_type'];
  entityId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  uploadedBy: string;
}

export async function saveAttachment(runtime: Runtime, input: SaveAttachmentInput): Promise<Attachment> {
  const { db } = runtime;
  if (!input.bytes.length) throw new HttpError(400, 'The selected file is empty.');
  if (input.bytes.length > runtime.config.maxUploadBytes) {
    throw new HttpError(413, `The file is larger than the ${Math.round(runtime.config.maxUploadBytes / 1024 / 1024)} MB limit.`);
  }
  const mimeType = input.mimeType || mimeFromFileName(input.fileName);
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new HttpError(415, 'Only PDF, image, text and Word document attachments are allowed.');
  }
  const organizationId = await entityOrganizationId(db, input.entityType, input.entityId);
  if (!organizationId || organizationId !== input.organizationId) {
    throw new HttpError(404, 'The related record was not found in this workspace.');
  }

  const attachmentId = id('attachment');
  const fileName = safeFileName(input.fileName);
  const supabase = await getStorageClient(runtime);
  let storageProvider: Attachment['storage_provider'] = 'database';
  let storagePath: string | null = null;
  let contentBase64: string | null = Buffer.from(input.bytes).toString('base64');

  if (supabase) {
    storagePath = `${input.organizationId}/${input.entityType}/${input.entityId}/${attachmentId}-${fileName}`;
    const { error } = await supabase.storage.from(runtime.config.supabase.storageBucket).upload(storagePath, input.bytes, {
      contentType: mimeType,
      upsert: false,
    });
    if (error) throw new HttpError(502, `The private storage upload failed: ${error.message}`);
    storageProvider = 'supabase';
    contentBase64 = null;
  }

  const result = await db.query<SqlRow>(
    `INSERT INTO attachments
      (id, organization_id, entity_type, entity_id, file_name, mime_type, size_bytes,
       uploaded_by, storage_provider, storage_path, content_base64, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
     RETURNING *`,
    [
      attachmentId,
      input.organizationId,
      input.entityType,
      input.entityId,
      fileName,
      mimeType,
      input.bytes.length,
      input.uploadedBy,
      storageProvider,
      storagePath,
      contentBase64,
    ],
  );
  return attachmentFromRow(result.rows[0] as SqlRow);
}

export async function getAttachmentBytes(runtime: Runtime, row: SqlRow): Promise<Uint8Array> {
  if (row.storage_provider === 'database') {
    return new Uint8Array(Buffer.from(String(row.content_base64 || ''), 'base64'));
  }
  const supabase = await getStorageClient(runtime);
  if (!supabase || !row.storage_path) throw new HttpError(500, 'Private storage is not available for this attachment.');
  const { data, error } = await supabase.storage.from(runtime.config.supabase.storageBucket).download(String(row.storage_path));
  if (error || !data) throw new HttpError(502, error?.message || 'The attachment could not be retrieved.');
  return new Uint8Array(await data.arrayBuffer());
}

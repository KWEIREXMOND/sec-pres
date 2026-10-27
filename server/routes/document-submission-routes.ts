import type { DocumentSubmission, DocumentSubmissionPerson, DocumentSubmissionStatus, Role } from '@/lib/shared-types';
import { logAudit } from '../audit';
import {
  assertEntityInWorkspace,
  broadcastWorkspaceRefresh,
  formBody,
  jsonBody,
  user,
  workspace,
} from '../context';
import type { SqlRow } from '../db';
import { notifyUsers } from '../notifications';
import { isAdmin } from '../permissions';
import { getAttachmentBytes, saveAttachment } from '../storage';
import { HttpError, id, json, makeReference, safeFileName } from '../utils';
import {
  documentSubmissionSubmitSchema,
  documentSubmissionUpdateSchema,
} from '../validation';

function mapSubmission(row: SqlRow): DocumentSubmission {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    reference: String(row.reference),
    title: String(row.title),
    description: String(row.description || ''),
    delivery_mode: String(row.delivery_mode) as DocumentSubmission['delivery_mode'],
    status: String(row.status) as DocumentSubmissionStatus,
    sender_id: String(row.sender_id),
    recipient_id: row.recipient_id ? String(row.recipient_id) : null,
    attachment_id: row.attachment_id ? String(row.attachment_id) : null,
    file_name: String(row.file_name || 'document'),
    mime_type: String(row.mime_type || 'application/octet-stream'),
    size_bytes: Number(row.size_bytes || 0),
    sender_name: String(row.sender_name || ''),
    recipient_name: row.recipient_name ? String(row.recipient_name) : null,
    submitted_at: row.submitted_at ? String(row.submitted_at) : null,
    viewed_at: row.viewed_at ? String(row.viewed_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function submissionById(db: import('../db').Database, organizationId: string, submissionId: string): Promise<DocumentSubmission> {
  const result = await db.query<SqlRow>(
    `SELECT ds.*, s.name AS sender_name, r.name AS recipient_name,
            a.file_name, a.mime_type, a.size_bytes
     FROM document_submissions ds
     JOIN users s ON s.id = ds.sender_id
     LEFT JOIN users r ON r.id = ds.recipient_id
     LEFT JOIN attachments a ON a.id = ds.attachment_id
     WHERE ds.id = $1 AND ds.organization_id = $2`,
    [submissionId, organizationId],
  );
  const row = result.rows[0];
  if (!row) throw new HttpError(404, 'Document submission not found.');
  return mapSubmission(row);
}

async function assertRecipient(db: import('../db').Database, organizationId: string, recipientId: string, senderId: string): Promise<string> {
  if (recipientId === senderId) throw new HttpError(400, 'Choose another user to receive this document.');
  const result = await db.query<{ name: string }>(
    `SELECT u.name FROM users u
     JOIN organization_members om ON om.user_id = u.id
     WHERE om.organization_id = $1 AND u.id = $2 AND u.is_active = TRUE`,
    [organizationId, recipientId],
  );
  const name = result.rows[0] ? String(result.rows[0].name) : '';
  if (!name) throw new HttpError(400, 'The selected recipient is not an active member of this workspace.');
  return name;
}

export async function listDocumentSubmissionsRoute(ctx: import('../context').ApiContext): Promise<Response> {
  const auth = user(ctx);
  const access = await workspace(ctx);
  const db = ctx.runtime.db;
  const admin = isAdmin(auth);
  const result = await db.query<SqlRow>(
    `SELECT ds.*, s.name AS sender_name, r.name AS recipient_name,
            a.file_name, a.mime_type, a.size_bytes
     FROM document_submissions ds
     JOIN users s ON s.id = ds.sender_id
     LEFT JOIN users r ON r.id = ds.recipient_id
     LEFT JOIN attachments a ON a.id = ds.attachment_id
     WHERE ds.organization_id = $1
       AND (ds.sender_id = $2 OR ds.recipient_id = $2 OR $3 = TRUE)
     ORDER BY ds.created_at DESC
     LIMIT 200`,
    [access.organization.id, auth.user.id, admin],
  );
  const peopleResult = await db.query<SqlRow>(
    `SELECT u.id, u.name, u.position, u.role FROM users u
     JOIN organization_members om ON om.user_id = u.id
     WHERE om.organization_id = $1 AND u.is_active = TRUE AND u.id <> $2
     ORDER BY u.name`,
    [access.organization.id, auth.user.id],
  );
  const people: DocumentSubmissionPerson[] = peopleResult.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    position: String(row.position || ''),
    role: String(row.role) as Role,
  }));
  return json({ submissions: result.rows.map(mapSubmission), people });
}

export async function createDocumentSubmissionRoute(ctx: import('../context').ApiContext): Promise<Response> {
  const auth = user(ctx);
  const access = await workspace(ctx);
  const { form, fields } = await formBody(ctx);
  const organizationId = access.organization.id;
  if (fields.organizationId && fields.organizationId !== organizationId) {
    throw new HttpError(403, 'The selected workspace is not authorized.');
  }
  const title = String(fields.title || '').trim().slice(0, 200);
  const description = String(fields.description || '').trim().slice(0, 1000);
  const deliveryMode = String(fields.deliveryMode || 'kept');
  const recipientId = String(fields.recipientId || '').trim();
  if (!title) throw new HttpError(400, 'Give the document a title.');
  if (!['kept', 'submitted'].includes(deliveryMode)) throw new HttpError(400, 'Choose whether to keep or submit the document.');
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'Choose a file to upload.');

  let recipientName: string | null = null;
  if (deliveryMode === 'submitted') {
    if (!recipientId) throw new HttpError(400, 'Choose a recipient for this submission.');
    recipientName = await assertRecipient(ctx.runtime.db, organizationId, recipientId, auth.user.id);
  }

  const submissionId = id('submission');
  const reference = makeReference('SUB');
  await ctx.runtime.db.query(
    `INSERT INTO document_submissions
      (id, organization_id, reference, title, description, delivery_mode, status,
       sender_id, recipient_id, submitted_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8,
             CASE WHEN $6 = 'submitted' THEN NOW() ELSE NULL END, NOW(), NOW())`,
    [
      submissionId,
      organizationId,
      reference,
      title,
      description,
      deliveryMode,
      auth.user.id,
      deliveryMode === 'submitted' ? recipientId : null,
    ],
  );

  let attachmentId: string;
  try {
    const attachment = await saveAttachment(ctx.runtime, {
      organizationId,
      entityType: 'document_submission',
      entityId: submissionId,
      fileName: file.name,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
      uploadedBy: auth.user.id,
    });
    attachmentId = attachment.id;
    await ctx.runtime.db.query('UPDATE document_submissions SET attachment_id = $1, updated_at = NOW() WHERE id = $2', [attachmentId, submissionId]);
  } catch (error) {
    await ctx.runtime.db.query('DELETE FROM document_submissions WHERE id = $1', [submissionId]);
    throw error;
  }

  if (deliveryMode === 'submitted') {
    await notifyUsers(ctx.runtime, {
      userIds: [recipientId],
      organizationId,
      type: 'document_submission_received',
      title: 'New document submitted to you',
      body: `${auth.user.name} submitted “${title}”${description ? `: ${description.slice(0, 120)}` : ''}.`,
      link: '/workspace/submissions',
      severity: 'info',
      category: 'general',
      dedupeKey: `document-submission:${submissionId}`,
      reason: 'document_submission_received',
    });
  }

  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId,
    action: deliveryMode === 'submitted' ? 'document_submission.submitted' : 'document_submission.kept',
    entityType: 'document_submission',
    entityId: submissionId,
    metadata: { reference, title, deliveryMode, recipientId: recipientId || null, fileName: safeFileName(file.name), attachmentId },
    request: ctx.request,
  });
  await broadcastWorkspaceRefresh(ctx, organizationId, 'document_submission_created');
  return json(
    {
      submission: await submissionById(ctx.runtime.db, organizationId, submissionId),
      message: deliveryMode === 'submitted' ? `Document submitted to ${recipientName}.` : 'Document uploaded and kept privately.',
    },
    201,
  );
}

export async function submitKeptDocumentRoute(ctx: import('../context').ApiContext): Promise<Response> {
  const auth = user(ctx);
  const access = await workspace(ctx);
  const body = await jsonBody(ctx, documentSubmissionSubmitSchema);
  const row = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'document_submissions', ctx.params.id);
  if (!isAdmin(auth) && String(row.sender_id) !== auth.user.id) {
    throw new HttpError(403, 'Only the owner can submit this kept document.');
  }
  if (String(row.status) === 'archived') throw new HttpError(400, 'Restore this document before submitting it.');
  const recipientName = await assertRecipient(ctx.runtime.db, access.organization.id, body.recipientId, String(row.sender_id));
  await ctx.runtime.db.query(
    `UPDATE document_submissions
     SET delivery_mode = 'submitted', status = 'active', recipient_id = $2, submitted_at = NOW(), viewed_at = NULL, updated_at = NOW()
     WHERE id = $1`,
    [ctx.params.id, body.recipientId],
  );
  await notifyUsers(ctx.runtime, {
    userIds: [body.recipientId],
    organizationId: access.organization.id,
    type: 'document_submission_received',
    title: 'New document submitted to you',
    body: `${auth.user.name} submitted “${String(row.title)}” for your attention.`,
    link: '/workspace/submissions',
    severity: 'info',
    category: 'general',
    dedupeKey: `document-submission-resend:${ctx.params.id}:${Date.now()}`,
    reason: 'document_submission_received',
  });
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'document_submission.forwarded',
    entityType: 'document_submission',
    entityId: ctx.params.id,
    metadata: { recipientId: body.recipientId },
    request: ctx.request,
  });
  await broadcastWorkspaceRefresh(ctx, access.organization.id, 'document_submission_submitted');
  return json({
    submission: await submissionById(ctx.runtime.db, access.organization.id, ctx.params.id),
    message: `Document submitted to ${recipientName}.`,
  });
}

export async function updateDocumentSubmissionRoute(ctx: import('../context').ApiContext): Promise<Response> {
  const auth = user(ctx);
  const access = await workspace(ctx);
  const body = await jsonBody(ctx, documentSubmissionUpdateSchema);
  const row = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'document_submissions', ctx.params.id);
  const isSender = String(row.sender_id) === auth.user.id;
  const isRecipient = String(row.recipient_id || '') === auth.user.id;
  if (!isAdmin(auth) && !isSender && !isRecipient) {
    throw new HttpError(403, 'This submission is private to its sender and recipient.');
  }
  await ctx.runtime.db.query(
    `UPDATE document_submissions
     SET status = $2,
         viewed_at = CASE WHEN $2 IN ('received', 'reviewed') THEN COALESCE(viewed_at, NOW()) ELSE viewed_at END,
         updated_at = NOW()
     WHERE id = $1`,
    [ctx.params.id, body.status],
  );
  if (isRecipient && ['received', 'reviewed'].includes(body.status)) {
    await notifyUsers(ctx.runtime, {
      userIds: [String(row.sender_id)],
      organizationId: access.organization.id,
      type: 'document_submission_status',
      title: 'Document submission status updated',
      body: `${auth.user.name} marked “${String(row.title)}” as ${body.status}.`,
      link: '/workspace/submissions',
      severity: 'info',
      category: 'general',
      dedupeKey: `document-submission-status:${ctx.params.id}:${body.status}:${Date.now()}`,
      reason: 'document_submission_status',
    });
  }
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'document_submission.status_updated',
    entityType: 'document_submission',
    entityId: ctx.params.id,
    metadata: { status: body.status },
    request: ctx.request,
  });
  await broadcastWorkspaceRefresh(ctx, access.organization.id, 'document_submission_updated');
  return json({
    submission: await submissionById(ctx.runtime.db, access.organization.id, ctx.params.id),
    message: `Submission marked ${body.status}.`,
  });
}

export async function downloadDocumentSubmissionRoute(ctx: import('../context').ApiContext): Promise<Response> {
  const auth = user(ctx);
  const access = await workspace(ctx);
  const row = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'document_submissions', ctx.params.id);
  const isSender = String(row.sender_id) === auth.user.id;
  const isRecipient = String(row.recipient_id || '') === auth.user.id;
  if (!isAdmin(auth) && !isSender && !isRecipient) {
    throw new HttpError(403, 'This submission is private to its sender and recipient.');
  }
  if (!row.attachment_id) throw new HttpError(404, 'The uploaded file is not available.');
  const attachmentResult = await ctx.runtime.db.query<SqlRow>(
    'SELECT * FROM attachments WHERE id = $1 AND organization_id = $2 AND entity_type = $3',
    [String(row.attachment_id), access.organization.id, 'document_submission'],
  );
  const attachment = attachmentResult.rows[0];
  if (!attachment) throw new HttpError(404, 'The uploaded file is not available.');
  const bytes = await getAttachmentBytes(ctx.runtime, attachment);
  if (isRecipient && String(row.status) === 'active') {
    await ctx.runtime.db.query(
      "UPDATE document_submissions SET status = 'received', viewed_at = COALESCE(viewed_at, NOW()), updated_at = NOW() WHERE id = $1",
      [ctx.params.id],
    );
  }
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'document_submission.downloaded',
    entityType: 'document_submission',
    entityId: ctx.params.id,
    metadata: { fileName: safeFileName(String(attachment.file_name)) },
    request: ctx.request,
  });
  return new Response(bytes as BodyInit, {
    headers: {
      'Content-Type': String(attachment.mime_type || 'application/octet-stream'),
      'Content-Disposition': `attachment; filename="${safeFileName(String(attachment.file_name))}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

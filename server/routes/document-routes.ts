import { z } from 'zod';
import type { Attachment, CalendarEvent, Correspondence, DocumentRecord, DocumentReview, DocumentVersion, Template } from '@/lib/shared-types';
import { logAudit } from '../audit';
import type { ApiContext } from '../context';
import {
  assertEntityInWorkspace,
  broadcastWorkspaceRefresh,
  formBody,
  jsonBody,
  organizationUsers,
  user,
  workspace,
} from '../context';
import type { SqlRow } from '../db';
import { notifyUsers } from '../notifications';
import { buildPdf, pdfResponse } from '../pdf';
import { assertPermission, hasPermission, isAdmin } from '../permissions';
import { renderTemplate, templateVariables } from '../records';
import {
  attachmentFromRow,
  entityOrganizationId,
  getAttachmentBytes,
  listAttachments,
  saveAttachment,
} from '../storage';
import { HttpError, id, json, makeReference, safeFileName } from '../utils';
import {
  calendarSchema,
  correspondenceCreateSchema,
  correspondenceUpdateSchema,
  documentCreateSchema,
  documentReviewSchema,
  documentUpdateSchema,
  normalizeDateTime,
  templateSchema,
} from '../validation';

function mapDocument(row: SqlRow): DocumentRecord {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    title: String(row.title),
    kind: String(row.kind) as DocumentRecord['kind'],
    category: String(row.category || ''),
    reference: String(row.reference),
    subject: String(row.subject || ''),
    recipient: String(row.recipient || ''),
    content: String(row.content || ''),
    tags: String(row.tags || ''),
    status: String(row.status) as DocumentRecord['status'],
    template_id: row.template_id ? String(row.template_id) : null,
    meeting_id: row.meeting_id ? String(row.meeting_id) : null,
    created_by: String(row.created_by),
    reviewed_by: row.reviewed_by ? String(row.reviewed_by) : null,
    reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
    review_comment: row.review_comment ? String(row.review_comment) : null,
    version: Number(row.version || 1),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    author_name: row.author_name ? String(row.author_name) : undefined,
    reviewer_name: row.reviewer_name ? String(row.reviewer_name) : undefined,
  };
}

function mapTemplate(row: SqlRow): Template {
  return {
    id: String(row.id),
    organization_id: row.organization_id ? String(row.organization_id) : ('' as unknown as string),
    name: String(row.name),
    type: String(row.type) as Template['type'],
    description: String(row.description || ''),
    body: String(row.body),
    is_shared: Boolean(row.is_shared),
    created_by: String(row.created_by),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    author_name: row.author_name ? String(row.author_name) : undefined,
  };
}

function mapCorrespondence(row: SqlRow): Correspondence {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    direction: String(row.direction) as Correspondence['direction'],
    reference: String(row.reference),
    subject: String(row.subject),
    sender: String(row.sender),
    recipient: String(row.recipient),
    document_id: row.document_id ? String(row.document_id) : null,
    status: String(row.status) as Correspondence['status'],
    received_at: String(row.received_at),
    dispatched_at: row.dispatched_at ? String(row.dispatched_at) : null,
    response_due_at: row.response_due_at ? String(row.response_due_at) : null,
    follow_up_at: row.follow_up_at ? String(row.follow_up_at) : null,
    delivery_details: String(row.delivery_details || ''),
    response_notes: String(row.response_notes || ''),
    created_by: String(row.created_by),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapCalendar(row: SqlRow): CalendarEvent {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    title: String(row.title),
    type: String(row.type) as CalendarEvent['type'],
    starts_at: String(row.starts_at),
    ends_at: row.ends_at ? String(row.ends_at) : null,
    location: String(row.location || ''),
    notes: String(row.notes || ''),
    meeting_id: row.meeting_id ? String(row.meeting_id) : null,
    created_by: String(row.created_by),
    created_at: String(row.created_at),
  };
}

function canViewDocument(ctx: ApiContext, row: SqlRow): boolean {
  const auth = user(ctx);
  if (isAdmin(auth) || hasPermission(auth, 'manage_documents') || hasPermission(auth, 'review_documents')) return true;
  if (String(row.created_by) === auth.user.id || String(row.reviewed_by || '') === auth.user.id) return true;
  return ['approved', 'sent', 'answered', 'archived'].includes(String(row.status));
}

function canEditDocument(ctx: ApiContext, row: SqlRow): boolean {
  const auth = user(ctx);
  if (isAdmin(auth) || hasPermission(auth, 'manage_documents')) return true;
  const editableStatuses = ['draft', 'revisions_requested', 'rejected'];
  return String(row.created_by) === auth.user.id && editableStatuses.includes(String(row.status));
}

function uniqueReference(prefix: string): string {
  return makeReference(prefix);
}

async function documentDetail(ctx: ApiContext, documentId: string, organizationId: string): Promise<DocumentRecord> {
  const db = ctx.runtime.db;
  const [documentResult, versions, reviews, attachments] = await Promise.all([
    db.query<SqlRow>(
      `SELECT d.*, author.name AS author_name, reviewer.name AS reviewer_name
       FROM documents d JOIN users author ON author.id = d.created_by
       LEFT JOIN users reviewer ON reviewer.id = d.reviewed_by
       WHERE d.id = $1 AND d.organization_id = $2`,
      [documentId, organizationId],
    ),
    db.query<SqlRow>(
      `SELECT dv.*, u.name AS changed_by_name FROM document_versions dv JOIN users u ON u.id = dv.changed_by
       WHERE dv.document_id = $1 ORDER BY dv.version DESC`,
      [documentId],
    ),
    db.query<SqlRow>(
      `SELECT dr.*, u.name AS reviewer_name FROM document_reviews dr JOIN users u ON u.id = dr.reviewer_id
       WHERE dr.document_id = $1 ORDER BY dr.created_at DESC`,
      [documentId],
    ),
    listAttachments(db, organizationId, 'document', documentId),
  ]);
  if (!documentResult.rows[0]) throw new HttpError(404, 'Document not found.');
  return {
    ...mapDocument(documentResult.rows[0]),
    versions: versions.rows.map((row): DocumentVersion => ({
      id: String(row.id),
      document_id: String(row.document_id),
      organization_id: String(row.organization_id),
      version: Number(row.version),
      title: String(row.title),
      content: String(row.content),
      changed_by: String(row.changed_by),
      change_note: String(row.change_note || ''),
      created_at: String(row.created_at),
      changed_by_name: String(row.changed_by_name || ''),
    })),
    reviews: reviews.rows.map((row): DocumentReview => ({
      id: String(row.id),
      document_id: String(row.document_id),
      organization_id: String(row.organization_id),
      reviewer_id: String(row.reviewer_id),
      decision: String(row.decision) as DocumentReview['decision'],
      comment: String(row.comment || ''),
      created_at: String(row.created_at),
      reviewer_name: String(row.reviewer_name || ''),
    })),
    attachments,
  };
}

export async function listDocumentsRoute(ctx: ApiContext): Promise<Response> {
  const access = await workspace(ctx);
  const auth = user(ctx);
  const search = ctx.url.searchParams.get('search')?.trim() || '';
  const status = ctx.url.searchParams.get('status') || '';
  const kind = ctx.url.searchParams.get('kind') || '';
  const category = ctx.url.searchParams.get('category') || '';
  const tag = ctx.url.searchParams.get('tag') || '';
  const meetingId = ctx.url.searchParams.get('meetingId') || '';
  const params: unknown[] = [access.organization.id];
  const conditions = ['d.organization_id = $1'];
  const privileged = isAdmin(auth) || hasPermission(auth, 'manage_documents') || hasPermission(auth, 'review_documents');
  if (!privileged) {
    params.push(auth.user.id);
    conditions.push(`(d.created_by = $${params.length} OR d.status IN ('approved','sent','answered','archived'))`);
  }
  if (status) {
    params.push(status);
    conditions.push(`d.status = $${params.length}`);
  }
  if (kind) {
    params.push(kind);
    conditions.push(`d.kind = $${params.length}`);
  }
  if (category) {
    params.push(category);
    conditions.push(`d.category = $${params.length}`);
  }
  if (tag) {
    params.push(`%${tag}%`);
    conditions.push(`d.tags ILIKE $${params.length}`);
  }
  if (meetingId) {
    params.push(meetingId);
    conditions.push(`d.meeting_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(d.title ILIKE $${params.length} OR d.reference ILIKE $${params.length} OR d.subject ILIKE $${params.length} OR d.content ILIKE $${params.length} OR d.tags ILIKE $${params.length})`);
  }
  params.push(300);
  const result = await ctx.runtime.db.query<SqlRow>(
    `SELECT d.*, author.name AS author_name, reviewer.name AS reviewer_name
     FROM documents d JOIN users author ON author.id = d.created_by
     LEFT JOIN users reviewer ON reviewer.id = d.reviewed_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY d.updated_at DESC LIMIT $${params.length}`,
    params,
  );
  const categories = await ctx.runtime.db.query<SqlRow>('SELECT DISTINCT category FROM documents WHERE organization_id = $1 ORDER BY category', [access.organization.id]);
  return json({ documents: result.rows.map(mapDocument), categories: categories.rows.map((row) => String(row.category)) });
}

export async function approvalsRoute(ctx: ApiContext): Promise<Response> {
  const access = await workspace(ctx);
  const result = await ctx.runtime.db.query<SqlRow>(
    `SELECT d.*, author.name AS author_name, reviewer.name AS reviewer_name
     FROM documents d JOIN users author ON author.id = d.created_by
     LEFT JOIN users reviewer ON reviewer.id = d.reviewed_by
     WHERE d.organization_id = $1 AND d.status = 'pending_approval'
     ORDER BY d.updated_at DESC`,
    [access.organization.id],
  );
  return json({ documents: result.rows.map(mapDocument) });
}

export async function createDocumentRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  assertPermission(auth, 'manage_documents');
  const body = await jsonBody(ctx, documentCreateSchema);
  const access = await workspace(ctx);
  if (body.organizationId !== access.organization.id) throw new HttpError(403, 'The selected workspace is not authorized.');
  let content = body.content || '';
  if (!content.trim() && body.templateId) {
    const templateResult = await ctx.runtime.db.query<SqlRow>(
      'SELECT * FROM templates WHERE id = $1 AND (organization_id IS NULL OR organization_id = $2)',
      [body.templateId, access.organization.id],
    );
    if (templateResult.rows[0]) {
      content = renderTemplate(String(templateResult.rows[0].body), {
        subject: body.subject,
        recipient: body.recipient,
        title: body.title,
        signatory: auth.user.name,
        position: auth.user.position,
      }, access.organization);
    }
  }
  const documentId = id('document');
  const reference = uniqueReference('DOC');
  await ctx.runtime.db.query(
    `INSERT INTO documents
      (id, organization_id, title, kind, category, reference, subject, recipient, content, tags, status,
       template_id, meeting_id, created_by, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 1, NOW(), NOW())`,
    [documentId, access.organization.id, body.title, body.kind, body.category || 'General', reference, body.subject || '', body.recipient || '', content, body.tags || '', body.status, body.templateId || null, body.meetingId || null, auth.user.id],
  );
  await ctx.runtime.db.query(
    `INSERT INTO document_versions
      (id, document_id, organization_id, version, title, content, changed_by, change_note, created_at)
     VALUES ($1, $2, $3, 1, $4, $5, $6, 'Initial manual draft.', NOW())`,
    [id('docver'), documentId, access.organization.id, body.title, content, auth.user.id],
  );
  if (body.status === 'pending_approval') {
    const presidents = await organizationUsers(ctx.runtime.db, access.organization.id, { roles: ['school_president', 'zonal_president'] });
    await notifyUsers(ctx.runtime, {
      userIds: presidents,
      organizationId: access.organization.id,
      type: 'document_pending',
      title: 'Document awaiting approval',
      body: `${body.title} (${reference}) is ready for review.`,
      link: `/workspace/documents/${documentId}`,
      severity: 'warning',
      dedupeKey: `document-pending:${documentId}`,
      reason: 'document_pending',
    });
  }
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'document.created',
    entityType: 'document',
    entityId: documentId,
    metadata: { reference, status: body.status },
    request: ctx.request,
  });
  await broadcastWorkspaceRefresh(ctx, access.organization.id, 'document_created');
  return json({ document: await documentDetail(ctx, documentId, access.organization.id), message: 'Document saved in the repository.' }, 201);
}

export async function getDocumentRoute(ctx: ApiContext): Promise<Response> {
  const access = await workspace(ctx);
  const row = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'documents', ctx.params.id);
  if (!canViewDocument(ctx, row)) throw new HttpError(403, 'This document is not available to your role.');
  return json({ document: await documentDetail(ctx, ctx.params.id, access.organization.id) });
}

export async function updateDocumentRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const access = await workspace(ctx);
  const existing = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'documents', ctx.params.id);
  if (!canEditDocument(ctx, existing)) throw new HttpError(403, 'This document cannot be edited in its current state.');
  const body = await jsonBody(ctx, documentUpdateSchema);
  if (body.status && ['approved', 'rejected', 'revisions_requested'].includes(body.status) && !hasPermission(auth, 'review_documents') && !isAdmin(auth)) {
    throw new HttpError(403, 'Only the President can record an approval decision.');
  }
  const contentChanged = body.content !== undefined && String(body.content) !== String(existing.content || '');
  const nextVersion = Number(existing.version || 1) + (contentChanged ? 1 : 0);
  const updates: string[] = [];
  const params: unknown[] = [ctx.params.id];
  const fields: Record<string, [unknown, string]> = {
    title: [body.title, 'title'],
    kind: [body.kind, 'kind'],
    category: [body.category, 'category'],
    subject: [body.subject, 'subject'],
    recipient: [body.recipient, 'recipient'],
    content: [body.content, 'content'],
    tags: [body.tags, 'tags'],
    status: [body.status, 'status'],
  };
  for (const [key, [value, column]] of Object.entries(fields)) {
    if (value !== undefined) {
      params.push(value);
      updates.push(`${column} = $${params.length}`);
    }
  }
  if (contentChanged) {
    params.push(nextVersion);
    updates.push(`version = $${params.length}`);
  }
  if (updates.length > 0) await ctx.runtime.db.query(`UPDATE documents SET ${updates.join(', ')} WHERE id = $1`, params);
  if (contentChanged) {
    await ctx.runtime.db.query(
      `INSERT INTO document_versions
        (id, document_id, organization_id, version, title, content, changed_by, change_note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [id('docver'), ctx.params.id, access.organization.id, nextVersion, body.title || String(existing.title), body.content || '', auth.user.id, body.changeNote || 'Manual edit.'],
    );
  }
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'document.updated',
    entityType: 'document',
    entityId: ctx.params.id,
    metadata: { contentChanged, version: nextVersion },
    request: ctx.request,
  });
  await broadcastWorkspaceRefresh(ctx, access.organization.id, 'document_updated');
  return json({ document: await documentDetail(ctx, ctx.params.id, access.organization.id), message: 'Document and version history saved.' });
}

export async function submitDocumentRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  assertPermission(auth, 'submit_documents');
  const access = await workspace(ctx);
  const existing = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'documents', ctx.params.id);
  if (!['draft', 'revisions_requested', 'rejected'].includes(String(existing.status))) {
    throw new HttpError(400, 'Only a draft or returned document can be submitted for approval.');
  }
  await ctx.runtime.db.query("UPDATE documents SET status = 'pending_approval', review_comment = NULL WHERE id = $1", [ctx.params.id]);
  const presidents = await organizationUsers(ctx.runtime.db, access.organization.id, { roles: ['school_president', 'zonal_president'] });
  await notifyUsers(ctx.runtime, {
    userIds: presidents,
    organizationId: access.organization.id,
    type: 'document_pending',
    title: 'Document awaiting approval',
    body: `${String(existing.title)} (${String(existing.reference)}) has been submitted.`,
    link: `/workspace/documents/${ctx.params.id}`,
    severity: 'warning',
    dedupeKey: `document-submitted:${ctx.params.id}:${Date.now()}`,
    reason: 'document_pending',
  });
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'document.submitted_for_approval',
    entityType: 'document',
    entityId: ctx.params.id,
    request: ctx.request,
  });
  await broadcastWorkspaceRefresh(ctx, access.organization.id, 'document_submitted');
  return json({ document: await documentDetail(ctx, ctx.params.id, access.organization.id), message: 'Document submitted for presidential review.' });
}

export async function reviewDocumentRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  assertPermission(auth, 'review_documents');
  const access = await workspace(ctx);
  const existing = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'documents', ctx.params.id);
  if (String(existing.status) !== 'pending_approval') throw new HttpError(400, 'This document is not awaiting approval.');
  const body = await jsonBody(ctx, documentReviewSchema);
  if ((body.decision === 'rejected' || body.decision === 'revisions_requested') && !(body.comment || '').trim()) {
    throw new HttpError(400, 'A reason is required when a document is returned.');
  }
  const reviewId = id('docreview');
  const comment = body.comment || '';
  const newStatus = body.decision === 'approved' ? 'approved' : body.decision === 'rejected' ? 'rejected' : 'revisions_requested';
  await ctx.runtime.db.query(
    `UPDATE documents SET status = $2, reviewed_by = $3, reviewed_at = NOW(), review_comment = $4 WHERE id = $1`,
    [ctx.params.id, newStatus, auth.user.id, comment],
  );
  await ctx.runtime.db.query(
    `INSERT INTO document_reviews
      (id, document_id, organization_id, reviewer_id, decision, comment, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [reviewId, ctx.params.id, access.organization.id, auth.user.id, body.decision, comment],
  );
  if (body.decision === 'approved' && existing.meeting_id) {
    await ctx.runtime.db.query("UPDATE meetings SET minutes_status = 'approved' WHERE id = $1", [String(existing.meeting_id)]);
  }
  await ctx.runtime.db.query(
    "UPDATE correspondence SET status = CASE WHEN $2 = 'approved' THEN 'approved' ELSE correspondence.status END WHERE document_id = $1",
    [ctx.params.id, body.decision],
  );
  const secretaries = await organizationUsers(ctx.runtime.db, access.organization.id, { primarySecretariesOnly: true });
  const recipients = Array.from(new Set([String(existing.created_by), ...secretaries])).filter((userId) => userId !== auth.user.id);
  await notifyUsers(ctx.runtime, {
    userIds: recipients,
    organizationId: access.organization.id,
    type: body.decision === 'approved' ? 'document_approved' : 'document_returned',
    title: body.decision === 'approved' ? 'Document approved' : 'Document returned for revision',
    body: `${String(existing.title)} — ${body.decision.replaceAll('_', ' ')}${comment ? `: ${comment}` : ''}.`,
    link: `/workspace/documents/${ctx.params.id}`,
    severity: body.decision === 'approved' ? 'success' : 'warning',
    dedupeKey: `document-review:${reviewId}`,
    reason: body.decision === 'approved' ? 'document_approved' : 'document_returned',
  });
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: `document.${body.decision}`,
    entityType: 'document',
    entityId: ctx.params.id,
    metadata: { comment },
    request: ctx.request,
  });
  await broadcastWorkspaceRefresh(ctx, access.organization.id, 'document_reviewed');
  return json({ document: await documentDetail(ctx, ctx.params.id, access.organization.id), message: `Document ${body.decision.replaceAll('_', ' ')}.` });
}

export async function documentPdfRoute(ctx: ApiContext): Promise<Response> {
  const access = await workspace(ctx);
  const row = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'documents', ctx.params.id);
  if (!canViewDocument(ctx, row)) throw new HttpError(403, 'This document is not available to your role.');
  const authorResult = await ctx.runtime.db.query<SqlRow>('SELECT name, position FROM users WHERE id = $1', [String(row.created_by)]);
  const author = authorResult.rows[0];
  const buffer = await buildPdf({
    title: String(row.title),
    organizationName: access.organization.letterhead_name || access.organization.name,
    reference: String(row.reference),
    subtitle: `${String(row.kind).replaceAll('_', ' ')} • ${String(row.status).replaceAll('_', ' ')}`,
    preparedBy: author ? `${String(author.name)}${author.position ? ` — ${String(author.position)}` : ''}` : undefined,
    body: String(row.content || ''),
    sections: [
      {
        title: 'Approval record',
        lines: [
          `Reference: ${String(row.reference)}`,
          `Status: ${String(row.status).replaceAll('_', ' ')}`,
          `Version: ${Number(row.version || 1)}`,
          row.reviewed_at ? `Reviewed: ${String(row.reviewed_at).replace('T', ' ').slice(0, 16)}` : 'Reviewed: pending',
          row.review_comment ? `Review note: ${String(row.review_comment)}` : '',
        ].filter(Boolean),
      },
    ],
    footerNote: 'Generated from the saved document record. Attachments and confidential contact details are not included.',
  });
  await logAudit(ctx.runtime.db, {
    actorId: user(ctx).user.id,
    organizationId: access.organization.id,
    action: 'document.pdf_downloaded',
    entityType: 'document',
    entityId: ctx.params.id,
    request: ctx.request,
  });
  return pdfResponse(buffer, `${safeFileName(String(row.reference))}.pdf`);
}

export async function listTemplatesRoute(ctx: ApiContext): Promise<Response> {
  const access = await workspace(ctx);
  const result = await ctx.runtime.db.query<SqlRow>(
    `SELECT t.*, u.name AS author_name FROM templates t JOIN users u ON u.id = t.created_by
     WHERE t.organization_id IS NULL OR t.organization_id = $1
     ORDER BY t.is_shared DESC, t.type, t.name`,
    [access.organization.id],
  );
  return json({ templates: result.rows.map(mapTemplate) });
}

export async function createTemplateRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  assertPermission(auth, 'manage_templates');
  const body = await jsonBody(ctx, templateSchema);
  const access = await workspace(ctx);
  const organizationId = body.isShared && isAdmin(auth) ? null : body.organizationId || access.organization.id;
  if (organizationId && organizationId !== access.organization.id && !isAdmin(auth)) throw new HttpError(403, 'Templates can only be created for your current workspace.');
  const templateId = id('template');
  await ctx.runtime.db.query(
    `INSERT INTO templates
      (id, organization_id, name, type, description, body, is_shared, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
    [templateId, organizationId, body.name, body.type, body.description || '', body.body, body.isShared, auth.user.id],
  );
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'template.created',
    entityType: 'template',
    entityId: templateId,
    request: ctx.request,
  });
  const result = await ctx.runtime.db.query<SqlRow>('SELECT * FROM templates WHERE id = $1', [templateId]);
  return json({ template: mapTemplate(result.rows[0] as SqlRow), variables: templateVariables(body.body) }, 201);
}

export async function updateTemplateRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  assertPermission(auth, 'manage_templates');
  const access = await workspace(ctx);
  const existing = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'templates', ctx.params.id);
  if (!isAdmin(auth) && String(existing.created_by) !== auth.user.id && existing.organization_id === null) {
    throw new HttpError(403, 'Shared templates can only be changed by an administrator.');
  }
  const body = await jsonBody(ctx, templateSchema);
  await ctx.runtime.db.query(
    `UPDATE templates SET organization_id = $2, name = $3, type = $4, description = $5, body = $6, is_shared = $7 WHERE id = $1`,
    [ctx.params.id, body.isShared && isAdmin(auth) ? null : body.organizationId || access.organization.id, body.name, body.type, body.description || '', body.body, body.isShared],
  );
  const result = await ctx.runtime.db.query<SqlRow>('SELECT * FROM templates WHERE id = $1', [ctx.params.id]);
  return json({ template: mapTemplate(result.rows[0] as SqlRow), variables: templateVariables(body.body), message: 'Template saved.' });
}

export async function deleteTemplateRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  assertPermission(auth, 'manage_templates');
  const access = await workspace(ctx);
  const existing = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'templates', ctx.params.id);
  if (!isAdmin(auth) && String(existing.created_by) !== auth.user.id) throw new HttpError(403, 'Only the template author can delete it.');
  await ctx.runtime.db.query('DELETE FROM templates WHERE id = $1', [ctx.params.id]);
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'template.deleted',
    entityType: 'template',
    entityId: ctx.params.id,
    request: ctx.request,
  });
  return json({ ok: true, message: 'Template deleted.' });
}

export async function renderTemplateRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const schema = z.object({ templateId: z.string().min(1), values: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).default({}) });
  const body = await jsonBody(ctx, schema);
  const access = await workspace(ctx);
  const result = await ctx.runtime.db.query<SqlRow>(
    'SELECT * FROM templates WHERE id = $1 AND (organization_id IS NULL OR organization_id = $2)',
    [body.templateId, access.organization.id],
  );
  if (!result.rows[0]) throw new HttpError(404, 'Template not found.');
  const providedValues = body.values || {};
  const values = { ...providedValues, signatory: providedValues.signatory || auth.user.name, position: providedValues.position || auth.user.position };
  return json({ content: renderTemplate(String(result.rows[0].body), values, access.organization), variables: templateVariables(String(result.rows[0].body)) });
}

export async function listCorrespondenceRoute(ctx: ApiContext): Promise<Response> {
  const access = await workspace(ctx);
  const search = ctx.url.searchParams.get('search')?.trim() || '';
  const status = ctx.url.searchParams.get('status') || '';
  const direction = ctx.url.searchParams.get('direction') || '';
  const params: unknown[] = [access.organization.id];
  const conditions = ['organization_id = $1'];
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (direction) {
    params.push(direction);
    conditions.push(`direction = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(reference ILIKE $${params.length} OR subject ILIKE $${params.length} OR sender ILIKE $${params.length} OR recipient ILIKE $${params.length})`);
  }
  params.push(300);
  const result = await ctx.runtime.db.query<SqlRow>(
    `SELECT * FROM correspondence WHERE ${conditions.join(' AND ')} ORDER BY received_at DESC LIMIT $${params.length}`,
    params,
  );
  return json({ correspondence: result.rows.map(mapCorrespondence) });
}

export async function createCorrespondenceRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  assertPermission(auth, 'manage_correspondence');
  const body = await jsonBody(ctx, correspondenceCreateSchema);
  const access = await workspace(ctx);
  if (body.organizationId !== access.organization.id) throw new HttpError(403, 'The selected workspace is not authorized.');
  if (body.documentId) await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'documents', body.documentId);
  const correspondenceId = id('corr');
  const reference = makeReference(body.direction === 'incoming' ? 'IN' : 'OUT');
  await ctx.runtime.db.query(
    `INSERT INTO correspondence
      (id, organization_id, direction, reference, subject, sender, recipient, document_id, status,
       received_at, dispatched_at, response_due_at, follow_up_at, delivery_details, response_notes, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz,
             CASE WHEN $9 IN ('sent','answered') THEN NOW() ELSE NULL END,
             $11::timestamptz, $12::timestamptz, $13, $14, $15, NOW(), NOW())`,
    [correspondenceId, access.organization.id, body.direction, reference, body.subject, body.sender, body.recipient, body.documentId || null, body.status, normalizeDateTime(body.receivedAt, new Date().toISOString()), normalizeDateTime(body.responseDueAt, null), normalizeDateTime(body.followUpAt, null), body.deliveryDetails || '', body.responseNotes || '', auth.user.id],
  );
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'correspondence.created',
    entityType: 'correspondence',
    entityId: correspondenceId,
    metadata: { reference, direction: body.direction },
    request: ctx.request,
  });
  await broadcastWorkspaceRefresh(ctx, access.organization.id, 'correspondence_created');
  const result = await ctx.runtime.db.query<SqlRow>('SELECT * FROM correspondence WHERE id = $1', [correspondenceId]);
  return json({ correspondence: mapCorrespondence(result.rows[0] as SqlRow), message: 'Correspondence register entry saved.' }, 201);
}

export async function updateCorrespondenceRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  assertPermission(auth, 'manage_correspondence');
  const access = await workspace(ctx);
  await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'correspondence', ctx.params.id);
  const body = await jsonBody(ctx, correspondenceUpdateSchema);
  const updates: string[] = [];
  const params: unknown[] = [ctx.params.id];
  const fields: Record<string, [unknown, string]> = {
    direction: [body.direction, 'direction'],
    subject: [body.subject, 'subject'],
    sender: [body.sender, 'sender'],
    recipient: [body.recipient, 'recipient'],
    documentId: [body.documentId, 'document_id'],
    status: [body.status, 'status'],
    deliveryDetails: [body.deliveryDetails, 'delivery_details'],
    responseNotes: [body.responseNotes, 'response_notes'],
  };
  for (const [key, [value, column]] of Object.entries(fields)) {
    if (value !== undefined) {
      params.push(value);
      updates.push(`${column} = $${params.length}`);
    }
  }
  for (const [key, value, column] of [
    ['receivedAt', body.receivedAt, 'received_at'],
    ['responseDueAt', body.responseDueAt, 'response_due_at'],
    ['followUpAt', body.followUpAt, 'follow_up_at'],
  ] as Array<[string, string | null | undefined, string]>) {
    if (value !== undefined) {
      params.push(normalizeDateTime(value, null));
      updates.push(`${column} = $${params.length}::timestamptz`);
    }
  }
  if (body.status === 'sent' || body.status === 'answered') updates.push('dispatched_at = COALESCE(dispatched_at, NOW())');
  if (updates.length > 0) await ctx.runtime.db.query(`UPDATE correspondence SET ${updates.join(', ')} WHERE id = $1`, params);
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'correspondence.updated',
    entityType: 'correspondence',
    entityId: ctx.params.id,
    metadata: body as unknown as Record<string, unknown>,
    request: ctx.request,
  });
  await broadcastWorkspaceRefresh(ctx, access.organization.id, 'correspondence_updated');
  const result = await ctx.runtime.db.query<SqlRow>('SELECT * FROM correspondence WHERE id = $1', [ctx.params.id]);
  return json({ correspondence: mapCorrespondence(result.rows[0] as SqlRow), message: 'Correspondence entry updated.' });
}

export async function listCalendarRoute(ctx: ApiContext): Promise<Response> {
  const access = await workspace(ctx);
  const from = ctx.url.searchParams.get('from');
  const to = ctx.url.searchParams.get('to');
  const params: unknown[] = [access.organization.id];
  let windowCondition = '';
  if (from) {
    params.push(from);
    windowCondition += ` AND starts_at >= $${params.length}::date`;
  }
  if (to) {
    params.push(to);
    windowCondition += ` AND starts_at < ($${params.length}::date + INTERVAL '1 day')`;
  }
  params.push(500);
  const result = await ctx.runtime.db.query<SqlRow>(
    `SELECT id, organization_id, title, type, starts_at, ends_at, location, notes, meeting_id, created_by, created_at, 'event' AS source
     FROM calendar_events WHERE organization_id = $1${windowCondition}
     UNION ALL
     SELECT m.id, m.organization_id, m.title, 'meeting' AS type, m.starts_at, m.ends_at, m.venue AS location,
            m.agenda AS notes, m.id AS meeting_id, m.created_by, m.created_at, 'meeting' AS source
     FROM meetings m
     WHERE m.organization_id = $1 AND m.status <> 'cancelled'${windowCondition.replaceAll('starts_at', 'm.starts_at')}
       AND NOT EXISTS (SELECT 1 FROM calendar_events c WHERE c.meeting_id = m.id)
     ORDER BY starts_at ASC LIMIT $${params.length}`,
    params,
  );
  return json({ events: result.rows.map(mapCalendar) });
}

export async function createCalendarEventRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  if (!isAdmin(auth) && !hasPermission(auth, 'manage_meetings') && !hasPermission(auth, 'create_meeting_request')) {
    throw new HttpError(403, 'Your role cannot add calendar entries.');
  }
  const body = await jsonBody(ctx, calendarSchema);
  const access = await workspace(ctx);
  const eventId = id('calendar');
  await ctx.runtime.db.query(
    `INSERT INTO calendar_events
      (id, organization_id, title, type, starts_at, ends_at, location, notes, meeting_id, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7, $8, $9, $10, NOW())`,
    [eventId, access.organization.id, body.title, body.type, normalizeDateTime(body.startsAt, new Date().toISOString()), normalizeDateTime(body.endsAt, null), body.location || '', body.notes || '', body.meetingId || null, auth.user.id],
  );
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'calendar.created',
    entityType: 'calendar_event',
    entityId: eventId,
    request: ctx.request,
  });
  const result = await ctx.runtime.db.query<SqlRow>('SELECT * FROM calendar_events WHERE id = $1', [eventId]);
  return json({ event: mapCalendar(result.rows[0] as SqlRow), message: 'Calendar entry saved.' }, 201);
}

export async function updateCalendarEventRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const access = await workspace(ctx);
  const existing = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'calendar_events', ctx.params.id);
  if (!isAdmin(auth) && !hasPermission(auth, 'manage_meetings') && String(existing.created_by) !== auth.user.id) {
    throw new HttpError(403, 'You cannot edit this calendar entry.');
  }
  const body = await jsonBody(ctx, calendarSchema);
  await ctx.runtime.db.query(
    `UPDATE calendar_events SET title = $2, type = $3, starts_at = $4::timestamptz, ends_at = $5::timestamptz,
       location = $6, notes = $7 WHERE id = $1`,
    [ctx.params.id, body.title, body.type, normalizeDateTime(body.startsAt, String(existing.starts_at)), normalizeDateTime(body.endsAt, null), body.location || '', body.notes || ''],
  );
  if (existing.meeting_id) {
    await ctx.runtime.db.query(
      'UPDATE meetings SET title = $2, starts_at = $3::timestamptz, venue = $4 WHERE id = $1',
      [String(existing.meeting_id), body.title, normalizeDateTime(body.startsAt, String(existing.starts_at)), body.location || ''],
    );
  }
  const result = await ctx.runtime.db.query<SqlRow>('SELECT * FROM calendar_events WHERE id = $1', [ctx.params.id]);
  return json({ event: mapCalendar(result.rows[0] as SqlRow), message: 'Calendar entry updated.' });
}

export async function deleteCalendarEventRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const access = await workspace(ctx);
  const existing = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'calendar_events', ctx.params.id);
  if (existing.meeting_id) throw new HttpError(400, 'Linked meeting entries must be changed in the meeting record.');
  if (!isAdmin(auth) && !hasPermission(auth, 'manage_meetings') && String(existing.created_by) !== auth.user.id) {
    throw new HttpError(403, 'You cannot delete this calendar entry.');
  }
  await ctx.runtime.db.query('DELETE FROM calendar_events WHERE id = $1', [ctx.params.id]);
  return json({ ok: true, message: 'Calendar entry deleted.' });
}

export async function uploadAttachmentRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const { form, fields } = await formBody(ctx);
  const entityType = String(fields.entityType || '') as Attachment['entity_type'];
  const entityId = String(fields.entityId || '');
  const organizationId = String(fields.organizationId || '');
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'Choose a file to upload.');
  if (!['help_request', 'document', 'task', 'correspondence', 'meeting', 'document_submission'].includes(entityType)) throw new HttpError(400, 'Unsupported attachment target.');
  const access = await workspace(ctx);
  if (organizationId !== access.organization.id) throw new HttpError(403, 'The selected workspace is not authorized.');
  const entityOrg = await entityOrganizationId(ctx.runtime.db, entityType, entityId);
  if (!entityOrg || entityOrg !== access.organization.id) throw new HttpError(404, 'The related record was not found.');
  if (entityType === 'help_request') {
    const row = await ctx.runtime.db.query<SqlRow>('SELECT requester_id, assigned_to FROM help_requests WHERE id = $1', [entityId]);
    const allowed = row.rows[0] && (String(row.rows[0].requester_id) === auth.user.id || String(row.rows[0].assigned_to || '') === auth.user.id || hasPermission(auth, 'manage_help'));
    if (!allowed) throw new HttpError(403, 'You cannot attach a file to this request.');
  } else if (!isAdmin(auth) && !hasPermission(auth, 'manage_documents') && !hasPermission(auth, 'manage_meetings')) {
    throw new HttpError(403, 'Your role cannot upload this attachment.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const attachment = await saveAttachment(ctx.runtime, {
    organizationId: access.organization.id,
    entityType,
    entityId,
    fileName: file.name,
    mimeType: file.type,
    bytes,
    uploadedBy: auth.user.id,
  });
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'attachment.uploaded',
    entityType,
    entityId,
    metadata: { attachmentId: attachment.id, fileName: attachment.file_name },
    request: ctx.request,
  });
  return json({ attachment, message: 'Attachment saved to private storage.' }, 201);
}

export async function listAttachmentsRoute(ctx: ApiContext): Promise<Response> {
  const access = await workspace(ctx);
  const entityType = ctx.url.searchParams.get('entityType') || '';
  const entityId = ctx.url.searchParams.get('entityId') || '';
  if (!['help_request', 'document', 'task', 'correspondence', 'meeting', 'document_submission'].includes(entityType) || !entityId) {
    throw new HttpError(400, 'A valid attachment target is required.');
  }
  const attachments = await listAttachments(ctx.runtime.db, access.organization.id, entityType, entityId);
  return json({ attachments });
}

export async function downloadAttachmentRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const result = await ctx.runtime.db.query<SqlRow>('SELECT * FROM attachments WHERE id = $1', [ctx.params.id]);
  const row = result.rows[0];
  if (!row) throw new HttpError(404, 'Attachment not found.');
  const access = await workspace(ctx, { requireRecords: false });
  if (String(row.organization_id) !== access.organization.id) throw new HttpError(404, 'Attachment not found.');
  if (String(row.uploaded_by) !== auth.user.id && access.isConsolidatedViewer) throw new HttpError(403, 'This membership cannot download school attachments.');
  if (String(row.entity_type) === 'document_submission') {
    const submission = await ctx.runtime.db.query<SqlRow>(
      'SELECT sender_id, recipient_id FROM document_submissions WHERE id = $1 AND organization_id = $2',
      [String(row.entity_id), String(row.organization_id)],
    );
    const record = submission.rows[0];
    const allowed = record && (
      isAdmin(auth)
      || String(record.sender_id) === auth.user.id
      || String(record.recipient_id || '') === auth.user.id
    );
    if (!allowed) throw new HttpError(403, 'This document submission is private to its sender and recipient.');
  }
  const bytes = await getAttachmentBytes(ctx.runtime, row);
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: String(row.organization_id),
    action: 'attachment.downloaded',
    entityType: 'attachment',
    entityId: ctx.params.id,
    request: ctx.request,
  });
  return new Response(bytes as BodyInit, {
    headers: {
      'Content-Type': String(row.mime_type || 'application/octet-stream'),
      'Content-Disposition': `attachment; filename="${safeFileName(String(row.file_name))}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

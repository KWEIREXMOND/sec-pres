import { z } from 'zod';
import type { BriefingContent, BriefingPack, Report, ReportContent } from '@/lib/shared-types';
import { logAudit } from '../audit';
import type { ApiContext } from '../context';
import { assertEntityInWorkspace, broadcastWorkspaceRefresh, jsonBody, parseJsonColumn, user, workspace } from '../context';
import { getConsolidatedOrganizationIds } from '../permissions';
import type { SqlRow } from '../db';
import { assertPermission } from '../permissions';
import { buildBriefingContent, buildConsolidatedRows, buildReportContent, reportTypeLabel } from '../records';
import { buildPdf, pdfResponse, rowsToTable, type PdfSection } from '../pdf';
import { HttpError, id, json, safeFileName } from '../utils';
import { briefingCreateSchema, dateOnly, reportCreateSchema, reportTypeEnum, reportUpdateSchema } from '../validation';

const overviewSchema = z.object({
  reportType: reportTypeEnum,
  periodStart: dateOnly,
  periodEnd: dateOnly,
});

const briefingOverviewSchema = z.object({ periodStart: dateOnly, periodEnd: dateOnly });
const consolidatedSchema = z.object({ periodStart: dateOnly, periodEnd: dateOnly });

function emptyReportContent(title: string): ReportContent {
  return {
    title,
    executive_summary: '',
    metrics: [],
    sections: [],
    limitations: '',
    source_record_count: 0,
  };
}

function emptyBriefingContent(title: string): BriefingContent {
  return {
    title,
    overview: '',
    key_messages: [],
    meetings: [],
    tasks: [],
    approvals: [],
    calendar: [],
    help_requests: [],
    source_record_count: 0,
  };
}

function mapReport(row: SqlRow): Report {
  const content = parseJsonColumn<ReportContent>(row.content, emptyReportContent(String(row.title || 'Report')));
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    report_type: String(row.report_type),
    title: String(row.title),
    period_start: String(row.period_start).slice(0, 10),
    period_end: String(row.period_end).slice(0, 10),
    status: String(row.status) as Report['status'],
    content,
    generated_by: String(row.generated_by),
    finalized_at: row.finalized_at ? String(row.finalized_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    author_name: row.author_name ? String(row.author_name) : undefined,
  };
}

function mapBriefing(row: SqlRow): BriefingPack {
  const content = parseJsonColumn<BriefingContent>(row.content, emptyBriefingContent(String(row.title || 'Briefing Pack')));
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    title: String(row.title),
    period_start: String(row.period_start).slice(0, 10),
    period_end: String(row.period_end).slice(0, 10),
    content,
    compiled_by: String(row.compiled_by),
    created_at: String(row.created_at),
    author_name: row.author_name ? String(row.author_name) : undefined,
  };
}

function validatePeriod(start: string, end: string): void {
  if (new Date(end).getTime() < new Date(start).getTime()) {
    throw new HttpError(400, 'The period end must be on or after the period start.');
  }
}

function overviewParams(ctx: ApiContext, schema: z.ZodTypeAny): z.infer<typeof schema> {
  const result = schema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
  if (!result.success) throw new HttpError(400, 'Choose a valid report type and period.', result.error.flatten());
  return result.data;
}

export async function reportOverviewRoute(ctx: ApiContext): Promise<Response> {
  const access = await workspace(ctx);
  const query = overviewParams(ctx, overviewSchema) as z.infer<typeof overviewSchema>;
  validatePeriod(query.periodStart, query.periodEnd);
  const content = await buildReportContent(ctx.runtime.db, access.organization, query.reportType, query.periodStart, query.periodEnd);
  return json({ reportType: query.reportType, reportTypeLabel: reportTypeLabel(query.reportType), periodStart: query.periodStart, periodEnd: query.periodEnd, content });
}

export async function listReportsRoute(ctx: ApiContext): Promise<Response> {
  const access = await workspace(ctx);
  const status = ctx.url.searchParams.get('status') || '';
  const params: unknown[] = [access.organization.id];
  let condition = '';
  if (status) {
    params.push(status);
    condition = ` AND r.status = $${params.length}`;
  }
  params.push(200);
  const result = await ctx.runtime.db.query<SqlRow>(
    `SELECT r.*, u.name AS author_name FROM reports r JOIN users u ON u.id = r.generated_by
     WHERE r.organization_id = $1${condition} ORDER BY r.created_at DESC LIMIT $${params.length}`,
    params,
  );
  return json({ reports: result.rows.map(mapReport) });
}

export async function createReportRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  assertPermission(auth, 'compile_reports');
  const body = await jsonBody(ctx, reportCreateSchema);
  const access = await workspace(ctx);
  if (body.organizationId !== access.organization.id) throw new HttpError(403, 'The selected workspace is not authorized.');
  validatePeriod(body.periodStart, body.periodEnd);
  const content = await buildReportContent(ctx.runtime.db, access.organization, body.reportType, body.periodStart, body.periodEnd);
  if (body.title) content.title = body.title;
  if (body.executiveSummary !== undefined) content.executive_summary = body.executiveSummary;
  const reportId = id('report');
  await ctx.runtime.db.query(
    `INSERT INTO reports
      (id, organization_id, report_type, title, period_start, period_end, status, content, generated_by, finalized_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::date, $6::date, 'draft', $7::jsonb, $8, NULL, NOW(), NOW())`,
    [reportId, access.organization.id, body.reportType, content.title, body.periodStart, body.periodEnd, JSON.stringify(content), auth.user.id],
  );
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'report.compiled',
    entityType: 'report',
    entityId: reportId,
    metadata: { reportType: body.reportType, sourceRecordCount: content.source_record_count },
    request: ctx.request,
  });
  const result = await ctx.runtime.db.query<SqlRow>('SELECT * FROM reports WHERE id = $1', [reportId]);
  return json({ report: mapReport(result.rows[0] as SqlRow), message: `Draft report built from ${content.source_record_count} saved records.` }, 201);
}

export async function getReportRoute(ctx: ApiContext): Promise<Response> {
  const access = await workspace(ctx);
  const row = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'reports', ctx.params.id);
  return json({ report: mapReport(row) });
}

export async function updateReportRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  assertPermission(auth, 'compile_reports');
  const access = await workspace(ctx);
  const row = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'reports', ctx.params.id);
  if (String(row.status) === 'final') throw new HttpError(400, 'A finalized report is read-only. Create a new draft to make changes.');
  const body = await jsonBody(ctx, reportUpdateSchema);
  const report = mapReport(row);
  const content = report.content;
  if (body.title !== undefined) {
    content.title = body.title;
    report.title = body.title;
  }
  if (body.executiveSummary !== undefined) content.executive_summary = body.executiveSummary;
  if (body.limitations !== undefined) content.limitations = body.limitations;
  if (body.sections !== undefined) content.sections = body.sections;
  const status = body.status || 'draft';
  await ctx.runtime.db.query(
    `UPDATE reports SET title = $2, content = $3::jsonb, status = $4,
       finalized_at = CASE WHEN $4 = 'final' THEN NOW() ELSE NULL END
     WHERE id = $1`,
    [ctx.params.id, content.title, JSON.stringify(content), status],
  );
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: status === 'final' ? 'report.finalized' : 'report.edited',
    entityType: 'report',
    entityId: ctx.params.id,
    request: ctx.request,
  });
  const result = await ctx.runtime.db.query<SqlRow>('SELECT * FROM reports WHERE id = $1', [ctx.params.id]);
  return json({ report: mapReport(result.rows[0] as SqlRow), message: status === 'final' ? 'Report finalized.' : 'Draft report saved.' });
}

export async function finalizeReportRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  assertPermission(auth, 'compile_reports');
  const access = await workspace(ctx);
  await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'reports', ctx.params.id);
  await ctx.runtime.db.query("UPDATE reports SET status = 'final', finalized_at = NOW() WHERE id = $1", [ctx.params.id]);
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'report.finalized',
    entityType: 'report',
    entityId: ctx.params.id,
    request: ctx.request,
  });
  const result = await ctx.runtime.db.query<SqlRow>('SELECT * FROM reports WHERE id = $1', [ctx.params.id]);
  return json({ report: mapReport(result.rows[0] as SqlRow), message: 'Report finalized and locked for editing.' });
}

function reportPdfSections(content: ReportContent): PdfSection[] {
  const sections: PdfSection[] = [
    {
      title: 'Verified metrics',
      lines: content.metrics.map((metric) => `${metric.label}: ${metric.value}${metric.hint ? ` — ${metric.hint}` : ''}`),
    },
  ];
  for (const section of content.sections) {
    sections.push({
      title: section.title,
      paragraphs: [section.summary],
      table: rowsToTable(section.columns, section.records.slice(0, 40)),
    });
  }
  sections.push({ title: 'Scope and limitations', paragraphs: [content.limitations] });
  return sections;
}

export async function reportPdfRoute(ctx: ApiContext): Promise<Response> {
  const access = await workspace(ctx);
  const row = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'reports', ctx.params.id);
  const report = mapReport(row);
  const buffer = await buildPdf({
    title: report.content.title || report.title,
    organizationName: access.organization.letterhead_name || access.organization.name,
    reference: report.id,
    subtitle: `${reportTypeLabel(report.report_type)} • ${report.period_start} to ${report.period_end} • ${report.status}`,
    body: report.content.executive_summary,
    sections: reportPdfSections(report.content),
    footerNote: `Compiled from ${report.content.source_record_count} saved database records.`,
  });
  await logAudit(ctx.runtime.db, {
    actorId: user(ctx).user.id,
    organizationId: access.organization.id,
    action: 'report.pdf_downloaded',
    entityType: 'report',
    entityId: ctx.params.id,
    request: ctx.request,
  });
  return pdfResponse(buffer, `${safeFileName(report.title)}.pdf`);
}

export async function consolidatedReportsRoute(ctx: ApiContext): Promise<Response> {
  const access = await workspace(ctx, { requireRecords: false });
  const query = overviewParams(ctx, consolidatedSchema) as z.infer<typeof consolidatedSchema>;
  validatePeriod(query.periodStart, query.periodEnd);
  const organizationIds = await getConsolidatedOrganizationIds(ctx.runtime.db, user(ctx), access.organization.id);
  const rows = await buildConsolidatedRows(ctx.runtime.db, organizationIds, query.periodStart, query.periodEnd);
  return json({
    periodStart: query.periodStart,
    periodEnd: query.periodEnd,
    rows,
    notice: 'This view contains aggregate counts only. Confidential school-level records are not exposed.',
  });
}

export async function briefingOverviewRoute(ctx: ApiContext): Promise<Response> {
  const access = await workspace(ctx);
  const query = overviewParams(ctx, briefingOverviewSchema) as z.infer<typeof briefingOverviewSchema>;
  validatePeriod(query.periodStart, query.periodEnd);
  const content = await buildBriefingContent(ctx.runtime.db, access.organization, query.periodStart, query.periodEnd);
  return json({ periodStart: query.periodStart, periodEnd: query.periodEnd, content });
}

export async function listBriefingsRoute(ctx: ApiContext): Promise<Response> {
  const access = await workspace(ctx);
  const result = await ctx.runtime.db.query<SqlRow>(
    `SELECT b.*, u.name AS author_name FROM briefing_packs b JOIN users u ON u.id = b.compiled_by
     WHERE b.organization_id = $1 ORDER BY b.created_at DESC LIMIT 100`,
    [access.organization.id],
  );
  return json({ briefings: result.rows.map(mapBriefing) });
}

export async function createBriefingRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  assertPermission(auth, 'view_briefings');
  const body = await jsonBody(ctx, briefingCreateSchema);
  const access = await workspace(ctx);
  if (body.organizationId !== access.organization.id) throw new HttpError(403, 'The selected workspace is not authorized.');
  validatePeriod(body.periodStart, body.periodEnd);
  const content = await buildBriefingContent(ctx.runtime.db, access.organization, body.periodStart, body.periodEnd);
  if (body.title) content.title = body.title;
  const briefingId = id('briefing');
  await ctx.runtime.db.query(
    `INSERT INTO briefing_packs
      (id, organization_id, title, period_start, period_end, content, compiled_by, created_at)
     VALUES ($1, $2, $3, $4::date, $5::date, $6::jsonb, $7, NOW())`,
    [briefingId, access.organization.id, content.title, body.periodStart, body.periodEnd, JSON.stringify(content), auth.user.id],
  );
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'briefing.compiled',
    entityType: 'briefing_pack',
    entityId: briefingId,
    metadata: { sourceRecordCount: content.source_record_count },
    request: ctx.request,
  });
  const result = await ctx.runtime.db.query<SqlRow>('SELECT * FROM briefing_packs WHERE id = $1', [briefingId]);
  return json({ briefing: mapBriefing(result.rows[0] as SqlRow), message: `Briefing pack compiled from ${content.source_record_count} saved records.` }, 201);
}

export async function getBriefingRoute(ctx: ApiContext): Promise<Response> {
  const access = await workspace(ctx);
  const row = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'briefing_packs', ctx.params.id);
  return json({ briefing: mapBriefing(row) });
}

function briefingPdfSections(content: BriefingContent): PdfSection[] {
  const generic = (title: string, summary: string, records: Array<Record<string, string | number | null>>): PdfSection => {
    const columns = Array.from(new Set(records.flatMap((record) => Object.keys(record)))).slice(0, 6);
    return {
      title,
      paragraphs: [summary],
      table: rowsToTable(columns.map((key) => ({ key, label: key.replaceAll('_', ' ') })), records.slice(0, 40)),
    };
  };
  return [
    { title: 'Key messages', lines: content.key_messages },
    generic('Meetings', 'Saved meetings in the briefing period.', content.meetings),
    generic('Tasks and deadlines', 'Saved tasks with responsible persons and deadlines.', content.tasks),
    generic('Approvals', 'Saved document approval records and pending reviews.', content.approvals),
    generic('Calendar', 'Saved calendar entries for forward planning.', content.calendar),
    generic('HELP requests', 'Saved presidential assistance requests.', content.help_requests),
  ];
}

export async function briefingPdfRoute(ctx: ApiContext): Promise<Response> {
  const access = await workspace(ctx);
  const row = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'briefing_packs', ctx.params.id);
  const briefing = mapBriefing(row);
  const buffer = await buildPdf({
    title: briefing.content.title,
    organizationName: access.organization.letterhead_name || access.organization.name,
    reference: briefing.id,
    subtitle: `Presidential briefing pack • ${briefing.period_start} to ${briefing.period_end}`,
    body: briefing.content.overview,
    sections: briefingPdfSections(briefing.content),
    footerNote: `Compiled from ${briefing.content.source_record_count} saved records. No narrative is written by an external content service.`,
  });
  await logAudit(ctx.runtime.db, {
    actorId: user(ctx).user.id,
    organizationId: access.organization.id,
    action: 'briefing.pdf_downloaded',
    entityType: 'briefing_pack',
    entityId: ctx.params.id,
    request: ctx.request,
  });
  return pdfResponse(buffer, `${safeFileName(briefing.title)}.pdf`);
}

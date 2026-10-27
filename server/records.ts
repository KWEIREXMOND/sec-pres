import type { BriefingContent, ConsolidatedReportRow, Organization, ReportContent, ReportSection } from '@/lib/shared-types';
import type { Database, SqlRow } from './db';
import { placeholders } from './db';
import { toDateInput } from './utils';

type Cell = string | number | null;

interface QueryWindow {
  start: string;
  end: string;
  orgId: string;
}

const REPORT_TYPES: Record<string, string> = {
  monthly: 'Monthly Secretarial Report',
  termly: 'Termly Activity Report',
  annual: 'Annual Activity Report',
  meeting_attendance: 'Meeting Attendance Report',
  outstanding_tasks: 'Outstanding Task Report',
  correspondence_register: 'Correspondence Register',
  help_summary: 'HELP Request Summary',
  executive_decisions: 'Executive Decision Report',
  handover: 'End-of-Tenure Handover Report',
};

export function reportTypeLabel(type: string): string {
  return REPORT_TYPES[type] || type.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function cell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function dateCell(value: unknown): Cell {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function dateTimeCell(value: unknown): Cell {
  if (!value) return null;
  return String(value).replace('T', ' ').slice(0, 16);
}

async function count(db: Database, sql: string, params: unknown[]): Promise<number> {
  const result = await db.query<{ count: number | string }>(sql, params);
  return Number(result.rows[0]?.count ?? 0);
}

async function rows(db: Database, sql: string, params: unknown[]): Promise<SqlRow[]> {
  const result = await db.query<SqlRow>(sql, params);
  return result.rows;
}

function section(
  key: string,
  title: string,
  summary: string,
  columns: Array<{ key: string; label: string }>,
  data: SqlRow[],
  mapper: (row: SqlRow) => Record<string, Cell>,
): ReportSection {
  return {
    key,
    title,
    summary,
    columns,
    records: data.map(mapper),
  };
}

export function renderTemplate(
  body: string,
  values: Record<string, string | number | null | undefined>,
  organization: Organization,
): string {
  const now = new Date();
  const merged: Record<string, string> = {
    letterhead: organization.letterhead_name || organization.name.toUpperCase(),
    organization: organization.name,
    address: organization.address,
    phone: organization.phone,
    email: organization.email,
    motto: organization.motto,
    date: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(now),
    time: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(now),
    period: `${toDateInput(now)}`,
    signatory: '',
    position: '',
  };
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined) merged[key] = String(value);
  }
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => merged[key] ?? '');
}

export function templateVariables(body: string): string[] {
  return Array.from(new Set(Array.from(body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g), (match) => match[1] || ''))).filter(Boolean);
}

async function getMeetings(db: Database, window: QueryWindow, limit = 50): Promise<SqlRow[]> {
  return rows(
    db,
    `SELECT id, title, meeting_type, status, starts_at, venue, chairperson, minutes_status
     FROM meetings
     WHERE organization_id = $1 AND starts_at::date BETWEEN $2::date AND $3::date
     ORDER BY starts_at ASC LIMIT $4`,
    [window.orgId, window.start, window.end, limit],
  );
}

async function getAttendance(db: Database, window: QueryWindow, limit = 100): Promise<SqlRow[]> {
  return rows(
    db,
    `SELECT m.title AS meeting_title, m.starts_at, u.name AS member_name, ma.rsvp_status, ma.attendance,
            ma.check_in_at, s.name AS recorded_by_name, ma.signed_in_note
     FROM meeting_attendees ma
     JOIN meetings m ON m.id = ma.meeting_id
     JOIN users u ON u.id = ma.user_id
     LEFT JOIN users s ON s.id = ma.signed_in_by
     WHERE m.organization_id = $1 AND m.starts_at::date BETWEEN $2::date AND $3::date
     ORDER BY m.starts_at, u.name LIMIT $4`,
    [window.orgId, window.start, window.end, limit],
  );
}

async function getTasks(db: Database, window: QueryWindow, outstandingOnly = false, limit = 80): Promise<SqlRow[]> {
  return rows(
    db,
    `SELECT t.id, t.title, t.status, t.priority, t.progress, t.due_date,
            u.name AS assignee_name, m.title AS meeting_title
     FROM tasks t
     JOIN users u ON u.id = t.assigned_to
     LEFT JOIN meetings m ON m.id = t.meeting_id
     WHERE t.organization_id = $1
       AND (t.due_date::date BETWEEN $2::date AND $3::date OR t.created_at::date BETWEEN $2::date AND $3::date)
       ${outstandingOnly ? "AND t.status <> 'completed'" : ''}
     ORDER BY t.due_date ASC LIMIT $4`,
    [window.orgId, window.start, window.end, limit],
  );
}

async function getResolutions(db: Database, window: QueryWindow, limit = 80): Promise<SqlRow[]> {
  return rows(
    db,
    `SELECT reference, title, status, due_date, moved_by, seconded_by, created_at
     FROM resolutions
     WHERE organization_id = $1 AND created_at::date BETWEEN $2::date AND $3::date
     ORDER BY created_at DESC LIMIT $4`,
    [window.orgId, window.start, window.end, limit],
  );
}

async function getCorrespondence(db: Database, window: QueryWindow, limit = 80): Promise<SqlRow[]> {
  return rows(
    db,
    `SELECT reference, direction, subject, sender, recipient, status, received_at, follow_up_at
     FROM correspondence
     WHERE organization_id = $1 AND received_at::date BETWEEN $2::date AND $3::date
     ORDER BY received_at DESC LIMIT $4`,
    [window.orgId, window.start, window.end, limit],
  );
}

async function getHelp(db: Database, window: QueryWindow, limit = 80): Promise<SqlRow[]> {
  return rows(
    db,
    `SELECT h.reference, h.subject, h.priority, h.status, h.submitted_at, h.acknowledged_at,
            h.resolved_at, requester.name AS requester_name, assignee.name AS assignee_name
     FROM help_requests h
     JOIN users requester ON requester.id = h.requester_id
     LEFT JOIN users assignee ON assignee.id = h.assigned_to
     WHERE h.organization_id = $1 AND h.submitted_at::date BETWEEN $2::date AND $3::date
     ORDER BY h.submitted_at DESC LIMIT $4`,
    [window.orgId, window.start, window.end, limit],
  );
}

async function getDocuments(db: Database, window: QueryWindow, limit = 80): Promise<SqlRow[]> {
  return rows(
    db,
    `SELECT d.reference, d.title, d.kind, d.status, d.category, d.updated_at, reviewer.name AS reviewer_name
     FROM documents d
     LEFT JOIN users reviewer ON reviewer.id = d.reviewed_by
     WHERE d.organization_id = $1 AND d.updated_at::date BETWEEN $2::date AND $3::date
     ORDER BY d.updated_at DESC LIMIT $4`,
    [window.orgId, window.start, window.end, limit],
  );
}

async function getApprovals(db: Database, window: QueryWindow, limit = 80): Promise<SqlRow[]> {
  return rows(
    db,
    `SELECT d.title, d.reference, dr.decision, dr.comment, dr.created_at, u.name AS reviewer_name
     FROM document_reviews dr
     JOIN documents d ON d.id = dr.document_id
     JOIN users u ON u.id = dr.reviewer_id
     WHERE dr.organization_id = $1 AND dr.created_at::date BETWEEN $2::date AND $3::date
     ORDER BY dr.created_at DESC LIMIT $4`,
    [window.orgId, window.start, window.end, limit],
  );
}

async function getAnnouncements(db: Database, window: QueryWindow, limit = 50): Promise<SqlRow[]> {
  return rows(
    db,
    `SELECT a.title, a.audience, a.created_at, u.name AS author_name
     FROM announcements a JOIN users u ON u.id = a.author_id
     WHERE a.organization_id = $1 AND a.created_at::date BETWEEN $2::date AND $3::date
     ORDER BY a.created_at DESC LIMIT $4`,
    [window.orgId, window.start, window.end, limit],
  );
}

function meetingSection(data: SqlRow[]): ReportSection {
  return section(
    'meetings',
    'Meetings and minutes',
    'Meetings saved in the selected workspace and period.',
    [
      { key: 'date', label: 'Date' },
      { key: 'title', label: 'Meeting' },
      { key: 'venue', label: 'Venue' },
      { key: 'status', label: 'Status' },
      { key: 'minutes_status', label: 'Minutes' },
    ],
    data,
    (row) => ({
      date: dateTimeCell(row.starts_at),
      title: cell(row.title),
      venue: cell(row.venue),
      status: cell(row.status),
      minutes_status: cell(row.minutes_status),
    }),
  );
}

function attendanceSection(data: SqlRow[]): ReportSection {
  return section(
    'attendance',
    'Attendance and apologies',
    'Attendance records captured for each saved meeting.',
    [
      { key: 'meeting', label: 'Meeting' },
      { key: 'member', label: 'Member' },
      { key: 'rsvp', label: 'RSVP' },
      { key: 'attendance', label: 'Attendance' },
      { key: 'check_in', label: 'Signed in' },
      { key: 'recorded_by', label: 'Recorded by' },
      { key: 'note', label: 'Note' },
    ],
    data,
    (row) => ({
      meeting: cell(row.meeting_title),
      member: cell(row.member_name),
      rsvp: cell(row.rsvp_status),
      attendance: cell(row.attendance),
      check_in: cell(row.check_in_at),
      recorded_by: cell(row.recorded_by_name),
      note: cell(row.signed_in_note),
    }),
  );
}

function taskSection(data: SqlRow[], title = 'Tasks and action items'): ReportSection {
  return section(
    'tasks',
    title,
    'Action items recorded with responsible persons, status and deadlines.',
    [
      { key: 'title', label: 'Task' },
      { key: 'assignee', label: 'Assigned to' },
      { key: 'status', label: 'Status' },
      { key: 'priority', label: 'Priority' },
      { key: 'due', label: 'Due' },
    ],
    data,
    (row) => ({
      title: cell(row.title),
      assignee: cell(row.assignee_name),
      status: cell(row.status),
      priority: cell(row.priority),
      due: dateCell(row.due_date),
      progress: cell(row.progress),
    }),
  );
}

function resolutionSection(data: SqlRow[]): ReportSection {
  return section(
    'decisions',
    'Executive decisions and resolutions',
    'Resolutions recorded using the standard meeting resolution form.',
    [
      { key: 'reference', label: 'Ref.' },
      { key: 'title', label: 'Resolution' },
      { key: 'status', label: 'Status' },
      { key: 'due', label: 'Due' },
    ],
    data,
    (row) => ({
      reference: cell(row.reference),
      title: cell(row.title),
      status: cell(row.status),
      due: dateCell(row.due_date),
    }),
  );
}

function correspondenceSection(data: SqlRow[]): ReportSection {
  return section(
    'correspondence',
    'Official correspondence',
    'Incoming and outgoing entries from the correspondence register.',
    [
      { key: 'reference', label: 'Ref.' },
      { key: 'direction', label: 'Direction' },
      { key: 'subject', label: 'Subject' },
      { key: 'status', label: 'Status' },
      { key: 'date', label: 'Date' },
    ],
    data,
    (row) => ({
      reference: cell(row.reference),
      direction: cell(row.direction),
      subject: cell(row.subject),
      status: cell(row.status),
      date: dateCell(row.received_at),
    }),
  );
}

function helpSection(data: SqlRow[]): ReportSection {
  return section(
    'help',
    'HELP requests',
    'Presidential assistance requests with acknowledgement and resolution timestamps.',
    [
      { key: 'reference', label: 'Ref.' },
      { key: 'subject', label: 'Subject' },
      { key: 'priority', label: 'Priority' },
      { key: 'status', label: 'Status' },
      { key: 'submitted', label: 'Submitted' },
    ],
    data,
    (row) => ({
      reference: cell(row.reference),
      subject: cell(row.subject),
      priority: cell(row.priority),
      status: cell(row.status),
      submitted: dateTimeCell(row.submitted_at),
      acknowledged: dateTimeCell(row.acknowledged_at),
      resolved: dateTimeCell(row.resolved_at),
    }),
  );
}

function documentSection(data: SqlRow[]): ReportSection {
  return section(
    'documents',
    'Documents and approvals',
    'Documents saved in the repository with their current workflow status.',
    [
      { key: 'reference', label: 'Ref.' },
      { key: 'title', label: 'Document' },
      { key: 'kind', label: 'Type' },
      { key: 'status', label: 'Status' },
      { key: 'updated', label: 'Updated' },
    ],
    data,
    (row) => ({
      reference: cell(row.reference),
      title: cell(row.title),
      kind: cell(row.kind),
      status: cell(row.status),
      updated: dateCell(row.updated_at),
      reviewer: cell(row.reviewer_name),
    }),
  );
}

function approvalSection(data: SqlRow[]): ReportSection {
  return section(
    'approval_history',
    'Presidential approval history',
    'Reviewer, decision, comment and timestamp recorded for each document decision.',
    [
      { key: 'document', label: 'Document' },
      { key: 'decision', label: 'Decision' },
      { key: 'reviewer', label: 'Reviewer' },
      { key: 'date', label: 'Date' },
    ],
    data,
    (row) => ({
      document: cell(row.title),
      decision: cell(row.decision),
      reviewer: cell(row.reviewer_name),
      comment: cell(row.comment),
      date: dateTimeCell(row.created_at),
    }),
  );
}

function announcementSection(data: SqlRow[]): ReportSection {
  return section(
    'announcements',
    'Executive announcements',
    'Announcements published to the workspace during the period.',
    [
      { key: 'title', label: 'Title' },
      { key: 'audience', label: 'Audience' },
      { key: 'author', label: 'Author' },
      { key: 'date', label: 'Date' },
    ],
    data,
    (row) => ({
      title: cell(row.title),
      audience: cell(row.audience),
      author: cell(row.author_name),
      date: dateTimeCell(row.created_at),
    }),
  );
}

export async function buildReportContent(
  db: Database,
  organization: Organization,
  reportType: string,
  periodStart: string,
  periodEnd: string,
): Promise<ReportContent> {
  const window: QueryWindow = { orgId: organization.id, start: periodStart, end: periodEnd };
  const where = [organization.id, periodStart, periodEnd];
  const [
    meetings,
    attendance,
    tasks,
    outstandingTasks,
    resolutions,
    correspondence,
    help,
    documents,
    approvals,
    announcements,
  ] = await Promise.all([
    getMeetings(db, window),
    getAttendance(db, window),
    getTasks(db, window),
    getTasks(db, window, true),
    getResolutions(db, window),
    getCorrespondence(db, window),
    getHelp(db, window),
    getDocuments(db, window),
    getApprovals(db, window),
    getAnnouncements(db, window),
  ]);

  const [meetingCount, completedTasks, overdueTasks, resolvedHelp, approvedDocs, pendingDocs, newHelp] = await Promise.all([
    count(db, 'SELECT COUNT(*)::int AS count FROM meetings WHERE organization_id = $1 AND starts_at::date BETWEEN $2::date AND $3::date', where),
    count(db, "SELECT COUNT(*)::int AS count FROM tasks WHERE organization_id = $1 AND status = 'completed' AND COALESCE(completed_at, updated_at)::date BETWEEN $2::date AND $3::date", where),
    count(db, "SELECT COUNT(*)::int AS count FROM tasks WHERE organization_id = $1 AND status = 'overdue' AND due_date::date <= $2::date", [organization.id, periodEnd]),
    count(db, "SELECT COUNT(*)::int AS count FROM help_requests WHERE organization_id = $1 AND status IN ('resolved','closed') AND COALESCE(resolved_at, closed_at, updated_at)::date BETWEEN $2::date AND $3::date", where),
    count(db, "SELECT COUNT(*)::int AS count FROM documents WHERE organization_id = $1 AND status = 'approved' AND COALESCE(reviewed_at, updated_at)::date BETWEEN $2::date AND $3::date", where),
    count(db, "SELECT COUNT(*)::int AS count FROM documents WHERE organization_id = $1 AND status = 'pending_approval'", [organization.id]),
    count(db, "SELECT COUNT(*)::int AS count FROM help_requests WHERE organization_id = $1 AND status = 'new'", [organization.id]),
  ]);

  const title = `${reportTypeLabel(reportType)} — ${organization.name}`;
  const metrics = [
    { label: 'Meetings', value: meetingCount, hint: 'Saved meetings in period' },
    { label: 'Completed tasks', value: completedTasks, hint: 'Verified completion records' },
    { label: 'Overdue tasks', value: overdueTasks, hint: 'Current overdue status' },
    { label: 'Resolved HELP requests', value: resolvedHelp, hint: 'Resolved or closed in period' },
    { label: 'Approved documents', value: approvedDocs, hint: 'Approval timestamps in period' },
    { label: 'Pending approvals', value: pendingDocs, hint: 'Current queue' },
  ];

  const sectionMap: Record<string, ReportSection[]> = {
    monthly: [meetingSection(meetings), taskSection(tasks), correspondenceSection(correspondence), helpSection(help), documentSection(documents)],
    termly: [meetingSection(meetings), attendanceSection(attendance), resolutionSection(resolutions), taskSection(tasks), correspondenceSection(correspondence), approvalSection(approvals), helpSection(help)],
    annual: [meetingSection(meetings), attendanceSection(attendance), resolutionSection(resolutions), taskSection(tasks), correspondenceSection(correspondence), documentSection(documents), approvalSection(approvals), helpSection(help), announcementSection(announcements)],
    meeting_attendance: [meetingSection(meetings), attendanceSection(attendance)],
    outstanding_tasks: [taskSection(outstandingTasks, 'Outstanding tasks and deadlines'), resolutionSection(resolutions)],
    correspondence_register: [correspondenceSection(correspondence), documentSection(documents)],
    help_summary: [helpSection(help)],
    executive_decisions: [resolutionSection(resolutions), taskSection(tasks), approvalSection(approvals)],
    handover: [meetingSection(meetings), resolutionSection(resolutions), taskSection(outstandingTasks, 'Outstanding handover actions'), correspondenceSection(correspondence), documentSection(documents), helpSection(help)],
  };
  const sections = sectionMap[reportType] || sectionMap.monthly;
  const sourceRecordCount = sections.reduce((total, item) => total + item.records.length, 0);

  return {
    title,
    executive_summary: `${organization.name} recorded ${meetingCount} meeting(s), ${completedTasks} completed task(s), ${resolvedHelp} resolved HELP request(s) and ${approvedDocs} approved document(s) in the selected period. ${newHelp} request(s) are currently awaiting acknowledgement. This report is compiled directly from saved database records and can be edited before finalization.`,
    metrics,
    sections,
    limitations: 'Only records belonging to this organization and period are included. Confidential contact details and attachments are not reproduced in reports. External delivery results are available in the notification delivery log.',
    source_record_count: sourceRecordCount,
  };
}

function briefingRecords(rows: SqlRow[], mapper: (row: SqlRow) => Record<string, Cell>): Array<Record<string, Cell>> {
  return rows.map(mapper);
}

export async function buildBriefingContent(
  db: Database,
  organization: Organization,
  periodStart: string,
  periodEnd: string,
): Promise<BriefingContent> {
  const window: QueryWindow = { orgId: organization.id, start: periodStart, end: periodEnd };
  const [meetings, tasks, approvals, help, calendar] = await Promise.all([
    rows(db, `SELECT title, starts_at, venue, status FROM meetings WHERE organization_id = $1 AND starts_at::date BETWEEN $2::date AND $3::date ORDER BY starts_at LIMIT 30`, [organization.id, periodStart, periodEnd]),
    rows(db, `SELECT t.title, u.name AS owner, t.due_date, t.status, t.priority FROM tasks t JOIN users u ON u.id = t.assigned_to WHERE t.organization_id = $1 AND t.due_date::date BETWEEN $2::date AND $3::date ORDER BY t.due_date LIMIT 40`, [organization.id, periodStart, periodEnd]),
    rows(db, `SELECT d.title, d.reference, d.status, COALESCE(d.reviewed_at, d.updated_at) AS decision_at, reviewer.name AS reviewer_name FROM documents d LEFT JOIN users reviewer ON reviewer.id = d.reviewed_by WHERE d.organization_id = $1 AND d.status IN ('pending_approval','approved','revisions_requested','rejected') AND d.updated_at::date BETWEEN $2::date AND $3::date ORDER BY d.updated_at DESC LIMIT 30`, [organization.id, periodStart, periodEnd]),
    rows(db, `SELECT reference, subject, status, priority, submitted_at FROM help_requests WHERE organization_id = $1 AND submitted_at::date BETWEEN $2::date AND $3::date ORDER BY submitted_at DESC LIMIT 30`, [organization.id, periodStart, periodEnd]),
    rows(db, `SELECT title, type, starts_at, location FROM calendar_events WHERE organization_id = $1 AND starts_at::date BETWEEN $2::date AND $3::date ORDER BY starts_at LIMIT 30`, [organization.id, periodStart, periodEnd]),
  ]);

  const pendingApprovals = approvals.filter((row) => row.status === 'pending_approval').length;
  const openTasks = tasks.filter((row) => row.status !== 'completed').length;
  const newHelp = help.filter((row) => row.status === 'new').length;
  const keyMessages = [
    `${pendingApprovals} document(s) require presidential review.`,
    `${openTasks} saved task(s) are not yet completed in this briefing period.`,
    `${newHelp} HELP request(s) are awaiting acknowledgement.`,
    `${calendar.length} calendar entr${calendar.length === 1 ? 'y is' : 'ies are'} included for forward planning.`,
  ];

  return {
    title: `Presidential Briefing Pack — ${organization.name}`,
    overview: `This pack is compiled from ${meetings.length + tasks.length + approvals.length + calendar.length + help.length} saved records for ${periodStart} to ${periodEnd}. It contains no machine-written narrative; all entries are drawn from the meeting, task, approval, HELP and calendar registers.`,
    key_messages: keyMessages,
    meetings: briefingRecords(meetings, (row) => ({ title: cell(row.title), date: dateTimeCell(row.starts_at), venue: cell(row.venue), status: cell(row.status) })),
    tasks: briefingRecords(tasks, (row) => ({ title: cell(row.title), owner: cell(row.owner), due: dateCell(row.due_date), status: cell(row.status), priority: cell(row.priority) })),
    approvals: briefingRecords(approvals, (row) => ({ document: cell(row.title), reference: cell(row.reference), status: cell(row.status), reviewer: cell(row.reviewer_name), date: dateTimeCell(row.decision_at) })),
    calendar: briefingRecords(calendar, (row) => ({ title: cell(row.title), type: cell(row.type), date: dateTimeCell(row.starts_at), location: cell(row.location) })),
    help_requests: briefingRecords(help, (row) => ({ reference: cell(row.reference), subject: cell(row.subject), status: cell(row.status), priority: cell(row.priority), submitted: dateTimeCell(row.submitted_at) })),
    source_record_count: meetings.length + tasks.length + approvals.length + calendar.length + help.length,
  };
}

export async function buildConsolidatedRows(
  db: Database,
  organizationIds: string[],
  periodStart: string,
  periodEnd: string,
): Promise<ConsolidatedReportRow[]> {
  if (organizationIds.length === 0) return [];
  const organizations = await rows(db, `SELECT id, name, type, parent_id FROM organizations WHERE id IN (${placeholders(organizationIds)}) ORDER BY name`, organizationIds);
  return Promise.all(
    organizations.map(async (org): Promise<ConsolidatedReportRow> => {
      const id = String(org.id);
      const params = [id, periodStart, periodEnd];
      const [
        meetingCount,
        completedTaskCount,
        overdueTaskCount,
        newHelpCount,
        resolvedHelpCount,
        approvedDocumentCount,
        pendingDocumentCount,
        correspondenceCount,
      ] = await Promise.all([
        count(db, 'SELECT COUNT(*)::int AS count FROM meetings WHERE organization_id = $1 AND starts_at::date BETWEEN $2::date AND $3::date', params),
        count(db, "SELECT COUNT(*)::int AS count FROM tasks WHERE organization_id = $1 AND status = 'completed' AND COALESCE(completed_at, updated_at)::date BETWEEN $2::date AND $3::date", params),
        count(db, "SELECT COUNT(*)::int AS count FROM tasks WHERE organization_id = $1 AND status = 'overdue'", [id]),
        count(db, "SELECT COUNT(*)::int AS count FROM help_requests WHERE organization_id = $1 AND status = 'new'", [id]),
        count(db, "SELECT COUNT(*)::int AS count FROM help_requests WHERE organization_id = $1 AND status IN ('resolved','closed') AND submitted_at::date BETWEEN $2::date AND $3::date", params),
        count(db, "SELECT COUNT(*)::int AS count FROM documents WHERE organization_id = $1 AND status = 'approved' AND COALESCE(reviewed_at, updated_at)::date BETWEEN $2::date AND $3::date", params),
        count(db, "SELECT COUNT(*)::int AS count FROM documents WHERE organization_id = $1 AND status = 'pending_approval'", [id]),
        count(db, 'SELECT COUNT(*)::int AS count FROM correspondence WHERE organization_id = $1 AND received_at::date BETWEEN $2::date AND $3::date', params),
      ]);
      return {
        organization_id: id,
        organization_name: String(org.name),
        organization_type: String(org.type) as ConsolidatedReportRow['organization_type'],
        parent_id: org.parent_id ? String(org.parent_id) : null,
        meeting_count: meetingCount,
        completed_task_count: completedTaskCount,
        overdue_task_count: overdueTaskCount,
        new_help_count: newHelpCount,
        resolved_help_count: resolvedHelpCount,
        approved_document_count: approvedDocumentCount,
        pending_document_count: pendingDocumentCount,
        correspondence_count: correspondenceCount,
      };
    }),
  );
}

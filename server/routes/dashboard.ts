import type { Announcement, AuditLog, CalendarEvent, DashboardData, DocumentRecord, HelpRequest, Meeting, Notification, Task } from '@/lib/shared-types';
import { logAudit } from '../audit';
import type { ApiContext } from '../context';
import { user, workspace } from '../context';
import { parseJson, type SqlRow } from '../db';
import { dashboardKind, canViewPhone, maskPhone } from '../permissions';
import { notificationFromRow, unreadMessageCount } from '../notifications';
import { json } from '../utils';

function countRow(result: { rows: Array<{ count: number | string }> }): number {
  return Number(result.rows[0]?.count || 0);
}

function mapHelp(row: SqlRow, ctx: ApiContext): HelpRequest {
  const auth = user(ctx);
  const requesterId = String(row.requester_id);
  const assigneeId = row.assigned_to ? String(row.assigned_to) : '';
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    requester_id: requesterId,
    assigned_to: row.assigned_to ? String(row.assigned_to) : null,
    client_request_id: String(row.client_request_id),
    reference: String(row.reference),
    request_type: String(row.request_type),
    subject: String(row.subject),
    description: String(row.description),
    location: String(row.location),
    priority: String(row.priority) as HelpRequest['priority'],
    status: String(row.status) as HelpRequest['status'],
    channel: String(row.channel),
    submitted_at: String(row.submitted_at),
    acknowledged_at: row.acknowledged_at ? String(row.acknowledged_at) : null,
    resolved_at: row.resolved_at ? String(row.resolved_at) : null,
    closed_at: row.closed_at ? String(row.closed_at) : null,
    resolution_note: row.resolution_note ? String(row.resolution_note) : null,
    escalation_level: Number(row.escalation_level || 0),
    last_escalated_at: row.last_escalated_at ? String(row.last_escalated_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    requester_name: String(row.requester_name || ''),
    requester_role: row.requester_role ? (String(row.requester_role) as HelpRequest['requester_role']) : undefined,
    requester_phone: canViewPhone(auth, requesterId) ? String(row.requester_phone || '') : maskPhone(String(row.requester_phone || '')),
    assignee_name: row.assignee_name ? String(row.assignee_name) : undefined,
    assignee_phone: assigneeId && canViewPhone(auth, assigneeId) ? String(row.assignee_phone || '') : maskPhone(String(row.assignee_phone || '')),
  };
}

function mapTask(row: SqlRow): Task {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    meeting_id: row.meeting_id ? String(row.meeting_id) : null,
    resolution_id: row.resolution_id ? String(row.resolution_id) : null,
    title: String(row.title),
    description: String(row.description || ''),
    assigned_to: String(row.assigned_to),
    assigned_by: String(row.assigned_by),
    priority: String(row.priority) as Task['priority'],
    status: String(row.status) as Task['status'],
    progress: Number(row.progress || 0),
    due_date: String(row.due_date),
    completed_at: row.completed_at ? String(row.completed_at) : null,
    completion_note: row.completion_note ? String(row.completion_note) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    assignee_name: String(row.assignee_name || ''),
    assigner_name: String(row.assigner_name || ''),
    meeting_title: row.meeting_title ? String(row.meeting_title) : undefined,
  };
}

function mapMeeting(row: SqlRow): Meeting {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    title: String(row.title),
    meeting_type: String(row.meeting_type) as Meeting['meeting_type'],
    status: String(row.status) as Meeting['status'],
    starts_at: String(row.starts_at),
    ends_at: row.ends_at ? String(row.ends_at) : null,
    venue: String(row.venue || ''),
    chairperson: String(row.chairperson || ''),
    agenda: String(row.agenda || ''),
    discussions: String(row.discussions || ''),
    minutes: String(row.minutes || ''),
    minutes_status: String(row.minutes_status) as Meeting['minutes_status'],
    created_by: String(row.created_by),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

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
    author_name: String(row.author_name || ''),
    reviewer_name: row.reviewer_name ? String(row.reviewer_name) : undefined,
  };
}

function mapAnnouncement(row: SqlRow): Announcement {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    author_id: String(row.author_id),
    title: String(row.title),
    body: String(row.body),
    audience: String(row.audience) as Announcement['audience'],
    is_pinned: Boolean(row.is_pinned),
    created_at: String(row.created_at),
    author_name: String(row.author_name || ''),
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

export async function dashboardRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const access = await workspace(ctx);
  const orgId = access.organization.id;
  const params = [orgId];
  const db = ctx.runtime.db;
  const kind = dashboardKind(auth.user.role);

  const [
    pendingApprovals,
    newHelp,
    acknowledgedHelp,
    inProgressHelp,
    overdueTasks,
    openTasks,
    upcomingMeetings,
    pendingCorrespondence,
    unreadNotifications,
    announcementCount,
  ] = await Promise.all([
    db.query<{ count: number | string }>("SELECT COUNT(*)::int AS count FROM documents WHERE organization_id = $1 AND status = 'pending_approval'", params),
    db.query<{ count: number | string }>("SELECT COUNT(*)::int AS count FROM help_requests WHERE organization_id = $1 AND status = 'new'", params),
    db.query<{ count: number | string }>("SELECT COUNT(*)::int AS count FROM help_requests WHERE organization_id = $1 AND status = 'acknowledged'", params),
    db.query<{ count: number | string }>("SELECT COUNT(*)::int AS count FROM help_requests WHERE organization_id = $1 AND status = 'in_progress'", params),
    db.query<{ count: number | string }>("SELECT COUNT(*)::int AS count FROM tasks WHERE organization_id = $1 AND status = 'overdue'", params),
    db.query<{ count: number | string }>("SELECT COUNT(*)::int AS count FROM tasks WHERE organization_id = $1 AND status <> 'completed'", [orgId]),
    db.query<{ count: number | string }>("SELECT COUNT(*)::int AS count FROM meetings WHERE organization_id = $1 AND starts_at >= NOW() AND status IN ('scheduled','requested')", params),
    db.query<{ count: number | string }>("SELECT COUNT(*)::int AS count FROM correspondence WHERE organization_id = $1 AND status IN ('draft','pending_approval','sent')", params),
    db.query<{ count: number | string }>('SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE', [auth.user.id]),
    db.query<{ count: number | string }>('SELECT COUNT(*)::int AS count FROM announcements WHERE organization_id = $1', params),
  ]);

  const stats: DashboardData['stats'] =
    kind === 'president'
      ? [
          { key: 'approvals', label: 'Pending approvals', value: countRow(pendingApprovals), tone: 'gold', hint: 'Documents awaiting your decision' },
          { key: 'help', label: 'Open HELP requests', value: countRow(newHelp) + countRow(acknowledgedHelp) + countRow(inProgressHelp), tone: 'red', hint: 'Requests not yet resolved' },
          { key: 'tasks', label: 'Active tasks', value: countRow(openTasks), tone: 'navy', hint: 'Saved action items' },
          { key: 'meetings', label: 'Upcoming meetings', value: countRow(upcomingMeetings), tone: 'green', hint: 'Scheduled and requested' },
        ]
      : kind === 'secretary' || kind === 'admin'
        ? [
            { key: 'new_help', label: 'New urgent HELP', value: countRow(newHelp), tone: 'red', hint: 'Awaiting acknowledgement' },
            { key: 'in_progress_help', label: 'HELP in progress', value: countRow(inProgressHelp), tone: 'gold', hint: 'Active assistance' },
            { key: 'overdue', label: 'Overdue tasks', value: countRow(overdueTasks), tone: 'red', hint: 'Deadlines passed' },
            { key: 'pending_docs', label: 'Pending approvals', value: countRow(pendingApprovals), tone: 'navy', hint: 'Submitted documents' },
          ]
        : [
            { key: 'tasks', label: 'Active tasks', value: countRow(openTasks), tone: 'navy', hint: 'Workspace action items' },
            { key: 'meetings', label: 'Upcoming meetings', value: countRow(upcomingMeetings), tone: 'green', hint: 'Scheduled and requested' },
            { key: 'notifications', label: 'Unread notifications', value: countRow(unreadNotifications), tone: 'gold', hint: 'In-app alerts' },
            { key: 'announcements', label: 'Announcements', value: countRow(announcementCount), tone: 'red', hint: 'Latest executive updates' },
          ];

  const helpResult = await db.query<SqlRow>(
    `SELECT h.*, requester.name AS requester_name, requester.role AS requester_role, requester.phone AS requester_phone,
            assignee.name AS assignee_name, assignee.phone AS assignee_phone
     FROM help_requests h
     JOIN users requester ON requester.id = h.requester_id
     LEFT JOIN users assignee ON assignee.id = h.assigned_to
     WHERE h.organization_id = $1
     ORDER BY CASE h.status WHEN 'new' THEN 0 WHEN 'acknowledged' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END,
              CASE h.priority WHEN 'critical' THEN 0 WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
              h.submitted_at DESC
     LIMIT 8`,
    params,
  );

  const approvalsResult = await db.query<SqlRow>(
    `SELECT d.*, author.name AS author_name, reviewer.name AS reviewer_name
     FROM documents d
     JOIN users author ON author.id = d.created_by
     LEFT JOIN users reviewer ON reviewer.id = d.reviewed_by
     WHERE d.organization_id = $1 AND d.status = 'pending_approval'
     ORDER BY d.updated_at DESC LIMIT 8`,
    params,
  );

  const tasksResult = await db.query<SqlRow>(
    `SELECT t.*, u.name AS assignee_name, a.name AS assigner_name, m.title AS meeting_title
     FROM tasks t
     JOIN users u ON u.id = t.assigned_to
     JOIN users a ON a.id = t.assigned_by
     LEFT JOIN meetings m ON m.id = t.meeting_id
     WHERE t.organization_id = $1 AND t.status <> 'completed'
     ORDER BY t.due_date ASC LIMIT 8`,
    params,
  );

  const meetingsResult = await db.query<SqlRow>(
    `SELECT * FROM meetings
     WHERE organization_id = $1 AND starts_at >= NOW() - INTERVAL '1 day' AND status <> 'cancelled'
     ORDER BY starts_at ASC LIMIT 8`,
    params,
  );

  const calendarResult = await db.query<SqlRow>(
    `SELECT * FROM calendar_events
     WHERE organization_id = $1 AND starts_at >= NOW() - INTERVAL '1 day'
     ORDER BY starts_at ASC LIMIT 8`,
    params,
  );

  const announcementsResult = await db.query<SqlRow>(
    `SELECT a.*, u.name AS author_name FROM announcements a
     JOIN users u ON u.id = a.author_id
     WHERE a.organization_id = $1
     ORDER BY a.is_pinned DESC, a.created_at DESC LIMIT 6`,
    params,
  );

  const notificationsResult = await db.query<SqlRow>(
    `SELECT * FROM notifications WHERE user_id = $1 AND (organization_id IS NULL OR organization_id = $2)
     ORDER BY created_at DESC LIMIT 8`,
    [auth.user.id, orgId],
  );

  const activityResult = await db.query<SqlRow>(
    `SELECT a.*, u.name AS actor_name FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.organization_id IS NULL OR a.organization_id = $1
     ORDER BY a.created_at DESC LIMIT 8`,
    params,
  );

  const deadlineTasks = await db.query<SqlRow>(
    `SELECT id, title, due_date FROM tasks
     WHERE organization_id = $1 AND status <> 'completed'
     ORDER BY due_date ASC LIMIT 6`,
    params,
  );
  const deadlineCorrespondence = await db.query<SqlRow>(
    `SELECT id, subject, COALESCE(follow_up_at, response_due_at) AS due_date
     FROM correspondence
     WHERE organization_id = $1 AND COALESCE(follow_up_at, response_due_at) IS NOT NULL AND status <> 'archived'
     ORDER BY due_date ASC LIMIT 6`,
    params,
  );
  const deadlineMeetings = await db.query<SqlRow>(
    `SELECT id, title, starts_at AS due_date FROM meetings
     WHERE organization_id = $1 AND starts_at >= NOW() AND status IN ('scheduled','requested')
     ORDER BY starts_at ASC LIMIT 6`,
    params,
  );

  const deadlines: DashboardData['deadlines'] = [
    ...deadlineTasks.rows.map((row) => ({ id: String(row.id), label: String(row.title), due_date: String(row.due_date), type: 'task' as const, link: '/workspace/tasks' })),
    ...deadlineCorrespondence.rows.map((row) => ({ id: String(row.id), label: String(row.subject), due_date: String(row.due_date), type: 'correspondence' as const, link: '/workspace/correspondence' })),
    ...deadlineMeetings.rows.map((row) => ({ id: String(row.id), label: String(row.title), due_date: String(row.due_date), type: 'meeting' as const, link: `/workspace/meetings/${String(row.id)}` })),
  ]
    .filter((item) => item.due_date)
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
    .slice(0, 8);

  const data: DashboardData = {
    role: auth.user.role,
    organization: access.organization,
    greeting_name: auth.user.name.split(' ')[0] || auth.user.name,
    current_date: new Date().toISOString(),
    stats,
    help_requests: helpResult.rows.map((row) => mapHelp(row, ctx)),
    approvals: approvalsResult.rows.map(mapDocument),
    tasks: tasksResult.rows.map(mapTask),
    meetings: meetingsResult.rows.map(mapMeeting),
    calendar: calendarResult.rows.map((row) => ({
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
    })),
    announcements: announcementsResult.rows.map(mapAnnouncement),
    notifications: notificationsResult.rows.map(notificationFromRow) as Notification[],
    deadlines,
    recent_activity: activityResult.rows.map(mapAudit),
    unread_messages: await unreadMessageCount(db, auth.user.id),
    pending_correspondence: countRow(pendingCorrespondence),
  };

  await logAudit(db, {
    actorId: auth.user.id,
    organizationId: orgId,
    action: 'dashboard.viewed',
    entityType: 'dashboard',
    request: ctx.request,
  });

  return json(data);
}

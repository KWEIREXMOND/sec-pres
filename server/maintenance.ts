import { logAudit } from './audit';
import type { Runtime } from './runtime';
import { notifyUsers, retryPendingDeliveries } from './notifications';
import type { SqlRow } from './db';
import { id, nowIso, toDateInput } from './utils';

export interface MaintenanceSummary {
  overdueTasksMarked: number;
  taskReminders: number;
  meetingReminders: number;
  escalatedHelpRequests: number;
  deliveryRetries: number;
  ranAt: string;
}

async function systemActorId(runtime: Runtime): Promise<string | null> {
  const result = await runtime.db.query<{ id: string }>(
    "SELECT id FROM users WHERE role = 'system_admin' AND is_active = TRUE ORDER BY created_at LIMIT 1",
  );
  return result.rows[0]?.id ? String(result.rows[0].id) : null;
}

async function markOverdueTasks(runtime: Runtime): Promise<{ count: number; rows: SqlRow[] }> {
  const result = await runtime.db.query<SqlRow>(
    `UPDATE tasks
     SET status = 'overdue'
     WHERE due_date < NOW()
       AND status NOT IN ('completed', 'overdue')
     RETURNING id, organization_id, title, assigned_to, due_date`,
  );
  const actorId = await systemActorId(runtime);
  for (const row of result.rows) {
    if (actorId) {
      await runtime.db.query(
        `INSERT INTO task_events (id, task_id, user_id, previous_status, new_status, comment, created_at)
         VALUES ($1, $2, $3, 'pending', 'overdue', 'Deadline passed during scheduled maintenance.', NOW())`,
        [id('taskevent'), String(row.id), actorId],
      );
    }
    await notifyUsers(runtime, {
      userIds: [String(row.assigned_to)],
      organizationId: String(row.organization_id),
      type: 'task_overdue',
      title: 'Task is overdue',
      body: `“${String(row.title)}” passed its deadline.`,
      link: '/workspace/tasks',
      severity: 'warning',
      category: 'task',
      dedupeKey: `task-overdue:${String(row.id)}:${toDateInput(new Date())}`,
      reason: 'task_overdue',
    });
  }
  return { count: result.rows.length, rows: result.rows };
}

async function createTaskReminders(runtime: Runtime): Promise<number> {
  const result = await runtime.db.query<SqlRow>(
    `SELECT id, organization_id, title, assigned_to, due_date
     FROM tasks
     WHERE status NOT IN ('completed', 'overdue')
       AND due_date >= NOW()
       AND due_date <= NOW() + INTERVAL '24 hours'`,
  );
  let sent = 0;
  for (const row of result.rows) {
    const created = await notifyUsers(runtime, {
      userIds: [String(row.assigned_to)],
      organizationId: String(row.organization_id),
      type: 'task_due_soon',
      title: 'Task deadline approaching',
      body: `“${String(row.title)}” is due within 24 hours.`,
      link: '/workspace/tasks',
      severity: 'warning',
      category: 'task',
      dedupeKey: `task-due-soon:${String(row.id)}:${toDateInput(new Date())}`,
      reason: 'task_due_soon',
    });
    sent += created.length;
  }
  return sent;
}

async function createMeetingReminders(runtime: Runtime): Promise<number> {
  const result = await runtime.db.query<SqlRow>(
    `SELECT m.id AS meeting_id, m.organization_id, m.title, m.starts_at, ma.user_id
     FROM meetings m
     JOIN meeting_attendees ma ON ma.meeting_id = m.id
     WHERE m.status IN ('scheduled', 'requested')
       AND m.starts_at >= NOW()
       AND m.starts_at <= NOW() + INTERVAL '24 hours'
       AND ma.rsvp_status <> 'declined'`,
  );
  let sent = 0;
  for (const row of result.rows) {
    const created = await notifyUsers(runtime, {
      userIds: [String(row.user_id)],
      organizationId: String(row.organization_id),
      type: 'meeting_reminder',
      title: 'Meeting reminder',
      body: `“${String(row.title)}” starts within 24 hours.`,
      link: `/workspace/meetings/${String(row.meeting_id)}`,
      severity: 'info',
      category: 'meeting',
      dedupeKey: `meeting-reminder:${String(row.meeting_id)}:${String(row.user_id)}`,
      reason: 'meeting_reminder',
    });
    sent += created.length;
  }
  return sent;
}

async function escalateHelpRequests(runtime: Runtime): Promise<number> {
  const minutes = runtime.config.helpEscalationMinutes;
  const result = await runtime.db.query<SqlRow>(
    `UPDATE help_requests
     SET escalation_level = escalation_level + 1,
         last_escalated_at = NOW()
     WHERE status = 'new'
       AND priority IN ('urgent', 'critical')
       AND escalation_level < 2
       AND submitted_at <= NOW() - ($1::int * INTERVAL '1 minute')
     RETURNING id, organization_id, requester_id, assigned_to, reference, subject, priority, escalation_level`,
    [minutes],
  );
  const actorId = await systemActorId(runtime);
  let escalated = 0;
  for (const row of result.rows) {
    const organizationId = String(row.organization_id);
    const recipientsResult = await runtime.db.query<{ id: string }>(
      `SELECT u.id FROM users u
       JOIN organization_members m ON m.user_id = u.id
       WHERE u.is_active = TRUE
         AND (m.organization_id = $1 OR u.role = 'system_admin')
         AND (m.is_primary_secretary = TRUE OR u.role IN ('system_admin', 'zonal_secretary'))
       GROUP BY u.id`,
      [organizationId],
    );
    const recipients = Array.from(new Set([String(row.assigned_to || ''), ...recipientsResult.rows.map((item) => String(item.id)), String(row.requester_id)]));
    if (actorId) {
      await runtime.db.query(
        `INSERT INTO help_status_history
          (id, help_request_id, event_type, previous_status, new_status, actor_id, comment, created_at)
         VALUES ($1, $2, 'escalation', 'new', 'new', $3, $4, NOW())`,
        [
          id('helpstatus'),
          String(row.id),
          actorId,
          `Escalated after ${minutes} minutes without acknowledgement. Level ${String(row.escalation_level)}.`,
        ],
      );
    }
    await notifyUsers(runtime, {
      userIds: recipients,
      organizationId,
      type: 'help_escalated',
      title: 'Urgent HELP request escalated',
      body: `${String(row.reference)} — ${String(row.subject)} remains unacknowledged.`,
      link: `/workspace/help/${String(row.id)}`,
      severity: 'critical',
      category: 'help',
      dedupeKey: `help-escalation:${String(row.id)}:${String(row.escalation_level)}`,
      reason: 'help_escalated',
    });
    escalated += 1;
  }
  return escalated;
}

export async function runMaintenance(runtime: Runtime, triggeredBy = 'cron'): Promise<MaintenanceSummary> {
  const overdue = await markOverdueTasks(runtime);
  const taskReminders = await createTaskReminders(runtime);
  const meetingReminders = await createMeetingReminders(runtime);
  const escalatedHelpRequests = await escalateHelpRequests(runtime);
  const deliveryRetries = await retryPendingDeliveries(runtime);
  const summary: MaintenanceSummary = {
    overdueTasksMarked: overdue.count,
    taskReminders,
    meetingReminders,
    escalatedHelpRequests,
    deliveryRetries,
    ranAt: nowIso(),
  };
  await logAudit(runtime.db, {
    actorId: await systemActorId(runtime),
    action: 'maintenance.completed',
    entityType: 'system',
    metadata: { triggeredBy, ...summary },
  });
  return summary;
}

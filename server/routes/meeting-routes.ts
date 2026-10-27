import { z } from 'zod';
import type { AttendanceExecutive, AttendanceMeetingOption, AttendanceRecentSignIn, AttendanceSignInData, Meeting, MeetingAttendee, Resolution, Task, TaskComment } from '@/lib/shared-types';
import { logAudit } from '../audit';
import type { ApiContext } from '../context';
import {
  assertEntityInWorkspace,
  broadcastWorkspaceRefresh,
  jsonBody,
  organizationUsers,
  user,
  workspace,
} from '../context';
import { placeholders, type SqlRow } from '../db';
import { notifyUsers } from '../notifications';
import { hasPermission, isAdmin } from '../permissions';
import { listAttachments } from '../storage';
import { HttpError, id, json, makeReference, nowIso } from '../utils';
import {
  normalizeDateTime,
  attendanceSchema,
  attendanceSignInSchema,
  meetingCreateSchema,
  meetingUpdateSchema,
  resolutionSchema,
  taskCommentSchema,
  taskCreateSchema,
  taskUpdateSchema,
} from '../validation';

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

function mapAttendee(row: SqlRow): MeetingAttendee {
  return {
    id: String(row.id),
    meeting_id: String(row.meeting_id),
    user_id: String(row.user_id),
    rsvp_status: String(row.rsvp_status) as MeetingAttendee['rsvp_status'],
    attendance: String(row.attendance) as MeetingAttendee['attendance'],
    check_in_at: row.check_in_at ? String(row.check_in_at) : null,
    signed_in_by: row.signed_in_by ? String(row.signed_in_by) : null,
    signed_in_by_name: row.signed_in_by_name ? String(row.signed_in_by_name) : null,
    signed_in_note: String(row.signed_in_note || ''),
    user_name: String(row.user_name || ''),
    user_role: row.user_role ? (String(row.user_role) as MeetingAttendee['user_role']) : undefined,
    user_position: row.user_position ? String(row.user_position) : undefined,
  };
}

function mapResolution(row: SqlRow): Resolution {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    meeting_id: row.meeting_id ? String(row.meeting_id) : null,
    reference: String(row.reference),
    title: String(row.title),
    description: String(row.description || ''),
    moved_by: String(row.moved_by || ''),
    seconded_by: String(row.seconded_by || ''),
    status: String(row.status) as Resolution['status'],
    due_date: row.due_date ? String(row.due_date).slice(0, 10) : null,
    created_by: String(row.created_by),
    created_at: String(row.created_at),
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

async function assertOrganizationMembers(db: ApiContext['runtime']['db'], organizationId: string, userIds: string[]): Promise<void> {
  const uniqueIds = Array.from(new Set(userIds)).filter(Boolean);
  if (uniqueIds.length === 0) return;
  const result = await db.query<{ user_id: string }>(
    `SELECT user_id FROM organization_members WHERE organization_id = $1 AND user_id IN (${placeholders(uniqueIds, 2)})`,
    [organizationId, ...uniqueIds],
  );
  if (result.rows.length !== uniqueIds.length) {
    throw new HttpError(400, 'One or more selected people are not members of this workspace.');
  }
}

async function meetingDetail(ctx: ApiContext, meetingId: string, organizationId: string): Promise<Meeting> {
  const db = ctx.runtime.db;
  const [meetingResult, attendees, resolutions, tasks] = await Promise.all([
    db.query<SqlRow>('SELECT * FROM meetings WHERE id = $1 AND organization_id = $2', [meetingId, organizationId]),
    db.query<SqlRow>(
      `SELECT ma.*, u.name AS user_name, u.role AS user_role, u.position AS user_position,
              s.name AS signed_in_by_name
       FROM meeting_attendees ma JOIN users u ON u.id = ma.user_id
       LEFT JOIN users s ON s.id = ma.signed_in_by
       WHERE ma.meeting_id = $1 ORDER BY u.name`,
      [meetingId],
    ),
    db.query<SqlRow>('SELECT * FROM resolutions WHERE meeting_id = $1 ORDER BY created_at DESC', [meetingId]),
    db.query<SqlRow>(
      `SELECT t.*, u.name AS assignee_name, a.name AS assigner_name, m.title AS meeting_title
       FROM tasks t JOIN users u ON u.id = t.assigned_to JOIN users a ON a.id = t.assigned_by
       LEFT JOIN meetings m ON m.id = t.meeting_id WHERE t.meeting_id = $1 ORDER BY t.due_date`,
      [meetingId],
    ),
  ]);
  if (!meetingResult.rows[0]) throw new HttpError(404, 'Meeting not found.');
  return {
    ...mapMeeting(meetingResult.rows[0]),
    attendees: attendees.rows.map(mapAttendee),
    resolutions: resolutions.rows.map(mapResolution),
    tasks: tasks.rows.map(mapTask),
  };
}

export async function listMeetingsRoute(ctx: ApiContext): Promise<Response> {
  const access = await workspace(ctx);
  const search = ctx.url.searchParams.get('search')?.trim() || '';
  const status = ctx.url.searchParams.get('status') || '';
  const type = ctx.url.searchParams.get('type') || '';
  const params: unknown[] = [access.organization.id];
  const conditions = ['organization_id = $1'];
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  } else {
    conditions.push("status <> 'archived'");
  }
  if (type) {
    params.push(type);
    conditions.push(`meeting_type = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(title ILIKE $${params.length} OR agenda ILIKE $${params.length} OR minutes ILIKE $${params.length} OR venue ILIKE $${params.length})`);
  }
  params.push(200);
  const result = await ctx.runtime.db.query<SqlRow>(
    `SELECT * FROM meetings WHERE ${conditions.join(' AND ')} ORDER BY starts_at DESC LIMIT $${params.length}`,
    params,
  );
  return json({ meetings: result.rows.map(mapMeeting) });
}

export async function createMeetingRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const body = await jsonBody(ctx, meetingCreateSchema);
  const access = await workspace(ctx);
  if (body.organizationId !== access.organization.id) throw new HttpError(403, 'The selected workspace is not authorized.');
  const canManage = isAdmin(auth) || hasPermission(auth, 'manage_meetings');
  const canRequest = hasPermission(auth, 'create_meeting_request');
  if (!canManage && !canRequest) throw new HttpError(403, 'Your role cannot create meetings or meeting requests.');
  const status = canManage ? body.status : 'requested';
  const startsAt = normalizeDateTime(body.startsAt, new Date().toISOString()) as string;
  const endsAt = normalizeDateTime(body.endsAt, null);
  const meetingId = id('meeting');
  const attendeeIds = Array.from(new Set([...(body.attendeeIds || []), auth.user.id]));
  await assertOrganizationMembers(ctx.runtime.db, access.organization.id, attendeeIds);

  await ctx.runtime.db.query(
    `INSERT INTO meetings
      (id, organization_id, title, meeting_type, status, starts_at, ends_at, venue, chairperson, agenda,
       discussions, minutes, minutes_status, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8, $9, $10, '', '', 'not_started', $11, NOW(), NOW())`,
    [
      meetingId,
      access.organization.id,
      body.title,
      body.meetingType,
      status,
      startsAt,
      endsAt,
      body.venue,
      body.chairperson || auth.user.name,
      body.agenda || '',
      auth.user.id,
    ],
  );
  for (const userId of attendeeIds) {
    await ctx.runtime.db.query(
      `INSERT INTO meeting_attendees (id, meeting_id, user_id, rsvp_status, attendance)
       VALUES ($1, $2, $3, CASE WHEN $3 = $4 THEN 'confirmed' ELSE 'pending' END, 'unknown')
       ON CONFLICT (meeting_id, user_id) DO NOTHING`,
      [id('attendee'), meetingId, userId, auth.user.id],
    );
  }
  await ctx.runtime.db.query(
    `INSERT INTO calendar_events
      (id, organization_id, title, type, starts_at, ends_at, location, notes, meeting_id, created_by, created_at)
     VALUES ($1, $2, $3, 'meeting', $4::timestamptz, $5::timestamptz, $6, $7, $8, $9, NOW())`,
    [id('calendar'), access.organization.id, body.title, startsAt, endsAt, body.venue, status === 'requested' ? 'Presidential meeting request awaiting scheduling.' : '', meetingId, auth.user.id],
  );

  const secretaries = await organizationUsers(ctx.runtime.db, access.organization.id, { primarySecretariesOnly: true });
  const recipients = Array.from(new Set([...attendeeIds, ...secretaries])).filter((userId) => userId !== auth.user.id);
  await notifyUsers(ctx.runtime, {
    userIds: recipients,
    organizationId: access.organization.id,
    type: status === 'requested' ? 'meeting_requested' : 'meeting_invitation',
    title: status === 'requested' ? 'New presidential meeting request' : 'New meeting invitation',
    body: `${body.title} — ${new Date(startsAt).toLocaleString('en-GB')} at ${body.venue}.`,
    link: `/workspace/meetings/${meetingId}`,
    severity: 'info',
    category: 'meeting',
    dedupeKey: `meeting-created:${meetingId}`,
    reason: status === 'requested' ? 'meeting_requested' : 'meeting_invitation',
  });
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: status === 'requested' ? 'meeting.requested' : 'meeting.created',
    entityType: 'meeting',
    entityId: meetingId,
    metadata: { title: body.title, startsAt },
    request: ctx.request,
  });
  await broadcastWorkspaceRefresh(ctx, access.organization.id, 'meeting_created');
  return json({ meeting: await meetingDetail(ctx, meetingId, access.organization.id), message: status === 'requested' ? 'Meeting request sent to the Secretariat.' : 'Meeting created and attendees notified.' }, 201);
}

export async function getMeetingRoute(ctx: ApiContext): Promise<Response> {
  const access = await workspace(ctx);
  await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'meetings', ctx.params.id);
  return json({ meeting: await meetingDetail(ctx, ctx.params.id, access.organization.id) });
}

export async function updateMeetingRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  if (!isAdmin(auth) && !hasPermission(auth, 'manage_meetings')) throw new HttpError(403, 'Only the Secretariat can edit meeting records.');
  const access = await workspace(ctx);
  const existing = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'meetings', ctx.params.id);
  const body = await jsonBody(ctx, meetingUpdateSchema);
  const updates: string[] = [];
  const params: unknown[] = [ctx.params.id];
  const fieldMap: Record<string, [unknown, string]> = {
    title: [body.title, 'title'],
    meetingType: [body.meetingType, 'meeting_type'],
    status: [body.status, 'status'],
    venue: [body.venue, 'venue'],
    chairperson: [body.chairperson, 'chairperson'],
    agenda: [body.agenda, 'agenda'],
    discussions: [body.discussions, 'discussions'],
    minutes: [body.minutes, 'minutes'],
    minutesStatus: [body.minutesStatus, 'minutes_status'],
  };
  for (const [key, [value, column]] of Object.entries(fieldMap)) {
    if (value !== undefined) {
      params.push(value);
      updates.push(`${column} = $${params.length}`);
    }
  }
  if (body.startsAt !== undefined) {
    params.push(normalizeDateTime(body.startsAt, String(existing.starts_at)));
    updates.push(`starts_at = $${params.length}::timestamptz`);
  }
  if (body.endsAt !== undefined) {
    params.push(normalizeDateTime(body.endsAt, null));
    updates.push(`ends_at = $${params.length}::timestamptz`);
  }
  if (updates.length === 0) return json({ meeting: await meetingDetail(ctx, ctx.params.id, access.organization.id) });
  await ctx.runtime.db.query(`UPDATE meetings SET ${updates.join(', ')} WHERE id = $1`, params);
  if (body.startsAt || body.title || body.venue) {
    await ctx.runtime.db.query(
      `UPDATE calendar_events
       SET title = COALESCE($2, title), starts_at = COALESCE($3::timestamptz, starts_at), location = COALESCE($4, location)
       WHERE meeting_id = $1`,
      [ctx.params.id, body.title || null, body.startsAt ? normalizeDateTime(body.startsAt, null) : null, body.venue || null],
    );
  }
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'meeting.updated',
    entityType: 'meeting',
    entityId: ctx.params.id,
    metadata: { fields: Object.keys(body) },
    request: ctx.request,
  });
  await broadcastWorkspaceRefresh(ctx, access.organization.id, 'meeting_updated');
  return json({ meeting: await meetingDetail(ctx, ctx.params.id, access.organization.id), message: 'Meeting record saved.' });
}

export async function attendanceRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const access = await workspace(ctx);
  await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'meetings', ctx.params.id);
  const body = await jsonBody(ctx, attendanceSchema);
  const canManage = isAdmin(auth) || hasPermission(auth, 'manage_meetings');
  const attendeeIds = body.attendeeIds || [];
  if (attendeeIds.length) {
    if (!canManage) throw new HttpError(403, 'Only the Secretariat can add attendees.');
    await assertOrganizationMembers(ctx.runtime.db, access.organization.id, attendeeIds);
    for (const userId of attendeeIds) {
      await ctx.runtime.db.query(
        `INSERT INTO meeting_attendees (id, meeting_id, user_id, rsvp_status, attendance)
         VALUES ($1, $2, $3, 'pending', 'unknown') ON CONFLICT (meeting_id, user_id) DO NOTHING`,
        [id('attendee'), ctx.params.id, userId],
      );
    }
    await notifyUsers(ctx.runtime, {
      userIds: attendeeIds,
      organizationId: access.organization.id,
      type: 'meeting_invitation',
      title: 'You were added to a meeting',
      body: 'Open the meeting to confirm your attendance.',
      link: `/workspace/meetings/${ctx.params.id}`,
      severity: 'info',
      category: 'meeting',
      dedupeKey: `meeting-attendee-added:${ctx.params.id}:${attendeeIds.join(',')}`,
      reason: 'meeting_invitation',
    });
  }
  const targetUserId = body.userId || auth.user.id;
  if (body.rsvpStatus || body.attendance) {
    if (!canManage && targetUserId !== auth.user.id) throw new HttpError(403, 'You can only update your own response.');
    if (!canManage && body.attendance) throw new HttpError(403, 'Attendance is recorded by the Secretariat.');
    const rsvp = body.rsvpStatus || 'pending';
    const attendance = body.attendance || 'unknown';
    const signedInBy = body.attendance && canManage ? auth.user.id : null;
    const signedInNote = body.attendance && canManage ? (body.note || '') : '';
    await ctx.runtime.db.query(
      `INSERT INTO meeting_attendees
        (id, meeting_id, user_id, rsvp_status, attendance, check_in_at, signed_in_by, signed_in_note)
       VALUES ($1, $2, $3, $4, $5,
               CASE WHEN $5 IN ('present','apology') THEN NOW() ELSE NULL END, $6, $7)
       ON CONFLICT (meeting_id, user_id) DO UPDATE SET
         rsvp_status = EXCLUDED.rsvp_status,
         attendance = EXCLUDED.attendance,
         check_in_at = CASE WHEN EXCLUDED.attendance IN ('present','apology') THEN NOW() ELSE meeting_attendees.check_in_at END,
         signed_in_by = EXCLUDED.signed_in_by,
         signed_in_note = EXCLUDED.signed_in_note`,
      [id('attendee'), ctx.params.id, targetUserId, rsvp, attendance, signedInBy, signedInNote],
    );

    if (body.attendance) {
      const [meetingRow, targetRow] = await Promise.all([
        ctx.runtime.db.query<SqlRow>('SELECT title FROM meetings WHERE id = $1', [ctx.params.id]),
        ctx.runtime.db.query<SqlRow>('SELECT name FROM users WHERE id = $1', [targetUserId]),
      ]);
      const meetingTitle = String(meetingRow.rows[0]?.title || 'Meeting');
      const targetName = String(targetRow.rows[0]?.name || 'An executive');
      const monitors = await organizationUsers(ctx.runtime.db, access.organization.id, {
        roles: ['school_president', 'zonal_president', 'system_admin'],
        excludeUserIds: [auth.user.id, targetUserId],
      });
      await notifyUsers(ctx.runtime, {
        userIds: monitors,
        organizationId: access.organization.id,
        type: 'attendance_signed_in',
        title: 'Meeting attendance updated',
        body: `${targetName} was marked ${body.attendance.replaceAll('_', ' ')} for ${meetingTitle} by ${auth.user.name}.`,
        link: `/workspace/meetings/${ctx.params.id}`,
        severity: 'info',
        category: 'meeting',
        dedupeKey: `attendance-route:${ctx.params.id}:${targetUserId}:${body.attendance}:${Date.now()}`,
        reason: 'attendance_signed_in',
      });
      if (targetUserId !== auth.user.id) {
        await notifyUsers(ctx.runtime, {
          userIds: [targetUserId],
          organizationId: access.organization.id,
          type: 'attendance_recorded',
          title: 'Your meeting attendance was recorded',
          body: `${auth.user.name} recorded you as ${body.attendance.replaceAll('_', ' ')} for ${meetingTitle}.`,
          link: `/workspace/meetings/${ctx.params.id}`,
          severity: 'info',
          category: 'meeting',
          dedupeKey: `attendance-self:${ctx.params.id}:${targetUserId}:${body.attendance}:${Date.now()}`,
          reason: 'attendance_recorded',
        });
      }
    }
  }
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'meeting.attendance_updated',
    entityType: 'meeting',
    entityId: ctx.params.id,
    metadata: body as unknown as Record<string, unknown>,
    request: ctx.request,
  });
  await broadcastWorkspaceRefresh(ctx, access.organization.id, 'attendance_updated');
  return json({ meeting: await meetingDetail(ctx, ctx.params.id, access.organization.id), message: 'Attendance record saved.' });
}

export async function createResolutionRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  if (!isAdmin(auth) && !hasPermission(auth, 'manage_meetings')) throw new HttpError(403, 'Only the Secretariat can record resolutions.');
  const access = await workspace(ctx);
  const meeting = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'meetings', ctx.params.id);
  const body = await jsonBody(ctx, resolutionSchema);
  const resolutionId = id('resolution');
  const reference = makeReference('RES');
  await ctx.runtime.db.query(
    `INSERT INTO resolutions
      (id, organization_id, meeting_id, reference, title, description, moved_by, seconded_by, status, due_date, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11, NOW())`,
    [resolutionId, access.organization.id, ctx.params.id, reference, body.title, body.description || '', body.movedBy || '', body.secondedBy || '', body.status, body.dueDate || null, auth.user.id],
  );

  let taskId: string | null = null;
  if (body.createTask && body.taskAssigneeId && body.taskDueDate) {
    await assertOrganizationMembers(ctx.runtime.db, access.organization.id, [body.taskAssigneeId]);
    taskId = id('task');
    await ctx.runtime.db.query(
      `INSERT INTO tasks
        (id, organization_id, meeting_id, resolution_id, title, description, assigned_to, assigned_by,
         priority, status, progress, due_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'high', 'pending', 0, $9::timestamptz, NOW(), NOW())`,
      [taskId, access.organization.id, ctx.params.id, resolutionId, body.title, body.description || '', body.taskAssigneeId, auth.user.id, normalizeDateTime(body.taskDueDate, new Date().toISOString())],
    );
    await notifyUsers(ctx.runtime, {
      userIds: [body.taskAssigneeId],
      organizationId: access.organization.id,
      type: 'task_assigned',
      title: 'New action item assigned',
      body: `${body.title} was assigned from resolution ${reference}.`,
      link: '/workspace/tasks',
      severity: 'info',
      category: 'task',
      dedupeKey: `task-assigned:${taskId}`,
      reason: 'task_assigned',
    });
  }

  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'meeting.resolution_recorded',
    entityType: 'resolution',
    entityId: resolutionId,
    metadata: { meetingId: ctx.params.id, reference, taskId },
    request: ctx.request,
  });
  await broadcastWorkspaceRefresh(ctx, access.organization.id, 'resolution_created');
  return json({ meeting: await meetingDetail(ctx, ctx.params.id, access.organization.id), resolutionId, taskId, message: taskId ? 'Resolution and action item saved.' : 'Resolution saved.' }, 201);
}

export async function submitMinutesRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  if (!isAdmin(auth) && !hasPermission(auth, 'manage_meetings')) throw new HttpError(403, 'Only the Secretariat can submit minutes.');
  const access = await workspace(ctx);
  const meeting = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'meetings', ctx.params.id);
  if (!String(meeting.minutes || '').trim()) throw new HttpError(400, 'Record the minutes before submitting them for review.');
  const documentId = id('document');
  const reference = makeReference('MIN');
  await ctx.runtime.db.query(
    `INSERT INTO documents
      (id, organization_id, title, kind, category, reference, subject, recipient, content, tags, status,
       meeting_id, created_by, version, created_at, updated_at)
     VALUES ($1, $2, $3, 'minutes', 'Meeting Minutes', $4, $5, 'President', $6, 'minutes,meeting,approval',
             'pending_approval', $7, $8, 1, NOW(), NOW())`,
    [documentId, access.organization.id, `Minutes — ${String(meeting.title)}`, reference, `Minutes for ${String(meeting.title)}`, String(meeting.minutes), ctx.params.id, auth.user.id],
  );
  await ctx.runtime.db.query(
    `INSERT INTO document_versions (id, document_id, organization_id, version, title, content, changed_by, change_note, created_at)
     VALUES ($1, $2, $3, 1, $4, $5, $6, 'Submitted for presidential review.', NOW())`,
    [id('docver'), documentId, access.organization.id, `Minutes — ${String(meeting.title)}`, String(meeting.minutes), auth.user.id],
  );
  await ctx.runtime.db.query("UPDATE meetings SET minutes_status = 'pending_approval' WHERE id = $1", [ctx.params.id]);
  const presidents = await organizationUsers(ctx.runtime.db, access.organization.id, { roles: ['school_president', 'zonal_president'] });
  await notifyUsers(ctx.runtime, {
    userIds: presidents,
    organizationId: access.organization.id,
    type: 'minutes_submitted',
    title: 'Meeting minutes awaiting approval',
    body: `${String(meeting.title)} minutes were submitted for review.`,
    link: `/workspace/documents/${documentId}`,
    severity: 'warning',
    category: 'general',
    dedupeKey: `minutes-submitted:${documentId}`,
    reason: 'minutes_submitted',
  });
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'meeting.minutes_submitted',
    entityType: 'document',
    entityId: documentId,
    metadata: { meetingId: ctx.params.id },
    request: ctx.request,
  });
  await broadcastWorkspaceRefresh(ctx, access.organization.id, 'minutes_submitted');
  return json({ meeting: await meetingDetail(ctx, ctx.params.id, access.organization.id), documentId, message: 'Minutes submitted for presidential review.' }, 201);
}

async function taskDetail(ctx: ApiContext, taskId: string, organizationId: string): Promise<Task> {
  const db = ctx.runtime.db;
  const [taskResult, comments, attachments] = await Promise.all([
    db.query<SqlRow>(
      `SELECT t.*, u.name AS assignee_name, a.name AS assigner_name, m.title AS meeting_title
       FROM tasks t JOIN users u ON u.id = t.assigned_to JOIN users a ON a.id = t.assigned_by
       LEFT JOIN meetings m ON m.id = t.meeting_id WHERE t.id = $1 AND t.organization_id = $2`,
      [taskId, organizationId],
    ),
    db.query<SqlRow>(
      `SELECT tc.*, u.name AS user_name FROM task_comments tc JOIN users u ON u.id = tc.user_id
       WHERE tc.task_id = $1 ORDER BY tc.created_at ASC`,
      [taskId],
    ),
    listAttachments(db, organizationId, 'task', taskId),
  ]);
  if (!taskResult.rows[0]) throw new HttpError(404, 'Task not found.');
  return {
    ...mapTask(taskResult.rows[0]),
    comments: comments.rows.map((row): TaskComment => ({
      id: String(row.id),
      task_id: String(row.task_id),
      user_id: String(row.user_id),
      comment: String(row.comment),
      created_at: String(row.created_at),
      user_name: String(row.user_name || ''),
    })),
    attachments,
  };
}

export async function listTasksRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const access = await workspace(ctx);
  const search = ctx.url.searchParams.get('search')?.trim() || '';
  const status = ctx.url.searchParams.get('status') || '';
  const priority = ctx.url.searchParams.get('priority') || '';
  const assignedTo = ctx.url.searchParams.get('assignedTo') || '';
  const due = ctx.url.searchParams.get('due') || '';
  const params: unknown[] = [access.organization.id];
  const conditions = ['t.organization_id = $1'];
  if (!isAdmin(auth) && !hasPermission(auth, 'manage_tasks')) {
    params.push(auth.user.id);
    conditions.push(`(t.assigned_to = $${params.length} OR t.assigned_by = $${params.length})`);
  }
  if (status) {
    params.push(status);
    conditions.push(`t.status = $${params.length}`);
  }
  if (priority) {
    params.push(priority);
    conditions.push(`t.priority = $${params.length}`);
  }
  if (assignedTo) {
    params.push(assignedTo);
    conditions.push(`t.assigned_to = $${params.length}`);
  }
  if (due === 'overdue') conditions.push("t.status <> 'completed' AND t.due_date < NOW()");
  if (due === 'today') conditions.push('t.due_date::date = CURRENT_DATE');
  if (due === 'week') conditions.push("t.due_date >= NOW() AND t.due_date <= NOW() + INTERVAL '7 days'");
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(t.title ILIKE $${params.length} OR t.description ILIKE $${params.length} OR u.name ILIKE $${params.length})`);
  }
  params.push(300);
  const result = await ctx.runtime.db.query<SqlRow>(
    `SELECT t.*, u.name AS assignee_name, a.name AS assigner_name, m.title AS meeting_title
     FROM tasks t JOIN users u ON u.id = t.assigned_to JOIN users a ON a.id = t.assigned_by
     LEFT JOIN meetings m ON m.id = t.meeting_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY CASE t.status WHEN 'overdue' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'awaiting_review' THEN 2 WHEN 'pending' THEN 3 ELSE 4 END,
              t.due_date ASC LIMIT $${params.length}`,
    params,
  );
  return json({ tasks: result.rows.map(mapTask) });
}

export async function createTaskRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  if (!isAdmin(auth) && !hasPermission(auth, 'manage_tasks')) throw new HttpError(403, 'Only the Secretariat can create tasks.');
  const body = await jsonBody(ctx, taskCreateSchema);
  const access = await workspace(ctx);
  if (body.organizationId !== access.organization.id) throw new HttpError(403, 'The selected workspace is not authorized.');
  await assertOrganizationMembers(ctx.runtime.db, access.organization.id, [body.assignedTo]);
  if (body.meetingId) await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'meetings', body.meetingId);
  if (body.resolutionId) await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'resolutions', body.resolutionId);
  const taskId = id('task');
  await ctx.runtime.db.query(
    `INSERT INTO tasks
      (id, organization_id, meeting_id, resolution_id, title, description, assigned_to, assigned_by,
       priority, status, progress, due_date, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', 0, $10::timestamptz, NOW(), NOW())`,
    [taskId, access.organization.id, body.meetingId || null, body.resolutionId || null, body.title, body.description || '', body.assignedTo, auth.user.id, body.priority, normalizeDateTime(body.dueDate, new Date().toISOString())],
  );
  await ctx.runtime.db.query(
    `INSERT INTO task_events (id, task_id, user_id, previous_status, new_status, comment, created_at)
     VALUES ($1, $2, $3, NULL, 'pending', 'Task created.', NOW())`,
    [id('taskevent'), taskId, auth.user.id],
  );
  await notifyUsers(ctx.runtime, {
    userIds: [body.assignedTo],
    organizationId: access.organization.id,
    type: 'task_assigned',
    title: 'New task assigned',
    body: `${body.title} is due ${new Date(normalizeDateTime(body.dueDate, new Date().toISOString()) as string).toLocaleString('en-GB')}.`,
    link: '/workspace/tasks',
    severity: 'info',
    category: 'task',
    dedupeKey: `task-assigned:${taskId}`,
    reason: 'task_assigned',
  });
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'task.created',
    entityType: 'task',
    entityId: taskId,
    metadata: { title: body.title, assignedTo: body.assignedTo },
    request: ctx.request,
  });
  await broadcastWorkspaceRefresh(ctx, access.organization.id, 'task_created');
  return json({ task: await taskDetail(ctx, taskId, access.organization.id), message: 'Task saved and assignee notified.' }, 201);
}

export async function getTaskRoute(ctx: ApiContext): Promise<Response> {
  const access = await workspace(ctx);
  const task = await taskDetail(ctx, ctx.params.id, access.organization.id);
  const auth = user(ctx);
  if (!isAdmin(auth) && !hasPermission(auth, 'manage_tasks') && task.assigned_to !== auth.user.id && task.assigned_by !== auth.user.id) {
    throw new HttpError(403, 'You are not authorized to view this task.');
  }
  return json({ task });
}

export async function updateTaskRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const access = await workspace(ctx);
  const existing = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'tasks', ctx.params.id);
  const canManage = isAdmin(auth) || hasPermission(auth, 'manage_tasks');
  const isAssignee = String(existing.assigned_to) === auth.user.id;
  if (!canManage && !isAssignee) throw new HttpError(403, 'You cannot update this task.');
  const body = await jsonBody(ctx, taskUpdateSchema);
  if (!canManage && (body.title !== undefined || body.description !== undefined || body.assignedTo !== undefined || body.dueDate !== undefined || body.priority !== undefined)) {
    throw new HttpError(403, 'Assigned members can update progress, status and notes only.');
  }
  const updates: string[] = [];
  const params: unknown[] = [ctx.params.id];
  const fieldMap: Record<string, [unknown, string]> = {
    title: [body.title, 'title'],
    description: [body.description, 'description'],
    assignedTo: [body.assignedTo, 'assigned_to'],
    priority: [body.priority, 'priority'],
    status: [body.status, 'status'],
    progress: [body.progress, 'progress'],
    completionNote: [body.completionNote, 'completion_note'],
  };
  for (const [key, [value, column]] of Object.entries(fieldMap)) {
    if (value !== undefined) {
      params.push(value);
      updates.push(`${column} = $${params.length}`);
    }
  }
  if (body.dueDate !== undefined) {
    params.push(normalizeDateTime(body.dueDate, String(existing.due_date)));
    updates.push(`due_date = $${params.length}::timestamptz`);
  }
  if (body.status === 'completed') {
    updates.push('progress = 100', 'completed_at = NOW()');
  } else if (body.status) {
    updates.push('completed_at = NULL');
  }
  if (updates.length > 0) {
    await ctx.runtime.db.query(`UPDATE tasks SET ${updates.join(', ')} WHERE id = $1`, params);
  }
  if (body.comment) {
    await ctx.runtime.db.query(
      'INSERT INTO task_comments (id, task_id, user_id, comment, created_at) VALUES ($1, $2, $3, $4, NOW())',
      [id('taskcomment'), ctx.params.id, auth.user.id, body.comment],
    );
  }
  if (body.status && body.status !== String(existing.status)) {
    await ctx.runtime.db.query(
      `INSERT INTO task_events (id, task_id, user_id, previous_status, new_status, comment, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [id('taskevent'), ctx.params.id, auth.user.id, String(existing.status), body.status, body.comment || body.completionNote || ''],
    );
    const recipients = Array.from(new Set([String(existing.assigned_by), String(existing.assigned_to)])).filter((userId) => userId !== auth.user.id);
    await notifyUsers(ctx.runtime, {
      userIds: recipients,
      organizationId: access.organization.id,
      type: 'task_status_changed',
      title: 'Task status updated',
      body: `${String(existing.title)} is now ${body.status.replaceAll('_', ' ')}.`,
      link: '/workspace/tasks',
      severity: body.status === 'completed' ? 'success' : 'info',
      category: 'task',
      dedupeKey: `task-status:${ctx.params.id}:${body.status}:${nowIso().slice(0, 16)}`,
      reason: 'task_status_changed',
    });
  }
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'task.updated',
    entityType: 'task',
    entityId: ctx.params.id,
    metadata: body as unknown as Record<string, unknown>,
    request: ctx.request,
  });
  await broadcastWorkspaceRefresh(ctx, access.organization.id, 'task_updated');
  return json({ task: await taskDetail(ctx, ctx.params.id, access.organization.id), message: 'Task updated.' });
}

export async function addTaskCommentRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const access = await workspace(ctx);
  const existing = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'tasks', ctx.params.id);
  const canManage = isAdmin(auth) || hasPermission(auth, 'manage_tasks');
  if (!canManage && String(existing.assigned_to) !== auth.user.id && String(existing.assigned_by) !== auth.user.id) {
    throw new HttpError(403, 'You cannot comment on this task.');
  }
  const body = await jsonBody(ctx, taskCommentSchema);
  await ctx.runtime.db.query(
    'INSERT INTO task_comments (id, task_id, user_id, comment, created_at) VALUES ($1, $2, $3, $4, NOW())',
    [id('taskcomment'), ctx.params.id, auth.user.id, body.comment],
  );
  const recipients = Array.from(new Set([String(existing.assigned_by), String(existing.assigned_to)])).filter((userId) => userId !== auth.user.id);
  await notifyUsers(ctx.runtime, {
    userIds: recipients,
    organizationId: access.organization.id,
    type: 'task_comment',
    title: 'New task comment',
    body: `${String(existing.title)}: ${body.comment.slice(0, 140)}`,
    link: '/workspace/tasks',
    severity: 'info',
    category: 'task',
    dedupeKey: `task-comment:${ctx.params.id}:${nowIso().slice(0, 19)}`,
    reason: 'task_comment',
  });
  return json({ task: await taskDetail(ctx, ctx.params.id, access.organization.id), message: 'Comment saved.' }, 201);
}

export async function attendanceOverviewRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const access = await workspace(ctx);
  const requestedMeetingId = ctx.url.searchParams.get('meetingId') || '';
  const meetingResult = await ctx.runtime.db.query<SqlRow>(
    `SELECT id, title, starts_at, venue, status
     FROM meetings
     WHERE organization_id = $1 AND status <> 'archived'
     ORDER BY CASE WHEN starts_at >= NOW() THEN 0 ELSE 1 END, starts_at ASC
     LIMIT 30`,
    [access.organization.id],
  );
  const meetings: AttendanceMeetingOption[] = meetingResult.rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    starts_at: String(row.starts_at),
    venue: String(row.venue || ''),
    status: String(row.status) as AttendanceMeetingOption['status'],
  }));
  const selectedMeetingId = meetings.find((meeting) => meeting.id === requestedMeetingId)?.id
    || meetings.find((meeting) => meeting.status === 'scheduled')?.id
    || meetings[0]?.id
    || '';

  let executives: AttendanceExecutive[] = [];
  if (selectedMeetingId) {
    const result = await ctx.runtime.db.query<SqlRow>(
      `SELECT u.id, u.name, u.role, u.position, u.avatar_color,
              COALESCE(ma.rsvp_status, 'pending') AS rsvp_status,
              COALESCE(ma.attendance, 'unknown') AS attendance,
              ma.check_in_at, ma.signed_in_by,
              COALESCE(ma.signed_in_note, '') AS signed_in_note,
              s.name AS signed_in_by_name
       FROM users u
       JOIN organization_members om ON om.user_id = u.id AND om.organization_id = $1
       LEFT JOIN meeting_attendees ma ON ma.meeting_id = $2 AND ma.user_id = u.id
       LEFT JOIN users s ON s.id = ma.signed_in_by
       WHERE u.is_active = TRUE AND u.role <> 'system_admin'
       ORDER BY CASE u.role
         WHEN 'school_president' THEN 0
         WHEN 'zonal_president' THEN 1
         WHEN 'vice_president' THEN 2
         WHEN 'school_secretary' THEN 3
         WHEN 'zonal_secretary' THEN 4
         ELSE 5 END, u.name`,
      [access.organization.id, selectedMeetingId],
    );
    executives = result.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      role: String(row.role) as AttendanceExecutive['role'],
      position: String(row.position || ''),
      avatar_color: String(row.avatar_color || '#0b1f3a'),
      rsvp_status: String(row.rsvp_status) as AttendanceExecutive['rsvp_status'],
      attendance: String(row.attendance) as AttendanceExecutive['attendance'],
      check_in_at: row.check_in_at ? String(row.check_in_at) : null,
      signed_in_by: row.signed_in_by ? String(row.signed_in_by) : null,
      signed_in_by_name: row.signed_in_by_name ? String(row.signed_in_by_name) : null,
      signed_in_note: String(row.signed_in_note || ''),
    }));
  }

  const recentResult = await ctx.runtime.db.query<SqlRow>(
    `SELECT ma.id, ma.meeting_id, m.title AS meeting_title, u.id AS user_id, u.name AS user_name,
            ma.attendance, ma.check_in_at, s.name AS signed_in_by_name,
            COALESCE(ma.signed_in_note, '') AS signed_in_note
     FROM meeting_attendees ma
     JOIN meetings m ON m.id = ma.meeting_id
     JOIN users u ON u.id = ma.user_id
     LEFT JOIN users s ON s.id = ma.signed_in_by
     WHERE m.organization_id = $1 AND ma.check_in_at IS NOT NULL
     ORDER BY ma.check_in_at DESC
     LIMIT 8`,
    [access.organization.id],
  );
  const recentSignIns: AttendanceRecentSignIn[] = recentResult.rows.map((row) => ({
    id: String(row.id),
    meeting_id: String(row.meeting_id),
    meeting_title: String(row.meeting_title),
    user_id: String(row.user_id),
    user_name: String(row.user_name),
    attendance: String(row.attendance) as AttendanceRecentSignIn['attendance'],
    check_in_at: String(row.check_in_at),
    signed_in_by_name: row.signed_in_by_name ? String(row.signed_in_by_name) : null,
    signed_in_note: String(row.signed_in_note || ''),
  }));

  const monitorResult = await ctx.runtime.db.query<{ name: string }>(
    `SELECT DISTINCT u.name FROM users u
     JOIN organization_members om ON om.user_id = u.id
     WHERE om.organization_id = $1 AND u.is_active = TRUE
       AND u.role IN ('school_president', 'zonal_president', 'system_admin')
     ORDER BY u.name`,
    [access.organization.id],
  );
  const summary = {
    total: executives.length,
    present: executives.filter((item) => item.attendance === 'present').length,
    absent: executives.filter((item) => item.attendance === 'absent').length,
    apology: executives.filter((item) => item.attendance === 'apology').length,
    pending: executives.filter((item) => item.attendance === 'unknown').length,
  };
  const data: AttendanceSignInData = {
    meetings,
    selectedMeetingId,
    executives,
    summary,
    recentSignIns,
    canSignIn: isAdmin(auth) || hasPermission(auth, 'manage_meetings'),
    monitors: monitorResult.rows.map((row) => String(row.name)),
  };
  return json(data);
}

export async function attendanceSignInRoute(ctx: ApiContext): Promise<Response> {
  const auth = user(ctx);
  const access = await workspace(ctx);
  if (!isAdmin(auth) && !hasPermission(auth, 'manage_meetings')) {
    throw new HttpError(403, 'Only the Secretariat or an administrator can sign executives in.');
  }
  const body = await jsonBody(ctx, attendanceSignInSchema);
  const meeting = await assertEntityInWorkspace(ctx.runtime.db, access.organization.id, 'meetings', body.meetingId);
  const member = await ctx.runtime.db.query<{ name: string }>(
    `SELECT u.name FROM users u
     JOIN organization_members om ON om.user_id = u.id
     WHERE om.organization_id = $1 AND u.id = $2 AND u.is_active = TRUE`,
    [access.organization.id, body.userId],
  );
  const memberName = member.rows[0] ? String(member.rows[0].name) : '';
  if (!memberName) throw new HttpError(400, 'The selected executive is not an active member of this workspace.');
  if (body.userId === auth.user.id && !isAdmin(auth)) {
    throw new HttpError(400, 'Ask another secretary to sign you in, or use the meeting RSVP control.');
  }

  await ctx.runtime.db.query(
    `INSERT INTO meeting_attendees
      (id, meeting_id, user_id, rsvp_status, attendance, check_in_at, signed_in_by, signed_in_note)
     VALUES ($1, $2, $3, 'confirmed', $4,
             CASE WHEN $4 IN ('present','apology') THEN NOW() ELSE NULL END, $5, $6)
     ON CONFLICT (meeting_id, user_id) DO UPDATE SET
       rsvp_status = 'confirmed',
       attendance = EXCLUDED.attendance,
       check_in_at = CASE WHEN EXCLUDED.attendance IN ('present','apology') THEN NOW() ELSE NULL END,
       signed_in_by = EXCLUDED.signed_in_by,
       signed_in_note = EXCLUDED.signed_in_note`,
    [id('attendee'), body.meetingId, body.userId, body.attendance, auth.user.id, body.note || ''],
  );

  const meetingTitle = String(meeting.title);
  const monitors = await organizationUsers(ctx.runtime.db, access.organization.id, {
    roles: ['school_president', 'zonal_president', 'system_admin'],
    excludeUserIds: [auth.user.id, body.userId],
  });
  await notifyUsers(ctx.runtime, {
    userIds: monitors,
    organizationId: access.organization.id,
    type: 'attendance_signed_in',
    title: 'Executive signed in to a meeting',
    body: `${memberName} was marked ${body.attendance.replaceAll('_', ' ')} for ${meetingTitle} by ${auth.user.name}.`,
    link: `/workspace/meetings/${body.meetingId}`,
    severity: 'info',
    category: 'meeting',
    dedupeKey: `attendance-signin:${body.meetingId}:${body.userId}:${body.attendance}:${Date.now()}`,
    reason: 'attendance_signed_in',
  });
  await notifyUsers(ctx.runtime, {
    userIds: [body.userId],
    organizationId: access.organization.id,
    type: 'attendance_recorded',
    title: 'Your meeting attendance was recorded',
    body: `${auth.user.name} recorded you as ${body.attendance.replaceAll('_', ' ')} for ${meetingTitle}.`,
    link: `/workspace/meetings/${body.meetingId}`,
    severity: 'info',
    category: 'meeting',
    dedupeKey: `attendance-self:${body.meetingId}:${body.userId}:${body.attendance}:${Date.now()}`,
    reason: 'attendance_recorded',
  });
  await logAudit(ctx.runtime.db, {
    actorId: auth.user.id,
    organizationId: access.organization.id,
    action: 'meeting.attendance_signed_in',
    entityType: 'meeting',
    entityId: body.meetingId,
    metadata: { userId: body.userId, attendance: body.attendance, note: body.note || '' },
    request: ctx.request,
  });
  await broadcastWorkspaceRefresh(ctx, access.organization.id, 'attendance_signed_in');
  return json({
    ok: true,
    meetingId: body.meetingId,
    userId: body.userId,
    attendance: body.attendance,
    message: `${memberName} is now marked ${body.attendance.replaceAll('_', ' ')}.`,
  });
}

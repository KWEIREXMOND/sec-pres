import { z } from 'zod';

const short = z.string().trim().min(1, 'This field is required.').max(200);
const medium = z.string().trim().min(1).max(1000);
const long = z.string().trim().max(50000);
const optionalText = z.string().trim().max(50000).default('');
const optionalShort = z.string().trim().max(200).default('');
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.');
const dateTime = z.string().min(10, 'Use a valid date and time.');
const email = z.string().trim().email('Enter a valid email address.').max(200);
const phone = z.string().trim().min(7, 'Enter a valid telephone number.').max(30);
const uuidish = z.string().trim().min(8, 'A valid request identifier is required.').max(100);

const roleEnum = z.enum([
  'zonal_president',
  'school_president',
  'zonal_secretary',
  'school_secretary',
  'vice_president',
  'executive',
  'system_admin',
]);

const priorityEnum = z.enum(['low', 'normal', 'high', 'urgent', 'critical']);
const helpStatusEnum = z.enum(['new', 'acknowledged', 'in_progress', 'resolved', 'closed']);
const taskStatusEnum = z.enum(['pending', 'in_progress', 'awaiting_review', 'completed', 'overdue']);
const documentStatusEnum = z.enum(['draft', 'pending_approval', 'approved', 'sent', 'answered', 'revisions_requested', 'rejected', 'archived']);
const documentKindEnum = z.enum(['letter', 'notice', 'circular', 'memo', 'minutes', 'report', 'proposal', 'event_plan', 'policy', 'constitution', 'handover', 'other']);
const templateTypeEnum = z.enum(['letter', 'notice', 'agenda', 'minutes', 'memo', 'report']);
const meetingTypeEnum = z.enum(['school_executive', 'zonal_executive', 'general', 'committee', 'emergency', 'programme']);
const meetingStatusEnum = z.enum(['requested', 'scheduled', 'completed', 'cancelled', 'archived']);
const calendarTypeEnum = z.enum(['meeting', 'appointment', 'school_event', 'zonal_programme', 'deadline', 'activity']);
const reportTypeEnum = z.enum(['monthly', 'termly', 'annual', 'meeting_attendance', 'outstanding_tasks', 'correspondence_register', 'help_summary', 'executive_decisions', 'handover']);

export const loginSchema = z.object({ email, password: z.string().min(1) });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  purpose: z.enum(['password_reset', 'account_activation']).default('password_reset'),
  password: z.string().min(10, 'Use at least 10 characters.').max(200),
});

export const profileUpdateSchema = z.object({
  name: short,
  phone,
  whatsapp_number: z.string().trim().max(30).optional().nullable(),
  committee: optionalShort,
  responsibilities: z.string().trim().max(1000).default(''),
});
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10, 'Use at least 10 characters.').max(200),
});
export const preferencesSchema = z.object({
  in_app: z.boolean(),
  email: z.boolean(),
  sms: z.boolean(),
  whatsapp: z.boolean(),
  push: z.boolean(),
  meeting_reminders: z.boolean(),
  task_reminders: z.boolean(),
  help_alerts: z.boolean(),
});

export const helpCreateSchema = z.object({
  organizationId: z.string().min(1),
  clientRequestId: uuidish,
  requestType: short.default('Urgent Assistance'),
  subject: short,
  description: medium,
  location: short,
  priority: priorityEnum.default('urgent'),
  channel: z.string().trim().max(50).default('in_app'),
});
export const helpStatusSchema = z.object({
  status: helpStatusEnum,
  comment: optionalText,
  resolutionNote: optionalText,
});
export const helpUpdateSchema = z.object({
  kind: z.enum(['progress', 'follow_up', 'note']).default('progress'),
  message: medium,
});
export const contactLogSchema = z.object({
  channel: z.enum(['call', 'sms', 'whatsapp', 'in_app']),
  contactUserId: z.string().min(1).optional().nullable(),
  note: optionalText,
});

export const meetingCreateSchema = z.object({
  organizationId: z.string().min(1),
  title: short,
  meetingType: meetingTypeEnum.default('school_executive'),
  status: z.enum(['requested', 'scheduled']).default('scheduled'),
  startsAt: dateTime,
  endsAt: z.string().optional().nullable(),
  venue: short.default('To be confirmed'),
  chairperson: optionalShort,
  agenda: long.default(''),
  attendeeIds: z.array(z.string().min(1)).default([]),
});
export const meetingUpdateSchema = z.object({
  title: short.optional(),
  meetingType: meetingTypeEnum.optional(),
  status: meetingStatusEnum.optional(),
  startsAt: dateTime.optional(),
  endsAt: z.string().optional().nullable(),
  venue: short.optional(),
  chairperson: optionalShort,
  agenda: long.optional(),
  discussions: long.optional(),
  minutes: long.optional(),
  minutesStatus: z.enum(['not_started', 'draft', 'pending_approval', 'approved']).optional(),
});
export const attendanceSchema = z.object({
  attendeeIds: z.array(z.string().min(1)).default([]),
  rsvpStatus: z.enum(['pending', 'confirmed', 'declined', 'apology']).optional(),
  attendance: z.enum(['unknown', 'present', 'absent', 'apology']).optional(),
  userId: z.string().min(1).optional(),
  note: z.string().trim().max(500).optional(),
});
export const attendanceSignInSchema = z.object({
  meetingId: z.string().min(1),
  userId: z.string().min(1),
  attendance: z.enum(['unknown', 'present', 'absent', 'apology']),
  note: z.string().trim().max(500).optional(),
});
export const documentSubmissionSubmitSchema = z.object({
  recipientId: z.string().min(1),
});
export const documentSubmissionUpdateSchema = z.object({
  status: z.enum(['active', 'received', 'reviewed', 'archived']),
});
export const resolutionSchema = z.object({
  title: short,
  description: long.default(''),
  movedBy: optionalShort,
  secondedBy: optionalShort,
  status: z.enum(['proposed', 'adopted', 'rejected', 'implemented']).default('adopted'),
  dueDate: dateOnly.optional().nullable(),
  createTask: z.boolean().default(false),
  taskAssigneeId: z.string().min(1).optional().nullable(),
  taskDueDate: dateTime.optional().nullable(),
});

export const taskCreateSchema = z.object({
  organizationId: z.string().min(1),
  title: short,
  description: long.default(''),
  meetingId: z.string().min(1).optional().nullable(),
  resolutionId: z.string().min(1).optional().nullable(),
  assignedTo: z.string().min(1),
  priority: priorityEnum.default('normal'),
  dueDate: dateTime,
});
export const taskUpdateSchema = z.object({
  title: short.optional(),
  description: long.optional(),
  assignedTo: z.string().min(1).optional(),
  priority: priorityEnum.optional(),
  status: taskStatusEnum.optional(),
  progress: z.number().min(0).max(100).optional(),
  dueDate: dateTime.optional(),
  completionNote: optionalText,
  comment: optionalText,
});
export const taskCommentSchema = z.object({ comment: medium });

export const documentCreateSchema = z.object({
  organizationId: z.string().min(1),
  title: short,
  kind: documentKindEnum.default('letter'),
  category: optionalShort,
  subject: optionalShort,
  recipient: optionalShort,
  content: long.default(''),
  tags: optionalShort,
  templateId: z.string().min(1).optional().nullable(),
  meetingId: z.string().min(1).optional().nullable(),
  status: z.enum(['draft', 'pending_approval']).default('draft'),
});
export const documentUpdateSchema = z.object({
  title: short.optional(),
  kind: documentKindEnum.optional(),
  category: optionalShort,
  subject: optionalShort,
  recipient: optionalShort,
  content: long.optional(),
  tags: optionalShort,
  status: documentStatusEnum.optional(),
  changeNote: optionalShort,
});
export const documentReviewSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'revisions_requested']),
  comment: z.string().trim().max(2000).default(''),
});
export const templateSchema = z.object({
  organizationId: z.string().min(1).optional().nullable(),
  name: short,
  type: templateTypeEnum,
  description: z.string().trim().max(1000).default(''),
  body: long.min(1, 'Template content is required.'),
  isShared: z.boolean().default(true),
});
export const correspondenceCreateSchema = z.object({
  organizationId: z.string().min(1),
  direction: z.enum(['incoming', 'outgoing']),
  subject: short,
  sender: short,
  recipient: short,
  documentId: z.string().min(1).optional().nullable(),
  status: z.enum(['draft', 'pending_approval', 'approved', 'sent', 'answered', 'archived']).default('draft'),
  receivedAt: dateTime,
  responseDueAt: dateTime.optional().nullable(),
  followUpAt: dateTime.optional().nullable(),
  deliveryDetails: long.default(''),
  responseNotes: long.default(''),
});
export const correspondenceUpdateSchema = correspondenceCreateSchema.partial().omit({ organizationId: true });

export const calendarSchema = z.object({
  organizationId: z.string().min(1).optional(),
  title: short,
  type: calendarTypeEnum.default('activity'),
  startsAt: dateTime,
  endsAt: dateTime.optional().nullable(),
  location: optionalShort,
  notes: long.default(''),
  meetingId: z.string().min(1).optional().nullable(),
});

export const reportCreateSchema = z.object({
  organizationId: z.string().min(1),
  reportType: reportTypeEnum,
  periodStart: dateOnly,
  periodEnd: dateOnly,
  title: optionalShort,
  executiveSummary: long.optional(),
});
export const reportUpdateSchema = z.object({
  title: short.optional(),
  executiveSummary: long.optional(),
  sections: z.array(z.object({
    key: z.string(),
    title: z.string(),
    summary: z.string(),
    columns: z.array(z.object({ key: z.string(), label: z.string() })),
    records: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
  })).optional(),
  limitations: long.optional(),
  status: z.enum(['draft', 'final']).optional(),
});
export const briefingCreateSchema = z.object({
  organizationId: z.string().min(1),
  periodStart: dateOnly,
  periodEnd: dateOnly,
  title: optionalShort,
});

export const announcementSchema = z.object({
  organizationId: z.string().min(1),
  title: short,
  body: medium,
  audience: z.enum(['all', 'executives', 'secretaries']).default('all'),
  isPinned: z.boolean().default(false),
});
export const messageSchema = z.object({
  organizationId: z.string().min(1),
  recipientId: z.string().min(1),
  subject: optionalShort,
  body: medium,
  helpRequestId: z.string().min(1).optional().nullable(),
});
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
export const orgSettingsSchema = z.object({
  letterheadName: z.string().trim().max(500),
  address: z.string().trim().max(500),
  phone: z.string().trim().max(50),
  email: z.string().trim().max(200),
  motto: z.string().trim().max(200),
  region: z.string().trim().max(100),
});

export const adminUserCreateSchema = z.object({
  name: short,
  email,
  role: roleEnum,
  position: short,
  organization: short,
  phone,
  whatsappNumber: z.string().trim().max(30).optional().nullable(),
  committee: optionalShort,
  responsibilities: z.string().trim().max(1000).default(''),
  organizationIds: z.array(z.string().min(1)).min(1, 'Select at least one organization.'),
  isPrimarySecretary: z.boolean().default(false),
  canViewConsolidated: z.boolean().default(false),
  activateByLink: z.boolean().default(true),
  temporaryPassword: z.string().min(10).max(200).optional(),
});
export const adminUserUpdateSchema = z.object({
  name: short.optional(),
  role: roleEnum.optional(),
  position: short.optional(),
  organization: short.optional(),
  phone: phone.optional(),
  whatsappNumber: z.string().trim().max(30).optional().nullable(),
  committee: optionalShort,
  responsibilities: medium.optional(),
  isActive: z.boolean().optional(),
  organizationIds: z.array(z.string().min(1)).min(1).optional(),
});

export function normalizeDateTime(value: string | null | undefined, fallback?: string | null): string | null {
  if (!value) return fallback ?? null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback ?? null;
  return parsed.toISOString();
}

export function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

export { roleEnum, priorityEnum, helpStatusEnum, taskStatusEnum, documentKindEnum, documentStatusEnum, reportTypeEnum, dateOnly, dateTime };

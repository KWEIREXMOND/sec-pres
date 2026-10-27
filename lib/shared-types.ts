export type Role =
  | 'zonal_president'
  | 'school_president'
  | 'zonal_secretary'
  | 'school_secretary'
  | 'vice_president'
  | 'executive'
  | 'system_admin';

export type OrganizationType = 'school' | 'zonal' | 'system';
export type MembershipRole = 'primary' | 'delegate' | 'observer' | 'consolidated_viewer';
export type WorkspaceStatus = 'active' | 'archived';

export interface Organization {
  id: string;
  name: string;
  type: OrganizationType;
  parent_id: string | null;
  code: string;
  letterhead_name: string;
  address: string;
  phone: string;
  email: string;
  motto: string;
  region: string;
  status: WorkspaceStatus;
  created_at: string;
}

export interface OrganizationMember {
  organization_id: string;
  user_id: string;
  membership_role: MembershipRole;
  is_primary_secretary: boolean;
  can_view_consolidated: boolean;
  created_at: string;
}

export interface User {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  role: Role;
  position: string;
  organization: string;
  phone: string;
  whatsapp_number: string | null;
  committee: string | null;
  responsibilities: string | null;
  avatar_color: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthUser extends User {
  organizations: Array<Organization & { membership_role: MembershipRole; can_view_consolidated: boolean; is_primary_secretary: boolean }>;
  permissions: string[];
  csrf_token: string;
  realtime: {
    mode: 'sse' | 'supabase';
    url?: string;
    anon_key?: string;
    channel?: string;
  };
}

export interface UserSession {
  id: string;
  user_id: string;
  device: string;
  ip_address: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  is_current: boolean;
}

export interface NotificationPreferences {
  in_app: boolean;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  push: boolean;
  meeting_reminders: boolean;
  task_reminders: boolean;
  help_alerts: boolean;
}

export interface Notification {
  id: string;
  user_id: string;
  organization_id: string | null;
  type: string;
  title: string;
  body: string;
  link: string | null;
  severity: 'info' | 'success' | 'warning' | 'critical';
  is_read: boolean;
  read_at: string | null;
  dedupe_key: string | null;
  created_at: string;
}

export interface DeliveryLog {
  id: string;
  notification_id: string | null;
  user_id: string;
  channel: 'in_app' | 'email' | 'sms' | 'whatsapp' | 'push';
  provider: string;
  status: 'delivered' | 'sent' | 'pending' | 'failed' | 'not_configured' | 'skipped';
  recipient: string;
  attempts: number;
  provider_message_id: string | null;
  last_error: string | null;
  sent_at: string | null;
  next_retry_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  organization_id: string;
  sender_id: string;
  recipient_id: string;
  subject: string;
  body: string;
  help_request_id: string | null;
  delivered_at: string;
  read_at: string | null;
  created_at: string;
  sender_name?: string;
  sender_role?: Role;
  recipient_name?: string;
}

export interface Announcement {
  id: string;
  organization_id: string;
  author_id: string;
  title: string;
  body: string;
  audience: 'all' | 'executives' | 'secretaries';
  is_pinned: boolean;
  created_at: string;
  author_name?: string;
}

export type HelpStatus = 'new' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed';
export type Priority = 'low' | 'normal' | 'high' | 'urgent' | 'critical';

export interface HelpRequest {
  id: string;
  organization_id: string;
  requester_id: string;
  assigned_to: string | null;
  client_request_id: string;
  reference: string;
  request_type: string;
  subject: string;
  description: string;
  location: string;
  priority: Priority;
  status: HelpStatus;
  channel: string;
  submitted_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  resolution_note: string | null;
  escalation_level: number;
  last_escalated_at: string | null;
  created_at: string;
  updated_at: string;
  requester_name?: string;
  requester_role?: Role;
  requester_phone?: string;
  assignee_name?: string;
  assignee_phone?: string;
  attachments?: Attachment[];
  updates?: HelpUpdate[];
  history?: HelpStatusEvent[];
  contact_logs?: ContactLog[];
}

export interface HelpUpdate {
  id: string;
  help_request_id: string;
  user_id: string;
  kind: 'progress' | 'follow_up' | 'note';
  message: string;
  created_at: string;
  user_name?: string;
}

export interface HelpStatusEvent {
  id: string;
  help_request_id: string;
  event_type: 'status_change' | 'escalation' | 'created' | 'reopened';
  previous_status: HelpStatus | null;
  new_status: HelpStatus | null;
  actor_id: string;
  comment: string | null;
  created_at: string;
  actor_name?: string;
}

export interface ContactLog {
  id: string;
  help_request_id: string;
  user_id: string;
  contact_user_id: string | null;
  channel: 'call' | 'sms' | 'whatsapp' | 'in_app';
  note: string;
  created_at: string;
  user_name?: string;
}

export type MeetingStatus = 'requested' | 'scheduled' | 'completed' | 'cancelled' | 'archived';
export type MeetingType = 'school_executive' | 'zonal_executive' | 'general' | 'committee' | 'emergency' | 'programme';

export interface MeetingAttendee {
  id: string;
  meeting_id: string;
  user_id: string;
  rsvp_status: 'pending' | 'confirmed' | 'declined' | 'apology';
  attendance: 'unknown' | 'present' | 'absent' | 'apology';
  check_in_at: string | null;
  signed_in_by: string | null;
  signed_in_by_name?: string | null;
  signed_in_note: string;
  user_name?: string;
  user_role?: Role;
  user_position?: string;
}

export type AttendanceSignInStatus = 'unknown' | 'present' | 'absent' | 'apology';

export interface AttendanceMeetingOption {
  id: string;
  title: string;
  starts_at: string;
  venue: string;
  status: MeetingStatus;
}

export interface AttendanceExecutive {
  id: string;
  name: string;
  role: Role;
  position: string;
  avatar_color: string;
  rsvp_status: 'pending' | 'confirmed' | 'declined' | 'apology';
  attendance: AttendanceSignInStatus;
  check_in_at: string | null;
  signed_in_by: string | null;
  signed_in_by_name: string | null;
  signed_in_note: string;
}

export interface AttendanceRecentSignIn {
  id: string;
  meeting_id: string;
  meeting_title: string;
  user_id: string;
  user_name: string;
  attendance: Exclude<AttendanceSignInStatus, 'unknown'>;
  check_in_at: string;
  signed_in_by_name: string | null;
  signed_in_note: string;
}

export interface AttendanceSignInData {
  meetings: AttendanceMeetingOption[];
  selectedMeetingId: string;
  executives: AttendanceExecutive[];
  summary: { total: number; present: number; absent: number; apology: number; pending: number };
  recentSignIns: AttendanceRecentSignIn[];
  canSignIn: boolean;
  monitors: string[];
}

export interface Meeting {
  id: string;
  organization_id: string;
  title: string;
  meeting_type: MeetingType;
  status: MeetingStatus;
  starts_at: string;
  ends_at: string | null;
  venue: string;
  chairperson: string;
  agenda: string;
  discussions: string;
  minutes: string;
  minutes_status: 'not_started' | 'draft' | 'pending_approval' | 'approved';
  created_by: string;
  created_at: string;
  updated_at: string;
  attendees?: MeetingAttendee[];
  resolutions?: Resolution[];
  tasks?: Task[];
}

export interface Resolution {
  id: string;
  organization_id: string;
  meeting_id: string | null;
  reference: string;
  title: string;
  description: string;
  moved_by: string;
  seconded_by: string;
  status: 'proposed' | 'adopted' | 'rejected' | 'implemented';
  due_date: string | null;
  created_by: string;
  created_at: string;
}

export type TaskStatus = 'pending' | 'in_progress' | 'awaiting_review' | 'completed' | 'overdue';

export interface Task {
  id: string;
  organization_id: string;
  meeting_id: string | null;
  resolution_id: string | null;
  title: string;
  description: string;
  assigned_to: string;
  assigned_by: string;
  priority: Priority;
  status: TaskStatus;
  progress: number;
  due_date: string;
  completed_at: string | null;
  completion_note: string | null;
  created_at: string;
  updated_at: string;
  assignee_name?: string;
  assigner_name?: string;
  meeting_title?: string;
  comments?: TaskComment[];
  attachments?: Attachment[];
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  comment: string;
  created_at: string;
  user_name?: string;
}

export type DocumentKind = 'letter' | 'notice' | 'circular' | 'memo' | 'minutes' | 'report' | 'proposal' | 'event_plan' | 'policy' | 'constitution' | 'handover' | 'other';
export type DocumentStatus = 'draft' | 'pending_approval' | 'approved' | 'sent' | 'answered' | 'revisions_requested' | 'rejected' | 'archived';

export interface DocumentRecord {
  id: string;
  organization_id: string;
  title: string;
  kind: DocumentKind;
  category: string;
  reference: string;
  subject: string;
  recipient: string;
  content: string;
  tags: string;
  status: DocumentStatus;
  template_id: string | null;
  meeting_id: string | null;
  created_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  author_name?: string;
  reviewer_name?: string;
  attachments?: Attachment[];
  versions?: DocumentVersion[];
  reviews?: DocumentReview[];
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  organization_id: string;
  version: number;
  title: string;
  content: string;
  changed_by: string;
  change_note: string;
  created_at: string;
  changed_by_name?: string;
}

export interface DocumentReview {
  id: string;
  document_id: string;
  organization_id: string;
  reviewer_id: string;
  decision: 'approved' | 'rejected' | 'revisions_requested';
  comment: string;
  created_at: string;
  reviewer_name?: string;
}

export type TemplateType = 'letter' | 'notice' | 'agenda' | 'minutes' | 'memo' | 'report';

export interface Template {
  id: string;
  organization_id: string;
  name: string;
  type: TemplateType;
  description: string;
  body: string;
  is_shared: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  author_name?: string;
}

export type CorrespondenceDirection = 'incoming' | 'outgoing';
export type CorrespondenceStatus = 'draft' | 'pending_approval' | 'approved' | 'sent' | 'answered' | 'archived';

export interface Correspondence {
  id: string;
  organization_id: string;
  direction: CorrespondenceDirection;
  reference: string;
  subject: string;
  sender: string;
  recipient: string;
  document_id: string | null;
  status: CorrespondenceStatus;
  received_at: string;
  dispatched_at: string | null;
  response_due_at: string | null;
  follow_up_at: string | null;
  delivery_details: string;
  response_notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  attachments?: Attachment[];
}

export type CalendarEventType = 'meeting' | 'appointment' | 'school_event' | 'zonal_programme' | 'deadline' | 'activity';

export interface CalendarEvent {
  id: string;
  organization_id: string;
  title: string;
  type: CalendarEventType;
  starts_at: string;
  ends_at: string | null;
  location: string;
  notes: string;
  meeting_id: string | null;
  created_by: string;
  created_at: string;
}

export interface Attachment {
  id: string;
  organization_id: string;
  entity_type: 'help_request' | 'document' | 'task' | 'correspondence' | 'meeting' | 'document_submission';
  entity_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  storage_provider: 'database' | 'supabase';
  created_at: string;
}

export type DocumentDeliveryMode = 'kept' | 'submitted';
export type DocumentSubmissionStatus = 'active' | 'received' | 'reviewed' | 'archived';

export interface DocumentSubmissionPerson {
  id: string;
  name: string;
  position: string;
  role: Role;
}

export interface DocumentSubmission {
  id: string;
  organization_id: string;
  reference: string;
  title: string;
  description: string;
  delivery_mode: DocumentDeliveryMode;
  status: DocumentSubmissionStatus;
  sender_id: string;
  recipient_id: string | null;
  attachment_id: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sender_name: string;
  recipient_name: string | null;
  submitted_at: string | null;
  viewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportMetric {
  label: string;
  value: number | string;
  hint?: string;
}

export interface ReportSection {
  key: string;
  title: string;
  summary: string;
  records: Array<Record<string, string | number | null>>;
  columns: Array<{ key: string; label: string }>;
}

export interface ReportContent {
  title: string;
  executive_summary: string;
  metrics: ReportMetric[];
  sections: ReportSection[];
  limitations: string;
  source_record_count: number;
}

export type ReportStatus = 'draft' | 'final';

export interface Report {
  id: string;
  organization_id: string;
  report_type: string;
  title: string;
  period_start: string;
  period_end: string;
  status: ReportStatus;
  content: ReportContent;
  generated_by: string;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
  author_name?: string;
}

export interface BriefingContent {
  title: string;
  overview: string;
  key_messages: string[];
  meetings: Array<Record<string, string | number | null>>;
  tasks: Array<Record<string, string | number | null>>;
  approvals: Array<Record<string, string | number | null>>;
  calendar: Array<Record<string, string | number | null>>;
  help_requests: Array<Record<string, string | number | null>>;
  source_record_count: number;
}

export interface BriefingPack {
  id: string;
  organization_id: string;
  title: string;
  period_start: string;
  period_end: string;
  content: BriefingContent;
  compiled_by: string;
  created_at: string;
  author_name?: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  organization_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string;
  user_agent: string;
  created_at: string;
  actor_name?: string;
}

export interface AdminUser extends User {
  organization_ids: string[];
  session_count: number;
}

export interface DashboardData {
  role: Role;
  organization: Organization;
  greeting_name: string;
  current_date: string;
  stats: Array<{ key: string; label: string; value: number; tone: 'navy' | 'gold' | 'red' | 'green'; hint: string }>;
  help_requests: HelpRequest[];
  approvals: DocumentRecord[];
  tasks: Task[];
  meetings: Meeting[];
  calendar: CalendarEvent[];
  announcements: Announcement[];
  notifications: Notification[];
  deadlines: Array<{ id: string; label: string; due_date: string; type: 'task' | 'correspondence' | 'meeting'; link: string }>;
  recent_activity: AuditLog[];
  unread_messages: number;
  pending_correspondence: number;
}

export interface DirectoryEntry extends User {
  membership_role: MembershipRole;
  is_primary_secretary: boolean;
}

export interface ConsolidatedReportRow {
  organization_id: string;
  organization_name: string;
  organization_type: OrganizationType;
  parent_id: string | null;
  meeting_count: number;
  completed_task_count: number;
  overdue_task_count: number;
  new_help_count: number;
  resolved_help_count: number;
  approved_document_count: number;
  pending_document_count: number;
  correspondence_count: number;
}

export interface SearchResult {
  id: string;
  type: 'help' | 'meeting' | 'document' | 'task' | 'correspondence' | 'report' | 'user';
  title: string;
  subtitle: string;
  link: string;
  badge?: string;
}

export interface ApiError {
  error: string;
  details?: unknown;
}

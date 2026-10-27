-- Tema Secondary School SRC Supabase migration 0001
-- Apply in the Supabase SQL editor or with `supabase db push`.
-- This file combines the local PostgreSQL schema and row-level security policies.

-- Tema Secondary School SRC local PostgreSQL schema.
-- IDs are application-generated UUID strings so the same SQL works on PGlite and Supabase.

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('school', 'zonal', 'system')),
  parent_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  code TEXT NOT NULL UNIQUE,
  letterhead_name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  motto TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  auth_user_id TEXT UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('zonal_president', 'school_president', 'zonal_secretary', 'school_secretary', 'vice_president', 'executive', 'system_admin')),
  position TEXT NOT NULL DEFAULT '',
  organization TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  whatsapp_number TEXT,
  committee TEXT,
  responsibilities TEXT,
  avatar_color TEXT NOT NULL DEFAULT '#0b1f3a',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_members (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_role TEXT NOT NULL DEFAULT 'primary' CHECK (membership_role IN ('primary', 'delegate', 'observer', 'consolidated_viewer')),
  is_primary_secretary BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_consolidated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  realtime_token TEXT NOT NULL UNIQUE,
  device TEXT NOT NULL DEFAULT '',
  ip_address TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('password_reset', 'account_activation')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  in_app BOOLEAN NOT NULL DEFAULT TRUE,
  email BOOLEAN NOT NULL DEFAULT TRUE,
  sms BOOLEAN NOT NULL DEFAULT FALSE,
  whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
  push BOOLEAN NOT NULL DEFAULT TRUE,
  meeting_reminders BOOLEAN NOT NULL DEFAULT TRUE,
  task_reminders BOOLEAN NOT NULL DEFAULT TRUE,
  help_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'critical')),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  dedupe_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id TEXT PRIMARY KEY,
  notification_id TEXT REFERENCES notifications(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'sms', 'whatsapp', 'push')),
  provider TEXT NOT NULL DEFAULT 'none',
  status TEXT NOT NULL CHECK (status IN ('delivered', 'sent', 'pending', 'failed', 'not_configured', 'skipped')),
  recipient TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  provider_message_id TEXT,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  help_request_id TEXT,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'executives', 'secretaries')),
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS help_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  client_request_id TEXT NOT NULL UNIQUE,
  reference TEXT NOT NULL UNIQUE,
  request_type TEXT NOT NULL DEFAULT 'Urgent Assistance',
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  location TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'urgent' CHECK (priority IN ('low', 'normal', 'high', 'urgent', 'critical')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'in_progress', 'resolved', 'closed')),
  channel TEXT NOT NULL DEFAULT 'in_app',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  resolution_note TEXT,
  escalation_level INTEGER NOT NULL DEFAULT 0,
  last_escalated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS help_status_history (
  id TEXT PRIMARY KEY,
  help_request_id TEXT NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('status_change', 'escalation', 'created', 'reopened')),
  previous_status TEXT,
  new_status TEXT,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS help_updates (
  id TEXT PRIMARY KEY,
  help_request_id TEXT NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL DEFAULT 'progress' CHECK (kind IN ('progress', 'follow_up', 'note')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_logs (
  id TEXT PRIMARY KEY,
  help_request_id TEXT NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  contact_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('call', 'sms', 'whatsapp', 'in_app')),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  meeting_type TEXT NOT NULL DEFAULT 'school_executive' CHECK (meeting_type IN ('school_executive', 'zonal_executive', 'general', 'committee', 'emergency', 'programme')),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('requested', 'scheduled', 'completed', 'cancelled', 'archived')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  venue TEXT NOT NULL DEFAULT '',
  chairperson TEXT NOT NULL DEFAULT '',
  agenda TEXT NOT NULL DEFAULT '',
  discussions TEXT NOT NULL DEFAULT '',
  minutes TEXT NOT NULL DEFAULT '',
  minutes_status TEXT NOT NULL DEFAULT 'not_started' CHECK (minutes_status IN ('not_started', 'draft', 'pending_approval', 'approved')),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_attendees (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rsvp_status TEXT NOT NULL DEFAULT 'pending' CHECK (rsvp_status IN ('pending', 'confirmed', 'declined', 'apology')),
  attendance TEXT NOT NULL DEFAULT 'unknown' CHECK (attendance IN ('unknown', 'present', 'absent', 'apology')),
  check_in_at TIMESTAMPTZ,
  signed_in_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  signed_in_note TEXT NOT NULL DEFAULT '',
  UNIQUE (meeting_id, user_id)
);

CREATE TABLE IF NOT EXISTS resolutions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  meeting_id TEXT REFERENCES meetings(id) ON DELETE CASCADE,
  reference TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  moved_by TEXT NOT NULL DEFAULT '',
  seconded_by TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'adopted' CHECK (status IN ('proposed', 'adopted', 'rejected', 'implemented')),
  due_date DATE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  meeting_id TEXT REFERENCES meetings(id) ON DELETE SET NULL,
  resolution_id TEXT REFERENCES resolutions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  assigned_to TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent', 'critical')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'awaiting_review', 'completed', 'overdue')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  due_date TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  completion_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'letter' CHECK (kind IN ('letter', 'notice', 'circular', 'memo', 'minutes', 'report', 'proposal', 'event_plan', 'policy', 'constitution', 'handover', 'other')),
  category TEXT NOT NULL DEFAULT 'General',
  reference TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL DEFAULT '',
  recipient TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent', 'answered', 'revisions_requested', 'rejected', 'archived')),
  template_id TEXT,
  meeting_id TEXT REFERENCES meetings(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_comment TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  changed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  change_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, version)
);

CREATE TABLE IF NOT EXISTS document_reviews (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'revisions_requested')),
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('letter', 'notice', 'agenda', 'minutes', 'memo', 'report')),
  description TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  is_shared BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS correspondence (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  reference TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent', 'answered', 'archived')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispatched_at TIMESTAMPTZ,
  response_due_at TIMESTAMPTZ,
  follow_up_at TIMESTAMPTZ,
  delivery_details TEXT NOT NULL DEFAULT '',
  response_notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'activity' CHECK (type IN ('meeting', 'appointment', 'school_event', 'zonal_programme', 'deadline', 'activity')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  meeting_id TEXT REFERENCES meetings(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('help_request', 'document', 'task', 'correspondence', 'meeting', 'document_submission')),
  entity_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  storage_provider TEXT NOT NULL DEFAULT 'database' CHECK (storage_provider IN ('database', 'supabase')),
  storage_path TEXT,
  content_base64 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_submissions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reference TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  delivery_mode TEXT NOT NULL DEFAULT 'kept' CHECK (delivery_mode IN ('kept', 'submitted')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'received', 'reviewed', 'archived')),
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recipient_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  attachment_id TEXT REFERENCES attachments(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final')),
  content JSONB NOT NULL,
  generated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS briefing_packs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  content JSONB NOT NULL,
  compiled_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deliveries_retry ON notification_deliveries(status, next_retry_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deliveries_notification_channel
  ON notification_deliveries(notification_id, channel)
  WHERE notification_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_help_org_status ON help_requests(organization_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_help_assigned ON help_requests(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_meetings_org_date ON meetings(organization_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_tasks_org_due ON tasks(organization_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_documents_org_status ON documents(organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_correspondence_org ON correspondence(organization_id, status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_calendar_org_date ON calendar_events(organization_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(organization_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_document_submissions_sender ON document_submissions(organization_id, sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_submissions_recipient ON document_submissions(organization_id, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_org_date ON audit_logs(organization_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_help_updated ON help_requests;
CREATE TRIGGER trg_help_updated BEFORE UPDATE ON help_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_meetings_updated ON meetings;
CREATE TRIGGER trg_meetings_updated BEFORE UPDATE ON meetings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_tasks_updated ON tasks;
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_documents_updated ON documents;
CREATE TRIGGER trg_documents_updated BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_templates_updated ON templates;
CREATE TRIGGER trg_templates_updated BEFORE UPDATE ON templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_correspondence_updated ON correspondence;
CREATE TRIGGER trg_correspondence_updated BEFORE UPDATE ON correspondence FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_reports_updated ON reports;
CREATE TRIGGER trg_reports_updated BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_prefs_updated ON notification_preferences;
CREATE TRIGGER trg_prefs_updated BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_deliveries_updated ON notification_deliveries;
CREATE TRIGGER trg_deliveries_updated BEFORE UPDATE ON notification_deliveries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_document_submissions_updated ON document_submissions;
CREATE TRIGGER trg_document_submissions_updated BEFORE UPDATE ON document_submissions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Idempotent upgrades for databases created before the Tema sign-in and
-- document-submission features were added.
ALTER TABLE meeting_attendees ADD COLUMN IF NOT EXISTS signed_in_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE meeting_attendees ADD COLUMN IF NOT EXISTS signed_in_note TEXT NOT NULL DEFAULT '';
ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_entity_type_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_entity_type_check
  CHECK (entity_type IN ('help_request', 'document', 'task', 'correspondence', 'meeting', 'document_submission'));

-- Supabase row-level security policies.
-- The Next.js server uses the service-role key for privileged workflows.
-- These policies protect direct client access made with an authenticated JWT.

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid()::text LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = auth.uid()::text
      AND role = 'system_admin'
      AND is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_organization(p_organization_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = public.current_app_user_id()
  );
$$;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE correspondence ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefing_packs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizations_access" ON organizations;
CREATE POLICY "organizations_access" ON organizations FOR ALL TO authenticated
  USING (public.is_system_admin() OR public.can_access_organization(id))
  WITH CHECK (public.is_system_admin() OR public.can_access_organization(id));

DROP POLICY IF EXISTS "users_access" ON users;
CREATE POLICY "users_access" ON users FOR ALL TO authenticated
  USING (
    public.is_system_admin()
    OR id = public.current_app_user_id()
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = users.id
        AND public.can_access_organization(om.organization_id)
    )
  )
  WITH CHECK (public.is_system_admin() OR id = public.current_app_user_id());

DROP POLICY IF EXISTS "members_access" ON organization_members;
CREATE POLICY "members_access" ON organization_members FOR ALL TO authenticated
  USING (public.is_system_admin() OR user_id = public.current_app_user_id() OR public.can_access_organization(organization_id))
  WITH CHECK (public.is_system_admin() OR public.can_access_organization(organization_id));

DROP POLICY IF EXISTS "sessions_own" ON sessions;
CREATE POLICY "sessions_own" ON sessions FOR ALL TO authenticated
  USING (public.is_system_admin() OR user_id = public.current_app_user_id())
  WITH CHECK (public.is_system_admin() OR user_id = public.current_app_user_id());

-- Password and activation tokens are handled only by the server service role.
DROP POLICY IF EXISTS "password_tokens_denied" ON password_tokens;
CREATE POLICY "password_tokens_denied" ON password_tokens FOR ALL TO authenticated
  USING (FALSE) WITH CHECK (FALSE);

DROP POLICY IF EXISTS "audit_logs_access" ON audit_logs;
CREATE POLICY "audit_logs_access" ON audit_logs FOR SELECT TO authenticated
  USING (public.is_system_admin() OR actor_id = public.current_app_user_id() OR public.can_access_organization(organization_id));
DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_system_admin() OR actor_id = public.current_app_user_id());

DROP POLICY IF EXISTS "preferences_own" ON notification_preferences;
CREATE POLICY "preferences_own" ON notification_preferences FOR ALL TO authenticated
  USING (public.is_system_admin() OR user_id = public.current_app_user_id())
  WITH CHECK (public.is_system_admin() OR user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "notifications_own" ON notifications;
CREATE POLICY "notifications_own" ON notifications FOR ALL TO authenticated
  USING (public.is_system_admin() OR user_id = public.current_app_user_id())
  WITH CHECK (public.is_system_admin() OR user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "deliveries_own" ON notification_deliveries;
CREATE POLICY "deliveries_own" ON notification_deliveries FOR ALL TO authenticated
  USING (public.is_system_admin() OR user_id = public.current_app_user_id())
  WITH CHECK (public.is_system_admin() OR user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "push_subscriptions_own" ON push_subscriptions;
CREATE POLICY "push_subscriptions_own" ON push_subscriptions FOR ALL TO authenticated
  USING (public.is_system_admin() OR user_id = public.current_app_user_id())
  WITH CHECK (public.is_system_admin() OR user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "messages_access" ON messages;
CREATE POLICY "messages_access" ON messages FOR ALL TO authenticated
  USING (public.is_system_admin() OR sender_id = public.current_app_user_id() OR recipient_id = public.current_app_user_id())
  WITH CHECK (public.is_system_admin() OR (sender_id = public.current_app_user_id() AND public.can_access_organization(organization_id)));

DROP POLICY IF EXISTS "announcements_access" ON announcements;
CREATE POLICY "announcements_access" ON announcements FOR ALL TO authenticated
  USING (public.is_system_admin() OR public.can_access_organization(organization_id))
  WITH CHECK (public.is_system_admin() OR public.can_access_organization(organization_id));

DROP POLICY IF EXISTS "help_access" ON help_requests;
CREATE POLICY "help_access" ON help_requests FOR ALL TO authenticated
  USING (public.is_system_admin() OR requester_id = public.current_app_user_id() OR assigned_to = public.current_app_user_id() OR public.can_access_organization(organization_id))
  WITH CHECK (public.is_system_admin() OR (requester_id = public.current_app_user_id() AND public.can_access_organization(organization_id)));

DROP POLICY IF EXISTS "help_history_access" ON help_status_history;
CREATE POLICY "help_history_access" ON help_status_history FOR ALL TO authenticated
  USING (public.is_system_admin() OR EXISTS (SELECT 1 FROM help_requests h WHERE h.id = help_request_id AND (h.requester_id = public.current_app_user_id() OR h.assigned_to = public.current_app_user_id() OR public.can_access_organization(h.organization_id))))
  WITH CHECK (public.is_system_admin() OR EXISTS (SELECT 1 FROM help_requests h WHERE h.id = help_request_id AND public.can_access_organization(h.organization_id)));

DROP POLICY IF EXISTS "help_updates_access" ON help_updates;
CREATE POLICY "help_updates_access" ON help_updates FOR ALL TO authenticated
  USING (public.is_system_admin() OR user_id = public.current_app_user_id() OR EXISTS (SELECT 1 FROM help_requests h WHERE h.id = help_request_id AND public.can_access_organization(h.organization_id)))
  WITH CHECK (public.is_system_admin() OR user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "contact_logs_access" ON contact_logs;
CREATE POLICY "contact_logs_access" ON contact_logs FOR ALL TO authenticated
  USING (public.is_system_admin() OR EXISTS (SELECT 1 FROM help_requests h WHERE h.id = help_request_id AND public.can_access_organization(h.organization_id)))
  WITH CHECK (public.is_system_admin() OR user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "meetings_access" ON meetings;
CREATE POLICY "meetings_access" ON meetings FOR ALL TO authenticated
  USING (public.is_system_admin() OR public.can_access_organization(organization_id))
  WITH CHECK (public.is_system_admin() OR public.can_access_organization(organization_id));

DROP POLICY IF EXISTS "meeting_attendees_access" ON meeting_attendees;
CREATE POLICY "meeting_attendees_access" ON meeting_attendees FOR ALL TO authenticated
  USING (public.is_system_admin() OR user_id = public.current_app_user_id() OR EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_id AND public.can_access_organization(m.organization_id)))
  WITH CHECK (public.is_system_admin() OR EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_id AND public.can_access_organization(m.organization_id)));

DROP POLICY IF EXISTS "resolutions_access" ON resolutions;
CREATE POLICY "resolutions_access" ON resolutions FOR ALL TO authenticated
  USING (public.is_system_admin() OR public.can_access_organization(organization_id))
  WITH CHECK (public.is_system_admin() OR public.can_access_organization(organization_id));

DROP POLICY IF EXISTS "tasks_access" ON tasks;
CREATE POLICY "tasks_access" ON tasks FOR ALL TO authenticated
  USING (public.is_system_admin() OR assigned_to = public.current_app_user_id() OR assigned_by = public.current_app_user_id() OR public.can_access_organization(organization_id))
  WITH CHECK (public.is_system_admin() OR public.can_access_organization(organization_id));

DROP POLICY IF EXISTS "task_comments_access" ON task_comments;
CREATE POLICY "task_comments_access" ON task_comments FOR ALL TO authenticated
  USING (public.is_system_admin() OR EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND public.can_access_organization(t.organization_id)))
  WITH CHECK (public.is_system_admin() OR user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "task_events_access" ON task_events;
CREATE POLICY "task_events_access" ON task_events FOR SELECT TO authenticated
  USING (public.is_system_admin() OR EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND public.can_access_organization(t.organization_id)));

DROP POLICY IF EXISTS "documents_access" ON documents;
CREATE POLICY "documents_access" ON documents FOR ALL TO authenticated
  USING (public.is_system_admin() OR created_by = public.current_app_user_id() OR public.can_access_organization(organization_id))
  WITH CHECK (public.is_system_admin() OR public.can_access_organization(organization_id));

DROP POLICY IF EXISTS "document_versions_access" ON document_versions;
CREATE POLICY "document_versions_access" ON document_versions FOR ALL TO authenticated
  USING (public.is_system_admin() OR public.can_access_organization(organization_id))
  WITH CHECK (public.is_system_admin() OR public.can_access_organization(organization_id));

DROP POLICY IF EXISTS "document_reviews_access" ON document_reviews;
CREATE POLICY "document_reviews_access" ON document_reviews FOR SELECT TO authenticated
  USING (public.is_system_admin() OR public.can_access_organization(organization_id));

DROP POLICY IF EXISTS "templates_access" ON templates;
CREATE POLICY "templates_access" ON templates FOR ALL TO authenticated
  USING (public.is_system_admin() OR organization_id IS NULL OR public.can_access_organization(organization_id))
  WITH CHECK (public.is_system_admin() OR organization_id IS NULL OR public.can_access_organization(organization_id));

DROP POLICY IF EXISTS "correspondence_access" ON correspondence;
CREATE POLICY "correspondence_access" ON correspondence FOR ALL TO authenticated
  USING (public.is_system_admin() OR public.can_access_organization(organization_id))
  WITH CHECK (public.is_system_admin() OR public.can_access_organization(organization_id));

DROP POLICY IF EXISTS "calendar_access" ON calendar_events;
CREATE POLICY "calendar_access" ON calendar_events FOR ALL TO authenticated
  USING (public.is_system_admin() OR public.can_access_organization(organization_id))
  WITH CHECK (public.is_system_admin() OR public.can_access_organization(organization_id));

DROP POLICY IF EXISTS "attachments_access" ON attachments;
CREATE POLICY "attachments_access" ON attachments FOR ALL TO authenticated
  USING (public.is_system_admin() OR uploaded_by = public.current_app_user_id() OR public.can_access_organization(organization_id))
  WITH CHECK (public.is_system_admin() OR uploaded_by = public.current_app_user_id());

DROP POLICY IF EXISTS "document_submissions_access" ON document_submissions;
CREATE POLICY "document_submissions_access" ON document_submissions FOR ALL TO authenticated
  USING (public.is_system_admin() OR sender_id = public.current_app_user_id() OR recipient_id = public.current_app_user_id())
  WITH CHECK (public.is_system_admin() OR (sender_id = public.current_app_user_id() AND public.can_access_organization(organization_id)));

DROP POLICY IF EXISTS "reports_access" ON reports;
CREATE POLICY "reports_access" ON reports FOR ALL TO authenticated
  USING (public.is_system_admin() OR public.can_access_organization(organization_id))
  WITH CHECK (public.is_system_admin() OR public.can_access_organization(organization_id));

DROP POLICY IF EXISTS "briefings_access" ON briefing_packs;
CREATE POLICY "briefings_access" ON briefing_packs FOR ALL TO authenticated
  USING (public.is_system_admin() OR public.can_access_organization(organization_id))
  WITH CHECK (public.is_system_admin() OR public.can_access_organization(organization_id));

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'src-private',
  'src-private',
  FALSE,
  5242880,
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO UPDATE SET public = FALSE, file_size_limit = EXCLUDED.file_size_limit;

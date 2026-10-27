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

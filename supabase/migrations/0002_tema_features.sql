-- Tema Secondary School SRC Supabase migration 0002
-- Adds secretary-controlled meeting sign-in metadata and private document
-- submissions for deployments that already applied 0001_init.sql.

ALTER TABLE meeting_attendees
  ADD COLUMN IF NOT EXISTS signed_in_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signed_in_note TEXT NOT NULL DEFAULT '';

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

CREATE INDEX IF NOT EXISTS idx_document_submissions_sender
  ON document_submissions(organization_id, sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_submissions_recipient
  ON document_submissions(organization_id, recipient_id, created_at DESC);

ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_entity_type_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_entity_type_check
  CHECK (entity_type IN ('help_request', 'document', 'task', 'correspondence', 'meeting', 'document_submission'));

DROP TRIGGER IF EXISTS trg_document_submissions_updated ON document_submissions;
CREATE TRIGGER trg_document_submissions_updated
  BEFORE UPDATE ON document_submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE document_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_submissions_access" ON document_submissions;
CREATE POLICY "document_submissions_access" ON document_submissions FOR ALL TO authenticated
  USING (public.is_system_admin() OR sender_id = public.current_app_user_id() OR recipient_id = public.current_app_user_id())
  WITH CHECK (public.is_system_admin() OR (sender_id = public.current_app_user_id() AND public.can_access_organization(organization_id)));

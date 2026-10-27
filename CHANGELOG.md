# Changelog

## 1.1.0 — Tema Secondary School SRC deployment

### Added

- Tema Secondary School SRC branding, school profile, executive-zone workspace and additional SRC executive demo accounts.
- Secretary dashboard attendance sign-in panel for meeting executives with live counts, recorded-by details and automatic President/administrator monitoring.
- President and administrator live attendance monitoring card backed by saved attendance records and notifications.
- Document inbox for uploading files, keeping them privately, submitting them to other users, downloading, reviewing, archiving and restoring them.
- `GET/POST /api/attendance/sign-in` and `GET/POST/PATCH /api/document-submissions` API endpoints.
- `document_submissions` table, meeting sign-in metadata, private attachment support and Supabase migration `0002_tema_features.sql`.
- API tests for attendance sign-in monitoring and the full document upload/keep/submit/download workflow.

### Changed

- Urgent HELP button is now static; the pulsing ring animation and its Tailwind keyframes were removed.
- Meeting attendance table now shows who recorded a sign-in, when, and any note.
- README, product specification, seed data and deployment docs now describe the Tema Secondary School SRC deployment.

### Fixed

- Kept all new workflows connected to the persistent backend; no placeholder pages or dead buttons were introduced.

## 1.0.0 — Revised Tema Secondary School SRC Secretariat

### Removed

- Automated letter and notice drafting surfaces.
- Automated meeting-minutes and agenda creation.
- Automated extraction of decisions, tasks and deadlines.
- Automated monthly, termly and annual report writing.
- Automated presidential briefing summaries.
- Writing-companion navigation, dashboard cards, pages, settings and related service keys.
- Dependencies and environment variables introduced solely for those capabilities.

### Added

- Complete Next.js/TypeScript/Tailwind application with a persistent PostgreSQL-compatible backend.
- Manual document and letter editor with a live printable preview.
- Reusable templates for letters, notices, agendas, minutes, memoranda and report outlines.
- Standard forms for meeting resolutions, assigned tasks, responsible people and deadlines.
- Editable reports built with ordinary SQL queries over verified database records.
- Presidential briefing packs compiled from saved meetings, tasks, approvals, HELP requests and calendar entries.
- Server-generated PDF exports for documents, reports, briefing packs and approved minutes.
- President, Secretary, executive and administrator dashboards.
- Idempotent urgent HELP submission, routing, acknowledgement, progress tracking, reopening, escalation and full history.
- Real-time in-app notifications with optional Supabase Realtime, plus provider-backed email, SMS, WhatsApp and browser push delivery logs.
- Meeting management, official correspondence, document approvals, task management, calendar, directory, communication centre and workspace isolation.
- Supabase migration with row-level security, private storage bucket and deployment documentation.
- Automated API workflow tests, local backup scripts and scheduled maintenance.

### Fixed

- Cross-site preview sign-in now uses a secure, partitioned session cookie plus a browser-stored bearer-token fallback with header and query transports, so embedded workspaces keep their authenticated session even when browsers block third-party cookies or preview proxies strip headers.

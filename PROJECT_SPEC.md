# Tema Secondary School SRC Secretariat — Revised Product Specification

## 1. Purpose

Tema Secondary School SRC Secretariat is a complete, responsive, full-stack digital office for Tema Secondary School SRC leadership, with an executive-zone workspace for oversight. It centralizes presidential assistance requests, executive communication, meetings, official documents, approvals, tasks, deadlines, calendars, reports and handover records.

The product is a real database-backed application. Every dashboard statistic, status change, form, notification, approval and report is connected to server-side records. No static prototype screens or decorative workflow buttons are included.

## 2. Scope revision

Automated content-generation features are excluded from this revision. The product deliberately uses conventional, user-controlled tools instead.

### Removed capability set

The following are out of scope and are not present in the interface, backend, dependencies, database schema or environment configuration:

- Automated letter and notice drafting.
- Automated meeting-minutes creation.
- Automated agenda creation.
- Automated extraction of decisions, tasks and deadlines.
- Automated monthly, termly or annual report writing.
- Automated presidential briefing summaries.
- Conversational writing interfaces.
- Writing-companion navigation items, dashboard cards, pages, settings and related service integrations.
- Third-party content-generation APIs, model SDKs and credentials introduced for those features.

### Conventional replacements

- A manual document and letter editor with a live printable preview.
- Reusable templates for letters, notices, agendas, meeting minutes, memoranda and report outlines.
- Standard forms for meeting resolutions, assigned tasks, responsible persons and deadlines.
- Reports built from ordinary database queries over verified saved records.
- Editable report drafts that can be corrected before finalization.
- Presidential briefing packs compiled from existing meetings, tasks, approvals, HELP requests and calendar entries.
- Server-generated PDF exports for documents, reports, briefing packs and approved minutes.

All content is written, reviewed and finalized by authorized people. No model service writes or summarizes records.

## 3. User roles

The system supports these roles:

- Executive Zone President.
- TSS SRC President.
- Executive Zone Secretary.
- TSS SRC Secretary.
- Additional executives: organising secretary, treasurer, public relations officer, sports chair and welfare chair.
- Vice President.
- Other authorized SRC executives.
- System Administrator.

Each profile stores a name, role, official position, organization description, registered telephone number, optional WhatsApp number, committee, responsibilities, account status and last sign-in time.

Role-based permissions control record creation, review, administration, contact visibility, reporting and workspace settings. Organization membership controls data isolation. A zonal official with consolidated access can view aggregate school counts but cannot see confidential school-level records.

## 4. Authentication and account security

- Secure password sign-in and sign-out.
- Password hashing with a per-user salt.
- Password reset and account activation through single-use, expiring tokens.
- Account activation and deactivation by the System Administrator.
- HTTP-only, SameSite session cookies with server-side session records.
- CSRF token validation for all state-changing requests.
- Session listing and per-session revocation.
- Sign-out from all devices.
- Account activity logs for sensitive actions.
- Optional remote authentication through Supabase when explicitly configured.
- Server-side input validation and parameterized SQL.

Privileged credentials are never exposed to browser code.

## 5. President Dashboard

The President Dashboard provides:

- Personalized greeting and current date.
- Upcoming appointments, meetings and programmes.
- Documents awaiting approval.
- Outstanding presidential tasks.
- Recent executive announcements.
- Recent HELP requests and status.
- Important deadlines.
- Recent activities and notifications.
- Quick actions for Secretary assistance, meeting requests, document review, tasks, calendar and communication.

### Presidential HELP system

The prominent red **HELP! I NEED MY SECRETARY** action is available in the navigation, dashboard and mobile interface. The request form requires:

- Request type, defaulting to Urgent Assistance.
- Subject.
- Detailed description.
- Manually entered current location. No location tracking is used.
- Priority.
- Optional supporting attachment.

Submission is idempotent through a client request identifier. The server generates a unique reference, saves the request, associates it with the President and organization, assigns the designated Secretary, records creation history, creates in-app notifications, attempts configured external channels and returns a clear confirmation. A repeated submission with the same identifier returns the existing request instead of creating a duplicate.

Presidents can view request reference, type, subject, description, location, timestamps, assigned Secretary, status, acknowledgement, progress updates, resolution notes, contact logs, attachments and complete status history. They can send follow-ups, open the registered dialler or message composer and reopen resolved or closed requests.

## 6. Secretary Dashboard

The Secretary Dashboard provides:

- New urgent HELP requests.
- Requests awaiting acknowledgement.
- Requests in progress.
- Overdue tasks.
- Upcoming meetings.
- Documents awaiting presidential approval.
- Pending correspondence.
- Recent decisions, deadlines and activity.
- Quick actions for meetings, minutes, letters, tasks, HELP inbox, reports, calendar and documents.

The urgent HELP inbox is searchable and filterable. It prioritizes new critical and urgent requests and exposes acknowledgement, progress, resolution, closure, contact and update actions. Every status change records the previous status, new status, actor, timestamp and comment.

## 7. HELP request workflow

Supported states:

1. **New** — submitted and awaiting acknowledgement.
2. **Acknowledged** — Secretary confirmed receipt.
3. **In Progress** — actively being handled.
4. **Resolved** — assistance provided.
5. **Closed** — formally completed.

The complete history is retained through reopening. Scheduled maintenance escalates urgent or critical requests that remain unacknowledged beyond `HELP_ESCALATION_MINUTES`, up to two escalation levels. Escalation is recorded as a history event and creates notifications for the designated Secretary, zonal secretariat and administrators where applicable.

Notification delivery is recorded honestly. In-app delivery means the database notification was saved. Email, SMS, WhatsApp and browser push are marked successful only after the provider confirms the request. Missing configuration, provider errors and retries are visible in delivery logs.

## 8. Meetings and minutes

The meeting module supports:

- Creation and scheduling.
- Presidential meeting requests.
- Title, type, date, time, venue and chairperson.
- Attendees, invitations, RSVP, attendance and apologies.
- Manual agenda editing with reusable agenda templates.
- Manual discussion notes and minutes with reusable minutes templates.
- Resolution forms with mover, seconder, status and deadline.
- Optional task creation from a resolution with assignee and deadline.
- Minutes submission for presidential review.
- Approval status tracking.
- PDF export of approved minutes.
- Search, filters and archiving.

Meeting creation also creates a linked calendar entry and notifies attendees.

### 8A. Executive attendance sign-in

The Secretary dashboard contains a dedicated attendance sign-in panel for SRC executives. The Secretary selects a meeting and records each executive as present, absent or apology, with an optional note. Every sign-in stores the recording user, timestamp and note.

The President and system administrators are monitored automatically through:

- A live attendance summary and recent sign-in list on leadership dashboards.
- In-app notifications when a Secretary signs an executive in or changes attendance.
- Real-time dashboard refresh events.
- Persistent meeting attendance records for reports.

## 9. Documents, correspondence and approvals

Official correspondence includes incoming and outgoing letters, memoranda, invitations and circulars. Each entry stores a unique reference, subject, sender, recipient, dates, linked document, status, delivery details, response notes and follow-up date.

Document statuses include Draft, Pending Approval, Approved, Sent, Answered, Revisions Requested, Rejected and Archived.

The document repository supports categories, tags, search, version history, private attachments and role-based access. Presidents can approve, reject or request revisions with a reason. Reviewer, decision, comment and timestamp are stored. The Secretary is notified when a document is approved or returned.

### 9A. Document upload, private vault and user submissions

Every authenticated user can upload a file and choose one of two conventional actions:

1. **Keep** — store the file in a private vault visible only to the uploader and administrators.
2. **Submit** — send the file directly to another active workspace user.

A kept document can be submitted later. Recipients receive an in-app notification, can download the file, and can mark it received or reviewed. Downloads are private to the sender, recipient and administrators. Submissions can be archived and restored without deleting the underlying file.

The manual editor supports reusable templates with configurable letterhead and signature blocks. Inserting a template leaves all content under the user’s control. PDF generation is performed server-side.

## 10. Tasks and decisions

Tasks store title, description, assignee, assigner, organization, priority, due date, status, progress, related meeting or resolution, attachments, comments and completion notes.

Statuses are Pending, In Progress, Awaiting Review, Completed and Overdue. Scheduled maintenance marks passed deadlines overdue, records task events and creates reminders. Filters cover person, organization, status, priority and deadline. Assignees can update progress, status, comments and completion notes; the Secretariat can edit all task fields.

## 11. Communication and directory

The communication centre provides in-app messages with delivery and read timestamps, message composition, executive announcements and notification badges. The executive directory stores names, positions, organizations, telephone numbers, official email, committee membership, responsibilities and account status.

Call, SMS and WhatsApp actions use the registered contact. Buttons are labelled as opening a dialler or composer; the system never claims that a call was placed or that an external message was delivered without provider confirmation. Confidential contact details are masked for roles without contact-details permission.

## 12. School and zonal workspaces

Each school and zonal workspace contains its own HELP requests, meetings, minutes, correspondence, tasks, decisions, calendar, documents and reports.

Every record is tagged with an organization. API handlers verify membership before returning or changing records. HELP requests are routed to the designated Secretary for the President’s organization, with a zonal parent fallback. Authorized zonal officials can access a consolidated report containing aggregate counts by participating organization; raw confidential school records are not exposed.

## 13. Notifications and reminders

Notification events include new HELP requests, acknowledgement, status changes, resolution, escalation, meeting invitations and reminders, minutes submission, document decisions, task assignment, due and overdue tasks, announcements and messages.

Transports:

- In-app database notifications.
- Real-time updates through server-sent events by default.
- Optional Supabase Realtime broadcast channels when configured.
- Optional email through Resend.
- Optional SMS and WhatsApp through Twilio.
- Optional browser push through Web Push/VAPID.

Notification preferences are stored per user. Delivery attempts, provider message identifiers, errors, attempt counts and retry times are stored. A scheduled endpoint retries failed external deliveries and runs escalation and reminder checks.

## 14. Reports and briefing packs

Report types include monthly, termly, annual, meeting attendance, outstanding tasks, correspondence register, HELP summary, executive decisions and end-of-tenure handover.

Reports are built from saved records using ordinary SQL queries. Each draft contains an editable executive summary, verified metrics, section summaries, record tables and scope limitations. Finalized reports are locked and exportable to PDF.

Presidential briefing packs are compiled deterministically from saved meetings, tasks, approvals, calendar entries and HELP requests. They contain key counts and source record tables, not machine-written narrative. Both reports and briefing packs are exportable as server-generated PDFs.

## 15. Technical architecture

- Frontend: Next.js App Router, TypeScript, Tailwind CSS and client-side React state.
- Backend: Next.js route handlers with a single typed API router.
- Local database: embedded PostgreSQL through PGlite, persisted to the local data directory.
- Production database: Supabase PostgreSQL through `DATABASE_URL`.
- Optional authentication: Supabase Auth when `SUPABASE_AUTH_ENABLED` is set.
- Optional realtime: Supabase Realtime broadcast channels when configured; server-sent events otherwise.
- Optional private file storage: Supabase Storage bucket when configured; encrypted-at-rest database BLOB storage otherwise.
- PDF generation: PDFKit on the server.
- Deployment: Vercel or any Node-compatible host.

Database migrations and row-level security policies are provided in `supabase/migrations/0001_init.sql`. The local schema is in `db/schema.sql`.

## 16. Security and operational requirements

- Role-based and organization-based authorization on every protected endpoint.
- Database-level row security policies for direct Supabase access.
- Parameterized SQL and server-side Zod validation.
- HTTP-only session cookies and CSRF protection.
- Private attachment downloads with workspace checks.
- Audit logs for sensitive actions.
- Security headers and strict cache control on API responses.
- No privileged provider credentials in browser code.
- Documented environment variables, migrations, cron setup and backup/recovery procedure.

## 17. Design requirements

- Navy blue, white, gold and urgent red palette.
- Collapsible desktop sidebar and responsive mobile navigation.
- Accessible labels, focus states, status indicators and empty states.
- Searchable and filterable record tables.
- Loading indicators and clear success/error messages.
- Live notification badges.
- Print-friendly document and report views.
- Functional desktop, tablet and mobile layouts.

## 18. Acceptance criteria

1. Presidents and Secretaries sign in to the correct role-specific dashboards.
2. Role and organization restrictions are enforced by the server.
3. A President can submit an urgent HELP request with a manually entered location.
4. Duplicate submissions return the existing request.
5. Requests persist after sign-out and sign-in.
6. Requests appear in the correct Secretary inbox with real-time notification.
7. The Secretary can acknowledge and update status; the President sees the change.
8. Full request history is retained through reopening.
9. Escalation, reminders and failed delivery retries are recorded.
10. Call and message actions use registered contacts without false delivery claims.
11. Meetings, agendas, minutes, attendance, resolutions and tasks persist.
12. Documents, version history, attachments and approvals work.
13. Tasks and deadlines are tracked and reminders are generated.
14. Reports and briefing packs reflect saved records and export to PDF.
15. School and zonal data remain isolated; consolidated views expose counts only.
16. Every visible action leads to a real page, form, record or download.
17. No automated content-generation feature, model API, model SDK or writing-companion surface exists.
18. A Secretary can sign SRC executives into a selected meeting and the President/administrators see the update automatically.
19. Users can upload a file, keep it privately, submit it to another user, and download or review received submissions.
20. The urgent HELP button has no pulsing or looping animation.

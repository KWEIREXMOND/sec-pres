# Tema Secondary School SRC Secretariat

A complete, responsive, full-stack digital secretariat for Tema Secondary School SRC leadership, with an executive-zone workspace for oversight. The application includes President and Secretary dashboards, urgent HELP routing, real-time notifications, meetings, minutes, correspondence, document approvals, tasks, calendars, reports, briefing packs and secure administration.

All workflows use a real backend and persistent PostgreSQL-compatible database. The interface contains no decorative prototype screens. Reports, briefing packs and documents are written and reviewed by people using manual editors, reusable templates and ordinary database queries.

## Stack

- **Next.js 14 App Router** with TypeScript and Tailwind CSS.
- **Route handlers** for the complete server API.
- **PGlite** embedded PostgreSQL for local persistent development.
- **Supabase PostgreSQL** for deployed persistence through `DATABASE_URL`.
- **Supabase Auth, Realtime and private Storage** when configured.
- **PDFKit** for server-generated PDF exports.
- **Zod** for server-side validation.
- **Vitest** for API workflow tests.

Local development does not require external database credentials.

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The local PGlite database is created at `./data/pgdata` and demonstration records are seeded automatically on first boot. If you are upgrading an existing local demo database to this Tema-specific version, run `npm run db:reset` once to reload the new organizations, executives, attendance metadata and document-submission tables.

### Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| TSS SRC President | `school.president@srcpro.test` | `President123!` |
| TSS SRC Secretary | `school.secretary@srcpro.test` | `Secretary123!` |
| Executive Zone President | `zonal.president@srcpro.test` | `President123!` |
| Executive Zone Secretary | `zonal.secretary@srcpro.test` | `Secretary123!` |
| Vice President | `vice.president@srcpro.test` | `Executive123!` |
| Welfare Chair | `executive@srcpro.test` | `Executive123!` |
| Organising Secretary | `organiser@srcpro.test` | `Executive123!` |
| Treasurer | `treasurer@srcpro.test` | `Executive123!` |
| Public Relations Officer | `pro@srcpro.test` | `Executive123!` |
| Sports Chair | `sports@srcpro.test` | `Executive123!` |
| System Administrator | `admin@srcpro.test` | `AdminPass123!` |

Use separate browser sessions or two different demo accounts to test live HELP updates across President and Secretary dashboards.

## Implemented workflows

- Secure sign-in, password reset, account activation/deactivation, session management and activity logs.
- Role-specific President, Secretary, executive and administrator dashboards.
- Urgent **HELP! I NEED MY SECRETARY** requests with manual location, idempotent submission, unique references, attachments, routing, acknowledgement, status tracking, reopening, escalation and full history.
- Real-time in-app notifications through server-sent events; optional Supabase Realtime broadcast when configured.
- Email, SMS, WhatsApp and browser push integrations when credentials are configured, with honest delivery logs and retries.
- Meeting scheduling, presidential meeting requests, attendance, agendas, minutes, resolutions, action items, approval and PDF export.
- Secretary-controlled **meeting attendance sign-in** for SRC executives, with live counts, recorded-by details and automatic President/administrator notifications.
- A static urgent HELP button with no pulsing animation.
- Manual document editor, reusable templates, version history, categories, tags, private attachments and server-generated PDF.
- **Document inbox**: users can upload a file, keep it in a private vault, submit it to another user, download received files, mark them reviewed and archive or restore them.
- Presidential approval, rejection and revision requests with reviewer and timestamp.
- Incoming and outgoing correspondence register with status, dispatch, response and follow-up tracking.
- Task register with priorities, deadlines, progress, comments, completion notes, attachments and overdue checks.
- Calendar for meetings, appointments, school events, zonal programmes, deadlines and activities.
- Executive directory with role-based contact masking and registered dialler, SMS, WhatsApp and in-app message actions.
- In-app messages, executive announcements and unread badges.
- Monthly, termly, annual, attendance, task, correspondence, HELP, decision and handover reports built from saved records.
- Editable report drafts, finalization lock and PDF export.
- Presidential briefing packs compiled from saved meetings, tasks, approvals, calendar entries and HELP requests.
- School and zonal organization isolation, with aggregate-only consolidated reporting.
- Administration console for users, audit logs, delivery logs and provider status.
- Responsive desktop, tablet and mobile interface with collapsible navigation.

## Project structure

```text
app/                       Next.js routes and global styles
components/                Providers, layout and working page components
lib/                       Browser API client, shared types, hooks, branding and formatting
server/                    API router, database, auth, notifications, reports, PDF and maintenance
db/schema.sql              Local PostgreSQL schema
supabase/migrations/       Supabase migrations and row-level security policies
public/sw.js               Web Push service worker
scripts/                   Local schema, seed, reset, backup and maintenance commands
tests/                     End-to-end API workflow tests
PROJECT_SPEC.md            Revised product specification
```

## Environment variables

Copy `.env.example` to `.env.local` for local development. Important values:

| Variable | Purpose | Default |
| --- | --- | --- |
| `LOCAL_DATABASE_PATH` | Local PGlite data directory | `./data/pgdata` |
| `DATABASE_URL` | Supabase PostgreSQL connection string; when set, remote mode is used | empty |
| `SEED_DEMO_DATA` | Seed demonstration workspaces when the user table is empty | `true` in development |
| `SHOW_RESET_LINKS` | Return reset/activation links to the browser for local testing | `true` in development, `false` in production |
| `APP_BASE_URL` | Base URL used in secure links | `http://localhost:3000` |
| `SESSION_TTL_DAYS` | Session lifetime | `7` |
| `HELP_ESCALATION_MINUTES` | Unacknowledged urgent request escalation period | `15` |
| `CRON_SECRET` | Bearer secret protecting `/api/cron/run` | empty locally |
| `MAX_UPLOAD_BYTES` | Attachment size limit | `5242880` |
| `COOKIE_SAME_SITE` | Session cookie `SameSite` policy: `lax`, `none` or `strict` | `none` in Arena sandbox previews, otherwise `lax` |
| `COOKIE_SECURE` | Require HTTPS for the session cookie | `true` in production and Arena sandbox previews, otherwise `false` |
| `COOKIE_PARTITIONED` | Partition the cookie for cross-site iframe previews | `true` in Arena sandbox previews, otherwise `false` |
| `SESSION_TOKEN_FALLBACK` | Return a browser-stored bearer token when browser cookies are blocked | `true` in Arena sandbox previews, otherwise `false` |
| `SUPABASE_AUTH_ENABLED` | Verify passwords through Supabase Auth | `false` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | empty |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | empty |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service key | empty |
| `SUPABASE_STORAGE_BUCKET` | Private attachment bucket | `src-private` |
| `SUPABASE_REALTIME_CHANNEL_PREFIX` | Realtime broadcast channel prefix | `srcpro` |
| `RESEND_API_KEY` | Email provider key | empty |
| `NOTIFICATION_FROM_EMAIL` | Verified sender for email | placeholder |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | SMS provider configuration | empty |
| `TWILIO_WHATSAPP_FROM` | WhatsApp-enabled Twilio sender | empty |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Browser push configuration | empty |

Never place service-role keys or provider tokens in `NEXT_PUBLIC_*` variables or browser code.

When the app is embedded in a cross-site preview iframe, browsers with third-party cookie restrictions require `SameSite=None`, `Secure` and `Partitioned` session cookies. Arena sandbox previews enable that combination automatically. For browsers that block all third-party cookies, the preview also returns a bearer token that the client sends in `Authorization` and `X-Session-Token` headers, with `session_token` and `csrf_token` query parameters as a last-resort fallback for restrictive preview proxies. It is stored in browser storage for the preview origin and is not enabled in production by default. Because the fallback can place a token in development request logs, keep `SESSION_TOKEN_FALLBACK=false` on public production deployments. A normal first-party deployment can keep the safer, cookie-only `SameSite=Lax` default.

## Supabase and Vercel deployment

1. Create a Supabase project.
2. Run `supabase/migrations/0001_init.sql` and then `supabase/migrations/0002_tema_features.sql` in the Supabase SQL editor, or apply both with the Supabase CLI.
3. Create a private storage bucket named `src-private`, or let the migration create it.
4. Set `DATABASE_URL` to the project’s PostgreSQL connection string.
5. If remote authentication is required, set `SUPABASE_AUTH_ENABLED=true`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
6. Set `APP_BASE_URL` to the production URL, `SHOW_RESET_LINKS=false`, `SEED_DEMO_DATA=false` and a long random `CRON_SECRET`.
7. Configure optional provider credentials for email, SMS, WhatsApp and browser push.
8. Deploy to Vercel. `vercel.json` schedules `/api/cron/run` every five minutes. Vercel sends `Authorization: Bearer $CRON_SECRET` when the secret is configured.
9. Create the first administrator through the database seed or admin API, then use the Admin console to create additional accounts.

The server uses the service-role key only on the server. Row-level security policies restrict direct client access to organization records.

## Local database commands

```bash
npm run db:local:schema   # Apply the local schema
npm run db:seed           # Seed demonstration records
npm run db:reset          # Delete and recreate the local PGlite database
npm run db:backup         # Copy the local PGlite directory to ./backups
npm run maintenance:run   # Run escalation, reminders, overdue checks and delivery retries
```

For a deployed PostgreSQL database, use `pg_dump` for backups and `pg_restore`/`psql` for recovery. The backup script prints the exact command in remote mode.

## Notifications and delivery honesty

In-app notifications are stored in the database and broadcast over the active realtime channel. External channels are attempted only when the complete provider configuration exists. A provider must return a successful response before a delivery is marked `sent`. If a provider fails, the attempt count, error and next retry time are stored. If no provider is configured, the status is `not_configured`. The UI never claims that an external message or call was delivered based only on opening a link.

## Cron and escalation

`GET /api/cron/run` runs:

- Overdue task marking and task events.
- Task due reminders.
- Meeting reminders.
- Escalation of new urgent or critical HELP requests.
- Retry of failed external notification deliveries.

In production, protect this endpoint with `CRON_SECRET`. Secretaries and administrators can also run the same checks from the notification centre.

## Testing and quality checks

```bash
npm run typecheck
npm test
npm run build
npm run check        # typecheck + tests + production build
```

The API tests cover sign-in, idempotent HELP submission, acknowledgement, status history, contact actions, attendance sign-in monitoring, document upload/keep/submit/download, document approval, PDF export, report compilation, role restrictions, organization isolation and the absence of prohibited content-generation integrations.

## Security notes

- Passwords are salted and hashed with `scrypt`.
- Session tokens are random, hashed in the database and stored in HTTP-only cookies.
- CSRF tokens are required for every state-changing request.
- All API queries are parameterized and validated server-side.
- Organization membership is checked before record access.
- Attachments are private and downloaded through an authorized API route.
- Sensitive actions are written to audit logs with IP and user-agent metadata.
- External credentials remain server-side and are never serialized to the browser.

## Excluded functionality

This build contains no automated content-generation service, model API, model SDK, summarization endpoint or related credentials. Documents, minutes, agendas, reports and briefing packs are created through manual editors, reusable templates and deterministic queries over saved records.

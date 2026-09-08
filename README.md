# Lead Management System Backend

This project is a NestJS + TypeScript backend for a Lead Management System with role-based access control, lead lifecycle management, dashboard metrics, and email tracking.

Frontend implementation contracts for authentication, leads, reminders, dashboard,
roles, and error handling are documented in `FRONTEND_HANDOFF.md`.

## Tech Stack

- Node.js
- NestJS
- TypeScript
- PostgreSQL
- Prisma ORM
- JWT Authentication
- Swagger API Documentation

## Roles

- SUPER_ADMIN
- ADMIN
- SALES

## Core Features

- User authentication with access + refresh tokens
- Role-based access enforcement
- Lead creation and assignment
- Dashboard summary metrics
- Follow-up logging
- Lead status tracking
- Email logging and trigger endpoint
- Outlook Calendar sync for follow-ups (Microsoft Graph, app-only)
- Microsoft Teams notification (Adaptive Card) on every new lead
- Swagger API docs for frontend integration

## Project Structure

- src/auth - authentication and token logic
- src/users - user management
- src/leads - lead lifecycle APIs
- src/email - email trigger and tracking
- src/calendar - Outlook Calendar sync for follow-ups (Microsoft Graph)
- src/notifications - Microsoft Teams webhook notification on new leads
- src/settings - company-wide app settings (currently: email CC/BCC defaults)
- src/common - guards and shared decorators
- prisma/schema.prisma - database schema

## Local Setup

1. Install dependencies

   ```bash
   npm install
   ```

2. Place the private environment file in the repository root

   ```text
   .env
   ```

3. Start PostgreSQL and create a database named `lms_db`

4. Run Prisma migration

   ```bash
   npx prisma migrate dev --name init
   ```

5. Start backend in development mode

   ```bash
   npm run start:dev
   ```

6. Swagger docs
   ```text
   http://localhost:4000/api/docs
   ```

## Initial Super Admin

Application startup never seeds users or demo leads. After migrations have run,
create the first Super Admin explicitly with the one-time command documented in
`DOCKER.md`. Credentials are read from environment variables and an existing user
is never modified.

## Authentication Flow

Access and refresh tokens travel only as `httpOnly` cookies (`access_token`,
`refresh_token`) — they never appear in a response body or need to be attached
as a header. Every request to the API must be made with credentials included
(`fetch(url, { credentials: 'include' })` / axios `withCredentials: true`) so
the browser sends/receives these cookies.

### 1) Get a CSRF token

`GET /auth/csrf`

Sets a non-`httpOnly` `csrf_token` cookie (JS-readable, unlike the auth
cookies) and also returns it in the body for convenience:

```json
{
  "csrfToken": "<generated-token>"
}
```

Every `POST`/`PUT`/`PATCH`/`DELETE` request (except `/public/forms/*` and its
legacy `.php` aliases) must echo this value back as a header, or it is
rejected with `403`:

```http
x-csrf-token: <generated-token>
```

The CSRF cookie is re-issued on every login/refresh — read it fresh from
`document.cookie` rather than caching a stale copy.

### 2) Login

`POST /auth/login`

Request body:

```json
{
  "email": "<INITIAL_ADMIN_EMAIL>",
  "password": "<INITIAL_ADMIN_PASSWORD>"
}
```

Required headers:

```http
Content-Type: application/json
x-csrf-token: <generated-token>
```

Response body (no tokens — those are set as cookies):

```json
{
  "user": {
    "id": "...",
    "name": "Super Admin",
    "email": "<INITIAL_ADMIN_EMAIL>",
    "role": "SUPER_ADMIN"
  },
  "csrfToken": "<rotated-token>",
  "expiresIn": "15m"
}
```

### 3) Current user

`GET /auth/me` — cookie-authenticated, no headers needed beyond credentials.
Returns `{ "user": {...}, "expiresAt": <epoch-ms> }`. Use this on app load to
check whether a session already exists without forcing a refresh-token
rotation.

### 4) Refresh token

`POST /auth/refresh`

Required headers:

```http
x-csrf-token: <generated-token>
```

The refresh token is read from the `refresh_token` cookie automatically.
Response shape matches login's (`{ user, csrfToken, expiresIn }`), and all
three cookies are rotated.

### 5) Logout

`POST /auth/logout` (requires an authenticated session) revokes the refresh
token server-side and clears all three cookies. `POST /auth/logout-all` does
the same for every session belonging to the user. It also increments a
server-side session version, so access tokens already issued to other devices
are rejected immediately instead of remaining valid until their normal expiry.

## Protected Endpoints

All protected endpoints are authenticated via the `access_token` cookie
automatically — no `Authorization` header is used. Every mutating
(`POST`/`PUT`/`PATCH`/`DELETE`) request additionally requires a valid
`x-csrf-token` header (see above), including `change-password`,
`forgot-password`, and `reset-password`.

## Lead APIs

### Create lead

`POST /leads`

Body:

```json
{
  "fullName": "Rizwan Ali",
  "email": "rizwan@example.com",
  "phone": "+923001234567",
  "company": "ABC Tech",
  "source": "WEBSITE",
  "status": "NEW",
  "priority": "HIGH",
  "leadType": "INTERNAL",
  "notes": "Interested in a custom solution",
  "assignedToId": "sales-user-id"
}
```

### List leads

`GET /leads`

Optional filters include `leadType=INTERNAL|EXTERNAL`. Results are ordered by
`createdAt` descending before pagination.

### Dashboard summary

`GET /leads/dashboard`

### Get one lead

`GET /leads/:id`

### Assign lead

`PATCH /leads/:id/assign`

Body:

```json
{
  "assignedToId": "sales-user-id"
}
```

Send `{ "assignedToId": null }` to unassign a lead. Assignments,
reassignments, and unassignments are recorded in the activity timeline.

### Update lead status

`PATCH /leads/:id/status`

Body:

```json
{
  "status": "PROJECT_IS_OURS"
}
```

### Add follow-up

`POST /leads/follow-up`

Body:

```json
{
  "leadId": "lead-id",
  "type": "CALL",
  "notes": "Client requested pricing details",
  "nextFollowUpAt": "2026-08-15T15:00:00.000Z"
}
```

## Email APIs

### Send email to lead

`POST /emails/send`

Body:

```json
{
  "leadId": "lead-id",
  "toEmail": "customer@example.com",
  "ccEmails": ["manager@example.com"],
  "bccEmails": ["admin@example.com"],
  "subject": "Follow-up",
  "body": "<p>Hello, this is the email body.</p>"
}
```

`ccEmails`/`bccEmails` are both optional — whatever the sender provides here is merged with the company-wide defaults from **Settings > Email CC/BCC defaults** (`GET`/`PATCH /settings/email`, SUPER_ADMIN only; see below), not replaced by them.

### Email settings (company-wide CC/BCC defaults)

`GET /settings/email` — returns `{ ccEmails: string[], bccEmails: string[] }`.

`PATCH /settings/email` (SUPER_ADMIN only) — body: `{ "ccEmails": [...], "bccEmails": [...] }` (each entry validated as an email, max 20 per list). These addresses are automatically merged into every `POST /emails/send` call on top of whatever the sender adds, so management always stays looped in without each salesperson having to remember to CC/BCC anyone manually.

## User APIs

### Create user

`POST /users`

Body:

```json
{
  "name": "Sales Executive",
  "email": "sales1@lms.com",
  "password": "securePassword123",
  "role": "SALES"
}
```

### List users

`GET /users`

### Get single user

`GET /users/:id`

### Dismiss user

`DELETE /users/:id`

Admin can dismiss Sales users; Super Admin can dismiss Admin or Sales users.
The current account and Super Admin accounts are protected. Dismissal removes the
user from the active team list, revokes all refresh tokens, immediately rejects
existing access tokens, and returns their assigned leads to the unassigned queue.
The user record is retained internally so lead and follow-up audit history is not
destroyed.

## Role Matrix

- SUPER_ADMIN: full access
- ADMIN: user management + lead management + email
- SALES: own assigned leads + follow-up + email access

## Notes

- SMTP is configured using environment variables in `.env`.
- New leads with an email address receive an acknowledgement email. Newly
  assigned salespeople receive an assignment email. Both are logged in
  `EmailLog`, and SMTP failure never rolls back the lead operation.
- Authenticated LMS-created leads default to `INTERNAL`; public contact-form
  leads are stored as `EXTERNAL`.
- Optional unassigned-lead SLA automation is configured with
  `LEAD_SLA_ENABLED`, `LEAD_SLA_REMINDER_MINUTES`,
  `LEAD_SLA_ASSIGN_MINUTES`, and `LEAD_SLA_CHECK_INTERVAL_MINUTES`.
- When credentials are present, emails are truly sent and logged.
- If SMTP is not configured, the email still records in the database without crashing the app.
- Follow-ups with a `nextFollowUpAt` are pushed to the assigned user's Outlook calendar via Microsoft Graph (app-only credentials, see `DOCKER.md` section 12) and removed again on completion. If `MS_GRAPH_TENANT_ID`/`MS_GRAPH_CLIENT_ID`/`MS_GRAPH_CLIENT_SECRET` are not configured, the follow-up still saves normally, just without a calendar event.
- `MEETING`-type follow-ups additionally get a real Teams meeting attached to that calendar event, exposed as `teamsJoinUrl` on the follow-up (requires the `OnlineMeetings.ReadWrite.All` Graph permission in addition to `Calendars.ReadWrite` — see `DOCKER.md` section 12).
- When a `MEETING` follow-up gets a Teams join link, the lead (client) is automatically emailed the meeting time and join link via the same SMTP config used for other emails (`EmailService.sendMeetingInviteEmail`). Skipped gracefully if the lead has no email on file, or if SMTP/Graph aren't configured — no separate env var needed.
- Optional two-way sync for `MEETING` follow-ups: a poller periodically re-checks each synced meeting's Outlook event and pulls in a reschedule (updates `nextFollowUpAt`, re-emails the client) or a cancellation (clears `nextFollowUpAt`) made directly in Teams/Outlook, bypassing the LMS. Configured with `MEETING_SYNC_ENABLED` and `MEETING_SYNC_CHECK_INTERVAL_MINUTES` (default 10). Both are recorded as `LeadActivity` entries (`MEETING_RESCHEDULED` / `MEETING_CANCELLED`).
- Every new lead (from `POST /leads` or the public contact form) posts an Adaptive Card to a Microsoft Teams channel via `TEAMS_LEAD_WEBHOOK_URL` (see `DOCKER.md` section 13). If unset, lead creation is unaffected — the notification is just skipped.
- Frontend must send every request with credentials included and echo the `csrf_token` cookie back as `x-csrf-token` on every mutating request (see Authentication Flow above) — this now applies to the whole API, not just login/refresh.
- New env vars: `NODE_ENV` (drives the `secure` cookie flag), `COOKIE_DOMAIN` (e.g. `.eicetechnology.com` in production, unset in local dev), `CORS_ALLOWED_ORIGINS` (comma-separated allowlist, replaces the old permissive CORS setting).

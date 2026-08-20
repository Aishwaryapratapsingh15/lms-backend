# Frontend handoff: LMS production enhancements

Use the final API origin supplied for deployment:

```text
https://<BACKEND_DOMAIN>
```

Swagger remains available at `https://<BACKEND_DOMAIN>/api/docs`.

## Authentication contract

1. Call `GET /auth/csrf` and keep `csrfToken` in memory.
2. Call `POST /auth/login` with header `x-csrf-token` and the email/password body.
3. Send `Authorization: Bearer <accessToken>` on protected requests.
4. If a protected request returns `401`, call `POST /auth/refresh` with
   `x-refresh-token` and `x-csrf-token`. Refresh no longer requires a valid access
   token. Store the rotated access and refresh tokens, then retry the original request once.
5. On refresh failure, clear the session and return to login.

Do not retry `403`, `404`, `409`, or `429` as authentication failures.

### New authentication screens/actions

| UI                  | Method and endpoint          | Body/headers                                                                  |
| ------------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| Forgot password     | `POST /auth/forgot-password` | `{ "email": "user@example.com" }`                                             |
| Reset password page | `POST /auth/reset-password`  | `{ "token": "token-from-url", "newPassword": "12+ characters" }`              |
| Change password     | `POST /auth/change-password` | Bearer token; `{ "currentPassword": "...", "newPassword": "12+ characters" }` |
| Logout              | `POST /auth/logout`          | Bearer token and `x-refresh-token`                                            |
| Logout all devices  | `POST /auth/logout-all`      | Bearer token                                                                  |

Forgot-password always shows the same success message to prevent account discovery.
Build a `/reset-password` frontend route that reads `token` from the URL query and
submits it with the new password. A successful password change/reset invalidates old
refresh tokens.

## Role behavior

- `SUPER_ADMIN` and `ADMIN` can see all leads, assign leads, archive/restore, and
  see all salesperson performance.
- `ADMIN` can create `SALES` users only; only `SUPER_ADMIN` can create elevated
  `ADMIN` or `SUPER_ADMIN` accounts.
- `SALES` automatically receives only leads assigned to the logged-in user across
  list, detail, dashboard, reminders, updates, follow-ups, and timeline APIs.
- The frontend must hide assign/archive/restore actions from `SALES`, but backend
  authorization remains the source of truth.
- Never send `createdById` when creating a lead or `userId` when adding a follow-up.
  The backend derives both from the access token.

## Screens to create or enhance

### 1. Leads list

Use:

```http
GET /leads?page=1&limit=20&search=&status=&source=&priority=&assignedToId=&archived=active&createdFrom=&createdTo=
```

All query parameters are optional. Allowed `archived` values are `active`,
`archived`, and `all`. `limit` is capped at 100.

Response:

```json
{
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 0, "pages": 0 }
}
```

Required UI:

- Debounced search for name, email, phone, and company
- Status, source, priority, salesperson, archive, and date filters
- Server-side pagination
- Empty/loading/error states
- Archived badge and restore action for admins

### 2. Create and edit lead

Create:

```http
POST /leads
```

```json
{
  "fullName": "Example Person",
  "email": "person@example.com",
  "phone": "+919999999999",
  "company": "Example Ltd",
  "source": "WEBSITE",
  "status": "NEW",
  "priority": "HIGH",
  "notes": "Initial enquiry",
  "assignedToId": "optional-active-sales-user-id"
}
```

Edit:

```http
PATCH /leads/:id
```

Send only changed fields: `fullName`, `email`, `phone`, `company`, `source`,
`priority`, or `notes`.

If create returns `409`, show the duplicate lead returned in the error payload and
offer to open it instead of creating another record.

### 3. Lead detail and activity timeline

```http
GET /leads/:id
GET /leads/:id/timeline
```

Render timeline types:

```text
CREATED
UPDATED
ASSIGNED
STATUS_CHANGED
FOLLOW_UP_ADDED
FOLLOW_UP_COMPLETED
EMAIL_SENT
ARCHIVED
RESTORED
```

Each activity contains `type`, `details`, `createdAt`, and the optional `actor`.
Older records created before this migration can have an empty timeline until their
next change.

Existing actions remain:

```http
PATCH /leads/:id/assign       { "assignedToId": "sales-user-id" }
PATCH /leads/:id/status       { "status": "QUALIFIED" }
```

Archive actions for admins:

```http
PATCH /leads/:id/archive
PATCH /leads/:id/restore
```

Archive is a soft delete; do not remove the lead permanently from client state.

### 4. Follow-up form and reminders page

Create a follow-up without `userId`:

```http
POST /leads/follow-up
```

```json
{
  "leadId": "lead-id",
  "type": "CALL",
  "notes": "Discussed requirements",
  "nextFollowUpAt": "2026-08-22T10:00:00.000Z"
}
```

Reminder tabs:

```http
GET /leads/reminders?range=overdue&limit=50
GET /leads/reminders?range=today&limit=50
GET /leads/reminders?range=upcoming&limit=50
GET /leads/reminders?range=all&limit=50
```

Mark a reminder complete:

```http
PATCH /leads/follow-ups/:followUpId/complete
```

Display lead identity, assigned salesperson, reminder time, type, notes, and overdue
duration. Refresh reminder/dashboard queries after completion.

### 5. Dashboard

```http
GET /leads/dashboard
GET /leads/dashboard?from=2026-08-01T00:00:00.000Z&to=2026-08-31T23:59:59.999Z
```

Response fields:

```json
{
  "total": 100,
  "assigned": 80,
  "unassigned": 20,
  "won": 12,
  "conversionRate": 12,
  "overdueFollowUps": 7,
  "byStatus": { "NEW": 20, "WON": 12 },
  "bySource": { "WEBSITE": 40, "EMAIL": 10 },
  "byPriority": { "HIGH": 30, "MEDIUM": 50, "LOW": 20 },
  "salesPerformance": [
    {
      "user": {
        "id": "...",
        "name": "Sales User",
        "email": "sales@example.com"
      },
      "total": 25,
      "won": 5,
      "conversionRate": 20
    }
  ]
}
```

Create summary cards, status/source/priority charts, an overdue-reminders shortcut,
date-range controls, and an admin-only salesperson performance table. Sales users
receive their own scoped metrics and an empty `salesPerformance` array.

## User management rules

Use `GET /users` for the admin user table and `POST /users` to create a user:

```json
{
  "name": "Sales User",
  "email": "sales@example.com",
  "password": "minimum-12-characters",
  "role": "SALES"
}
```

For an `ADMIN` session, show only the `SALES` role option. `SUPER_ADMIN` can select
all roles. Sales users can call `GET /users/:id` only for their own user ID.

## Error handling

| Status | Frontend action                                               |
| ------ | ------------------------------------------------------------- |
| `400`  | Show validation message next to the relevant form field       |
| `401`  | Attempt refresh once, then sign out                           |
| `403`  | Show permission denied; do not retry                          |
| `404`  | Show not found/inaccessible (important for sales isolation)   |
| `409`  | Show duplicate lead and link to the returned lead ID          |
| `429`  | Disable submit temporarily and honor the `Retry-After` header |

Login is limited to 10 attempts per 15 minutes per IP. Forgot password and public
OTP/forms also have targeted limits. Nginx forwards the real client IP to NestJS.

## Cache invalidation checklist

After lead create/update/assignment/status/archive/restore/follow-up changes,
invalidate or refetch:

- `GET /leads`
- `GET /leads/:id`
- `GET /leads/:id/timeline`
- `GET /leads/reminders`
- `GET /leads/dashboard`

Keep access tokens in memory where possible. Avoid placing refresh tokens or reset
tokens in logs, analytics events, or error-reporting payloads.

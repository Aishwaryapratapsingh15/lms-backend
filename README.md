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
- Swagger API docs for frontend integration

## Project Structure

- src/auth - authentication and token logic
- src/users - user management
- src/leads - lead lifecycle APIs
- src/email - email trigger and tracking
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

### 1) Get CSRF token

`GET /auth/csrf`

Response:

```json
{
  "csrfToken": "<generated-token>"
}
```

Use this token in the next login/refresh request:

```http
x-csrf-token: <generated-token>
```

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

Response:

```json
{
  "user": {
    "id": "...",
    "name": "Super Admin",
    "email": "<INITIAL_ADMIN_EMAIL>",
    "role": "SUPER_ADMIN"
  },
  "accessToken": "...",
  "refreshToken": "...",
  "expiresIn": "15m"
}
```

### 3) Refresh token

`POST /auth/refresh`

Required headers:

```http
Authorization: Bearer <access-token>
x-refresh-token: <refresh-token>
x-csrf-token: <generated-token>
```

## Protected Endpoints

All production endpoints below require:

```http
Authorization: Bearer <accessToken>
```

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
  "notes": "Interested in a custom solution",
  "assignedToId": "sales-user-id"
}
```

### List leads

`GET /leads`

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
  "bccEmails": ["superadmin@lms.com", "admin@lms.com"],
  "subject": "Follow-up",
  "body": "<p>Hello, this is the email body.</p>"
}
```

The API also appends the configured admin visibility BCC list automatically when sending.

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

## Role Matrix

- SUPER_ADMIN: full access
- ADMIN: user management + lead management + email
- SALES: own assigned leads + follow-up + email access

## Notes

- SMTP is configured using environment variables in `.env`.
- When credentials are present, emails are truly sent and logged.
- If SMTP is not configured, the email still records in the database without crashing the app.
- Frontend team should fetch the CSRF token before login and refresh requests.

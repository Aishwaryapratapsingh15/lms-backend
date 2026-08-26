# Production deployment runbook

This repository deploys the NestJS API and PostgreSQL with Docker Compose. The
frontend is deployed separately.

Production URLs:

- API: `https://leadflowapi.eicetechnology.com`
- Swagger: `https://leadflowapi.eicetechnology.com/api/docs`
- Frontend/CORS origin: `https://leadflow.eicetechnology.com`

The `deploy/nginx/` directory is intentionally ignored by Git. Configure Nginx
directly on the server using the commands below.

## 1. Point DNS to the server

Create an `A` record for `leadflowapi.eicetechnology.com` pointing to the VPS
public IP. Wait for it to resolve before requesting the HTTPS certificate.

## 2. Install server requirements (first deployment only)

Run on an Ubuntu VPS:

```bash
sudo apt update
sudo apt install -y git nginx
```

Install Docker Engine and the Docker Compose plugin from Docker's Ubuntu guide:

- https://docs.docker.com/engine/install/ubuntu/
- https://docs.docker.com/compose/install/linux/

Then verify and enable the services:

```bash
docker --version
docker compose version
sudo systemctl enable --now docker nginx
```

Allow SSH, HTTP, and HTTPS in the VPS firewall. Do not publicly open PostgreSQL
port `5432` or backend port `4010`.

## 3. Upload the backend code (first deployment only)

```bash
sudo mkdir -p /var/www/lms_backend
sudo chown "$USER":"$USER" /var/www/lms_backend
git clone https://github.com/Aishwaryapratapsingh15/lms-backend.git /var/www/lms_backend
cd /var/www/lms_backend
```

## 4. Upload and check the private `.env`

The `.env` file is ignored by Git and must be uploaded separately. From the
trusted local computer, run (replace `SERVER_USER` and `SERVER_IP`):

```bash
scp .env SERVER_USER@SERVER_IP:/var/www/lms_backend/.env
```

Then run on the server:

```bash
cd /var/www/lms_backend
chmod 600 .env
```

Confirm these production settings without printing secret values:

- `NODE_ENV=production` (also controls the `Secure` flag on the auth/CSRF cookies)
- `DATABASE_URL` uses host `postgres` and database port `5432`
- `FRONTEND_URL=https://leadflow.eicetechnology.com`
- `PASSWORD_RESET_URL=https://leadflow.eicetechnology.com/reset-password`
- `CORS_ALLOWED_ORIGINS=https://leadflow.eicetechnology.com` (comma-separated if more than one origin needs access; required — the container will fail to start without it). This only restricts the LMS app's own endpoints — `/public/forms/*` and the legacy `.php` aliases (`otp.php`, `contact.php`, etc.) remain open to any origin, since those are embedded on other public-facing sites and never carry cookies.
- `COOKIE_DOMAIN=.eicetechnology.com` (shares the `access_token`/`refresh_token`/`csrf_token` cookies across the `leadflow.` and `leadflowapi.` subdomains; leave unset for local development)
- PostgreSQL, JWT, SMTP, OTP, recipient, and initial admin variables are set
- `MS_GRAPH_TENANT_ID`, `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET` are set if Outlook Calendar sync is enabled (see "Calendar sync" below) — optional, follow-ups still work without them, just without a calendar event
- `TEAMS_LEAD_WEBHOOK_URL` is set if new-lead Teams notifications are enabled (see "Teams lead notifications" below) — optional, lead creation still works without it

No `BACKEND_URL` environment variable is required. Nginx owns the public API
domain, while `FRONTEND_URL` is the allowed browser origin.

Never commit `.env` or paste its secrets into deployment logs or documentation.

## 5. Start the database and backend

```bash
cd /var/www/lms_backend
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 backend postgres
```

Backend startup automatically runs `npx prisma migrate deploy` before starting
NestJS. All committed, pending migrations are therefore applied to the production
database. Startup stops if a migration fails.

## 6. Create the first Super Admin once

Run this only during the first deployment:

```bash
cd /var/www/lms_backend
docker compose run --rm backend node dist/scripts/seed-admin.js
```

The command creates the user configured by `INITIAL_ADMIN_*`. It is safe against
duplicates: if `INITIAL_ADMIN_EMAIL` already exists, it reports that no data was
changed. Normal backend startup and future `git pull` deployments do **not** run
this seed command.

After login is confirmed, remove `INITIAL_ADMIN_PASSWORD` from `.env` and keep the
password in a password manager. The running API does not need this variable.

## 7. Configure Nginx

Create the server configuration directly on the VPS:

```bash
sudo tee /etc/nginx/sites-available/leadflowapi.eicetechnology.com >/dev/null <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name leadflowapi.eicetechnology.com;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:4010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

sudo ln -sfn /etc/nginx/sites-available/leadflowapi.eicetechnology.com /etc/nginx/sites-enabled/leadflowapi.eicetechnology.com
sudo nginx -t
sudo systemctl reload nginx
```

Never reload Nginx unless `sudo nginx -t` succeeds.

## 8. Enable HTTPS

After DNS resolves and HTTP works, install Certbot using the current instructions
at https://certbot.eff.org/ for Ubuntu and Nginx. Then run:

```bash
sudo certbot --nginx -d leadflowapi.eicetechnology.com
sudo certbot renew --dry-run
```

## 9. Verify the first deployment

```bash
curl -I https://leadflowapi.eicetechnology.com/api/docs
docker compose ps
docker compose logs --tail=100 backend postgres
```

## 10. Deploy every later code update

Run these commands after new code is pushed to Git:

```bash
cd /var/www/lms_backend
git pull --ff-only
docker compose config --quiet
docker compose up -d --build --remove-orphans
docker compose ps
docker compose logs --tail=100 backend postgres
curl -I https://leadflowapi.eicetechnology.com/api/docs
```

Do not run the admin seed again. `docker compose up` rebuilds the API and applies
pending Prisma migrations automatically; it preserves the PostgreSQL Docker volume
and all existing records.

## 11. Add a table or change the database schema in the future

Create migrations during development, never directly on production:

1. Update `prisma/schema.prisma` with the new table, column, index, or relation.
2. Against the development database, generate and test a migration:

   ```bash
   npx prisma migrate dev --name add_descriptive_table_name
   npm run build
   ```

3. Review and commit both `prisma/schema.prisma` and the generated
   `prisma/migrations/<timestamp>_<name>/migration.sql` directory.
4. Push the commit and back up production before deploying a risky schema change:

   ```bash
   cd /var/www/lms_backend
   docker compose exec -T postgres pg_dump -U lms_user -d lms_db > "lms_db_$(date +%F_%H%M%S).sql"
   ```

5. Run the normal later-deployment commands from section 10. The rebuilt backend
   runs `prisma migrate deploy` and applies only migrations not already recorded in
   the production `_prisma_migrations` table.

Never use `prisma migrate dev` or `prisma db push` against production. Prisma
migrations are not automatically rolled back, so review destructive SQL and keep a
fresh backup before dropping or renaming columns/tables.

To inspect migration state on production:

```bash
docker compose run --rm backend npx prisma migrate status
```

## 12. Calendar sync (Outlook / Microsoft Graph)

Every lead follow-up with a "next follow-up" date/time is pushed as an event
onto the assigned salesperson's own Outlook calendar, and removed again when
the follow-up is marked complete. This uses **app-only** Microsoft Graph
credentials (client-credentials flow) instead of asking each user to sign in
and connect their calendar individually — appropriate here since the whole
company already sits on one Microsoft 365 tenant.

One-time setup by a Microsoft 365/Azure (Entra ID) admin:

1. In the [Azure Portal](https://portal.azure.com), go to **Entra ID → App
   registrations → New registration**. Any name (e.g. "EICE LMS Calendar
   Sync") and the default "single tenant" option are fine — no redirect URI
   is needed, since this app never signs a user in interactively.
2. Open the new app → **API permissions → Add a permission → Microsoft Graph
   → Application permissions** → select `Calendars.ReadWrite` → Add.
3. Still on **API permissions**, click **Grant admin consent for
   <tenant>** — this is the step that lets the app act on *any* mailbox in
   the tenant without a per-user login. Only a Global Admin or Privileged
   Role Admin can click this.
4. Open **Certificates & secrets → New client secret**, copy the generated
   value immediately (it is not shown again).
5. Note three values: the **Directory (tenant) ID** and **Application
   (client) ID** from the app's Overview page, and the **client secret**
   value from step 4.
6. Add them to the server's `.env`:

   ```env
   MS_GRAPH_TENANT_ID=<directory-tenant-id>
   MS_GRAPH_CLIENT_ID=<application-client-id>
   MS_GRAPH_CLIENT_SECRET=<client-secret-value>
   ```

7. Restart the backend (`docker compose restart backend`, or redeploy per
   section 10). No database migration is required beyond the one already
   committed with this feature (`add_calendar_sync`).

If these three variables are absent, follow-up creation/completion behaves
exactly as before — the calendar event is silently skipped, matching the
unconfigured-SMTP behavior for email. Sync failures (e.g. a wrong secret, or
an assigned user's mailbox not existing) are logged and recorded on the
follow-up row (`calendarSyncError`) rather than failing the request.

Rotate the client secret before its expiry (Azure secrets expire after at
most 24 months) — set a calendar reminder for this outside the app itself.

## 13. Teams lead notifications

Every time a new lead is created — whether from the admin/sales UI (`POST
/leads`) or from the public website's "Request a Demo" form
(`/public/forms/contact`) — an Adaptive Card is posted to a Microsoft Teams
channel via a Teams **Workflow** webhook (the built-in "Post to a channel
when a webhook request is received" template, not the deprecated Office 365
Incoming Webhook connector).

Setup:

1. In the target Teams channel, open **Workflows** and add "Post to a
   channel when a webhook request is received". Finish the wizard and copy
   the generated HTTP POST URL.
2. Add it to the server's `.env`:

   ```env
   TEAMS_LEAD_WEBHOOK_URL=<the workflow's webhook URL>
   ```

3. Restart the backend. No database migration is needed for this feature.

The backend POSTs the standard Teams message envelope (`{"type":"message",
"attachments":[{"contentType":"application/vnd.microsoft.card.adaptive",
"content": <Adaptive Card 1.4 JSON>}]}`) with the lead's name, company,
email, phone, source, assignee, and an "Open in LMS" button linking to
`FRONTEND_URL`. If your workflow's trigger schema was built from a
different sample payload than the template default, the card may not
render — check the flow's trigger schema and adjust
`src/notifications/teams-notification.service.ts` to match.

If `TEAMS_LEAD_WEBHOOK_URL` is absent, lead creation behaves exactly as
before — the notification is silently skipped. A failed post (bad URL,
Teams outage) is logged and never fails the lead-creation request.

## 14. Common operations

```bash
# Follow logs
docker compose logs -f backend postgres

# Restart only the API
docker compose restart backend

# Back up PostgreSQL
docker compose exec -T postgres pg_dump -U lms_user -d lms_db > "lms_db_$(date +%F_%H%M%S).sql"

# Stop containers but preserve database data
docker compose down
```

Never run `docker compose down -v` unless permanent database deletion is intended.

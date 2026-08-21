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

## 12. Common operations

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

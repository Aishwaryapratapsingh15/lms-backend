# Backend deployment: Linux VPS, Docker Compose, and Nginx

This repository deploys only the NestJS backend and PostgreSQL. The frontend is a
separate application/repository and is not built or started by this Compose stack.

The stack uses one canonical Compose file: `compose.yaml`.

## Runtime behavior

- `postgres` stores data in the persistent `postgres_data` Docker volume.
- `backend` runs pending Prisma migrations and then starts NestJS.
- `seed-admin` is an explicit one-time tool; normal startup never seeds data.
- PostgreSQL has no host port, and the API binds only to `127.0.0.1:4000` for Nginx.
- `FRONTEND_URL` is the separately deployed frontend URL used by backend CORS.

## 1. VPS prerequisites

Use a supported 64-bit Ubuntu VPS. Point the API domain, for example
`api.lms.example.com`, to the VPS public IP with a DNS `A` record.

Install Git and Nginx:

```bash
sudo apt update
sudo apt install -y git nginx
```

Install Docker Engine and the Docker Compose plugin using Docker's official guides:

- https://docs.docker.com/engine/install/ubuntu/
- https://docs.docker.com/compose/install/linux/

Verify and enable the services:

```bash
sudo systemctl enable --now docker nginx
docker --version
docker compose version
```

Allow only SSH, HTTP, and HTTPS through the VPS firewall. Do not open ports `4000`
or `5432` publicly.

## 2. Clone the backend

```bash
sudo mkdir -p /opt/eice
sudo chown "$USER":"$USER" /opt/eice
cd /opt/eice
git clone https://github.com/Aishwaryapratapsingh15/lms-backend.git
cd lms-backend
```

The frontend can be deployed independently on another server, platform, or domain.

## 3. Configure environment variables

```bash
cp .env.docker.example .env
nano .env
chmod 600 .env
```

Replace all placeholders. The essential production values include:

```dotenv
POSTGRES_DB=lms_db
POSTGRES_USER=lms_user
POSTGRES_PASSWORD=A_STRONG_DATABASE_PASSWORD
DATABASE_URL=postgresql://lms_user:URL_ENCODED_DATABASE_PASSWORD@postgres:5432/lms_db?schema=public

JWT_ACCESS_SECRET=A_LONG_RANDOM_SECRET
JWT_REFRESH_SECRET=ANOTHER_LONG_RANDOM_SECRET
PUBLIC_OTP_HASH_SECRET=A_THIRD_LONG_RANDOM_SECRET
COOKIE_SECURE=true

# Exact public URL of the separately deployed frontend; no trailing slash.
FRONTEND_URL=https://lms.example.com

INITIAL_ADMIN_NAME=Super Admin
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=A_UNIQUE_PASSWORD_WITH_AT_LEAST_12_CHARACTERS
```

`POSTGRES_PASSWORD` is the raw database password. URL-encode special characters in
the same password when placing it inside `DATABASE_URL`. Configure the SMTP and
public-form recipient variables from `.env.docker.example` as well.

Generate independent secrets with a password manager or:

```bash
openssl rand -hex 32
```

Never commit `.env`.

## 4. First deployment

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 backend postgres
```

The backend waits for a healthy PostgreSQL container, runs `prisma migrate deploy`,
and starts only if migrations succeed.

## 5. Create the first Super Admin once

```bash
docker compose run --rm seed-admin
```

This creates one `SUPER_ADMIN` from `INITIAL_ADMIN_*`. If the email already exists,
the command changes nothing. Do not run this during routine deployments.

After confirming the admin can log in, remove `INITIAL_ADMIN_PASSWORD` from `.env`
and keep the password in a password manager. Backend startup does not require it.

## 6. Configure Nginx

Replace `api.lms.example.com` in `deploy/nginx/lms.conf`, then enable it:

```bash
sudo cp deploy/nginx/lms.conf /etc/nginx/sites-available/eice-lms-api
sudo ln -s /etc/nginx/sites-available/eice-lms-api /etc/nginx/sites-enabled/eice-lms-api
sudo nginx -t
sudo systemctl reload nginx
```

The Nginx host proxies the public API domain to `127.0.0.1:4000`. Do not reload
Nginx unless `sudo nginx -t` succeeds.

## 7. Enable HTTPS

After DNS resolves and the HTTP API domain works, install Certbot using the current
instructions at https://certbot.eff.org/ and select Nginx with the VPS OS. Then run:

```bash
sudo certbot --nginx -d api.lms.example.com
sudo certbot renew --dry-run
```

Use the real API domain in place of the example.

## 8. Every later deployment

```bash
cd /opt/eice/lms-backend
git pull --ff-only
docker compose config --quiet
docker compose up -d --build --remove-orphans
docker compose ps
docker compose logs --tail=100 backend postgres
```

Do not run `seed-admin`. Pending migrations apply automatically, while existing
users, passwords, leads, and form submissions remain unchanged in PostgreSQL.

## 9. Common operations

Follow logs:

```bash
docker compose logs -f backend postgres
```

Restart only the API without reseeding:

```bash
docker compose restart backend
```

Back up PostgreSQL:

```bash
docker compose exec -T postgres pg_dump -U lms_user -d lms_db > lms_db_backup.sql
```

Stop containers while preserving the database volume:

```bash
docker compose down
```

Never run `docker compose down -v` unless permanent database deletion is intended.

## 10. Verify the deployment

```bash
curl -I https://api.lms.example.com/api/docs
docker compose ps
```

If the backend restarts repeatedly, inspect `docker compose logs backend`. Invalid
database credentials, unavailable PostgreSQL, or a failed migration prevents the API
from starting against an outdated schema.

# Backend deployment: Linux VPS, Docker Compose, and Nginx

This repository deploys only the NestJS backend and PostgreSQL. The frontend is a
separate application/repository and is not built or started by this Compose stack.

The stack uses one canonical Compose file: `compose.yaml`.

## Runtime behavior

- `postgres` stores data in the persistent `postgres_data` Docker volume.
- `backend` runs pending Prisma migrations and then starts NestJS.
- The admin seed is an explicit backend command; normal startup never seeds data.
- PostgreSQL has no host port, and the API binds only to `127.0.0.1:4010` for Nginx.
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

Allow only SSH, HTTP, and HTTPS through the VPS firewall. Do not open ports `4010`
or `5432` publicly.

## 2. Clone the backend

```bash
sudo mkdir -p /opt/eice
sudo chown "$USER":"$USER" /opt/eice
cd /opt/eice
git clone https://github.com/Aishwaryapratapsingh15/lms-backend.git
cd lms-backend
```

## 3. Copy the private environment file

Copy the prepared private `.env` from the trusted workstation into
`/opt/eice/lms-backend/.env`, then protect it:

```bash
cd /opt/eice/lms-backend
chmod 600 .env
```

The file already contains the PostgreSQL, Prisma, JWT, CORS, SMTP, OTP, recipient,
and initial admin settings. Never commit or send `.env` through an insecure channel.

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
docker compose run --rm backend node dist/scripts/seed-admin.js
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

The Nginx host proxies the public API domain to `127.0.0.1:4010`. Do not reload
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

Do not run the admin seed command. Pending migrations apply automatically, while
existing users, passwords, leads, and form submissions remain unchanged in PostgreSQL.

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

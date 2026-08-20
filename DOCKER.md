# Linux VPS deployment with Docker Compose and Nginx

This deployment keeps PostgreSQL, the NestJS backend, and the Next.js frontend in
Docker. Nginx runs on the VPS host and proxies public HTTPS domains to ports bound
only to `127.0.0.1`.

The important lifecycle behavior is:

- Every backend container start runs `prisma migrate deploy` before NestJS starts.
- Migrations apply only pending migration files and do not erase existing data.
- App startup does not seed users, passwords, or demo leads.
- The first Super Admin is created only when the explicit one-time seed command is run.
- Re-running the admin command does not modify an existing user.

## 1. Prerequisites

Use a supported 64-bit Ubuntu VPS. Point these DNS `A` records to its public IP:

- `lms.example.com` for the frontend
- `api.lms.example.com` for the backend

Install Git and Nginx:

```bash
sudo apt update
sudo apt install -y git nginx
```

Install Docker Engine and the Docker Compose plugin from Docker's official Ubuntu
repository instructions:

- https://docs.docker.com/engine/install/ubuntu/
- https://docs.docker.com/compose/install/linux/

Verify the installation:

```bash
sudo systemctl enable --now docker nginx
docker --version
docker compose version
```

Allow only SSH, HTTP, and HTTPS through the VPS firewall. Ports `3000`, `4000`, and
`5432` must not be opened publicly.

## 2. Clone the repositories

The current Compose file expects the backend and frontend to be sibling folders:

```text
/opt/eice/lms-backend
/opt/eice/lms-frontend
```

Example:

```bash
sudo mkdir -p /opt/eice
sudo chown "$USER":"$USER" /opt/eice
cd /opt/eice
git clone https://github.com/Aishwaryapratapsingh15/lms-backend.git
git clone FRONTEND_REPOSITORY_URL lms-frontend
```

## 3. Configure production environment

```bash
cd /opt/eice/lms-backend
cp .env.docker.example .env
nano .env
chmod 600 .env
```

At minimum, replace every placeholder and set:

```dotenv
POSTGRES_DB=lms_db
POSTGRES_USER=lms_user
POSTGRES_PASSWORD=A_STRONG_DATABASE_PASSWORD
DATABASE_URL=postgresql://lms_user:URL_ENCODED_DATABASE_PASSWORD@postgres:5432/lms_db?schema=public

JWT_ACCESS_SECRET=A_LONG_RANDOM_SECRET
JWT_REFRESH_SECRET=ANOTHER_LONG_RANDOM_SECRET
PUBLIC_OTP_HASH_SECRET=A_THIRD_LONG_RANDOM_SECRET
COOKIE_SECURE=true

FRONTEND_URL=https://lms.example.com
NEXT_PUBLIC_API_BASE_URL=https://api.lms.example.com

INITIAL_ADMIN_NAME=Super Admin
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=A_UNIQUE_PASSWORD_WITH_AT_LEAST_12_CHARACTERS
```

`POSTGRES_PASSWORD` is the raw PostgreSQL password. In `DATABASE_URL`, URL-encode
special characters in that same password. Also configure all SMTP and public-form
recipient variables from `.env.docker.example`.

Generate secrets with a password manager or a command such as:

```bash
openssl rand -hex 32
```

Never commit `.env`.

## 4. First application start

From the backend directory:

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 backend
```

The backend waits for PostgreSQL to become healthy, applies migrations, and then
starts. Confirm that `postgres`, `backend`, and `frontend` are healthy.

## 5. Create the initial Super Admin once

Run this only after the first successful startup:

```bash
docker compose run --rm seed-admin
```

The command creates one `SUPER_ADMIN` using `INITIAL_ADMIN_*`. If that email already
exists, it exits without changing its name, password, role, or active status.

After a successful login, remove the plaintext password from `.env`:

```bash
nano .env
```

Delete only the `INITIAL_ADMIN_PASSWORD` line. Normal application startup does not
need any `INITIAL_ADMIN_*` variable. Store the password in a password manager.

## 6. Configure Nginx

Edit the example domains in `deploy/nginx/lms.conf`, then install it:

```bash
sudo cp deploy/nginx/lms.conf /etc/nginx/sites-available/eice-lms
sudo ln -s /etc/nginx/sites-available/eice-lms /etc/nginx/sites-enabled/eice-lms
sudo nginx -t
sudo systemctl reload nginx
```

If the default Nginx site conflicts with the domains, disable that site and test
the configuration again. Do not enable a configuration until `sudo nginx -t`
succeeds.

## 7. Enable HTTPS

After DNS resolves and both HTTP domains work, install Certbot using the current
instructions at https://certbot.eff.org/ and select Nginx with the VPS operating
system. Then request both certificates:

```bash
sudo certbot --nginx -d lms.example.com -d api.lms.example.com
sudo certbot renew --dry-run
```

Replace the example domains in this command with the real domains.

## 8. Every later deployment

Pull both repositories and rebuild the stack:

```bash
cd /opt/eice/lms-frontend
git pull --ff-only

cd /opt/eice/lms-backend
git pull --ff-only
docker compose config --quiet
docker compose up -d --build --remove-orphans
docker compose ps
docker compose logs --tail=100 backend frontend
```

Do not run `seed-admin` during normal deployments. Pending migrations run
automatically; existing users, passwords, leads, and form submissions remain in the
persistent PostgreSQL volume.

## 9. Operations and safety

Follow logs:

```bash
docker compose logs -f backend frontend postgres
```

Restart application containers without reseeding:

```bash
docker compose restart backend frontend
```

Create a database backup:

```bash
docker compose exec -T postgres pg_dump -U lms_user -d lms_db > lms_db_backup.sql
```

Stop containers while keeping database data:

```bash
docker compose down
```

The named `postgres_data` volume persists across rebuilds and `docker compose down`.
Never run `docker compose down -v` unless permanent database deletion is intended.

## 10. Verification

```bash
curl -I https://lms.example.com
curl -I https://api.lms.example.com/api/docs
docker compose ps
```

If the backend repeatedly restarts, inspect `docker compose logs backend`. A failed
migration, invalid `DATABASE_URL`, or unavailable PostgreSQL will prevent NestJS
from starting instead of starting against an outdated schema.

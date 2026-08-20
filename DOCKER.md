# Production Docker deployment

The Compose stack exposes the NestJS API on port `4000` and the Next.js UI on port `3000`.

Keep `LMS` and `lms-frontend` as sibling directories on the VPS. From the `LMS` directory:

```bash
cp .env.docker.example .env
nano .env
docker compose build
docker compose up -d
docker compose ps
```

Set the PHP Gmail address and app password in `SMTP_USER`, `SMTP_FROM`, and `SMTP_PASS`. For direct port access, replace `YOUR_VPS_IP` in both public URLs. When using HTTPS domains, set those URLs before building the frontend.

Prisma migrations run automatically whenever the backend container starts. PostgreSQL data is persisted in the `postgres_data` Docker volume.

Useful commands:

```bash
docker compose logs -f backend frontend
docker compose restart backend frontend
docker compose down
```

`docker compose down` keeps database data. Do not use `docker compose down -v` unless the database volume should be permanently deleted.

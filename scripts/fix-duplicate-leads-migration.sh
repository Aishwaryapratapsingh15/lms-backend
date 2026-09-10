#!/usr/bin/env sh
# Run this from the lms_backend directory on the server (where compose.yaml lives).
# One-shot fix for the blocked migration 20260910000000_add_lead_active_duplicate_unique_indexes:
#   1. Prints the duplicate-email groups and which lead each one will keep active.
#   2. Archives the losers (reversible: PATCH /leads/:id/restore un-archives any of them).
#   3. Checks for duplicate active phone numbers (prints only — does not auto-archive these,
#      since none were reported; if it finds any, stop and ask before proceeding).
#   4. Verifies zero duplicates remain.
#   5. Resolves the failed migration and re-applies it (plus anything queued behind it).
#   6. Starts the backend normally.
set -e

echo "== 1. Duplicate email groups (rn=1 stays active, rn>1 will be archived) =="
sudo docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
WITH ranked AS (
  SELECT
    l.id, l."fullName", l.email, l.status, l."assignedToId", l."createdAt",
    ROW_NUMBER() OVER (
      PARTITION BY lower(l.email)
      ORDER BY
        CASE l.status
          WHEN 'WON' THEN 7 WHEN 'PROJECT_IS_OURS' THEN 7 WHEN 'PO_RECEIVED' THEN 6
          WHEN 'PROPOSAL' THEN 5 WHEN 'QUALIFIED' THEN 4 WHEN 'FOLLOW_UP' THEN 3
          WHEN 'CONTACTED' THEN 2 WHEN 'NEW' THEN 1 WHEN 'LOST' THEN 0 ELSE 1
        END DESC,
        (l."assignedToId" IS NOT NULL) DESC,
        (SELECT count(*) FROM "LeadFollowUp" lf WHERE lf."leadId" = l.id) DESC,
        l."createdAt" DESC
    ) AS rn
  FROM "Lead" l
  WHERE l."archivedAt" IS NULL AND l.email IS NOT NULL
)
SELECT * FROM ranked
WHERE lower(email) IN (
  SELECT lower(email) FROM "Lead" WHERE "archivedAt" IS NULL AND email IS NOT NULL
  GROUP BY lower(email) HAVING count(*) > 1
)
ORDER BY lower(email), rn;
SQL

echo ""
echo "== 2. Archiving duplicates (email) =="
sudo docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
BEGIN;
WITH ranked AS (
  SELECT l.id,
    ROW_NUMBER() OVER (
      PARTITION BY lower(l.email)
      ORDER BY
        CASE l.status
          WHEN 'WON' THEN 7 WHEN 'PROJECT_IS_OURS' THEN 7 WHEN 'PO_RECEIVED' THEN 6
          WHEN 'PROPOSAL' THEN 5 WHEN 'QUALIFIED' THEN 4 WHEN 'FOLLOW_UP' THEN 3
          WHEN 'CONTACTED' THEN 2 WHEN 'NEW' THEN 1 WHEN 'LOST' THEN 0 ELSE 1
        END DESC,
        (l."assignedToId" IS NOT NULL) DESC,
        (SELECT count(*) FROM "LeadFollowUp" lf WHERE lf."leadId" = l.id) DESC,
        l."createdAt" DESC
    ) AS rn
  FROM "Lead" l
  WHERE l."archivedAt" IS NULL AND l.email IS NOT NULL
),
to_archive AS (SELECT id FROM ranked WHERE rn > 1)
UPDATE "Lead" SET "archivedAt" = now() WHERE id IN (SELECT id FROM to_archive);

INSERT INTO "LeadActivity" (id, "leadId", type, details, "createdAt")
SELECT gen_random_uuid(), id, 'ARCHIVED'::"LeadActivityType",
       jsonb_build_object('reason', 'duplicate-email-reconciliation, migration 20260910000000'),
       now()
FROM (SELECT id FROM ranked WHERE rn > 1) x;
COMMIT;
SQL

echo ""
echo "== 3. Duplicate active phone numbers (informational — review before proceeding if non-empty) =="
sudo docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT phone, count(*), array_agg(id) FROM "Lead"
WHERE "archivedAt" IS NULL AND phone IS NOT NULL
GROUP BY phone HAVING count(*) > 1;
SQL

echo ""
echo "== 4. Verification (both must be empty) =="
sudo docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT lower(email), count(*) FROM "Lead" WHERE "archivedAt" IS NULL AND email IS NOT NULL GROUP BY lower(email) HAVING count(*) > 1;
SELECT phone, count(*) FROM "Lead" WHERE "archivedAt" IS NULL AND phone IS NOT NULL GROUP BY phone HAVING count(*) > 1;
SQL

echo ""
echo "== 5. Resolving and re-applying the migration =="
sudo docker compose run --rm backend npx prisma migrate resolve --rolled-back "20260910000000_add_lead_active_duplicate_unique_indexes"
sudo docker compose run --rm backend npx prisma migrate deploy

echo ""
echo "== 6. Starting the backend =="
sudo docker compose up -d backend
sleep 3
sudo docker compose logs --tail=40 backend

-- Enforce, at the database level, the same "no two active leads share an
-- email or phone" rule the application already checks in code. The app-side
-- check (SELECT ... then INSERT) has a race window between two concurrent
-- requests; these partial unique indexes close it by making Postgres reject
-- the second insert/update outright (Prisma surfaces this as error P2002).
-- Scoped to archivedAt IS NULL so archived leads never block re-creation,
-- matching the existing application-level duplicate check.
CREATE UNIQUE INDEX "Lead_active_email_unique" ON "Lead" (lower("email")) WHERE "archivedAt" IS NULL AND "email" IS NOT NULL;
CREATE UNIQUE INDEX "Lead_active_phone_unique" ON "Lead" ("phone") WHERE "archivedAt" IS NULL AND "phone" IS NOT NULL;

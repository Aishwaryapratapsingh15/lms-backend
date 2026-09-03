-- CreateEnum
CREATE TYPE "LeadType" AS ENUM ('INTERNAL', 'EXTERNAL');

-- ExtendEnum
ALTER TYPE "LeadActivityType" ADD VALUE 'AUTO_ASSIGNED';
ALTER TYPE "LeadActivityType" ADD VALUE 'SLA_REMINDER_SENT';
ALTER TYPE "LeadActivityType" ADD VALUE 'SLA_ESCALATED';

-- AlterTable
ALTER TABLE "Lead"
ADD COLUMN "leadType" "LeadType" NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN "unassignedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "slaReminderSentAt" TIMESTAMP(3),
ADD COLUMN "slaEscalatedAt" TIMESTAMP(3);

-- Existing leads created outside the authenticated LMS are external leads.
UPDATE "Lead"
SET "leadType" = 'EXTERNAL'
WHERE "createdById" IS NULL;

-- Assigned leads are not waiting in the unassigned-lead SLA queue.
UPDATE "Lead"
SET "unassignedAt" = NULL
WHERE "assignedToId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "Lead_assignedToId_archivedAt_unassignedAt_idx"
ON "Lead"("assignedToId", "archivedAt", "unassignedAt");

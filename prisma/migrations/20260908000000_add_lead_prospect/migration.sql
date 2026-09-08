-- ExtendEnum
ALTER TYPE "LeadActivityType" ADD VALUE 'MARKED_PROSPECT';
ALTER TYPE "LeadActivityType" ADD VALUE 'UNMARKED_PROSPECT';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "prospectedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Lead_archivedAt_prospectedAt_idx" ON "Lead"("archivedAt", "prospectedAt");

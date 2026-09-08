-- ExtendEnum
ALTER TYPE "LeadStatus" ADD VALUE 'PO_RECEIVED';

-- CreateEnum
CREATE TYPE "VendorEventAttendance" AS ENUM ('ATTENDED', 'VIRTUAL_MEETING');

-- AlterTable
ALTER TABLE "Lead"
ADD COLUMN "city" TEXT,
ADD COLUMN "state" TEXT,
ADD COLUMN "product" TEXT,
ADD COLUMN "quantity" INTEGER,
ADD COLUMN "productDescription" TEXT,
ADD COLUMN "wonAt" TIMESTAMP(3);

-- Backfill wonAt for leads already sitting at WON so the "recent wins by
-- month" report has a starting point instead of showing nothing for
-- pre-existing wins.
UPDATE "Lead" SET "wonAt" = "updatedAt" WHERE "status" = 'WON';

-- CreateTable
CREATE TABLE "VendorEvent" (
    "id" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3),
    "attendance" "VendorEventAttendance",
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorEvent_eventDate_idx" ON "VendorEvent"("eventDate");

-- AddForeignKey
ALTER TABLE "VendorEvent" ADD CONSTRAINT "VendorEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

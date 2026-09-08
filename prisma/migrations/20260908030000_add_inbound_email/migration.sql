-- CreateEnum
CREATE TYPE "EmailDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- ExtendEnum
ALTER TYPE "LeadActivityType" ADD VALUE 'EMAIL_REPLY_RECEIVED';

-- AlterTable
ALTER TABLE "EmailLog"
ADD COLUMN "direction" "EmailDirection" NOT NULL DEFAULT 'OUTBOUND',
ADD COLUMN "messageId" TEXT;

-- CreateIndex
CREATE INDEX "EmailLog_messageId_idx" ON "EmailLog"("messageId");

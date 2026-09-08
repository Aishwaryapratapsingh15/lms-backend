-- CreateTable
CREATE TABLE "FollowUpRead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "followUpId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FollowUpRead_userId_followUpId_key" ON "FollowUpRead"("userId", "followUpId");

-- CreateIndex
CREATE INDEX "FollowUpRead_followUpId_idx" ON "FollowUpRead"("followUpId");

-- AddForeignKey
ALTER TABLE "FollowUpRead" ADD CONSTRAINT "FollowUpRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpRead" ADD CONSTRAINT "FollowUpRead_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "LeadFollowUp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

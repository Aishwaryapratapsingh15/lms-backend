-- LeadFollowUp.userId was NOT NULL with ON DELETE CASCADE, unlike every
-- other "who did this" attribution relation to User (Lead.assignedTo/
-- createdBy, LeadActivity.actor, EmailLog.user, VendorEvent.createdBy),
-- which all use SetNull. Deleting a user would have silently destroyed
-- every follow-up/note they ever logged on any lead — real business
-- history. Switch to nullable + SetNull to match the rest of the schema.
ALTER TABLE "LeadFollowUp" DROP CONSTRAINT "LeadFollowUp_userId_fkey";
ALTER TABLE "LeadFollowUp" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "LeadFollowUp" ADD CONSTRAINT "LeadFollowUp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

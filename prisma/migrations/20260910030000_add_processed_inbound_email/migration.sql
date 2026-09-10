-- Tracks which inbound email Message-IDs InboundEmailService has already
-- claimed, so reprocessing the same message (after a crash/retry before the
-- IMAP \Seen flag was set) is a no-op instead of sending duplicate relays
-- or creating duplicate EmailLog rows.
CREATE TABLE "ProcessedInboundEmail" (
    "messageId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedInboundEmail_pkey" PRIMARY KEY ("messageId")
);

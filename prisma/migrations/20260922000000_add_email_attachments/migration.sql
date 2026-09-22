-- Emails sent from a lead can now carry file attachments (brochures, docs,
-- images). Only filenames are recorded here for history/audit display — the
-- actual file bytes are never persisted, only relayed to the SMTP send.
ALTER TABLE "EmailLog" ADD COLUMN "attachments" TEXT[] NOT NULL DEFAULT '{}';

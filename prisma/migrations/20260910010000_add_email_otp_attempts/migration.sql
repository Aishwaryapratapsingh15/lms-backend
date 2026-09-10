-- Track failed verification attempts per OTP so a single email/OTP pair can
-- be locked out after too many wrong guesses, independent of which IP the
-- guesses come from (the existing rate limiting is IP-keyed only).
ALTER TABLE "email_otp" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

-- Moves RateLimitGuard's counters from an in-process Map to Postgres, so
-- rate limits (login, password reset, OTP, etc.) survive process restarts
-- and stay consistent across multiple backend instances sharing this DB.
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");

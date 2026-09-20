CREATE TABLE "AppSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppSession_userId_idx" ON "AppSession"("userId");
CREATE INDEX "AppSession_revokedAt_idx" ON "AppSession"("revokedAt");

CREATE TABLE "RateLimitBucket" (
  "id" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "windowStart" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Document" ADD COLUMN "versionCounter" INTEGER NOT NULL DEFAULT 0;
UPDATE "Document" d
SET "versionCounter" = COALESCE((SELECT MAX(v."versionNumber") FROM "DocumentVersion" v WHERE v."documentId" = d."id"), 0);

-- Durable cleanup work survives document cascades. sourceDocumentId is intentionally not a foreign key.
CREATE TABLE "StorageDeletionJob" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "objectPath" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastErrorCode" TEXT,
    "sourceDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StorageDeletionJob_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DocumentCollaborators" ADD COLUMN "revokedAt" TIMESTAMP(3), ADD COLUMN "revokedBy" TEXT;

CREATE UNIQUE INDEX "StorageDeletionJob_bucket_objectPath_key" ON "StorageDeletionJob"("bucket", "objectPath");
CREATE INDEX "StorageDeletionJob_nextAttemptAt_id_idx" ON "StorageDeletionJob"("nextAttemptAt", "id");
CREATE INDEX "DocumentCollaborators_documentId_revokedAt_idx" ON "DocumentCollaborators"("documentId", "revokedAt");
CREATE INDEX "RateLimitBucket_windowStart_idx" ON "RateLimitBucket"("windowStart");
CREATE INDEX "AppSession_lastSeenAt_idx" ON "AppSession"("lastSeenAt");
CREATE INDEX "Document_lastEditedAt_id_idx" ON "Document"("lastEditedAt", "id");

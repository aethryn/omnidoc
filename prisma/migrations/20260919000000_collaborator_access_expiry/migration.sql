ALTER TABLE "DocumentCollaborators"
ADD COLUMN "accessExpiresAt" TIMESTAMP(3);

CREATE INDEX "DocumentCollaborators_documentId_accessExpiresAt_idx"
ON "DocumentCollaborators"("documentId", "accessExpiresAt");

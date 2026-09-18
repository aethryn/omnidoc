ALTER TABLE "DocumentVersion" ADD COLUMN "title" TEXT NOT NULL DEFAULT 'Untitled document';
ALTER TABLE "DocumentVersion" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'automatic';
ALTER TABLE "DocumentVersion" ADD COLUMN "contentHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DocumentVersion" ADD COLUMN "contributors" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "DocumentVersion" SET "contentHash" = md5("documentId" || ':' || "versionNumber" || ':' || "content");
CREATE UNIQUE INDEX "DocumentVersion_documentId_versionNumber_key" ON "DocumentVersion"("documentId", "versionNumber");
CREATE UNIQUE INDEX "DocumentVersion_documentId_contentHash_key" ON "DocumentVersion"("documentId", "contentHash");

ALTER TABLE "DocumentComment" ADD COLUMN "parentId" TEXT;
ALTER TABLE "DocumentComment" ADD COLUMN "anchorType" TEXT NOT NULL DEFAULT 'general';
ALTER TABLE "DocumentComment" ADD COLUMN "anchorText" TEXT;
ALTER TABLE "DocumentComment" ADD COLUMN "resolvedAt" TIMESTAMP(3);
ALTER TABLE "DocumentComment" ADD COLUMN "resolvedBy" TEXT;
ALTER TABLE "DocumentComment" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "DocumentComment" ADD CONSTRAINT "DocumentComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DocumentComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "DocumentComment_parentId_idx" ON "DocumentComment"("parentId");

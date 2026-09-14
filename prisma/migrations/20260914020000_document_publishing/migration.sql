CREATE TYPE "public"."DocumentStatus" AS ENUM ('WORKING_DRAFT', 'COMPLETE');

ALTER TABLE "public"."Document"
ADD COLUMN "status" "public"."DocumentStatus" NOT NULL DEFAULT 'WORKING_DRAFT',
ADD COLUMN "previewText" VARCHAR(360) NOT NULL DEFAULT '',
ADD COLUMN "previewImageUrl" TEXT,
ADD COLUMN "wordCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "public"."Document" SET "status" = 'COMPLETE' WHERE "isPublic" = true;

ALTER TABLE "public"."Document" DROP COLUMN "isPublic";

CREATE TABLE "public"."DocumentPublication" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "excerpt" VARCHAR(360) NOT NULL DEFAULT '',
  "revisionHash" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentPublication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentPublication_documentId_key" ON "public"."DocumentPublication"("documentId");
CREATE INDEX "DocumentPublication_isActive_idx" ON "public"."DocumentPublication"("isActive");
CREATE INDEX "DocumentPublication_publishedAt_idx" ON "public"."DocumentPublication"("publishedAt");
CREATE INDEX "Document_status_idx" ON "public"."Document"("status");

ALTER TABLE "public"."DocumentPublication"
ADD CONSTRAINT "DocumentPublication_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

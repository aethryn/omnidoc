CREATE TABLE "LinkPreview" (
    "urlHash" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "siteName" TEXT,
    "faviconUrl" TEXT,
    "imageUrl" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LinkPreview_pkey" PRIMARY KEY ("urlHash")
);

CREATE INDEX "LinkPreview_expiresAt_idx" ON "LinkPreview"("expiresAt");

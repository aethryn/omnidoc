ALTER TABLE "public"."UserSettings" ADD COLUMN "activeAiProvider" TEXT;

CREATE TABLE "public"."AIProviderCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedKey" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "authTag" BYTEA NOT NULL,
    "keyHint" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIProviderCredential_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AIProviderCredential_userId_idx" ON "public"."AIProviderCredential"("userId");
CREATE UNIQUE INDEX "AIProviderCredential_userId_provider_key" ON "public"."AIProviderCredential"("userId", "provider");
ALTER TABLE "public"."AIProviderCredential" ADD CONSTRAINT "AIProviderCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

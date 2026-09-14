-- Google OAuth users do not have application passwords.
ALTER TABLE "public"."User" ALTER COLUMN "password" DROP NOT NULL;

-- Persist the encoded Yjs document so the collaboration process can restart safely.
ALTER TABLE "public"."Document" ADD COLUMN "yjsState" BYTEA;

-- Share links are revocable without deleting their audit record.
ALTER TABLE "public"."DocumentShare" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;


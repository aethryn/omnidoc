import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { avatarFromAuthMetadata, nameFromAuthMetadata } from "@/lib/avatar";

export type AuthResult = { userId?: string; sessionId?: string; name?: string; email?: string; avatar?: string; error?: string; code?: "NOT_AUTHENTICATED" | "SESSION_REVOKED" };

type SessionClaim = { sub?: unknown; session_id?: unknown; exp?: unknown; email?: unknown; user_metadata?: unknown };

async function registerOrValidateSession(userId: string, claims: SessionClaim): Promise<AuthResult> {
  const sessionId = typeof claims.session_id === "string" ? claims.session_id : undefined;
  if (!sessionId) return { userId };

  // JWT `exp` is the access-token lifetime, not the Supabase session lifetime.
  // Refreshing a valid Supabase session may issue a new token with a new exp.
  const expiresAt = null;
  const existing = await prisma.$queryRaw<Array<{ userId: string; revokedAt: Date | null; expiresAt: Date | null }>>`
    SELECT "userId", "revokedAt", "expiresAt" FROM "AppSession" WHERE "id" = ${sessionId} LIMIT 1
  `;
  if (existing[0] && (existing[0].userId !== userId || existing[0].revokedAt)) {
    return { error: "Session revoked", code: "SESSION_REVOKED", sessionId };
  }

  await prisma.$executeRaw`
    INSERT INTO "AppSession" ("id", "userId", "expiresAt", "lastSeenAt")
    VALUES (${sessionId}, ${userId}, ${expiresAt}, CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO UPDATE SET "lastSeenAt" = CURRENT_TIMESTAMP, "expiresAt" = COALESCE(EXCLUDED."expiresAt", "AppSession"."expiresAt")
  `;
  return { userId, sessionId };
}

export async function getCurrentAuth(): Promise<AuthResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = (data?.claims || {}) as SessionClaim;
  const userId = typeof claims.sub === "string" ? claims.sub : undefined;
  if (error || !userId) return { error: "Not authenticated", code: "NOT_AUTHENTICATED" };
  const session = await registerOrValidateSession(userId, claims);
  if (session.error) return session;
  const avatar = avatarFromAuthMetadata(claims.user_metadata);
  const name = nameFromAuthMetadata(claims.user_metadata);
  return {
    ...session,
    ...(name ? { name } : {}),
    ...(typeof claims.email === "string" ? { email: claims.email } : {}),
    ...(avatar ? { avatar } : {}),
  };
}

export async function getCurrentUserIdFromRequest(_request?: unknown): Promise<AuthResult> {
  return getCurrentAuth();
}

export function createAuthErrorResponse(authResult?: AuthResult): NextResponse {
  return NextResponse.json(
    { error: authResult?.error || "Not authenticated", code: authResult?.code || "NOT_AUTHENTICATED" },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  );
}

export function activeCollaboratorConstraint() {
  return {
    acceptedAt: { not: null },
    OR: [
      { accessExpiresAt: null },
      { accessExpiresAt: { gt: new Date() } },
    ],
  };
}

export function activeCollaboratorWhere(userId: string, requiredRoles?: string[]) {
  return {
    userId,
    ...(requiredRoles ? { role: { in: requiredRoles } } : {}),
    ...activeCollaboratorConstraint(),
  };
}

export function documentAccessWhere(userId: string, requiredRoles?: string[]) {
  return {
    OR: [
      { userId },
      { collaborators: { some: activeCollaboratorWhere(userId, requiredRoles) } },
    ],
  };
}

// Helper to verify if user has access to a document (owner or accepted collaborator)
export async function verifyDocumentAccess(
  prisma: any,
  documentId: string,
  userId: string,
  requiredRoles: string[] = ['admin', 'editor']
): Promise<{ authorized: boolean; document: any | null }> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, ...documentAccessWhere(userId, requiredRoles) },
  });

  return {
    authorized: !!document,
    document,
  };
}

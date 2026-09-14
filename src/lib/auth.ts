import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type AuthResult = { userId?: string; error?: string };

export async function getCurrentUserIdFromRequest(_request?: unknown): Promise<AuthResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { error: "Not authenticated" };
  return { userId: data.user.id };
}

export function createAuthErrorResponse(_authResult?: AuthResult): NextResponse {
  return NextResponse.json(
    { error: "Not authenticated", code: "NOT_AUTHENTICATED" },
    { status: 401 }
  );
}

// verify raw JWT token string (useful for WebSockets, background tasks, etc.)
export function verifyAuthToken(token: string | undefined | null): AuthResult {
  if (!token) {
    return { error: "No authentication token provided", errorType: 'missing' };
  }

  try {
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not defined");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET) as any;

    if (!decoded || !decoded.userId) {
      return { error: "Invalid authentication token", errorType: 'invalid' };
    }

    return { userId: decoded.userId };
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return { error: "Token has expired", errorType: 'expired' };
    } else if (error.name === 'JsonWebTokenError') {
      return { error: "Invalid token", errorType: 'invalid' };
    }
    return { error: "Authentication failed", errorType: 'invalid' };
  }
}

// Helper to verify if user has access to a document (owner or accepted collaborator)
export async function verifyDocumentAccess(
  prisma: any,
  documentId: string,
  userId: string,
  requiredRoles: string[] = ['admin', 'editor']
): Promise<{ authorized: boolean; document: any | null }> {
  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      OR: [
        { userId },
        {
          collaborators: {
            some: {
              userId,
              role: { in: requiredRoles },
              acceptedAt: { not: null },
            },
          },
        },
      ],
    },
  });

  return {
    authorized: !!document,
    document,
  };
}


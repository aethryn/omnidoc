import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type AuthResult = { userId?: string; error?: string };

export async function getCurrentUserIdFromRequest(_request?: unknown): Promise<AuthResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return { error: "Not authenticated" };
  return { userId };
}

export function createAuthErrorResponse(_authResult?: AuthResult): NextResponse {
  return NextResponse.json(
    { error: "Not authenticated", code: "NOT_AUTHENTICATED" },
    { status: 401 }
  );
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

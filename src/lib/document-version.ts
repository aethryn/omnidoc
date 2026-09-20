import { createHash } from "crypto";

export function documentContentHash(title: string, content: string) { return createHash("sha256").update(`${title}\n${content}`).digest("hex"); }

export async function allocateDocumentVersionNumber(prisma: any, documentId: string) {
  const rows = await prisma.$queryRaw<Array<{ versionCounter: number }>>`
    UPDATE "Document"
    SET "versionCounter" = "versionCounter" + 1
    WHERE "id" = ${documentId}
    RETURNING "versionCounter"
  `;
  if (!rows[0]) throw new Error("DOCUMENT_NOT_FOUND");
  return Number(rows[0].versionCounter);
}

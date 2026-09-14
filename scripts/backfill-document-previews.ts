import { prisma } from "../src/lib/prisma";
import { deriveDocumentPreview } from "../src/lib/document-content";

async function main() {
  const documents = await prisma.document.findMany({ select: { id: true, content: true } });
  for (const document of documents) {
    await prisma.document.update({ where: { id: document.id }, data: deriveDocumentPreview(document.content) });
  }
  console.info(`Backfilled ${documents.length} document previews.`);
}

main().finally(() => prisma.$disconnect());

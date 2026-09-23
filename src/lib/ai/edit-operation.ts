export type AiEditScope = "auto" | "selection" | "document";
export type AiEditOperation = "replace-selection" | "replace-blocks" | "insert-at-caret" | "replace-document";
export type AiEditResult = { operation: AiEditOperation; startBlockId?: string; endBlockId?: string; expectedText: string; markdown: string };

const operations = new Set<AiEditOperation>(["replace-selection", "replace-blocks", "insert-at-caret", "replace-document"]);

export function parseAiEditResult(value: unknown, blockIds: Set<string>): AiEditResult {
  if (!value || typeof value !== "object") throw new Error("Omni returned an invalid edit");
  const item = value as Record<string, unknown>;
  const operation = item.operation;
  const expectedText = item.expectedText;
  const markdown = item.markdown;
  if (typeof operation !== "string" || !operations.has(operation as AiEditOperation)) throw new Error("Omni returned an unsupported edit operation");
  if (typeof expectedText !== "string" || expectedText.length > 100_000 || typeof markdown !== "string" || markdown.length > 100_000) throw new Error("Omni returned an invalid edit payload");
  const startBlockId = typeof item.startBlockId === "string" ? item.startBlockId : undefined;
  const endBlockId = typeof item.endBlockId === "string" ? item.endBlockId : undefined;
  if (operation === "replace-blocks" && (!startBlockId || !endBlockId || !blockIds.has(startBlockId) || !blockIds.has(endBlockId))) throw new Error("Omni could not identify the requested document section");
  if (operation === "replace-selection" && !expectedText) throw new Error("Omni could not identify the selected text");
  if (operation === "replace-document" && !expectedText) throw new Error("Omni could not identify the document snapshot");
  return { operation: operation as AiEditOperation, startBlockId, endBlockId, expectedText, markdown };
}

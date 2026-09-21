export type FormatCommand = "paragraph" | "bold" | "italic" | "underline" | "align-left" | "bullet-list";

export type EditorSelection = { from: number; to: number; text: string };
export type EditorBlockSnapshot = { id: string; index: number; text: string; from: number; to: number };
export type EditorEditSnapshot = { documentJson: string; blocks: EditorBlockSnapshot[]; selection: EditorSelection; caret: number };
export type EditorSuggestion = { id: string; text: string; markdown?: string; from: number; to: number; originalText: string; operation?: "replace-selection" | "replace-blocks" | "insert-at-caret" | "replace-document"; kind?: "replace" | "delete" };
export type EditorImage = { fileUrl: string; originalName?: string };

export function resolveBlockRange(blocks: EditorBlockSnapshot[], expectedText: string) {
  if (!expectedText) return null;
  const matches: Array<{ from: number; to: number }> = [];
  for (let start = 0; start < blocks.length; start += 1) {
    let text = "";
    for (let end = start; end < blocks.length; end += 1) {
      text = text ? `${text}\n${blocks[end].text}` : blocks[end].text;
      if (text === expectedText) matches.push({ from: blocks[start].from, to: blocks[end].to });
    }
  }
  return matches.length === 1 ? matches[0] : null;
}

export interface EditorHandle {
  getDocumentJSON(): string;
  getPlainText(): string;
  getSelection(): EditorSelection;
  getEditSnapshot(): EditorEditSnapshot;
  previewSuggestion(change: EditorSuggestion): void;
  applySuggestion(change: EditorSuggestion): boolean;
  dismissSuggestion(id: string): void;
  runFormat(command: FormatCommand): void;
  insertImage(image: EditorImage): boolean;
  addCommentMark(threadId: string, from: number, to: number): void;
  replaceDocument(content: string): boolean;
  replaceMarkdown(markdown: string, from?: number, to?: number): boolean;
  retryPersistence(): void;
  createCheckpoint(description: string, title?: string): Promise<boolean>;
}

export type PresenceUser = { id: string; name: string; avatar?: string | null; color: string; role?: string };

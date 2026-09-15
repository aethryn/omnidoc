export type FormatCommand = "paragraph" | "bold" | "italic" | "underline" | "align-left" | "bullet-list";

export type EditorSelection = { from: number; to: number; text: string };
export type EditorSuggestion = { id: string; text: string; from: number; to: number; originalText: string };

export interface EditorHandle {
  getDocumentJSON(): string;
  getPlainText(): string;
  getSelection(): EditorSelection;
  previewSuggestion(change: EditorSuggestion): void;
  applySuggestion(change: EditorSuggestion): boolean;
  dismissSuggestion(id: string): void;
  runFormat(command: FormatCommand): void;
  addCommentMark(threadId: string, from: number, to: number): void;
  replaceDocument(content: string): boolean;
  createCheckpoint(description: string, title?: string): Promise<boolean>;
}

export type PresenceUser = { id: string; name: string; avatar?: string | null; color: string; role?: string };

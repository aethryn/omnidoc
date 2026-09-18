export type WorkspaceSheet = "ai" | "history" | "comments";
export type WorkspaceModal = "settings" | "share" | "publish" | "more";
export type WorkspaceUIState = { sheet: WorkspaceSheet | null; modal: WorkspaceModal | null };
export type WorkspaceAction = { type: "open-sheet"; sheet: WorkspaceSheet } | { type: "close-sheet"; sheet?: WorkspaceSheet } | { type: "open-modal"; modal: WorkspaceModal } | { type: "close-modal"; modal?: WorkspaceModal };

export const initialWorkspaceUIState: WorkspaceUIState = { sheet:null, modal:null };

export function workspaceReducer(state: WorkspaceUIState, action: WorkspaceAction): WorkspaceUIState {
  if (action.type === "open-sheet") return { sheet:action.sheet, modal:null };
  if (action.type === "close-sheet" && (!action.sheet || state.sheet === action.sheet)) return { ...state, sheet:null };
  if (action.type === "open-modal") return { sheet:null, modal:action.modal };
  if (action.type === "close-modal" && (!action.modal || state.modal === action.modal)) return { ...state, modal:null };
  return state;
}

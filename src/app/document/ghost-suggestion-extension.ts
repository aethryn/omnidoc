import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorSuggestion } from "./editor-types";

export const ghostSuggestionKey = new PluginKey<DecorationSet>("omnidocGhostSuggestion");

function decoration(doc: Parameters<typeof DecorationSet.create>[0], change: EditorSuggestion) {
  const decorations = [];
  if (change.kind === "delete" && change.to > change.from) {
    decorations.push(Decoration.inline(change.from, change.to, { class: "omnidoc-ghost-deletion" }, { key: change.id }));
  } else if (change.to > change.from) {
    decorations.push(Decoration.inline(change.from, change.to, { class: "omnidoc-ghost-deletion" }, { key: `${change.id}-target` }));
  }
  const position = Math.max(0, Math.min(change.to, doc.content.size));
  const widget = Decoration.widget(position, () => {
    const span = document.createElement("span");
    span.className = "omnidoc-ghost-suggestion";
    span.dataset.suggestionId = change.id;
    span.textContent = change.text;
    span.setAttribute("aria-label", "AI suggestion preview");
    return span;
  }, { side: 1, key: change.id });
  decorations.push(widget);
  return DecorationSet.create(doc, decorations);
}

export const GhostSuggestionExtension = Extension.create({
  name: "omnidocGhostSuggestion",
  addProseMirrorPlugins() {
    return [new Plugin({
      key: ghostSuggestionKey,
      state: {
        init: () => DecorationSet.empty,
        apply(transaction, current) {
          const meta = transaction.getMeta(ghostSuggestionKey) as { set?: EditorSuggestion; clear?: string } | undefined;
          if (meta?.set) return decoration(transaction.doc, meta.set);
          if (meta?.clear) return DecorationSet.empty;
          return current.map(transaction.mapping, transaction.doc);
        },
      },
      props: { decorations: (state) => ghostSuggestionKey.getState(state) },
    })];
  },
});

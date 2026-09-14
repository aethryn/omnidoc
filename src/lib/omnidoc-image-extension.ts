import Image from "@tiptap/extension-image";

export const OmnidocImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: 100, parseHTML: (element) => Number(element.getAttribute("data-width")) || 100, renderHTML: (attributes) => ({ "data-width": attributes.width }) },
      align: { default: "center", parseHTML: (element) => element.getAttribute("data-align") || "center", renderHTML: (attributes) => ({ "data-align": attributes.align }) },
      caption: { default: "", parseHTML: (element) => element.getAttribute("data-caption") || "", renderHTML: (attributes) => ({ "data-caption": attributes.caption }) },
    };
  },
});


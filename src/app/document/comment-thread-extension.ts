import { Mark } from "@tiptap/core";

export const CommentThreadExtension = Mark.create({
  name: "commentThread",
  inclusive: false,
  addAttributes() {
    return { threadId: { default: null } };
  },
  parseHTML() {
    return [{ tag: "mark[data-comment-thread]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["mark", { ...HTMLAttributes, "data-comment-thread": HTMLAttributes.threadId, class: "comment-thread-mark" }, 0];
  },
});

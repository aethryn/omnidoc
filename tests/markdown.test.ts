import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeMarkdown, markdownToPlainText, markdownToTiptap } from "../src/lib/markdown-to-tiptap";

test("converts common Markdown into TipTap nodes", () => {
  const document = markdownToTiptap("# Title\n\n**bold** and [safe](https://example.com)\n\n- one\n- two");
  assert.equal(document.content?.[0]?.type, "heading");
  assert.equal(document.content?.[1]?.type, "paragraph");
  assert.equal(document.content?.[2]?.type, "bulletList");
  assert.equal(document.content?.[1]?.content?.[0]?.marks?.[0]?.type, "bold");
  assert.equal(document.content?.[1]?.content?.[2]?.marks?.[0]?.type, "link");
});

test("strips unsafe Markdown constructs", () => {
  const document = markdownToTiptap("<script>alert(1)</script>\n\n![remote](https://evil.example/image.png)\n\n[javascript](javascript:alert(1))");
  assert.equal(JSON.stringify(document).includes("script>"), false);
  assert.equal(JSON.stringify(document).includes("evil.example"), false);
  assert.equal(JSON.stringify(document).includes("javascript:"), false);
});

test("detects Markdown without treating ordinary prose as Markdown", () => {
  assert.equal(looksLikeMarkdown("# A heading\n\n- a list item"), true);
  assert.equal(looksLikeMarkdown("This is an ordinary sentence with no formatting."), false);
});

test("plain text extraction preserves readable replacement text", () => {
  assert.equal(markdownToPlainText("> quoted\n\n1. first\n2. second"), "quoted\nfirst\nsecond");
});

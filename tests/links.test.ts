import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHttpUrl } from "../src/lib/links";
import { normalizePreviewUrl } from "../src/lib/link-preview";

test("normalizes domains and rejects unsafe schemes", () => {
  assert.equal(normalizeHttpUrl("example.com/docs"), "https://example.com/docs");
  assert.equal(normalizeHttpUrl("javascript:alert(1)"), null);
  assert.equal(normalizePreviewUrl("/document/abc", "https://omnidoc.test").href, "https://omnidoc.test/document/abc");
});

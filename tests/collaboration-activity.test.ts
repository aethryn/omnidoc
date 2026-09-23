import test from "node:test";
import assert from "node:assert/strict";
import { collaborationHiddenIdleMs, collaborationIdleMs, collaborationPersistenceKey } from "../src/lib/collaboration-activity";

test("Yjs browser persistence is isolated by canonical epoch", () => {
  assert.equal(collaborationPersistenceKey("doc-1", 2), "omnidoc:doc-1:2");
  assert.notEqual(collaborationPersistenceKey("doc-1", 2), collaborationPersistenceKey("doc-1", 3));
});

test("hidden tabs disconnect before ordinarily idle tabs", () => {
  assert.equal(collaborationIdleMs, 5 * 60_000);
  assert.equal(collaborationHiddenIdleMs, 60_000);
});

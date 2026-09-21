import assert from "node:assert/strict";
import test from "node:test";
import { hasRealtimeCollaboration } from "../src/lib/collaboration-eligibility";

test("private documents stay on local REST editing", () => {
  assert.equal(hasRealtimeCollaboration({ shares: [], collaborators: [] }), false);
});

test("an active share enables direct realtime collaboration", () => {
  assert.equal(hasRealtimeCollaboration({ shares: [{ id: "share" }], collaborators: [] }), true);
});

test("an accepted collaborator enables direct realtime collaboration", () => {
  assert.equal(hasRealtimeCollaboration({ shares: [], collaborators: [{ id: "member" }] }), true);
});

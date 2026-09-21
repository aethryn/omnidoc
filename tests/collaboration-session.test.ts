import assert from "node:assert/strict";
import test from "node:test";
import {
  collaborationHeartbeatMs,
  collaborationPresenceKey,
  collaborationPresenceScript,
  collaborationPresenceTtlMs,
  collaborationStateKey,
} from "../src/lib/collaboration-session";

test("collaboration presence uses isolated, expiring Redis keys", () => {
  assert.equal(collaborationPresenceKey("doc-123"), "omnidoc:collaboration:presence:doc-123");
  assert.equal(collaborationStateKey("doc-123"), "omnidoc:collaboration:state:doc-123");
  assert.notEqual(collaborationPresenceKey("doc-123"), collaborationPresenceKey("doc-456"));
  assert.equal(collaborationHeartbeatMs, 5_000);
  assert.equal(collaborationPresenceTtlMs, 12_000);
});

test("collaboration presence script promotes only after a second participant", () => {
  assert.match(collaborationPresenceScript, /count >= 2 and mode == 'local'/);
  assert.match(collaborationPresenceScript, /mode = 'activating'/);
  assert.match(collaborationPresenceScript, /count < 2 and mode == 'realtime'/);
  assert.match(collaborationPresenceScript, /mode = 'demoting'/);
  assert.match(collaborationPresenceScript, /ZREMRANGEBYSCORE/);
});

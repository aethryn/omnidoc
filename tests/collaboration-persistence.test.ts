import test from "node:test";
import assert from "node:assert/strict";
import { isPersistFailedMessage, isPersistedMessage, persistenceAckTimeoutMs, persistenceRetryDelay } from "../src/lib/collaboration-persistence";

test("persistence retry delay is bounded", () => {
  assert.equal(persistenceAckTimeoutMs, 20_000);
  assert.equal(persistenceRetryDelay(0), 2_000);
  assert.equal(persistenceRetryDelay(4), 30_000);
  assert.equal(persistenceRetryDelay(20), 30_000);
});

test("persistence application messages are safely discriminated", () => {
  assert.equal(isPersistedMessage({ kind:"persisted", markerId:"client:1", sequence:1 }), true);
  assert.equal(isPersistFailedMessage({ kind:"persist-failed", code:"PERSISTENCE_FAILED" }), true);
  assert.equal(isPersistedMessage({ kind:"other" }), false);
  assert.equal(isPersistFailedMessage({ kind:"persisted" }), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { consumeHandshakeAttempt, consumeSocketBudget, websocketLimits } from "../src/lib/websocket-guard";

test("websocket message budgets enforce both count and bytes", () => {
  let state = { windowStartedAt:0, messages:0, bytes:0 };
  for (let index = 0; index < websocketLimits.messagesPerMinute; index += 1) {
    const result = consumeSocketBudget(state, 1_000, 1);
    state = result.budget;
    assert.equal(result.allowed, true);
  }
  assert.equal(consumeSocketBudget(state, 1_000, 1).allowed, false);
  assert.equal(consumeSocketBudget({ windowStartedAt:0, messages:0, bytes:0 }, 1_000, websocketLimits.bytesPerMinute + 1).allowed, false);
  assert.equal(consumeSocketBudget(state, 61_000, 1).allowed, true);
});

test("websocket handshake attempts reset after one minute", () => {
  let current;
  for (let index = 0; index < websocketLimits.handshakesPerUserPerMinute; index += 1) {
    const result = consumeHandshakeAttempt(current, 1_000);
    current = result.attempt;
    assert.equal(result.allowed, true);
  }
  assert.equal(consumeHandshakeAttempt(current, 1_000).allowed, false);
  assert.equal(consumeHandshakeAttempt(current, 61_000).allowed, true);
});

import test from "node:test";
import assert from "node:assert/strict";
import { nextHeartbeatMissCount, resetHeartbeat, shouldTerminateHeartbeat, websocketHeartbeatIntervalMs } from "../src/lib/websocket-liveness";

test("terminates only after two missed heartbeat intervals", () => {
  assert.equal(websocketHeartbeatIntervalMs, 30_000);
  assert.equal(shouldTerminateHeartbeat(0), false);
  assert.equal(nextHeartbeatMissCount(0), 1);
  assert.equal(shouldTerminateHeartbeat(1), false);
  assert.equal(nextHeartbeatMissCount(1), 2);
  assert.equal(shouldTerminateHeartbeat(2), true);
  assert.equal(resetHeartbeat(), 0);
});

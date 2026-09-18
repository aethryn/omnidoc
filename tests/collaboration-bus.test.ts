import test from "node:test";
import assert from "node:assert/strict";
import { CollaborationBus, collaborationChannel } from "../src/lib/collaboration-bus";
import { nextHeartbeatMissCount, resetHeartbeat, shouldTerminateHeartbeat, websocketHeartbeatIntervalMs } from "../src/lib/websocket-liveness";

test("uses isolated channels for each document", () => {
  assert.equal(collaborationChannel("doc-123"), "omnidoc:room:doc-123");
  assert.notEqual(collaborationChannel("doc-123"), collaborationChannel("doc-456"));
});

test("does not open Redis when optional configuration is absent", async () => {
  const bus = new CollaborationBus(undefined);
  assert.equal(bus.status, "disabled");
  const unsubscribe = await bus.subscribe("doc-123", () => undefined);
  assert.equal(bus.subscribedRooms, 0);
  assert.equal(await bus.publish({ version:1, id:"event", sender:"instance", documentId:"doc-123", kind:"yjs-update", data:"AA==" }), false);
  await unsubscribe();
  await bus.close();
});

test("requires Redis when multi-instance mode is enabled", () => {
  assert.throws(() => new CollaborationBus(undefined, true), /REDIS_URL is required/);
  assert.throws(() => new CollaborationBus("https://example.com", true), /valid redis/);
});

test("terminates only after two missed heartbeat intervals", () => {
  assert.equal(websocketHeartbeatIntervalMs, 30_000);
  assert.equal(shouldTerminateHeartbeat(0), false);
  assert.equal(nextHeartbeatMissCount(0), 1);
  assert.equal(shouldTerminateHeartbeat(1), false);
  assert.equal(nextHeartbeatMissCount(1), 2);
  assert.equal(shouldTerminateHeartbeat(2), true);
  assert.equal(resetHeartbeat(), 0);
});

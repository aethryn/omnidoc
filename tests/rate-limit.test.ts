import test from "node:test";
import assert from "node:assert/strict";
import { enforceRedisRateLimit, redisRateLimitScript } from "../src/lib/rate-limit";

test("Redis rate limits use a namespaced expiring counter", async () => {
  let count = 0;
  let receivedKey = "";
  let receivedWindow = "";
  const fakeRedis = {
    async eval(script: string, numberOfKeys: number, key: string, windowMs: string) {
      assert.equal(script, redisRateLimitScript);
      assert.equal(numberOfKeys, 1);
      receivedKey = key;
      receivedWindow = windowMs;
      count += 1;
      return [count, 12_000];
    },
  };

  const result = await enforceRedisRateLimit(fakeRedis, "ai-edit", "user-1", 1, 60_000);
  assert.match(receivedKey, /^omnidoc:ratelimit:ai-edit:user-1:\d+$/);
  assert.equal(receivedWindow, "60000");
  assert.deepEqual(result, { allowed: true, retryAfter: 12 });

  const concurrent = await Promise.all(Array.from({ length: 2 }, () => enforceRedisRateLimit(fakeRedis, "ai-edit", "user-1", 1, 60_000)));
  assert.equal(concurrent[0].allowed, false);
  assert.equal(concurrent[1].allowed, false);
});

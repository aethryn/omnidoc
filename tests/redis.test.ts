import test from "node:test";
import assert from "node:assert/strict";
import { isValidRedisUrl } from "../src/lib/redis";

test("accepts local and TLS Redis URLs", () => {
  assert.equal(isValidRedisUrl("redis://:password@localhost:6379"), true);
  assert.equal(isValidRedisUrl("rediss://default:password@example.upstash.io:6379"), true);
});

test("rejects non-Redis URLs and malformed values", () => {
  assert.equal(isValidRedisUrl("https://example.com"), false);
  assert.equal(isValidRedisUrl("not-a-url"), false);
  assert.equal(isValidRedisUrl("redis://"), false);
});

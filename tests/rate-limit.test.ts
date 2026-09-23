import test from "node:test";
import assert from "node:assert/strict";
import { rateLimitWindow } from "../src/lib/rate-limit";

test("rate limit windows are fixed and report the remaining seconds", () => {
  const result = rateLimitWindow(65_500, 60_000);
  assert.equal(result.windowStart.toISOString(), "1970-01-01T00:01:00.000Z");
  assert.equal(result.retryAfter, 55);
});

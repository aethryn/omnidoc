import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedMutationOrigin } from "../src/lib/request-security";

test("same-origin guard allows safe methods and configured application origins", () => {
  assert.equal(isAllowedMutationOrigin("GET", "https://app.example/api/documents", "https://evil.example"), true);
  assert.equal(isAllowedMutationOrigin("POST", "https://preview.example/api/documents", "https://app.example", ["https://app.example"]), true);
  assert.equal(isAllowedMutationOrigin("DELETE", "https://app.example/api/documents/1", "https://app.example"), true);
});

test("same-origin guard rejects malformed and foreign mutation origins", () => {
  assert.equal(isAllowedMutationOrigin("POST", "https://app.example/api/documents", "https://evil.example"), false);
  assert.equal(isAllowedMutationOrigin("PATCH", "https://app.example/api/documents/1", "not-a-url"), false);
});

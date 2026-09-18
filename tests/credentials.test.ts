import test from "node:test";
import assert from "node:assert/strict";
import { parseEncryptionKey, ENCRYPTION_KEY_ERROR } from "../src/lib/ai/credentials";

const key = Buffer.alloc(32, 7);

test("accepts padded standard Base64 and surrounding whitespace", () => {
  assert.equal(parseEncryptionKey(`  ${key.toString("base64")}  `).length, 32);
});

test("accepts unpadded Base64URL", () => {
  assert.equal(parseEncryptionKey(key.toString("base64url")).length, 32);
});

test("rejects malformed and wrong-length encryption keys", () => {
  for (const value of ["", "placeholder", "not base64!", Buffer.alloc(31).toString("base64")]) {
    assert.throws(() => parseEncryptionKey(value), new RegExp(ENCRYPTION_KEY_ERROR));
  }
});

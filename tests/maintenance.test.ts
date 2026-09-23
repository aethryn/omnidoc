import test from "node:test";
import assert from "node:assert/strict";
import { isImageReferenced, validBearerToken } from "../src/lib/maintenance";

test("maintenance authorization requires an exact bearer secret", () => {
  assert.equal(validBearerToken("Bearer correct", "correct"), true);
  assert.equal(validBearerToken("Bearer incorrect", "correct"), false);
  assert.equal(validBearerToken(null, "correct"), false);
});

test("orphan detection recognizes references in any retained snapshot", () => {
  assert.equal(isImageReferenced("folder/image.png", [null, '{"src":"/api/images/folder/image.png"}']), true);
  assert.equal(isImageReferenced("folder/image.png", ["unrelated"]), false);
});

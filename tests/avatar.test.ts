import test from "node:test";
import assert from "node:assert/strict";
import { avatarFromAuthMetadata, normalizeAvatarSource } from "../src/lib/avatar";

test("normalizes local and Google avatar sources", () => {
  assert.equal(normalizeAvatarSource("vibrent_2.png"), "/vibrent_2.png");
  assert.equal(normalizeAvatarSource("/vibrent_7.png"), "/vibrent_7.png");
  assert.equal(normalizeAvatarSource("https://lh3.googleusercontent.com/a/photo=s96-c"), "https://lh3.googleusercontent.com/a/photo=s96-c");
});

test("prefers the Google avatar metadata fields and rejects unsafe URLs", () => {
  assert.equal(avatarFromAuthMetadata({ avatar_url:"https://lh3.googleusercontent.com/avatar", picture:"https://example.com/fallback" }), "https://lh3.googleusercontent.com/avatar");
  assert.equal(normalizeAvatarSource("javascript:alert(1)"), null);
});

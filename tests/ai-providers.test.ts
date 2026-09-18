import test from "node:test";
import assert from "node:assert/strict";
import { describeModel } from "../src/lib/ai/providers";

test("Gemini Flash and Grok models advertise image input", () => {
  assert.equal(describeModel("gemini", "gemini-2.5-flash").imageInput, true);
  assert.equal(describeModel("xai", "grok-4").imageInput, true);
  assert.equal(describeModel("gemini", "imagen-4").imageInput, false);
});

test("image generation models are not silently treated as editor vision models", () => {
  const model = describeModel("gemini", "gemini-2.5-flash-image");
  assert.equal(model.imageOutput, true);
  assert.equal(model.imageInput, false);
});

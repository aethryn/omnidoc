import test from "node:test";
import assert from "node:assert/strict";
import { parseAiEditResult } from "../src/lib/ai/edit-operation";

test("validates a semantic block edit against supplied block IDs", () => {
  const result = parseAiEditResult({ operation:"replace-blocks", startBlockId:"block-1", endBlockId:"block-2", expectedText:"Napoleon", markdown:"A concise replacement." }, new Set(["block-1", "block-2"]));
  assert.equal(result.operation, "replace-blocks");
});

test("rejects unknown targets and malformed operations", () => {
  assert.throws(() => parseAiEditResult({ operation:"replace-blocks", startBlockId:"missing", endBlockId:"block-2", expectedText:"x", markdown:"y" }, new Set(["block-2"])));
  assert.throws(() => parseAiEditResult({ operation:"unknown", expectedText:"x", markdown:"y" }, new Set()));
});

import test from "node:test";
import assert from "node:assert/strict";
import { resolveBlockRange, type EditorBlockSnapshot } from "../src/app/document/editor-types";

const blocks: EditorBlockSnapshot[] = [
  { id: "a", index: 0, text: "Intro", from: 1, to: 8 },
  { id: "b", index: 1, text: "Napoleon", from: 8, to: 18 },
  { id: "c", index: 2, text: "Conclusion", from: 18, to: 29 },
];

test("resolves a unique block range after positions shift", () => {
  assert.deepEqual(resolveBlockRange(blocks, "Napoleon\nConclusion"), { from: 8, to: 29 });
});

test("rejects an ambiguous block target", () => {
  assert.equal(resolveBlockRange([...blocks, { ...blocks[1], id: "d", index: 3, from: 29, to: 39 }], "Napoleon"), null);
});

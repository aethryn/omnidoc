import test from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { contentToYDoc, yDocToContent } from "../src/lib/document-yjs";

test("saved document content produces a non-empty canonical Yjs snapshot", () => {
  const content = JSON.stringify({ type:"doc", content:[{ type:"paragraph", content:[{ type:"text", text:"Visible before the socket connects" }] }] });
  const source = contentToYDoc(content);
  const update = Y.encodeStateAsUpdate(source);
  const restored = new Y.Doc();
  Y.applyUpdate(restored, update);
  assert.match(yDocToContent(restored), /Visible before the socket connects/);
});

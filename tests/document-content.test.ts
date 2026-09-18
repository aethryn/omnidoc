import assert from "node:assert/strict";
import test from "node:test";
import { extractDocumentImageUrls, selectEmbeddedDocumentImages } from "../src/lib/document-content";

test("extractDocumentImageUrls returns embedded local images in document order", () => {
  const content = JSON.stringify({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Before" }] },
      { type: "blockquote", content: [{ type: "image", attrs: { src: "/api/images/doc/second.webp" } }] },
      { type: "paragraph", content: [{ type: "image", attrs: { src: "/api/images/doc/first.webp" } }, { type: "image", attrs: { src: "/api/images/doc/second.webp" } }] },
    ],
  });

  assert.deepEqual(extractDocumentImageUrls(content), ["/api/images/doc/second.webp", "/api/images/doc/first.webp"]);
});

test("extractDocumentImageUrls ignores remote images and malformed content", () => {
  assert.deepEqual(extractDocumentImageUrls(JSON.stringify({ type: "doc", content: [{ type: "image", attrs: { src: "https://example.com/image.png" } }] })), []);
  assert.deepEqual(extractDocumentImageUrls("not valid json"), []);
});

test("extractDocumentImageUrls handles an empty document", () => {
  assert.deepEqual(extractDocumentImageUrls(JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] })), []);
});

test("selectEmbeddedDocumentImages hides orphaned rows and follows document order", () => {
  const images = [
    { id: "old", fileUrl: "/api/images/doc/old.webp" },
    { id: "second", fileUrl: "/api/images/doc/second.webp" },
    { id: "first", fileUrl: "/api/images/doc/first.webp" },
  ];

  assert.deepEqual(
    selectEmbeddedDocumentImages(images, ["/api/images/doc/first.webp", "/api/images/doc/second.webp"]),
    [images[2], images[1]],
  );
});

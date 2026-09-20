"use client";

import { useRef, useState } from "react";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { ArrowClockwiseIcon, ArrowsOutLineHorizontalIcon, ImageBrokenIcon, TrashIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

import { OmnidocImage } from "@/lib/omnidoc-image-extension";
import { uploadDocumentImage } from "./image-upload";
import { DocumentImageSkeleton } from "@/components/document-loading-skeletons";

type InteractiveImageOptions = { documentId?: string; getDocumentId?: () => Promise<string | null>; editable?: boolean };
type ImageNodeViewProps = NodeViewProps & { documentId?: string; getDocumentId?: () => Promise<string | null>; editable: boolean };

function ImageNodeView({ node, selected, updateAttributes, editor, getPos, documentId, getDocumentId, editable }: ImageNodeViewProps) {
  const figureRef = useRef<HTMLElement | null>(null);
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const isEditable = editable !== false;
  const source = typeof node.attrs.src === "string" ? node.attrs.src : "";
  const loaded = loadedSource === source;
  const failed = failedSource === source;
  const width = Number(node.attrs.width) || 100;
  const align = ["left", "center", "right"].includes(node.attrs.align) ? node.attrs.align : "center";

  function startResize(event: React.PointerEvent) {
    event.preventDefault();
    const parentWidth = figureRef.current?.parentElement?.clientWidth || 1;
    const startX = event.clientX;
    const startWidth = width;
    const move = (moveEvent: PointerEvent) => updateAttributes({ width: Math.max(24, Math.min(100, startWidth + ((moveEvent.clientX - startX) / parentWidth) * 100)) });
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function chooseReplacement() {
    if (replacing || !isEditable) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void replaceImage(file);
    };
    input.click();
  }

  async function replaceImage(file: File) {
    setReplacing(true);
    try {
      const image = await uploadDocumentImage(file, getDocumentId || (() => Promise.resolve(documentId || null)));
      updateAttributes({ src: image.fileUrl, alt: node.attrs.alt || image.originalName || "" });
      setFailedSource(null);
      setLoadedSource(null);
      toast.success("Image replaced");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The image could not be replaced.";
      toast.error(message, { action: { label: "Retry", onClick: () => { void replaceImage(file); } } });
    } finally {
      setReplacing(false);
    }
  }

  function deleteImage() {
    if (!isEditable) return;
    const position = getPos();
    if (typeof position === "number") editor.chain().focus().setNodeSelection(position).deleteSelection().run();
    else editor.chain().focus().deleteSelection().run();
  }

  return <NodeViewWrapper
    as="figure"
    ref={figureRef}
    className={`omnidoc-editor-image omnidoc-editor-image--${align} ${selected ? "is-selected" : ""}`}
    style={{ width: `${width}%` }}
    data-drag-handle
  >
    {failed ? <div className="image-failed"><ImageBrokenIcon /><span>Image unavailable</span></div> : <>
      {!loaded && <DocumentImageSkeleton />}
      <img className={loaded ? undefined : "image-loading-target"} src={source} alt={node.attrs.alt || ""} draggable={false} onLoad={() => setLoadedSource(source)} onError={() => setFailedSource(source)} />
    </>}
    {selected && isEditable && <>
      <div className="image-controls" contentEditable={false}>
        {(["left", "center", "right"] as const).map((value) => <button key={value} className={align === value ? "active" : ""} onClick={() => updateAttributes({ align: value })}>{value}</button>)}
        <button onClick={chooseReplacement} disabled={replacing} aria-label="Replace image">{replacing ? "uploading…" : <><ArrowClockwiseIcon />Replace</>}</button>
        <button onClick={deleteImage} aria-label="Delete image"><TrashIcon />Delete</button>
      </div>
      <button className="image-resize-handle" contentEditable={false} onPointerDown={startResize} aria-label="Resize image"><ArrowsOutLineHorizontalIcon /></button>
      <div className="image-properties" contentEditable={false}>
        <input value={node.attrs.alt || ""} onChange={(event) => updateAttributes({ alt: event.target.value })} placeholder="Describe this image" aria-label="Image description" />
        <input value={node.attrs.caption || ""} onChange={(event) => updateAttributes({ caption: event.target.value })} placeholder="Add a caption" aria-label="Image caption" />
      </div>
    </>}
    {!selected && node.attrs.caption && <figcaption>{node.attrs.caption}</figcaption>}
  </NodeViewWrapper>;
}

export const InteractiveImage = OmnidocImage.extend<InteractiveImageOptions>({
  addOptions() { return { ...this.parent?.(), documentId: undefined, getDocumentId: undefined, editable: true }; },
  addNodeView() {
    const { documentId, getDocumentId, editable } = this.options;
    return ReactNodeViewRenderer((props) => <ImageNodeView {...props} documentId={documentId} getDocumentId={getDocumentId} editable={editable !== false} />);
  },
});

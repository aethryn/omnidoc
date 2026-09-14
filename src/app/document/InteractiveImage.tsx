"use client";

import { useRef, useState } from "react";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { ArrowsOutLineHorizontalIcon, ImageBrokenIcon } from "@phosphor-icons/react";

import { OmnidocImage } from "@/lib/omnidoc-image-extension";

function ImageNodeView({ node, selected, updateAttributes }: NodeViewProps) {
  const figureRef = useRef<HTMLElement | null>(null);
  const [failed, setFailed] = useState(false);
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

  return <NodeViewWrapper
    as="figure"
    ref={figureRef}
    className={`omnidoc-editor-image omnidoc-editor-image--${align} ${selected ? "is-selected" : ""}`}
    style={{ width: `${width}%` }}
    data-drag-handle
  >
    {failed ? <div className="image-failed"><ImageBrokenIcon /><span>Image unavailable</span></div> : <img src={node.attrs.src} alt={node.attrs.alt || ""} draggable={false} onError={() => setFailed(true)} />}
    {selected && <>
      <div className="image-controls" contentEditable={false}>
        {(["left", "center", "right"] as const).map((value) => <button key={value} className={align === value ? "active" : ""} onClick={() => updateAttributes({ align: value })}>{value}</button>)}
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

export const InteractiveImage = OmnidocImage.extend({
  addNodeView() { return ReactNodeViewRenderer(ImageNodeView); },
});


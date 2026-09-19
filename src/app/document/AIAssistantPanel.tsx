"use client";

import { FormEvent, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpIcon, CheckIcon, CopyIcon, MagicWandIcon, PaperclipIcon, SparkleIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { selectEmbeddedDocumentImages } from "@/lib/document-content";
import type { EditorHandle, EditorSelection, EditorSuggestion } from "./editor-types";

type DocumentImage = { id:string; originalName:string; fileUrl:string; mimeType:string; width?:number|null; height?:number|null };

export function AIAssistantPanel({ onClose, editorRef, documentId, embeddedImageUrls = [], onOpenSettings, readOnly, selection: preservedSelection }: { onClose:()=>void; editorRef:RefObject<EditorHandle | null>; documentId?:string; embeddedImageUrls?:string[]; onOpenSettings:()=>void; readOnly?:boolean; selection?: EditorSelection|null }) {
  const [prompt,setPrompt]=useState("");
  const [request,setRequest]=useState<string|null>(null);
  const [suggestion,setSuggestion]=useState<EditorSuggestion|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [needsSettings,setNeedsSettings]=useState(false);
  const [applied,setApplied]=useState(false);
  const [images,setImages]=useState<DocumentImage[]>([]);
  const [selectedImageIds,setSelectedImageIds]=useState<string[]>([]);
  const abortRef=useRef<AbortController|null>(null);

  const visibleImages = useMemo(() => selectEmbeddedDocumentImages(images, embeddedImageUrls), [embeddedImageUrls, images]);

  useEffect(() => {
    if (!documentId) { setImages([]); setSelectedImageIds([]); return; }
    const controller = new AbortController();
    setImages([]);
    setSelectedImageIds([]);
    fetch(`/api/documents/${documentId}/images`, { cache:"no-store", signal:controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load document images")))
      .then((data) => { if (!controller.signal.aborted) setImages(Array.isArray(data.images) ? data.images : []); })
      .catch((caught) => { if (!controller.signal.aborted && (caught as Error).name !== "AbortError") setImages([]); });
    return () => controller.abort();
  }, [documentId]);

  useEffect(() => {
    const visibleIds = new Set(visibleImages.map((image) => image.id));
    setSelectedImageIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [visibleImages]);

  async function submit(event?:FormEvent) {
    event?.preventDefault();
    const instruction=prompt.trim();
    if(!instruction||loading||readOnly)return;
    const editor=editorRef.current;
    if(!editor)return;
    const selection=preservedSelection||editor.getSelection();
    const id=crypto.randomUUID();
    setRequest(instruction);setPrompt("");setError(null);setNeedsSettings(false);setApplied(false);setLoading(true);
    abortRef.current?.abort();const controller=new AbortController();abortRef.current=controller;
    const base:EditorSuggestion={id,text:"",from:selection.from,to:selection.to,originalText:selection.text};
    let complete="";
    try{
      const response=await fetch("/api/ai/edit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({documentId,instruction,selection:selection.text,context:editor.getPlainText(),imageIds:selectedImageIds}),signal:controller.signal});
      if(!response.ok){const data=await response.json().catch(()=>({}));if(response.status===409)setNeedsSettings(true);throw new Error(data.error||"Omni could not complete that edit.");}
      if(!response.body)throw new Error("The AI provider returned no response.");
      const reader=response.body.getReader();const decoder=new TextDecoder();let buffer="";
      while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const blocks=buffer.split("\n\n");buffer=blocks.pop()??"";for(const block of blocks){const eventType=block.match(/^event:\s*(.+)$/m)?.[1];const raw=block.match(/^data:\s*(.+)$/m)?.[1];if(!raw)continue;const data=JSON.parse(raw);if(eventType==="delta"&&data.text){complete+=data.text;const next={...base,text:complete};setSuggestion(next);editor.previewSuggestion(next);}if(eventType==="error")throw new Error(data.error||"Provider request failed");}}
    }catch(caught){if((caught as Error).name!=="AbortError")setError(caught instanceof Error?caught.message:"AI request failed");}
    finally{setLoading(false);abortRef.current=null;}
  }

  function accept(){if(!suggestion)return;const didApply=editorRef.current?.applySuggestion(suggestion);if(!didApply){setError("The target text changed while Omni was writing. Copy the suggestion or try again.");return;}setApplied(true);}
  function dismiss(){if(suggestion)editorRef.current?.dismissSuggestion(suggestion.id);setSuggestion(null);setApplied(false);}
  function removeSelected(){const selection=preservedSelection||editorRef.current?.getSelection();if(!selection?.text||readOnly)return;const next:EditorSuggestion={id:crypto.randomUUID(),text:"",from:selection.from,to:selection.to,originalText:selection.text,kind:"delete"};setRequest("Remove selected text");setError(null);setApplied(false);setSuggestion(next);editorRef.current?.previewSuggestion(next);}

  return <motion.aside initial={{x:28,opacity:0}} animate={{x:0,opacity:1}} exit={{x:28,opacity:0}} transition={{duration:.22}} className="ai-panel" aria-label="Omni AI assistant">
    <div className="ai-panel__header"><div className="flex items-center gap-2.5"><span className="ai-panel__mark"><SparkleIcon size={15} weight="fill"/></span><div><h2>Ask Omni</h2><p>Preview first. Accept when ready.</p></div></div><Button variant="ghost" size="icon" onClick={()=>{abortRef.current?.abort();dismiss();onClose();}} aria-label="Close assistant" className="h-8 w-8 rounded-full"><XIcon/></Button></div>
    <div className="ai-panel__conversation">
      <div className="ai-welcome"><MagicWandIcon size={22} weight="duotone"/><h3>Shape the page, not just the prose.</h3><p>Select a passage for a rewrite, or leave the caret where you want new text. Nothing changes until you accept.</p></div>
      {!request&&<div className="ai-quick-actions"><button disabled={readOnly||!(preservedSelection||editorRef.current?.getSelection())?.text} onClick={()=>setPrompt("Rewrite the selected text for clarity and flow")}>Rewrite selected text</button><button disabled={readOnly||!(preservedSelection||editorRef.current?.getSelection())?.text} onClick={removeSelected}>Remove selected text</button>{["Make this more concise","Find the missing argument","Write a stronger closing"].map((label)=><button key={label} onClick={()=>setPrompt(label)}>{label}</button>)}</div>}
      {request&&<div className="ai-user-message">{request}</div>}
      {documentId&&<div className="rounded-xl border border-[#e2dcd3] bg-[#faf8f3] p-3"><div className="mb-2 flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#5c5349]"><PaperclipIcon/> Attach document images</span><span className="text-[10px] text-[#948b80]">{selectedImageIds.length}/4</span></div>{visibleImages.length===0?<p className="text-[11px] leading-5 text-[#8b8379]">No images currently in this document.</p>:<div className="grid grid-cols-2 gap-2">{visibleImages.map((image)=>{const selected=selectedImageIds.includes(image.id);return <button type="button" key={image.id} onClick={()=>setSelectedImageIds((current)=>selected?current.filter((id)=>id!==image.id):current.length<4?[...current,image.id]:current)} className={`flex min-w-0 items-center gap-2 rounded-lg border p-1.5 text-left text-[10px] ${selected?"border-[#8260bd] bg-[#f1ebfb]":"border-[#e4ded4] bg-white"}`} aria-pressed={selected}><img src={image.fileUrl} alt="" className="h-9 w-9 shrink-0 rounded object-cover"/><span className="min-w-0 truncate">{image.originalName}</span></button>;})}</div>}</div>}
      {(suggestion||loading||error)&&<div className="ai-response"><div className="ai-response__label"><SparkleIcon weight="fill"/> {loading?"Writing suggestion…":error&&!suggestion?"Omni needs attention":"Suggested change"}</div>{suggestion?.kind==="delete"?<p>The selected text will be removed after you accept.</p>:suggestion?.text&&<p>{suggestion.text}</p>}{error&&<p className="!font-[var(--font-inter)] !text-xs !leading-5 !text-[#a63f36]">{error}</p>}<div className="ai-response__actions">{needsSettings&&<Button variant="outline" size="sm" onClick={onOpenSettings}>Open AI settings</Button>}{applied?<span className="ai-applied"><CheckIcon weight="bold"/>Added to document</span>:suggestion&&<><Button variant="ghost" size="sm" disabled={!suggestion.text} onClick={()=>navigator.clipboard?.writeText(suggestion.text)}><CopyIcon/>Copy</Button><Button variant="outline" size="sm" onClick={dismiss}>Dismiss</Button><Button size="sm" onClick={accept} disabled={loading} className="bg-[#352d59] text-white hover:bg-[#282044]">Accept change</Button></>}</div></div>}
    </div>
    <form className="ai-composer" onSubmit={submit}><Textarea value={prompt} disabled={readOnly||loading} onChange={(event)=>setPrompt(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();submit();}}} placeholder={readOnly?"Viewers can’t edit this document":"Ask Omni to change this document…"}/><div className="ai-composer__footer"><span>{loading?"Streaming from your provider…":"Enter to submit"}</span><Button type="submit" size="icon" disabled={loading||readOnly||!prompt.trim()} className="h-8 w-8 rounded-full bg-[#352d59] text-white"><ArrowUpIcon weight="bold"/></Button></div></form>
  </motion.aside>;
}

"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftIcon, CaretDownIcon, CheckCircleIcon, ClockCounterClockwiseIcon, CloudCheckIcon, DotsThreeIcon, GearSixIcon, ListBulletsIcon, NotePencilIcon, ShareNetworkIcon, SparkleIcon, TextAlignLeftIcon, TextBIcon, TextItalicIcon, TextUnderlineIcon, TrashIcon } from "@phosphor-icons/react";
import type { CollaborationStatus } from "../components/CollaborativeEditor";
import type { EditorHandle, FormatCommand, PresenceUser } from "./editor-types";
import { DocumentsFolderIcon, OmnidocLogo } from "@/components/omnidoc-logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import "./print-styles.css";
import "./workspace-styles.css";

const AIAssistantPanel=dynamic(()=>import("./AIAssistantPanel").then((module)=>module.AIAssistantPanel),{ssr:false});
const SettingsModal=dynamic(()=>import("@/components/setting-modal").then((module)=>module.SettingsModal),{ssr:false});
const Editor=lazy(()=>import("./editor"));
const CollaborativeEditor=lazy(()=>import("../components/CollaborativeEditor"));
const EMPTY_DOCUMENT=JSON.stringify({type:"doc",content:[{type:"paragraph"}]});
const LOCAL_DRAFT="omnidoc:local-draft";
const colors=["#7c4dcc","#a65e67","#526b8c","#54836d","#b07839"];

export type InitialDocument={id:string;title:string;content:string;yjsState:string|null;role:string;updatedAt:string;collaborators:Array<{id:string;name:string;avatar:string;role:string}>};
type ShareLink={id:string;role:"viewer"|"editor";expiresAt:string|null;maxUses:number|null;useCount:number;createdAt:string;isActive:boolean};

function initials(name:string){return name.split(/\s+/).map((part)=>part[0]).join("").slice(0,2).toUpperCase();}

export default function DocumentEditorClient({initialDocument,currentUser}:{initialDocument?:InitialDocument;currentUser:PresenceUser}){
  const router=useRouter();
  const editorRef=useRef<EditorHandle|null>(null);
  const creationRef=useRef<Promise<string|null>|null>(null);
  const [activeId,setActiveId]=useState(initialDocument?.id);
  const [content,setContent]=useState(initialDocument?.content||EMPTY_DOCUMENT);
  const [documentName,setDocumentName]=useState(initialDocument?.title||"Untitled document");
  const [initialYjsState,setInitialYjsState]=useState(initialDocument?.yjsState||null);
  const [role]=useState(initialDocument?.role||"owner");
  const [isOnline,setIsOnline]=useState(true);
  const [isSaving,setIsSaving]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [lastSaved,setLastSaved]=useState(initialDocument?.updatedAt||null);
  const [collaborationStatus,setCollaborationStatus]=useState<CollaborationStatus>(activeId?"connecting":"local");
  const [livePresence,setLivePresence]=useState<PresenceUser[]>([currentUser]);
  const [aiOpen,setAiOpen]=useState(false);
  const [presenceOpen,setPresenceOpen]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [shareOpen,setShareOpen]=useState(false);
  const [shareRole,setShareRole]=useState<"viewer"|"editor">("editor");
  const [expiry,setExpiry]=useState("7");
  const [maxUses,setMaxUses]=useState("");
  const [shareUrl,setShareUrl]=useState("");
  const [shareLinks,setShareLinks]=useState<ShareLink[]>([]);
  const [shareBusy,setShareBusy]=useState(false);
  const readOnly=role==="viewer";

  const presenceUser=useMemo(()=>({...currentUser,color:currentUser.color||colors[0],role}),[currentUser,role]);
  const knownPeople=useMemo(()=>{const byId=new Map<string,PresenceUser>();(initialDocument?.collaborators||[]).forEach((person,index)=>byId.set(person.id,{...person,color:colors[index%colors.length]}));livePresence.forEach((person)=>byId.set(person.id,person));return Array.from(byId.values());},[initialDocument?.collaborators,livePresence]);

  useEffect(()=>{const online=()=>setIsOnline(true),offline=()=>setIsOnline(false);setIsOnline(navigator.onLine);window.addEventListener("online",online);window.addEventListener("offline",offline);if(!initialDocument){const recovered=localStorage.getItem(LOCAL_DRAFT);if(recovered){setContent(recovered);}}return()=>{window.removeEventListener("online",online);window.removeEventListener("offline",offline);};},[initialDocument]);

  const ensureSaved=useCallback((contentOverride?:string)=>{
    if(activeId)return Promise.resolve(activeId);
    if(creationRef.current)return creationRef.current;
    const json=contentOverride||editorRef.current?.getDocumentJSON()||content;
    setIsSaving(true);
    creationRef.current=fetch("/api/documents",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:documentName,content:json})}).then(async(response)=>{if(!response.ok)throw new Error("Could not create document");const created=await response.json();setActiveId(created.id);setInitialYjsState(created.yjsState);setLastSaved(new Date().toISOString());setDirty(false);localStorage.removeItem(LOCAL_DRAFT);router.replace(`/document/${created.id}`);return created.id as string;}).catch(()=>{localStorage.setItem(LOCAL_DRAFT,json);return null;}).finally(()=>{setIsSaving(false);creationRef.current=null;});
    return creationRef.current;
  },[activeId,content,documentName,router]);

  function contentChanged(json:string){setContent(json);setDirty(true);localStorage.setItem(LOCAL_DRAFT,json);void ensureSaved(json);}

  async function save(){
    const id=await ensureSaved();if(!id||!isOnline)return;setIsSaving(true);const json=editorRef.current?.getDocumentJSON()||content;
    const response=await fetch(`/api/documents/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:documentName,content:json})});
    if(response.ok){setDirty(false);setLastSaved(new Date().toISOString());localStorage.removeItem(`document-${id}-backup`);}else localStorage.setItem(`document-${id}-backup`,json);setIsSaving(false);
  }

  useEffect(()=>{if(!dirty||!activeId)return;const timer=window.setTimeout(()=>void save(),3000);return()=>window.clearTimeout(timer);},[dirty,activeId]);

  async function rename(){if(readOnly)return;const next=documentName.trim()||"Untitled document";setDocumentName(next);const id=await ensureSaved();if(id)await fetch(`/api/documents/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:next})});}
  function format(command:FormatCommand){editorRef.current?.runFormat(command);}
  function exportPdf(){window.print();}
  function exportHtml(){const html=document.querySelector(".tiptap")?.innerHTML||"";const safeName=documentName.replace(/[^a-z0-9-_]+/gi,"-")||"document";const url=URL.createObjectURL(new Blob([`<!doctype html><html><head><meta charset="utf-8"><title>${documentName}</title></head><body>${html}</body></html>`],{type:"text/html"}));const link=document.createElement("a");link.href=url;link.download=`${safeName}.html`;link.click();URL.revokeObjectURL(url);}

  async function openShare(){const id=await ensureSaved();if(!id)return;setShareOpen(true);setShareUrl("");const response=await fetch(`/api/documents/${id}/share`,{cache:"no-store"});if(response.ok)setShareLinks(await response.json());}
  async function createShare(){if(!activeId)return;setShareBusy(true);const response=await fetch(`/api/documents/${activeId}/share`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({role:shareRole,expiresInDays:Number(expiry),maxUses:maxUses?Number(maxUses):null})});if(response.ok){const data=await response.json();setShareUrl(data.url);const list=await fetch(`/api/documents/${activeId}/share`,{cache:"no-store"});if(list.ok)setShareLinks(await list.json());}setShareBusy(false);}
  async function revokeShare(shareId:string){if(!activeId)return;await fetch(`/api/documents/${activeId}/share`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({shareId})});setShareLinks((items)=>items.map((item)=>item.id===shareId?{...item,isActive:false}:item));}

  const savedLabel=isSaving?"Saving…":!isOnline?"Saved locally":collaborationStatus==="synced"?"All changes saved":dirty?"Changes pending":lastSaved?"Saved":"Local draft";

  return <div className="omnidoc-workspace">
    <header className="workspace-topbar"><div className="workspace-wordmark"><button className="workspace-logo" onClick={()=>router.push("/dashboard")} aria-label="Back to documents"><OmnidocLogo priority className="workspace-logo-image"/></button><div className="workspace-breadcrumb"><span>Omnidoc</span><span className="workspace-slash">/</span><span className="document-name">{documentName}</span></div></div><div className="topbar-actions">
      <div className="save-state">{isOnline?<CloudCheckIcon/>:<ClockCounterClockwiseIcon/>}<span className={`save-state__dot ${dirty?"pending":""}`}/>{savedLabel}</div>
      <Popover open={presenceOpen} onOpenChange={(open)=>{setPresenceOpen(open);if(open)setAiOpen(false);}}><PopoverTrigger asChild><button className="collaborator-tab"><span className="avatar-stack">{livePresence.slice(0,3).map((person,index)=><i key={person.id} className="mini-avatar" style={{background:person.color||colors[index%colors.length]}}>{initials(person.name)}</i>)}</span><span>{livePresence.length} here</span></button></PopoverTrigger><PopoverContent align="end" sideOffset={8} className="collaborator-popover"><h3>People in this document</h3>{knownPeople.map((person)=><div className="person-row" key={person.id}><i className="mini-avatar" style={{background:person.color}}>{initials(person.name)}</i><div><p>{person.id===currentUser.id?"You":person.name}</p><span>{livePresence.some((live)=>live.id===person.id)?"Active now":person.role||"Collaborator"}</span></div>{livePresence.some((live)=>live.id===person.id)&&<i className="online-dot"/>}</div>)}</PopoverContent></Popover>
      <button className="icon-action" onClick={openShare} disabled={readOnly} aria-label="Share document"><ShareNetworkIcon/></button><button className="ai-toggle" onClick={()=>{setPresenceOpen(false);setAiOpen((open)=>!open);}}><SparkleIcon weight="fill"/><span>Ask Omni</span></button>
      <DropdownMenu><DropdownMenuTrigger asChild><button className="icon-action" aria-label="Document actions"><DotsThreeIcon weight="bold"/></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={()=>void save()}>Save now</DropdownMenuItem><DropdownMenuItem onClick={()=>document.getElementById("document-title")?.focus()}>Rename</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem onClick={exportPdf}>Export as PDF</DropdownMenuItem><DropdownMenuItem onClick={exportHtml}>Export as HTML</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    </div></header>
    <div className="workspace-body"><nav className="workspace-rail"><div className="rail-stack"><button className="rail-button" onClick={()=>router.push("/dashboard")} aria-label="Back"><ArrowLeftIcon/></button><button className="rail-button active" aria-label="Documents folder"><DocumentsFolderIcon className="documents-folder-icon"/></button><button className="rail-button" onClick={()=>router.push("/document")} aria-label="New document"><NotePencilIcon/></button></div><div className="rail-stack"><button className="rail-button" onClick={()=>setSettingsOpen(true)} aria-label="Settings"><GearSixIcon/></button><span className="profile-orb">{initials(currentUser.name)}</span></div></nav>
      <main className="document-stage printable-content"><motion.article className="paper" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{duration:.3}}><div className="paper-header"><div className="paper-kicker"><CheckCircleIcon weight="fill"/> Working draft</div><input id="document-title" value={documentName} readOnly={readOnly} onChange={(event)=>setDocumentName(event.target.value)} onBlur={()=>void rename()} className="paper-title paper-title-input" aria-label="Document title"/><p className="paper-subtitle">A living document for ideas, decisions, and the details that make them useful.</p><div className="paper-meta"><span>Last edited today</span><span className="paper-meta__line"/><span>{readOnly?"View only":"Shared workspace"}</span></div></div>
        <div className="editor-rule"/><div className="editor-toolbar"><div className="toolbar-group"><button className="toolbar-style" disabled={readOnly} onClick={()=>format("paragraph")}>Body <CaretDownIcon/></button><span className="toolbar-divider"/><button className="toolbar-button" disabled={readOnly} onClick={()=>format("bold")}><TextBIcon weight="bold"/></button><button className="toolbar-button" disabled={readOnly} onClick={()=>format("italic")}><TextItalicIcon/></button><button className="toolbar-button" disabled={readOnly} onClick={()=>format("underline")}><TextUnderlineIcon/></button><span className="toolbar-divider"/><button className="toolbar-button" disabled={readOnly} onClick={()=>format("align-left")}><TextAlignLeftIcon/></button><button className="toolbar-button" disabled={readOnly} onClick={()=>format("bullet-list")}><ListBulletsIcon/></button></div><span className="text-[10px] text-[#aaa4ac]">{readOnly?"Viewer access":"Select text, then ask Omni"}</span></div>
        <div className="paper-editor"><Suspense fallback={<div className="min-h-[520px] text-xs text-[#aaa49b]">Preparing the page…</div>}>{activeId?<CollaborativeEditor ref={editorRef} documentId={activeId} initialState={initialYjsState} readOnly={readOnly} user={presenceUser} onStatusChange={setCollaborationStatus} onPresenceChange={setLivePresence}/>:<Editor ref={editorRef} initialContent={content} onContentChange={contentChanged} readOnly={readOnly}/>}</Suspense></div>
      </motion.article></main>
      <AnimatePresence>{aiOpen&&<AIAssistantPanel editorRef={editorRef} documentId={activeId} readOnly={readOnly} onOpenSettings={()=>setSettingsOpen(true)} onClose={()=>setAiOpen(false)}/>}</AnimatePresence>
    </div>
    <Dialog open={shareOpen} onOpenChange={setShareOpen}><DialogContent className="share-dialog border-[#d8d1c5] bg-[#fffdf8] text-[#29251f] shadow-2xl sm:max-w-lg"><DialogHeader><DialogTitle>Invite people</DialogTitle><DialogDescription>Links require Google sign-in. Create a limited editor or viewer invitation.</DialogDescription></DialogHeader><div className="share-options"><select value={shareRole} onChange={(event)=>setShareRole(event.target.value as "viewer"|"editor")}><option value="editor">Can edit</option><option value="viewer">Can view</option></select><select value={expiry} onChange={(event)=>setExpiry(event.target.value)}><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option></select><input value={maxUses} onChange={(event)=>setMaxUses(event.target.value)} inputMode="numeric" placeholder="Uses · unlimited"/></div><Button onClick={createShare} disabled={shareBusy} className="bg-[#7140cd] text-white hover:bg-[#6032b8]">{shareBusy?"Creating…":"Create invite link"}</Button>{shareUrl&&<div className="flex gap-2"><input readOnly value={shareUrl} className="min-w-0 flex-1 rounded-lg border bg-[#f7f4ee] px-3 text-xs"/><Button onClick={()=>navigator.clipboard.writeText(shareUrl)}>Copy</Button></div>}<div className="mt-2 border-t border-[#ded8cd] pt-3"><p className="mb-2 text-xs font-semibold">Previous links</p>{shareLinks.length===0?<p className="text-xs text-[#8b847a]">No invitation links yet.</p>:shareLinks.map((link)=><div key={link.id} className="flex items-center justify-between border-b border-[#e9e4da] py-2 text-xs"><span>{link.role} · {link.useCount}{link.maxUses?`/${link.maxUses}`:" uses"} · {link.isActive?"active":"revoked"}</span>{link.isActive&&<button onClick={()=>revokeShare(link.id)} className="rounded p-2 text-[#9a4139]" aria-label="Revoke link"><TrashIcon/></button>}</div>)}</div></DialogContent></Dialog>
    <SettingsModal isOpen={settingsOpen} onClose={()=>setSettingsOpen(false)} user={{name:currentUser.name,avatar:currentUser.avatar||undefined}}/>
  </div>;
}

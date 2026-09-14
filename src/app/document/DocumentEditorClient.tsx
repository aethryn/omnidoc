"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftIcon, ArrowSquareOutIcon, CaretDownIcon, CheckCircleIcon, ClockCounterClockwiseIcon, CloudCheckIcon, CopyIcon, DotsThreeIcon, FileDocIcon, FileHtmlIcon, FileMdIcon, FilePdfIcon, GearSixIcon, GlobeHemisphereWestIcon, ListBulletsIcon, NotePencilIcon, ShareNetworkIcon, SparkleIcon, TextAlignLeftIcon, TextBIcon, TextItalicIcon, TextUnderlineIcon, TrashIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
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

type DocumentStatus="WORKING_DRAFT"|"COMPLETE";
type PublicationSummary={id:string;slug:string;isActive:boolean;publishedAt:string;updatedAt:string;revisionHash?:string;url?:string;hasUnpublishedChanges?:boolean};
export type InitialDocument={id:string;title:string;content:string;yjsState:string|null;role:string;status:DocumentStatus;updatedAt:string;lastEditedAt:string;publication:PublicationSummary|null;collaborators:Array<{id:string;name:string;avatar:string;role:string}>};
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
  const [status,setStatus]=useState<DocumentStatus>(initialDocument?.status||"WORKING_DRAFT");
  const [publication,setPublication]=useState<PublicationSummary|null>(initialDocument?.publication||null);
  const [publishOpen,setPublishOpen]=useState(false);
  const [publishBusy,setPublishBusy]=useState(false);
  const [exporting,setExporting]=useState<string|null>(null);
  const [hasUnpublishedChanges,setHasUnpublishedChanges]=useState(Boolean(initialDocument?.publication?.isActive&&initialDocument.lastEditedAt>initialDocument.publication.updatedAt));
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

  const contentChanged=useCallback((json:string)=>{setContent(json);setDirty(true);if(publication?.isActive)setHasUnpublishedChanges(true);localStorage.setItem(LOCAL_DRAFT,json);void ensureSaved(json);},[ensureSaved,publication?.isActive]);

  async function save(documentId?:string){
    const id=documentId||await ensureSaved();if(!id||!isOnline)return false;setIsSaving(true);const json=editorRef.current?.getDocumentJSON()||content;
    const response=await fetch(`/api/documents/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:documentName,content:json})});
    if(response.ok){setDirty(false);setLastSaved(new Date().toISOString());localStorage.removeItem(`document-${id}-backup`);}else localStorage.setItem(`document-${id}-backup`,json);setIsSaving(false);return response.ok;
  }

  useEffect(()=>{if(!dirty||!activeId)return;const timer=window.setTimeout(()=>void save(),3000);return()=>window.clearTimeout(timer);},[dirty,activeId]);

  async function rename(){if(readOnly)return;const next=documentName.trim()||"Untitled document";setDocumentName(next);if(publication?.isActive)setHasUnpublishedChanges(true);const id=await ensureSaved();if(id)await fetch(`/api/documents/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:next})});}
  function format(command:FormatCommand){editorRef.current?.runFormat(command);}
  async function changeStatus(next:DocumentStatus){if(role!=="owner"||next===status)return;const id=await ensureSaved();if(!id)return;const previous=status;setStatus(next);const response=await fetch(`/api/documents/${id}/status`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:next})});if(!response.ok){setStatus(previous);toast.error("Document status could not be changed");}else toast.success(next==="COMPLETE"?"Document marked complete":"Returned to working draft");}
  async function publish(){if(role!=="owner")return;const id=await ensureSaved();if(!id)return;setPublishBusy(true);const json=editorRef.current?.getDocumentJSON()||content;const response=await fetch(`/api/documents/${id}/publication`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:documentName,content:json})});const data=await response.json().catch(()=>({}));if(response.ok){setPublication({...data,isActive:true,updatedAt:new Date().toISOString()});setHasUnpublishedChanges(false);setDirty(false);toast.success(publication?"Published page updated":"Document published");}else toast.error(data.error||"Document could not be published");setPublishBusy(false);}
  async function unpublish(){if(!activeId)return;setPublishBusy(true);const response=await fetch(`/api/documents/${activeId}/publication`,{method:"DELETE"});if(response.ok){setPublication((current)=>current?{...current,isActive:false}:current);toast.success("Public page removed");}else toast.error("Document could not be unpublished");setPublishBusy(false);}
  async function copyPublication(){const path=publication?.url||(publication?`${window.location.origin}/p/${publication.id}/${publication.slug}`:"");if(!path)return;await navigator.clipboard.writeText(path.startsWith("http")?path:`${window.location.origin}${path}`);toast.success("Public link copied");}
  async function exportDocument(format:"md"|"pdf"|"docx"|"html"){const id=await ensureSaved();const saved=id?await save(id):false;if(!saved||!id){toast.error("Save the document before exporting");return;}setExporting(format);const response=await fetch(`/api/documents/${id}/export?format=${format}`);if(!response.ok){const data=await response.json().catch(()=>({}));toast.error(data.error||"Export could not be created");setExporting(null);return;}const blob=await response.blob();const disposition=response.headers.get("content-disposition")||"";const match=disposition.match(/filename="([^"]+)"/);const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=match?.[1]||`document.${format}`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);setExporting(null);toast.success(`${format.toUpperCase()} export ready`);}

  async function openShare(){const id=await ensureSaved();if(!id)return;setShareOpen(true);setShareUrl("");const response=await fetch(`/api/documents/${id}/share`,{cache:"no-store"});if(response.ok)setShareLinks(await response.json());}
  async function createShare(){if(!activeId)return;setShareBusy(true);const response=await fetch(`/api/documents/${activeId}/share`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({role:shareRole,expiresInDays:Number(expiry),maxUses:maxUses?Number(maxUses):null})});if(response.ok){const data=await response.json();setShareUrl(data.url);const list=await fetch(`/api/documents/${activeId}/share`,{cache:"no-store"});if(list.ok)setShareLinks(await list.json());}setShareBusy(false);}
  async function revokeShare(shareId:string){if(!activeId)return;await fetch(`/api/documents/${activeId}/share`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({shareId})});setShareLinks((items)=>items.map((item)=>item.id===shareId?{...item,isActive:false}:item));}

  const savedLabel=isSaving?"Saving…":!isOnline?"Saved locally":collaborationStatus==="synced"?"All changes saved":dirty?"Changes pending":lastSaved?"Saved":"Local draft";
  const publicPath=publication?`/p/${publication.id}/${publication.slug}`:"";

  return <div className="omnidoc-workspace">
    <header className="workspace-topbar"><div className="workspace-wordmark"><button className="workspace-logo" onClick={()=>router.push("/dashboard")} aria-label="Back to documents"><OmnidocLogo priority className="workspace-logo-image"/></button><div className="workspace-breadcrumb"><span>Omnidoc</span><span className="workspace-slash">/</span><span className="document-name">{documentName}</span></div></div><div className="topbar-actions">
      <div className="save-state">{isOnline?<CloudCheckIcon/>:<ClockCounterClockwiseIcon/>}<span className={`save-state__dot ${dirty?"pending":""}`}/>{savedLabel}</div>
      <Popover open={presenceOpen} onOpenChange={(open)=>{setPresenceOpen(open);if(open)setAiOpen(false);}}><PopoverTrigger asChild><button className="collaborator-tab"><span className="avatar-stack">{livePresence.slice(0,3).map((person,index)=><i key={person.id} className="mini-avatar" style={{background:person.color||colors[index%colors.length]}}>{initials(person.name)}</i>)}</span><span>{livePresence.length} here</span></button></PopoverTrigger><PopoverContent align="end" sideOffset={8} className="collaborator-popover"><h3>People in this document</h3>{knownPeople.map((person)=><div className="person-row" key={person.id}><i className="mini-avatar" style={{background:person.color}}>{initials(person.name)}</i><div><p>{person.id===currentUser.id?"You":person.name}</p><span>{livePresence.some((live)=>live.id===person.id)?"Active now":person.role||"Collaborator"}</span></div>{livePresence.some((live)=>live.id===person.id)&&<i className="online-dot"/>}</div>)}</PopoverContent></Popover>
      <button className="icon-action" onClick={openShare} disabled={readOnly} aria-label="Share document"><ShareNetworkIcon/></button>{role==="owner"&&status==="COMPLETE"&&<button className="icon-action mobile-publish-action" onClick={()=>setPublishOpen(true)} aria-label="Publish document"><GlobeHemisphereWestIcon/></button>}<button className="ai-toggle" onClick={()=>{setPresenceOpen(false);setAiOpen((open)=>!open);}}><SparkleIcon weight="fill"/><span>Ask Omni</span></button>
      <DropdownMenu><DropdownMenuTrigger asChild><button className="icon-action" aria-label="Document actions"><DotsThreeIcon weight="bold"/></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={()=>void save()}>Save now</DropdownMenuItem><DropdownMenuItem onClick={()=>document.getElementById("document-title")?.focus()}>Rename</DropdownMenuItem>{role==="owner"&&status==="COMPLETE"&&<DropdownMenuItem onClick={()=>setPublishOpen(true)}><GlobeHemisphereWestIcon/>{publication?.isActive?"Manage published page":"Publish document"}</DropdownMenuItem>}<DropdownMenuSeparator/><DropdownMenuItem disabled={Boolean(exporting)} onClick={()=>void exportDocument("pdf")}><FilePdfIcon/>Export as PDF</DropdownMenuItem><DropdownMenuItem disabled={Boolean(exporting)} onClick={()=>void exportDocument("docx")}><FileDocIcon/>Export as DOCX</DropdownMenuItem><DropdownMenuItem disabled={Boolean(exporting)} onClick={()=>void exportDocument("md")}><FileMdIcon/>Export as Markdown</DropdownMenuItem><DropdownMenuItem disabled={Boolean(exporting)} onClick={()=>void exportDocument("html")}><FileHtmlIcon/>Export as HTML</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    </div></header>
    <div className="workspace-body"><nav className="workspace-rail"><div className="rail-stack"><button className="rail-button" onClick={()=>router.push("/dashboard")} aria-label="Back"><ArrowLeftIcon/></button><button className="rail-button active" aria-label="Documents folder"><DocumentsFolderIcon className="documents-folder-icon"/></button><button className="rail-button" onClick={()=>router.push("/document")} aria-label="New document"><NotePencilIcon/></button>{role==="owner"&&status==="COMPLETE"&&<button className={`rail-button publish-rail ${publication?.isActive?"is-live":""}`} onClick={()=>setPublishOpen(true)} aria-label={publication?.isActive?"Manage published page":"Publish document"}><GlobeHemisphereWestIcon/></button>}</div><div className="rail-stack"><button className="rail-button" onClick={()=>setSettingsOpen(true)} aria-label="Settings"><GearSixIcon/></button><span className="profile-orb">{initials(currentUser.name)}</span></div></nav>
      <main className="document-stage printable-content"><motion.article className="paper" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{duration:.3}}><div className="paper-header">{role==="owner"?<DropdownMenu><DropdownMenuTrigger asChild><button className={`paper-kicker status-control ${status==="COMPLETE"?"complete":""}`}>{status==="COMPLETE"?<CheckCircleIcon weight="fill"/>:<NotePencilIcon/>}{status==="COMPLETE"?"Complete":"Working draft"}<CaretDownIcon/></button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem onClick={()=>void changeStatus("WORKING_DRAFT")}><NotePencilIcon/>Working draft</DropdownMenuItem><DropdownMenuItem onClick={()=>void changeStatus("COMPLETE")}><CheckCircleIcon/>Complete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>:<div className={`paper-kicker ${status==="COMPLETE"?"complete":""}`}>{status==="COMPLETE"?<CheckCircleIcon weight="fill"/>:<NotePencilIcon/>}{status==="COMPLETE"?"Complete":"Working draft"}</div>}<input id="document-title" value={documentName} readOnly={readOnly} onChange={(event)=>{setDocumentName(event.target.value);if(publication?.isActive)setHasUnpublishedChanges(true);}} onBlur={()=>void rename()} className="paper-title paper-title-input" aria-label="Document title"/><p className="paper-subtitle">A living document for ideas, decisions, and the details that make them useful.</p><div className="paper-meta"><span>Last edited today</span><span className="paper-meta__line"/><span>{readOnly?"View only":publication?.isActive?(hasUnpublishedChanges?"Published · unpublished changes":"Published and up to date"):"Shared workspace"}</span></div></div>
        <div className="editor-rule"/><div className="editor-toolbar"><div className="toolbar-group"><button className="toolbar-style" disabled={readOnly} onClick={()=>format("paragraph")}>Body <CaretDownIcon/></button><span className="toolbar-divider"/><button className="toolbar-button" disabled={readOnly} onClick={()=>format("bold")}><TextBIcon weight="bold"/></button><button className="toolbar-button" disabled={readOnly} onClick={()=>format("italic")}><TextItalicIcon/></button><button className="toolbar-button" disabled={readOnly} onClick={()=>format("underline")}><TextUnderlineIcon/></button><span className="toolbar-divider"/><button className="toolbar-button" disabled={readOnly} onClick={()=>format("align-left")}><TextAlignLeftIcon/></button><button className="toolbar-button" disabled={readOnly} onClick={()=>format("bullet-list")}><ListBulletsIcon/></button></div><span className="text-[10px] text-[#aaa4ac]">{readOnly?"Viewer access":"Select text, then ask Omni"}</span></div>
        <div className="paper-editor"><Suspense fallback={<div className="min-h-[520px] text-xs text-[#aaa49b]">Preparing the page…</div>}>{activeId?<CollaborativeEditor ref={editorRef} documentId={activeId} initialState={initialYjsState} readOnly={readOnly} user={presenceUser} onStatusChange={setCollaborationStatus} onPresenceChange={setLivePresence} onContentChange={contentChanged}/>:<Editor ref={editorRef} initialContent={content} onContentChange={contentChanged} ensureDocumentId={()=>ensureSaved()} readOnly={readOnly}/>}</Suspense></div>
      </motion.article></main>
      <AnimatePresence>{aiOpen&&<AIAssistantPanel editorRef={editorRef} documentId={activeId} readOnly={readOnly} onOpenSettings={()=>setSettingsOpen(true)} onClose={()=>setAiOpen(false)}/>}</AnimatePresence>
    </div>
    <Dialog open={shareOpen} onOpenChange={setShareOpen}><DialogContent className="share-dialog border-[#d8d1c5] bg-[#fffdf8] text-[#29251f] shadow-2xl sm:max-w-lg"><DialogHeader><DialogTitle>Invite people</DialogTitle><DialogDescription>Links require Google sign-in. Create a limited editor or viewer invitation.</DialogDescription></DialogHeader><div className="share-options"><select value={shareRole} onChange={(event)=>setShareRole(event.target.value as "viewer"|"editor")}><option value="editor">Can edit</option><option value="viewer">Can view</option></select><select value={expiry} onChange={(event)=>setExpiry(event.target.value)}><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option></select><input value={maxUses} onChange={(event)=>setMaxUses(event.target.value)} inputMode="numeric" placeholder="Uses · unlimited"/></div><Button onClick={createShare} disabled={shareBusy} className="bg-[#7140cd] text-white hover:bg-[#6032b8]">{shareBusy?"Creating…":"Create invite link"}</Button>{shareUrl&&<div className="flex gap-2"><input readOnly value={shareUrl} className="min-w-0 flex-1 rounded-lg border bg-[#f7f4ee] px-3 text-xs"/><Button onClick={()=>navigator.clipboard.writeText(shareUrl)}>Copy</Button></div>}<div className="mt-2 border-t border-[#ded8cd] pt-3"><p className="mb-2 text-xs font-semibold">Previous links</p>{shareLinks.length===0?<p className="text-xs text-[#8b847a]">No invitation links yet.</p>:shareLinks.map((link)=><div key={link.id} className="flex items-center justify-between border-b border-[#e9e4da] py-2 text-xs"><span>{link.role} · {link.useCount}{link.maxUses?`/${link.maxUses}`:" uses"} · {link.isActive?"active":"revoked"}</span>{link.isActive&&<button onClick={()=>revokeShare(link.id)} className="rounded p-2 text-[#9a4139]" aria-label="Revoke link"><TrashIcon/></button>}</div>)}</div></DialogContent></Dialog>
    <Dialog open={publishOpen} onOpenChange={setPublishOpen}><DialogContent className="publish-dialog border-[#d8d1c5] bg-[#fffdf8] text-[#29251f] shadow-2xl sm:max-w-lg"><DialogHeader><DialogTitle>{publication?.isActive?"Your published page":"Publish this document"}</DialogTitle><DialogDescription>{publication?.isActive?hasUnpublishedChanges?"The public snapshot is still live. Publish again when these changes are ready.":"Anyone with this link can read the current snapshot without signing in.":"Publishing creates a stable, read-only snapshot. Future edits stay private until republished."}</DialogDescription></DialogHeader>{publication?.isActive&&<div className="publication-url"><GlobeHemisphereWestIcon/><span>{publicPath}</span><button onClick={()=>void copyPublication()} aria-label="Copy public link"><CopyIcon/></button></div>}<div className="publish-preview"><span>Public reading page</span><h3>{documentName}</h3><p>{editorRef.current?.getPlainText().slice(0,180)||"The document will appear here with its typography, images, and spacing intact."}</p></div><div className="publish-actions">{publication?.isActive&&<><Button variant="outline" onClick={()=>window.open(publicPath,"_blank","noopener,noreferrer")}><ArrowSquareOutIcon/>View live</Button><Button variant="outline" onClick={()=>void unpublish()} disabled={publishBusy}>Unpublish</Button></>}<Button onClick={()=>void publish()} disabled={publishBusy||(!hasUnpublishedChanges&&Boolean(publication?.isActive))} className="bg-[#40355f] text-white hover:bg-[#302747]">{publishBusy?"Publishing…":publication?.isActive?"Republish changes":"Publish document"}</Button></div></DialogContent></Dialog>
    <SettingsModal isOpen={settingsOpen} onClose={()=>setSettingsOpen(false)} user={{name:currentUser.name,avatar:currentUser.avatar||undefined}}/>
  </div>;
}

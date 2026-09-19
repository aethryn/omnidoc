"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftIcon, ArrowSquareOutIcon, CaretDownIcon, CheckCircleIcon, ChatCircleDotsIcon, ClockCounterClockwiseIcon, CloudCheckIcon, CopyIcon, DotsThreeIcon, FileDocIcon, FileHtmlIcon, FileMdIcon, FilePdfIcon, FilesIcon, GearSixIcon, GlobeHemisphereWestIcon, ImageIcon, ListBulletsIcon, NotePencilIcon, ShareNetworkIcon, SparkleIcon, TextAlignLeftIcon, TextBIcon, TextItalicIcon, TextUnderlineIcon, TrashIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { CollaborationState, CollaborationStatus } from "../components/CollaborativeEditor";
import type { EditorHandle, EditorSelection, FormatCommand, PresenceUser } from "./editor-types";
import { OmnidocLogo } from "@/components/omnidoc-logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarSeparator, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import "./print-styles.css";
import "./workspace-styles.css";
import "./mobile-overrides.css";
import { HistoryDrawer } from "./HistoryDrawer";
import { CommentsDrawer } from "./CommentsDrawer";
import { initialWorkspaceUIState, workspaceReducer, type WorkspaceModal, type WorkspaceSheet } from "./workspace-state";
import { extractDocumentImageUrls } from "@/lib/document-content";
import { uploadAndInsertImage } from "./image-upload";

const AIAssistantPanel=dynamic(()=>import("./AIAssistantPanel").then((module)=>module.AIAssistantPanel),{ssr:false});
const SettingsModal=dynamic(()=>import("@/components/setting-modal").then((module)=>module.SettingsModal),{ssr:false});
const SettingsPanel=dynamic(()=>import("@/components/setting-modal").then((module)=>module.SettingsPanel),{ssr:false});
const Editor=lazy(()=>import("./editor"));
const CollaborativeEditor=lazy(()=>import("../components/CollaborativeEditor"));
const EMPTY_DOCUMENT=JSON.stringify({type:"doc",content:[{type:"paragraph"}]});
const LEGACY_LOCAL_DRAFT="omnidoc:local-draft";
const recoveryKey=(userId:string)=>`omnidoc:recovery:${userId}`;
const colors=["#7c4dcc","#a65e67","#526b8c","#54836d","#b07839"];

type DocumentStatus="WORKING_DRAFT"|"COMPLETE";
type PublicationSummary={id:string;slug:string;isActive:boolean;publishedAt:string;updatedAt:string;revisionHash?:string;url?:string;hasUnpublishedChanges?:boolean};
export type InitialDocument={id:string;title:string;content:string;yjsState:string|null;role:string;status:DocumentStatus;allowComments:boolean;updatedAt:string;lastEditedAt:string;publication:PublicationSummary|null;collaborators:Array<{id:string;name:string;avatar:string;role:string}>};
type ShareLink={id:string;role:"viewer"|"editor";expiresAt:string|null;maxUses:number|null;useCount:number;createdAt:string;isActive:boolean};

function initials(name:string){return name.split(/\s+/).map((part)=>part[0]).join("").slice(0,2).toUpperCase();}

function MobileSidebarAction({ icon, children, onClick, disabled }: { icon:ReactNode; children:ReactNode; onClick:()=>void; disabled?:boolean }) {
  const { setOpenMobile }=useSidebar();
  return <SidebarMenuButton disabled={disabled} onClick={()=>{setOpenMobile(false);onClick();}} className="h-11 rounded-xl px-3 text-[13px]"><span className="text-[#75688a]">{icon}</span><span>{children}</span></SidebarMenuButton>;
}

export default function DocumentEditorClient({initialDocument,currentUser}:{initialDocument?:InitialDocument;currentUser:PresenceUser}){
  const router=useRouter();
  const editorRef=useRef<EditorHandle|null>(null);
  const imageInputRef=useRef<HTMLInputElement|null>(null);
  const creationRef=useRef<Promise<string|null>|null>(null);
  const activeIdRef=useRef(initialDocument?.id);
  const contentRef=useRef(initialDocument?.content||EMPTY_DOCUMENT);
  const documentNameRef=useRef(initialDocument?.title||"Untitled document");
  const [activeId,setActiveId]=useState(initialDocument?.id);
  const [content,setContent]=useState(initialDocument?.content||EMPTY_DOCUMENT);
  const [localEditorSeed,setLocalEditorSeed]=useState(EMPTY_DOCUMENT);
  const [localEditorVersion,setLocalEditorVersion]=useState(0);
  const [embeddedImageUrls,setEmbeddedImageUrls]=useState(()=>extractDocumentImageUrls(initialDocument?.content||EMPTY_DOCUMENT));
  const [documentName,setDocumentName]=useState(initialDocument?.title||"Untitled document");
  const [initialYjsState,setInitialYjsState]=useState(initialDocument?.yjsState||null);
  const [role]=useState(initialDocument?.role||"owner");
  const [status,setStatus]=useState<DocumentStatus>(initialDocument?.status||"WORKING_DRAFT");
  const [publication,setPublication]=useState<PublicationSummary|null>(initialDocument?.publication||null);
  const [workspaceUI,dispatchWorkspace]=useReducer(workspaceReducer,initialWorkspaceUIState);
  const publishOpen=workspaceUI.modal==="publish";
  const settingsOpen=workspaceUI.modal==="settings";
  const shareOpen=workspaceUI.modal==="share";
  const historyOpen=workspaceUI.sheet==="history";
  const commentsOpen=workspaceUI.sheet==="comments";
  const aiOpen=workspaceUI.sheet==="ai";
  const setSheetOpen=(sheet:WorkspaceSheet, value:boolean|((current:boolean)=>boolean))=>{const current=workspaceUI.sheet===sheet;const next=typeof value==="function"?value(current):value;dispatchWorkspace({type:next?"open-sheet":"close-sheet",sheet});};
  const setModalOpen=(modal:WorkspaceModal, value:boolean|((current:boolean)=>boolean))=>{const current=workspaceUI.modal===modal;const next=typeof value==="function"?value(current):value;dispatchWorkspace({type:next?"open-modal":"close-modal",modal});};
  const setPublishOpen=(value:boolean|((current:boolean)=>boolean))=>setModalOpen("publish",value);
  const setSettingsOpen=(value:boolean|((current:boolean)=>boolean))=>setModalOpen("settings",value);
  const setShareOpen=(value:boolean|((current:boolean)=>boolean))=>setModalOpen("share",value);
  const setHistoryOpen=(value:boolean|((current:boolean)=>boolean))=>setSheetOpen("history",value);
  const setCommentsOpen=(value:boolean|((current:boolean)=>boolean))=>setSheetOpen("comments",value);
  const setAiOpen=(value:boolean|((current:boolean)=>boolean))=>setSheetOpen("ai",value);
  const [publishBusy,setPublishBusy]=useState(false);
  const [exporting,setExporting]=useState<string|null>(null);
  const [hasUnpublishedChanges,setHasUnpublishedChanges]=useState(Boolean(initialDocument?.publication?.isActive&&initialDocument.lastEditedAt>initialDocument.publication.updatedAt));
  const [isOnline,setIsOnline]=useState(true);
  const [isSaving,setIsSaving]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [lastSaved,setLastSaved]=useState(initialDocument?.updatedAt||null);
  const [collaborationStatus,setCollaborationStatus]=useState<CollaborationStatus>(activeId?"connecting":"local");
  const [collaborationState,setCollaborationState]=useState<CollaborationState>({connectivity:activeId?"connecting":"online",indexedDbReady:false,pendingLocalChanges:false,lastPersistedAt:initialDocument?.updatedAt||null,syncError:null,retryAvailable:false});
  const selectionRef=useRef<ReturnType<EditorHandle["getSelection"]>|null>(null);
  const [livePresence,setLivePresence]=useState<PresenceUser[]>([currentUser]);
  const [presenceOpen,setPresenceOpen]=useState(false);
  const [omniSelection,setOmniSelection]=useState<EditorSelection|null>(null);
  const [shareRole,setShareRole]=useState<"viewer"|"editor">("editor");
  const [expiry,setExpiry]=useState("10080");
  const [maxUses,setMaxUses]=useState("");
  const [shareUrl,setShareUrl]=useState("");
  const [shareLinks,setShareLinks]=useState<ShareLink[]>([]);
  const [shareBusy,setShareBusy]=useState(false);
  const [sidebarSettingsOpen,setSidebarSettingsOpen]=useState(false);
  const [recoveryDraft,setRecoveryDraft]=useState<string|null>(null);
  const readOnly=role==="viewer";

  const presenceUser=useMemo(()=>({...currentUser,color:currentUser.color||colors[0],role}),[currentUser,role]);
  const knownPeople=useMemo(()=>{const byId=new Map<string,PresenceUser>();(initialDocument?.collaborators||[]).forEach((person,index)=>byId.set(person.id,{...person,color:colors[index%colors.length]}));livePresence.forEach((person)=>byId.set(person.id,person));return Array.from(byId.values());},[initialDocument?.collaborators,livePresence]);

  useEffect(()=>{activeIdRef.current=activeId;},[activeId]);
  useEffect(()=>{contentRef.current=content;},[content]);
  useEffect(()=>{documentNameRef.current=documentName;},[documentName]);
  useEffect(()=>{const online=()=>setIsOnline(true),offline=()=>setIsOnline(false);setIsOnline(navigator.onLine);window.addEventListener("online",online);window.addEventListener("offline",offline);if(!initialDocument){const key=recoveryKey(currentUser.id);const existing=localStorage.getItem(key);const legacy=localStorage.getItem(LEGACY_LOCAL_DRAFT);if(!existing&&legacy)localStorage.setItem(key,legacy);if(legacy)localStorage.removeItem(LEGACY_LOCAL_DRAFT);setRecoveryDraft(localStorage.getItem(key));}return()=>{window.removeEventListener("online",online);window.removeEventListener("offline",offline);};},[currentUser.id,initialDocument]);

  useEffect(()=>{
    const locked=historyOpen||commentsOpen||aiOpen;
    document.body.classList.toggle("mobile-sheet-open",locked);
    return()=>document.body.classList.remove("mobile-sheet-open");
  },[historyOpen,commentsOpen,aiOpen]);

  const ensureSaved=useCallback((contentOverride?:string)=>{
    if(activeIdRef.current)return Promise.resolve(activeIdRef.current);
    if(creationRef.current)return creationRef.current;
    const json=contentOverride||editorRef.current?.getDocumentJSON()||contentRef.current;
    setIsSaving(true);
    creationRef.current=fetch("/api/documents",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:documentNameRef.current,content:json})}).then(async(response)=>{if(!response.ok)throw new Error("Could not create document");const created=await response.json();activeIdRef.current=created.id;setActiveId(created.id);setInitialYjsState(created.yjsState);setLastSaved(new Date().toISOString());setDirty(false);localStorage.removeItem(recoveryKey(currentUser.id));setRecoveryDraft(null);router.replace(`/document/${created.id}`);return created.id as string;}).catch(()=>{localStorage.setItem(recoveryKey(currentUser.id),json);setRecoveryDraft(json);return null;}).finally(()=>{setIsSaving(false);creationRef.current=null;});
    return creationRef.current;
  },[currentUser.id,router]);

  const contentChanged=useCallback((json:string)=>{contentRef.current=json;setContent(json);setEmbeddedImageUrls(extractDocumentImageUrls(json));if(!activeIdRef.current)setDirty(true);if(publication?.isActive)setHasUnpublishedChanges(true);if(!activeIdRef.current)void ensureSaved(json);},[ensureSaved,publication?.isActive]);
  const handlePresenceChange=useCallback((users:PresenceUser[])=>setLivePresence(Array.from(new Map(users.map((person)=>[person.id,person])).values())),[]);
  const recoverDraft=useCallback(()=>{if(!recoveryDraft)return;contentRef.current=recoveryDraft;setContent(recoveryDraft);setEmbeddedImageUrls(extractDocumentImageUrls(recoveryDraft));setLocalEditorSeed(recoveryDraft);setLocalEditorVersion((version)=>version+1);setRecoveryDraft(null);},[recoveryDraft]);
  const discardRecovery=useCallback(()=>{localStorage.removeItem(recoveryKey(currentUser.id));setRecoveryDraft(null);},[currentUser.id]);

  async function save(documentId?:string){
    const id=documentId||await ensureSaved();if(!id||!isOnline)return false;
    // The websocket server owns persistence for an existing collaborative
    // document. A REST PUT here would save a stale JSON snapshot and leave the
    // database's yjsState out of sync with its content column.
    if(initialDocument?.id||activeId){const acknowledged=await editorRef.current?.createCheckpoint("Manual checkpoint",documentName);if(acknowledged){setDirty(false);setLastSaved(new Date().toISOString());}return Boolean(acknowledged)&&collaborationStatus!=="error";}
    setIsSaving(true);const json=editorRef.current?.getDocumentJSON()||content;
    try {
      const response=await fetch(`/api/documents/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:documentName,content:json})});
      if(response.ok){setDirty(false);setLastSaved(new Date().toISOString());localStorage.removeItem(`document-${id}-backup`);}else localStorage.setItem(`document-${id}-backup`,json);
      return response.ok;
    } catch { localStorage.setItem(`document-${id}-backup`,json); return false; } finally { setIsSaving(false); }
  }

  // Collaborative documents are persisted by the websocket room. Sending the
  // whole JSON document through this legacy REST autosave would race the Yjs
  // state and overwrite a collaborator's latest changes.
  useEffect(()=>{if(!dirty||activeId)return;const timer=window.setTimeout(()=>void save(),3000);return()=>window.clearTimeout(timer);},[dirty,activeId]);

  async function rename(){if(readOnly)return;const next=documentName.trim()||"Untitled document";setDocumentName(next);if(publication?.isActive)setHasUnpublishedChanges(true);const id=await ensureSaved();if(id)await fetch(`/api/documents/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:next})});}
  function format(command:FormatCommand){editorRef.current?.runFormat(command);}
  async function changeStatus(next:DocumentStatus){if(role!=="owner"||next===status)return;const id=await ensureSaved();if(!id)return;const previous=status;setStatus(next);const response=await fetch(`/api/documents/${id}/status`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:next})});if(!response.ok){setStatus(previous);toast.error("Document status could not be changed");}else toast.success(next==="COMPLETE"?"Document marked complete":"Returned to working draft");}
  async function publish(){if(role!=="owner")return;const id=await ensureSaved();if(!id)return;setPublishBusy(true);const json=editorRef.current?.getDocumentJSON()||content;const response=await fetch(`/api/documents/${id}/publication`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:documentName,content:json})});const data=await response.json().catch(()=>({}));if(response.ok){setPublication({...data,isActive:true,updatedAt:new Date().toISOString()});setHasUnpublishedChanges(false);setDirty(false);toast.success(publication?"Published page updated":"Document published");}else toast.error(data.error||"Document could not be published");setPublishBusy(false);}
  async function unpublish(){if(!activeId)return;setPublishBusy(true);const response=await fetch(`/api/documents/${activeId}/publication`,{method:"DELETE"});if(response.ok){setPublication((current)=>current?{...current,isActive:false}:current);toast.success("Public page removed");}else toast.error("Document could not be unpublished");setPublishBusy(false);}
  async function copyPublication(){const path=publication?.url||(publication?`${window.location.origin}/p/${publication.id}/${publication.slug}`:"");if(!path)return;await navigator.clipboard.writeText(path.startsWith("http")?path:`${window.location.origin}${path}`);toast.success("Public link copied");}
  async function exportDocument(format:"md"|"pdf"|"docx"|"html"){const id=await ensureSaved();const saved=id?await save(id):false;if(!saved||!id){toast.error("Save the document before exporting");return;}setExporting(format);const response=await fetch(`/api/documents/${id}/export?format=${format}`);if(!response.ok){const data=await response.json().catch(()=>({}));toast.error(data.error||"Export could not be created");setExporting(null);return;}const blob=await response.blob();const disposition=response.headers.get("content-disposition")||"";const match=disposition.match(/filename="([^"]+)"/);const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=match?.[1]||`document.${format}`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);setExporting(null);toast.success(`${format.toUpperCase()} export ready`);}

  async function loadShareLinks(){const id=await ensureSaved();if(!id)return null;setShareUrl("");const response=await fetch(`/api/documents/${id}/share`,{cache:"no-store"});if(response.ok)setShareLinks(await response.json());return id;}
  async function openShare(){const id=await loadShareLinks();if(id)setShareOpen(true);}
  async function openComments(){selectionRef.current=editorRef.current?.getSelection()||null;const id=await ensureSaved();if(id)setCommentsOpen(true);}
  async function openHistory(){const id=await ensureSaved();if(id)setHistoryOpen(true);}
  function openOmni(){setOmniSelection(editorRef.current?.getSelection()||null);setPresenceOpen(false);setAiOpen(true);}
  async function insertImage(file: File){await uploadAndInsertImage(file,()=>ensureSaved(),(image)=>editorRef.current?.insertImage(image));}
  async function createShare(){if(!activeId)return;setShareBusy(true);const response=await fetch(`/api/documents/${activeId}/share`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({role:shareRole,expiresInMinutes:Number(expiry),maxUses:maxUses?Number(maxUses):null})});if(response.ok){const data=await response.json();setShareUrl(data.url);const list=await fetch(`/api/documents/${activeId}/share`,{cache:"no-store"});if(list.ok)setShareLinks(await list.json());}else toast.error("Invite link could not be created");setShareBusy(false);}
  async function revokeShare(shareId:string){if(!activeId)return;await fetch(`/api/documents/${activeId}/share`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({shareId})});setShareLinks((items)=>items.map((item)=>item.id===shareId?{...item,isActive:false}:item));}

  const savedLabel=isSaving?"Saving…":activeId?(!isOnline||collaborationState.connectivity==="offline"?"Saved locally":collaborationState.connectivity==="connecting"?"Connecting…":collaborationState.syncError?"Couldn’t sync":collaborationState.pendingLocalChanges?"Saving…":"All changes saved"):!isOnline?"Saved locally":dirty?"Saving…":lastSaved?"Saved":"Local draft";
  const publicPath=publication?`/p/${publication.id}/${publication.slug}`:"";

  return <SidebarProvider defaultOpen={false} className="document-sidebar-provider min-h-0">
    <Sidebar side="left" collapsible="offcanvas" className="border-r border-[#e3ddd3] bg-[#fffdf8]">
      <SidebarHeader className="border-b border-[#e8e2d8] p-4 pt-[calc(1rem+var(--safe-area-top))]">
        <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><OmnidocLogo className="h-9 w-9 shrink-0"/><div className="min-w-0"><p className="truncate font-[var(--font-instrument)] text-xl">{documentName}</p><p className="text-[10px] text-[#8c847a]">Document workspace</p></div></div><SidebarTrigger className="h-9 w-9 rounded-full"/></div>
      </SidebarHeader>
      <SidebarContent className="bg-[#fffdf8] px-2 py-3">
        <SidebarGroup>
          <SidebarGroupLabel className="uppercase tracking-[0.14em] text-[#8d8478]">Workspace</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>
            <SidebarMenuItem><MobileSidebarAction icon={<FilesIcon/>} onClick={()=>router.push("/dashboard")}>Documents</MobileSidebarAction></SidebarMenuItem>
            <SidebarMenuItem><MobileSidebarAction icon={<ChatCircleDotsIcon/>} onClick={()=>void openComments()}>Comments</MobileSidebarAction></SidebarMenuItem>
            <SidebarMenuItem><MobileSidebarAction icon={<ClockCounterClockwiseIcon/>} onClick={()=>void openHistory()}>History</MobileSidebarAction></SidebarMenuItem>
            <SidebarMenuItem><MobileSidebarAction icon={<SparkleIcon weight="fill"/>} onClick={openOmni}>Ask Omni</MobileSidebarAction></SidebarMenuItem>
          </SidebarMenu></SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator/>
        <SidebarGroup>
          <SidebarGroupLabel className="uppercase tracking-[0.14em] text-[#8d8478]">Document</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>
            <SidebarMenuItem><details className="group rounded-xl"><summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-[13px] hover:bg-sidebar-accent"><DotsThreeIcon className="text-[#75688a]" weight="bold"/><span className="flex-1">Document actions</span><CaretDownIcon className="transition-transform group-open:rotate-180"/></summary><div className="ml-5 grid gap-1 border-l border-[#dfd8ce] py-1 pl-3">
              <MobileSidebarAction icon={<CloudCheckIcon/>} onClick={()=>void save()}>Save now</MobileSidebarAction>
              <MobileSidebarAction icon={<NotePencilIcon/>} onClick={()=>window.setTimeout(()=>document.getElementById("document-title")?.focus(),250)}>Rename</MobileSidebarAction>
            </div></details></SidebarMenuItem>
            {!readOnly&&<SidebarMenuItem><details className="group rounded-xl" onToggle={(event)=>{if(event.currentTarget.open)void loadShareLinks();}}><summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-[13px] hover:bg-sidebar-accent"><ShareNetworkIcon className="text-[#75688a]"/><span className="flex-1">Share</span><CaretDownIcon className="transition-transform group-open:rotate-180"/></summary><div className="mx-2 grid gap-2 rounded-xl border border-[#e3ddd3] bg-white/70 p-3">
              <select className="h-10 rounded-lg border border-[#d8d1c5] bg-white px-2 text-xs" value={shareRole} onChange={(event)=>setShareRole(event.target.value as "viewer"|"editor")}><option value="editor">Can edit</option><option value="viewer">Can view</option></select>
              <select className="h-10 rounded-lg border border-[#d8d1c5] bg-white px-2 text-xs" value={expiry} onChange={(event)=>setExpiry(event.target.value)}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option><option value="1440">24 hours</option><option value="10080">7 days</option></select>
              <input className="h-10 rounded-lg border border-[#d8d1c5] bg-white px-2 text-xs" value={maxUses} onChange={(event)=>setMaxUses(event.target.value)} inputMode="numeric" placeholder="Uses · unlimited"/>
              <Button size="sm" onClick={()=>void createShare()} disabled={shareBusy} className="rounded-full bg-[#7140cd] text-white hover:bg-[#6032b8]">{shareBusy?"Creating…":"Create invite"}</Button>
              {shareUrl&&<div className="flex gap-1"><input readOnly value={shareUrl} className="min-w-0 flex-1 rounded-lg border bg-[#f7f4ee] px-2 text-[10px]"/><Button size="sm" variant="outline" className="rounded-full" onClick={()=>void navigator.clipboard.writeText(shareUrl)}>Copy</Button></div>}
              {shareLinks.filter((link)=>link.isActive).map((link)=><div key={link.id} className="flex items-center justify-between gap-2 border-t border-[#e9e4da] pt-2 text-[10px]"><span>{link.role} · {link.useCount}{link.maxUses?`/${link.maxUses}`:" uses"}</span><button onClick={()=>void revokeShare(link.id)} className="rounded-full p-2 text-[#9a4139]" aria-label="Revoke link"><TrashIcon/></button></div>)}
            </div></details></SidebarMenuItem>}
            {role==="owner"&&status==="COMPLETE"&&<SidebarMenuItem><details className="group rounded-xl"><summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-[13px] hover:bg-sidebar-accent"><GlobeHemisphereWestIcon className="text-[#75688a]"/><span className="flex-1">{publication?.isActive?"Publication":"Publish"}</span><CaretDownIcon className="transition-transform group-open:rotate-180"/></summary><div className="mx-2 grid gap-2 rounded-xl border border-[#e3ddd3] bg-white/70 p-3 text-xs">
              <p className="leading-5 text-[#756d63]">{publication?.isActive?hasUnpublishedChanges?"The public page is live. Republish to include your latest changes.":"The public page is up to date.":"Create a read-only public snapshot."}</p>
              {publication?.isActive&&<div className="flex gap-2"><Button size="sm" variant="outline" className="flex-1 rounded-full" onClick={()=>window.open(publicPath,"_blank","noopener,noreferrer")}>View</Button><Button size="sm" variant="outline" className="flex-1 rounded-full" onClick={()=>void copyPublication()}>Copy link</Button></div>}
              <Button size="sm" className="rounded-full bg-[#40355f] text-white" onClick={()=>void publish()} disabled={publishBusy||(!hasUnpublishedChanges&&Boolean(publication?.isActive))}>{publishBusy?"Publishing…":publication?.isActive?"Republish":"Publish"}</Button>
              {publication?.isActive&&<Button size="sm" variant="ghost" className="rounded-full text-[#9a4139]" onClick={()=>void unpublish()} disabled={publishBusy}>Unpublish</Button>}
            </div></details></SidebarMenuItem>}
            <SidebarMenuItem><details className="group rounded-xl"><summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-[13px] hover:bg-sidebar-accent"><FileDocIcon className="text-[#75688a]"/><span className="flex-1">Export</span><CaretDownIcon className="transition-transform group-open:rotate-180"/></summary><div className="ml-5 grid gap-1 border-l border-[#dfd8ce] py-1 pl-3">
              <MobileSidebarAction icon={<FilePdfIcon/>} onClick={()=>void exportDocument("pdf")} disabled={Boolean(exporting)}>PDF</MobileSidebarAction>
              <MobileSidebarAction icon={<FileDocIcon/>} onClick={()=>void exportDocument("docx")} disabled={Boolean(exporting)}>DOCX</MobileSidebarAction>
              <MobileSidebarAction icon={<FileMdIcon/>} onClick={()=>void exportDocument("md")} disabled={Boolean(exporting)}>Markdown</MobileSidebarAction>
              <MobileSidebarAction icon={<FileHtmlIcon/>} onClick={()=>void exportDocument("html")} disabled={Boolean(exporting)}>HTML</MobileSidebarAction>
            </div></details></SidebarMenuItem>
            <SidebarMenuItem><details className="group rounded-xl" onToggle={(event)=>setSidebarSettingsOpen(event.currentTarget.open)}><summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-[13px] hover:bg-sidebar-accent"><GearSixIcon className="text-[#75688a]"/><span className="flex-1">Settings</span><CaretDownIcon className="transition-transform group-open:rotate-180"/></summary><div className="mx-2 max-h-[65dvh] overflow-y-auto rounded-xl border border-[#e3ddd3] bg-[#fffdf8] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><SettingsPanel active={sidebarSettingsOpen} user={{name:currentUser.name,avatar:currentUser.avatar||undefined}} className="[&>div:first-child]:px-4 [&>div:first-child]:py-4 [&_h2]:text-2xl [&_[role=tablist]]:mx-0 [&_[role=tabpanel]]:px-0"/></div></details></SidebarMenuItem>
          </SidebarMenu></SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-[#e8e2d8] bg-[#fffdf8] p-4 pb-[calc(1rem+var(--safe-area-bottom))]"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-[#352d59] text-xs text-white">{currentUser.avatar?<img src={currentUser.avatar} alt="" className="h-full w-full object-cover"/>:initials(currentUser.name)}</span><div className="min-w-0"><p className="truncate text-xs font-medium">{currentUser.name}</p><p className="text-[10px] text-[#8c847a]">{role==="owner"?"Owner":role}</p></div></div></SidebarFooter>
    </Sidebar>
    <div className="omnidoc-workspace">
    <input ref={imageInputRef} className="sr-only" type="file" accept=".jpg,.jpeg,.png,.gif,image/jpeg,image/png,image/gif" onChange={(event)=>{const file=event.target.files?.[0];event.target.value="";if(file)void insertImage(file);}} />
    <header className="workspace-topbar"><div className="workspace-wordmark"><SidebarTrigger className="mobile-document-sidebar-trigger h-9 w-9 rounded-full"/><button className="workspace-back-button" onClick={()=>router.push("/dashboard")} aria-label="Back to documents"><ArrowLeftIcon/></button><button className="workspace-logo" onClick={()=>router.push("/dashboard")} aria-label="Back to documents"><OmnidocLogo priority className="workspace-logo-image"/></button><div className="workspace-breadcrumb"><span>Omnidoc</span><span className="workspace-slash">/</span><span className="document-name">{documentName}</span></div></div><div className="topbar-actions">
      <div className={`save-state ${collaborationState.syncError?"is-error":""}`}>{isOnline&&!collaborationState.syncError?<CloudCheckIcon/>:<ClockCounterClockwiseIcon/>}<span className={`save-state__dot ${(dirty||collaborationState.pendingLocalChanges)?"pending":""}`}/>{savedLabel}{collaborationState.retryAvailable&&<button type="button" className="ml-1 rounded border border-[#bdaecb] px-1.5 py-0.5 text-[9px] text-[#694d83] hover:bg-[#eee8f4]" onClick={()=>editorRef.current?.retryPersistence()} aria-label="Retry syncing changes">Retry</button>}</div>
      <Popover open={presenceOpen} onOpenChange={(open)=>{setPresenceOpen(open);if(open)setAiOpen(false);}}><PopoverTrigger asChild><button className="collaborator-tab"><span className="avatar-stack">{livePresence.slice(0,3).map((person,index)=><i key={person.id} className="mini-avatar" style={{background:person.color||colors[index%colors.length]}}>{person.avatar?<img src={person.avatar} alt=""/>:initials(person.name)}</i>)}</span><span>{livePresence.length} here</span></button></PopoverTrigger><PopoverContent align="end" sideOffset={8} className="collaborator-popover"><h3>People in this document</h3>{knownPeople.map((person)=><div className="person-row" key={person.id}><i className="mini-avatar" style={{background:person.color}}>{person.avatar?<img src={person.avatar} alt=""/>:initials(person.name)}</i><div><p>{person.id===currentUser.id?"You":person.name}</p><span>{livePresence.some((live)=>live.id===person.id)?"Active now":person.role||"Collaborator"}</span></div>{livePresence.some((live)=>live.id===person.id)&&<i className="online-dot"/>}</div>)}</PopoverContent></Popover>
      <button className="icon-action topbar-secondary-action" onClick={()=>void openHistory()} aria-label="Open history"><ClockCounterClockwiseIcon/></button><button className="icon-action topbar-secondary-action" onClick={()=>void openComments()} aria-label="Open comments"><ChatCircleDotsIcon/></button><button className="icon-action topbar-secondary-action" onClick={openShare} disabled={readOnly} aria-label="Share document"><ShareNetworkIcon/></button>{role==="owner"&&status==="COMPLETE"&&<button className="icon-action topbar-secondary-action mobile-publish-action" onClick={()=>setPublishOpen(true)} aria-label="Publish document"><GlobeHemisphereWestIcon/></button>}<button className="ai-toggle topbar-secondary-action" onClick={openOmni}><SparkleIcon weight="fill"/><span>Ask Omni</span></button>
      <div className="topbar-overflow"><DropdownMenu><DropdownMenuTrigger asChild><button className="icon-action" aria-label="Document actions"><DotsThreeIcon weight="bold"/></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={()=>void save()}>Save now</DropdownMenuItem><DropdownMenuItem onClick={()=>document.getElementById("document-title")?.focus()}>Rename</DropdownMenuItem>{role==="owner"&&status==="COMPLETE"&&<DropdownMenuItem onClick={()=>setPublishOpen(true)}><GlobeHemisphereWestIcon/>{publication?.isActive?"Manage published page":"Publish document"}</DropdownMenuItem>}<DropdownMenuSeparator/><DropdownMenuItem disabled={Boolean(exporting)} onClick={()=>void exportDocument("pdf")}><FilePdfIcon/>Export as PDF</DropdownMenuItem><DropdownMenuItem disabled={Boolean(exporting)} onClick={()=>void exportDocument("docx")}><FileDocIcon/>Export as DOCX</DropdownMenuItem><DropdownMenuItem disabled={Boolean(exporting)} onClick={()=>void exportDocument("md")}><FileMdIcon/>Export as Markdown</DropdownMenuItem><DropdownMenuItem disabled={Boolean(exporting)} onClick={()=>void exportDocument("html")}><FileHtmlIcon/>Export as HTML</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
    </div></header>
    <div className="workspace-body"><nav className="workspace-rail"><div className="rail-stack"><button className="rail-button" onClick={()=>router.push("/dashboard")} aria-label="Back"><ArrowLeftIcon/></button><button className="rail-button active" aria-label="Documents"><FilesIcon/></button><button className="rail-button" onClick={()=>router.push("/document")} aria-label="New document"><NotePencilIcon/></button>{role==="owner"&&status==="COMPLETE"&&<button className={`rail-button publish-rail ${publication?.isActive?"is-live":""}`} onClick={()=>setPublishOpen(true)} aria-label={publication?.isActive?"Manage published page":"Publish document"}><GlobeHemisphereWestIcon/></button>}</div><div className="rail-stack"><button className="rail-button" onClick={()=>setSettingsOpen(true)} aria-label="Settings"><GearSixIcon/></button><span className="profile-orb">{initials(currentUser.name)}</span></div></nav>
      <main className="document-stage printable-content">{!initialDocument&&recoveryDraft&&<div className="recovery-banner" role="status"><div><strong>Unfinished draft found</strong><span>We couldn’t create the document earlier. Recover it here if you want to continue.</span></div><div className="recovery-actions"><button onClick={recoverDraft}>Recover</button><button onClick={discardRecovery}>Discard</button></div></div>}<motion.article className="paper" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{duration:.3}}><div className="paper-header">{role==="owner"?<DropdownMenu><DropdownMenuTrigger asChild><button className={`paper-kicker status-control ${status==="COMPLETE"?"complete":""}`}>{status==="COMPLETE"?<CheckCircleIcon weight="fill"/>:<NotePencilIcon/>}{status==="COMPLETE"?"Complete":"Working draft"}<CaretDownIcon/></button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem onClick={()=>void changeStatus("WORKING_DRAFT")}><NotePencilIcon/>Working draft</DropdownMenuItem><DropdownMenuItem onClick={()=>void changeStatus("COMPLETE")}><CheckCircleIcon/>Complete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>:<div className={`paper-kicker ${status==="COMPLETE"?"complete":""}`}>{status==="COMPLETE"?<CheckCircleIcon weight="fill"/>:<NotePencilIcon/>}{status==="COMPLETE"?"Complete":"Working draft"}</div>}<input id="document-title" value={documentName} readOnly={readOnly} onChange={(event)=>{documentNameRef.current=event.target.value;setDocumentName(event.target.value);if(publication?.isActive)setHasUnpublishedChanges(true);}} onBlur={()=>void rename()} className="paper-title paper-title-input" aria-label="Document title"/><p className="paper-subtitle">A living document for ideas, decisions, and the details that make them useful.</p><div className="paper-meta"><span>Last edited today</span><span className="paper-meta__line"/><span>{readOnly?"View only":publication?.isActive?(hasUnpublishedChanges?"Published · unpublished changes":"Published and up to date"):"Shared workspace"}</span></div></div>
        <div className="editor-rule"/><div className="editor-toolbar"><div className="toolbar-group"><button className="toolbar-style" disabled={readOnly} onClick={()=>format("paragraph")}>Body <CaretDownIcon/></button><span className="toolbar-divider"/><button className="toolbar-button" disabled={readOnly} onClick={()=>format("bold")}><TextBIcon weight="bold"/></button><button className="toolbar-button" disabled={readOnly} onClick={()=>format("italic")}><TextItalicIcon/></button><button className="toolbar-button" disabled={readOnly} onClick={()=>format("underline")}><TextUnderlineIcon/></button><span className="toolbar-divider"/><button className="toolbar-button" disabled={readOnly} onClick={()=>format("align-left")}><TextAlignLeftIcon/></button><button className="toolbar-button" disabled={readOnly} onClick={()=>format("bullet-list")}><ListBulletsIcon/></button><button className="toolbar-button" disabled={readOnly} onClick={()=>imageInputRef.current?.click()} aria-label="Insert image" title="Insert JPEG, PNG, or GIF"><ImageIcon/></button></div><span className="text-[10px] text-[#aaa4ac]">{readOnly?"Viewer access":"Select text, then ask Omni"}</span></div>
        <div className="paper-editor"><Suspense fallback={<div className="min-h-[520px] text-xs text-[#aaa49b]">Preparing the page…</div>}>{activeId?<CollaborativeEditor key={activeId} ref={editorRef} documentId={activeId} initialState={initialYjsState} readOnly={readOnly} user={presenceUser} onStatusChange={setCollaborationStatus} onStateChange={setCollaborationState} onPresenceChange={handlePresenceChange} onContentChange={contentChanged} onAccessExpired={(persisted)=>{toast.error(persisted?"Your invitation expired. Your saved changes are safe.":"Your invitation expired.");router.replace("/dashboard");}}/>:<Editor key={`local-${localEditorVersion}`} ref={editorRef} initialContent={localEditorSeed} onContentChange={contentChanged} ensureDocumentId={()=>ensureSaved()} readOnly={readOnly}/>}</Suspense></div>
      </motion.article></main>
      <button className={`mobile-sheet-backdrop ${aiOpen?"is-open":""}`} aria-label="Close Omni assistant" tabIndex={aiOpen?0:-1} onClick={()=>setAiOpen(false)}/><AnimatePresence>{aiOpen&&<AIAssistantPanel editorRef={editorRef} selection={omniSelection} documentId={activeId} embeddedImageUrls={embeddedImageUrls} readOnly={readOnly} onOpenSettings={()=>{setAiOpen(false);setSettingsOpen(true)}} onClose={()=>setAiOpen(false)}/>}</AnimatePresence>
    </div>
    <HistoryDrawer documentId={activeId} open={historyOpen} onClose={()=>setHistoryOpen(false)} editorRef={editorRef} title={documentName} canEdit={!readOnly} canDelete={role==="owner"}/><CommentsDrawer documentId={activeId} open={commentsOpen} onClose={()=>setCommentsOpen(false)} editorRef={editorRef} selectionRef={selectionRef} canResolve={!readOnly} allowComments={Boolean(initialDocument?.allowComments ?? true)} currentUserId={currentUser.id} canModerate={role==="owner"} documentText={content}/>
    <Dialog open={shareOpen} onOpenChange={setShareOpen}><DialogContent className="share-dialog border-[#d8d1c5] bg-[#fffdf8] text-[#29251f] shadow-2xl sm:max-w-lg"><DialogHeader><DialogTitle>Invite people</DialogTitle><DialogDescription>Links require Google sign-in. Create a limited editor or viewer invitation.</DialogDescription></DialogHeader><div className="share-options"><select value={shareRole} onChange={(event)=>setShareRole(event.target.value as "viewer"|"editor")}><option value="editor">Can edit</option><option value="viewer">Can view</option></select><select value={expiry} onChange={(event)=>setExpiry(event.target.value)}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option><option value="1440">24 hours</option><option value="10080">7 days</option></select><input value={maxUses} onChange={(event)=>setMaxUses(event.target.value)} inputMode="numeric" placeholder="Uses · unlimited"/></div><Button onClick={createShare} disabled={shareBusy} className="bg-[#7140cd] text-white hover:bg-[#6032b8]">{shareBusy?"Creating…":"Create invite link"}</Button>{shareUrl&&<div className="flex gap-2"><input readOnly value={shareUrl} className="min-w-0 flex-1 rounded-lg border bg-[#f7f4ee] px-3 text-xs"/><Button onClick={()=>navigator.clipboard.writeText(shareUrl)}>Copy</Button></div>}<div className="mt-2 border-t border-[#ded8cd] pt-3"><p className="mb-2 text-xs font-semibold">Previous links</p>{shareLinks.length===0?<p className="text-xs text-[#8b847a]">No invitation links yet.</p>:shareLinks.map((link)=><div key={link.id} className="flex items-center justify-between border-b border-[#e9e4da] py-2 text-xs"><span>{link.role} · {link.useCount}{link.maxUses?`/${link.maxUses}`:" uses"} · {link.isActive?"active":"revoked"}</span>{link.isActive&&<button onClick={()=>revokeShare(link.id)} className="rounded p-2 text-[#9a4139]" aria-label="Revoke link"><TrashIcon/></button>}</div>)}</div></DialogContent></Dialog>
    <Dialog open={publishOpen} onOpenChange={setPublishOpen}><DialogContent className="publish-dialog border-[#d8d1c5] bg-[#fffdf8] text-[#29251f] shadow-2xl sm:max-w-lg"><DialogHeader><DialogTitle>{publication?.isActive?"Your published page":"Publish this document"}</DialogTitle><DialogDescription>{publication?.isActive?hasUnpublishedChanges?"The public snapshot is still live. Publish again when these changes are ready.":"Anyone with this link can read the current snapshot without signing in.":"Publishing creates a stable, read-only snapshot. Future edits stay private until republished."}</DialogDescription></DialogHeader>{publication?.isActive&&<div className="publication-url"><GlobeHemisphereWestIcon/><span>{publicPath}</span><button onClick={()=>void copyPublication()} aria-label="Copy public link"><CopyIcon/></button></div>}<div className="publish-preview"><span>Public reading page</span><h3>{documentName}</h3><p>{editorRef.current?.getPlainText().slice(0,180)||"The document will appear here with its typography, images, and spacing intact."}</p></div><div className="publish-actions">{publication?.isActive&&<><Button variant="outline" onClick={()=>window.open(publicPath,"_blank","noopener,noreferrer")}><ArrowSquareOutIcon/>View live</Button><Button variant="outline" onClick={()=>void unpublish()} disabled={publishBusy}>Unpublish</Button></>}<Button onClick={()=>void publish()} disabled={publishBusy||(!hasUnpublishedChanges&&Boolean(publication?.isActive))} className="bg-[#40355f] text-white hover:bg-[#302747]">{publishBusy?"Publishing…":publication?.isActive?"Republish changes":"Publish document"}</Button></div></DialogContent></Dialog>
    <SettingsModal isOpen={settingsOpen} onClose={()=>setSettingsOpen(false)} user={{name:currentUser.name,avatar:currentUser.avatar||undefined}}/>
  </div></SidebarProvider>;
}

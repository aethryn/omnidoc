"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CheckCircleIcon,
  CopyIcon,
  DotsThreeIcon,
  FilePlusIcon,
  FilesIcon,
  GearSixIcon,
  GlobeHemisphereWestIcon,
  MagnifyingGlassIcon,
  NotePencilIcon,
  SignOutIcon,
  SparkleIcon,
  TrashIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { OmnidocLogo } from "@/components/omnidoc-logo";
import { DashboardDocumentSkeletons } from "@/components/document-loading-skeletons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

const SettingsModal = dynamic(() => import("@/components/setting-modal").then((module) => module.SettingsModal), { ssr: false });
const SettingsPanel = dynamic(() => import("@/components/setting-modal").then((module) => module.SettingsPanel), { ssr: false });

type Person = { id: string; name: string; avatar?: string | null };
type Publication = { id: string; slug: string; isActive: boolean; publishedAt: string; updatedAt: string };
type DashboardDoc = {
  id: string;
  title: string;
  status: "WORKING_DRAFT" | "COMPLETE";
  previewText: string;
  previewImageUrl: string | null;
  wordCount: number;
  updatedAt: string;
  lastEditedAt: string;
  owned: boolean;
  publication: Publication | null;
  collaborators: { role: string; user: Person }[];
};
type DashboardUser = { id: string; name: string; email: string; avatar: string };
type Filter = "all" | "draft" | "complete" | "published" | "shared";

const filters: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All documents" },
  { id: "draft", label: "Working drafts" },
  { id: "complete", label: "Complete" },
  { id: "published", label: "Published" },
  { id: "shared", label: "Shared with me" },
];

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function publicationPath(doc: DashboardDoc) {
  return doc.publication ? `/p/${doc.publication.id}/${doc.publication.slug}` : "";
}

function imageSourcesForDashboard(user: DashboardUser, documents: DashboardDoc[]) {
  return Array.from(new Set([
    user.avatar,
    ...documents.flatMap((document) => [
      document.previewImageUrl,
      ...document.collaborators.map(({ user: collaborator }) => collaborator.avatar),
    ]),
  ].filter((value): value is string => Boolean(value && (/^https?:\/\//.test(value) || value.startsWith("/"))))));
}

function useImagesReady(sources: string[]) {
  const sourceKey = sources.join("\\n");
  const [ready, setReady] = useState(() => sources.length === 0);

  useEffect(() => {
    let cancelled = false;
    if (!sources.length) {
      setReady(true);
      return;
    }

    setReady(false);
    const preload = (source: string) => new Promise<void>((resolve) => {
      const image = new window.Image();
      const settle = () => resolve();
      image.onload = settle;
      image.onerror = settle;
      image.src = source;
      if (image.complete) settle();
    });
    const timeout = window.setTimeout(() => {
      if (!cancelled) setReady(true);
    }, 12_000);

    void Promise.all(sources.map(preload)).then(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [sourceKey]);

  return ready;
}

async function clearDocumentCache(documentId: string) {
  localStorage.removeItem(`document-${documentId}-backup`);
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(`omnidoc:${documentId}`);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="min-w-0 border-l border-white/15 pl-4 first:border-l-0 first:pl-0">
      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/55">{label}</p>
      <p className={`mt-2 font-[var(--font-instrument)] text-3xl leading-none ${accent || "text-white"}`}>{value}</p>
    </div>
  );
}

function AvatarStack({ collaborators }: { collaborators: DashboardDoc["collaborators"] }) {
  if (!collaborators.length) {
    return <span className="grid h-7 w-7 place-items-center rounded-full border border-[#e6e0d6] bg-[#f4f0e9] text-[#8a8177]" title="No collaborators"><UsersThreeIcon size={14} /></span>;
  }

  return (
    <div className="flex items-center pl-1">
      {collaborators.slice(0, 3).map(({ user: person }, index) => (
        <span
          className={`-ml-1.5 grid h-7 w-7 place-items-center rounded-full border-2 border-[#fffdf8] text-[9px] font-medium text-white ${index === 0 ? "bg-[#51446c]" : index === 1 ? "bg-[#826c89]" : "bg-[#8a765c]"}`}
          key={person.id}
          title={person.name}
        >
          {person.avatar?.startsWith("http") ? <img src={person.avatar} alt="" className="h-full w-full rounded-full object-cover" /> : initials(person.name)}
        </span>
      ))}
      {collaborators.length > 3 && <span className="-ml-1.5 grid h-7 w-7 place-items-center rounded-full border-2 border-[#fffdf8] bg-[#eee9e1] text-[9px] font-medium text-[#6f675e]">+{collaborators.length - 3}</span>}
    </div>
  );
}

function DocumentCard({
  doc,
  index,
  reducedMotion,
  broken,
  onImageError,
  onCopyPublicLink,
  onDelete,
  router,
}: {
  doc: DashboardDoc;
  index: number;
  reducedMotion: boolean | null;
  broken: boolean;
  onImageError: () => void;
  onCopyPublicLink: () => void;
  onDelete: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const hasImage = Boolean(doc.previewImageUrl && !broken);
  const statusComplete = doc.status === "COMPLETE";

  return (
    <motion.article
      layout
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reducedMotion ? undefined : { opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.24, delay: reducedMotion ? 0 : Math.min(index * 0.035, 0.16) }}
      className="group flex min-w-0 flex-col overflow-hidden rounded-[24px] border border-[#e4ded4] bg-[#fffdf8] shadow-[0_5px_18px_rgba(61,49,32,0.025)] transition duration-300 hover:-translate-y-1 hover:border-[#d3c9ba] hover:shadow-[0_20px_44px_rgba(61,49,32,0.09)]"
    >
      <Link href={`/document/${doc.id}`} prefetch className="block min-w-0 flex-1 text-inherit no-underline">
        <div className={`relative mx-2.5 mt-2.5 h-[194px] overflow-hidden rounded-[18px] border border-[#eee9e0] ${hasImage ? "grid grid-cols-[42%_58%] bg-[#f0ece5]" : "bg-[linear-gradient(135deg,#f2edf7_0%,#faf6ed_58%,#f1e8df_100%)]"}`}>
          {hasImage && <img src={doc.previewImageUrl || ""} alt="" className="h-full w-full object-cover" onError={onImageError} />}
          {!hasImage && <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-[#d9cce8]/45 blur-[1px]" aria-hidden="true" />}
          <div className={`relative flex min-w-0 flex-col p-4 ${hasImage ? "justify-end bg-[#fffdf8]" : "h-full justify-end"}`}>
            <div className={`absolute left-4 right-4 top-4 flex items-start justify-between gap-2 ${hasImage ? "left-3 right-3 top-3" : ""}`}>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] ${statusComplete ? "border-[#cae0d3] bg-[#eff8f1] text-[#4b7762]" : "border-[#dfd2de] bg-[#faf3f8] text-[#876879]"}`}>
                {statusComplete ? <CheckCircleIcon weight="fill" /> : <NotePencilIcon />}
                {statusComplete ? "Complete" : "Draft"}
              </span>
              <span className="rounded-full border border-white/70 bg-white/65 px-2 py-1 text-[9px] font-medium text-[#766d64] backdrop-blur-sm">{doc.owned ? "Personal" : "Shared"}</span>
            </div>
            <p className={`line-clamp-5 min-w-0 font-[var(--font-instrument)] text-[16px] leading-[1.38] ${hasImage ? "text-[#625c55]" : "text-[#51475b]"}`}>
              {doc.previewText || "A blank page, ready for the first thought."}
            </p>
          </div>
        </div>
        <div className="flex min-w-0 items-start justify-between gap-4 px-5 pb-4 pt-5">
          <div className="min-w-0">
            <h3 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[#302b27]">{doc.title || "Untitled document"}</h3>
            <p className="mt-1.5 truncate text-[11px] text-[#938a80]">{doc.owned ? "Owned by you" : "Shared with you"} <span className="mx-1 text-[#c3baae]">·</span> {formatDate(doc.lastEditedAt)}</p>
          </div>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#e9e3d9] text-[#887699] transition group-hover:border-[#d4c8df] group-hover:bg-[#f3edf8]"><ArrowUpRightIcon size={15} /></span>
        </div>
      </Link>
      <div className="flex min-w-0 items-center gap-3 border-t border-[#eee9e0] px-5 py-3.5">
        <AvatarStack collaborators={doc.collaborators} />
        <span className="truncate text-[10px] text-[#968e84]">{doc.wordCount.toLocaleString("en-US")} words</span>
        {doc.publication?.isActive && <Link href={publicationPath(doc)} className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#eef8f1] px-2.5 py-1.5 text-[10px] font-medium text-[#4f7964] no-underline" title="View published page"><GlobeHemisphereWestIcon size={13} />Live</Link>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#968e84] transition hover:bg-[#f1ece4] hover:text-[#433b35]" aria-label={`Actions for ${doc.title}`}><DotsThreeIcon weight="bold" size={17} /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 border-[#ded6ca] bg-[#fffdf8] text-[#403a35] shadow-[0_16px_36px_rgba(46,37,28,0.14)]">
            <DropdownMenuItem onClick={() => router.push(`/document/${doc.id}`)}>Open document</DropdownMenuItem>
            {doc.publication?.isActive && <>
              <DropdownMenuItem onClick={() => window.open(publicationPath(doc), "_blank", "noopener,noreferrer")}>View published page</DropdownMenuItem>
              <DropdownMenuItem onClick={onCopyPublicLink}><CopyIcon />Copy public link</DropdownMenuItem>
            </>}
            {doc.owned && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={onDelete}><TrashIcon />Delete document</DropdownMenuItem></>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.article>
  );
}

export default function DashboardClient({ user, documents: initialDocuments, greeting }: { user: DashboardUser; documents: DashboardDoc[]; greeting: string }) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [documents, setDocuments] = useState(initialDocuments);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarSettingsOpen, setSidebarSettingsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DashboardDoc | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const [creating, startCreating] = useTransition();
  const deleteInFlightRef = useRef<string | null>(null);
  const dashboardImageSources = useMemo(() => imageSourcesForDashboard(user, initialDocuments), [initialDocuments, user]);
  const imagesReady = useImagesReady(dashboardImageSources);

  const counts = useMemo(() => ({
    all: documents.length,
    draft: documents.filter((doc) => doc.status === "WORKING_DRAFT").length,
    complete: documents.filter((doc) => doc.status === "COMPLETE").length,
    published: documents.filter((doc) => doc.publication?.isActive).length,
    shared: documents.filter((doc) => !doc.owned).length,
  }), [documents]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return documents.filter((doc) => {
      const matchesQuery = `${doc.title} ${doc.previewText}`.toLowerCase().includes(normalizedQuery);
      const matchesFilter = filter === "all" || (filter === "draft" && doc.status === "WORKING_DRAFT") || (filter === "complete" && doc.status === "COMPLETE") || (filter === "published" && doc.publication?.isActive) || (filter === "shared" && !doc.owned);
      return matchesQuery && matchesFilter;
    });
  }, [documents, filter, query]);

  function createDocument() {
    startCreating(() => router.push("/document"));
  }

  async function deleteDocument() {
    if (!deleteTarget || deleteInFlightRef.current) return;
    const target = deleteTarget;
    deleteInFlightRef.current = target.id;
    setDeleteTarget(null);
    const previous = documents;
    setDocuments((items) => items.filter((item) => item.id !== target.id));
    try {
      const response = await fetch(`/api/documents/${target.id}`, { method: "DELETE" });
      if (!response.ok) {
        setDocuments(previous);
        setError("That document could not be deleted.");
        toast.error("Document could not be deleted");
      } else {
        await clearDocumentCache(target.id);
        toast.success("Document deleted");
      }
    } catch {
      setDocuments(previous);
      setError("That document could not be deleted.");
      toast.error("Document could not be deleted");
    } finally {
      deleteInFlightRef.current = null;
    }
  }

  async function copyPublicLink(doc: DashboardDoc) {
    const path = publicationPath(doc);
    if (!path) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      toast.success("Public link copied");
    } catch {
      setError("The public link could not be copied.");
    }
  }

  async function signOut() {
    try {
      await fetch("/api/auth/signout", { method: "POST", credentials: "include", cache: "no-store" });
      window.dispatchEvent(new Event("omnidoc:signed-out"));
    } finally {
      router.replace("/");
      router.refresh();
    }
  }

  return (
    <SidebarProvider defaultOpen={false} className="min-h-screen">
      <Sidebar side="left" collapsible="offcanvas" className="border-r border-[#e3ddd3] bg-[#fffdf8] md:hidden">
        <SidebarHeader className="border-b border-[#e8e2d8] p-4 pt-[calc(1rem+var(--safe-area-top))]"><div className="flex items-center justify-between"><Link href="/" className="flex items-center gap-2 font-[var(--font-instrument)] text-xl text-[#302b27]"><OmnidocLogo className="h-9 w-9"/>Omnidoc</Link><SidebarTrigger className="h-9 w-9 rounded-full"/></div></SidebarHeader>
        <SidebarContent className="bg-[#fffdf8] px-2 py-3">
          <SidebarGroup><SidebarGroupLabel className="uppercase tracking-[0.14em] text-[#8d8478]">Workspace</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton isActive className="h-11 rounded-xl px-3" onClick={()=>router.push("/dashboard")}><FilesIcon/><span>Documents</span><span className="ml-auto text-[10px]">{documents.length}</span></SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton className="h-11 rounded-xl px-3" onClick={()=>void createDocument()} disabled={creating}><FilePlusIcon/><span>{creating?"Opening…":"New document"}</span></SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><details className="group rounded-xl" onToggle={(event)=>setSidebarSettingsOpen(event.currentTarget.open)}><summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-[13px] hover:bg-sidebar-accent"><GearSixIcon/><span className="flex-1">Settings</span><span className="transition-transform group-open:rotate-180">⌄</span></summary><div className="mx-2 max-h-[65dvh] overflow-y-auto rounded-xl border border-[#e3ddd3] bg-[#fffdf8] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><SettingsPanel active={sidebarSettingsOpen} user={{name:user.name,avatar:user.avatar}} className="[&>div:first-child]:px-4 [&>div:first-child]:py-4 [&_h2]:text-2xl [&_[role=tabpanel]]:px-0"/></div></details></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton className="h-11 rounded-xl px-3 text-[#8f4039]" onClick={()=>void signOut()}><SignOutIcon/><span>Sign out</span></SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu></SidebarGroupContent></SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-[#e8e2d8] bg-[#fffdf8] p-4 pb-[calc(1rem+var(--safe-area-bottom))]"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-[#352d59] text-xs text-white">{user.avatar?.startsWith("http")?<img src={user.avatar} alt="" className="h-full w-full object-cover"/>:initials(user.name)}</span><div className="min-w-0"><p className="truncate text-xs font-medium">{user.name}</p><p className="truncate text-[10px] text-[#8c847a]">{user.email}</p></div></div></SidebarFooter>
      </Sidebar>
    <main className="min-h-screen min-w-0 flex-1 overflow-x-clip bg-[#f6f3ed] text-[#29251f] md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] flex-col border-r border-[#e5dfd5] bg-[#fffdf8] px-5 py-6 md:flex">
        <div className="flex items-center justify-between"><Link href="/" aria-label="Omnidoc home" className="flex items-center gap-2.5 font-[var(--font-instrument)] text-[22px] font-normal tracking-[-0.03em] text-[#302b27] no-underline"><OmnidocLogo priority className="h-8 w-8" />Omnidoc</Link><span className="rounded-full bg-[#f1edf7] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#73618b]">Beta</span></div>
        <button onClick={createDocument} disabled={creating} className="mt-9 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#40355f] px-3 text-[12px] font-semibold text-white shadow-[0_12px_24px_rgba(64,53,95,0.18)] transition hover:bg-[#33284f] disabled:cursor-wait disabled:opacity-65"><FilePlusIcon size={16} />{creating ? "Opening…" : "New document"}</button>
        <nav className="mt-8 space-y-1" aria-label="Workspace navigation"><p className="mb-3 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#a39a8f]">Workspace</p><button className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-[#f0ebf6] px-3 text-left text-[12px] font-semibold text-[#40355f]" aria-current="page"><FilesIcon className="h-5 w-5" />Documents<span className="ml-auto rounded-full bg-white/75 px-2 py-0.5 text-[10px] font-medium">{documents.length}</span></button><button onClick={() => setFilter("shared")} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[12px] text-[#756d63] transition hover:bg-[#f5f1eb] hover:text-[#40355f]"><UsersThreeIcon size={19} />Shared with me<span className="ml-auto text-[10px] text-[#a39a8f]">{counts.shared}</span></button></nav>
        <div className="mt-auto rounded-2xl border border-[#eee8de] bg-[#faf7f1] p-3.5"><div className="flex items-center gap-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-[#403a35] text-[10px] font-semibold text-white">{user.avatar?.startsWith("http") ? <img src={user.avatar} alt="" className="h-full w-full object-cover" /> : initials(user.name)}</span><div className="min-w-0"><p className="truncate text-[11px] font-semibold text-[#403a35]">{user.name}</p><p className="mt-0.5 truncate text-[9px] text-[#988f84]">{user.email}</p></div></div><div className="mt-3 flex gap-1 border-t border-[#eae3d9] pt-2"><button onClick={() => setSettingsOpen(true)} className="flex min-h-9 flex-1 items-center gap-2 rounded-lg px-2 text-[10px] text-[#81786f] hover:bg-[#f0ebe4]" aria-label="Settings"><GearSixIcon size={15} />Settings</button><button onClick={signOut} className="grid h-9 w-9 place-items-center rounded-lg text-[#81786f] hover:bg-[#f0ebe4]" aria-label="Sign out"><SignOutIcon size={15} /></button></div></div>
      </aside>

      <div className="min-w-0 px-4 pb-10 sm:px-8 md:col-start-2 md:px-10 md:pb-16 lg:px-16 xl:px-20">
        <header className="flex h-[72px] items-center justify-between border-b border-[#e5dfd5] md:h-[82px]"><div className="flex items-center gap-2 md:hidden"><SidebarTrigger className="h-9 w-9 rounded-full"/><Link href="/" className="flex items-center gap-2 font-[var(--font-instrument)] text-[20px] tracking-[-0.03em] text-[#302b27] no-underline"><OmnidocLogo className="h-7 w-7" />Omnidoc</Link></div><div className="hidden items-center gap-2 text-[11px] font-medium text-[#978e83] md:flex"><span className="h-2 w-2 rounded-full bg-[#7aa98a]" />Workspace <span className="text-[#c8c0b6]">/</span> Documents</div><div className="flex min-w-0 items-center gap-3"><span className="hidden max-w-[240px] truncate text-[11px] text-[#81786f] sm:block">{user.name}</span><span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[#2d2924] text-[10px] font-semibold text-white ring-4 ring-[#eee9e1]">{user.avatar?.startsWith("http") ? <img src={user.avatar} alt="" className="h-full w-full object-cover" /> : initials(user.name)}</span></div></header>

        <section className="relative mt-6 overflow-hidden rounded-[28px] bg-[#40355f] px-6 py-7 text-white shadow-[0_22px_55px_rgba(64,53,95,0.16)] sm:px-9 sm:py-9 lg:px-11 lg:py-10"><div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border-[34px] border-white/5" aria-hidden="true" /><div className="pointer-events-none absolute bottom-[-84px] right-[24%] h-48 w-48 rounded-full bg-[#8a76ad]/20 blur-2xl" aria-hidden="true" /><div className="relative flex flex-col justify-between gap-8 lg:flex-row lg:items-end"><div><span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d3c7e7]">Your workspace</span><h1 className="mt-4 max-w-[680px] font-[var(--font-instrument)] text-[clamp(40px,6vw,70px)] font-normal leading-[0.92] tracking-[-0.055em]">Good {greeting},<br /><i className="font-normal text-[#d8cceb]">{user.name.split(" ")[0]}.</i></h1><p className="mt-5 max-w-[480px] text-[13px] leading-6 text-white/65">A calm home for the ideas you are shaping, sharing, and ready to publish.</p></div><button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-[12px] font-semibold text-[#40355f] shadow-[0_10px_24px_rgba(18,13,30,0.14)] transition hover:bg-[#f6f1ff] lg:w-auto" onClick={createDocument} disabled={creating}><FilePlusIcon size={17} />{creating ? "Opening…" : "Start a new document"}<ArrowRightIcon size={16} /></button></div><div className="relative mt-9 grid grid-cols-2 gap-y-7 border-t border-white/15 pt-6 sm:grid-cols-4 sm:gap-y-0"><Stat label="All documents" value={counts.all} /><Stat label="Working drafts" value={counts.draft} accent="text-[#e4c8d4]" /><Stat label="Complete" value={counts.complete} accent="text-[#bfe1ca]" /><Stat label="Published" value={counts.published} accent="text-[#d7c9f1]" /></div></section>

        <section className="mt-10"><div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8a759d]">Your library</p><div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1"><h2 className="font-[var(--font-instrument)] text-[34px] font-normal leading-none tracking-[-0.04em] text-[#312c27]">All your work, together.</h2><span className="text-[11px] text-[#9b9288]">{documents.length} {documents.length === 1 ? "document" : "documents"}</span></div></div><label className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-[#ddd6cb] bg-[#fffdf8] px-3.5 text-[#92897f] shadow-[0_4px_12px_rgba(62,50,35,0.025)] transition focus-within:border-[#8d79a5] focus-within:ring-4 focus-within:ring-[#6c5788]/10 xl:w-[300px]"><MagnifyingGlassIcon size={16} /><input className="min-w-0 w-full border-0 bg-transparent text-[11px] text-[#403a35] outline-none placeholder:text-[#a59d93]" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents" aria-label="Search documents" /></label></div>
          <div className="mt-6 flex items-center gap-3"><div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Filter documents">{filters.map((item) => <button className="flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-[10px] font-medium transition aria-selected:border-[#d8cce3] aria-selected:bg-[#eee9f5] aria-selected:text-[#4c3d63] aria-selected:shadow-sm border-transparent text-[#81786f] hover:bg-[#f0ebe4]" key={item.id} role="tab" aria-selected={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span className="rounded-full bg-[#f2eee7] px-1.5 py-0.5 text-[9px] tabular-nums">{counts[item.id]}</span></button>)}</div><span className="hidden shrink-0 text-[10px] text-[#a0978c] sm:block">Showing {filtered.length}</span></div>
          {error && <div role="alert" className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-[#f0c8c0] bg-[#fff0ec] px-4 py-3 text-[11px] text-[#95392f]">{error}<button className="min-h-8 underline" onClick={() => setError(null)}>Dismiss</button></div>}
          <div className="mt-5 grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">{imagesReady ? <AnimatePresence mode="popLayout">{filtered.map((doc, index) => <DocumentCard key={doc.id} doc={doc} index={index} reducedMotion={reducedMotion} broken={brokenImages.has(doc.id)} onImageError={() => setBrokenImages((items) => new Set(items).add(doc.id))} onCopyPublicLink={() => void copyPublicLink(doc)} onDelete={() => setDeleteTarget(doc)} router={router} />)}</AnimatePresence> : <DashboardDocumentSkeletons />}</div>{imagesReady && !filtered.length && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 flex min-h-[300px] flex-col items-center justify-center rounded-[24px] border border-dashed border-[#d6cec1] bg-[#fffdf8]/60 px-6 text-center"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#eee9f5] text-[#76648d]"><SparkleIcon size={24} weight="duotone" /></span><h3 className="mt-5 font-[var(--font-instrument)] text-[30px] font-normal tracking-[-0.03em] text-[#403a35]">{query ? "Nothing matches that search" : filter === "all" ? "A clean page is waiting" : `No ${filters.find((item) => item.id === filter)?.label.toLowerCase()} yet`}</h3><p className="mt-2 max-w-sm text-[12px] leading-5 text-[#857c72]">{query ? "Try another title or phrase." : "Start a document and it will appear here as soon as the first thought lands."}</p>{!query && filter === "all" && <button className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#40355f] px-4 text-[11px] font-semibold text-white transition hover:bg-[#33284f]" onClick={createDocument}>Open a blank page <ArrowRightIcon size={14} /></button>}</motion.div>}
        </section>
      </div>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}><AlertDialogContent className="border-[#ded6ca] bg-[#fffdf8]"><AlertDialogHeader><AlertDialogTitle>Delete this document?</AlertDialogTitle><AlertDialogDescription>“{deleteTarget?.title || "Untitled document"}” and its uploaded images will be permanently removed.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep document</AlertDialogCancel><AlertDialogAction onClick={() => void deleteDocument()} className="bg-[#9a4139] hover:bg-[#81352f]">Delete document</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} user={{ name: user.name, avatar: user.avatar }} />
    </main>
    </SidebarProvider>
  );
}

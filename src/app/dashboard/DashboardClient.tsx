"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRightIcon, FilePlusIcon, GearSixIcon, MagnifyingGlassIcon, SignOutIcon, SparkleIcon, TrashIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { DocumentsFolderIcon, OmnidocLogo } from "@/components/omnidoc-logo";
import { createClient } from "@/lib/supabase/client";
import "./dashboard.css";

const SettingsModal=dynamic(()=>import("@/components/setting-modal").then((module)=>module.SettingsModal),{ssr:false});

type Person = { id: string; name: string; avatar?: string | null };
type DashboardDoc = { id: string; title: string; updatedAt: string; lastEditedAt: string; owned: boolean; collaborators: { role: string; user: Person }[] };
type DashboardUser = { id: string; name: string; email: string; avatar: string };

function initials(name: string) { return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value));
}

export default function DashboardClient({ user, documents: initialDocuments, greeting }: { user: DashboardUser; documents: DashboardDoc[]; greeting:string }) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creating, startCreating] = useTransition();

  const filtered = useMemo(() => documents.filter((doc) => doc.title.toLowerCase().includes(query.trim().toLowerCase())), [documents, query]);

  function createDocument() {
    startCreating(async () => {
      setError(null);
      router.push("/document");
    });
  }

  async function deleteDocument(id: string, title: string) {
    if (!window.confirm(`Delete “${title || "Untitled document"}”?`)) return;
    const previous = documents;
    setDocuments((items) => items.filter((item) => item.id !== id));
    const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (!response.ok) { setDocuments(previous); setError("That document could not be deleted."); }
  }

  async function signOut() {
    await createClient().auth.signOut({ scope:"local" });
    router.replace("/signin");
    router.refresh();
  }

  return (
    <main className="dash-page">
      <aside className="dash-rail">
        <Link href="/" className="dash-mark" aria-label="Omnidoc"><OmnidocLogo priority className="dash-logo-image" /></Link>
        <nav>
          <button className="active" aria-label="Documents folder"><DocumentsFolderIcon className="documents-folder-icon" /></button>
          <button onClick={() => setSettingsOpen(true)} aria-label="Settings"><GearSixIcon /></button>
        </nav>
        <button onClick={signOut} aria-label="Sign out"><SignOutIcon /></button>
      </aside>

      <div className="dash-content">
        <header className="dash-header">
          <Link href="/" className="dash-wordmark"><OmnidocLogo className="dash-wordmark-logo" />Omnidoc</Link>
          <div className="dash-user"><span>{user.name}</span><div>{user.avatar?.startsWith("http") ? <img src={user.avatar} alt="" /> : initials(user.name)}</div></div>
        </header>

        <section className="dash-hero">
          <div><span className="dash-eyebrow">Your writing room</span><h1>Good {greeting},<br /><i>{user.name.split(" ")[0]}.</i></h1><p>Pick up a thought, begin with a blank page, or invite someone into the margins.</p></div>
          <button className="dash-new" onClick={createDocument} disabled={creating}><FilePlusIcon weight="bold" />{creating ? "Opening…" : "New document"}<ArrowRightIcon /></button>
        </section>

        <section className="dash-library">
          <div className="dash-library-head"><div><h2>Recent documents</h2><span>{documents.length} {documents.length === 1 ? "document" : "documents"}</span></div><label><MagnifyingGlassIcon /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your work" /></label></div>
          {error && <div role="alert" className="dash-error">{error}<button onClick={() => setError(null)}>Dismiss</button></div>}
          <AnimatePresence mode="popLayout">
            {filtered.length ? <motion.div layout className="dash-grid">{filtered.map((doc, index) => (
              <motion.article layout key={doc.id} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ duration:.22, delay:Math.min(index * .025, .15) }} className="dash-doc">
                <Link href={`/document/${doc.id}`} prefetch className="dash-doc-link">
                  <div className="dash-page-preview"><span /><span /><span className="short" /><em>Continue writing…</em></div>
                  <div className="dash-doc-meta"><div><h3>{doc.title || "Untitled document"}</h3><p>{doc.owned ? "Owned by you" : "Shared with you"} · {formatDate(doc.lastEditedAt)}</p></div><ArrowRightIcon /></div>
                </Link>
                <div className="dash-doc-foot"><div className="dash-avatars">{doc.collaborators.slice(0,3).map(({ user: person }) => <span key={person.id} title={person.name}>{initials(person.name)}</span>)}{!doc.collaborators.length && <span className="solo"><UsersThreeIcon /></span>}</div>{doc.owned && <button onClick={() => deleteDocument(doc.id, doc.title)} aria-label={`Delete ${doc.title}`}><TrashIcon /></button>}</div>
              </motion.article>
            ))}</motion.div> : <motion.div initial={{opacity:0}} animate={{opacity:1}} className="dash-empty"><SparkleIcon weight="duotone" /><h3>{query ? "Nothing by that name" : "A clean page is waiting"}</h3><p>{query ? "Try a different title." : "Start writing now. We’ll save the document the moment it becomes yours."}</p>{!query && <button onClick={createDocument}>Open a blank page</button>}</motion.div>}
          </AnimatePresence>
        </section>
      </div>
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} user={{ name:user.name, avatar:user.avatar }} />
    </main>
  );
}

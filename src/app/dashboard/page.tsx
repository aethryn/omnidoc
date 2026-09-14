"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Doc = { id: string; title: string; updatedAt: string; lastEditedAt: string; collaborators?: { user: { name: string; avatar?: string } }[] };
type User = { name: string; email: string; avatar?: string };

const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    const [userResponse, docsResponse] = await Promise.all([fetch("/api/auth/user-details"), fetch("/api/documents")]);
    if (userResponse.ok) setUser(await userResponse.json());
    if (docsResponse.ok) setDocuments(await docsResponse.json());
    else setError("We couldn’t load your documents.");
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function createDocument() {
    setCreating(true); setError(null);
    const response = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Untitled document", content: JSON.stringify({ type: "doc", content: [] }) }) });
    if (response.ok) router.push(`/document/${(await response.json()).id}`);
    else setError("Couldn’t create the document. Please try again.");
    setCreating(false);
  }
  async function signOut() { await fetch("/api/auth/signout", { method: "POST" }); router.push("/signin"); }
  async function deleteDocument(id: string, title: string) {
    if (!window.confirm(`Delete “${title || "Untitled document"}”?`)) return;
    const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (response.ok) setDocuments((items) => items.filter((item) => item.id !== id));
    else setError("Couldn’t delete the document.");
  }
  const filtered = useMemo(() => documents.filter((doc) => doc.title.toLowerCase().includes(query.toLowerCase())), [documents, query]);

  return <main className="min-h-screen bg-[#f8fafc] px-5 py-6 text-slate-900 sm:px-10 lg:px-16">
    <header className="mx-auto flex max-w-6xl items-center justify-between">
      <button onClick={() => router.push("/")} className="text-lg font-semibold tracking-tight">Omnidoc<span className="text-blue-600">.</span></button>
      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-slate-500 sm:block">{user?.name || "Your workspace"}</span>
        <button onClick={signOut} className="rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:bg-white hover:text-slate-900">Sign out</button>
      </div>
    </header>
    <section className="mx-auto max-w-6xl pb-16 pt-16">
      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div><p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">Your workspace</p><h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Good to see you{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.</h1><p className="mt-3 text-slate-500">A quiet place for your best work.</p></div>
        <button onClick={createDocument} disabled={creating} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-slate-900/10 transition hover:bg-blue-700 disabled:opacity-50">{creating ? "Creating…" : "+ New document"}</button>
      </div>
      <div className="mt-12 flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-lg font-semibold">Documents <span className="ml-1 text-sm font-normal text-slate-400">{documents.length}</span></h2><input aria-label="Search documents" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents…" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:w-64" /></div>
      {error && <div role="alert" className="mt-6 flex items-center justify-between rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={load} className="font-medium underline">Retry</button></div>}
      {loading ? <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[1,2,3].map((item) => <div key={item} className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}</div> : filtered.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center"><p className="text-lg font-medium">{query ? "No matching documents" : "Your first document starts here"}</p><p className="mt-2 text-sm text-slate-500">{query ? "Try another search term." : "Create a blank page and make it yours."}</p>{!query && <button onClick={createDocument} className="mt-6 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">Create document</button>}</div> : <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((doc) => <article key={doc.id} className="group relative rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-900/5"><button onClick={() => router.push(`/document/${doc.id}`)} className="block w-full text-left"><div className="mb-8 flex items-start justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600">✦</span><span className="text-xs text-slate-400">{formatDate(doc.lastEditedAt || doc.updatedAt)}</span></div><h3 className="truncate font-medium">{doc.title || "Untitled document"}</h3><p className="mt-1 text-xs text-slate-400">{doc.collaborators?.length ? `${doc.collaborators.length} collaborator${doc.collaborators.length === 1 ? "" : "s"}` : "Only you"}</p></button><button aria-label={`Delete ${doc.title}`} onClick={() => deleteDocument(doc.id, doc.title)} className="absolute bottom-4 right-4 rounded-lg px-2 py-1 text-xs text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100">Delete</button></article>)}</div>}
    </section>
  </main>;
}


import { Suspense } from "react";
import DocumentEditorClient from "../DocumentEditorClient";

export default async function DocumentByIdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<div className="grid min-h-screen place-items-center text-slate-500">Loading document…</div>}><DocumentEditorClient initialDocumentId={id} /></Suspense>;
}


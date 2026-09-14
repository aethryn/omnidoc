import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr/ArrowLeft";
import { DocumentsFolderIcon, OmnidocLogo } from "@/components/omnidoc-logo";
import "./not-found.css";

export default function NotFound() {
  return <main className="not-found-page">
    <div className="not-found-glow" />
    <Link href="/" className="not-found-brand"><OmnidocLogo priority className="not-found-logo" />Omnidoc</Link>
    <section className="not-found-card">
      <div className="not-found-folder"><DocumentsFolderIcon /></div>
      <span>404 · Page not found</span>
      <h1>This page slipped<br />out of the folder.</h1>
      <p>The link may be old, the document may have moved, or this page simply never existed.</p>
      <div><Link href="/dashboard" className="not-found-primary">Open documents</Link><Link href="/" className="not-found-secondary"><ArrowLeftIcon /> Back home</Link></div>
    </section>
    <p className="not-found-foot">Your work is still exactly where you left it.</p>
  </main>;
}

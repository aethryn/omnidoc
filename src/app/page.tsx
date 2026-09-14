import Link from "next/link";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr/ArrowUpRight";
import { LightningIcon } from "@phosphor-icons/react/dist/ssr/Lightning";
import { ShieldCheckIcon } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { SparkleIcon } from "@phosphor-icons/react/dist/ssr/Sparkle";
import { UsersThreeIcon } from "@phosphor-icons/react/dist/ssr/UsersThree";
import { OmnidocLogo } from "@/components/omnidoc-logo";
import "./marketing.css";

export default function LandingPage() {
  return (
    <main className="marketing-page">
      <nav className="marketing-nav">
        <Link href="/" className="marketing-brand"><OmnidocLogo priority className="marketing-brand-logo" />Omnidoc</Link>
        <div className="marketing-links"><a href="#product">Product</a><a href="#collaboration">Collaboration</a><a href="#security">Security</a></div>
        <div className="marketing-actions"><Link href="/signin">Sign in</Link><Link href="/signup" className="marketing-button small">Start writing <ArrowUpRightIcon size={14} /></Link></div>
      </nav>
      <section className="marketing-hero">
        <div className="hero-copy">
          <div className="eyebrow"><span /> The thoughtful writing space</div>
          <h1>Where good ideas<br /><em>become clear.</em></h1>
          <p>Write, refine, and decide together in a document workspace that feels calm—even when the work is moving fast.</p>
          <div className="hero-actions"><Link href="/signup" className="marketing-button">Start a document <ArrowUpRightIcon size={16} /></Link><a href="#product" className="text-link">See how it works <span>↓</span></a></div>
          <div className="hero-proof"><span className="proof-avatars"><i>AK</i><i>JM</i><i>+8</i></span><p><strong>Built for shared thinking.</strong><br />No setup, no learning curve.</p></div>
        </div>
        <div className="hero-document" aria-label="Omnidoc editor preview">
          <div className="preview-top"><OmnidocLogo className="preview-logo-image" /><span>Product narrative</span><span className="preview-status">● Saved</span><span className="preview-people"><i>AK</i><i>JM</i></span></div>
          <div className="preview-paper">
            <span className="preview-kicker">WORKING DRAFT</span><h2>Clarity is a<br />team sport.</h2>
            <p className="preview-deck">A shared space for the thinking behind the work.</p><div className="preview-rule" />
            <p>Strong documents don’t simply collect words. They help a team see the same problem, understand the tradeoffs, and move with confidence.</p>
            <p>That means the editor should get out of the way—until you need a second mind.</p>
            <div className="preview-selection">Make the ending more decisive.</div>
            <div className="preview-ghost">The next decision should feel inevitable, not merely possible.<span>AI PROPOSAL</span></div>
          </div>
          <div className="preview-assistant"><SparkleIcon size={13} weight="fill" /><div><b>Omni</b><p>I tightened the closing thought. Preview it in gray, then accept when it feels right.</p></div></div>
        </div>
      </section>
      <section id="product" className="marketing-statement"><p>Less interface. More momentum.</p><h2>A document editor with<br />good taste and a second brain.</h2></section>
      <section className="feature-grid">
        <article className="feature-card large" id="collaboration"><div className="feature-icon"><UsersThreeIcon size={22} /></div><span>01 — TOGETHER</span><h3>Everyone on the same page. Literally.</h3><p>Live cursors, clear roles, and secure invite links keep collaboration close to the work.</p><div className="collab-demo"><span className="cursor-line one">Asha is editing</span><span className="cursor-line two">Jonas is here</span></div></article>
        <article className="feature-card"><div className="feature-icon"><SparkleIcon size={21} /></div><span>02 — INTELLIGENT</span><h3>AI edits you can see before they land.</h3><p>Bring Gemini or Grok. Every suggestion stays ghosted until you approve it.</p></article>
        <article className="feature-card" id="security"><div className="feature-icon"><ShieldCheckIcon size={22} /></div><span>03 — YOURS</span><h3>Your keys. Your documents. Your call.</h3><p>Provider keys stay encrypted, access stays explicit, and suggestions are never silently applied.</p></article>
        <article className="feature-card large dark"><div className="feature-icon"><LightningIcon size={22} /></div><span>04 — FAST</span><h3>Designed to feel immediate.</h3><p>Server-rendered pages, local-first editing, and background collaboration mean the canvas is ready before the network is.</p><Link href="/signup">Open your workspace <ArrowUpRightIcon size={16} /></Link></article>
      </section>
      <section className="marketing-cta"><SparkleIcon size={21} weight="fill" /><h2>Put the idea on paper.</h2><p>Your next useful document is one quiet page away.</p><Link href="/signup" className="marketing-button light">Start writing for free <ArrowUpRightIcon size={16} /></Link></section>
      <footer className="marketing-footer"><span>Omnidoc</span><p>Write together, thoughtfully.</p><span>© 2026</span></footer>
    </main>
  );
}

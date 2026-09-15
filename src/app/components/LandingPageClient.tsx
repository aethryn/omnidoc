"use client";

import Link from "next/link";
import { useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight as ArrowUpRightIcon,
  Sparkle as SparkleIcon,
  GithubLogo as GithubLogoIcon,
  EnvelopeSimple as EnvelopeSimpleIcon,
} from "@phosphor-icons/react";
import { OmnidocLogo } from "@/components/omnidoc-logo";

/* ─── Smooth-scroll anchor handler ──────────────────────────── */
function useSmoothScroll() {
  return useCallback((e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const el = document.querySelector(href);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      // Update URL hash without jumping
      window.history.pushState(null, "", href);
    }
  }, []);
}

/* ─── Shared animation variants ─────────────────────────────── */
const fadeUp = {
  hidden: { opacity: 0, y: 30, filter: "blur(8px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
  },
};

const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 },
  },
};

/* ═══════════════════════════════════════════════════════════════
   LANDING PAGE CLIENT
   ═══════════════════════════════════════════════════════════════ */

export default function LandingPageClient() {
  const mainRef = useRef<HTMLDivElement>(null);
  const handleAnchor = useSmoothScroll();

  return (
    <main
      ref={mainRef}
      className="relative min-h-screen text-[#1C1917] overflow-x-hidden"
      style={{ background: "#F5F3EE" }}
    >
      {/* ─── FLOATING NAVBAR ─────────────────────────────────── */}
      <nav className="landing-nav fixed left-1/2 -translate-x-1/2 z-50 top-4">
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-full bg-white/80 backdrop-blur-xl border border-white/50 shadow-lg shadow-black/10"
        >
          <Link
            href="/"
            className="flex items-center gap-1.5 px-2 py-1 rounded-full hover:bg-black/5 transition-colors"
          >
            <OmnidocLogo
              priority
              className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg"
            />
            <span className="text-[14px] sm:text-[15px] font-serif">
              Omnidoc
            </span>
          </Link>

          <div className="hidden sm:flex items-center">
            <a
              href="#features"
              onClick={(e) => handleAnchor(e, "#features")}
              className="px-3 py-1.5 rounded-full text-[13px] text-[#57534E] hover:text-[#1C1917] hover:bg-black/5 transition-colors"
            >
              Features
            </a>
            <a
              href="#product"
              onClick={(e) => handleAnchor(e, "#product")}
              className="px-3 py-1.5 rounded-full text-[13px] text-[#57534E] hover:text-[#1C1917] hover:bg-black/5 transition-colors"
            >
              Product
            </a>
          </div>

          <Link
            href="/signup"
            className="relative overflow-hidden px-3 sm:px-4 py-1.5 rounded-full text-[12px] sm:text-[13px] font-medium text-white flex items-center gap-1.5 whitespace-nowrap transition-opacity duration-200 hover:opacity-90 active:scale-[0.96]"
            style={{
              background:
                "linear-gradient(180deg, #5B32AB 0%, #352D59 100%)",
              boxShadow:
                "0 1px 0 #1C1917, 0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
            }}
          >
            Start writing
          </Link>
        </motion.div>
      </nav>

      {/* ─── HERO ────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center px-4 pt-28 sm:pt-32 pb-4">
        {/* ImagesBadge */}
        {/* <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <ImagesBadge
            text="Introducing Omnidoc — Collaborative Writing"
            images={[
              "https://assets.aceternity.com/pro/agenforce-1.webp",
              "https://assets.aceternity.com/pro/agenforce-2.webp",
              "https://assets.aceternity.com/pro/agenforce-3.webp",
            ]}
          />
        </motion.div> */}

        {/* Title */}
        <h1 className="relative z-10 text-center max-w-4xl mt-8">
          <motion.span
            initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{
              duration: 0.8,
              ease: [0.22, 1, 0.36, 1],
              delay: 0.4,
            }}
            className="block text-[clamp(44px,7vw,84px)] font-serif leading-[1.05] tracking-[-0.02em]"
          >
            Where good ideas
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{
              duration: 0.8,
              ease: [0.22, 1, 0.36, 1],
              delay: 0.55,
            }}
            className="block text-[clamp(44px,7vw,84px)] font-serif leading-[1.05] tracking-[-0.02em] text-[#A8A29E]"
          >
            become clear.
          </motion.span>
        </h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 15, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, delay: 0.7 }}
          className="relative z-10 mt-4 sm:mt-6 text-[15px] sm:text-[18px] text-[#57534E] text-center max-w-xl leading-relaxed px-4"
        >
          Write, refine, and decide together in a document workspace that feels
          calm—even when the work is moving fast.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 15, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, delay: 0.85 }}
          className="relative z-20 flex flex-col sm:flex-row items-center gap-4 mt-8"
        >
          <Link
            href="/signup"
            className="relative overflow-hidden px-8 py-4 rounded-2xl text-[16px] font-semibold text-white flex items-center gap-3 active:scale-[0.96] transition-transform"
            style={{
              background:
                "linear-gradient(180deg, #5B32AB 0%, #352D59 100%)",
              boxShadow:
                "0 1px 0 #1C1917, 0 4px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.15)",
            }}
          >
            Start a document
            <ArrowUpRightIcon size={18} weight="bold" />
          </Link>
          <a
            href="#product"
            onClick={(e) => handleAnchor(e, "#product")}
            className="text-[14px] text-[#57534E] hover:text-[#1C1917] transition-colors flex items-center gap-1.5"
          >
            See how it works <span className="text-lg">↓</span>
          </a>
        </motion.div>

        {/* Social proof */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.0 }}
          className="mt-8 flex items-center gap-3"
        >
          <div className="flex -space-x-2">
            {["#75668d", "#a46571", "#66758e", "#7944da"].map((bg, i) => (
              <div
                key={i}
                className="w-7 h-7 rounded-full border-2 border-[#F5F3EE] flex items-center justify-center text-[9px] font-bold text-white"
                style={{ backgroundColor: bg }}
              >
                {["AK", "JM", "SP", "+8"][i]}
              </div>
            ))}
          </div>
          <p className="text-[12px] text-[#78716C]">
            <strong className="text-[#57534E]">Built for shared thinking.</strong>{" "}
            No setup, no learning curve.
          </p>
        </motion.div>
      </section>

      {/* ─── EDITOR PREVIEW ──────────────────────────────────── */}
      <section className="relative pt-2 pb-12 sm:pt-4 sm:pb-20 px-4 sm:px-6 overflow-hidden">
        <div className="relative max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="relative rounded-xl sm:rounded-2xl lg:rounded-3xl overflow-hidden"
            style={{
              background: "#0a0a0a",
              aspectRatio: "16/9",
              boxShadow:
                "0 0 0 1px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.1), 0 12px 40px rgba(0,0,0,0.12)",
            }}
          >
            <video
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            >
              <source src="/videos/omnidocs.mp4" type="video/mp4" />
            </video>
          </motion.div>
        </div>
      </section>

      {/* ─── STATEMENT ───────────────────────────────────────── */}
      <section id="product" className="scroll-mt-20 py-16 sm:py-24 px-4 sm:px-6">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="max-w-4xl mx-auto text-center"
        >
          <motion.p
            variants={fadeUp}
            className="text-[#7b4ac6] text-[10px] font-bold tracking-[0.15em] uppercase"
          >
            Less interface. More momentum.
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="mt-4 font-serif text-[clamp(36px,5.5vw,64px)] leading-[1] tracking-[-0.03em]"
          >
            A document editor with
            <br />
            <span className="text-[#A8A29E]">
              good taste and a second brain.
            </span>
          </motion.h2>
        </motion.div>
      </section>

      {/* ─── FEATURE FIELD ───────────────────────────────────── */}
      {/* <section id="features" className="scroll-mt-20 py-20 sm:py-28 px-4 sm:px-6">
        <motion.div variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} className="max-w-4xl mx-auto">
          <motion.div variants={fadeUp} className="text-center mb-16 sm:mb-20">
            <p className="text-[#7b4ac6] text-[10px] font-bold tracking-[0.15em] uppercase mb-4">
              Everything you need
            </p>
            <h2 className="font-serif text-[clamp(36px,5.5vw,64px)] leading-[1] tracking-[-0.03em]">
              A workspace built for the
              <br />
              <span className="text-[#A8A29E]">way ideas actually move.</span>
            </h2>
          </motion.div>

          <div className="space-y-0">
            {[
              ["AI writing that keeps the author's voice.", "Omni suggests — you decide what stays. Your tone, your call."],
              ["Text-to-speech for thoughtful review.", "Hear your writing aloud to catch what the eye misses."],
              ["Speech-to-text for ideas at speaking speed.", "Dictate naturally and let Omnidoc shape the words."],
              ["Live collaboration with presence and invite links.", "See who's editing, where they are, in real time."],
              ["Exports to .md, .pdf, and .docx.", "One click to share in the format your team needs."],
              ["A focused canvas for drafts and decisions.", "No clutter, no toolbars — just the page and your thoughts."],
            ].map(([title, desc], index) => (
              <motion.div key={title} variants={fadeUp} className="group flex items-start gap-6 border-t border-[#E7E5E4] py-7 sm:py-9">
                <span className="mt-1 w-7 shrink-0 text-[13px] tabular-nums text-[#A8A29E]">0{index + 1}</span>
                <div>
                  <p className="text-[clamp(18px,2.5vw,26px)] font-serif leading-[1.15] tracking-[-0.02em] group-hover:text-[#57534E] transition-colors duration-300">{title}</p>
                  <p className="mt-2 text-[14px] text-[#78716C] leading-relaxed max-w-lg">{desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section> */}

      {/* ─── COMPARISON SECTION ──────────────────────────────── */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="max-w-4xl mx-auto"
        >
          <motion.p
            variants={fadeUp}
            className="text-center text-3xl sm:text-5xl font-serif mb-12 sm:mb-16"
          >
            Stop formatting. Start thinking.
          </motion.p>

          <div className="space-y-4 sm:space-y-6">
            {[
              ["Fiddling with toolbar ribbons", "Clean, distraction-free editing"],
              ['"Is this the latest version?"', "Single source of truth, always"],
              ["Emailing docs back and forth", "Live cursors, instant collaboration"],
              ["Waiting for AI to overwrite your work", "Ghosted suggestions you approve"],
              ["Switching between five different apps", "Everything in one calm workspace"],
            ].map(([before, after], i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className="group flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-8 text-center cursor-default"
              >
                <span className="sm:flex-1 sm:text-right text-[16px] sm:text-[clamp(18px,2.5vw,24px)] text-[#A8A29E] line-through decoration-[#D6D3D1] decoration-1 sm:decoration-2 group-hover:text-[#D6D3D1] transition-colors duration-300">
                  {before}
                </span>
                <span className="text-[#78716C] text-[20px] sm:text-[24px] font-light group-hover:translate-x-1 transition-transform duration-300 rotate-90 sm:rotate-0">
                  →
                </span>
                <span className="sm:flex-1 sm:text-left text-[16px] sm:text-[clamp(18px,2.5vw,24px)] font-medium group-hover:text-[#57534E] transition-colors duration-300">
                  {after}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ─── FINAL CTA ───────────────────────────────────────── */}
      <section className="py-20 sm:py-28 px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="max-w-lg mx-auto text-center"
        >
          <motion.div variants={fadeUp}>
            <SparkleIcon
              size={21}
              weight="fill"
              className="mx-auto text-[#7944da] mb-4"
            />
          </motion.div>
          <motion.h2
            variants={fadeUp}
            className="font-serif text-[clamp(42px,6vw,72px)] leading-[0.95] tracking-[-0.03em]"
          >
            Put the idea on paper.
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mt-4 text-[#57534E] text-[15px]"
          >
            Your next useful document is one quiet page away.
          </motion.p>
          <motion.div variants={fadeUp}>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 mt-8 px-8 py-4 rounded-2xl text-[15px] font-semibold bg-white text-[#352d59] shadow-lg shadow-black/5 border border-[#E7E5E4] hover:shadow-xl hover:-translate-y-0.5 transition-all active:scale-[0.97]"
            >
              Start writing for free
              <ArrowUpRightIcon size={16} />
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* ─── FOOTER ──────────────────────────────────────────── */}
      <footer className="py-8 sm:py-12 px-4 sm:px-6 border-t border-[#E7E5E4]/60">
        <div className="max-w-6xl mx-auto flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2.5">
            <OmnidocLogo className="w-6 h-6 rounded-lg" />
            <span className="text-[14px] font-serif">Omnidoc</span>
            <span className="text-[13px] text-[#A8A29E]">
              · Write together, thoughtfully
            </span>
          </div>
          <div className="flex items-center gap-6">
            <a
              href="https://github.com/aethryn/omnidoc/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[13px] text-[#78716C] hover:text-[#1C1917] transition-colors"
            >
              <GithubLogoIcon size={16} />
              GitHub
            </a>
            <a
              href="mailto:hello@utkarshpandey.in"
              className="flex items-center gap-1.5 text-[13px] text-[#78716C] hover:text-[#1C1917] transition-colors"
            >
              <EnvelopeSimpleIcon size={16} />
              Contact
            </a>
          </div>
        </div>
      </footer>

      {/* ─── GIANT BRAND TEXT ────────────────────────────────── */}
      <section className="relative overflow-hidden -mt-6">
        <div
          className="text-center font-serif text-[clamp(120px,30vw,500px)] leading-none tracking-tight select-none pointer-events-none"
          style={{
            background:
              "linear-gradient(to top, #E7E5E4 0%, #D6D3D1 30%, #A8A29E 60%, #78716C 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          OMNIDOC
        </div>
      </section>
    </main>
  );
}

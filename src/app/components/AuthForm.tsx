"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowRightIcon, CheckIcon, GoogleLogoIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { OmnidocLogo } from "@/components/omnidoc-logo";
import "../auth.css";

export default function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const isSignup = mode === "signup";

  async function continueWithGoogle() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const redirect = searchParams.get("redirect") || "/dashboard";
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirect)}` },
    });
    if (authError) {
      setError(authError.message);
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <Link href="/" className="auth-brand"><OmnidocLogo priority className="auth-brand-logo" /> Omnidoc</Link>
      <section className="auth-shell">
        <div className="auth-preview" aria-hidden="true">
          <div className="auth-preview-top"><span>Product narrative</span><span className="auth-saved">Saved</span></div>
          <div className="auth-paper">
            <span className="auth-kicker">Draft · September 14</span>
            <h2>Ideas feel clearer<br />when the page feels calm.</h2>
            <p>Turn scattered thoughts into a document your whole team can shape together.</p>
            <p>Write naturally, invite collaborators, and preview AI edits <span className="auth-ghost">before they become part of the page.</span></p>
            <div className="auth-caret"><i /> <span>Maya is editing</span></div>
          </div>
          <div className="auth-presence"><UsersThreeIcon /><span>3 people here</span><b>AR</b><b>MK</b></div>
        </div>

        <div className="auth-card">
          <span className="auth-eyebrow">{isSignup ? "Start your workspace" : "Welcome back"}</span>
          <h1>{isSignup ? "Your next great document starts here." : "Pick up where your ideas left off."}</h1>
          <p>{isSignup ? "A collaborative writing space with thoughtful AI built into the margins." : "Sign in to open your documents, collaborators, and saved suggestions."}</p>
          <div className="auth-benefits">
            <span><CheckIcon weight="bold" /> Real-time collaboration</span>
            <span><CheckIcon weight="bold" /> Your choice of Gemini or Grok</span>
            <span><CheckIcon weight="bold" /> AI edits stay previews until accepted</span>
          </div>
          {error && <div role="alert" className="auth-error">{error}</div>}
          <button className="auth-google" disabled={loading} onClick={continueWithGoogle}>
            <GoogleLogoIcon weight="bold" />
            <span>{loading ? "Opening Google…" : `${isSignup ? "Sign up" : "Sign in"} with Google`}</span>
            <ArrowRightIcon />
          </button>
          <p className="auth-switch">
            {isSignup ? "Already have a workspace?" : "New to Omnidoc?"}{" "}
            <Link href={isSignup ? "/signin" : "/signup"}>{isSignup ? "Sign in" : "Create one"}</Link>
          </p>
        </div>
      </section>
    </main>
  );
}

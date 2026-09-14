"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const redirect = searchParams.get("redirect") || "/dashboard";
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirect)}`,
      },
    });
    if (authError) {
      setError(authError.message);
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] px-6 py-8 text-slate-900">
      <a href="/" className="text-sm font-medium text-slate-500 transition hover:text-slate-900">← Back to Omnidoc</a>
      <section className="mx-auto mt-20 max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-10">
        <div className="mb-8">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">Omnidoc</p>
          <h1 className="text-3xl font-semibold tracking-tight">Write together, effortlessly.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">A calm, real-time workspace for documents that matter.</p>
        </div>
        {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button onClick={signInWithGoogle} disabled={loading} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-slate-950 px-4 font-medium text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-sm font-bold text-blue-600">G</span>
          {loading ? "Connecting…" : "Continue with Google"}
        </button>
        <p className="mt-6 text-center text-xs leading-5 text-slate-400">By continuing, you agree to use Omnidoc responsibly.</p>
      </section>
    </main>
  );
}


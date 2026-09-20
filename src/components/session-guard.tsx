"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SessionGuard() {
  const router = useRouter();

  useEffect(() => {
    let checking = false;
    let disposed = false;
    const supabase = createClient();
    const expire = async () => {
      if (disposed) return;
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      if (!disposed) {
        window.dispatchEvent(new Event("omnidoc:signed-out"));
        router.replace("/");
      }
    };
    const check = async () => {
      if (checking || disposed) return;
      checking = true;
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        const response = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
        if (response.status === 401) await expire();
      } finally {
        checking = false;
      }
    };
    const onFocus = () => void check();
    const onSignedOut = () => void expire();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("omnidoc:signed-out", onSignedOut);
    const timer = window.setInterval(() => void check(), 30_000);
    void check();
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("omnidoc:signed-out", onSignedOut);
    };
  }, [router]);

  return null;
}

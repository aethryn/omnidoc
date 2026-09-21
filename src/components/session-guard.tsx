"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SessionGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const protectedRoute = pathname === "/dashboard" || pathname === "/document" || pathname.startsWith("/document/");

  useEffect(() => {
    if (!protectedRoute) return;
    let checking = false;
    let expiring = false;
    let disposed = false;
    const supabase = createClient();
    const expire = async () => {
      if (disposed || expiring) return;
      expiring = true;
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      if (!disposed) {
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
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const timer = window.setInterval(() => void check(), 30_000);
    void check();
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [protectedRoute, router]);

  return null;
}

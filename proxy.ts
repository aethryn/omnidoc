import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isAllowedMutationOrigin } from "@/lib/request-security";

const protectedRoutes = ["/dashboard", "/document", "/join"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    const maintenance = pathname === "/api/cron/maintenance";
    if (!maintenance && !isAllowedMutationOrigin(request.method, request.url, request.headers.get("origin"), [process.env.NEXT_PUBLIC_APP_URL, process.env.APP_URL])) {
      return NextResponse.json({ error:"Cross-origin request rejected", code:"CROSS_ORIGIN_REQUEST" }, { status:403 });
    }
    return NextResponse.next();
  }
  const { response, userId } = await updateSession(request);
  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route));
  const isAuthPage = pathname === "/signin" || pathname === "/signup";
  const isLandingPage = pathname === "/";

  if (isProtected && !userId) {
    const url = new URL("/signin", request.url);
    url.searchParams.set("redirect", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && userId) return NextResponse.redirect(new URL("/dashboard", request.url));
  if (isLandingPage && userId) return NextResponse.redirect(new URL("/dashboard", request.url));
  return response;
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/document/:path*", "/join/:path*", "/signin", "/signup", "/api/:path*"],
};

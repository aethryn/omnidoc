import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const protectedRoutes = ["/dashboard", "/document", "/join"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
  matcher: ["/", "/dashboard/:path*", "/document/:path*", "/join/:path*", "/signin", "/signup"],
};

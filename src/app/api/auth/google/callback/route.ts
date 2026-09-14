import { PrismaClient } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Handle Google OAuth rejection/error
  if (oauthError) {
    console.error("Google OAuth error from provider:", oauthError);
    return NextResponse.redirect(
      new URL(`/signin?error=${encodeURIComponent(oauthError)}`, appUrl)
    );
  }

  // Verify CSRF state parameter against cookie
  const storedState = request.cookies.get("oauth_state")?.value;
  if (!state || !storedState || state !== storedState) {
    console.error("OAuth state mismatch or missing state cookie");
    return NextResponse.redirect(
      new URL("/signin?error=invalid_oauth_state", appUrl)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/signin?error=missing_oauth_code", appUrl)
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const jwtSecret = process.env.JWT_SECRET;

  if (!clientId || !clientSecret || !jwtSecret) {
    console.error("Server misconfiguration: missing Google OAuth or JWT secrets");
    return NextResponse.redirect(
      new URL("/signin?error=oauth_configuration_error", appUrl)
    );
  }

  const redirectUri = `${appUrl}/api/auth/google/callback`;

  try {
    // 1. Exchange authorization code with Google token endpoint
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Failed to exchange code for Google token:", errorText);
      return NextResponse.redirect(
        new URL("/signin?error=token_exchange_failed", appUrl)
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return NextResponse.redirect(
        new URL("/signin?error=missing_access_token", appUrl)
      );
    }

    // 2. Fetch authenticated user profile from Google UserInfo endpoint
    const userinfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!userinfoResponse.ok) {
      console.error("Failed to fetch Google user profile");
      return NextResponse.redirect(
        new URL("/signin?error=profile_fetch_failed", appUrl)
      );
    }

    const profile = await userinfoResponse.json();
    const email = profile.email?.toLowerCase();
    const name = profile.name || email?.split("@")[0] || "User";

    if (!email) {
      return NextResponse.redirect(
        new URL("/signin?error=missing_email", appUrl)
      );
    }

    // 3. Securely lookup or provision user in database
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Create user account with a secure random hash for password compatibility
      const randomPassword = crypto.randomUUID() + crypto.randomBytes(32).toString("hex");
      const hashedPassword = await bcrypt.hash(randomPassword, 10);
      const avatars = [
        "vibrent_2.png",
        "vibrent_6.png",
        "vibrent_7.png",
        "vibrent_8.png",
        "vibrent_9.png",
        "vibrent_27.png",
      ];
      const randomAvatar = avatars[Math.floor(Math.random() * avatars.length)];

      user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          avatar: randomAvatar,
        },
      });
    }

    // 4. Generate OmniDoc JWT session token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
      },
      jwtSecret,
      { expiresIn: "7d" }
    );

    // 5. Build redirect response and attach session cookie
    const response = NextResponse.redirect(new URL("/dashboard", appUrl));

    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    // Clear temporary oauth_state cookie
    response.cookies.set("oauth_state", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Error in Google OAuth callback:", error);
    return NextResponse.redirect(
      new URL("/signin?error=internal_oauth_error", appUrl)
    );
  } finally {
    await prisma.$disconnect();
  }
}

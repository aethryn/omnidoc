import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./galaxy-button.css";
import { Toaster } from "@/components/ui/sonner";
import { SessionGuard } from "@/components/session-guard";

const instrumental = localFont({ src: [{ path: "../../public/fonts/InstrumentSerif-Regular.ttf", weight: "400", style: "normal" }, { path: "../../public/fonts/InstrumentSerif-Italic.ttf", weight: "400", style: "italic" }], variable: "--font-instrument-serif" });
const poppins = localFont({ src: [{ path: "../../public/fonts/Poppins-Light.ttf", weight: "300", style: "normal" }, { path: "../../public/fonts/Poppins-Regular.ttf", weight: "400", style: "normal" }, { path: "../../public/fonts/Poppins-Medium.ttf", weight: "500", style: "normal" }, { path: "../../public/fonts/Poppins-SemiBold.ttf", weight: "600", style: "normal" }], variable: "--font-poppins" });

function metadataBase() {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const candidate = configured || (vercelHost ? `https://${vercelHost}` : "http://localhost:3000");
  try { return new URL(candidate); }
  catch { return new URL("http://localhost:3000"); }
}

export const metadata: Metadata = {
  metadataBase: metadataBase(),
  title: "Omnidoc — Write together",
  description: "A calm, real-time collaborative document editor.",
  openGraph: {
    type: "website",
    siteName: "Omnidoc",
    title: "Omnidoc — Write together",
    description: "A calm, real-time collaborative document editor.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Omnidoc — Write together",
    description: "A calm, real-time collaborative document editor.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${instrumental.variable} ${poppins.variable}`}>
      <body className="min-h-screen antialiased">
        {children}
        <SessionGuard />
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}

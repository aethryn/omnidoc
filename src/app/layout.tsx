import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import "./globals.css";
import "./galaxy-button.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-instrument", display: "swap" });

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${instrument.variable} min-h-screen antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
          <Toaster position="bottom-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}

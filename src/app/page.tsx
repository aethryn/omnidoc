import type { Metadata } from "next";
import LandingPageClient from "./components/LandingPageClient";

export const metadata: Metadata = {
  title: "Omnidoc — Write together, thoughtfully",
  description:
    "A calm, real-time collaborative document editor with AI assistance. Write, refine, and decide together.",
};

export default function LandingPage() {
  return <LandingPageClient />;
}

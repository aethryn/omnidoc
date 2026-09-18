import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["yjs", "y-prosemirror", "@hocuspocus/transformer"],
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "assets.aceternity.com",
      },
    ],
  },
};

export default nextConfig;

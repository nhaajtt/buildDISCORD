import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  // Vietnamese is the default language and lives at the root; English lives at /en
  async rewrites() {
    return [
      { source: "/", destination: "/vi" },
      { source: "/privacy", destination: "/vi/privacy" },
      { source: "/terms", destination: "/vi/terms" },
      { source: "/devlog", destination: "/vi/devlog" },
    ];
  },
};

export default nextConfig;

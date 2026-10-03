import type { MetadataRoute } from "next";
import { themes } from "@/content/data";

const base = "https://builddiscord.vercel.app";

// Vietnamese lives at the root and English under /en, like the site's routes
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["", "/devlog", "/privacy", "/terms", "/status", ...themes.map((t) => `/themes/${t.id}`)];
  return paths.flatMap((p) => {
    const vi = `${base}${p || "/"}`;
    const en = `${base}/en${p}`;
    return [
      { url: vi, alternates: { languages: { vi, en } } },
      { url: en, alternates: { languages: { vi, en } } },
    ];
  });
}

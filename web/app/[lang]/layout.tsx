import type { Metadata } from "next";
import { Big_Shoulders, Be_Vietnam_Pro } from "next/font/google";
import vi from "@/content/vi";
import en from "@/content/en";
import "../globals.css";

const display = Big_Shoulders({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["800", "900"],
  variable: "--font-display",
  display: "swap",
});

const body = Be_Vietnam_Pro({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400", "500", "700"],
  variable: "--font-body",
  display: "swap",
});

const dicts = { vi, en } as const;

export function generateStaticParams() {
  return [{ lang: "vi" }, { lang: "en" }];
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const d = dicts[lang as "vi" | "en"] ?? vi;
  return {
    metadataBase: new URL("https://builddiscord.vercel.app"),
    title: d.meta.title,
    description: d.meta.description,
    alternates: { languages: { vi: "/", en: "/en" } },
    openGraph: { title: d.meta.title, description: d.meta.description, type: "website", locale: d.lang === "en" ? "en_US" : "vi_VN" },
  };
}

// Sets the theme before first paint so there is no flash between light and dark
const themeScript = `try{var t=localStorage.getItem("theme");if(!t){t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}`;

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return (
    <html lang={lang === "en" ? "en" : "vi"} className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

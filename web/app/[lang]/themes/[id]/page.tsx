import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ThemePage from "@/components/ThemePage";
import { themes } from "@/content/data";
import vi from "@/content/vi";
import en from "@/content/en";

const dicts = { vi, en } as const;

// Every theme in both languages is built ahead of time
export const dynamicParams = false;
export function generateStaticParams() {
  return (["vi", "en"] as const).flatMap((lang) => themes.map((t) => ({ lang, id: t.id })));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string; id: string }> }): Promise<Metadata> {
  const { lang, id } = await params;
  const d = dicts[lang as "vi" | "en"];
  const item = d?.themes.items.find((x) => x.id === id);
  if (!d || !item) return {};
  const path = (l: string) => `${l === "en" ? "/en" : ""}/themes/${id}`;
  return {
    title: d.themePage.metaTitle.replace("{label}", item.label),
    description: item.blurb,
    alternates: { canonical: path(lang), languages: { vi: path("vi"), en: path("en") } },
  };
}

export default async function Page({ params }: { params: Promise<{ lang: string; id: string }> }) {
  const { lang, id } = await params;
  if (lang !== "vi" && lang !== "en") notFound();
  if (!themes.some((t) => t.id === id)) notFound();
  return <ThemePage dict={dicts[lang]} themeId={id} />;
}

import { notFound } from "next/navigation";
import Devlog from "@/components/Devlog";
import { devlog } from "@/content/devlog";

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (lang !== "vi" && lang !== "en") notFound();
  return <Devlog doc={devlog[lang]} home={lang === "vi" ? "/" : "/en"} />;
}

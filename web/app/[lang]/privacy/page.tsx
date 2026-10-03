import { notFound } from "next/navigation";
import Legal from "@/components/Legal";
import { privacy } from "@/content/legal";

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (lang !== "vi" && lang !== "en") notFound();
  return <Legal doc={privacy[lang]} home={lang === "vi" ? "/" : "/en"} />;
}

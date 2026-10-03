import { notFound } from "next/navigation";
import Legal from "@/components/Legal";
import { terms } from "@/content/legal";

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (lang !== "vi" && lang !== "en") notFound();
  return <Legal doc={terms[lang]} home={lang === "vi" ? "/" : "/en"} />;
}

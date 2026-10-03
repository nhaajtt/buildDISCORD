import { notFound } from "next/navigation";
import Landing from "@/components/Landing";
import vi from "@/content/vi";
import en from "@/content/en";

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const dict = lang === "vi" ? vi : lang === "en" ? en : null;
  if (!dict) notFound();
  return <Landing dict={dict} />;
}

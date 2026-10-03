import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Motion from "@/components/Motion";
import PageHeader from "@/components/PageHeader";
import SectionHead from "@/components/SectionHead";
import StatusPanel from "@/components/StatusPanel";
import vi from "@/content/vi";
import en from "@/content/en";

const dicts = { vi, en } as const;

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ lang: "vi" }, { lang: "en" }];
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const d = dicts[lang as "vi" | "en"] ?? vi;
  return {
    title: `${d.status.title} | Thầu Xây Dựng`,
    description: d.status.sub,
    alternates: { canonical: lang === "en" ? "/en/status" : "/status", languages: { vi: "/status", en: "/en/status" } },
  };
}

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (lang !== "vi" && lang !== "en") notFound();
  const dict = dicts[lang];
  const home = lang === "vi" ? "/" : "/en";
  return (
    <div className="page doc-page">
      <Motion sections={[]} intro={false} />
      <a className="skip" href="#main">
        Skip
      </a>
      <PageHeader dict={dict} backHref={home} backLabel={dict.status.back} switchHref={lang === "vi" ? "/en/status" : "/status"} />
      <main id="main" className="block status-page">
        <SectionHead as="h1" id="status-title" title={dict.status.title} lede={dict.status.sub} label={dict.status.label} />
        <div data-in>
          <StatusPanel dict={dict} />
        </div>
      </main>
    </div>
  );
}

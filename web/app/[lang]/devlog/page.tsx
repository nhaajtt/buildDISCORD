import { readFileSync } from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import DevlogToc from "@/components/DevlogToc";
import Motion from "@/components/Motion";
import ThemeToggle from "@/components/ThemeToggle";
import { parse, render } from "@/lib/markdown";
import { REPO_URL } from "@/content/site";

// The devlog is written once, in English, in docs/devlog.md of the bot repository. A script copies it to content/devlog.md and a test checks the copy.
const copy = {
  vi: { back: "Về trang chủ", home: "/", toc: "Mục lục", note: "Nhật ký kỹ thuật viết bằng tiếng Anh để nhà tuyển dụng quốc tế đọc được.", theme: "Đổi giao diện sáng tối", source: "Xem trên GitHub" },
  en: { back: "Back to home", home: "/en", toc: "Contents", note: "", theme: "Toggle light and dark theme", source: "View on GitHub" },
} as const;

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (lang !== "vi" && lang !== "en") notFound();
  const t = copy[lang];

  const blocks = parse(readFileSync(path.join(process.cwd(), "content", "devlog.md"), "utf8"));
  const title = blocks.find((b) => b.t === "h" && b.level === 1);
  const body = blocks.filter((b) => b !== title);
  const toc = body.flatMap((b) => (b.t === "h" && (b.level === 2 || b.level === 3) ? [{ id: b.id, text: b.text, level: b.level }] : []));
  const intro = body.findIndex((b) => b.t === "h");

  return (
    <div className="page doc-page">
      <Motion sections={toc.filter((x) => x.level === 2).map((x) => ({ id: x.id, label: x.text }))} intro={false} />
      <header className="nav">
        <a className="brand" href={t.home}>
          <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
            <rect width="32" height="32" rx="2" fill="currentColor" />
            <path d="M7 9h18M16 9v16" fill="none" stroke="var(--paper)" strokeWidth="3" strokeLinecap="square" />
          </svg>
          <span>Thầu Xây Dựng</span>
        </a>
        <div className="nav-end">
          <a className="btn btn-sm btn-ghost" href={t.home}>
            {t.back}
          </a>
          <a className="btn btn-sm" href={`${REPO_URL}/blob/main/docs/devlog.md`} target="_blank" rel="noopener noreferrer">
            {t.source}
          </a>
          <ThemeToggle label={t.theme} />
        </div>
      </header>

      <main className="doc" lang="en">
        <DevlogToc items={toc} title={t.toc} />
        <article className="prose">
          <h1 className="doc-title">{title && title.t === "h" ? "Engineering devlog" : "Devlog"}</h1>
          {t.note ? <p className="doc-note">{t.note}</p> : null}
          {render(body.slice(0, intro), "")}
          {render(body.slice(intro), "Numbers")}
        </article>
      </main>
    </div>
  );
}

import type { Dict } from "@/content/types";
import { INVITE_URL } from "@/content/site";
import ThemeToggle from "./ThemeToggle";

const external = { target: "_blank", rel: "noopener noreferrer" } as const;

// The top bar of the sub pages (a theme, the status page): brand, a way back, the language switch, the colour toggle and the invite button
export default function PageHeader({ dict, backHref, backLabel, switchHref }: { dict: Dict; backHref: string; backLabel: string; switchHref: string }) {
  const home = dict.lang === "vi" ? "/" : "/en";
  return (
    <header className="nav">
      <a className="brand" href={home} aria-label={dict.nav.home}>
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
          <rect width="32" height="32" rx="2" fill="currentColor" />
          <path d="M7 9h18M16 9v16" fill="none" stroke="var(--paper)" strokeWidth="3" strokeLinecap="square" />
        </svg>
        <span>Thầu Xây Dựng</span>
      </a>
      <div className="nav-end">
        <a className="btn btn-sm btn-ghost" href={backHref}>
          {backLabel}
        </a>
        <a className="lang" href={switchHref} hrefLang={dict.lang === "vi" ? "en" : "vi"}>
          {dict.nav.switchTo}
        </a>
        <ThemeToggle label={dict.nav.theme} />
        <a className="btn btn-sm" href={INVITE_URL} {...external}>
          {dict.nav.cta}
        </a>
      </div>
    </header>
  );
}

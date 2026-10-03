import type { Dict } from "@/content/types";
import { INVITE_URL } from "@/content/site";
import { planFor, themes } from "@/content/data";
import CopyCommand from "./CopyCommand";
import Motion from "./Motion";
import PageHeader from "./PageHeader";
import SectionHead from "./SectionHead";

const external = { target: "_blank", rel: "noopener noreferrer" } as const;
const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));

// One theme in full: the roles, the categories and every channel the bot builds for it, an invite button and links to the neighbouring themes.
// Everything comes from the same data the home page's drafting table uses, so it is the bot's real output.
export default function ThemePage({ dict, themeId }: { dict: Dict; themeId: string }) {
  const t = dict.themePage;
  const prefix = dict.lang === "vi" ? "" : "/en";
  const other = dict.lang === "vi" ? "/en" : "";
  const index = themes.findIndex((x) => x.id === themeId);
  const item = dict.themes.items.find((x) => x.id === themeId);
  if (index < 0 || !item) return null;

  const plan = planFor([themeId]);
  const shared = plan.roles.slice(0, 4);
  const own = plan.roles.slice(4);
  const prev = themes[(index + themes.length - 1) % themes.length];
  const next = themes[(index + 1) % themes.length];
  const labelOf = (id: string) => dict.themes.items.find((x) => x.id === id)?.label ?? id;

  return (
    <div className="page doc-page">
      <Motion sections={[]} intro={false} />
      <a className="skip" href="#main">
        Skip
      </a>
      <PageHeader dict={dict} backHref={`${prefix}/#themes`} backLabel={t.back} switchHref={`${other}/themes/${themeId}`} />

      <main id="main" className="tp">
        <section className="block tp-top" aria-labelledby="tp-title">
          <SectionHead as="h1" id="tp-title" title={item.label} lede={item.blurb} label={t.label} />
          <p className="tp-counts" data-in>
            {fill(t.counts, { categories: plan.counts.categories, channels: plan.counts.channels, roles: plan.counts.roles, rules: plan.rules })}
          </p>
          <div className="tp-actions" data-in>
            <a className="btn" href={INVITE_URL} {...external}>
              {t.invite}
            </a>
            <p className="note">{t.inviteHint}</p>
          </div>
          <div className="tp-cmd" data-in>
            <span className="side-label">{t.cmdLabel}</span>
            <CopyCommand name="/build" args={`theme:${themeId}`} copied={dict.commands.copied} hint={dict.commands.hint} />
          </div>
        </section>

        <section className="block tp-roles" aria-labelledby="tp-roles-title">
          <SectionHead id="tp-roles-title" title={t.ownRoles} label={dict.themes.rolesLabel} />
          <div className="chips tp-chips" data-in>
            {own.map((r) => (
              <span key={r} className="chip">
                {r}
              </span>
            ))}
          </div>
          <p className="side-label tp-sub">{t.sharedRoles}</p>
          <div className="chips tp-chips" data-in>
            {shared.map((r) => (
              <span key={r} className="chip">
                {r}
              </span>
            ))}
          </div>
        </section>

        <section className="block tp-treebox" aria-labelledby="tp-tree-title">
          <SectionHead id="tp-tree-title" title={t.tree} lede={t.treeLede} label={dict.themes.sharedLabel} />
          <div className="tp-tree">
            {plan.categories.map((c) => (
              <article key={c.name} className="tp-cat" data-in>
                <h3>
                  {c.name}
                  {c.staff ? <span className="tp-badge">{t.staffOnly}</span> : null}
                </h3>
                <ul>
                  {c.channels.map((ch) => (
                    <li key={ch.name}>
                      <span className="tp-mark" aria-hidden="true">
                        {ch.type === "voice" ? "♪" : "#"}
                      </span>
                      <span className="tp-name">{ch.name}</span>
                      {ch.type === "voice" ? <span className="tp-kind">{t.voice}</span> : null}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <p className="note mix-note">{t.mix}</p>
        </section>

        <nav className="tp-nav" aria-label={t.back}>
          <a className="btn btn-ghost btn-sm" href={`${prefix}/themes/${prev.id}`} rel="prev">
            <span className="tp-nav-dir">{t.prev}</span>
            {labelOf(prev.id)}
          </a>
          <a className="btn btn-ghost btn-sm" href={`${prefix}/#themes`}>
            {t.seeAll}
          </a>
          <a className="btn btn-ghost btn-sm" href={`${prefix}/themes/${next.id}`} rel="next">
            <span className="tp-nav-dir">{t.next}</span>
            {labelOf(next.id)}
          </a>
        </nav>
      </main>
    </div>
  );
}

import type { Dict } from "@/content/types";
import { planFor } from "@/content/data";
import { sampleRules } from "@/content/shared";
import { CONTACT_URL, INSTAGRAM_URL, INVITE_URL, PERSONAL_URL, REPO_URL } from "@/content/site";
import AiDemo from "./AiDemo";
import BuildScene from "./BuildScene";
import CopyCommand from "./CopyCommand";
import EditorDemo from "./EditorDemo";
import FooterWord from "./FooterWord";
import Motion from "./Motion";
import Plotter from "./Plotter";
import SectionHead from "./SectionHead";
import SplitText from "./SplitText";
import ThemeToggle from "./ThemeToggle";
import Tilt from "./Tilt";

const external = { target: "_blank", rel: "noopener noreferrer" } as const;
// Roles a single theme adds on top of the four every server gets
const ownRoles = (id: string) => planFor([id]).roles.slice(4);

export default function Landing({ dict }: { dict: Dict }) {
  const base = planFor(["gaming"]).categories;
  const shared = [base[0], base.find((c) => c.channels.some((ch) => ch.name.includes("dj-booth")))!, base.find((c) => c.staff)!];
  const prefix = dict.lang === "vi" ? "" : "/en";
  const sections = [
    { id: "how", label: dict.nav.how },
    { id: "ai", label: dict.ai.label },
    { id: "editor", label: dict.editor.label },
    { id: "themes", label: dict.nav.themes },
    { id: "pricing", label: dict.nav.pricing },
    { id: "commands", label: dict.nav.commands },
    { id: "faq", label: dict.nav.faq },
  ];

  return (
    <div className="page">
      <Motion sections={sections} />
      <a className="skip" href="#main">
        Skip
      </a>

      <header className="nav">
        <a className="brand" href="#top" aria-label={dict.nav.home}>
          <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
            <rect width="32" height="32" rx="2" fill="currentColor" />
            <path d="M7 9h18M16 9v16" fill="none" stroke="var(--paper)" strokeWidth="3" strokeLinecap="square" />
          </svg>
          <span>Thầu Xây Dựng</span>
        </a>
        <nav className="nav-links" aria-label="Main">
          <a href="#how">{dict.nav.how}</a>
          <a href="#themes">{dict.nav.themes}</a>
          <a href="#pricing">{dict.nav.pricing}</a>
          <a href="#commands">{dict.nav.commands}</a>
          <a href="#faq">{dict.nav.faq}</a>
          <a href={`${prefix}/devlog`}>{dict.nav.devlog}</a>
        </nav>
        <div className="nav-end">
          <a className="lang" href={dict.nav.switchHref} hrefLang={dict.lang === "vi" ? "en" : "vi"}>
            {dict.nav.switchTo}
          </a>
          <ThemeToggle label={dict.nav.theme} />
          <a className="btn btn-sm" href={INVITE_URL} {...external}>
            {dict.nav.cta}
          </a>
        </div>
      </header>

      <main id="main">
        <section className="hero" id="top">
          <div className="hero-copy">
            <SplitText as="h1" by="char" className="hero-title" text={dict.hero.title} />
            <div className="dim hero-dim" aria-hidden="true">
              <span className="dim-line" />
              <span className="dim-label">{dict.hero.dim}</span>
            </div>
            <p className="hero-sub hero-fade">{dict.hero.sub}</p>
            <div className="hero-actions hero-fade">
              <a className="btn" href={INVITE_URL} {...external}>
                {dict.hero.cta}
              </a>
              <a className="btn btn-ghost" href="#how">
                {dict.hero.secondary}
              </a>
            </div>
          </div>
          <Plotter dict={dict} />
        </section>

        <BuildScene dict={dict} label={dict.scene.label} />

        <section className="block" id="ai" aria-labelledby="ai-title">
          <SectionHead id="ai-title" title={dict.ai.title} lede={dict.ai.sub} label={dict.ai.label} />
          <AiDemo dict={dict} />
        </section>

        <section className="block" id="editor" aria-labelledby="editor-title">
          <SectionHead id="editor-title" title={dict.editor.title} lede={dict.editor.sub} label={dict.editor.label} />
          <div className="ai-grid">
            <EditorDemo dict={dict} />
            <ul className="points">
              {dict.editor.points.map((p) => (
                <li key={p.t} data-in>
                  <strong>{p.t}.</strong> {p.d}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="block" id="themes" aria-labelledby="themes-title">
          <SectionHead id="themes-title" title={dict.themes.title} lede={dict.themes.sub} label={dict.themes.label} />
          <div className="theme-cards">
            {dict.themes.items.map((t) => (
              <article key={t.id} className="theme-card" data-in>
                <h3>{t.label}</h3>
                <p>{t.blurb}</p>
                <div className="side-label">{dict.themes.rolesLabel}</div>
                <div className="chips">
                  {ownRoles(t.id).map((r) => (
                    <span key={r} className="chip">
                      {r}
                    </span>
                  ))}
                </div>
                <p className="theme-count">
                  {planFor([t.id]).counts.categories} / {planFor([t.id]).counts.channels} / {planFor([t.id]).counts.roles}
                </p>
              </article>
            ))}
          </div>
          <p className="note mix-note">
            {dict.themes.sharedLabel}: {shared.map((c) => c.name).join(", ")}. {dict.themes.mixNote}
          </p>
        </section>

        <section className="block" id="rules" aria-labelledby="rules-title">
          <SectionHead id="rules-title" title={dict.rules.title} lede={dict.rules.sub} label={dict.rules.label} />
          <ol className="rule-list">
            {sampleRules.map((rule, i) => (
              <li key={rule} data-in>
                <span className="rule-no" aria-hidden="true">
                  {i + 1}
                </span>
                <p>{rule}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="block split" id="music" aria-labelledby="music-title">
          <div>
            <SectionHead id="music-title" title={dict.music.title} lede={dict.music.body} label={dict.music.label} />
          </div>
          <ul className="points">
            {dict.music.points.map((p) => (
              <li key={p} data-in>
                {p}
              </li>
            ))}
          </ul>
        </section>

        <section className="block" id="pricing" aria-labelledby="pricing-title">
          <SectionHead id="pricing-title" title={dict.pricing.title} lede={dict.pricing.sub} label={dict.pricing.label} />
          <div className="plans">
            {dict.pricing.plans.map((plan) => (
              <Tilt key={plan.id} className={plan.id === "pro" ? "plan-card featured" : "plan-card"}>
                <h3>{plan.name}</h3>
                <p className="price">{plan.price}</p>
                <p className="plan-blurb">{plan.blurb}</p>
                <ul>
                  {plan.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </Tilt>
            ))}
          </div>
          <div className="how-buy" data-in>
            <h3>{dict.pricing.howTitle}</h3>
            <ol>
              {dict.pricing.how.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <a className="btn" href={CONTACT_URL} {...external}>
              {dict.pricing.contact}
            </a>
            <p className="note">{dict.pricing.note}</p>
          </div>
        </section>

        <section className="block" id="commands" aria-labelledby="commands-title">
          <SectionHead id="commands-title" title={dict.commands.title} label={dict.commands.label} />
          <dl className="cmds">
            {dict.commands.items.map((c) => (
              <div key={c.name} className="cmd-row" data-in>
                <dt>
                  <CopyCommand name={c.name} args={c.args} copied={dict.commands.copied} hint={dict.commands.hint} />
                </dt>
                <dd>{c.d}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="block" id="faq" aria-labelledby="faq-title">
          <SectionHead id="faq-title" title={dict.faq.title} label={dict.faq.label} />
          <div className="faq">
            {dict.faq.items.map((f) => (
              <details key={f.q} data-in>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="block cta" id={dict.cta.setupId} aria-labelledby="cta-title">
          <SectionHead id="cta-title" title={dict.cta.title} label={dict.cta.label} />
          <ol className="cta-steps">
            {dict.cta.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <a className="btn" href={INVITE_URL} {...external}>
            {dict.cta.button}
          </a>
        </section>
      </main>

      <footer className="footer">
        <div className="tape" aria-hidden="true" />
        <FooterWord word={dict.footer.word} />
        <table className="title-block">
          <tbody>
            <tr>
              <th scope="row">{dict.footer.block.project}</th>
              <td>buildDISCORD, v1.3</td>
              <th scope="row">{dict.footer.block.sheet}</th>
              <td>1 / 1</td>
            </tr>
            <tr>
              <th scope="row">{dict.footer.block.drawn}</th>
              <td>nhaajt</td>
              <th scope="row">{dict.footer.block.stack}</th>
              <td>Node 22, discord.js 14, SQLite, Next.js 15</td>
            </tr>
            <tr>
              <th scope="row">{dict.footer.block.links}</th>
              <td colSpan={3}>
                <a href={`${prefix}/devlog`}>{dict.footer.devlog}</a>
                <a href={`${prefix}/privacy`}>{dict.footer.privacy}</a>
                <a href={`${prefix}/terms`}>{dict.footer.terms}</a>
                <a href={REPO_URL} {...external}>
                  {dict.footer.source}
                </a>
                <a href={INSTAGRAM_URL} {...external}>
                  Instagram
                </a>
                <a href={PERSONAL_URL} {...external}>
                  nhaajt.com
                </a>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="footer-line">{dict.footer.line}</p>
      </footer>
    </div>
  );
}

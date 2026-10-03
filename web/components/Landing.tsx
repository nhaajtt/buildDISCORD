"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import type { Dict } from "@/content/types";
import {
  baseRoles,
  djCategory,
  infoCategory,
  sampleRules,
  staffCategory,
  themeCategories,
  themeRoles,
  type Category,
} from "@/content/shared";
import { CONTACT_URL, INVITE_URL, REPO_URL, aiSample } from "@/content/site";
import SplitText from "./SplitText";
import ThemeToggle from "./ThemeToggle";

const sceneCategories: Category[] = [infoCategory, ...themeCategories.gaming, djCategory, staffCategory];
const sceneRoles = [...baseRoles, "🎮 Pro Gamer (tự xưng)", "🥔 Gánh Team Ngược"];

function ChannelRow({ name, voice }: { name: string; voice?: boolean }) {
  return (
    <li className="row">
      <span className="row-mark" aria-hidden="true">
        {voice ? "◖" : "#"}
      </span>
      {name}
    </li>
  );
}

export default function Landing({ dict }: { dict: Dict }) {
  const root = useRef<HTMLDivElement>(null);
  const [themeId, setThemeId] = useState(dict.themes.items[0].id);
  const inviteHref = INVITE_URL;
  const inviteProps = { target: "_blank", rel: "noopener noreferrer" };
  const prefix = dict.lang === "vi" ? "" : "/en";

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia(root);

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const scene = root.current!.querySelector<HTMLElement>(".scene")!;
      scene.classList.add("pinned");

      const lenis = new Lenis();
      lenis.on("scroll", ScrollTrigger.update);
      const tick = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);

      // Hero: one orchestrated entrance
      gsap.from(".hero .u", { yPercent: 115, duration: 1, ease: "power4.out", stagger: 0.022, delay: 0.1 });
      gsap.from(".hero-fade", { opacity: 0, y: 14, duration: 0.8, stagger: 0.12, delay: 0.75, ease: "power2.out" });
      gsap.from(".plan .row", { opacity: 0, x: -10, duration: 0.5, stagger: 0.08, delay: 1.1 });

      // Section headings rise word by word
      gsap.utils.toArray<HTMLElement>(".reveal").forEach((el) => {
        gsap.from(el.querySelectorAll(".u"), {
          yPercent: 110,
          duration: 0.8,
          ease: "power3.out",
          stagger: 0.06,
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
        });
      });

      // The signature scene: the server is built as you scroll
      const pct = scene.querySelector<HTMLElement>(".pct")!;
      const steps = Array.from(scene.querySelectorAll<HTMLElement>(".steps li"));
      const bounds = [0.0, 0.14, 0.4, 0.82, 0.93];
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: scene,
          start: "top top",
          end: "+=2600",
          scrub: 0.5,
          pin: true,
          anticipatePin: 1,
          onUpdate: (self) => {
            const p = self.progress;
            pct.textContent = `${Math.round(p * 100)}%`;
            const active = bounds.reduce((acc, b, i) => (p >= b ? i : acc), 0);
            steps.forEach((li, i) => li.classList.toggle("on", i === active));
          },
        },
      });
      tl.from(scene.querySelector(".cmd"), { opacity: 0, duration: 0.4 }, 0)
        .from(scene.querySelectorAll(".chip"), { opacity: 0, scale: 0.6, stagger: 0.1, duration: 0.3 }, 0.55)
        .from(scene.querySelectorAll(".cat-name"), { opacity: 0, x: -16, stagger: 0.5, duration: 0.4 }, 1.6)
        .from(scene.querySelectorAll(".srv-cats .row"), { opacity: 0, x: -14, stagger: 0.09, duration: 0.3 }, 1.7)
        .from(scene.querySelector(".rules-card"), { opacity: 0, y: 30, duration: 0.6 }, 3.2)
        .from(scene.querySelector(".stamp"), { opacity: 0, scale: 2.4, rotate: -18, duration: 0.4, ease: "power4.in" }, 3.65)
        .to({}, { duration: 0.3 });

      return () => {
        scene.classList.remove("pinned");
        gsap.ticker.remove(tick);
        lenis.destroy();
      };
    });

    return () => mm.revert();
  }, []);

  const theme = dict.themes.items.find((t) => t.id === themeId) ?? dict.themes.items[0];
  const themeChannels = themeCategories[theme.id] ?? [];

  return (
    <div ref={root}>
      <a className="skip" href="#main">
        Skip
      </a>

      <header className="nav">
        <a className="brand" href="#top" aria-label={dict.nav.home}>
          <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
            <rect width="32" height="32" rx="2" fill="currentColor" />
            <path d="M7 9h18M16 9v16" fill="none" stroke="var(--bg)" strokeWidth="3" strokeLinecap="square" />
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
          <a className="btn btn-sm" href={inviteHref} {...inviteProps}>
            {dict.nav.cta}
          </a>
        </div>
      </header>

      <main id="main">
        <section className="hero" id="top">
          <div className="hero-copy">
            <SplitText as="h1" by="char" className="hero-title" text={dict.hero.title} />
            <p className="hero-sub hero-fade">{dict.hero.sub}</p>
            <div className="hero-actions hero-fade">
              <a className="btn" href={inviteHref} {...inviteProps}>
                {dict.hero.cta}
              </a>
              <a className="btn btn-ghost" href="#how">
                {dict.hero.secondary}
              </a>
            </div>
          </div>
          <aside className="plan hero-fade" aria-label={dict.hero.commandLabel}>
            <div className="plan-head">{dict.hero.commandLabel}</div>
            <div className="plan-cmd">{dict.scene.cmd}</div>
            <ul className="plan-rows" aria-hidden="true">
              {[62, 48, 74, 40, 56, 68].map((w, i) => (
                <li key={i} className="row">
                  <span className="skeleton" style={{ width: `${w}%` }} />
                </li>
              ))}
            </ul>
            <p className="plan-empty">{dict.hero.empty}</p>
          </aside>
        </section>

        <section className="scene" id="how" aria-labelledby="how-title">
          <div className="scene-inner">
            <div className="scene-copy">
              <SplitText as="h2" id="how-title" className="section-title reveal" text={dict.scene.title} />
              <ol className="steps">
                {dict.scene.steps.map((s, i) => (
                  <li key={i} className={i === 0 ? "on" : ""}>
                    <h3>{s.t}</h3>
                    <p>{s.d}</p>
                  </li>
                ))}
              </ol>
            </div>
            <div className="srv" aria-hidden="true">
              <div className="srv-bar">
                <span className="cmd">{dict.scene.cmd}</span>
                <span className="pct">100%</span>
              </div>
              <div className="srv-grid">
                <div className="srv-cats">
                  {sceneCategories.map((cat) => (
                    <div key={cat.name} className="cat">
                      <div className="cat-name">{cat.name}</div>
                      <ul>
                        {cat.channels.map((ch) => (
                          <ChannelRow key={ch.name} {...ch} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="srv-side">
                  <div className="side-label">{dict.scene.roles}</div>
                  <div className="chips">
                    {sceneRoles.map((r) => (
                      <span key={r} className="chip">
                        {r}
                      </span>
                    ))}
                  </div>
                  <div className="rules-card">
                    <div className="side-label">{dict.scene.rules}</div>
                    <p>{sampleRules[0]}</p>
                    <p>{sampleRules[2]}</p>
                  </div>
                  <div className="stamp">{dict.scene.stamp}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="block" id="ai" aria-labelledby="ai-title">
          <SplitText as="h2" id="ai-title" className="section-title reveal" text={dict.ai.title} />
          <p className="lede">{dict.ai.sub}</p>
          <div className="ai-grid">
            <div className="sheet">
              <div className="side-label">{dict.ai.inputLabel}</div>
              <p className="ai-cmd">
                <code>/thietke</code> <span className="arg">mota:</span> {dict.ai.description}
              </p>
              <div className="side-label">{dict.ai.levelLabel}</div>
              <div className="chips" role="group" aria-label={dict.ai.levelLabel}>
                {dict.ai.levels.map((level, i) => (
                  <span key={level} className={i === 1 ? "chip solid on" : "chip solid"}>
                    {level}
                  </span>
                ))}
              </div>
              <p className="note">{dict.ai.plan}</p>
            </div>
            <div className="sheet">
              <div className="side-label">{dict.ai.resultLabel}: {aiSample.label}</div>
              <p className="ai-welcome">{aiSample.welcome}</p>
              <div className="chips">
                {aiSample.roles.map((r) => (
                  <span key={r} className="chip">
                    {r}
                  </span>
                ))}
              </div>
              {aiSample.categories.map((cat) => (
                <div key={cat.name} className="cat">
                  <div className="cat-name">{cat.name}</div>
                  <ul>
                    {cat.channels.map((ch) => (
                      <li key={ch} className="row">
                        {ch}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="note">{dict.ai.sampleNote}</p>
            </div>
          </div>
        </section>

        <section className="block" id="editor" aria-labelledby="editor-title">
          <SplitText as="h2" id="editor-title" className="section-title reveal" text={dict.editor.title} />
          <p className="lede">{dict.editor.sub}</p>
          <div className="ai-grid">
            <div className="sheet mock" aria-hidden="true">
              <div className="side-label">{dict.editor.mockLabel}</div>
              {aiSample.categories.slice(0, 2).map((cat) => (
                <div key={cat.name} className="cat">
                  <div className="cat-name">{cat.name}</div>
                  <ul>
                    {cat.channels.map((ch) => (
                      <li key={ch} className="row">
                        {ch}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="mock-select">{dict.editor.removeLabel}</div>
              <div className="mock-select">{dict.editor.renameLabel}</div>
              <div className="mock-buttons">
                <span className="mock-btn">+ {dict.editor.add}</span>
                <span className="mock-btn go">{dict.editor.build}</span>
                <span className="mock-btn">{dict.editor.cancel}</span>
              </div>
              <p className="note">{dict.editor.footer}</p>
            </div>
            <ul className="points">
              {dict.editor.points.map((p) => (
                <li key={p.t}>
                  <strong>{p.t}.</strong> {p.d}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="block" id="themes" aria-labelledby="themes-title">
          <SplitText as="h2" id="themes-title" className="section-title reveal" text={dict.themes.title} />
          <p className="lede">{dict.themes.sub}</p>
          <div className="tabs" role="tablist" aria-label={dict.themes.tablist}>
            {dict.themes.items.map((t) => (
              <button
                key={t.id}
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={t.id === themeId}
                aria-controls="theme-panel"
                className="tab"
                onClick={() => setThemeId(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="panel" id="theme-panel" role="tabpanel" aria-labelledby={`tab-${theme.id}`}>
            <p className="panel-blurb">{theme.blurb}</p>
            <div className="panel-cols">
              <div>
                <h3 className="mini">{dict.themes.rolesLabel}</h3>
                <div className="chips">
                  {(themeRoles[theme.id] ?? []).map((r) => (
                    <span key={r} className="chip solid">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mini">{dict.themes.channelsLabel}</h3>
                {themeChannels.map((cat) => (
                  <div key={cat.name} className="cat">
                    <div className="cat-name">{cat.name}</div>
                    <ul>
                      {cat.channels.map((ch) => (
                        <ChannelRow key={ch.name} {...ch} />
                      ))}
                    </ul>
                  </div>
                ))}
                <p className="shared">
                  {dict.themes.sharedLabel}: {infoCategory.name}, {djCategory.name}, {staffCategory.name}
                </p>
              </div>
            </div>
          </div>
          <p className="note mix-note">{dict.themes.mixNote}</p>
        </section>

        <section className="block" aria-labelledby="rules-title">
          <SplitText as="h2" id="rules-title" className="section-title reveal" text={dict.rules.title} />
          <p className="lede">{dict.rules.sub}</p>
          <ol className="rule-list">
            {sampleRules.map((rule, i) => (
              <li key={i}>
                <span className="rule-no" aria-hidden="true">
                  {i + 1}
                </span>
                <p>{rule}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="block split" aria-labelledby="music-title">
          <div>
            <SplitText as="h2" id="music-title" className="section-title reveal" text={dict.music.title} />
            <p className="lede">{dict.music.body}</p>
          </div>
          <ul className="points">
            {dict.music.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>

        <section className="block" id="pricing" aria-labelledby="pricing-title">
          <SplitText as="h2" id="pricing-title" className="section-title reveal" text={dict.pricing.title} />
          <p className="lede">{dict.pricing.sub}</p>
          <div className="plans">
            {dict.pricing.plans.map((plan) => (
              <article key={plan.id} className={plan.id === "pro" ? "plan-card featured" : "plan-card"}>
                <h3>{plan.name}</h3>
                <p className="price">{plan.price}</p>
                <p className="plan-blurb">{plan.blurb}</p>
                <ul>
                  {plan.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <div className="how-buy">
            <h3>{dict.pricing.howTitle}</h3>
            <ol>
              {dict.pricing.how.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <a className="btn" href={CONTACT_URL} target="_blank" rel="noopener noreferrer">
              {dict.pricing.contact}
            </a>
            <p className="note">{dict.pricing.note}</p>
          </div>
        </section>

        <section className="block" id="commands" aria-labelledby="commands-title">
          <SplitText as="h2" id="commands-title" className="section-title reveal" text={dict.commands.title} />
          <dl className="cmds">
            {dict.commands.items.map((c) => (
              <div key={c.name} className="cmd-row">
                <dt>
                  <code>
                    {c.name}
                    {c.args
                      ? c.args.split(" ").map((arg) => (
                          <span key={arg} className="arg">
                            {" "}
                            {arg}
                          </span>
                        ))
                      : null}
                  </code>
                </dt>
                <dd>{c.d}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="block" id="faq" aria-labelledby="faq-title">
          <SplitText as="h2" id="faq-title" className="section-title reveal" text={dict.faq.title} />
          <div className="faq">
            {dict.faq.items.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="block cta" id={dict.cta.setupId} aria-labelledby="cta-title">
          <SplitText as="h2" id="cta-title" className="section-title reveal" text={dict.cta.title} />
          <ol className="cta-steps">
            {dict.cta.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <a className="btn" href={inviteHref} {...inviteProps}>
            {dict.cta.button}
          </a>
        </section>
      </main>

      <footer className="footer">
        <div className="tape" aria-hidden="true" />
        <div className="giant" aria-hidden="true">
          {dict.footer.word}
        </div>
        <nav className="footer-links" aria-label="Legal">
          <a href={`${prefix}/devlog`}>{dict.footer.devlog}</a>
          <a href={`${prefix}/privacy`}>{dict.footer.privacy}</a>
          <a href={`${prefix}/terms`}>{dict.footer.terms}</a>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            {dict.footer.source}
          </a>
        </nav>
        <p>{dict.footer.line}</p>
      </footer>
    </div>
  );
}

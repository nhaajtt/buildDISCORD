"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import type { Dict } from "@/content/types";
import { MAX_MIX, planFor, themes } from "@/content/data";

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// The hero's drafting table: pick themes, and the real output of the bot's composePlan for that mix is drawn out
export default function Plotter({ dict }: { dict: Dict }) {
  const order = themes.map((t) => t.id);
  const [picked, setPicked] = useState<string[]>([order[0]]);
  const key = order.filter((id) => picked.includes(id)).join("+");
  const plan = planFor(key.split("+"));
  const labelOf = (id: string) => dict.themes.items.find((t) => t.id === id)?.label ?? id;
  const [shown, setShown] = useState(plan.counts);
  const [stage, setStage] = useState<"idle" | "building" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const tree = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  const toggle = (id: string) => {
    setStage("idle");
    setPicked((current) => {
      if (current.includes(id)) return current.length > 1 ? current.filter((x) => x !== id) : current;
      return current.length >= MAX_MIX ? current : [...current, id];
    });
  };

  // A new mix: roll the three counters and plot the rows in
  useEffect(() => {
    if (reduced()) {
      setShown(plan.counts);
      return;
    }
    const ctx = gsap.context(() => {
      const from = { ...shown };
      const to = plan.counts;
      const proxy = { t: 0 };
      gsap.to(proxy, {
        t: 1,
        duration: 0.6,
        ease: "power2.out",
        onUpdate: () =>
          setShown({
            roles: Math.round(from.roles + (to.roles - from.roles) * proxy.t),
            categories: Math.round(from.categories + (to.categories - from.categories) * proxy.t),
            channels: Math.round(from.channels + (to.channels - from.channels) * proxy.t),
          }),
      });
      if (!first.current && tree.current) {
        gsap.fromTo(tree.current.querySelectorAll(".row"), { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.3, stagger: { each: 0.012, amount: 0.5 } });
      }
    });
    first.current = false;
    return () => ctx.revert();
    // shown is read only as the starting point of the roll, so it must not retrigger this effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const replay = () => {
    const rows = tree.current ? Array.from(tree.current.querySelectorAll<HTMLElement>(".row, .cat-name")) : [];
    if (reduced() || !rows.length) {
      setStage("done");
      return;
    }
    setStage("building");
    setProgress(0);
    const state = { p: 0 };
    gsap.set(rows, { opacity: 0.15 });
    gsap
      .timeline({ onComplete: () => setStage("done") })
      .to(rows, { opacity: 1, duration: 0.12, stagger: 1.8 / rows.length, ease: "none" }, 0)
      .to(state, { p: 100, duration: 1.8, ease: "none", onUpdate: () => setProgress(Math.round(state.p)) }, 0);
  };

  const summary = dict.plotter.summary
    .replace("{categories}", String(plan.counts.categories))
    .replace("{channels}", String(plan.counts.channels))
    .replace("{roles}", String(plan.counts.roles));

  return (
    <section className="plotter sheet hero-fade" aria-label={dict.plotter.title}>
      <div className="sheet-head">
        <span>{dict.plotter.title}</span>
        <span className={stage === "done" ? "pct done" : "pct"} aria-hidden="true">
          {stage === "building" ? `${progress}%` : stage === "done" ? dict.plotter.done : ""}
        </span>
      </div>

      <div className="chip-row" role="group" aria-label={dict.plotter.chipsLabel}>
        {themes.map((t) => (
          <button
            key={t.id}
            type="button"
            className="chip-btn"
            aria-pressed={picked.includes(t.id)}
            disabled={!picked.includes(t.id) && picked.length >= MAX_MIX}
            onClick={() => toggle(t.id)}
          >
            {labelOf(t.id)}
          </button>
        ))}
      </div>
      <p className="hint">{picked.length >= MAX_MIX ? dict.plotter.limit : picked.length > 1 ? dict.plotter.proNote : dict.plotter.hint}</p>

      <dl className="counts">
        <div>
          <dd>{shown.categories}</dd>
          <dt>{dict.plotter.categories}</dt>
        </div>
        <div>
          <dd>{shown.channels}</dd>
          <dt>{dict.plotter.channels}</dt>
        </div>
        <div>
          <dd>{shown.roles}</dd>
          <dt>{dict.plotter.roles}</dt>
        </div>
        <div>
          <dd>{plan.rules}</dd>
          <dt>{dict.plotter.rules}</dt>
        </div>
      </dl>

      <div className="tree" ref={tree} tabIndex={0} role="region" aria-label={plan.label}>
        {plan.categories.map((cat) => (
          <div key={cat.name} className="cat">
            <div className="cat-name">{cat.name}</div>
            <ul>
              {cat.channels.map((ch) => (
                <li key={ch.name} className="row">
                  <span className="row-mark" aria-hidden="true">
                    {ch.type === "voice" ? "◖" : "#"}
                  </span>
                  {ch.name}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {stage === "done" ? <div className="stamp">{dict.plotter.done}</div> : null}
      </div>

      <div className="sheet-foot">
        <button type="button" className="btn btn-sm" onClick={replay} disabled={stage === "building"}>
          {dict.plotter.build}
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>
    </section>
  );
}

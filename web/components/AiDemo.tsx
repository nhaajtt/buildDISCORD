"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import type { Dict } from "@/content/types";
import { ai, type Level } from "@/content/data";

const levels: Level[] = ["nhe", "troll", "nham"];
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// The AI section: three real answers, one per humor level, typed out when you switch
export default function AiDemo({ dict }: { dict: Dict }) {
  const [level, setLevel] = useState<Level>("troll");
  const sample = ai.samples[level];
  const welcome = sample.welcome.replace("{user}", "@bạn");
  const [typed, setTyped] = useState(welcome);
  const result = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced()) {
      setTyped(welcome);
      return;
    }
    let i = 0;
    setTyped("");
    const timer = setInterval(() => {
      i += 2;
      setTyped(welcome.slice(0, i));
      if (i >= welcome.length) clearInterval(timer);
    }, 16);
    const ctx = gsap.context(() => {
      if (result.current) gsap.fromTo(result.current.querySelectorAll(".chip, .row, .cat-name"), { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.025, ease: "power2.out" });
    });
    return () => {
      clearInterval(timer);
      ctx.revert();
    };
  }, [level, welcome]);

  const labelOf = (l: Level) => dict.ai.levels[levels.indexOf(l)];

  return (
    <div className="ai-grid">
      <div className="sheet" data-in>
        <div className="side-label">{dict.ai.inputLabel}</div>
        <p className="ai-cmd">
          <code>/thietke</code> <span className="arg">mota:</span> {dict.ai.description} <span className="arg">muc-do-hai:</span> {labelOf(level)}
        </p>
        <div className="side-label">{dict.ai.levelLabel}</div>
        <div className="chip-row" role="group" aria-label={dict.ai.levelLabel}>
          {levels.map((l) => (
            <button key={l} type="button" className="chip-btn" aria-pressed={level === l} onClick={() => setLevel(l)}>
              {labelOf(l)}
            </button>
          ))}
        </div>
        <p className="note">{dict.ai.plan}</p>
        <p className="note">{dict.ai.provenance.replace("{date}", ai.generatedAt).replace("{model}", ai.model)}</p>
      </div>

      <div className="sheet" data-in ref={result}>
        <div className="side-label">
          {dict.ai.resultLabel}: {sample.label}
        </div>
        <p className="ai-welcome" aria-live="polite">
          {typed}
          <span className="caret" aria-hidden="true" />
        </p>
        <div className="chips">
          {sample.roles.map((r) => (
            <span key={r} className="chip">
              {r}
            </span>
          ))}
        </div>
        {sample.categories.map((cat) => (
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
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { Dict } from "@/content/types";
import { planFor } from "@/content/data";
import SectionHead from "./SectionHead";

const plan = planFor(["gaming"]);
const rules = [
  "Cấm spam. Gửi 47 tin nhắn liên tiếp không làm bạn nói đúng hơn, chỉ làm bạn bị mute nhanh hơn.",
  "Mod luôn đúng. Nếu mod sai, xem lại điều 1 của luật này.",
];
// Step boundaries, as a share of the scroll distance
const bounds = [0, 0.14, 0.4, 0.82, 0.93];

// The signature scene: the server is built as you scroll. On narrow screens and under reduced motion it is a plain static sheet.
export default function BuildScene({ dict, label }: { dict: Dict; label: string }) {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia(root);
    mm.add("(min-width: 901px) and (prefers-reduced-motion: no-preference)", () => {
      const scene = root.current!;
      scene.classList.add("pinned");
      const pct = scene.querySelector<HTMLElement>(".pct")!;
      const steps = Array.from(scene.querySelectorAll<HTMLElement>(".steps li"));

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: scene,
          start: "top top",
          end: "+=2800",
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
      tl.from(scene.querySelectorAll(".corner"), { scale: 0, duration: 0.3, stagger: 0.05 }, 0)
        .from(scene.querySelector(".cmd"), { opacity: 0, duration: 0.4 }, 0.1)
        .from(scene.querySelectorAll(".chip"), { opacity: 0, scale: 0.6, stagger: 0.1, duration: 0.3 }, 0.55)
        .from(scene.querySelectorAll(".srv-cats .cat-name"), { opacity: 0, x: -16, stagger: 0.5, duration: 0.4 }, 1.6)
        .from(scene.querySelectorAll(".srv-cats .row"), { opacity: 0, x: -14, stagger: 0.09, duration: 0.3 }, 1.7)
        .from(scene.querySelector(".rules-card"), { opacity: 0, y: 30, duration: 0.6 }, 3.2)
        .from(scene.querySelector(".stamp"), { opacity: 0, scale: 2.4, rotate: -18, duration: 0.4, ease: "power4.in" }, 3.65)
        .to({}, { duration: 0.3 });

      return () => {
        scene.classList.remove("pinned");
      };
    });
    return () => mm.revert();
  }, []);

  return (
    <section className="scene" id="how" aria-labelledby="how-title" ref={root}>
      <div className="scene-inner">
        <div className="scene-copy">
          <SectionHead id="how-title" title={dict.scene.title} label={label} />
          <ol className="steps">
            {dict.scene.steps.map((s, i) => (
              <li key={s.t} className={i === 0 ? "on" : ""}>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="srv" aria-hidden="true">
          <span className="corner tl" />
          <span className="corner tr" />
          <span className="corner bl" />
          <span className="corner br" />
          <div className="srv-bar">
            <span className="cmd">{dict.scene.cmd}</span>
            <span className="pct">100%</span>
          </div>
          <div className="srv-grid">
            <div className="srv-cats">
              {plan.categories.map((cat) => (
                <div key={cat.name} className="cat">
                  <div className="cat-name">{cat.name}</div>
                  <ul>
                    {cat.channels.map((ch) => (
                      <li key={ch.name} className="row">
                        <span className="row-mark">{ch.type === "voice" ? "◖" : "#"}</span>
                        {ch.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="srv-side">
              <div className="side-label">{dict.scene.roles}</div>
              <div className="chips">
                {plan.roles.slice(0, 7).map((r) => (
                  <span key={r} className="chip">
                    {r}
                  </span>
                ))}
              </div>
              <div className="rules-card">
                <div className="side-label">{dict.scene.rules}</div>
                {rules.map((r) => (
                  <p key={r}>{r}</p>
                ))}
              </div>
              <div className="stamp">{dict.scene.stamp}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

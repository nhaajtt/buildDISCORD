"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

type Section = { id: string; label: string };

// Page-wide motion in one place: smooth scroll, heading and card reveals, drawn dimension lines, the drafting crosshair,
// magnetic buttons and the scroll ruler. Everything except the ruler is switched off under prefers-reduced-motion.
export default function Motion({ sections, intro = true }: { sections: Section[]; intro?: boolean }) {
  const marker = useRef<HTMLDivElement>(null);
  const markerLabel = useRef<HTMLSpanElement>(null);
  const vLine = useRef<HTMLDivElement>(null);
  const hLine = useRef<HTMLDivElement>(null);
  const tag = useRef<HTMLDivElement>(null);

  // The ruler follows the scroll position even when motion is reduced, because it only reports where you are
  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
      if (marker.current) marker.current.style.top = `${progress * (innerHeight - 56)}px`;
      let current = "";
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= innerHeight * 0.4) current = s.label;
      }
      if (markerLabel.current && markerLabel.current.textContent !== current) markerLabel.current.textContent = current;
    };
    update();
    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    return () => {
      removeEventListener("scroll", update);
      removeEventListener("resize", update);
    };
  }, [sections]);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const cleanups: (() => void)[] = [];

      // One smooth-scroll engine for the whole page, wired into ScrollTrigger
      const lenis = new Lenis({ lerp: 0.1 });
      lenis.on("scroll", ScrollTrigger.update);
      const tick = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
      lenis.on("scroll", ({ scroll }: { scroll: number }) => document.documentElement.style.setProperty("--gy", `${-((scroll * 0.2) % 120)}px`));

      const onAnchor = (event: MouseEvent) => {
        const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
        const id = link?.getAttribute("href")?.slice(1);
        const target = id ? document.getElementById(id) : null;
        if (!link || !target) return;
        event.preventDefault();
        lenis.scrollTo(target, { offset: -72 });
      };
      document.addEventListener("click", onAnchor);
      cleanups.push(() => document.removeEventListener("click", onAnchor));
      document.fonts?.ready.then(() => ScrollTrigger.refresh());

      // Script is running, so hand over from the CSS hiding rules to GSAP's own starting states
      document.querySelectorAll<HTMLElement>(".u, .dim-line, .dim-label, .hero-fade, [data-in]").forEach((el) => {
        el.style.animation = "none";
        el.style.translate = "none";
        el.style.scale = "none";
      });
      const prime = (selector: string, vars: gsap.TweenVars) => {
        const targets = gsap.utils.toArray<HTMLElement>(selector);
        if (targets.length) gsap.set(targets, vars);
      };
      prime(".u", { yPercent: 115 });
      prime(".dim-line", { scaleX: 0, transformOrigin: "left center" });
      prime(".hero-fade", { y: 16 });

      // Hero entrance: one orchestrated sequence. The CSS keeps letters hidden until now (and unhides them itself if script never runs).
      if (intro) {
        const hero = document.querySelector(".hero");
        if (hero) {
          gsap
            .timeline({ defaults: { ease: "power4.out" } })
            .to(hero.querySelectorAll(".u"), { yPercent: 0, duration: 1, stagger: 0.02 }, 0.05)
            .to(hero.querySelectorAll(".dim-line"), { scaleX: 1, duration: 0.9 }, 0.5)
            .to(hero.querySelectorAll(".dim-label"), { opacity: 1, duration: 0.4 }, 1.1)
            .to(hero.querySelectorAll(".hero-fade"), { opacity: 1, y: 0, duration: 0.8, stagger: 0.1 }, 0.55);
        }
      }

      // Section headings rise word by word, dimension lines draw in
      gsap.utils.toArray<HTMLElement>(".sec-head").forEach((head) => {
        const trigger = { trigger: head, start: "top 85%", once: true };
        gsap.to(head.querySelectorAll(".u"), { yPercent: 0, duration: 0.85, ease: "power4.out", stagger: 0.05, scrollTrigger: trigger });
        gsap.to(head.querySelectorAll(".dim-line"), { scaleX: 1, duration: 0.9, ease: "power3.out", scrollTrigger: trigger });
        gsap.to(head.querySelectorAll(".dim-label"), { opacity: 1, duration: 0.4, delay: 0.6, scrollTrigger: trigger });
      });

      // Cards and blocks come in together, in a short stagger
      const cards = gsap.utils.toArray<HTMLElement>("[data-in]");
      if (cards.length) gsap.set(cards, { y: 26 });
      if (cards.length) ScrollTrigger.batch(cards, {
        start: "top 90%",
        once: true,
        onEnter: (batch) => gsap.to(batch, { y: 0, opacity: 1, duration: 0.7, stagger: 0.08, ease: "power3.out", overwrite: true }),
      });

      // Drafting crosshair and magnetic buttons, only where a real pointer exists
      if (matchMedia("(pointer: fine) and (hover: hover)").matches && vLine.current && hLine.current && tag.current) {
        const v = gsap.quickTo(vLine.current, "x", { duration: 0.35, ease: "power3" });
        const h = gsap.quickTo(hLine.current, "y", { duration: 0.35, ease: "power3" });
        const tx = gsap.quickTo(tag.current, "x", { duration: 0.35, ease: "power3" });
        const ty = gsap.quickTo(tag.current, "y", { duration: 0.35, ease: "power3" });
        const root = document.documentElement;
        const move = (e: PointerEvent) => {
          root.classList.add("xh-on");
          v(e.clientX);
          h(e.clientY);
          tx(e.clientX + 14);
          ty(e.clientY + 14);
          if (tag.current) tag.current.textContent = `x ${String(Math.round(e.clientX)).padStart(4, "0")}  y ${String(Math.round(e.clientY + scrollY)).padStart(4, "0")}`;
          root.classList.toggle("xh-hot", Boolean((e.target as Element).closest("a, button, summary, input, [data-hot]")));
        };
        const leave = () => root.classList.remove("xh-on");
        addEventListener("pointermove", move, { passive: true });
        document.addEventListener("pointerleave", leave);
        cleanups.push(() => {
          removeEventListener("pointermove", move);
          document.removeEventListener("pointerleave", leave);
          root.classList.remove("xh-on", "xh-hot");
        });

        document.querySelectorAll<HTMLElement>(".btn").forEach((btn) => {
          const mx = gsap.quickTo(btn, "x", { duration: 0.4, ease: "power3" });
          const my = gsap.quickTo(btn, "y", { duration: 0.4, ease: "power3" });
          const onMove = (e: PointerEvent) => {
            const r = btn.getBoundingClientRect();
            mx((e.clientX - (r.left + r.width / 2)) * 0.22);
            my((e.clientY - (r.top + r.height / 2)) * 0.28);
          };
          const onLeave = () => {
            mx(0);
            my(0);
          };
          btn.addEventListener("pointermove", onMove);
          btn.addEventListener("pointerleave", onLeave);
          cleanups.push(() => {
            btn.removeEventListener("pointermove", onMove);
            btn.removeEventListener("pointerleave", onLeave);
          });
        });
      }

      return () => {
        cleanups.forEach((fn) => fn());
        gsap.ticker.remove(tick);
        lenis.destroy();
        document.documentElement.style.removeProperty("--gy");
      };
    });

    return () => mm.revert();
  }, [intro]);

  return (
    <>
      <div className="xh-v" ref={vLine} aria-hidden="true" />
      <div className="xh-h" ref={hLine} aria-hidden="true" />
      <div className="xh-tag" ref={tag} aria-hidden="true" />
      <div className="ruler" aria-hidden="true">
        <div className="ruler-marker" ref={marker}>
          <span ref={markerLabel} />
        </div>
      </div>
    </>
  );
}

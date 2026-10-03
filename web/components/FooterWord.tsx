"use client";

import { useRef } from "react";

// The giant outlined word: letters near the mouse lift and fill in
export default function FooterWord({ word }: { word: string }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const x = event.clientX;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      box.current?.querySelectorAll<HTMLElement>("span").forEach((letter) => {
        const r = letter.getBoundingClientRect();
        const near = Math.max(0, 1 - Math.abs(x - (r.left + r.width / 2)) / 240);
        letter.style.translate = `0 ${(-near * 28).toFixed(1)}px`;
        letter.classList.toggle("lit", near > 0.55);
      });
    });
  };
  const leave = () => {
    cancelAnimationFrame(frame.current);
    box.current?.querySelectorAll<HTMLElement>("span").forEach((letter) => {
      letter.style.translate = "";
      letter.classList.remove("lit");
    });
  };

  return (
    <div className="giant" aria-hidden="true" ref={box} onPointerMove={move} onPointerLeave={leave} data-hot>
      {Array.from(word).map((c, i) => (
        <span key={i}>{c === " " ? " " : c}</span>
      ))}
    </div>
  );
}

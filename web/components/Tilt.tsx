"use client";

import type { PointerEvent, ReactNode } from "react";
import { useRef } from "react";

// A card that leans toward the mouse. The outer element is left for the scroll reveal, the inner one carries the tilt.
export default function Tilt({ children, className }: { children: ReactNode; className?: string }) {
  const inner = useRef<HTMLDivElement>(null);

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || matchMedia("(prefers-reduced-motion: reduce)").matches || !inner.current) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    inner.current.style.setProperty("--rx", `${(-y * 7).toFixed(2)}deg`);
    inner.current.style.setProperty("--ry", `${(x * 9).toFixed(2)}deg`);
    inner.current.style.setProperty("--gx", `${((x + 0.5) * 100).toFixed(0)}%`);
  };
  const leave = () => {
    inner.current?.style.setProperty("--rx", "0deg");
    inner.current?.style.setProperty("--ry", "0deg");
  };

  return (
    <div className={className} data-in onPointerMove={move} onPointerLeave={leave}>
      <div className="tilt-inner" ref={inner}>
        {children}
      </div>
    </div>
  );
}

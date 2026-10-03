"use client";

import { useEffect, useState } from "react";

export type TocItem = { id: string; text: string; level: number };

// The contents list: highlights the section you are reading
export default function DevlogToc({ items, title }: { items: TocItem[]; title: string }) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const update = () => {
      let current = items[0]?.id ?? "";
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top <= 120) current = item.id;
      }
      setActive(current);
    };
    update();
    addEventListener("scroll", update, { passive: true });
    return () => removeEventListener("scroll", update);
  }, [items]);

  return (
    <nav className="toc" aria-label={title}>
      <div className="side-label">{title}</div>
      <ul>
        {items.map((item) => (
          <li key={item.id} className={item.level > 2 ? "sub" : ""}>
            <a href={`#${item.id}`} aria-current={active === item.id ? "location" : undefined}>
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

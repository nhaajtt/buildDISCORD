"use client";

import { useRef, useState } from "react";

// A code block with a copy button
export default function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // clipboard can be blocked; the flag then simply does not claim success
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1400);
  };

  return (
    <figure className="code">
      <figcaption>
        <span>{lang || "text"}</span>
        <button type="button" onClick={copy} aria-live="polite">
          {copied ? "copied" : "copy"}
        </button>
      </figcaption>
      <pre tabIndex={0}>
        <code>{code}</code>
      </pre>
    </figure>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

// A command name that copies itself when pressed
export default function CopyCommand({ name, args, copied, hint }: { name: string; args: string; copied: string; hint: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(name);
    } catch {
      // clipboard can be blocked (insecure context, permissions); the flag then still tells the visitor what to type
    }
    setDone(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 1500);
  };

  return (
    <button type="button" className="cmd-copy" onClick={copy} data-hot>
      <code>
        {name}
        {args
          ? args.split(" ").map((arg) => (
              <span key={arg} className="arg">
                {" "}
                {arg}
              </span>
            ))
          : null}
      </code>
      <span className="copy-flag" aria-live="polite">
        {done ? copied : hint}
      </span>
    </button>
  );
}

"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import type { Dict } from "@/content/types";
import { ai, plans, textChannelName, type Channel } from "@/content/data";

type Cat = { name: string; locked?: boolean; dj?: boolean; channels: Channel[] };

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// The same starting point as a real blueprint: the admin area, a themed part from the AI, and the DJ rooms
function initial(): Cat[] {
  const base = plans.gaming.categories;
  const admin = base[0];
  const dj = base.find((c) => c.channels.some((ch) => ch.name.includes("dj-booth")))!;
  return [
    { name: admin.name, locked: true, channels: admin.channels },
    ...ai.samples.troll.categories.map((c) => ({ name: c.name, channels: c.channels })),
    { name: dj.name, dj: true, channels: dj.channels },
  ];
}

// A working miniature of the bot's blueprint editor. The rules are the bot's own (see src/blueprints.js):
// the first category cannot be removed, renames cannot collide, new channels go to the first themed category.
export default function EditorDemo({ dict }: { dict: Dict }) {
  const t = dict.editor;
  const [cats, setCats] = useState<Cat[]>(initial);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<"text" | "voice">("text");
  const [status, setStatus] = useState("");
  const [phase, setPhase] = useState<"edit" | "building" | "done">("edit");
  const [progress, setProgress] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  const channelCount = cats.reduce((n, c) => n + c.channels.length, 0);
  const counts = t.counts.replace("{c}", String(cats.length)).replace("{ch}", String(channelCount));
  const busy = phase === "building";

  const remove = (index: number) => {
    const target = cats[index];
    if (!target || target.locked || busy) return;
    setCats(cats.filter((_, i) => i !== index));
    setStatus(t.removed.replace("{name}", target.name));
    setPhase("edit");
  };

  const commitRename = () => {
    if (editing === null) return;
    const next = draft.replace(/\s+/g, " ").trim();
    const clash = cats.some((c, i) => i !== editing && c.name === next);
    if (next && !clash) {
      setCats(cats.map((c, i) => (i === editing ? { ...c, name: next } : c)));
      setStatus(t.renamed);
    } else if (clash) {
      setStatus(t.duplicate);
    }
    setEditing(null);
  };

  const add = () => {
    const clean = name.replace(/\s+/g, " ").trim();
    if (!clean || busy) return;
    const channelName = type === "voice" ? clean : textChannelName(clean);
    if (cats.some((c) => c.channels.some((ch) => ch.name === channelName))) {
      setStatus(t.duplicate);
      return;
    }
    const next = cats.map((c) => ({ ...c, channels: [...c.channels] }));
    let target = next.find((c, i) => i > 0 && !c.dj);
    if (!target) {
      target = { name: "🆕 Khu Mới", channels: [] };
      next.splice(Math.max(1, next.findIndex((c) => c.dj)), 0, target);
    }
    target.channels.push({ name: channelName, type });
    setCats(next);
    setName("");
    setStatus(t.added.replace("{name}", channelName));
    setPhase("edit");
  };

  const build = () => {
    const rows = list.current ? Array.from(list.current.querySelectorAll<HTMLElement>(".row")) : [];
    if (reduced() || !rows.length) {
      setPhase("done");
      setStatus(t.done);
      return;
    }
    setPhase("building");
    setStatus(t.building);
    setProgress(0);
    const state = { p: 0 };
    gsap.set(rows, { opacity: 0.18 });
    gsap
      .timeline({
        onComplete: () => {
          setPhase("done");
          setStatus(t.done);
        },
      })
      .to(rows, { opacity: 1, duration: 0.12, stagger: 2 / rows.length, ease: "none" }, 0)
      .to(state, { p: 100, duration: 2, ease: "none", onUpdate: () => setProgress(Math.round(state.p)) }, 0);
  };

  const reset = () => {
    setCats(initial());
    setEditing(null);
    setName("");
    setPhase("edit");
    setStatus("");
  };

  return (
    <div className="sheet editor" data-in>
      <div className="sheet-head">
        <span>{t.tryLabel}</span>
        <span className={phase === "done" ? "pct done" : "pct"} aria-hidden="true">
          {phase === "building" ? `${progress}%` : phase === "done" ? dict.plotter.done : counts}
        </span>
      </div>

      <div className="tree editor-tree" ref={list}>
        {cats.map((cat, i) => (
          <div key={cat.name} className="cat">
            <div className="cat-line">
              {editing === i ? (
                <input
                  className="inline-input"
                  value={draft}
                  autoFocus
                  maxLength={90}
                  aria-label={t.rename}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="cat-name rename"
                  disabled={busy}
                  title={t.renameHint}
                  onClick={() => {
                    setDraft(cat.name);
                    setEditing(i);
                  }}
                >
                  {cat.name}
                </button>
              )}
              {cat.locked ? (
                <span className="lock">{t.locked}</span>
              ) : (
                <button type="button" className="x-btn" onClick={() => remove(i)} disabled={busy} aria-label={`${t.remove}: ${cat.name}`}>
                  {t.remove}
                </button>
              )}
            </div>
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

      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input className="inline-input" value={name} maxLength={60} placeholder={t.addPlaceholder} aria-label={t.add} onChange={(e) => setName(e.target.value)} disabled={busy} />
        <select className="inline-select" value={type} onChange={(e) => setType(e.target.value as "text" | "voice")} aria-label={t.add} disabled={busy}>
          <option value="text">{t.text}</option>
          <option value="voice">{t.voice}</option>
        </select>
        <button type="submit" className="btn btn-sm btn-ghost" disabled={busy || !name.trim()}>
          + {t.add}
        </button>
      </form>

      <div className="sheet-foot">
        <button type="button" className="btn btn-sm" onClick={build} disabled={busy || channelCount === 0}>
          {t.build}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={reset} disabled={busy}>
          {t.reset}
        </button>
      </div>
      <p className="note" role="status" aria-live="polite">
        {status || counts}
      </p>
    </div>
  );
}

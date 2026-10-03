"use client";

import { useCallback, useEffect, useState } from "react";
import type { Dict } from "@/content/types";
import { STATUS_URL } from "@/content/site";

type Health = { ok: boolean; version: string; uptimeSec: number; guilds: number; lastHeartbeatAgeSec: number | null };
type State = { kind: "checking" } | { kind: "unknown" } | { kind: "done"; health: Health };

const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));

// The answer is untrusted input from the network: accept only the exact shape and clip the text
function asHealth(value: unknown): Health | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.ok !== "boolean" || typeof v.uptimeSec !== "number" || typeof v.version !== "string" || typeof v.guilds !== "number") return null;
  const age = typeof v.lastHeartbeatAgeSec === "number" ? v.lastHeartbeatAgeSec : null;
  return { ok: v.ok, version: v.version.slice(0, 20), uptimeSec: Math.max(0, v.uptimeSec), guilds: Math.max(0, Math.floor(v.guilds)), lastHeartbeatAgeSec: age };
}

function formatUptime(sec: number, u: Dict["status"]["uptime"]) {
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days} ${u.d} ${hours} ${u.h}`;
  if (hours > 0) return `${hours} ${u.h} ${minutes} ${u.m}`;
  if (minutes > 0) return `${minutes} ${u.m}`;
  return `${Math.floor(sec)} ${u.s}`;
}

// Reads the bot's public status route in the browser. The card keeps one fixed layout in every state, so nothing moves when the answer arrives.
export default function StatusPanel({ dict }: { dict: Dict }) {
  const t = dict.status;
  const [state, setState] = useState<State>({ kind: "checking" });

  const check = useCallback(async () => {
    setState({ kind: "checking" });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(STATUS_URL, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const health = asHealth(await response.json());
      setState(health ? { kind: "done", health } : { kind: "unknown" });
    } catch {
      setState({ kind: "unknown" });
    } finally {
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const health = state.kind === "done" ? state.health : null;
  const tone = state.kind === "checking" ? "wait" : health ? (health.ok ? "ok" : "slow") : "off";
  const headline = state.kind === "checking" ? t.checking : health ? (health.ok ? t.ok : t.slow) : t.unknown;
  const dash = "–";

  return (
    <div className="status-card" data-tone={tone}>
      <div className="status-head" role="status" aria-live="polite">
        <span className="status-dot" aria-hidden="true" />
        <span className="status-text">{headline}</span>
      </div>
      <p className="status-hint">{tone === "off" ? t.unknownHint : " "}</p>
      <dl className="status-grid">
        <div>
          <dt>{t.fields.version}</dt>
          <dd>{health ? health.version : dash}</dd>
        </div>
        <div>
          <dt>{t.fields.uptime}</dt>
          <dd>{health ? formatUptime(health.uptimeSec, t.uptime) : dash}</dd>
        </div>
        <div>
          <dt>{t.fields.servers}</dt>
          <dd>{health ? fill(t.servers, { n: health.guilds }) : dash}</dd>
        </div>
        <div>
          <dt>{t.fields.heartbeat}</dt>
          <dd>{health && health.lastHeartbeatAgeSec !== null ? fill(t.ago, { n: health.lastHeartbeatAgeSec }) : dash}</dd>
        </div>
      </dl>
      <div className="status-foot">
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => void check()} disabled={state.kind === "checking"}>
          {t.retry}
        </button>
        <p className="note">{t.note}</p>
      </div>
    </div>
  );
}

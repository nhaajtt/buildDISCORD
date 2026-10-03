import { alertLines, digestLines as t } from "../humor/digest.js";

// Pure builders: numbers in, a plain embed description out. The Discord layer turns it into an EmbedBuilder.

const colorOf = (score) => (score === null ? 0x95a5a6 : score >= 75 ? 0x2ecc71 : score >= 55 ? 0xf5c518 : score >= 35 ? 0xe67e22 : 0xe74c3c);
const count = (n) => String(Math.max(0, Math.trunc(Number(n) || 0)));
const cap = (value, max) => String(value ?? "").slice(0, max);
export const MAX_SUGGESTIONS = 3;

export function healthLine(score, previous) {
  if (!Number.isInteger(score)) return t.healthNoData;
  if (!Number.isInteger(previous)) return t.healthFirst(score);
  if (score > previous) return t.healthUp(score, score - previous);
  if (score < previous) return t.healthDown(score, previous - score);
  return t.healthFlat(score);
}

// Up to three things to do. Safe fixes come first and each carries its fixId, which becomes a button. The rest are plain text.
export function suggest(stats) {
  const out = [];
  for (const fix of stats.fixes ?? []) {
    if (out.length >= MAX_SUGGESTIONS) break;
    out.push({ text: `${cap(fix.title, 80)}: ${cap(fix.change, 160)}`, fixId: fix.id, title: cap(fix.title, 60) });
  }
  const extra = [];
  if (Number.isInteger(stats.score) && stats.score < 55 && !out.length) extra.push(t.tipHealth);
  if (stats.automodOn === false) extra.push(t.tipAutomod);
  if ((stats.openTickets ?? 0) >= 5) extra.push(t.tipTickets(stats.openTickets));
  if ((stats.joins ?? 0) >= 50) extra.push(t.tipJoinsHigh(stats.joins));
  for (const text of extra) if (out.length < MAX_SUGGESTIONS) out.push({ text, fixId: null });
  return out;
}

export function buildDigest(stats, { guildName = "server", preview = false } = {}) {
  const suggestions = suggest(stats);
  const lines = suggestions.length ? suggestions.map((s) => `• ${s.text}`).join("\n") : t.allGood;
  return {
    embed: {
      title: preview ? t.previewTitle : t.title,
      color: colorOf(Number.isInteger(stats.score) ? stats.score : null),
      description: cap(t.intro(cap(guildName, 80)), 400),
      fields: [
        { name: t.joins, value: count(stats.joins), inline: true },
        { name: t.ticketsOpened, value: count(stats.ticketsOpened), inline: true },
        { name: t.ticketsClosed, value: count(stats.ticketsClosed), inline: true },
        { name: t.automod, value: count(stats.automodBlocks), inline: true },
        { name: t.health, value: healthLine(stats.score, stats.previousScore), inline: false },
        { name: t.suggestions, value: cap(lines, 1000), inline: false },
      ],
      footer: `${preview ? t.footerPreview : t.footer} ${t.joinNote}`.slice(0, 2000),
    },
    suggestions,
    fixIds: suggestions.map((s) => s.fixId).filter(Boolean),
  };
}

// The alert for a score that dropped. Findings are sorted here, so the caller does not have to.
export function buildDropAlert({ before, after, findings = [], fixes = [] }) {
  const order = { cao: 0, vua: 1, thap: 2 };
  const top = [...findings].sort((a, b) => (order[a?.severity] ?? 9) - (order[b?.severity] ?? 9)).slice(0, 3);
  const list = top.length ? top.map((f) => `• ${cap(f.title, 100)}`).join("\n") : "";
  const parts = [alertLines.description(before, after)];
  if (list) parts.push(`**${alertLines.topFindings}**\n${list}`);
  parts.push(fixes.length ? alertLines.fixHint : alertLines.noFix);
  return {
    embed: { title: alertLines.title, color: 0xe74c3c, description: cap(parts.join("\n\n"), 3500), footer: alertLines.footer },
    fixIds: fixes.map((f) => f.id),
  };
}

import { PermissionFlagsBits } from "discord.js";
import { cleanText } from "../activity/text.js";

// Pure rules of the suggestion box: no Discord calls, no database.

export const MAX_BODY = 500;
export const MAX_NOTE = 300;
export const MIN_GAP_MS = 60_000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_PER_DAY = 5;

export const DECISIONS = {
  ok: { status: "approved", label: "Duyệt" },
  no: { status: "rejected", label: "Từ chối" },
  done: { status: "done", label: "Đã làm" },
};

// Text from a person, made safe to show in an embed: no mention syntax, no masked links, one line, capped
export function sanitize(value, max) {
  const text = cleanText(value, max * 2)
    .replace(/@(everyone|here)/gi, "")
    .replace(/<(?:@[!&]?|#)\d*>?/g, "")
    .replace(/<[@#&!][^>]*>/g, "")
    .replace(/\]\s*\(/g, "] (")
    .replace(/\s{2,}/g, " ")
    .trim();
  return text.slice(0, max).trim();
}

export const cleanSuggestion = (value) => sanitize(value, MAX_BODY);
export const cleanNote = (value) => sanitize(value, MAX_NOTE);

// `times` are the creation times of the person's suggestions from the last day. One per minute, five per day.
export function checkRate(times, now) {
  const recent = times.filter((t) => now - t < DAY_MS);
  const last = recent.length ? Math.max(...recent) : null;
  if (last !== null && now - last < MIN_GAP_MS) return { ok: false, reason: "fast", waitSec: Math.ceil((MIN_GAP_MS - (now - last)) / 1000) };
  if (recent.length >= MAX_PER_DAY) return { ok: false, reason: "day", max: MAX_PER_DAY };
  return { ok: true };
}

// Staff are people with Manage Server or the staff role from the settings. Asked again at every press.
export function isStaff(member, settings) {
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.ManageGuild)) return true;
  return Boolean(settings?.staffRoleId && member.roles?.cache?.has?.(settings.staffRoleId));
}

export const canManage = (member) => Boolean(member?.permissions?.has?.(PermissionFlagsBits.ManageGuild));

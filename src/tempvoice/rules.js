import { PermissionFlagsBits as P } from "discord.js";
import { cleanText } from "../activity/text.js";

// Pure rules of the temporary voice rooms. No Discord, no database.

export const ROOM_CAP = 50;
export const COOLDOWN_MS = 10_000;
export const MAX_NAME = 100;
// A room younger than this is never swept, so one that is still being filled is not taken for an empty leftover
export const SWEEP_GRACE_MS = 30_000;
const COOLDOWN_KEEP = 2000;

// Template to a channel name: {name} (every occurrence) becomes the person's display name, then the whole is cleaned and capped at 100
export function roomName(template, displayName, fallback = "Phòng tạm") {
  const person = cleanText(String(displayName ?? ""), 60).replace(/[@#:`]/g, "");
  const filled = String(template ?? "").replaceAll("{name}", person || "bạn");
  return cleanText(filled, MAX_NAME) || fallback;
}

// What the room's creator is given on THAT channel only: see it, join it, rename it and move people out of it. Nothing server-wide.
export const OWNER_ALLOW = [P.ViewChannel, P.Connect, P.ManageChannels, P.MoveMembers];

export const ownerOverwrite = (userId) => ({ id: userId, allow: [...OWNER_ALLOW] });

// What the bot itself needs to build a room, by the flag name and the label shown to the admin
export const NEEDED = [
  ["ManageChannels", "Quản lý kênh"],
  ["MoveMembers", "Di chuyển thành viên"],
  ["ManageRoles", "Quản lý role"],
  ["ViewChannel", "Xem kênh"],
  ["Connect", "Kết nối"],
];

// One person may make a room every `ms`. The table is bounded so a flood of different people cannot grow it without end.
export function createCooldown({ ms = COOLDOWN_MS, keep = COOLDOWN_KEEP } = {}) {
  const last = new Map();
  return {
    // true and the clock starts when allowed, false (and no restart) while it is still running
    take(key, now = Date.now()) {
      const at = last.get(key);
      if (at !== undefined && now - at < ms) return false;
      if (last.size >= keep) for (const [k, t] of last) if (now - t >= ms) last.delete(k);
      if (last.size >= keep) last.delete(last.keys().next().value);
      last.set(key, now);
      return true;
    },
    size: () => last.size,
  };
}

// The lobbies the plan allows, in the order the admin added them
export const activeLobbies = (lobbyIds, limit) => lobbyIds.slice(0, Math.max(0, limit));

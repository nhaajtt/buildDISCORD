import { ActionRowBuilder, ButtonBuilder, ButtonStyle, OverwriteType, PermissionFlagsBits as P } from "discord.js";

// Pure ticket rules: naming, who can see a channel, who may do what, when a ticket is stale, how the panel is laid out.
// Nothing here talks to Discord or the database.

export const STATUS = { PENDING: "PENDING", OPEN: "OPEN", CLOSED: "CLOSED" };
export const COOLDOWN_MS = 30_000;
export const REASON_MAX = 300;

const DISCORD_EPOCH = 1420070400000n;
const EMOJI = /^(?:\p{Extended_Pictographic}[\u{FE0F}\u{200D}\p{Extended_Pictographic}]*|<a?:\w{2,32}:\d{17,20}>)$/u;

// Lowercase, no accents, only a-z 0-9 and single dashes, which is what a channel name keeps anyway
export function sanitize(name, max = 20) {
  return (
    String(name ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/, "") || ""
  );
}

export const channelName = (number, name) => `ticket-${number}-${sanitize(name) || "khach"}`;

// A type key from its label that is not taken yet
export function typeKey(label, taken) {
  const base = sanitize(label) || "loai";
  let key = base;
  for (let n = 2; taken.includes(key); n += 1) key = `${base.slice(0, 17)}-${n}`;
  return key;
}

export const validEmoji = (emoji) => !emoji || EMOJI.test(emoji);

// A staff role is only ever given view and send access in ticket channels, but it still must be a real team role
export function checkStaffRole(role, guildId) {
  return Boolean(role) && role.id !== guildId && !role.managed;
}

const MEMBER_ACCESS = [P.ViewChannel, P.SendMessages, P.AttachFiles, P.ReadMessageHistory];

// The full overwrite set of a ticket channel: @everyone cannot see it, only the opener, the staff role and the bot can
export function buildOverwrites({ guildId, openerId, staffRoleId, botId }) {
  const set = [
    { id: guildId, type: OverwriteType.Role, deny: [P.ViewChannel] },
    { id: openerId, type: OverwriteType.Member, allow: MEMBER_ACCESS },
  ];
  if (staffRoleId) set.push({ id: staffRoleId, type: OverwriteType.Role, allow: [...MEMBER_ACCESS, P.ManageMessages] });
  set.push({ id: botId, type: OverwriteType.Member, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ReadMessageHistory, P.ManageChannels] });
  return set;
}

// The opener's access as discord.js expects it for permissionOverwrites.edit, used to give it back on reopen
export const openerAccess = { ViewChannel: true, SendMessages: true, AttachFiles: true, ReadMessageHistory: true };

export function validateReason(raw, max = REASON_MAX) {
  const value = typeof raw === "string" ? raw.replace(/\r/g, "").trim() : "";
  return value && value.length <= max ? { ok: true, value } : { ok: false };
}

// Who may do what to a ticket in this state. Returns null when allowed, or the reason it is not.
export function permit(action, { ticket, userId, staff }) {
  const closed = ticket.status === STATUS.CLOSED;
  if (action === "claim") {
    if (!staff) return "notStaff";
    if (closed) return "alreadyClosed";
    return ticket.claimed_by && ticket.claimed_by !== userId ? "alreadyClaimed" : null;
  }
  if (action === "close") {
    if (!staff && ticket.user_id !== userId) return "notAllowed";
    return closed ? "alreadyClosed" : null;
  }
  if (action === "reopen" || action === "delete") {
    if (!staff) return "notStaff";
    return closed ? null : "notClosed";
  }
  return "notAllowed";
}

// Per-user cooldown in memory. The clock is injectable so tests do not wait.
export function createCooldown({ now = Date.now, ms = COOLDOWN_MS } = {}) {
  const last = new Map();
  return {
    // Milliseconds still to wait, 0 when the user may go ahead
    remaining(userId) {
      const at = last.get(userId);
      return at === undefined ? 0 : Math.max(0, at + ms - now());
    },
    mark(userId) {
      const t = now();
      last.set(userId, t);
      if (last.size > 500) for (const [id, at] of last) if (at + ms <= t) last.delete(id);
    },
    reset: () => last.clear(),
  };
}

export const snowflakeTime = (id) => Number((BigInt(id) >> 22n) + DISCORD_EPOCH);

// Open tickets whose last activity is older than `hours`. 0 hours turns the whole thing off.
export function selectStale(tickets, now, hours, lastActivityOf) {
  if (!hours || hours <= 0) return [];
  const limit = hours * 3_600_000;
  return tickets.filter((t) => t.status === STATUS.OPEN && now - lastActivityOf(t) > limit);
}

const button = (id, label, style, emoji) => {
  const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  return emoji ? b.setEmoji(emoji) : b;
};

// The panel: one button per type, at most 5 per row and 5 rows
export function panelRows(types) {
  const rows = [];
  for (let i = 0; i < types.length && rows.length < 5; i += 5) {
    rows.push(
      new ActionRowBuilder().addComponents(
        types.slice(i, i + 5).map((t) => button(`ticket:open:${t.key}`, t.label.slice(0, 80), ButtonStyle.Primary, validEmoji(t.emoji) ? t.emoji : "")),
      ),
    );
  }
  return rows;
}

export function ticketRow(id, { claimed = false } = {}) {
  return new ActionRowBuilder().addComponents(
    button(`ticket:claim:${id}`, claimed ? "Đã nhận" : "Nhận ticket", ButtonStyle.Success).setDisabled(claimed),
    button(`ticket:close:${id}`, "Đóng ticket", ButtonStyle.Danger),
    button(`ticket:closewhy:${id}`, "Đóng kèm lý do", ButtonStyle.Secondary),
  );
}

export function closedRow(id) {
  return new ActionRowBuilder().addComponents(
    button(`ticket:delete:${id}`, "Xoá kênh", ButtonStyle.Danger),
    button(`ticket:reopen:${id}`, "Mở lại", ButtonStyle.Success),
  );
}

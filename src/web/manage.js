import { getDb } from "../db.js";
import { getSection } from "../settings.js";
import { getPlan } from "../license.js";
import { gateFeature, gateLimit } from "../utils/gate.js";
import { track } from "../analytics.js";
import { DURATIONS, MINUTE } from "../activity/text.js";
import { lines as giveawayLines } from "../humor/giveaways.js";
import { lines as menuLines } from "../humor/rolemenus.js";
import {
  MAX_ACTIVE_GIVEAWAYS,
  buildGiveawayPayload,
  cancelGiveaway,
  closeGiveaway,
  countActive,
  countEntries,
  createGiveaway,
  discardGiveaway,
  getGiveaway,
  listGiveaways,
  rerollGiveaway,
  setGiveawayMessage,
} from "../activity/giveaways.js";
import { countMenus, createMenu, deleteMenu, getMenu, listMenus, postPanel, retirePanel } from "../activity/rolemenus.js";
import { roleProblem } from "../onboarding/safety.js";
import { HttpError } from "./auth.js";
import { validateChannelOnly, validateCount, validateEmpty, validateGiveaway, validateMenu } from "./validate.js";

// Giveaways, role menus, the counts on the overview and the optional side effects of the newer settings sections.
// The Discord-facing work goes through src/activity/*, the same code the slash commands use.

const PERM_LABELS = {
  ViewChannel: "Xem kênh",
  SendMessages: "Gửi tin nhắn",
  EmbedLinks: "Nhúng liên kết",
  ManageChannels: "Quản lý kênh",
  MoveMembers: "Di chuyển thành viên",
  ManageRoles: "Quản lý role",
  AddReactions: "Thêm biểu cảm",
};

// Names of the permissions the bot lacks in a channel. Empty when it has them, or when Discord cannot say.
export function missingInChannel(channel, me, flags = ["ViewChannel", "SendMessages", "EmbedLinks"]) {
  const perms = channel?.permissionsFor?.(me);
  if (!perms) return [];
  return flags.filter((flag) => !perms.has(flag)).map((flag) => PERM_LABELS[flag] ?? flag);
}

// Names of the server-wide permissions the bot lacks
export function missingInGuild(guild, flags) {
  const perms = guild.members?.me?.permissions;
  if (!perms?.has) return flags.map((flag) => PERM_LABELS[flag] ?? flag);
  return flags.filter((flag) => !perms.has(flag)).map((flag) => PERM_LABELS[flag] ?? flag);
}

const invalid = (checked) => {
  if (checked.error) throw new HttpError(400, checked.error);
  return checked.value;
};

const botIdOf = (ctx, guild) => ctx.client?.user?.id ?? guild.members?.me?.id;
const nameOf = (guild, id) => String(guild.channels.cache.get(id)?.name ?? "") || null;

// ---------------------------------------------------------------- views

export function giveawaysView(guild) {
  const rows = listGiveaways(guild.id, 15);
  return {
    open: countActive(guild.id),
    max: MAX_ACTIVE_GIVEAWAYS,
    durations: DURATIONS,
    list: rows.map((g) => ({
      id: g.id,
      prize: String(g.prize),
      status: g.status,
      winners: g.winners,
      winnerIds: g.winnerIds,
      endsAt: g.ends_at,
      entries: countEntries(g.id),
      channelId: g.channel_id,
      channelName: nameOf(guild, g.channel_id),
      roleId: g.roleId,
      roleName: g.roleId ? (guild.roles.cache.get(g.roleId)?.name ?? null) : null,
    })),
  };
}

export function menusView(guild) {
  const top = guild.members?.me?.roles?.highest?.position ?? -1;
  return {
    count: countMenus(guild.id),
    list: listMenus(guild.id).map((m) => ({
      id: m.id,
      title: String(m.title),
      mode: m.mode,
      posted: Boolean(m.message_id),
      channelId: m.message_id ? m.channel_id : null,
      channelName: m.message_id ? nameOf(guild, m.channel_id) : null,
      createdAt: m.created_at,
      roles: m.roles.map((r) => {
        const role = guild.roles.cache.get(r.id);
        return { id: r.id, emoji: r.emoji, name: role ? String(role.name ?? "") : null, unsafe: roleProblem(role, top) !== null };
      }),
    })),
  };
}

// Plain numbers for the overview. Nothing personal: pending reminders are deliberately not counted.
export function countsOf(guild) {
  const db = getDb();
  const n = (sql, ...args) => {
    try {
      return Number(db.prepare(sql).get(...args).n);
    } catch {
      return 0;
    }
  };
  const tempvoice = getSection(guild.id, "tempvoice");
  return {
    giveawaysOpen: countActive(guild.id),
    roleMenus: countMenus(guild.id),
    tempLobbies: tempvoice.lobbyChannelIds.length,
    tempRooms: n("SELECT COUNT(*) AS n FROM temp_voice WHERE guild_id = ?", guild.id),
    scheduledMessages: n("SELECT COUNT(*) AS n FROM scheduled_messages WHERE guild_id = ? AND status NOT IN ('done', 'cancelled', 'canceled', 'deleted', 'failed')", guild.id),
    suggestionsOpen: n("SELECT COUNT(*) AS n FROM suggestions WHERE guild_id = ? AND status IN ('open', 'pending', 'new')", guild.id),
  };
}

// ---------------------------------------------------------------- giveaways

const ownMessage = (message, botId) => !message?.author || message.author.id === botId;

async function findMessage(guild, g) {
  const channel = guild.channels.cache.get(g.channel_id);
  if (!channel || !g.message_id || !channel.messages?.fetch) return { channel, message: null };
  return { channel, message: await channel.messages.fetch(g.message_id).catch(() => null) };
}

async function createGiveawayRoute(guild, body, ctx, session) {
  const blocked = gateFeature(guild.id, "giveaways");
  if (blocked) throw new HttpError(403, blocked);
  const input = invalid(validateGiveaway(body, guild));
  if (countActive(guild.id) >= MAX_ACTIVE_GIVEAWAYS) throw new HttpError(409, giveawayLines.tooMany(MAX_ACTIVE_GIVEAWAYS));
  const missing = missingInChannel(input.channel, guild.members?.me);
  if (missing.length) throw new HttpError(502, `Thầu thiếu quyền ${missing.join(", ")} ở kênh đó nên không đăng giveaway được. Cấp quyền hoặc chọn kênh khác.`);
  const now = ctx.now();
  const id = createGiveaway({ guildId: guild.id, channelId: input.channel.id, hostId: session.userId, prize: input.prize, winners: input.winners, endsAt: now + input.minutes * MINUTE, roleId: input.roleId, now });
  try {
    const sent = await input.channel.send(buildGiveawayPayload(getGiveaway(id), { entries: 0 }));
    setGiveawayMessage(id, sent.id);
  } catch {
    discardGiveaway(id);
    throw new HttpError(502, giveawayLines.postFailed);
  }
  track(guild.id, "feature_on");
  return { giveaways: giveawaysView(guild), applied: true, notice: `Giveaway #${id} đã lên sàn ở #${input.channel.name}. Chờ thiên hạ ùa vô.`, id };
}

function ownGiveaway(guild, idText) {
  const g = getGiveaway(Number(idText));
  if (!g || g.guild_id !== guild.id) throw new HttpError(404, giveawayLines.missing.replace(" Gõ `/quatang danhsach` để xem.", ""));
  return g;
}

async function endGiveaway(guild, g, ctx) {
  if (g.status !== "active") throw new HttpError(409, giveawayLines.notActive);
  const found = await findMessage(guild, g);
  // Closing draws the winners for good, so the result must be postable before it is drawn
  const missing = found.channel ? missingInChannel(found.channel, guild.members?.me, ["ViewChannel", "SendMessages"]) : [];
  if (missing.length) throw new HttpError(502, `Thầu thiếu quyền ${missing.join(", ")} ở kênh giveaway nên không báo kết quả được. Cấp quyền rồi kết thúc lại.`);
  const result = closeGiveaway(g.id);
  if (!result.closed) throw new HttpError(409, giveawayLines.notActive);
  const fresh = getGiveaway(g.id);
  let posted = Boolean(found.channel);
  if (found.message && ownMessage(found.message, botIdOf(ctx, guild))) await found.message.edit(buildGiveawayPayload(fresh, { entries: result.entries })).catch(() => {});
  const content = result.winners.length ? giveawayLines.announce(g.prize, result.winners) : giveawayLines.announceNobody(g.prize);
  try {
    if (!found.channel?.send) throw new Error("no channel");
    await found.channel.send({ content, allowedMentions: { parse: [], users: result.winners } });
  } catch {
    posted = false;
  }
  return {
    giveaways: giveawaysView(guild),
    applied: posted,
    notice: posted ? `Đã kết thúc giveaway #${g.id}, ${result.winners.length ? `${result.winners.length} người trúng` : "không ai tham gia"}.` : `Đã kết thúc giveaway #${g.id} và bốc thăm xong nhưng thầu không báo được ở kênh gốc (kênh mất hoặc Discord lỗi). Xem người trúng trong danh sách.`,
  };
}

async function cancelGiveawayRoute(guild, g, ctx) {
  if (!cancelGiveaway(guild.id, g.id)) throw new HttpError(409, giveawayLines.notActive);
  let edited = true;
  try {
    const found = await findMessage(guild, g);
    if (found.message && ownMessage(found.message, botIdOf(ctx, guild))) await found.message.edit(buildGiveawayPayload({ ...g, status: "cancelled" }));
  } catch {
    edited = false;
  }
  return { giveaways: giveawaysView(guild), applied: edited, notice: edited ? giveawayLines.cancelled(g.id).replace(/^🛑 /, "") : `Đã huỷ giveaway #${g.id} trong sổ sách nhưng thầu không sửa được tin trên kênh. Xoá tin đó bằng tay nếu muốn.` };
}

async function rerollGiveawayRoute(guild, g, body) {
  const blocked = gateFeature(guild.id, "giveaways");
  if (blocked) throw new HttpError(403, blocked);
  const { count } = invalid(validateCount(body));
  if (g.status !== "ended") throw new HttpError(409, giveawayLines.notEnded.replace(" Muốn dừng sớm thì `/quatang huy`.", ""));
  const channel = guild.channels.cache.get(g.channel_id);
  const missing = channel ? missingInChannel(channel, guild.members?.me, ["ViewChannel", "SendMessages"]) : [];
  if (missing.length) throw new HttpError(502, `Thầu thiếu quyền ${missing.join(", ")} ở kênh giveaway nên không báo người trúng mới được. Cấp quyền rồi chọn lại.`);
  const result = rerollGiveaway(guild.id, g.id, count);
  if (!result.ok) throw new HttpError(409, { missing: giveawayLines.missing, notEnded: giveawayLines.notEnded, nobody: giveawayLines.nobodyLeft }[result.reason]);
  try {
    if (!channel?.send) throw new Error("no channel");
    await channel.send({ content: giveawayLines.rerolled(g.prize, result.winners), allowedMentions: { parse: [], users: result.winners } });
  } catch {
    return { giveaways: giveawaysView(guild), applied: false, notice: `Đã chọn lại cho giveaway #${g.id} nhưng thầu không báo được ở kênh gốc. Người trúng mới: ${result.winners.length} người, xem trong danh sách.` };
  }
  return { giveaways: giveawaysView(guild), applied: true, notice: giveawayLines.rerollDone(g.id).replace(/^✅ /, "") };
}

// ---------------------------------------------------------------- role menus

const needManageRoles = (guild) => {
  if (missingInGuild(guild, ["ManageRoles"]).length) throw new HttpError(502, menuLines.needManageRoles);
};

function ownMenu(guild, idText) {
  const menu = getMenu(Number(idText));
  if (!menu || menu.guild_id !== guild.id) throw new HttpError(404, menuLines.missingMenu.replace(" Gõ `/vaitro danhsach` để xem.", ""));
  return menu;
}

async function postMenu(guild, menu, channel, ctx) {
  const missing = missingInChannel(channel, guild.members?.me);
  if (missing.length) return { ok: false, missing };
  const posted = await postPanel(guild, menu, channel, botIdOf(ctx, guild));
  return { ok: posted.ok, missing: [] };
}

async function createMenuRoute(guild, body, ctx) {
  const blocked = gateLimit(guild.id, "roleMenus", countMenus(guild.id), "menu vai trò");
  if (blocked) throw new HttpError(403, blocked);
  needManageRoles(guild);
  const input = invalid(validateMenu(body, guild, { allowChannel: true }));
  const id = createMenu(guild.id, input.channel?.id ?? "0", input.title, input.mode, input.picks.map((p) => ({ id: p.role.id, emoji: p.emoji })), ctx.now());
  if (!input.channel) return { menus: menusView(guild), id, applied: true, notice: `Đã lưu menu #${id}. Bấm "Đăng bảng" để đưa lên kênh.` };
  const posted = await postMenu(guild, getMenu(id), input.channel, ctx);
  const notice = posted.ok ? `Menu #${id} đã đăng ở #${input.channel.name}.` : posted.missing.length ? `Đã lưu menu #${id} nhưng thầu thiếu quyền ${posted.missing.join(", ")} ở kênh đó nên chưa đăng được.` : `Đã lưu menu #${id} nhưng thầu chưa đăng được bảng. Thử đăng lại sau.`;
  return { menus: menusView(guild), id, applied: posted.ok, notice };
}

async function editMenuRoute(guild, menu, body, ctx) {
  needManageRoles(guild);
  const input = invalid(validateMenu(body, guild));
  getDb()
    .prepare("UPDATE role_menus SET title = ?, mode = ?, roles = ? WHERE id = ? AND guild_id = ?")
    .run(input.title, input.mode, JSON.stringify(input.picks.map((p) => ({ id: p.role.id, emoji: p.emoji }))), menu.id, guild.id);
  if (!menu.message_id) return { menus: menusView(guild), applied: true, notice: `Đã lưu menu #${menu.id}.` };
  // The posted panel is refreshed in place, so the buttons match the saved roles
  const channel = guild.channels.cache.get(menu.channel_id);
  if (!channel) return { menus: menusView(guild), applied: false, notice: `Đã lưu menu #${menu.id} nhưng kênh của bảng không còn. Chọn kênh và đăng lại bảng.` };
  const posted = await postMenu(guild, getMenu(menu.id), channel, ctx);
  if (posted.ok) return { menus: menusView(guild), applied: true, notice: `Đã lưu và làm mới bảng của menu #${menu.id}.` };
  return { menus: menusView(guild), applied: false, notice: posted.missing.length ? `Đã lưu nhưng thầu thiếu quyền ${posted.missing.join(", ")} ở kênh bảng nên chưa làm mới được. Nút cũ vẫn bị kiểm tra lại mỗi lần bấm.` : `Đã lưu nhưng chưa làm mới được bảng. Bấm "Đăng bảng" để thử lại.` };
}

async function postMenuRoute(guild, menu, body, ctx) {
  const { channel } = invalid(validateChannelOnly(body, guild));
  const posted = await postMenu(guild, menu, channel, ctx);
  if (posted.missing.length) throw new HttpError(502, `Thầu thiếu quyền ${posted.missing.join(", ")} ở kênh đó nên không đăng bảng được. Cấp quyền rồi thử lại.`);
  if (!posted.ok) throw new HttpError(502, menuLines.postFailed);
  return { menus: menusView(guild), applied: true, notice: `Đã đăng bảng menu #${menu.id} ở #${channel.name}.` };
}

async function deleteMenuRoute(guild, menu, ctx) {
  await retirePanel(guild, menu, botIdOf(ctx, guild));
  deleteMenu(guild.id, menu.id);
  return { menus: menusView(guild), applied: true, notice: `Đã xoá menu #${menu.id}. Nút cũ trên bảng không còn tác dụng.` };
}

// ---------------------------------------------------------------- optional modules

// The temporary rooms and the stats channels are built by other modules. The dashboard looks for them at the moment of use, so it
// keeps working (and says so) whether they are there or not. `ctx.hooks` lets a test stand in for them.
const OPTIONAL = {
  tempvoice: { spec: "../tempvoice/index.js", fn: "syncTempVoice", label: "phòng tạm" },
  stats: { spec: "../stats/index.js", fn: "syncStats", label: "kênh thống kê" },
};

async function callOptional(kind, guild, ctx) {
  const { spec, fn } = OPTIONAL[kind];
  let run = ctx.hooks && Object.hasOwn(ctx.hooks, fn) ? ctx.hooks[fn] : undefined;
  if (run === undefined) {
    try {
      const mod = await import(spec);
      run = mod[fn];
    } catch {
      return { state: "missing" };
    }
  }
  if (typeof run !== "function") return { state: "missing" };
  try {
    await run(guild);
    return { state: "ok" };
  } catch (error) {
    console.error(`Dashboard ${kind} sync failed:`, error?.message);
    return { state: "failed" };
  }
}

// What happens after a newer section is saved: a note about permissions and the optional module, as one sentence for the toast
export async function afterSave(section, guild, stored, ctx) {
  if (section === "suggest") {
    const missing = stored.enabled ? missingInChannel(guild.channels.cache.get(stored.channelId), guild.members?.me, ["ViewChannel", "SendMessages", "EmbedLinks", "AddReactions"]) : [];
    if (missing.length) return { applied: false, notice: `Đã lưu nhưng thầu thiếu quyền ${missing.join(", ")} ở kênh góp ý nên chưa đăng được. Cấp quyền giúp thầu.` };
    return { applied: true, notice: stored.enabled ? "Đã lưu cài đặt góp ý." : "Đã tắt góp ý." };
  }
  const { label } = OPTIONAL[section];
  const flags = section === "tempvoice" ? ["ManageChannels", "MoveMembers"] : ["ManageChannels"];
  const missing = stored.enabled ? missingInGuild(guild, flags) : [];
  if (missing.length) return { applied: false, notice: `Đã lưu nhưng thầu thiếu quyền ${missing.join(", ")} nên chưa làm được ${label}. Cấp quyền rồi lưu lại.` };
  const result = await callOptional(section, guild, ctx);
  if (result.state === "missing") return { applied: false, notice: `Đã lưu. Phần ${label} chưa có trong bản thầu này nên chưa chạy, cài đặt vẫn được giữ.` };
  if (result.state === "failed") return { applied: false, notice: `Đã lưu nhưng thầu gặp lỗi khi dựng ${label}. Thử lưu lại sau chút.` };
  return { applied: true, notice: stored.enabled ? `Đã lưu và áp dụng ${label}.` : `Đã tắt ${label}.` };
}

// Plan checks that only apply to the counted things. A lapsed plan can always shrink a list, never grow it.
export function gateCounts(guild, section, patch, before) {
  const check = (key, next, previous, noun) => (next.length > previous.length ? gateLimit(guild.id, key, next.length - 1, noun) : null);
  if (section === "tempvoice" && patch.lobbyChannelIds) return check("tempLobbies", patch.lobbyChannelIds, before.lobbyChannelIds, "phòng chờ tạo phòng riêng");
  if (section === "stats" && patch.channels) return check("statsChannels", patch.channels, before.channels, "kênh thống kê");
  if (section === "automod" && patch.customWords) return check("customWords", patch.customWords, before.customWords, "từ khoá tự chế");
  return null;
}

export const wordLimit = (guildId) => {
  const limit = getPlan(guildId).customWords;
  return Number.isFinite(limit) ? limit : null;
};

// ---------------------------------------------------------------- routing

export async function dispatch(name, guild, match, body, ctx, session) {
  switch (name) {
    case "giveawayCreate":
      return createGiveawayRoute(guild, body, ctx, session);
    case "giveawayAct": {
      const g = ownGiveaway(guild, match[2]);
      if (match[3] === "end") {
        invalid(validateEmpty(body));
        return endGiveaway(guild, g, ctx);
      }
      if (match[3] === "cancel") {
        invalid(validateEmpty(body));
        return cancelGiveawayRoute(guild, g, ctx);
      }
      return rerollGiveawayRoute(guild, g, body);
    }
    case "menuCreate":
      return createMenuRoute(guild, body, ctx);
    case "menuEdit":
      return editMenuRoute(guild, ownMenu(guild, match[2]), body, ctx);
    case "menuPost":
      return postMenuRoute(guild, ownMenu(guild, match[2]), body, ctx);
    case "menuDelete":
      invalid(validateEmpty(body));
      return deleteMenuRoute(guild, ownMenu(guild, match[2]), ctx);
    default:
      return undefined;
  }
}

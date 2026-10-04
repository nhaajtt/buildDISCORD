import { ChannelType } from "discord.js";
import { config } from "../config.js";
import { PLANS, getPlan, getUsage } from "../license.js";
import { countEvents } from "../analytics.js";
import { getDb } from "../db.js";
import { getSection, patchSection } from "../settings.js";
import { sendDigest } from "../digest/index.js";
import { ticketCounts } from "../digest/stats.js";
import { WEEK } from "../digest/schedule.js";
import { gateFeature } from "../utils/gate.js";
import { applyFix, fixIdsOf, getFix, latestReport, reports, runAudit } from "../audit/index.js";
import { gateAutomod, standardOn, syncAutomod } from "../automod/index.js";
import { ruleLabels } from "../humor/automod.js";
import { roleProblem } from "../onboarding/safety.js";
import { stopLockdown } from "../security/guard.js";
import { PRICES_USD, DAY_CHOICES, ONE_OFF, amountCents, amountVnd, describeOrder, recentOrders } from "../pay/orders.js";
import { panelPayload, postTicketPanel } from "../tickets/panel.js";
import { listOpen } from "../tickets/store.js";
import { HttpError, avatarUrl, iconUrl } from "./auth.js";
import { afterSave, countsOf, gateCounts, giveawaysView, menusView } from "./manage.js";
import { TEXT_TYPES, VOICE_TYPES, validateSection } from "./validate.js";

// What each route does once the caller is known to be allowed. Discord-facing effects go through the same modules the slash commands use.

export const AUDIT_COOLDOWN_MS = 60_000;
export const SECTION_LIST = ["welcome", "automod", "tickets", "security", "activity", "digest", "modlog", "tempvoice", "stats", "suggest"];
export const PREVIEW_COOLDOWN_MS = 60_000;

const planSummary = (guildId) => {
  const plan = getPlan(guildId);
  // Infinity cannot travel as JSON, so "no cap" becomes null
  const limits = Object.fromEntries(
    Object.keys(PLANS.free)
      .filter((k) => k !== "label" && k !== "rank")
      .map((k) => [k, typeof plan[k] === "boolean" || Number.isFinite(plan[k]) ? plan[k] : null]),
  );
  return { plan: plan.plan, label: plan.label, expiresAt: plan.expiresAt, limits };
};

// Never selects the checkout link, the buyer or the channel: a page that lists orders has no use for them
const ordersOf = (guildId, limit) =>
  recentOrders(limit, guildId).map((o) => ({ code: describeOrder(o.order_code), plan: o.plan, days: o.days, amount: o.provider === "stripe" ? o.amount / 100 : o.amount, currency: o.provider === "stripe" ? "USD" : "VND", status: o.status, createdAt: o.created_at, paidAt: o.paid_at ?? null }));

function pickers(guild) {
  const top = guild.members?.me?.roles?.highest?.position ?? -1;
  const channels = [...guild.channels.cache.values()];
  const view = (types) =>
    channels
      .filter((c) => types.includes(c.type))
      .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0))
      .slice(0, 500)
      .map((c) => ({ id: c.id, name: String(c.name ?? ""), parentId: c.parentId ?? null }));
  const roles = [...guild.roles.cache.values()]
    .filter((r) => !r.managed && r.id !== guild.id)
    .sort((a, b) => (b.position ?? 0) - (a.position ?? 0))
    .slice(0, 250)
    .map((r) => {
      const problem = roleProblem(r, top);
      return { id: r.id, name: String(r.name ?? ""), color: typeof r.color === "number" ? r.color : 0, unsafe: problem !== null, problem: problem?.code ?? null };
    });
  return { texts: view(TEXT_TYPES), voices: view(VOICE_TYPES), categories: view([ChannelType.GuildCategory]), roles };
}

function auditView(guild) {
  const latest = latestReport(guild.id);
  const fixes = fixIdsOf(latest)
    .map((id) => ({ id, title: getFix(id).title, change: getFix(id).describe(guild) }))
    .filter((f) => f.change);
  return { latest, fixes, history: reports(guild.id, 20).map((r) => ({ score: r.score, createdAt: r.createdAt })) };
}

// Read-only numbers for the "Hoạt động" tab. Counts and ids only, never anything a member wrote.
function activityOverview(guild, now = Date.now()) {
  const since = now - WEEK;
  const tickets = ticketCounts(guild.id, since, now + 1);
  const db = getDb();
  const totals = db.prepare("SELECT COUNT(*) AS members, COALESCE(SUM(msgs), 0) AS msgs, COALESCE(SUM(voice_min), 0) AS voice FROM xp WHERE guild_id = ?").get(guild.id);
  const top = db
    .prepare("SELECT user_id AS userId, xp, msgs, voice_min AS voiceMin FROM xp WHERE guild_id = ? ORDER BY xp DESC LIMIT 5")
    .all(guild.id)
    .map((r) => ({ userId: r.userId, name: guild.members?.cache?.get?.(r.userId)?.displayName ?? null, xp: Number(r.xp), msgs: Number(r.msgs), voiceMin: Number(r.voiceMin) }));
  const lock = getSection(guild.id, "security").lockdown;
  return {
    week: {
      joins: countEvents(guild.id, "join", since, now + 1),
      automodBlocks: countEvents(guild.id, "automod_block", since, now + 1),
      ticketsOpened: tickets.opened,
      ticketsClosed: tickets.closed,
    },
    members: { tracked: Number(totals.members), messages: Number(totals.msgs), voiceMinutes: Number(totals.voice) },
    top,
    lockdown: { active: lock.active, since: lock.since, channels: lock.channels.length },
  };
}

function ticketsView(guild, settings) {
  const label = (key) => settings.types.find((t) => t.key === key)?.label ?? key;
  const rows = listOpen(guild.id);
  return {
    count: rows.length,
    list: rows.slice(0, 50).map((t) => ({
      id: t.id,
      channelId: t.channel_id,
      channelName: guild.channels.cache.get(t.channel_id)?.name ?? null,
      userId: t.user_id,
      type: label(t.type),
      createdAt: t.created_at,
      claimed: Boolean(t.claimed_by),
    })),
  };
}

const buyInfo = () => ({
  contact: config.contactText,
  payosEnabled: Boolean(config.payos.clientId && config.payos.apiKey && config.payos.checksumKey),
  stripeEnabled: Boolean(config.stripe.secretKey),
  offers: Object.keys(PRICES_USD).flatMap((plan) => (ONE_OFF[plan] ? [ONE_OFF[plan].days] : DAY_CHOICES).map((days) => ({ plan, label: PLANS[plan]?.label ?? ONE_OFF[plan].label, days, amount: amountVnd(plan, days), usd: amountCents(plan, days) / 100 }))),
});

export function me(session, client, ctx) {
  const guilds = [...session.guildIds]
    .map((id) => client.guilds.cache.get(id))
    .filter(Boolean)
    .map((g) => {
      const plan = getPlan(g.id);
      return { id: g.id, name: String(g.name ?? ""), icon: iconUrl(g.id, g.icon), plan: plan.plan, planLabel: plan.label };
    });
  return { user: { id: session.userId, name: session.name, avatarUrl: avatarUrl(session.userId, session.avatar) }, guilds, csrf: ctx.auth.csrfFor(session.id) };
}

export function guildDetail(guild) {
  const settings = Object.fromEntries(SECTION_LIST.map((name) => [name, getSection(guild.id, name)]));
  return {
    id: guild.id,
    name: String(guild.name ?? ""),
    icon: iconUrl(guild.id, guild.icon),
    plan: planSummary(guild.id),
    usage: { builds: getUsage(guild.id, "build", { lifetime: true }), ai: getUsage(guild.id, "ai") },
    settings,
    ...pickers(guild),
    audit: auditView(guild),
    tickets: ticketsView(guild, settings.tickets),
    overview: { ...activityOverview(guild), counts: countsOf(guild) },
    giveaways: giveawaysView(guild),
    roleMenus: menusView(guild),
    orders: ordersOf(guild.id, 5),
    buy: buyInfo(),
  };
}

export const orders = (guild) => ({ orders: ordersOf(guild.id, 20) });

function describeSync(result) {
  if (result.kind === "perms") return "Thầu thiếu quyền Quản lý server nên chưa dựng được luật AutoMod. Cấp quyền rồi lưu lại, thầu không biết phép thuật.";
  if (result.kind) return "Discord không cho thầu chỉnh AutoMod lúc này. Thử lại sau chút.";
  const names = (keys) => keys.map((k) => ruleLabels[k] ?? k).join(", ");
  const parts = [];
  if (result.created.length) parts.push(`Dựng mới: ${names(result.created)}.`);
  if (result.updated.length) parts.push(`Cập nhật: ${names(result.updated)}.`);
  if (result.removed.length) parts.push(`Gỡ bớt: ${names(result.removed)}.`);
  if (result.failed.length) parts.push(`Còn vướng: ${names(result.failed.map((f) => f.key))}.`);
  return parts.length ? parts.join(" ") : "Mọi luật đã đúng ý, thầu khỏi làm gì thêm.";
}

// Takes the buttons off a panel that no longer counts, like /ticket tat does
async function retirePanel(guild, channelId, messageId) {
  if (!channelId || !messageId) return;
  try {
    const message = await guild.channels.cache.get(channelId)?.messages.fetch(messageId);
    await message?.edit({ components: [] });
  } catch {
    // The panel may already be gone, which is the goal anyway
  }
}

async function applyAutomod(guild, before) {
  const now = getSection(guild.id, "automod");
  // The words rule lives on its own, so it is brought in line whatever the standard switch says. Only a server with nothing
  // recorded, no words and no switch skips the trip to Discord.
  if (now.enabled || before.enabled || now.customWords.length || Object.keys(now.ruleIds).length) {
    const result = await syncAutomod(guild);
    if (result.kind && now.enabled) {
      // Nothing was built, so the section must not claim AutoMod is on
      patchSection(guild.id, "automod", { enabled: standardOn(getSection(guild.id, "automod").ruleIds) });
    }
    return { applied: result.ok === true, notice: describeSync(result) };
  }
  return { applied: true, notice: "Đã lưu." };
}

async function applyTickets(guild, before, stored) {
  if (!stored.enabled) {
    await retirePanel(guild, before.panelChannelId, before.panelMessageId);
    patchSection(guild.id, "tickets", { panelMessageId: null });
    return { applied: true, notice: "Đã tắt ticket. Ticket đang mở vẫn giữ nguyên, chỉ không nhận ticket mới." };
  }
  if (!stored.panelMessageId) return { applied: true, notice: "Đã lưu. Bấm \"Đăng bảng điều khiển\" để đưa bảng lên kênh." };
  try {
    const message = await guild.channels.cache.get(stored.panelChannelId)?.messages.fetch(stored.panelMessageId);
    if (!message) throw new Error("panel gone");
    await message.edit(panelPayload(stored));
    return { applied: true, notice: "Đã lưu và cập nhật bảng ticket." };
  } catch {
    return { applied: false, notice: "Đã lưu nhưng không cập nhật được bảng ticket. Bấm \"Đăng bảng điều khiển\" để đăng lại." };
  }
}

export async function putSettings(guild, section, body, ctx = {}) {
  if (!SECTION_LIST.includes(section)) throw new HttpError(404, "Không có phần cài đặt này.");
  const before = getSection(guild.id, section);
  // The plan is judged first, so a free server hears about Pro before it hears about missing fields.
  // A lapsed plan can still switch tickets off, and nothing else.
  const ticketsBlocked = section === "tickets" ? gateFeature(guild.id, "tickets") : null;
  if (ticketsBlocked && body?.enabled !== false) throw new HttpError(403, ticketsBlocked);
  // Same rule for the activity system: a lapsed plan can switch it off and nothing else
  const activityBlocked = section === "activity" ? gateFeature(guild.id, "activity") : null;
  if (activityBlocked && body?.enabled !== false) throw new HttpError(403, activityBlocked);
  const checked = validateSection(section, ticketsBlocked || activityBlocked ? { enabled: false } : body, guild, before);
  if (checked.error) throw new HttpError(400, checked.error);
  const patch = checked.patch;
  const merged = { ...before, ...patch };

  // Editing only the word list never changes the level or the exempt roles, so a lapsed plan with a higher level still stored can
  // trim its words. The size of the list is judged below.
  if (section === "automod" && Object.keys(patch).some((key) => key !== "customWords")) {
    // Turning it on is judged on the whole result, otherwise only on what this request explicitly asks for
    const asked = merged.enabled ? merged : patch;
    const blocked = gateAutomod(guild.id, { level: asked.level ?? "nhe", blockLinks: asked.blockLinks === true, exempt: (asked.exemptRoleIds ?? []).length > 0 });
    if (blocked) throw new HttpError(403, blocked);
  }

  if (section === "security") {
    // Turning the nuke guard on, or tuning it while it is on, is judged on the plan. Switching it off is always allowed.
    const touchesNuke = patch.nukeEnabled === true || (merged.nukeEnabled && ("nukeThreshold" in patch || "nukeWindowSec" in patch));
    const blocked = touchesNuke ? gateFeature(guild.id, "nukeGuard") : null;
    if (blocked) throw new HttpError(403, blocked);
    const basic = patch.raidEnabled === true || patch.nukeEnabled === true ? gateFeature(guild.id, "security") : null;
    if (basic) throw new HttpError(403, basic);
  }
  if (section === "digest" && patch.enabled === true) {
    const blocked = gateFeature(guild.id, "digest");
    if (blocked) throw new HttpError(403, blocked);
  }

  // Counted lists (lobbies, stat channels, blocked words): a lapsed plan can shrink them, never grow them
  const overLimit = gateCounts(guild, section, patch, before);
  if (overLimit) throw new HttpError(403, overLimit);

  // An old panel in another channel is not this panel any more
  if (section === "tickets" && patch.panelChannelId && patch.panelChannelId !== before.panelChannelId) {
    await retirePanel(guild, before.panelChannelId, before.panelMessageId);
    patch.panelMessageId = null;
  }

  const stored = patchSection(guild.id, section, patch);
  if (section === "welcome") return { value: stored, applied: true, notice: "Đã lưu lời chào." };
  if (section === "security") return { value: stored, applied: true, notice: "Đã lưu cài đặt bảo vệ." };
  if (section === "activity") return { value: stored, applied: true, notice: "Đã lưu cài đặt điểm hoạt động." };
  if (section === "digest") return { value: stored, applied: true, notice: "Đã lưu lịch báo cáo tuần." };
  if (section === "modlog") return { value: stored, applied: true, notice: "Đã lưu nhật ký quản trị." };
  if (section === "tempvoice" || section === "stats" || section === "suggest") return { value: stored, ...(await afterSave(section, guild, stored, ctx)) };
  const effect = section === "automod" ? await applyAutomod(guild, before) : await applyTickets(guild, before, stored);
  return { value: getSection(guild.id, section), ...effect };
}

export async function postPanel(guild) {
  const blocked = gateFeature(guild.id, "tickets");
  if (blocked) throw new HttpError(403, blocked);
  const posted = await postTicketPanel(guild);
  if (posted.reason === "setup") throw new HttpError(400, "Chưa đủ cài đặt: cần kênh đăng bảng và role staff. Lưu cài đặt trước đã.");
  if (posted.reason === "channel") throw new HttpError(400, "Thầu không thấy kênh bảng ticket nữa. Chọn lại kênh rồi lưu.");
  if (!posted.ok) throw new HttpError(502, "Thầu không đăng được bảng ở kênh đó. Kiểm tra quyền xem, gửi tin và nhúng link của bot.");
  return { value: posted.settings, applied: true, notice: "Bảng ticket đã sẵn trên kênh. Mở quán thôi." };
}

export async function runHealthCheck(guild, ctx) {
  const last = ctx.auditRuns.get(guild.id);
  const t = ctx.now();
  if (last !== undefined && t - last < AUDIT_COOLDOWN_MS) {
    const wait = Math.ceil((AUDIT_COOLDOWN_MS - (t - last)) / 1000);
    const error = new HttpError(429, `Khám nhanh quá thầu chưa kịp thở. Đợi ${wait} giây nữa nhé.`);
    error.retryAfter = wait;
    throw error;
  }
  ctx.auditRuns.set(guild.id, t);
  try {
    await runAudit(guild);
  } catch (error) {
    ctx.auditRuns.delete(guild.id);
    throw error;
  }
  return auditView(guild);
}

export async function fix(guild, body) {
  const fixId = body?.fixId;
  if (typeof fixId !== "string" || !getFix(fixId)) throw new HttpError(400, "Không có cách sửa này.");
  try {
    return await applyFix(guild, fixId);
  } catch (error) {
    if (error?.code === 50013 || error?.status === 403) throw new HttpError(502, "Thầu thiếu quyền để sửa việc này. Cấp quyền rồi thử lại.");
    throw error;
  }
}

// Goes through the same code as the automatic unlock and /khoakhan: a channel or a verification level that someone changed by hand
// after the lockdown is left alone, and two unlocks at once cannot both run.
export async function unlockLockdown(guild) {
  if (!getSection(guild.id, "security").lockdown.active) throw new HttpError(409, "Server không đang trong chế độ khoá. Khỏi mở gì hết.");
  const result = await stopLockdown(guild, { reason: "Mở khoá server" });
  if (!result.ok) throw new HttpError(409, result.reason === "busy" ? "Thầu đang mở khoá server này rồi. Đợi chút rồi xem lại." : "Server không đang trong chế độ khoá. Khỏi mở gì hết.");
  const failed = result.failed.length;
  return {
    value: getSection(guild.id, "security"),
    applied: failed === 0,
    notice: failed ? `Đã mở khoá nhưng ${failed} chỗ không khôi phục được (thiếu quyền Quản lý kênh hoặc Quản lý server). Kiểm tra lại bằng tay nhé.` : "Đã mở khoá, mọi thứ về như trước lúc khoá.",
  };
}

// Posts a preview of the weekly report right now to the saved channel. It uses the latest stored health check, so it is quick,
// and it never touches the weekly schedule.
export async function previewDigest(guild, ctx) {
  const last = ctx.previewRuns.get(guild.id);
  const t = ctx.now();
  if (last !== undefined && t - last < PREVIEW_COOLDOWN_MS) {
    const wait = Math.ceil((PREVIEW_COOLDOWN_MS - (t - last)) / 1000);
    const error = new HttpError(429, `Vừa gửi thử xong, đợi ${wait} giây nữa nhé.`);
    error.retryAfter = wait;
    throw error;
  }
  const settings = getSection(guild.id, "digest");
  if (!settings.channelId) throw new HttpError(400, "Chưa chọn kênh báo cáo. Chọn kênh và lưu trước đã.");
  ctx.previewRuns.set(guild.id, t);
  const result = await sendDigest(guild, { settings, preview: true, now: t });
  if (!result.ok) {
    ctx.previewRuns.delete(guild.id);
    if (result.reason === "channel") throw new HttpError(400, "Thầu không thấy kênh báo cáo nữa. Chọn lại kênh rồi lưu.");
    if (result.reason === "perms") throw new HttpError(502, `Thầu thiếu quyền ở kênh đó: ${result.missing.join(", ")}. Cấp quyền rồi gửi thử lại.`);
    throw new HttpError(502, "Thầu không gửi được vào kênh đó. Kiểm tra quyền của bot.");
  }
  return { ok: true, notice: "Đã gửi bản thử vào kênh báo cáo." };
}

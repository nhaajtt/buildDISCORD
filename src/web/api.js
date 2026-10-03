import { ChannelType } from "discord.js";
import { config } from "../config.js";
import { PLANS, getPlan, getUsage } from "../license.js";
import { getSection, patchSection } from "../settings.js";
import { gateFeature } from "../utils/gate.js";
import { applyFix, fixIdsOf, getFix, latestReport, reports, runAudit } from "../audit/index.js";
import { gateAutomod, removeAutomod, syncAutomod } from "../automod/index.js";
import { ruleLabels } from "../humor/automod.js";
import { roleProblem } from "../onboarding/safety.js";
import { PRICES_USD, DAY_CHOICES, amountVnd, describeOrder, recentOrders } from "../pay/orders.js";
import { panelPayload, postTicketPanel } from "../tickets/panel.js";
import { listOpen } from "../tickets/store.js";
import { HttpError, avatarUrl, iconUrl } from "./auth.js";
import { TEXT_TYPES, VOICE_TYPES, validateSection } from "./validate.js";

// What each route does once the caller is known to be allowed. Discord-facing effects go through the same modules the slash commands use.

export const AUDIT_COOLDOWN_MS = 60_000;
export const SECTION_LIST = ["welcome", "automod", "tickets"];

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
  offers: Object.keys(PRICES_USD).flatMap((plan) => DAY_CHOICES.map((days) => ({ plan, label: PLANS[plan].label, days, amount: amountVnd(plan, days), usd: Math.round(PRICES_USD[plan] * (days / 30) * 100) / 100 }))),
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
  if (getSection(guild.id, "automod").enabled) {
    const result = await syncAutomod(guild);
    if (result.kind) {
      // Nothing was built, so the section must not claim AutoMod is on
      patchSection(guild.id, "automod", { enabled: Object.keys(getSection(guild.id, "automod").ruleIds).length > 0 });
    }
    return { applied: result.ok === true, notice: describeSync(result) };
  }
  if (before.enabled || Object.keys(before.ruleIds).length) {
    const { removed, left } = await removeAutomod(guild);
    return {
      applied: left === 0,
      notice: left ? `Gỡ được ${removed} luật, còn ${left} luật chưa gỡ được (thiếu quyền hoặc Discord lỗi).` : `Đã gỡ ${removed} luật do thầu dựng. Luật của admin thầu để nguyên.`,
    };
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

export async function putSettings(guild, section, body) {
  if (!SECTION_LIST.includes(section)) throw new HttpError(404, "Không có phần cài đặt này.");
  const before = getSection(guild.id, section);
  // The plan is judged first, so a free server hears about Pro before it hears about missing fields.
  // A lapsed plan can still switch tickets off, and nothing else.
  const ticketsBlocked = section === "tickets" ? gateFeature(guild.id, "tickets") : null;
  if (ticketsBlocked && body?.enabled !== false) throw new HttpError(403, ticketsBlocked);
  const checked = validateSection(section, ticketsBlocked ? { enabled: false } : body, guild, before);
  if (checked.error) throw new HttpError(400, checked.error);
  const patch = checked.patch;
  const merged = { ...before, ...patch };

  if (section === "automod") {
    // Turning it on is judged on the whole result, otherwise only on what this request explicitly asks for
    const asked = merged.enabled ? merged : patch;
    const blocked = gateAutomod(guild.id, { level: asked.level ?? "nhe", blockLinks: asked.blockLinks === true, exempt: (asked.exemptRoleIds ?? []).length > 0 });
    if (blocked) throw new HttpError(403, blocked);
  }

  // An old panel in another channel is not this panel any more
  if (section === "tickets" && patch.panelChannelId && patch.panelChannelId !== before.panelChannelId) {
    await retirePanel(guild, before.panelChannelId, before.panelMessageId);
    patch.panelMessageId = null;
  }

  const stored = patchSection(guild.id, section, patch);
  if (section === "welcome") return { value: stored, applied: true, notice: "Đã lưu lời chào." };
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

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { buildPlan, themes } from "../themes/index.js";
import { HUMOR_LEVELS, humorLabels } from "../themes/humor.js";
import { buildServer } from "../builder.js";
import { runAudit } from "../audit/index.js";
import { syncAutomod } from "../automod/index.js";
import { getSection, patchSection, SNOWFLAKE } from "../settings.js";
import { getPlan, getUsage } from "../license.js";
import { gateBuild, gateFeature, recordBuild } from "../utils/gate.js";
import { track } from "../analytics.js";
import { cardLines, extraDone, extraLabels, extraProblems, nextStepCandidates, prideLines, wizardLines } from "../humor/wizard.js";

// The setup wizard. The first half of this file is pure (keyword suggestion, choice cleaning, the share card) and is tested without
// Discord. runWizard is the one place that touches the server, and it only builds or changes what the bot itself builds or was asked to.

export const EXTRA_KEYS = ["welcome", "automod", "health", "security", "digest"];
export const SUGGEST = "_suggest";
export const DESCRIPTION_MAX = 200;
export const MAX_THEMES = 4;

// ---------- keyword suggestion ----------

// Words that hint at a theme, written without accents. A longer phrase counts for more than a single word.
export const THEME_KEYWORDS = {
  gaming: ["game", "gaming", "gamer", "choi game", "lien minh", "lol", "valorant", "pubg", "fps", "minecraft", "steam", "esport", "cay game", "rank", "stream", "genshin", "roblox", "fifa"],
  "hoc-tap": ["hoc", "hoc tap", "on thi", "sinh vien", "lop", "truong", "bai tap", "thi", "giao duc", "ielts", "study", "giao vien", "hoc sinh", "du hoc", "dai hoc"],
  "cong-dong": ["cong dong", "community", "nhom", "hoi", "fan", "thanh vien", "giao luu", "tro chuyen", "club", "cau lac bo", "hoi nhom"],
  "chill-ban-be": ["ban be", "ban than", "chill", "gia dinh", "tam su", "cung nhau", "tan gau", "hoi chi em"],
  booking: ["dat lich", "booking", "dich vu", "khach hang", "cua hang", "tiem", "spa", "salon", "ban hang", "shop", "kinh doanh", "quan", "lich hen", "tu van", "freelance", "mua ban"],
  anime: ["anime", "manga", "otaku", "waifu", "weeb", "cosplay", "truyen tranh", "light novel", "wibu"],
  "dev-code": ["code", "lap trinh", "dev", "developer", "python", "javascript", "web", "bot", "github", "it", "phan mem", "coding", "programming", "open source", "ai"],
  creator: ["creator", "sang tao", "youtuber", "tiktok", "tiktoker", "content", "video", "thiet ke", "ve", "artist", "nghe si", "kenh", "podcast", "streamer", "nhiep anh", "design"],
  "phim-nhac": ["phim", "nhac", "movie", "music", "kpop", "ca si", "album", "rap", "cinema", "dien anh", "bai hat", "playlist", "concert", "show"],
  "cong-so": ["cong ty", "cong so", "doanh nghiep", "team", "nhan vien", "van phong", "du an", "startup", "lam viec", "work", "dong nghiep", "noi bo", "phong ban"],
  "thu-cung": ["thu cung", "cho", "meo", "pet", "dog", "cat", "dong vat", "hamster", "boss", "sen", "cun", "chim", "ca canh"],
};

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Picks a theme from a short typed description. No AI call: every keyword found adds to a theme's score, phrases weigh double.
// Returns { themeId, matched, guessed }. guessed is true when nothing matched and the safe default was used.
export function suggestTheme(input) {
  const text = ` ${normalizeText(String(input ?? "").slice(0, DESCRIPTION_MAX * 2))} `;
  let best = null;
  for (const theme of themes) {
    const keywords = THEME_KEYWORDS[theme.id] ?? [];
    const matched = keywords.filter((keyword) => text.includes(` ${keyword} `));
    const score = matched.reduce((sum, keyword) => sum + (keyword.includes(" ") ? 2 : 1), 0);
    if (score > 0 && (!best || score > best.score)) best = { themeId: theme.id, matched, score };
  }
  if (!best) return { themeId: "cong-dong", matched: [], guessed: true };
  return { themeId: best.themeId, matched: best.matched.slice(0, 3), guessed: false };
}

export const themeLabel = (id) => themes.find((t) => t.id === id)?.label ?? id;

// ---------- choices ----------

export const defaultChoices = () => ({ themeIds: [], humor: "troll", extras: [...EXTRA_KEYS] });

const unique = (list) => [...new Set(list)];

// Picks from the theme menu. Unknown ids are dropped, the suggest option is resolved by the caller, a plan without mixing keeps one theme.
export function applyThemes(choices, values, { canMix }) {
  const known = unique((Array.isArray(values) ? values : []).filter((v) => themes.some((t) => t.id === v)));
  let note = "";
  let themeIds = known.slice(0, MAX_THEMES);
  if (themeIds.length > 1 && !canMix) {
    themeIds = themeIds.slice(0, 1);
    note = wizardLines.mixLocked;
  }
  return { choices: { ...choices, themeIds }, note };
}

export function applyHumor(choices, value, { canPick }) {
  if (!HUMOR_LEVELS.includes(value)) return { choices, note: "" };
  if (value !== "troll" && !canPick) return { choices: { ...choices, humor: "troll" }, note: wizardLines.humorLocked };
  return { choices: { ...choices, humor: value }, note: "" };
}

export function applyExtras(choices, values) {
  const extras = unique((Array.isArray(values) ? values : []).filter((v) => EXTRA_KEYS.includes(v)));
  return { ...choices, extras };
}

// A fully cleaned copy, or null when no theme is chosen. Used right before anything runs.
export function cleanChoices(choices) {
  const themeIds = unique((choices?.themeIds ?? []).filter((id) => themes.some((t) => t.id === id))).slice(0, MAX_THEMES);
  if (!themeIds.length) return null;
  return {
    themeIds,
    humor: HUMOR_LEVELS.includes(choices?.humor) ? choices.humor : "troll",
    extras: unique((choices?.extras ?? []).filter((e) => EXTRA_KEYS.includes(e))),
  };
}

export const themeKey = (choices) => choices.themeIds.join("+");

// Has this exact setup already been built? Then running it again must not use up another build.
export function alreadyBuilt(guildId, choices) {
  const setup = getSection(guildId, "setup");
  return setup.done && setup.themeIds === themeKey(choices) && setup.humor === choices.humor;
}

// The funny refusal this setup earns on the server's plan, or null when allowed
export function gateWizard(guildId, choices) {
  const humorRefusal = choices.humor === "troll" ? null : gateFeature(guildId, "humor");
  if (humorRefusal) return humorRefusal;
  if (alreadyBuilt(guildId, choices)) return null;
  return gateBuild(guildId, choices.themeIds.length);
}

// Keeps a channel the admin already chose, fills an empty or dead one with `candidate`
export function pickChannel(current, candidate, exists) {
  if (current && exists(current)) return current;
  return candidate && SNOWFLAKE.test(String(candidate)) ? String(candidate) : (current ?? null);
}

// ---------- sessions (what someone has picked so far, kept in memory for a short while) ----------

const SESSION_MS = 15 * 60 * 1000;
const MAX_SESSIONS = 500;
const sessions = new Map();

const sessionKey = (guildId, userId) => `${guildId}:${userId}`;

function purge(now) {
  for (const [key, entry] of sessions) if (entry.expires <= now) sessions.delete(key);
  while (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
}

export function openSession(guildId, userId, now = Date.now()) {
  purge(now);
  const entry = { choices: defaultChoices(), note: "", result: null, shared: false, expires: now + SESSION_MS };
  sessions.set(sessionKey(guildId, userId), entry);
  return entry;
}

export function getSession(guildId, userId, now = Date.now()) {
  const entry = sessions.get(sessionKey(guildId, userId));
  if (!entry) return null;
  if (entry.expires <= now) {
    sessions.delete(sessionKey(guildId, userId));
    return null;
  }
  return entry;
}

export const touchSession = (entry, now = Date.now()) => {
  entry.expires = now + SESSION_MS;
};

export const dropSession =(guildId, userId) => sessions.delete(sessionKey(guildId, userId));

// ---------- the share card ----------

const scoreColor = (score) => (score >= 75 ? 0x2ecc71 : score >= 55 ? 0xf5c518 : score >= 35 ? 0xe67e22 : 0xe74c3c);
const isScore = (n) => Number.isInteger(n) && n >= 0 && n <= 100;
const bar = (score) => `${"█".repeat(Math.round(score / 10))}${"░".repeat(10 - Math.round(score / 10))}`;
const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 3)}...` : text);

export function prideLine(before, after) {
  if (!isScore(after)) return prideLines.unknown;
  if (!isScore(before)) return prideLines.unknown;
  if (after - before >= 10) return prideLines.big(before, after);
  if (after > before) return prideLines.small(before, after);
  return prideLines.same(after);
}

// The result embed, which doubles as a card to post and show off. Pure: numbers and strings in, an embed out.
export function buildResultEmbed({ before = null, after = null, label = "", done = [], problems = [], next = [] } = {}) {
  const show = (score) => (isScore(score) ? `**${score}/100**\n\`${bar(score)}\`` : "**?**");
  const setup = [...done.map((d) => `✅ ${d}`), ...problems.map((p) => `⚠️ ${p}`)];
  const embed = new EmbedBuilder()
    .setColor(isScore(after) ? scoreColor(after) : 0xf5c518)
    .setTitle(cardLines.title)
    .setDescription(clip(`${label ? `**${clip(String(label), 120)}**\n` : ""}${prideLine(before, after)}`, 600))
    .addFields(
      { name: cardLines.before, value: show(before), inline: true },
      { name: cardLines.after, value: show(after), inline: true },
      { name: cardLines.setup, value: clip(setup.join("\n") || cardLines.none, 1000), inline: false },
      { name: cardLines.next, value: clip(next.slice(0, 3).map((n, i) => `${i + 1}. ${n}`).join("\n") || cardLines.none, 1000), inline: false },
    )
    .setFooter({ text: cardLines.footer });
  return embed;
}

// The first three things worth trying, from what applies to this server's plan and what was just switched on
export function nextSteps(plan, { extras = [], after = null, trialUsed = false } = {}) {
  const out = [];
  for (const candidate of nextStepCandidates) {
    if (out.length >= 3) break;
    if (candidate.key === "khamsuckhoe" && after === 100) continue;
    if (candidate.key === "chaomung" && !extras.includes("welcome")) continue;
    if (candidate.need && !plan?.[candidate.need]) continue;
    if (candidate.onlyFree && ((plan?.rank ?? 0) > 0 || trialUsed)) continue;
    out.push(candidate.text);
  }
  return out;
}

// ---------- messages the wizard posts ----------

export function startPayload() {
  const embed = new EmbedBuilder().setColor(0xf5c518).setTitle(wizardLines.welcomeTitle).setDescription(wizardLines.welcomeBody);
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("batdau:open").setLabel(wizardLines.startButton).setStyle(ButtonStyle.Success));
  return { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
}

// ---------- running it ----------

const exists = (guild) => (id) => Boolean(guild.channels?.cache?.has?.(id));

function chosenPlan(choices) {
  return buildPlan(choices.themeIds, { humor: choices.humor });
}

// Builds the server, switches on the chosen extras and wires the log channels. Safe to run again: the builder reuses what exists, a
// channel the admin already chose is kept, and the build is only charged when something new was built.
// Returns what to show: scores, what was done, problems. Throws only when the build itself fails.
export async function runWizard(guild, rawChoices, { onProgress = async () => {}, now = Date.now(), deps = {} } = {}) {
  const choices = cleanChoices(rawChoices);
  if (!choices) throw new Error("No theme chosen");
  const { build = buildServer, audit = runAudit, sync = syncAutomod } = deps;
  const guildId = guild.id;
  const plan = getPlan(guildId);
  const had = alreadyBuilt(guildId, choices);
  const previous = getSection(guildId, "setup");
  const done = [];
  const problems = [];
  const turnedOn = [];

  const score = async () => {
    try {
      return (await audit(guild)).score;
    } catch (error) {
      console.error("Wizard health check failed:", error.message);
      return null;
    }
  };

  await onProgress(wizardLines.progressStart);
  const before = await score();

  const built = await build(guild, chosenPlan(choices), async (text) => onProgress(text));
  if (!had) recordBuild(guildId);
  done.push(had ? wizardLines.skippedBuild : wizardLines.built(built.counts));
  const ch = built.channelsByKind ?? {};
  const modlogChannel = ch.modlog ?? null;
  const alertChannel = ch.alerts ?? modlogChannel;
  const alive = exists(guild);

  await onProgress(wizardLines.progressExtras);

  // Wiring the log channels comes first and is not an "extra": it only fills channel ids that are empty or point at nothing
  const wire = (name, field, candidate) => {
    const current = getSection(guildId, name)[field];
    const picked = pickChannel(current, candidate, alive);
    if (picked !== current) patchSection(guildId, name, { [field]: picked });
  };
  wire("automod", "logChannelId", modlogChannel);
  wire("tickets", "logChannelId", modlogChannel);
  wire("modlog", "channelId", modlogChannel);
  wire("security", "alertChannelId", alertChannel);
  wire("digest", "channelId", alertChannel);

  const attempt = async (key, work) => {
    const refusal = key === "automod" ? null : key === "security" ? gateFeature(guildId, "security") : key === "digest" || key === "health" ? gateFeature(guildId, "digest") : null;
    if (refusal) {
      problems.push(`${extraLabels[key].label}: ${refusal}`);
      return;
    }
    try {
      const outcome = await work();
      if (outcome?.problem) problems.push(outcome.problem);
      else {
        done.push(`${extraDone[key]}${outcome?.note ? ` (${outcome.note})` : ""}`);
        if (!outcome?.wasOn) turnedOn.push(key);
      }
    } catch (error) {
      console.error(`Wizard extra ${key} failed:`, error.message);
      problems.push(`${extraLabels[key].label}: có trục trặc, thử lại bằng lệnh riêng của tính năng này`);
    }
  };

  if (choices.extras.includes("welcome")) {
    await attempt("welcome", async () => {
      const current = getSection(guildId, "welcome");
      const channelId = pickChannel(current.channelId, ch.welcome, alive);
      if (!channelId && !guild.systemChannel) return { problem: extraProblems.welcomeNoChannel };
      patchSection(guildId, "welcome", { enabled: true, ...(channelId ? { channelId } : {}) });
      return { wasOn: current.enabled };
    });
  }

  if (choices.extras.includes("automod")) {
    await attempt("automod", async () => {
      const current = getSection(guildId, "automod");
      // A server that already runs a stricter level keeps it
      patchSection(guildId, "automod", { enabled: true, ...(current.enabled ? {} : { level: "nhe" }) });
      const result = await sync(guild);
      const hasRules = Object.keys(getSection(guildId, "automod").ruleIds).length > 0;
      if (!result.ok && !hasRules) {
        // nothing was created, so the switch goes back to what it was
        patchSection(guildId, "automod", { enabled: current.enabled });
        const perms = result.kind === "perms" || result.failed?.some((f) => f.kind === "perms");
        return { problem: perms ? extraProblems.automodPerms : extraProblems.automodOther };
      }
      return { wasOn: current.enabled && !result.created?.length, note: result.ok ? "" : "một phần luật chưa dựng được" };
    });
  }

  if (choices.extras.includes("security")) {
    await attempt("security", async () => {
      const current = getSection(guildId, "security");
      if (!getSection(guildId, "security").alertChannelId && !alertChannel) return { problem: extraProblems.noLogChannel };
      patchSection(guildId, "security", { raidEnabled: true, ...(plan.nukeGuard ? { nukeEnabled: true } : {}) });
      patchSection(guildId, "modlog", { enabled: true });
      return { wasOn: current.raidEnabled, note: plan.nukeGuard ? "" : extraProblems.nukeGuardOff };
    });
  }

  if (choices.extras.includes("digest") || choices.extras.includes("health")) {
    const withHealth = choices.extras.includes("health");
    const withDigest = choices.extras.includes("digest");
    const current = getSection(guildId, "digest");
    const channelOk = Boolean(current.channelId || alertChannel);
    for (const key of ["digest", "health"]) {
      if (!choices.extras.includes(key)) continue;
      await attempt(key, async () => {
        if (!channelOk) return { problem: extraProblems.noLogChannel };
        patchSection(guildId, "digest", { enabled: true, ...(withHealth ? { auditWeekly: true } : {}) });
        return { wasOn: key === "digest" ? current.enabled && withDigest : current.enabled && current.auditWeekly && withHealth };
      });
    }
  }

  await onProgress(wizardLines.progressAfter);
  const after = await score();

  patchSection(guildId, "setup", { done: true, at: now, themeIds: themeKey(choices), humor: choices.humor });
  if (!previous.done) track(guildId, "wizard_done", now);
  for (const key of turnedOn) track(guildId, "feature_on", now);

  const label = chosenPlan(choices).label;
  const summary = {
    before,
    after,
    label,
    done,
    problems,
    extras: choices.extras,
    channelsByKind: ch,
    next: nextSteps(plan, { extras: choices.extras, after, trialUsed: getUsage(guildId, "trial", { lifetime: true }) > 0 }),
  };
  return { ...summary, embed: buildResultEmbed(summary) };
}

export { humorLabels };

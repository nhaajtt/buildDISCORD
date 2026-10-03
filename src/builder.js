import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  PermissionsBitField,
} from "discord.js";
import { buildPlan, countPlan } from "./themes/index.js";
import { loadRecord, saveRecord, clearRecord } from "./store.js";
import { config } from "./config.js";
import * as humor from "./humor/lines.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Small gap between creations keeps well clear of Discord's rate limits
const STEP_DELAY = config.stepDelayMs;

export function planSummary(themeId) {
  const plan = buildPlan(themeId);
  return { plan, ...countPlan(plan) };
}

function bar(done, total) {
  const filled = Math.round((done / total) * 10);
  return `${"█".repeat(filled)}${"░".repeat(10 - filled)} ${Math.round((done / total) * 100)}%`;
}

function reuse(cache, predicate) {
  return cache.find(predicate) ?? null;
}

async function ensureRole(guild, def, record) {
  const existing = reuse(guild.roles.cache, (r) => r.name === def.name);
  if (existing) return existing;
  const role = await guild.roles.create({
    name: def.name,
    colors: { primaryColor: def.color },
    hoist: Boolean(def.hoist),
    permissions: def.perms ? new PermissionsBitField(def.perms.map((p) => PermissionFlagsBits[p])) : [],
    reason: "Thầu xây dựng thi công",
  });
  record.roles.push(role.id);
  await sleep(STEP_DELAY);
  return role;
}

function overwritesFor(guild, def, category, roleByKey) {
  const everyone = guild.roles.everyone.id;
  if (category.staff) {
    return [
      { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
      { id: roleByKey.mod.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect] },
      { id: roleByKey.boss.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect] },
    ];
  }
  if (def.readonly) {
    return [{ id: everyone, deny: [PermissionFlagsBits.SendMessages] }];
  }
  return [];
}

async function ensureCategory(guild, def, record, roleByKey) {
  const existing = reuse(guild.channels.cache, (c) => c.type === ChannelType.GuildCategory && c.name === def.name);
  if (existing) return existing;
  const category = await guild.channels.create({
    name: def.name,
    type: ChannelType.GuildCategory,
    permissionOverwrites: def.staff ? overwritesFor(guild, {}, def, roleByKey) : [],
    reason: "Thầu xây dựng thi công",
  });
  record.categories.push(category.id);
  await sleep(STEP_DELAY);
  return category;
}

async function ensureChannel(guild, def, category, record, roleByKey) {
  const type = def.type === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText;
  // Discord lowercases text channel names and swaps spaces for dashes; voice names stay as typed
  const stored = type === ChannelType.GuildText ? def.name.toLowerCase().replace(/ /g, "-") : def.name;
  const existing = reuse(guild.channels.cache, (c) => c.type === type && c.parentId === category.id && c.name === stored);
  if (existing) return { channel: existing, created: false };
  const channel = await guild.channels.create({
    name: def.name,
    type,
    parent: category.id,
    topic: type === ChannelType.GuildText ? def.topic : undefined,
    permissionOverwrites: overwritesFor(guild, def, category, roleByKey),
    reason: "Thầu xây dựng thi công",
  });
  record.channels.push(channel.id);
  await sleep(STEP_DELAY);
  return { channel, created: true };
}

function inviteRow(entries) {
  const buttons = entries
    .filter((e) => e.url)
    .map((e) => new ButtonBuilder().setLabel(e.label).setStyle(ButtonStyle.Link).setURL(e.url));
  return buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];
}

// Kinds that mean "post content here". Other kinds (modlog, alerts) only tag a channel.
const FILL_KINDS = new Set(["rules", "welcome", "roles", "dj", "tts"]);

const embed = (title, description, color = 0xf5c518) => new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);

async function fillChannel(kind, channel, plan, roleByKey, record) {
  if (kind === "rules") {
    const list = plan.rules.map((rule, i) => `**${i + 1}.** ${rule}`).join("\n\n");
    await channel.send({ embeds: [embed("📜 Luật Server", `${humor.rulesIntro}\n\n${list}`)] });
  } else if (kind === "welcome") {
    await channel.send({
      embeds: [embed("👋 Sảnh Chờ Nhận Lương", `${plan.welcome.replace("{user}", "bạn")}\n\n${humor.pick(humor.welcomeDeco)}`)],
    });
  } else if (kind === "roles") {
    const picks = plan.roles.filter((r) => r.pick);
    const rows = [];
    for (let i = 0; i < picks.length; i += 5) {
      rows.push(
        new ActionRowBuilder().addComponents(
          picks.slice(i, i + 5).map((def) =>
            new ButtonBuilder()
              .setCustomId(`pickrole:${roleByKey[def.key].id}`)
              .setLabel(def.name.replace(/^\S+\s/, "").slice(0, 80))
              .setEmoji(def.name.split(" ")[0])
              .setStyle(ButtonStyle.Secondary),
          ),
        ),
      );
    }
    await channel.send({ embeds: [embed("🎭 Xin Role Xin Lộc", humor.rolesIntro)], components: rows });
  } else if (kind === "dj") {
    const rows = inviteRow([{ label: "Mời bot nhạc", url: config.musicInviteUrl }]);
    await channel.send({
      embeds: [embed("🎛️ DJ Booth", `${humor.djIntro}\n\n${config.musicInviteUrl ? "" : humor.djMissing}`.trim(), 0x9b59b6)],
      components: rows,
    });
  } else if (kind === "tts") {
    const rows = inviteRow([{ label: "Mời bot TTS", url: config.ttsInviteUrl }]);
    await channel.send({
      embeds: [embed("🗣️ Chém Gió Bằng Giọng", `${humor.ttsIntro}\n\n${config.ttsInviteUrl ? "" : humor.ttsMissing}`.trim(), 0x3498db)],
      components: rows,
    });
  }
}

// Builds the whole server. onProgress(text) is called with a short status line after every step.
// planOrThemeIds is a ready plan object (from the editor) or theme ids like "gaming+hoc-tap"
export async function buildServer(guild, planOrThemeIds, onProgress = async () => {}) {
  const plan = typeof planOrThemeIds === "object" && !Array.isArray(planOrThemeIds) ? planOrThemeIds : buildPlan(planOrThemeIds);
  const record = loadRecord(guild.id);
  record.theme = plan.id;

  const totalSteps = plan.roles.length + plan.categories.length + countPlan(plan).channels;
  let done = 0;
  const step = async () => {
    done += 1;
    if (done % 3 === 0 || done === totalSteps) await onProgress(`${humor.pick(humor.progressLines)}\n${bar(done, totalSteps)}`);
  };

  const roleByKey = {};
  const toFill = [];
  // kind to channel id, for every tagged channel in the plan, whether it was created now or already existed
  const channelsByKind = {};
  try {
    for (const def of plan.roles) {
      const role = await ensureRole(guild, def, record);
      roleByKey[def.key] = role;
      if (def.pick && !record.pickRoles.includes(role.id)) record.pickRoles.push(role.id);
      await step();
    }

    for (const categoryDef of plan.categories) {
      const category = await ensureCategory(guild, categoryDef, record, roleByKey);
      await step();
      for (const channelDef of categoryDef.channels) {
        const { channel, created } = await ensureChannel(guild, channelDef, category, record, roleByKey);
        // Only newly made channels get content, so re-running /build never posts duplicates
        if (channelDef.kind && FILL_KINDS.has(channelDef.kind) && created) toFill.push({ kind: channelDef.kind, channel });
        if (channelDef.kind && !(channelDef.kind in channelsByKind)) channelsByKind[channelDef.kind] = channel.id;
        await step();
      }
    }
  } finally {
    // Saved even when a step throws, so /nuke still knows about whatever a half-finished build created
    saveRecord(guild.id, record);
  }

  for (const { kind, channel } of toFill) {
    await fillChannel(kind, channel, plan, roleByKey, record).catch((error) => console.error(`Fill ${kind} failed:`, error));
  }

  const welcomeChannel = toFill.find((f) => f.kind === "welcome")?.channel;
  if (welcomeChannel) await guild.setSystemChannel(welcomeChannel).catch(() => {});

  return { counts: countPlan(plan), record, channelsByKind };
}

// Deletes everything the bot recorded for this server. skipChannelId is left alone (the channel the command ran in).
export async function nukeServer(guild, skipChannelId = null) {
  const record = loadRecord(guild.id);
  let removed = 0;
  const drop = async (collection, id) => {
    const item = collection.cache.get(id) ?? (await collection.fetch(id).catch(() => null));
    if (!item || id === skipChannelId) return;
    await item.delete("Thầu xây dựng đập đi xây lại").then(() => (removed += 1)).catch(() => {});
    await sleep(STEP_DELAY);
  };
  for (const id of record.channels) await drop(guild.channels, id);
  for (const id of record.categories) await drop(guild.channels, id);
  for (const id of record.roles) await drop(guild.roles, id);
  if (skipChannelId && record.channels.includes(skipChannelId)) {
    saveRecord(guild.id, { ...record, roles: [], pickRoles: [], categories: [], channels: [skipChannelId] });
  } else {
    clearRecord(guild.id);
  }
  return removed;
}

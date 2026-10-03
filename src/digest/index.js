import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { patchSection } from "../settings.js";
import { digestLines as t } from "../humor/digest.js";
import { buildDigest, buildDropAlert } from "./build.js";
import { pickChannel, postSafe } from "./channel.js";
import { collectStats, fixesOf } from "./stats.js";

// The Discord side of the weekly report: wrap the pure embed, add the fix buttons, post it where the admin chose.
// Fix buttons are owned by /vietgiup, which asks an admin to confirm before anything changes.

export function toEmbed(data) {
  const embed = new EmbedBuilder().setColor(data.color).setTitle(data.title).setDescription(data.description);
  if (data.fields?.length) embed.addFields(data.fields);
  if (data.footer) embed.setFooter({ text: data.footer });
  return embed;
}

export function fixRows(fixIds, titles = {}) {
  const buttons = [...new Set(fixIds)]
    .slice(0, 3)
    .map((id) => new ButtonBuilder().setCustomId(`vietgiup:fix:${id}`).setLabel(t.fixButton(titles[id] ?? id)).setStyle(ButtonStyle.Success));
  return buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];
}

const titlesOf = (suggestions) => Object.fromEntries(suggestions.filter((s) => s.fixId).map((s) => [s.fixId, s.title]));

// Posts the weekly report to the channel the admin chose (never to a guess). A preview does not touch the schedule.
// Returns { ok, stats } or { ok: false, reason, missing }.
export async function sendDigest(guild, { settings, preview = false, now = Date.now(), freshAudit = !preview, audit } = {}) {
  const channel = pickChannel(guild, [settings.channelId], { system: false });
  if (!channel) return { ok: false, reason: "channel", missing: [] };
  const stats = await collectStats(guild, { now, freshAudit, audit });
  const built = buildDigest(stats, { guildName: guild.name, preview });
  const posted = await postSafe(guild, channel, { embeds: [toEmbed(built.embed)], components: fixRows(built.fixIds, titlesOf(built.suggestions)) });
  if (!posted.ok) return posted;
  if (!preview && Number.isInteger(stats.score)) patchSection(guild.id, "digest", { lastScore: stats.score });
  return { ok: true, stats };
}

// Posts the score drop alert with the safe-fix buttons, to the digest channel
export async function sendDropAlert(guild, { settings, before, after, report }) {
  const channel = pickChannel(guild, [settings.channelId], { system: false });
  const fixes = fixesOf(guild, report);
  const built = buildDropAlert({ before, after, findings: report?.findings ?? [], fixes });
  return postSafe(guild, channel, { embeds: [toEmbed(built.embed)], components: fixRows(built.fixIds, Object.fromEntries(fixes.map((f) => [f.id, f.title]))) });
}

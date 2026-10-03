import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageType, PermissionFlagsBits as P } from "discord.js";
import { getSection, patchSection } from "../settings.js";
import { gateFeature } from "../utils/gate.js";
import { securityLines as lines, permLabels } from "../humor/security.js";
import { createRaidDetector } from "./raid.js";
import { planLock, planRestore, raisedVerification, restoreValue, shouldRestoreVerification } from "./lockdown.js";

const EMPTY = { active: false, since: 0, prevVerification: null, channels: [] };
const busy = new Set();

export const missingPerms = (guild, flags) => {
  const me = guild.members?.me;
  if (!me) return flags.map((f) => permLabels[f] ?? f);
  if (me.permissions.has(P.Administrator)) return [];
  return flags.filter((f) => !me.permissions.has(P[f])).map((f) => permLabels[f] ?? f);
};

// Where an alert goes: the chosen channel, else the system channel, and only if the bot can actually post there
export function alertChannel(guild, settings) {
  const candidates = [settings.alertChannelId ? guild.channels?.cache?.get(settings.alertChannelId) : null, guild.systemChannel];
  for (const channel of candidates) {
    if (!channel?.send) continue;
    const perms = channel.permissionsFor?.(guild.members?.me);
    if (perms && !(perms.has(P.ViewChannel) && perms.has(P.SendMessages) && perms.has(P.EmbedLinks))) continue;
    return channel;
  }
  return null;
}

export async function postAlert(guild, settings, payload) {
  const channel = alertChannel(guild, settings);
  if (!channel) return false;
  try {
    await channel.send({ ...payload, allowedMentions: { parse: [] } });
    return true;
  } catch (error) {
    console.error("Could not post a security alert:", error.message);
    return false;
  }
}

// Locks the server. channels: lock text channels, verify: raise the verification level one step. Everything it changes is recorded
// in settings first, so a restart or a crash still leaves enough to put things back.
export async function startLockdown(guild, { channels = true, verify = false, now = Date.now(), reason = "Khoá khẩn cấp" } = {}) {
  const guildId = guild.id;
  if (busy.has(guildId)) return { ok: false, reason: "busy" };
  busy.add(guildId);
  try {
    const settings = getSection(guildId, "security");
    if (settings.lockdown.active) return { ok: false, reason: "active" };

    const need = [];
    if (channels) need.push("ManageChannels", "ManageRoles");
    if (verify) need.push("ManageGuild");
    const missing = missingPerms(guild, need);
    if (missing.length) return { ok: false, reason: "perms", missing };

    const plan = channels ? planLock([...(guild.channels?.cache?.values?.() ?? [])], guildId, guild.roles?.everyone) : [];
    const prev = verify ? guild.verificationLevel : null;
    const next = verify ? raisedVerification(prev) : null;
    if (!plan.length && next === null) return { ok: false, reason: "nothing" };

    patchSection(guildId, "security", { lockdown: { active: true, since: now, prevVerification: next === null ? null : prev, channels: plan } });

    let locked = 0;
    for (const entry of plan) {
      try {
        await guild.channels.cache.get(entry.id).permissionOverwrites.edit(guildId, { SendMessages: false }, { reason });
        locked += 1;
      } catch (error) {
        console.error(`Could not lock ${entry.id}:`, error.message);
      }
    }
    let raised = null;
    if (next !== null) {
      try {
        await guild.setVerificationLevel(next, reason);
        raised = { from: prev, to: next };
      } catch (error) {
        console.error("Could not raise the verification level:", error.message);
        patchSection(guildId, "security", { lockdown: { ...getSection(guildId, "security").lockdown, prevVerification: null } });
      }
    }
    if (!locked && !raised) {
      patchSection(guildId, "security", { lockdown: EMPTY });
      return { ok: false, reason: "failed" };
    }
    return { ok: true, locked, raised };
  } finally {
    busy.delete(guildId);
  }
}

// Puts back exactly what the lockdown changed. Safe to call twice.
export async function stopLockdown(guild, { reason = "Mở khoá" } = {}) {
  const guildId = guild.id;
  if (busy.has(guildId)) return { ok: false, reason: "busy" };
  busy.add(guildId);
  try {
    const { lockdown } = getSection(guildId, "security");
    if (!lockdown.active) return { ok: false, reason: "inactive" };

    const { restore, skipped } = planRestore(lockdown.channels, (id) => guild.channels?.cache?.get(id), guildId);
    const failed = [];
    let restored = 0;
    for (const entry of restore) {
      try {
        await guild.channels.cache.get(entry.id).permissionOverwrites.edit(guildId, { SendMessages: restoreValue(entry.sendMessages) }, { reason });
        restored += 1;
      } catch {
        failed.push(`<#${entry.id}>`);
      }
    }
    let verification = false;
    if (shouldRestoreVerification(lockdown.prevVerification, guild.verificationLevel)) {
      try {
        await guild.setVerificationLevel(lockdown.prevVerification, reason);
        verification = true;
      } catch {
        failed.push("mức xác minh");
      }
    }
    patchSection(guildId, "security", { lockdown: EMPTY });
    return { ok: true, restored, skipped: skipped.length, failed, verification };
  } finally {
    busy.delete(guildId);
  }
}

const unlockRow = () =>
  new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("khoakhan:unlock").setLabel(lines.unlockButton).setEmoji("🔓").setStyle(ButtonStyle.Success));

// What anti-raid does once the threshold is crossed. The unlock button is only offered when something was actually locked.
export async function triggerRaid(guild, { count, now = Date.now() } = {}) {
  const settings = getSection(guild.id, "security");
  if (!settings.raidEnabled || settings.lockdown.active) return { ok: false, reason: settings.lockdown.active ? "active" : "off" };

  const notes = [lines.raidBody(count, settings.raidWindowSec)];
  let applied = false;
  if (settings.raidAction === "alert") {
    notes.push(lines.raidActionAlert);
  } else {
    const result = await startLockdown(guild, {
      channels: settings.raidAction === "lock",
      verify: settings.raidAction === "verify",
      now,
      reason: "Chống raid tự động",
    });
    if (result.ok) {
      applied = true;
      if (result.raised) notes.push(lines.raidActionVerify(lines.verifyNames[result.raised.from], lines.verifyNames[result.raised.to]));
      if (settings.raidAction === "lock") notes.push(lines.raidActionLock(result.locked));
      notes.push(lines.raidAutoUnlock(settings.lockMinutes));
    } else {
      notes.push(result.reason === "perms" ? `${lines.raidActionFailed} Thiếu: ${result.missing.join(", ")}.` : lines.raidActionFailed);
    }
  }
  const embed = new EmbedBuilder().setColor(0xe74c3c).setTitle(lines.raidTitle).setDescription(notes.join("\n"));
  const posted = await postAlert(guild, settings, { embeds: [embed], components: applied ? [unlockRow()] : [] });
  return { ok: true, applied, posted };
}

const detector = createRaidDetector();

// Called for Discord's own join notice. Counts it, and on a trip runs the raid action. Never throws.
export async function handleRaidJoin(message, { det = detector, trigger = triggerRaid } = {}) {
  try {
    if (message?.type !== MessageType.UserJoin || !message.guild) return false;
    if (!message.author || message.author.bot) return false;
    const guild = message.guild;
    const settings = getSection(guild.id, "security");
    if (!settings.raidEnabled || gateFeature(guild.id, "security")) return false;
    const result = det.record(guild.id, message.id, { limit: settings.raidJoins, windowSec: settings.raidWindowSec });
    if (!result.tripped) return false;
    await trigger(guild, { count: result.count });
    return true;
  } catch (error) {
    console.error("Raid handler error:", error);
    return false;
  }
}

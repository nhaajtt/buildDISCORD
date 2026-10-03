import { AuditLogEvent, EmbedBuilder, PermissionFlagsBits as P } from "discord.js";
import { getSection } from "../settings.js";
import { gateFeature } from "../utils/gate.js";
import { securityLines as lines } from "../humor/security.js";
import { createNukeCounter, ignoreExecutor, memberRefusal, pickStrippable } from "./nukeguard.js";
import { missingPerms, postAlert } from "./guard.js";

const counter = createNukeCounter();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Who deleted `targetId`, from the audit log. null when the bot may not read it or nothing matches (degrades quietly).
export async function findExecutor(guild, type, targetId, { now = Date.now(), delayMs = 1200 } = {}) {
  const me = guild.members?.me;
  if (!me || !(me.permissions.has(P.Administrator) || me.permissions.has(P.ViewAuditLog))) return null;
  if (delayMs) await wait(delayMs);
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 8 });
    const entry = [...logs.entries.values()].find((e) => (e.targetId ?? e.target?.id) === targetId && Math.abs(Date.now() - e.createdTimestamp) < 30_000);
    return entry ? (entry.executorId ?? entry.executor?.id ?? null) : null;
  } catch {
    return null;
  }
}

const refusalText = { owner: "chủ server", bot: "bot", above: "người này nằm ngang hoặc trên role của bot" };

// One deletion happened. Counts it and, on a trip, alerts and takes dangerous roles away from the culprit when allowed.
export async function handleDeletion(guild, targetId, type, { botId, now = Date.now(), delayMs, find = findExecutor, count = counter } = {}) {
  try {
    const settings = getSection(guild.id, "security");
    if (!settings.nukeEnabled || gateFeature(guild.id, "nukeGuard")) return { handled: false, reason: "off" };

    const executorId = await find(guild, type, targetId, { now, delayMs });
    if (ignoreExecutor({ executorId, ownerId: guild.ownerId, botId })) return { handled: false, reason: "ignored" };

    const result = count.record(guild.id, executorId, { threshold: settings.nukeThreshold, windowSec: settings.nukeWindowSec });
    if (!result.tripped) return { handled: false, reason: "below" };

    const notes = [lines.nukeBody(executorId, result.count, settings.nukeWindowSec)];
    let stripped = [];
    const me = guild.members.me;
    const botHighest = me.roles.highest.position;
    let member = null;
    try {
      member = await guild.members.fetch(executorId);
    } catch {
      member = null;
    }
    if (member) {
      const refusal = memberRefusal({ memberId: executorId, ownerId: guild.ownerId, botId, memberHighest: member.roles.highest.position, botHighest });
      if (refusal) {
        notes.push(lines.nukeKept(refusalText[refusal]));
      } else if (missingPerms(guild, ["ManageRoles"]).length) {
        notes.push(lines.nukeNoManage);
      } else {
        const { strip, kept } = pickStrippable([...member.roles.cache.values()], { guildId: guild.id, botHighest });
        if (strip.length) {
          try {
            await member.roles.remove(strip.map((r) => r.id), "Chống xoá hàng loạt");
            stripped = strip;
          } catch (error) {
            console.error("Could not strip roles:", error.message);
          }
        }
        notes.push(stripped.length ? lines.nukeStripped(stripped.map((r) => `<@&${r.id}> (${r.id})`).join(", ")) : lines.nukeNothing);
        if (kept.length) notes.push(lines.nukeKept(kept.map((k) => `<@&${k.role.id}> (${lines.keptWhy[k.why]})`).join(", ")));
      }
    }
    const embed = new EmbedBuilder().setColor(0xc0392b).setTitle(lines.nukeTitle).setDescription(notes.join("\n").slice(0, 4000));
    const posted = await postAlert(guild, settings, { embeds: [embed] });
    return { handled: true, executorId, stripped: stripped.map((r) => r.id), posted, count: result.count };
  } catch (error) {
    console.error("Anti-nuke error:", error);
    return { handled: false, reason: "error" };
  }
}

export const onChannelDelete = (channel) =>
  channel.guild ? handleDeletion(channel.guild, channel.id, AuditLogEvent.ChannelDelete, { botId: channel.client?.user?.id }) : null;
// An integration role vanishes with its bot, so removing a bot is not a role purge
export const onRoleDelete = (role) => (role.managed ? null : handleDeletion(role.guild, role.id, AuditLogEvent.RoleDelete, { botId: role.client?.user?.id }));

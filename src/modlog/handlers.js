import { automodEmbed, banEmbed, diffPermissions, roleEmbed } from "./embeds.js";
import { postModLog, wasBotAction } from "./index.js";

// The logging side of each event, kept apart from the event files so it can be tested with plain objects. None of these throws.

export async function logBan(ban) {
  try {
    const guild = ban.guild;
    if (!guild || !ban.user || wasBotAction(guild.id, ban.user.id, "ban")) return false;
    return await postModLog(guild, banEmbed({ userId: ban.user.id, reason: ban.reason, banned: true }), "ban");
  } catch (error) {
    console.error("Mod log (ban) failed:", error.message);
    return false;
  }
}

export async function logUnban(ban) {
  try {
    if (!ban.guild || !ban.user) return false;
    return await postModLog(ban.guild, banEmbed({ userId: ban.user.id, banned: false }), "ban");
  } catch (error) {
    console.error("Mod log (unban) failed:", error.message);
    return false;
  }
}

export async function logRoleUpdate(oldRole, newRole) {
  try {
    if (!newRole?.guild || oldRole.permissions.bitfield === newRole.permissions.bitfield) return false;
    const { added, removed } = diffPermissions(oldRole.permissions.bitfield, newRole.permissions.bitfield);
    if (!added.length && !removed.length) return false;
    return await postModLog(newRole.guild, roleEmbed({ roleId: newRole.id, roleName: newRole.name, added, removed }), "role");
  } catch (error) {
    console.error("Mod log (role) failed:", error.message);
    return false;
  }
}

// Reads the rule, the person and the channel. The execution also carries the message text, which is deliberately not touched.
export async function logAutomod(execution) {
  try {
    const guild = execution.guild;
    if (!guild) return false;
    const embed = automodEmbed({
      ruleName: execution.autoModerationRule?.name,
      ruleTriggerType: execution.ruleTriggerType,
      userId: execution.userId,
      channelId: execution.channelId,
    });
    return await postModLog(guild, embed, "automod");
  } catch (error) {
    console.error("Mod log (automod) failed:", error.message);
    return false;
  }
}

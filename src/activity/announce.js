import { getScore, LEVELS } from "../games/points.js";
import { applyLevelRoles } from "../games/levelroles.js";
import { tierForLevel } from "./level.js";
import * as lines from "../humor/activity.js";

// What a level-up does: the existing level roles are brought in line (through src/games/levelroles.js, which never makes them
// self-assignable and records them for /nuke), and the news goes to the announce channel if one is set. Everything here is best effort.
export async function onLevelUp({ guild, userId, member = null, levelBefore, levelAfter, settings }) {
  try {
    if (tierForLevel(levelAfter) !== tierForLevel(levelBefore)) {
      const who = member ?? (await guild.members.fetch(userId).catch(() => null));
      if (who) {
        const floor = LEVELS[tierForLevel(levelAfter)].min;
        // Never below what check-in points already earned, so the two systems do not undo each other
        await applyLevelRoles(guild, who, Math.max(floor, getScore(guild.id, userId).points));
      }
    }
  } catch {
    // a missing permission is reported once by /hang caidat, not on every level
  }
  try {
    const channel = settings.announceChannelId ? guild.channels.cache.get(settings.announceChannelId) : null;
    if (!channel?.isTextBased?.()) return;
    const perms = channel.permissionsFor?.(guild.members.me);
    if (perms && !(perms.has("ViewChannel") && perms.has("SendMessages"))) return;
    await channel.send({ content: lines.levelUp(userId, levelAfter), allowedMentions: { parse: [] } });
  } catch {
    // announcing is a nicety
  }
}

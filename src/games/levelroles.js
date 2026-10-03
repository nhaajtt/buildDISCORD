import { loadRecord, saveRecord } from "../store.js";
import { LEVELS, levelFor } from "./points.js";

export const levelRoleName = (level) => `🏅 ${level.name}`;

// Which level role a person should hold for their points, and which other level roles they should lose. Based on the roles they have now,
// so it repairs itself if someone removed or added one by hand.
export function planLevelRoles(roleNames, points) {
  const level = levelFor(points);
  const target = levelRoleName(level);
  const owned = new Set(roleNames);
  return {
    level,
    give: owned.has(target) ? null : target,
    remove: LEVELS.map(levelRoleName).filter((name) => name !== target && owned.has(name)),
  };
}

// Applies the plan to a real server. The roles are created on first use, recorded for /nuke, and never added to the self-assign list.
// Anything that goes wrong (no permission, role above the bot, member left) is skipped quietly: levels are a nicety, not a feature to scold about.
export async function applyLevelRoles(guild, member, points) {
  try {
    if (!guild.members.me?.permissions.has("ManageRoles")) return false;
    const plan = planLevelRoles([...member.roles.cache.values()].map((r) => r.name), points);
    if (!plan.give && !plan.remove.length) return false;

    if (plan.give) {
      let role = [...guild.roles.cache.values()].find((r) => r.name === plan.give);
      if (!role) {
        role = await guild.roles.create({ name: plan.give, colors: { primaryColor: plan.level.color }, reason: "Cấp độ mini-game" });
        const record = loadRecord(guild.id);
        record.roles.push(role.id);
        saveRecord(guild.id, record);
      }
      if (role.editable) await member.roles.add(role);
    }
    for (const name of plan.remove) {
      const role = [...guild.roles.cache.values()].find((r) => r.name === name);
      if (role?.editable) await member.roles.remove(role);
    }
    return true;
  } catch {
    return false;
  }
}

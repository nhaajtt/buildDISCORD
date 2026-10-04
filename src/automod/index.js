import { PermissionFlagsBits } from "discord.js";
import { getSection, patchSection } from "../settings.js";
import { gateFeature } from "../utils/gate.js";
import { getPlan } from "../license.js";
import { CUSTOM_KEY, buildRuleDefs, editPayload, planSync } from "./rules.js";

const REASON = "Thầu: AutoMod";
const UNKNOWN_RULE = 10066;

// Sorts a Discord failure into what the admin can act on
export function classifyError(error) {
  if (error?.code === 50013 || error?.code === 50001 || error?.status === 403) return "perms";
  if (/maximum|too many|limit/i.test(String(error?.message ?? ""))) return "limit";
  return "other";
}

const isGone = (error) => error?.code === UNKNOWN_RULE || error?.status === 404;

// The refusal a requested setup earns on this plan, or null when allowed
export function gateAutomod(guildId, { level = "nhe", blockLinks = false, exempt = false } = {}) {
  if (level !== "nhe" || blockLinks || exempt) return gateFeature(guildId, "automodFull");
  return null;
}

export { standardOn };
export const hasFullPlan = (guildId) => gateFeature(guildId, "automodFull") === null;

async function fetchExisting(guild) {
  const rules = await guild.autoModerationRules.fetch();
  return new Map(rules instanceof Map ? rules : []);
}

const empty = () => ({ failed: [], created: [], updated: [], removed: [] });

const chains = new Map();

// Brings the server's rules in line with the saved settings, touching only rules whose ids the bot recorded.
// Calls for one server run one after another, so two quick changes can never create the same rule twice.
export function syncAutomod(guild) {
  const run = (chains.get(guild.id) ?? Promise.resolve()).then(() => syncNow(guild));
  const tail = run.catch(() => {});
  chains.set(guild.id, tail);
  tail.then(() => {
    if (chains.get(guild.id) === tail) chains.delete(guild.id);
  });
  return run;
}

const planFor = (guildId) => ({ full: hasFullPlan(guildId), customLimit: getPlan(guildId).customWords });

// The standard rules are on when any recorded rule other than the custom words one exists
const standardOn = (ruleIds) => Object.keys(ruleIds).some((key) => key !== CUSTOM_KEY);

async function syncNow(guild) {
  const settings = getSection(guild.id, "automod");
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuild)) return { ok: false, kind: "perms", ...empty() };

  let existing;
  try {
    existing = await fetchExisting(guild);
  } catch (error) {
    return { ok: false, kind: classifyError(error), message: error.message, ...empty() };
  }

  const desired = buildRuleDefs(settings, planFor(guild.id));
  const plan = planSync(desired, settings.ruleIds, existing);
  const ruleIds = { ...settings.ruleIds };
  const result = { ok: true, ...empty() };
  const manager = guild.autoModerationRules;

  for (const { key, id, exists } of plan.remove) {
    try {
      if (exists) await manager.delete(id, REASON);
      delete ruleIds[key];
      result.removed.push(key);
    } catch (error) {
      if (isGone(error)) delete ruleIds[key];
      else result.failed.push({ key, kind: classifyError(error), message: error.message });
    }
  }
  for (const { key, id, def } of plan.update) {
    try {
      // The trigger type of an existing rule cannot change, so it is left out of the edit
      const { triggerType, ...changes } = editPayload(def);
      await manager.edit(id, { ...changes, reason: REASON });
      result.updated.push(key);
    } catch (error) {
      result.failed.push({ key, kind: classifyError(error), message: error.message });
    }
  }
  for (const { key, def, recreated } of plan.create) {
    try {
      const rule = await manager.create({ ...editPayload(def), reason: REASON });
      ruleIds[key] = rule.id;
      result.created.push(key);
    } catch (error) {
      // A recorded id that points at nothing is dropped so the stored state stays honest
      if (recreated) delete ruleIds[key];
      result.failed.push({ key, kind: classifyError(error), message: error.message });
    }
  }

  patchSection(guild.id, "automod", { ruleIds, enabled: standardOn(ruleIds) });
  result.ok = result.failed.length === 0;
  return result;
}

// Deletes exactly the recorded rules. Never throws: a rule that fails to delete stays recorded so a retry can finish the job.
export async function removeAutomod(guild) {
  const settings = getSection(guild.id, "automod");
  const left = {};
  let removed = 0;
  for (const [key, id] of Object.entries(settings.ruleIds)) {
    try {
      await guild.autoModerationRules.delete(id, REASON);
      removed += 1;
    } catch (error) {
      if (isGone(error)) removed += 1;
      else left[key] = id;
    }
  }
  patchSection(guild.id, "automod", { enabled: false, ruleIds: left });
  return { removed, left: Object.keys(left).length };
}

// Current rules against what the settings call for. state is ok, changed (edited by someone), missing (deleted) or extra (no longer wanted).
export async function automodStatus(guild) {
  const settings = getSection(guild.id, "automod");
  const { full, customLimit } = planFor(guild.id);
  const existing = await fetchExisting(guild);
  const plan = planSync(buildRuleDefs(settings, { full, customLimit }), settings.ruleIds, existing);
  const changed = new Set(plan.update.map((u) => u.key));
  const extra = new Set(plan.remove.map((r) => r.key));
  const rules = Object.entries(settings.ruleIds).map(([key, id]) => {
    const rule = existing.get(id);
    const state = !rule ? "missing" : extra.has(key) ? "extra" : changed.has(key) ? "changed" : "ok";
    return { key, id, name: rule?.name ?? key, enabled: rule ? rule.enabled !== false : false, state };
  });
  return { settings, full, rules };
}

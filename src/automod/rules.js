import {
  AutoModerationActionType as Action,
  AutoModerationRuleEventType,
  AutoModerationRuleKeywordPresetType as Preset,
  AutoModerationRuleTriggerType as Trigger,
} from "discord.js";
import { blockMessages, ruleLabels } from "../humor/automod.js";

// Pure description of the Discord AutoMod rules the bot wants and the plan to reach them. Nothing here talks to Discord.

export const PREFIX = "Thầu: ";

// Discord's own limits
export const LIMITS = { regexPerRule: 10, regexLength: 260, customMessage: 150, keywordRules: 6, exemptRoles: 20, timeoutSeconds: 60 };

const INVITE_PATTERNS = ["(?i)(?:discord(?:app)?\\.com/invite|discord\\.gg|dsc\\.gg)/[a-z0-9-]+"];
const LINK_PATTERNS = ["(?i)https?://[^\\s]+", "(?i)\\bwww\\.[^\\s]+"];

const cap = (text) => String(text).slice(0, LIMITS.customMessage);

function actionsFor(key, settings, { timeout = false } = {}) {
  const actions = [{ type: Action.BlockMessage, metadata: { customMessage: cap(blockMessages[key]) } }];
  if (settings.logChannelId) actions.push({ type: Action.SendAlertMessage, metadata: { channel: settings.logChannelId } });
  if (timeout) actions.push({ type: Action.Timeout, metadata: { durationSeconds: LIMITS.timeoutSeconds } });
  return actions;
}

function keywordRule(key, settings, patterns, exemptRoles) {
  const regexPatterns = patterns.filter((p) => p.length <= LIMITS.regexLength).slice(0, LIMITS.regexPerRule);
  return {
    key,
    name: `${PREFIX}${ruleLabels[key]}`,
    eventType: AutoModerationRuleEventType.MessageSend,
    triggerType: Trigger.Keyword,
    triggerMetadata: { regexPatterns },
    actions: actionsFor(key, settings),
    enabled: true,
    exemptRoles,
  };
}

// The rules a server should have for its settings. Without `full` (free plan) only the gentle level with invite blocking exists,
// and exempt roles are ignored, whatever the stored settings say.
export function buildRuleDefs(settings, { full = false } = {}) {
  const level = full ? settings.level : "nhe";
  const exemptRoles = full ? settings.exemptRoleIds.slice(0, LIMITS.exemptRoles) : [];
  const defs = [];

  defs.push({
    key: "spam",
    name: `${PREFIX}${ruleLabels.spam}`,
    eventType: AutoModerationRuleEventType.MessageSend,
    triggerType: Trigger.Spam,
    triggerMetadata: {},
    actions: actionsFor("spam", settings),
    enabled: true,
    exemptRoles,
  });
  if (settings.blockInvites) defs.push(keywordRule("invites", settings, INVITE_PATTERNS, exemptRoles));

  if (level === "vua" || level === "gat") {
    defs.push({
      key: "mentions",
      name: `${PREFIX}${ruleLabels.mentions}`,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: Trigger.MentionSpam,
      triggerMetadata: { mentionTotalLimit: settings.mentionLimit },
      actions: actionsFor("mentions", settings, { timeout: true }),
      enabled: true,
      exemptRoles,
    });
    // One preset rule per server, so the strict level widens this rule instead of adding another
    defs.push({
      key: "words",
      name: `${PREFIX}${ruleLabels.words}`,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: Trigger.KeywordPreset,
      triggerMetadata: { presets: level === "gat" ? [Preset.Profanity, Preset.SexualContent, Preset.Slurs] : [Preset.Profanity, Preset.Slurs] },
      actions: actionsFor("words", settings),
      enabled: true,
      exemptRoles,
    });
  }
  if (level === "gat" && settings.blockLinks) defs.push(keywordRule("links", settings, LINK_PATTERNS, exemptRoles));

  const keywordRules = defs.filter((d) => d.triggerType === Trigger.Keyword);
  return defs.filter((d) => d.triggerType !== Trigger.Keyword || keywordRules.indexOf(d) < LIMITS.keywordRules);
}

const sorted = (list) => [...list].sort();
const idsOf = (value) => {
  if (!value) return [];
  const list = value instanceof Map ? [...value.keys()] : Array.isArray(value) ? value : [];
  return sorted(list.map((entry) => (typeof entry === "string" ? entry : entry?.id)).filter(Boolean));
};

// One comparable shape for a definition and for a rule fetched from Discord, which names a few fields differently
export function canonical(rule) {
  const meta = rule.triggerMetadata ?? {};
  return JSON.stringify({
    name: rule.name,
    enabled: Boolean(rule.enabled),
    eventType: rule.eventType,
    triggerType: rule.triggerType,
    keywords: sorted(meta.keywordFilter ?? []),
    regex: sorted(meta.regexPatterns ?? []),
    presets: sorted(meta.presets ?? []),
    limit: meta.mentionTotalLimit ?? null,
    actions: (rule.actions ?? [])
      .map((a) => [a.type, a.metadata?.channel?.id ?? a.metadata?.channel ?? a.metadata?.channelId ?? null, a.metadata?.durationSeconds ?? null, a.metadata?.customMessage ?? null])
      .sort((x, y) => x[0] - y[0]),
    exempt: idsOf(rule.exemptRoles),
  });
}

const lookup = (existing, id) => (existing instanceof Map ? existing.get(id) : existing?.[id]);

// What to create, update and remove, looking only at the ids the bot recorded. A rule an admin made is never in any of the lists.
export function planSync(desired, recordedRuleIds = {}, existingRulesById = new Map()) {
  const plan = { create: [], update: [], remove: [] };
  const wanted = new Set(desired.map((d) => d.key));

  for (const def of desired) {
    const id = recordedRuleIds[def.key];
    const current = id ? lookup(existingRulesById, id) : null;
    if (!current) plan.create.push({ key: def.key, def, recreated: Boolean(id) });
    else if (canonical(current) !== canonical(def)) plan.update.push({ key: def.key, id, def });
  }
  for (const [key, id] of Object.entries(recordedRuleIds)) {
    if (!wanted.has(key)) plan.remove.push({ key, id, exists: Boolean(lookup(existingRulesById, id)) });
  }
  return plan;
}

// What discord.js accepts when creating or editing, without our bookkeeping key
export function editPayload(def) {
  const { key, ...rest } = def;
  return rest;
}

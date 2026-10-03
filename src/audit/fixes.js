import { GuildExplicitContentFilter, GuildVerificationLevel } from "discord.js";
import { auditLines as lines, permLabels, verificationLabels } from "../humor/audit.js";
import { DANGEROUS, DANGEROUS_MASK, namesIn, toBits } from "./perms.js";

// The only things this bot ever changes by itself, and only after an admin confirms. Each fix removes risk and never grants anything.
// describe(guild) says exactly what apply(guild) would change right now, or returns null when there is nothing to change.

const REASON = "Khám sức khỏe server";
const everyoneOf = (guild) => guild.roles?.everyone ?? guild.roles?.cache?.get(guild.id) ?? null;
const labelOf = (name) => permLabels[name] ?? name;

const stripEveryone = {
  id: "strip-everyone",
  title: lines.fixTitles["strip-everyone"],
  hits(guild) {
    const everyone = everyoneOf(guild);
    return everyone ? namesIn(toBits(everyone.permissions), DANGEROUS) : [];
  },
  describe(guild) {
    const hits = this.hits(guild);
    return hits.length ? lines.fixLabels["strip-everyone"](hits.map(labelOf)) : null;
  },
  async apply(guild) {
    const hits = this.hits(guild);
    if (!hits.length) return { fixId: this.id, changed: false, summary: lines.fixSkipped(this.title) };
    const everyone = everyoneOf(guild);
    // Only the dangerous bits are cleared, every other bit keeps its value
    await everyone.setPermissions(toBits(everyone.permissions) & ~DANGEROUS_MASK, REASON);
    return { fixId: this.id, changed: true, summary: lines.fixDoneLines[this.id](hits.map(labelOf)) };
  },
};

const raiseVerification = {
  id: "verification-medium",
  title: lines.fixTitles["verification-medium"],
  current: (guild) => (typeof guild.verificationLevel === "number" ? guild.verificationLevel : null),
  describe(guild) {
    const now = this.current(guild);
    return now !== null && now < GuildVerificationLevel.Medium ? lines.fixLabels[this.id](verificationLabels[now] ?? String(now)) : null;
  },
  async apply(guild) {
    if (this.describe(guild) === null) return { fixId: this.id, changed: false, summary: lines.fixSkipped(this.title) };
    await guild.setVerificationLevel(GuildVerificationLevel.Medium, REASON);
    return { fixId: this.id, changed: true, summary: lines.fixDoneLines[this.id]() };
  },
};

const contentFilter = {
  id: "content-filter",
  title: lines.fixTitles["content-filter"],
  describe: (guild) => (guild.explicitContentFilter === GuildExplicitContentFilter.Disabled ? lines.fixLabels["content-filter"]() : null),
  async apply(guild) {
    if (this.describe(guild) === null) return { fixId: this.id, changed: false, summary: lines.fixSkipped(this.title) };
    await guild.setExplicitContentFilter(GuildExplicitContentFilter.AllMembers, REASON);
    return { fixId: this.id, changed: true, summary: lines.fixDoneLines[this.id]() };
  },
};

export const FIXES = { [stripEveryone.id]: stripEveryone, [raiseVerification.id]: raiseVerification, [contentFilter.id]: contentFilter };

export const getFix = (fixId) => (Object.hasOwn(FIXES, fixId) ? FIXES[fixId] : null);

// The fix ids a report points at, without repeats, in the order the findings come
export const fixIdsOf = (report) => [...new Set((report?.findings ?? []).map((f) => f?.fixId).filter((id) => typeof id === "string" && getFix(id)))];

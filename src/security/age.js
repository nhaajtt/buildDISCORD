import { EmbedBuilder, MessageType } from "discord.js";
import { getSection } from "../settings.js";
import { addCase } from "../modlog/cases.js";
import { caseEmbed } from "../modlog/embeds.js";
import { postModLog } from "../modlog/index.js";
import { securityLines as lines } from "../humor/security.js";
import { missingPerms, postAlert } from "./guard.js";

// New-account filter. The bot reads no message: it only sees Discord's own join notice, fetches that one member and looks at
// the account's creation date.

export const DAY_MS = 86_400_000;
export const KICK_REASON = "tài khoản quá mới";

// True when the account is younger than minDays. 0 turns the filter off. A missing or future date is never young: it
// means a bad clock or bad data, and nobody is acted on for that.
export function young(createdMs, nowMs, minDays) {
  const created = Number(createdMs);
  const now = Number(nowMs);
  const min = Number(minDays);
  if (!Number.isFinite(created) || !Number.isFinite(now) || !Number.isFinite(min) || min <= 0) return false;
  const age = now - created;
  if (age < 0) return false;
  return age < min * DAY_MS;
}

// Whole days the account has existed
export function ageDays(createdMs, nowMs) {
  const age = Number(nowMs) - Number(createdMs);
  return Number.isFinite(age) && age > 0 ? Math.floor(age / DAY_MS) : 0;
}

// One queue per server so a raid cannot make the bot fetch hundreds of members at once. Jobs run one at a time, at least gapMs
// apart. The same person waiting twice is queued once, and a queue past maxPerGuild drops the newest.
export function createJoinQueue({ worker, gapMs = 1000, maxPerGuild = 200, now = Date.now, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  const guilds = new Map();
  const running = new Set();
  const pending = new Set();

  async function drain(guildId, state) {
    try {
      while (state.jobs.length) {
        const job = state.jobs.shift();
        const delay = state.last === null ? 0 : gapMs - (now() - state.last);
        if (delay > 0) await wait(delay);
        state.last = now();
        try {
          await worker(job);
        } catch (error) {
          console.error("Account age check error:", error);
        }
        state.ids.delete(job.userId);
      }
    } finally {
      // An idle server leaves nothing behind. Both are cleared in the same step, so a join arriving right now starts a new drain.
      guilds.delete(guildId);
      running.delete(guildId);
    }
  }

  return {
    // "queued", "duplicate" or "full"
    push(guildId, job) {
      let state = guilds.get(guildId);
      if (!state) {
        state = { jobs: [], ids: new Set(), last: null };
        guilds.set(guildId, state);
      }
      if (state.ids.has(job.userId)) return "duplicate";
      if (state.jobs.length >= maxPerGuild) return "full";
      state.jobs.push({ ...job, guildId });
      state.ids.add(job.userId);
      if (!running.has(guildId)) {
        running.add(guildId);
        const done = drain(guildId, state);
        pending.add(done);
        done.finally(() => pending.delete(done));
      }
      return "queued";
    },
    size: (guildId) => guilds.get(guildId)?.jobs.length ?? 0,
    // Resolves once everything queued so far has been handled (for tests and a clean shutdown)
    async idle() {
      while (pending.size) await Promise.allSettled([...pending]);
    },
  };
}

const botTop = (guild) => guild.members?.me?.roles?.highest?.position ?? -1;

// Why a young member must not be kicked, or null. The alert is still sent.
export function kickRefusal(guild, member, welcome) {
  if (member.id === guild.ownerId) return "owner";
  if (member.user?.bot) return "bot";
  const roles = member.roles?.cache;
  // Only the role earned by pressing the verify button counts. The newbie role is handed to every joiner by the welcome flow, so
  // honouring it would let a young account walk past the filter just by joining.
  if (welcome.verifyRoleId && roles?.has(welcome.verifyRoleId)) return "welcomed";
  const lacking = missingPerms(guild, ["KickMembers"]);
  if (lacking.length) return "perm";
  if (!member.kickable || (member.roles?.highest?.position ?? 0) >= botTop(guild)) return "above";
  return null;
}

// Handles one join: fetch the member, compare the age, alert, and kick when that is what the admin chose. Never throws.
export async function checkYoungMember(guild, userId, { now = Date.now() } = {}) {
  const settings = getSection(guild.id, "security");
  if (settings.minAccountAgeDays <= 0) return { status: "off" };

  let member;
  try {
    member = await guild.members.fetch(userId);
  } catch {
    return { status: "gone" };
  }
  if (!member?.user) return { status: "gone" };
  if (member.user.bot || member.id === guild.ownerId) return { status: "exempt" };
  if (!young(member.user.createdTimestamp, now, settings.minAccountAgeDays)) return { status: "old" };

  const days = ageDays(member.user.createdTimestamp, now);
  const welcome = getSection(guild.id, "welcome");
  const refusal = kickRefusal(guild, member, welcome);
  if (refusal === "welcomed") return { status: "exempt" };

  const notes = [lines.youngBody(member.id, days, settings.minAccountAgeDays)];
  let kicked = false;
  if (settings.youngAction === "kick") {
    if (refusal) {
      notes.push(refusal === "perm" ? lines.youngKickPerm(missingPerms(guild, ["KickMembers"])) : lines.youngKickRefused[refusal]);
    } else {
      try {
        await member.kick(`Thầu: ${KICK_REASON} (${days} ngày, tối thiểu ${settings.minAccountAgeDays})`);
        kicked = true;
        notes.push(lines.youngKicked);
      } catch (error) {
        console.error("Could not kick a young account:", error.message);
        notes.push(lines.youngKickFailed);
      }
    }
  } else {
    notes.push(lines.youngAlertOnly);
  }

  if (kicked && getSection(guild.id, "modlog").enabled) {
    try {
      const modId = guild.members.me?.id ?? guild.client?.user?.id;
      const id = addCase({ guildId: guild.id, userId: member.id, modId, action: "kick", reason: KICK_REASON, at: now });
      await postModLog(guild, caseEmbed({ id, user_id: member.id, mod_id: modId, action: "kick", reason: KICK_REASON, until: null, at: now }));
    } catch (error) {
      console.error("Could not record the kick:", error.message);
    }
  }

  const embed = new EmbedBuilder().setColor(kicked ? 0xe67e22 : 0xf5c518).setTitle(lines.youngTitle).setDescription(notes.join("\n"));
  const posted = await postAlert(guild, settings, { embeds: [embed] });
  return { status: kicked ? "kicked" : "alerted", days, kicked, posted };
}

export const youngQueue = createJoinQueue({
  worker: async (job) => {
    const guild = job.guild;
    await checkYoungMember(guild, job.userId);
  },
});

const seen = new Set();

// Called for Discord's own join notice. Only queues work, so the event handler is never held up. Never throws.
export function handleYoungJoin(message, { queue = youngQueue } = {}) {
  try {
    if (message?.type !== MessageType.UserJoin || !message.guild) return "ignored";
    if (!message.author || message.author.bot) return "ignored";
    const guild = message.guild;
    const minDays = getSection(guild.id, "security").minAccountAgeDays;
    if (minDays <= 0) return "off";
    // The join notice already carries the account's creation date, so an old account costs no fetch and no queue slot
    const created = message.author.createdTimestamp;
    if (Number.isFinite(created) && !young(created, Date.now(), minDays)) return "old";
    // The same notice delivered twice is one check
    if (message.id !== undefined && message.id !== null) {
      if (seen.has(message.id)) return "duplicate";
      seen.add(message.id);
      if (seen.size > 1000) seen.delete(seen.values().next().value);
    }
    return queue.push(guild.id, { userId: message.author.id, guild });
  } catch (error) {
    console.error("Account age handler error:", error);
    return "error";
  }
}

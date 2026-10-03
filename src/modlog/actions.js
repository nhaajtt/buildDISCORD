import { MessageFlags, PermissionFlagsBits as P } from "discord.js";
import { modLines as lines, actionLabels } from "../humor/modlog.js";
import { addCase } from "./cases.js";
import { caseEmbed } from "./embeds.js";
import { clearBotAction, markBotAction, postModLog } from "./index.js";
import { banDeleteSeconds, checkTarget, cleanReason, timeoutSeconds } from "./rules.js";

const NEED = { warn: "ModerateMembers", timeout: "ModerateMembers", kick: "KickMembers", ban: "BanMembers" };
const refuse = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

const top = (member) => member?.roles?.highest?.position ?? 0;

// One moderation action from start to finish: permission checks, hierarchy checks, the action, the case row, the DM and the log.
// Every refusal happens before anything is changed.
export async function runModAction(interaction, action, { now = Date.now() } = {}) {
  const guild = interaction.guild;
  if (!guild || !interaction.guildId) return refuse(interaction, lines.noGuild);
  const perm = NEED[action];

  // The command is hidden from people without the permission, but the id can still be called, so it is checked again here
  if (!interaction.member?.permissions?.has(P[perm])) return refuse(interaction, lines.noPermission(perm));
  const me = guild.members?.me;
  if (!me?.permissions?.has(P[perm])) return refuse(interaction, lines.botMissing(perm));

  const reason = cleanReason(interaction.options.getString("lydo"));
  if (!reason) return refuse(interaction, lines.blankReason);

  let seconds = null;
  if (action === "timeout") {
    seconds = timeoutSeconds(interaction.options.getInteger("thoigian"));
    if (seconds === null) return refuse(interaction, lines.failed(actionLabels.timeout));
  }

  const target = interaction.options.getUser("nguoi");
  if (!target) return refuse(interaction, lines.notMember);
  const member = interaction.options.getMember?.("nguoi") ?? null;
  if (!member && action !== "ban") return refuse(interaction, lines.notMember);

  const refusal = checkTarget({
    actorId: interaction.user.id,
    targetId: target.id,
    botId: me.id ?? guild.client?.user?.id ?? interaction.client?.user?.id,
    ownerId: guild.ownerId,
    actorHighest: top(interaction.member),
    targetHighest: member ? top(member) : null,
    botHighest: top(me),
    targetIsAdmin: Boolean(member?.permissions?.has?.(P.Administrator)),
    action,
  });
  if (refusal) return refuse(interaction, lines.refusal[refusal]);

  // Checked before the notice goes out, so a person is never told about an action Discord will refuse
  const blocked = { kick: member?.kickable === false, ban: member?.bannable === false, timeout: member?.moderatable === false }[action];
  if (blocked) return refuse(interaction, lines.refusal.aboveBot);

  const auditReason = `${reason} (bởi ${interaction.user.id})`.slice(0, 500);
  const until = seconds ? now + seconds * 1000 : null;
  const notice = {
    warn: () => lines.dm.warn(guild.name, reason),
    timeout: () => lines.dm.timeout(guild.name, reason, until),
    kick: () => lines.dm.kick(guild.name, reason),
    ban: () => lines.dm.ban(guild.name, reason),
  }[action]();
  const tell = () => target.send?.({ content: notice.slice(0, 1800), allowedMentions: { parse: [] } })?.catch?.(() => {});

  // The notice, the action and the log can take longer than the three seconds Discord allows for a first answer
  await interaction.deferReply({ allowedMentions: { parse: [] } });
  const answer = (content) => interaction.editReply({ content, allowedMentions: { parse: [] } });

  try {
    // A kick or ban removes the shared server, so the notice goes first. A failed DM changes nothing.
    if (action === "kick" || action === "ban") await tell();
    if (action === "timeout") await member.timeout(seconds * 1000, auditReason);
    if (action === "kick") await member.kick(auditReason);
    if (action === "ban") {
      markBotAction(guild.id, target.id, "ban", now);
      await guild.members.ban(target.id, { deleteMessageSeconds: banDeleteSeconds(interaction.options.getInteger("xoatin") ?? 0), reason: auditReason });
    }
  } catch (error) {
    console.error(`Moderation ${action} failed:`, error.message);
    // The ban event will not follow, so the next real ban of this person must still be logged
    if (action === "ban") clearBotAction(guild.id, target.id, "ban");
    return answer(lines.failed(actionLabels[action]));
  }
  if (action === "warn" || action === "timeout") await tell();

  const id = addCase({ guildId: guild.id, userId: target.id, modId: interaction.user.id, action, reason, until, at: now });
  await postModLog(guild, caseEmbed({ id, action, user_id: target.id, mod_id: interaction.user.id, reason, until, at: now }));

  const done = action === "timeout" ? lines.done.timeout(id, target.id, until) : lines.done[action](id, target.id);
  return answer(done);
}

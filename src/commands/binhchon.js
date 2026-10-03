import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { pollLines as lines } from "../humor/giveaways.js";
import { DURATIONS, cleanText, durationMs } from "../activity/text.js";
import { MAX_ACTIVE_POLLS, MAX_OPTIONS, buildPollPayload, cleanOptions, countActivePolls, createPoll, discardPoll, getPoll, handlePollPress, setPollMessage } from "../activity/polls.js";

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

const canPoll = (member) => Boolean(member?.permissions?.has?.(PermissionFlagsBits.ManageMessages));

function missingInChannel(channel, me) {
  const perms = channel?.permissionsFor?.(me);
  if (!perms) return [];
  const need = [["ViewChannel", "Xem kênh"], ["SendMessages", "Gửi tin nhắn"], ["EmbedLinks", "Nhúng liên kết"]];
  return need.filter(([flag]) => !perms.has(flag)).map(([, label]) => label);
}

function buildData() {
  const command = new SlashCommandBuilder()
    .setName("binhchon")
    .setDescription("Mở bình chọn ẩn danh bằng nút bấm")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addStringOption((o) => o.setName("cauhoi").setDescription("Câu hỏi bình chọn").setRequired(true).setMaxLength(200));
  for (let i = 1; i <= MAX_OPTIONS; i += 1) {
    command.addStringOption((o) => o.setName(`lua${i}`).setDescription(`Lựa chọn ${i}`).setRequired(i <= 2).setMaxLength(80));
  }
  return command.addIntegerOption((o) => o.setName("thoigian").setDescription("Tự đóng sau bao lâu, bỏ trống là đóng bằng nút").addChoices(...DURATIONS));
}

export default {
  data: buildData(),

  async execute(interaction, { now = Date.now() } = {}) {
    const reply = (content) => interaction.reply(ephemeral(content));
    const { guild, guildId } = interaction;
    if (!guild || !guildId) return;
    if (!canPoll(interaction.member)) return reply(lines.notStaff);

    const question = cleanText(interaction.options.getString("cauhoi"), 200);
    if (!question) return reply(lines.badQuestion);
    const options = cleanOptions(Array.from({ length: MAX_OPTIONS }, (_, i) => interaction.options.getString(`lua${i + 1}`)));
    if (!options) return reply(lines.badOptions);
    const minutes = interaction.options.getInteger("thoigian");
    const ms = minutes === null || minutes === undefined ? null : durationMs(minutes);
    if (minutes !== null && minutes !== undefined && !ms) return reply(lines.badOptions);
    if (countActivePolls(guildId) >= MAX_ACTIVE_POLLS) return reply(lines.tooMany(MAX_ACTIVE_POLLS));

    const channel = interaction.channel;
    if (!channel?.send) return reply(lines.postFailed);
    const missing = missingInChannel(channel, guild.members?.me);
    if (missing.length) return reply(lines.missingPerms(missing));

    const id = createPoll({ guildId, channelId: channel.id, question, options, endsAt: ms ? now + ms : null, createdBy: interaction.user.id, now });
    try {
      const sent = await channel.send(buildPollPayload(getPoll(id), Array(options.length).fill(0)));
      setPollMessage(id, sent.id);
    } catch {
      discardPoll(id);
      return reply(lines.postFailed);
    }
    return reply(lines.created(id));
  },

  // Buttons: binhchon:v:<pollId>:<optionIndex> and binhchon:c:<pollId>
  async handleComponent(interaction, parts, options) {
    return handlePollPress(interaction, parts, options);
  },
};

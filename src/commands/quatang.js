import { ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { gateFeature } from "../utils/gate.js";
import * as humor from "../humor/lines.js";
import { lines } from "../humor/giveaways.js";
import { track } from "../analytics.js";
import { DURATIONS, cleanText, durationMs } from "../activity/text.js";
import {
  MAX_ACTIVE_GIVEAWAYS,
  buildGiveawayPayload,
  cancelGiveaway,
  countActive,
  countEntries,
  createGiveaway,
  discardGiveaway,
  getGiveaway,
  handleGiveawayPress,
  listGiveaways,
  rerollGiveaway,
  setGiveawayMessage,
} from "../activity/giveaways.js";

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const STATUS = { active: "đang chạy", ended: "đã kết thúc", cancelled: "đã huỷ" };

const canManage = (member) => Boolean(member?.permissions?.has?.(PermissionFlagsBits.ManageGuild));

// Permissions the bot needs in the channel to post the giveaway, by name. Empty when fine or when they cannot be told.
function missingInChannel(channel, me) {
  const perms = channel?.permissionsFor?.(me);
  if (!perms) return [];
  const need = [["ViewChannel", "Xem kênh"], ["SendMessages", "Gửi tin nhắn"], ["EmbedLinks", "Nhúng liên kết"]];
  return need.filter(([flag]) => !perms.has(flag)).map(([, label]) => label);
}

export default {
  data: new SlashCommandBuilder()
    .setName("quatang")
    .setDescription("Giveaway có nút Tham gia, tự bốc thăm khi hết giờ (gói Pro)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("tao")
        .setDescription("Mở một giveaway ở kênh này")
        .addStringOption((o) => o.setName("giai").setDescription("Phần thưởng").setRequired(true).setMaxLength(100))
        .addIntegerOption((o) => o.setName("thoigian").setDescription("Chạy trong bao lâu").setRequired(true).addChoices(...DURATIONS))
        .addIntegerOption((o) => o.setName("soluong").setDescription("Số người trúng (1 đến 10), mặc định 1").setMinValue(1).setMaxValue(10))
        .addRoleOption((o) => o.setName("yeucau").setDescription("Chỉ người có role này mới được tham gia")),
    )
    .addSubcommand((s) =>
      s.setName("huy").setDescription("Huỷ một giveaway đang chạy").addIntegerOption((o) => o.setName("so").setDescription("Số của giveaway").setRequired(true).setMinValue(1).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("chonlai")
        .setDescription("Chọn thêm người trúng cho giveaway đã kết thúc")
        .addIntegerOption((o) => o.setName("so").setDescription("Số của giveaway").setRequired(true).setMinValue(1).setAutocomplete(true))
        .addIntegerOption((o) => o.setName("soluong").setDescription("Chọn thêm mấy người (mặc định 1)").setMinValue(1).setMaxValue(10)),
    )
    .addSubcommand((s) => s.setName("danhsach").setDescription("Xem các giveaway gần đây")),

  async autocomplete(interaction) {
    if (!interaction.guildId || !canManage(interaction.member)) return interaction.respond([]);
    const want = interaction.options.getSubcommand() === "huy" ? "active" : "ended";
    return interaction.respond(
      listGiveaways(interaction.guildId, 25)
        .filter((g) => g.status === want)
        .map((g) => ({ name: `#${g.id} ${g.prize}`.slice(0, 100), value: g.id })),
    );
  },

  async execute(interaction, { now = Date.now(), rng = Math.random } = {}) {
    const reply = (content) => interaction.reply(ephemeral(content));
    const { guild, guildId } = interaction;
    if (!guild || !guildId) return;
    if (!canManage(interaction.member)) return reply(humor.pick(humor.noPermissionLines));
    const sub = interaction.options.getSubcommand();

    // Cancelling and looking stay possible after a plan lapses, so nothing is left running with no way to stop it
    if (sub !== "huy" && sub !== "danhsach") {
      const blocked = gateFeature(guildId, "giveaways");
      if (blocked) return reply(blocked);
    }

    if (sub === "danhsach") {
      const rows = listGiveaways(guildId, 15);
      if (!rows.length) return reply(lines.listEmpty);
      const body = rows
        .map((g) => `**#${g.id}** ${g.prize}, ${STATUS[g.status] ?? g.status}, ${countEntries(g.id)} người, ${g.status === "active" ? `kết thúc <t:${Math.floor(g.ends_at / 1000)}:R>, ` : ""}<#${g.channel_id}>`)
        .join("\n")
        .slice(0, 4000);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xf5c518).setTitle(lines.listTitle).setDescription(body)], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    if (sub === "huy") {
      const g = getGiveaway(interaction.options.getInteger("so"));
      if (!g || g.guild_id !== guildId) return reply(lines.missing);
      if (!cancelGiveaway(guildId, g.id)) return reply(lines.notActive);
      try {
        const channel = guild.channels.cache.get(g.channel_id);
        const message = g.message_id ? await channel?.messages?.fetch(g.message_id) : null;
        if (message && message.author?.id === interaction.client?.user?.id) await message.edit(buildGiveawayPayload({ ...g, status: "cancelled" }));
      } catch {
        // the message may be gone already; the giveaway is cancelled in the records either way
      }
      return reply(lines.cancelled(g.id));
    }

    if (sub === "chonlai") {
      const count = interaction.options.getInteger("soluong") ?? 1;
      const result = rerollGiveaway(guildId, interaction.options.getInteger("so"), count, { rng });
      if (!result.ok) return reply({ missing: lines.missing, notEnded: lines.notEnded, nobody: lines.nobodyLeft }[result.reason]);
      const channel = guild.channels.cache.get(result.giveaway.channel_id);
      try {
        await channel?.send?.({ content: lines.rerolled(result.giveaway.prize, result.winners), allowedMentions: { parse: [], users: result.winners } });
      } catch {
        return reply(`${lines.rerollDone(result.giveaway.id)} Thầu không gửi được thông báo ở kênh gốc, người trúng mới: ${result.winners.map((id) => `<@${id}>`).join(", ")}`);
      }
      return reply(lines.rerollDone(result.giveaway.id));
    }

    // tao
    const prize = cleanText(interaction.options.getString("giai"), 100);
    if (!prize) return reply(lines.badPrize);
    const ms = durationMs(interaction.options.getInteger("thoigian"));
    if (!ms) return reply(lines.badTime);
    if (countActive(guildId) >= MAX_ACTIVE_GIVEAWAYS) return reply(lines.tooMany(MAX_ACTIVE_GIVEAWAYS));
    const channel = interaction.channel;
    if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread].includes(channel.type ?? ChannelType.GuildText)) return reply(lines.postFailed);
    const missing = missingInChannel(channel, guild.members?.me);
    if (missing.length) return reply(lines.missingPerms(missing));

    const role = interaction.options.getRole("yeucau");
    const id = createGiveaway({
      guildId,
      channelId: channel.id,
      hostId: interaction.user.id,
      prize,
      winners: interaction.options.getInteger("soluong") ?? 1,
      endsAt: now + ms,
      roleId: role && role.id !== guildId ? role.id : null,
      now,
    });
    try {
      const sent = await channel.send(buildGiveawayPayload(getGiveaway(id), { entries: 0 }));
      setGiveawayMessage(id, sent.id);
    } catch {
      discardGiveaway(id);
      return reply(lines.postFailed);
    }
    track(guildId, "feature_on");
    return reply(lines.created(id, channel.id));
  },

  // Button: quatang:join:<giveawayId>
  async handleComponent(interaction, parts, options) {
    return handleGiveawayPress(interaction, parts, options);
  },
};

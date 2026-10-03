import { ChannelType, EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { patchSection } from "../settings.js";
import { gateFeature } from "../utils/gate.js";
import { isAdmin } from "../utils/guards.js";
import { track } from "../analytics.js";
import { activityConfig, clearActivityCache, getStats, rankOf } from "../activity/xp.js";
import { progressBar, progressFor } from "../activity/level.js";
import { lines } from "../humor/activity.js";

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });
const textChannel = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

// Permissions the bot lacks that make part of the feature silent, by name, so the admin can fix them
function missingFor(guild, settings) {
  const missing = [];
  const me = guild.members?.me;
  if (!me?.permissions?.has?.("ManageRoles")) missing.push("Quản lý role (để cấp role cấp độ)");
  if (settings.announceChannelId) {
    const channel = guild.channels?.cache?.get(settings.announceChannelId);
    const perms = channel?.permissionsFor?.(me);
    if (!channel || (perms && !(perms.has("ViewChannel") && perms.has("SendMessages")))) missing.push("Xem kênh và Gửi tin nhắn ở kênh báo lên cấp");
  }
  return missing;
}

export default {
  // No default permission here: everybody may look at a rank. The admin subcommand checks the permission again when it runs.
  data: new SlashCommandBuilder()
    .setName("hang")
    .setDescription("Xem hạng hoạt động của bạn, hoặc cài đặt điểm hoạt động (admin)")
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("xem")
        .setDescription("Xem cấp độ, điểm và hạng trong server")
        .addUserOption((o) => o.setName("nguoi").setDescription("Người cần xem, bỏ trống là chính bạn")),
    )
    .addSubcommand((s) =>
      s
        .setName("caidat")
        .setDescription("Admin: bật, tắt và chỉnh các con số của điểm hoạt động")
        .addBooleanOption((o) => o.setName("bat").setDescription("Bật hoặc tắt điểm hoạt động"))
        .addIntegerOption((o) => o.setName("xptin").setDescription("Điểm cho mỗi tin nhắn (1 đến 50)").setMinValue(1).setMaxValue(50))
        .addIntegerOption((o) => o.setName("cho").setDescription("Giây chờ giữa hai lần được điểm (10 đến 600)").setMinValue(10).setMaxValue(600))
        .addIntegerOption((o) => o.setName("toida").setDescription("Điểm tối đa mỗi người mỗi ngày (50 đến 5000)").setMinValue(50).setMaxValue(5000))
        .addBooleanOption((o) => o.setName("giong").setDescription("Tính điểm cho thời gian ở voice"))
        .addIntegerOption((o) => o.setName("xpgiong").setDescription("Điểm mỗi phút ở voice (0 đến 20)").setMinValue(0).setMaxValue(20))
        .addChannelOption((o) => o.setName("kenh").setDescription("Kênh báo khi ai đó lên cấp").addChannelTypes(...textChannel)),
    ),

  async execute(interaction) {
    const { guild, guildId } = interaction;
    if (!guildId || !guild) return;
    const sub = interaction.options.getSubcommand();

    if (sub === "caidat") {
      if (!interaction.member || !isAdmin(interaction.member)) return interaction.reply(ephemeral(lines.notAdmin));
      const patch = {};
      const take = (kind, name, field) => {
        const value = interaction.options[kind](name);
        if (value !== null && value !== undefined) patch[field] = value;
      };
      take("getBoolean", "bat", "enabled");
      take("getInteger", "xptin", "xpPerMessage");
      take("getInteger", "cho", "cooldownSec");
      take("getInteger", "toida", "dailyCap");
      take("getBoolean", "giong", "voiceEnabled");
      take("getInteger", "xpgiong", "voiceXpPerMin");
      const channel = interaction.options.getChannel("kenh");
      if (channel) patch.announceChannelId = channel.id;

      // Turning it off stays possible after a plan lapses
      if (patch.enabled !== false) {
        const blocked = gateFeature(guildId, "activity");
        if (blocked) return interaction.reply(ephemeral(blocked));
      }
      const stored = Object.keys(patch).length ? patchSection(guildId, "activity", patch) : activityConfig(guildId).settings;
      clearActivityCache(guildId);
      if (patch.enabled === true) track(guildId, "feature_on");

      const parts = [Object.keys(patch).length ? lines.saved : lines.noChange, lines.summary(stored)];
      const missing = stored.enabled ? missingFor(guild, stored) : [];
      if (missing.length) parts.push(lines.missingPerm(missing));
      return interaction.reply(ephemeral(parts.join("\n")));
    }

    // xem
    const blocked = gateFeature(guildId, "activity");
    if (blocked) return interaction.reply(ephemeral(blocked));
    const target = interaction.options.getUser("nguoi") ?? interaction.user;
    if (target.bot) return interaction.reply(ephemeral(lines.botNoRank));

    const stats = getStats(guildId, target.id);
    const { settings } = activityConfig(guildId);
    if (!stats.xp && !settings.enabled) return interaction.reply(ephemeral(lines.off));
    if (!stats.xp) return interaction.reply(ephemeral(lines.noXpYet));

    const progress = progressFor(stats.xp);
    const rank = rankOf(guildId, target.id);
    const name = (target.globalName ?? target.username ?? "bạn").slice(0, 60);
    const bar = `${progressBar(progress.fraction)} ${Math.floor(progress.fraction * 100)}%`;
    const embed = new EmbedBuilder()
      .setColor(0xf5c518)
      .setTitle(lines.rankTitle(name))
      .setDescription(`${bar}\n${progress.nextAt ? lines.nextLevel(progress.into, progress.needed, progress.level + 1) : lines.maxLevel}`)
      .addFields(
        { name: lines.fieldLevel, value: String(progress.level), inline: true },
        { name: lines.fieldXp, value: String(stats.xp), inline: true },
        { name: lines.fieldRank, value: rank ? `#${rank}` : "chưa có", inline: true },
        { name: lines.fieldMsgs, value: String(stats.msgs), inline: true },
        { name: lines.fieldVoice, value: String(stats.voiceMin), inline: true },
      )
      .setFooter({ text: lines.footer });
    return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};

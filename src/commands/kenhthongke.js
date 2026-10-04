import { ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits as P, SlashCommandBuilder } from "discord.js";
import { getSection, patchSection, SNOWFLAKE } from "../settings.js";
import { getPlan } from "../license.js";
import { gateLimit } from "../utils/gate.js";
import { isAdmin } from "../utils/guards.js";
import { loadRecord, saveRecord } from "../store.js";
import { track } from "../analytics.js";
import * as humor from "../humor/lines.js";
import { KIND_LABEL, KIND_TEMPLATE, lines } from "../humor/stats.js";
import { cleanText } from "../activity/text.js";
import { getRoom } from "../tempvoice/store.js";
import { forgetStat, missingToRename, renderStat, statValue, updateGuildStats } from "../jobs/stats.js";

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const given = (v) => v !== null && v !== undefined;
const KIND_CHOICES = [
  { name: "Thành viên", value: "members" },
  { name: "Lượt boost", value: "boosts" },
  { name: "Số kênh", value: "channels" },
  { name: "Số role", value: "roles" },
];

// Stat channels the bot built itself are remembered in the server record: /nuke can clear them, and removing one here knows it may delete it
function rememberOwn(guildId, channelId) {
  const record = loadRecord(guildId);
  record.channels = [...new Set([...record.channels, channelId])];
  record.statChannels = [...new Set([...(record.statChannels ?? []), channelId])];
  saveRecord(guildId, record);
}

function forgetOwn(guildId, channelId) {
  const record = loadRecord(guildId);
  const own = (record.statChannels ?? []).includes(channelId);
  record.channels = record.channels.filter((id) => id !== channelId);
  record.statChannels = (record.statChannels ?? []).filter((id) => id !== channelId);
  saveRecord(guildId, record);
  return own;
}

export default {
  data: new SlashCommandBuilder()
    .setName("kenhthongke")
    .setDescription("Kênh thoại hiện số thành viên, boost, kênh, role. Cập nhật mỗi 10 phút")
    .setDefaultMemberPermissions(P.Administrator)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("them")
        .setDescription("Thêm một kênh thống kê (chọn kênh có sẵn hoặc để thầu dựng kênh khoá)")
        .addStringOption((o) => o.setName("loai").setDescription("Hiện con số gì").setRequired(true).addChoices(...KIND_CHOICES))
        .addChannelOption((o) => o.setName("kenh").setDescription("Kênh thoại có sẵn của bạn").addChannelTypes(ChannelType.GuildVoice))
        .addBooleanOption((o) => o.setName("tao").setDescription("Để thầu dựng một kênh thoại khoá, không ai vào được"))
        .addStringOption((o) => o.setName("mauten").setDescription("Mẫu tên, {n} là con số. Ví dụ: Thành viên: {n}").setMaxLength(60)),
    )
    .addSubcommand((s) =>
      s
        .setName("xoa")
        .setDescription("Bỏ một kênh thống kê (kênh do thầu dựng thì xoá luôn)")
        .addStringOption((o) => o.setName("kenh").setDescription("Kênh thống kê cần bỏ").setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) => s.setName("danhsach").setDescription("Xem các kênh thống kê và con số hiện tại"))
    .addSubcommand((s) => s.setName("tat").setDescription("Tắt kênh thống kê (tên kênh giữ nguyên)")),

  async autocomplete(interaction) {
    if (!interaction.guild || !interaction.member || !isAdmin(interaction.member)) return interaction.respond([]);
    const typed = String(interaction.options.getFocused() ?? "").toLowerCase();
    const guild = interaction.guild;
    const choices = getSection(interaction.guildId, "stats")
      .channels.map((c) => ({ name: `${KIND_LABEL[c.kind]}: ${guild.channels.cache.get(c.channelId)?.name ?? c.channelId}`.slice(0, 100), value: c.channelId }))
      .filter((c) => c.name.toLowerCase().includes(typed));
    return interaction.respond(choices.slice(0, 25));
  },

  async execute(interaction) {
    const reply = (content) => interaction.reply(ephemeral(content));
    const { guild, guildId } = interaction;
    if (!guild || !guildId) return reply(lines.noGuild);
    if (!interaction.member || !isAdmin(interaction.member)) return reply(humor.pick(humor.noPermissionLines));
    const sub = interaction.options.getSubcommand();
    const settings = getSection(guildId, "stats");

    if (sub === "tat") {
      patchSection(guildId, "stats", { enabled: false });
      return reply(lines.turnedOff);
    }

    if (sub === "danhsach") {
      if (!settings.channels.length) return reply(lines.empty);
      const plan = getPlan(guildId);
      const rows = settings.channels.map((c, i) => {
        const channel = guild.channels.cache.get(c.channelId);
        const note = !channel ? lines.gone : missingToRename(guild, channel).length ? lines.noManage(missingToRename(guild, channel)) : i >= plan.statsChannels ? "vượt gói, tạm ngưng" : "ổn";
        return `<#${c.channelId}>: ${KIND_LABEL[c.kind]}, hiện **${renderStat(c.template, statValue(guild, c.kind))}**, mẫu \`${c.template}\` (${note})`;
      });
      const head = `Trạng thái: ${settings.enabled ? "🟢 đang chạy" : "⚫ đang tắt"}, ${settings.channels.length}/${plan.statsChannels} kênh`;
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle(lines.listTitle).setDescription([head, ...rows].join("\n").slice(0, 4000))], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    if (sub === "xoa") {
      const id = String(interaction.options.getString("kenh") ?? "");
      if (!SNOWFLAKE.test(id) || !settings.channels.some((c) => c.channelId === id)) return reply(lines.notListed);
      patchSection(guildId, "stats", { channels: settings.channels.filter((c) => c.channelId !== id) });
      forgetStat(id);
      const own = forgetOwn(guildId, id);
      let deleted = false;
      const channel = guild.channels.cache.get(id);
      // Only a channel the bot built for this feature is ever deleted
      if (own && channel && !getRoom(id)) deleted = await channel.delete(lines.reason).then(() => true, () => false);
      return reply(lines.removed(id, deleted));
    }

    // them
    const kind = interaction.options.getString("loai");
    const picked = interaction.options.getChannel("kenh");
    const make = interaction.options.getBoolean("tao") === true;
    if (!given(picked) && !make) return reply(lines.needOne);
    if (given(picked) && make) return reply(lines.needBoth);
    const rawTemplate = interaction.options.getString("mauten");
    const template = given(rawTemplate) ? cleanText(rawTemplate, 60) : KIND_TEMPLATE[kind];
    if (!template || !template.includes("{n}")) return reply(lines.badTemplate);
    const refusal = gateLimit(guildId, "statsChannels", settings.channels.length, "kênh thống kê");
    if (refusal) return reply(refusal);

    let channel = picked;
    if (given(picked)) {
      if (picked.type !== ChannelType.GuildVoice) return reply(lines.notVoice);
      if (getRoom(picked.id)) return reply(lines.isTempRoom);
      if (settings.channels.some((c) => c.channelId === picked.id)) return reply(lines.already(picked.id));
    } else {
      const me = guild.members?.me;
      if (!me?.permissions?.has(P.ManageChannels)) return reply(lines.createFailed(["Quản lý kênh"]));
      try {
        channel = await guild.channels.create({
          name: renderStat(template, statValue(guild, kind)),
          type: ChannelType.GuildVoice,
          // Nobody can join: the channel is only there to carry a number
          permissionOverwrites: [{ id: guild.id, deny: [P.Connect] }],
          reason: lines.reasonCreate,
        });
      } catch {
        return reply(lines.createFailed([]));
      }
      rememberOwn(guildId, channel.id);
    }

    patchSection(guildId, "stats", { enabled: true, channels: [...settings.channels, { channelId: channel.id, kind, template }] });
    track(guildId, "feature_on");
    const notes = [lines.added(channel.id, kind, settings.channels.length + 1, getPlan(guildId).statsChannels)];
    if (make) notes.push(lines.created(channel.id));
    const lacking = missingToRename(guild, channel);
    if (lacking.length) notes.push(lines.addedNoManage(lacking));
    else await updateGuildStats(guild).catch(() => {});
    return reply(notes.join("\n"));
  },
};

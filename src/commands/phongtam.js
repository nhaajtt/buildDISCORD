import { ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits as P, SlashCommandBuilder } from "discord.js";
import { getSection, patchSection } from "../settings.js";
import { getPlan } from "../license.js";
import { gateLimit } from "../utils/gate.js";
import { isAdmin } from "../utils/guards.js";
import { track } from "../analytics.js";
import * as humor from "../humor/lines.js";
import { lines } from "../humor/tempvoice.js";
import { cleanText } from "../activity/text.js";
import { ROOM_CAP, activeLobbies } from "../tempvoice/rules.js";
import { countRooms, getRoom } from "../tempvoice/store.js";
import { missingToBuild } from "../tempvoice/rooms.js";

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const given = (v) => v !== null && v !== undefined;

// Adds a voice channel as a lobby. Returns the text to show, and whether it was added.
function addLobby(guildId, channel) {
  if (channel.type !== ChannelType.GuildVoice) return { text: lines.notVoice };
  if (getRoom(channel.id)) return { text: lines.alreadyRoom };
  const settings = getSection(guildId, "tempvoice");
  if (settings.lobbyChannelIds.includes(channel.id)) return { text: lines.lobbyExists(channel.id), exists: true };
  const refusal = gateLimit(guildId, "tempLobbies", settings.lobbyChannelIds.length, "phòng chờ tạo phòng");
  if (refusal) return { text: refusal };
  const next = patchSection(guildId, "tempvoice", { lobbyChannelIds: [...settings.lobbyChannelIds, channel.id] });
  return { added: true, text: lines.lobbyAdded(channel.id, next.lobbyChannelIds.length, getPlan(guildId).tempLobbies) };
}

export default {
  data: new SlashCommandBuilder()
    .setName("phongtam")
    .setDescription("Phòng thoại tạm: bước vào phòng chờ là có phòng riêng, trống thì tự dọn")
    .setDefaultMemberPermissions(P.Administrator)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("caidat")
        .setDescription("Chỉnh phòng tạm (chọn kênh sẽ thêm phòng chờ và bật tính năng)")
        .addChannelOption((o) => o.setName("kenh").setDescription("Kênh thoại làm phòng chờ").addChannelTypes(ChannelType.GuildVoice))
        .addChannelOption((o) => o.setName("danhmuc").setDescription("Danh mục chứa các phòng tạm").addChannelTypes(ChannelType.GuildCategory))
        .addStringOption((o) => o.setName("mauten").setDescription("Mẫu tên phòng, {name} là tên người tạo").setMaxLength(60))
        .addIntegerOption((o) => o.setName("gioihan").setDescription("Số người tối đa mỗi phòng (0 là không giới hạn)").setMinValue(0).setMaxValue(99)),
    )
    .addSubcommand((s) =>
      s
        .setName("them")
        .setDescription("Thêm một kênh thoại làm phòng chờ")
        .addChannelOption((o) => o.setName("kenh").setDescription("Kênh thoại làm phòng chờ").setRequired(true).addChannelTypes(ChannelType.GuildVoice)),
    )
    .addSubcommand((s) =>
      s
        .setName("bo")
        .setDescription("Bỏ một phòng chờ (kênh vẫn còn)")
        .addChannelOption((o) => o.setName("kenh").setDescription("Phòng chờ cần bỏ").setRequired(true).addChannelTypes(ChannelType.GuildVoice)),
    )
    .addSubcommand((s) => s.setName("trangthai").setDescription("Xem phòng chờ, cài đặt và quyền còn thiếu"))
    .addSubcommand((s) => s.setName("tat").setDescription("Tắt phòng tạm (phòng đang có người vẫn giữ)")),

  async execute(interaction) {
    const reply = (content) => interaction.reply(ephemeral(content));
    const { guild, guildId } = interaction;
    if (!guild || !guildId) return reply(lines.noGuild);
    if (!interaction.member || !isAdmin(interaction.member)) return reply(humor.pick(humor.noPermissionLines));
    const sub = interaction.options.getSubcommand();

    if (sub === "tat") {
      patchSection(guildId, "tempvoice", { enabled: false });
      return reply(lines.turnedOff);
    }

    if (sub === "them") {
      const result = addLobby(guildId, interaction.options.getChannel("kenh"));
      if (result.added) {
        patchSection(guildId, "tempvoice", { enabled: true });
        track(guildId, "feature_on");
      }
      const missing = result.added ? missingToBuild(guild, null) : [];
      return reply(missing.length ? `${result.text}\n${lines.missingBot(missing)}` : result.text);
    }

    if (sub === "bo") {
      const channel = interaction.options.getChannel("kenh");
      const settings = getSection(guildId, "tempvoice");
      if (!settings.lobbyChannelIds.includes(channel.id)) return reply(lines.lobbyNotListed);
      const next = patchSection(guildId, "tempvoice", { lobbyChannelIds: settings.lobbyChannelIds.filter((id) => id !== channel.id) });
      if (!next.lobbyChannelIds.length) patchSection(guildId, "tempvoice", { enabled: false });
      return reply(lines.lobbyRemoved(channel.id));
    }

    if (sub === "trangthai") {
      // Lobbies deleted by hand are dropped here, so the list shows what is real
      let settings = getSection(guildId, "tempvoice");
      const gone = settings.lobbyChannelIds.filter((id) => !guild.channels.cache.has(id));
      if (gone.length) settings = patchSection(guildId, "tempvoice", { lobbyChannelIds: settings.lobbyChannelIds.filter((id) => !gone.includes(id)) });
      const plan = getPlan(guildId);
      const live = activeLobbies(settings.lobbyChannelIds, plan.tempLobbies);
      const parent = settings.categoryId ? guild.channels.cache.get(settings.categoryId) : null;
      const missing = missingToBuild(guild, parent?.type === ChannelType.GuildCategory ? parent : null);
      const body = [
        `Trạng thái: ${settings.enabled ? "🟢 đang chạy" : "⚫ đang tắt"}`,
        `Phòng chờ (${settings.lobbyChannelIds.length}/${plan.tempLobbies}): ${settings.lobbyChannelIds.length ? settings.lobbyChannelIds.map((id) => `<#${id}>${live.includes(id) ? "" : " (vượt gói, tạm ngưng)"}`).join(", ") : "chưa có"}`,
        gone.length ? `Đã bỏ ${gone.length} phòng chờ${lines.lobbyGone}.` : null,
        `Danh mục: ${settings.categoryId ? (parent ? `<#${parent.id}>` : lines.categoryGone) : lines.noCategory}`,
        `Mẫu tên: \`${settings.nameTemplate}\``,
        `Giới hạn người: ${settings.userLimit || lines.limitNone}`,
        `Phòng tạm đang có: ${countRooms(guildId)}/${ROOM_CAP}`,
        missing.length ? lines.missingBot(missing) : lines.fine,
      ]
        .filter(Boolean)
        .join("\n");
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(lines.statusTitle).setDescription(body)], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    // caidat
    const patch = {};
    const template = interaction.options.getString("mauten");
    if (given(template)) {
      const clean = cleanText(template, 60);
      if (!clean) return reply(lines.badTemplate);
      patch.nameTemplate = clean;
    }
    const category = interaction.options.getChannel("danhmuc");
    if (given(category)) {
      if (category.type !== ChannelType.GuildCategory) return reply(lines.notCategory);
      patch.categoryId = category.id;
    }
    const limit = interaction.options.getInteger("gioihan");
    if (given(limit)) patch.userLimit = limit;
    const lobby = interaction.options.getChannel("kenh");
    if (!given(lobby) && !Object.keys(patch).length) return reply(lines.nothingChanged);

    const notes = [];
    if (given(lobby)) {
      const result = addLobby(guildId, lobby);
      if (!result.added && !result.exists) return reply(result.text);
      notes.push(result.text);
    }
    const next = patchSection(guildId, "tempvoice", patch);
    if (given(lobby) && !next.enabled) patchSection(guildId, "tempvoice", { enabled: true });
    if (given(lobby)) track(guildId, "feature_on");
    if (Object.keys(patch).length) notes.push(lines.saved);
    const missing = missingToBuild(guild, null);
    if (missing.length) notes.push(lines.missingBot(missing));
    return reply(notes.join("\n"));
  },
};

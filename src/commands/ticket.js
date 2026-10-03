import { ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getSection, patchSection } from "../settings.js";
import { gateFeature } from "../utils/gate.js";
import { isAdmin } from "../utils/guards.js";
import { ticketCommandLines as lines, ticketLines } from "../humor/tickets.js";
import * as humor from "../humor/lines.js";
import { askCloseReason, claim, closeNow, deleteChannel, reopen, startOpen, submitClose, submitOpen } from "../tickets/index.js";
import { checkStaffRole, panelRows, typeKey, validEmoji } from "../tickets/logic.js";
import { listOpen } from "../tickets/store.js";

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });
const textChannel = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

export default {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Hệ thống ticket hỗ trợ bằng kênh riêng (gói Pro)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("caidat")
        .setDescription("Cài kênh bảng, role staff, danh mục và giới hạn")
        .addChannelOption((o) => o.setName("kenh").setDescription("Kênh đăng bảng ticket").addChannelTypes(...textChannel))
        .addRoleOption((o) => o.setName("role").setDescription("Role staff, chỉ được xem và gửi tin trong kênh ticket"))
        .addChannelOption((o) => o.setName("danhmuc").setDescription("Danh mục chứa kênh ticket").addChannelTypes(ChannelType.GuildCategory))
        .addChannelOption((o) => o.setName("kenhlog").setDescription("Kênh ghi nhật ký mở, nhận, đóng (không có nội dung)").addChannelTypes(...textChannel))
        .addIntegerOption((o) => o.setName("tudong").setDescription("Tự đóng ticket sau bao nhiêu giờ im lặng, 0 là tắt").setMinValue(0).setMaxValue(720))
        .addIntegerOption((o) => o.setName("toida").setDescription("Mỗi người được mở tối đa mấy ticket cùng lúc").setMinValue(1).setMaxValue(5)),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("loai")
        .setDescription("Các loại ticket trên bảng, tối đa 5")
        .addSubcommand((s) =>
          s
            .setName("them")
            .setDescription("Thêm một loại ticket")
            .addStringOption((o) => o.setName("ten").setDescription("Tên hiện trên nút").setRequired(true).setMaxLength(40))
            .addStringOption((o) => o.setName("emoji").setDescription("Emoji trên nút (không bắt buộc)").setMaxLength(8)),
        )
        .addSubcommand((s) =>
          s.setName("xoa").setDescription("Xoá một loại ticket").addStringOption((o) => o.setName("ten").setDescription("Loại cần xoá").setRequired(true).setAutocomplete(true)),
        ),
    )
    .addSubcommand((s) => s.setName("dang").setDescription("Đăng hoặc cập nhật bảng ticket ở kênh đã cài"))
    .addSubcommand((s) => s.setName("danhsach").setDescription("Xem các ticket đang mở"))
    .addSubcommand((s) => s.setName("tat").setDescription("Tắt ticket mới, ticket đang mở giữ nguyên")),

  async autocomplete(interaction) {
    if (!interaction.guildId || !isAdmin(interaction.member)) return interaction.respond([]);
    const typed = interaction.options.getFocused().toLowerCase();
    return interaction.respond(
      getSection(interaction.guildId, "tickets")
        .types.filter((t) => t.label.toLowerCase().includes(typed))
        .map((t) => ({ name: t.label.slice(0, 100), value: t.key })),
    );
  },

  async execute(interaction) {
    const reply = (content) => interaction.reply(ephemeral(content));
    if (!isAdmin(interaction.member)) return reply(humor.pick(humor.noPermissionLines));
    const { guild, guildId } = interaction;
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    const settings = getSection(guildId, "tickets");

    // Turning tickets off stays possible after a plan lapses
    if (sub !== "tat") {
      const blocked = gateFeature(guildId, "tickets");
      if (blocked) return reply(blocked);
    }

    if (sub === "tat") {
      if (settings.panelChannelId && settings.panelMessageId) {
        try {
          const message = await guild.channels.cache.get(settings.panelChannelId)?.messages.fetch(settings.panelMessageId);
          await message?.edit({ components: [] });
        } catch {
          // The panel may already be gone, which is the goal anyway
        }
      }
      patchSection(guildId, "tickets", { enabled: false, panelMessageId: null });
      return reply(lines.off);
    }

    if (sub === "caidat") {
      const role = interaction.options.getRole("role");
      if (role && !checkStaffRole(role, guildId)) return reply(lines.badStaffRole);
      const patch = {};
      const channel = interaction.options.getChannel("kenh");
      if (channel) {
        patch.panelChannelId = channel.id;
        // An old panel in another channel is not this panel any more
        if (channel.id !== settings.panelChannelId) patch.panelMessageId = null;
      }
      if (role) patch.staffRoleId = role.id;
      for (const [option, field] of [["danhmuc", "categoryId"], ["kenhlog", "logChannelId"]]) {
        const picked = interaction.options.getChannel(option);
        if (picked) patch[field] = picked.id;
      }
      const hours = interaction.options.getInteger("tudong");
      if (hours !== null && hours !== undefined) patch.autoCloseHours = hours;
      const most = interaction.options.getInteger("toida");
      if (most !== null && most !== undefined) patch.maxOpenPerUser = most;
      patchSection(guildId, "tickets", patch);
      return reply(lines.saved);
    }

    if (group === "loai") {
      const types = settings.types;
      if (sub === "them") {
        if (types.length >= 5) return reply(lines.typeLimit);
        const label = interaction.options.getString("ten").trim();
        const emoji = (interaction.options.getString("emoji") ?? "").trim();
        if (!label) return reply(lines.typeExists);
        if (!validEmoji(emoji)) return reply(lines.typeBadEmoji);
        if (types.some((t) => t.label.toLowerCase() === label.toLowerCase())) return reply(lines.typeExists);
        patchSection(guildId, "tickets", { types: [...types, { key: typeKey(label, types.map((t) => t.key)), label, emoji }] });
        return reply(lines.typeAdded(label));
      }
      const wanted = interaction.options.getString("ten").trim().toLowerCase();
      const found = types.find((t) => t.key === wanted || t.label.toLowerCase() === wanted);
      if (!found) return reply(lines.typeMissing);
      if (types.length === 1) return reply(lines.typeLast);
      patchSection(guildId, "tickets", { types: types.filter((t) => t.key !== found.key) });
      return reply(lines.typeRemoved(found.label));
    }

    if (sub === "dang") {
      if (!settings.panelChannelId || !settings.staffRoleId) return reply(lines.needSetup);
      const channel = guild.channels.cache.get(settings.panelChannelId);
      if (!channel) return reply(lines.panelFailed);
      const payload = {
        embeds: [new EmbedBuilder().setColor(0x3498db).setTitle(ticketLines.panelTitle).setDescription(ticketLines.panelBody)],
        components: panelRows(settings.types),
      };
      try {
        let message = null;
        if (settings.panelMessageId) message = await channel.messages.fetch(settings.panelMessageId).catch(() => null);
        if (message) await message.edit(payload);
        else message = await channel.send(payload);
        patchSection(guildId, "tickets", { enabled: true, panelMessageId: message.id });
      } catch (error) {
        console.error(`Ticket panel failed in ${guildId}:`, error.message);
        return reply(lines.panelFailed);
      }
      return reply(lines.panelPosted(channel.id));
    }

    // danhsach
    const rows = listOpen(guildId);
    if (!rows.length) return reply(lines.noOpen);
    const label = (key) => settings.types.find((t) => t.key === key)?.label ?? key;
    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(lines.listTitle)
      .setDescription(
        rows
          .map((t) => `#${t.id} <#${t.channel_id}>, <@${t.user_id}>, ${label(t.type)}, <t:${Math.floor(t.created_at / 1000)}:R>${t.claimed_by ? `, nhận bởi <@${t.claimed_by}>` : ""}`)
          .join("\n")
          .slice(0, 4000),
      );
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },

  // Buttons and modals: ticket:<action>:<ticketId or type key>
  async handleComponent(interaction, [action, arg]) {
    if (!interaction.guildId) return;
    if (action === "open") return startOpen(interaction, arg);
    if (action === "modal") return submitOpen(interaction, arg);
    if (action === "claim") return claim(interaction, arg);
    if (action === "close") return closeNow(interaction, arg);
    if (action === "closewhy") return askCloseReason(interaction, arg);
    if (action === "closemodal") return submitClose(interaction, arg);
    if (action === "reopen") return reopen(interaction, arg);
    if (action === "delete") return deleteChannel(interaction, arg);
  },
};

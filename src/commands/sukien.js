import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import { getDb } from "../db.js";
import { TEMPLATES, WEEKDAYS, describeSlot, nextOccurrence, parseTime } from "../games/schedule.js";
import { gateFeature, gateLimit } from "../utils/gate.js";
import { isAdmin } from "../utils/guards.js";
import * as lines from "../humor/games.js";

const weekdayChoices = [1, 2, 3, 4, 5, 6, 0].map((value) => ({ name: WEEKDAYS[value], value }));
const voiceTypes = [ChannelType.GuildVoice, ChannelType.GuildStageVoice];

const countFor = (guildId) => getDb().prepare("SELECT COUNT(*) AS n FROM recurring_events WHERE guild_id = ?").get(guildId).n;
const rowsFor = (guildId) => getDb().prepare("SELECT * FROM recurring_events WHERE guild_id = ? ORDER BY id").all(guildId);

function insert(guildId, def, channelId, roleId) {
  return getDb()
    .prepare(
      "INSERT INTO recurring_events (guild_id, name, description, weekday, hour, minute, duration_min, channel_id, notify_role_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(guildId, def.name, def.description ?? null, def.weekday, def.hour, def.minute, def.duration, channelId, roleId ?? null, Date.now());
}

export default {
  data: new SlashCommandBuilder()
    .setName("sukien")
    .setDescription("Lập lịch sự kiện lặp lại hằng tuần, thầu tự tạo sự kiện và báo cả server")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("tao")
        .setDescription("Lập một sự kiện lặp lại hằng tuần")
        .addStringOption((o) => o.setName("ten").setDescription("Tên sự kiện").setRequired(true).setMinLength(3).setMaxLength(60))
        .addIntegerOption((o) => o.setName("thu").setDescription("Thứ mấy trong tuần").setRequired(true).addChoices(...weekdayChoices))
        .addStringOption((o) => o.setName("gio").setDescription("Giờ bắt đầu dạng HH:mm, ví dụ 20:00").setRequired(true).setMaxLength(5))
        .addChannelOption((o) => o.setName("kenh").setDescription("Phòng voice hoặc stage diễn ra sự kiện").setRequired(true).addChannelTypes(...voiceTypes))
        .addIntegerOption((o) => o.setName("thoiluong").setDescription("Kéo dài bao nhiêu phút (mặc định 120)").setMinValue(30).setMaxValue(720))
        .addRoleOption((o) => o.setName("vaitro").setDescription("Role được nhắc khi có sự kiện"))
        .addStringOption((o) => o.setName("mota").setDescription("Mô tả ngắn").setMaxLength(300)),
    )
    .addSubcommand((sub) => sub.setName("danhsach").setDescription("Xem các sự kiện định kỳ của server"))
    .addSubcommand((sub) =>
      sub
        .setName("xoa")
        .setDescription("Xoá một lịch sự kiện định kỳ")
        .addStringOption((o) => o.setName("ten").setDescription("Chọn lịch cần xoá").setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("mau")
        .setDescription("Lập nhanh một lịch từ mẫu có sẵn")
        .addStringOption((o) =>
          o.setName("mau").setDescription("Chọn mẫu").setRequired(true).addChoices(...TEMPLATES.map((t) => ({ name: `${t.name} (${describeSlot(t)})`, value: t.id }))),
        )
        .addChannelOption((o) => o.setName("kenh").setDescription("Phòng voice hoặc stage diễn ra sự kiện").setRequired(true).addChannelTypes(...voiceTypes))
        .addRoleOption((o) => o.setName("vaitro").setDescription("Role được nhắc khi có sự kiện")),
    ),

  async execute(interaction) {
    const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
    if (!isAdmin(interaction.member)) return reply(lines.eventsNeedAdmin);
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === "danhsach") {
      const rows = rowsFor(guildId);
      if (!rows.length) return reply(lines.eventsEmpty);
      const text = rows
        .map((r) => `• **${r.name}**, ${describeSlot(r)}, ${r.duration_min} phút, <#${r.channel_id}>, lần tới <t:${Math.floor(nextOccurrence(r, Date.now(), config.timezone) / 1000)}:R>`)
        .join("\n");
      return interaction.reply({ content: text, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    if (sub === "xoa") {
      const row = rowsFor(guildId).find((r) => String(r.id) === interaction.options.getString("ten"));
      if (!row) return reply(lines.eventsMissing);
      getDb().prepare("DELETE FROM recurring_events WHERE id = ? AND guild_id = ?").run(row.id, guildId);
      return reply(lines.eventsRemoved(row.name));
    }

    // tao and mau both create a schedule, so both pass the same gates
    const blocked = gateFeature(guildId, "events") ?? gateLimit(guildId, "recurringEvents", countFor(guildId), "lịch sự kiện định kỳ");
    if (blocked) return reply(blocked);

    let def;
    if (sub === "mau") {
      const template = TEMPLATES.find((t) => t.id === interaction.options.getString("mau"));
      def = { ...template };
    } else {
      const time = parseTime(interaction.options.getString("gio"));
      if (!time) return reply(lines.eventsBadTime);
      def = {
        name: interaction.options.getString("ten").trim(),
        description: interaction.options.getString("mota") ?? null,
        weekday: interaction.options.getInteger("thu"),
        ...time,
        duration: interaction.options.getInteger("thoiluong") ?? 120,
      };
    }
    const channel = interaction.options.getChannel("kenh");
    const role = interaction.options.getRole("vaitro");
    insert(guildId, def, channel.id, role?.id);

    const startsAt = nextOccurrence(def, Date.now(), config.timezone);
    const warning = interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageEvents) ? "" : `\n⚠️ ${lines.eventsNoPerm}`;
    return reply(lines.eventsCreated(def.name, describeSlot(def), startsAt) + warning);
  },

  async autocomplete(interaction) {
    if (!isAdmin(interaction.member)) return interaction.respond([]);
    const typed = interaction.options.getFocused().toLowerCase();
    const choices = rowsFor(interaction.guildId)
      .filter((r) => r.name.toLowerCase().includes(typed))
      .slice(0, 25)
      .map((r) => ({ name: `${r.name} (${describeSlot(r)})`.slice(0, 100), value: String(r.id) }));
    return interaction.respond(choices);
  },
};

import { ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits as P, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import { gateLimit } from "../utils/gate.js";
import { isAdmin } from "../utils/guards.js";
import { track } from "../analytics.js";
import * as humor from "../humor/lines.js";
import { lines } from "../humor/scheduled.js";
import { cleanText, defang } from "../activity/text.js";
import { WEEKDAYS, formatTime, parseTime } from "../games/schedule.js";
import { MAX_BODY, cleanBody, countScheduled, createScheduled, getScheduled, listScheduled, removeScheduled } from "../jobs/scheduled.js";

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const POSTABLE = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const given = (v) => v !== null && v !== undefined;
const describe = (r) => (given(r.weekday) ? lines.weekly(WEEKDAYS[r.weekday], r.hhmm) : lines.daily(r.hhmm));

// What the bot lacks to post in the channel, by name. Empty when fine.
function missingIn(channel, me) {
  const perms = channel?.permissionsFor?.(me);
  if (!perms) return ["Xem kênh", "Gửi tin nhắn"];
  return [["ViewChannel", "Xem kênh"], ["SendMessages", "Gửi tin nhắn"]].filter(([flag]) => !perms.has(P[flag])).map(([, label]) => label);
}

export default {
  data: new SlashCommandBuilder()
    .setName("hengio")
    .setDescription("Hẹn giờ đăng tin nhắn mỗi ngày hoặc mỗi tuần (gói Pro). Tin đăng ra không ping ai")
    .setDefaultMemberPermissions(P.Administrator)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("tao")
        .setDescription("Hẹn một tin nhắn. Không ping ai, kể cả @everyone hay role")
        .addChannelOption((o) => o.setName("kenh").setDescription("Kênh để đăng").setRequired(true).addChannelTypes(...POSTABLE))
        .addStringOption((o) => o.setName("noidung").setDescription("Nội dung (tối đa 1500 ký tự, gõ \\n để xuống dòng)").setRequired(true).setMaxLength(MAX_BODY))
        .addStringOption((o) => o.setName("gio").setDescription(`Giờ đăng dạng HH:mm, theo múi giờ ${config.timezone}`).setRequired(true).setMaxLength(5))
        .addIntegerOption((o) =>
          o
            .setName("thu")
            .setDescription("Chỉ đăng vào thứ này mỗi tuần (bỏ trống là mỗi ngày)")
            .addChoices(...WEEKDAYS.map((name, value) => ({ name, value }))),
        ),
    )
    .addSubcommand((s) => s.setName("danhsach").setDescription("Xem các tin nhắn hẹn giờ"))
    .addSubcommand((s) =>
      s.setName("xoa").setDescription("Xoá một hẹn giờ").addIntegerOption((o) => o.setName("so").setDescription("Số của hẹn giờ").setRequired(true).setMinValue(1).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("thu")
        .setDescription("Xem thử một tin nhắn, chỉ mình bạn thấy")
        .addStringOption((o) => o.setName("noidung").setDescription("Nội dung muốn xem thử").setMaxLength(MAX_BODY))
        .addIntegerOption((o) => o.setName("so").setDescription("Hoặc số của một hẹn giờ có sẵn").setMinValue(1).setAutocomplete(true)),
    ),

  async autocomplete(interaction) {
    if (!interaction.guildId || !interaction.member || !isAdmin(interaction.member)) return interaction.respond([]);
    const typed = String(interaction.options.getFocused() ?? "").toLowerCase();
    const choices = listScheduled(interaction.guildId, 25)
      .map((r) => ({ name: `#${r.id} ${describe(r)} ${cleanText(r.body, 50)}`.slice(0, 100), value: r.id }))
      .filter((c) => c.name.toLowerCase().includes(typed));
    return interaction.respond(choices);
  },

  async execute(interaction, { now = Date.now() } = {}) {
    const reply = (content) => interaction.reply(ephemeral(content));
    const { guild, guildId } = interaction;
    if (!guild || !guildId) return reply(lines.noGuild);
    if (!interaction.member || !isAdmin(interaction.member)) return reply(humor.pick(humor.noPermissionLines));
    const sub = interaction.options.getSubcommand();

    if (sub === "danhsach") {
      const rows = listScheduled(guildId, 15);
      if (!rows.length) return reply(lines.listEmpty);
      const body = rows
        .map((r) => lines.listRow({ ...r, preview: defang(cleanText(r.body, 60)) }, describe(r), Math.floor(r.next_at / 1000)))
        .join("\n")
        .slice(0, 4000);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xf5c518).setTitle(lines.listTitle).setDescription(body)], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    if (sub === "xoa") {
      const id = interaction.options.getInteger("so");
      return reply(removeScheduled(guildId, id) ? lines.removed(id) : lines.missing);
    }

    if (sub === "thu") {
      const typed = interaction.options.getString("noidung");
      const id = interaction.options.getInteger("so");
      if (!given(typed) && !given(id)) return reply(lines.needPreviewSource);
      if (given(typed) && given(id)) return reply(lines.previewOnlyOne);
      let body = "";
      if (given(id)) {
        const row = getScheduled(guildId, id);
        if (!row) return reply(lines.missing);
        body = row.body;
      } else {
        body = cleanBody(typed);
      }
      if (!body) return reply(lines.badBody);
      return reply(`${lines.previewHead}\n${body}`.slice(0, 2000));
    }

    // tao
    const refusal = gateLimit(guildId, "scheduledMessages", countScheduled(guildId), "tin nhắn hẹn giờ");
    if (refusal) return reply(refusal);
    const channel = interaction.options.getChannel("kenh");
    if (!channel || !POSTABLE.includes(channel.type)) return reply(lines.badChannel);
    const time = parseTime(interaction.options.getString("gio") ?? "");
    if (!time) return reply(lines.badTime);
    const body = cleanBody(interaction.options.getString("noidung"));
    if (!body) return reply(lines.badBody);
    const missing = missingIn(guild.channels.cache.get(channel.id) ?? channel, guild.members?.me);
    if (missing.length) return reply(lines.missingPerms(missing));

    const weekday = interaction.options.getInteger("thu");
    const hhmm = formatTime(time);
    const made = createScheduled({ guildId, channelId: channel.id, body, weekday: given(weekday) ? weekday : null, hhmm, createdBy: interaction.user.id, now });
    track(guildId, "feature_on");
    const when = `${describe({ weekday, hhmm })} (${config.timezone})`;
    return reply(`${lines.created(made.id, channel.id, when)} Lần đầu: <t:${Math.floor(made.nextAt / 1000)}:f>.`);
  },
};

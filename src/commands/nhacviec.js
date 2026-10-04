import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import { defang } from "../activity/text.js";
import { lines } from "../humor/reminders.js";
import { AFTER_CHOICES, parseWhen } from "../reminders/parse.js";
import { MAX_BODY, cleanBody, createReminder, deletePending, listPending } from "../reminders/store.js";

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const sec = (ms) => Math.floor(ms / 1000);

export default {
  data: new SlashCommandBuilder()
    .setName("nhacviec")
    .setDescription("Nhờ thầu nhắc việc riêng cho bạn qua tin nhắn riêng")
    .addSubcommand((s) =>
      s
        .setName("tao")
        .setDescription("Tạo một lời nhắc")
        .addStringOption((o) => o.setName("noidung").setDescription("Cần nhắc gì").setRequired(true).setMaxLength(MAX_BODY))
        .addIntegerOption((o) => o.setName("saunua").setDescription("Nhắc sau bao lâu").addChoices(...AFTER_CHOICES))
        .addStringOption((o) => o.setName("luc").setDescription("Hoặc nhắc lúc mấy giờ hôm nay hoặc ngày mai, dạng HH:mm").setMaxLength(10)),
    )
    .addSubcommand((s) => s.setName("danhsach").setDescription("Xem các lời nhắc đang chờ của bạn"))
    .addSubcommand((s) =>
      s.setName("xoa").setDescription("Xoá một lời nhắc của bạn").addIntegerOption((o) => o.setName("so").setDescription("Lời nhắc cần xoá").setRequired(true).setMinValue(1).setAutocomplete(true)),
    ),

  async autocomplete(interaction) {
    const typed = String(interaction.options.getFocused() ?? "").toLowerCase();
    const choices = listPending(interaction.user.id, 25)
      .filter((r) => !typed || `#${r.id} ${r.body}`.toLowerCase().includes(typed))
      .map((r) => ({ name: `#${r.id} ${defang(r.body)}`.slice(0, 100), value: r.id }));
    return interaction.respond(choices);
  },

  async execute(interaction, { now = Date.now() } = {}) {
    const reply = (content) => interaction.reply(ephemeral(content));
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    if (sub === "danhsach") {
      const rows = listPending(userId, 25);
      if (!rows.length) return reply(lines.listEmpty);
      const body = rows.map((r) => lines.listRow({ ...r, body: defang(r.body) }, sec(r.due_at))).join("\n").slice(0, 4000);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xf5c518).setTitle(lines.listTitle).setDescription(body)], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    if (sub === "xoa") {
      const id = interaction.options.getInteger("so");
      return reply(deletePending(userId, id) ? lines.deleted(id) : lines.missing);
    }

    // tao
    const body = cleanBody(interaction.options.getString("noidung"));
    if (!body) return reply(lines.badBody);
    const when = parseWhen({ after: interaction.options.getInteger("saunua"), at: interaction.options.getString("luc"), now, timeZone: config.timezone });
    if (!when.ok) return reply(when.error);
    const made = createReminder({ guildId: interaction.guildId ?? null, userId, channelId: interaction.guildId ? interaction.channelId : null, body, dueAt: when.dueAt, now });
    if (!made.ok) {
      if (made.reason === "user") return reply(lines.tooMany(made.max));
      if (made.reason === "guild") return reply(lines.tooManyHere(made.max));
      if (made.reason === "far") return reply(lines.tooFar);
      return reply(lines.badBody);
    }
    return reply(lines.created(made.id, sec(when.dueAt), when.tomorrow));
  },
};

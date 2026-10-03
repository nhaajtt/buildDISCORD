import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { DesignError } from "../ai/validate.js";
import { AttachmentError, readAttachmentText } from "../backups/attachment.js";
import { getPlan } from "../license.js";
import {
  FILE_MAX_BYTES,
  composeCustom,
  countCustomThemes,
  deleteCustomTheme,
  exportCustomTheme,
  gateSave,
  getCustomTheme,
  listCustomThemes,
  normalizeThemeName,
  parseThemeFile,
  saveCustomTheme,
} from "../themes/custom.js";
import { gateBuild, gateLimit } from "../utils/gate.js";
import { isAdmin, missingBotPermissions } from "../utils/guards.js";
import { openEditor } from "../ui/editor.js";
import { HUMOR_LEVELS, humorLabels } from "../themes/humor.js";
import { themeLines as lines } from "../humor/backup.js";
import * as humor from "../humor/lines.js";

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });
const nameOption = (o, description = "Tên theme riêng, 1 đến 40 ký tự") => o.setName("ten").setDescription(description).setRequired(true).setMaxLength(40);
const pickedName = (o) => nameOption(o, "Tên theme riêng").setAutocomplete(true);
const fileSlug = (name) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "theme";

export default {
  data: new SlashCommandBuilder()
    .setName("theme")
    .setDescription("Theme riêng của server: dùng lại, xoá, chia sẻ (từ gói Pro)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand((s) => s.setName("danhsach").setDescription("Xem các theme riêng đã lưu"))
    .addSubcommand((s) =>
      s
        .setName("dung")
        .setDescription("Mở bản vẽ từ một theme riêng đã lưu")
        .addStringOption(pickedName)
        .addStringOption((o) =>
          o.setName("muc-do-hai").setDescription("Mức hài của luật chung (mặc định: troll)").addChoices(...HUMOR_LEVELS.map((level) => ({ name: humorLabels[level], value: level }))),
        ),
    )
    .addSubcommand((s) => s.setName("xoa").setDescription("Xoá một theme riêng").addStringOption(pickedName))
    .addSubcommand((s) => s.setName("xuat").setDescription("Tải theme riêng về thành tệp .json").addStringOption(pickedName))
    .addSubcommand((s) =>
      s
        .setName("nhap")
        .setDescription("Nhập theme riêng từ tệp .json (tối đa 100 KB)")
        .addAttachmentOption((o) => o.setName("tep").setDescription("Tệp .json do /theme xuat tạo ra").setRequired(true))
        .addStringOption((o) => nameOption(o, "Tên đặt cho theme nhập")),
    ),

  async autocomplete(interaction) {
    if (!interaction.guildId || !isAdmin(interaction.member)) return interaction.respond([]);
    const typed = interaction.options.getFocused().toLowerCase();
    return interaction.respond(
      listCustomThemes(interaction.guildId)
        .filter((t) => t.name.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((t) => ({ name: t.name.slice(0, 100), value: t.name })),
    );
  },

  async execute(interaction) {
    const reply = (content) => interaction.reply(ephemeral(content));
    if (!isAdmin(interaction.member)) return reply(humor.pick(humor.noPermissionLines));
    const { guildId } = interaction;
    const sub = interaction.options.getSubcommand();

    if (sub === "danhsach") {
      const rows = listCustomThemes(guildId);
      const plan = getPlan(guildId);
      if (!rows.length) return reply(`${lines.empty}${plan.customThemes ? "" : "\nTheme riêng là của gói Pro trở lên. Gõ `/goi` để xem cách nâng cấp."}`);
      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle("🎨 Theme riêng đã lưu")
        .setDescription(
          rows
            .map((t) => `**${t.name}**, ${t.categories} danh mục, ${t.channels} kênh, lưu <t:${Math.floor(t.createdAt / 1000)}:R>`)
            .join("\n")
            .slice(0, 4000),
        )
        .setFooter({ text: `Đang dùng ${rows.length} trên ${plan.customThemes} theme của gói ${plan.label}` });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === "nhap") {
      const blocked = gateSave(guildId, normalizeThemeName(interaction.options.getString("ten")) ?? "");
      if (blocked) return reply(blocked);
      const name = normalizeThemeName(interaction.options.getString("ten"));
      if (!name) return reply(lines.badName);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const text = await readAttachmentText(interaction.options.getAttachment("tep"), FILE_MAX_BYTES);
        const { theme } = parseThemeFile(text);
        const { replaced } = saveCustomTheme(guildId, name, theme);
        return interaction.editReply(replaced ? lines.saved(name, true) : lines.imported(name));
      } catch (error) {
        if (error instanceof AttachmentError) return interaction.editReply(lines.fileProblem);
        if (error instanceof DesignError) return interaction.editReply(lines.notTheme);
        throw error;
      }
    }

    // dung, xoa and xuat start from a named theme
    const name = normalizeThemeName(interaction.options.getString("ten"));
    let found = null;
    try {
      found = name ? getCustomTheme(guildId, name) : null;
    } catch (error) {
      if (!(error instanceof DesignError || error instanceof SyntaxError)) throw error;
    }
    if (!found) return reply(lines.notFound);

    if (sub === "xuat") {
      const file = new AttachmentBuilder(Buffer.from(exportCustomTheme(found.name, found.theme)), { name: `thau-theme-${fileSlug(found.name)}.json` });
      return interaction.reply({ content: lines.exportHint, files: [file], flags: MessageFlags.Ephemeral });
    }

    if (sub === "xoa") {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`theme:del:${interaction.user.id}:${found.name}`).setLabel("Xoá luôn").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`theme:no:${interaction.user.id}`).setLabel("Thôi để tui nghĩ lại").setStyle(ButtonStyle.Secondary),
      );
      return interaction.reply({ content: `Xoá theme riêng **${found.name}**? Xoá là hết quay lại, trừ khi bạn đã \`/theme xuat\` ra tệp.`, components: [row], flags: MessageFlags.Ephemeral });
    }

    // dung: a server whose plan has no saved themes cannot use them, and building follows the same rules as /build
    const planBlocked = gateLimit(guildId, "customThemes", 0, "theme riêng") ?? gateBuild(guildId, 1);
    if (planBlocked) return reply(planBlocked);
    const missing = missingBotPermissions(interaction.guild);
    if (missing.length) return reply(humor.missingBotPermsLine(missing));
    const level = interaction.options.getString("muc-do-hai") ?? "troll";
    return openEditor(interaction, composeCustom(found.theme, { humor: level }), { note: `Theme riêng **${found.name}** (giọng ${humorLabels[level]}). Xem bản vẽ, sửa nếu muốn, rồi bấm xây.` });
  },

  // Buttons under the delete confirmation: theme:<action>:<userId>[:<name>]
  async handleComponent(interaction, [action, userId, ...nameParts]) {
    if (interaction.user.id !== userId || !isAdmin(interaction.member)) return interaction.reply(ephemeral(lines.expired));
    if (action === "no") return interaction.update({ content: lines.cancelled, components: [] });
    if (action !== "del") return;
    // Names may contain colons, so everything after the user id is the name
    const name = normalizeThemeName(nameParts.join(":"));
    const found = name ? getCustomTheme(interaction.guildId, name) : null;
    if (!found) return interaction.update({ content: lines.notFound, components: [] });
    deleteCustomTheme(interaction.guildId, found.name);
    return interaction.update({ content: lines.deleted(found.name), components: [] });
  },
};

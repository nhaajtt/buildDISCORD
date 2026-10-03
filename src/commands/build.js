import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { themes, buildPlan, parseThemeIds } from "../themes/index.js";
import { isAdmin, missingBotPermissions } from "../utils/guards.js";
import { gateBuild } from "../utils/gate.js";
import { openEditor } from "../ui/editor.js";
import * as humor from "../humor/lines.js";

const themeOption = (option, name, description, required) =>
  option
    .setName(name)
    .setDescription(description)
    .setRequired(required)
    .addChoices(...themes.map((t) => ({ name: t.label, value: t.id })));

export default {
  data: new SlashCommandBuilder()
    .setName("build")
    .setDescription("Gọi thầu xây dựng dựng cả server (kênh, role, luật) theo một hay nhiều theme hài hước")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption((option) => themeOption(option, "theme", "Chọn phong cách server", true))
    .addStringOption((option) => themeOption(option, "theme2", "Trộn thêm một theme nữa (tuỳ chọn)", false))
    .addStringOption((option) => themeOption(option, "theme3", "Trộn thêm theme thứ ba (tuỳ chọn)", false))
    .addStringOption((option) => themeOption(option, "theme4", "Trộn thêm theme thứ tư (tuỳ chọn)", false)),

  async execute(interaction) {
    const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
    if (!isAdmin(interaction.member)) return reply(humor.pick(humor.noPermissionLines));
    const missing = missingBotPermissions(interaction.guild);
    if (missing.length) return reply(humor.missingBotPermsLine(missing));

    const ids = parseThemeIds(["theme", "theme2", "theme3", "theme4"].map((n) => interaction.options.getString(n)));
    const blocked = gateBuild(interaction.guildId, ids.length);
    if (blocked) return reply(blocked);

    await openEditor(interaction, buildPlan(ids), { note: "Xem bản vẽ, sửa nếu muốn, rồi bấm xây." });
  },
};

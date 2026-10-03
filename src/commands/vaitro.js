import { ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { isAdmin } from "../utils/guards.js";
import { gateLimit } from "../utils/gate.js";
import * as humor from "../humor/lines.js";
import { lines } from "../humor/rolemenus.js";
import { cleanText } from "../activity/text.js";
import { MAX_MENU_ROLES, checkPicks, countMenus, createMenu, deleteMenu, getMenu, handlePress, listMenus, postPanel, retirePanel } from "../activity/rolemenus.js";

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const textChannel = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

function buildData() {
  const command = new SlashCommandBuilder()
    .setName("vaitro")
    .setDescription("Menu nhận role bằng nút bấm (admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false);
  command.addSubcommand((s) => {
    s.setName("tao")
      .setDescription("Tạo menu role mới và đăng ở kênh này")
      .addStringOption((o) => o.setName("tieude").setDescription("Tiêu đề của menu").setRequired(true).setMaxLength(100))
      .addStringOption((o) =>
        o
          .setName("chedo")
          .setDescription("Chọn một role hay nhiều role cùng lúc")
          .setRequired(true)
          .addChoices({ name: "Chọn một (đổi role thì role cũ rút)", value: "single" }, { name: "Chọn nhiều", value: "multi" }),
      )
      .addRoleOption((o) => o.setName("role1").setDescription("Role thứ 1").setRequired(true));
    for (let i = 2; i <= MAX_MENU_ROLES; i += 1) s.addRoleOption((o) => o.setName(`role${i}`).setDescription(`Role thứ ${i}`));
    for (let i = 1; i <= MAX_MENU_ROLES; i += 1) s.addStringOption((o) => o.setName(`emoji${i}`).setDescription(`Emoji cho role thứ ${i}`).setMaxLength(8));
    return s;
  });
  return command
    .addSubcommand((s) =>
      s
        .setName("dang")
        .setDescription("Đăng hoặc làm mới bảng của một menu")
        .addIntegerOption((o) => o.setName("menu").setDescription("Số của menu").setRequired(true).setMinValue(1).setAutocomplete(true))
        .addChannelOption((o) => o.setName("kenh").setDescription("Kênh đăng, bỏ trống là kênh hiện tại").addChannelTypes(...textChannel)),
    )
    .addSubcommand((s) => s.setName("danhsach").setDescription("Xem các menu role của server"))
    .addSubcommand((s) =>
      s.setName("xoa").setDescription("Xoá một menu role").addIntegerOption((o) => o.setName("menu").setDescription("Số của menu").setRequired(true).setMinValue(1).setAutocomplete(true)),
    );
}

export default {
  data: buildData(),

  async autocomplete(interaction) {
    if (!interaction.guildId || !interaction.member || !isAdmin(interaction.member)) return interaction.respond([]);
    return interaction.respond(listMenus(interaction.guildId).slice(0, 25).map((m) => ({ name: `#${m.id} ${m.title}`.slice(0, 100), value: m.id })));
  },

  async execute(interaction) {
    const reply = (content) => interaction.reply(ephemeral(content));
    const { guild, guildId } = interaction;
    if (!guild || !guildId) return;
    if (!interaction.member || !isAdmin(interaction.member)) return reply(humor.pick(humor.noPermissionLines));
    const sub = interaction.options.getSubcommand();
    const botId = interaction.client?.user?.id ?? guild.members?.me?.id;

    if (sub === "danhsach") {
      const menus = listMenus(guildId);
      if (!menus.length) return reply(lines.listEmpty);
      const body = menus
        .map((m) => `**#${m.id}** ${m.title}, ${m.mode === "single" ? lines.modeSingle : lines.modeMulti}, ${m.roles.length} role${m.message_id ? `, <#${m.channel_id}>` : ", chưa đăng"}`)
        .join("\n")
        .slice(0, 4000);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x9b59b6).setTitle(lines.listTitle).setDescription(body)], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    if (sub === "xoa" || sub === "dang") {
      const menu = getMenu(interaction.options.getInteger("menu"));
      if (!menu || menu.guild_id !== guildId) return reply(lines.missingMenu);
      if (sub === "xoa") {
        await retirePanel(guild, menu, botId);
        deleteMenu(guildId, menu.id);
        return reply(lines.removed(menu.id));
      }
      const channel = interaction.options.getChannel("kenh") ?? interaction.channel;
      const posted = channel ? await postPanel(guild, menu, channel, botId) : { ok: false };
      return reply(posted.ok ? lines.posted(menu.id, channel.id) : lines.postFailed);
    }

    // tao
    const blocked = gateLimit(guildId, "roleMenus", countMenus(guildId), "menu vai trò");
    if (blocked) return reply(blocked);
    const me = guild.members?.me;
    if (!me?.permissions?.has?.("ManageRoles")) return reply(lines.needManageRoles);

    const picks = [];
    for (let i = 1; i <= MAX_MENU_ROLES; i += 1) {
      const role = interaction.options.getRole(`role${i}`);
      if (role) picks.push({ role, emoji: cleanText(interaction.options.getString(`emoji${i}`) ?? "", 8) });
    }
    const title = cleanText(interaction.options.getString("tieude"), 100);
    if (!title) return reply(lines.badTitle);
    const problem = checkPicks(picks, me.roles?.highest?.position);
    if (problem) return reply(problem);

    const mode = interaction.options.getString("chedo") === "single" ? "single" : "multi";
    const channel = interaction.channel;
    const id = createMenu(guildId, channel?.id ?? "0", title, mode, picks.map((p) => ({ id: p.role.id, emoji: p.emoji })));
    const posted = channel ? await postPanel(guild, getMenu(id), channel, botId) : { ok: false };
    return reply(lines.created(id, posted.ok, channel?.id));
  },

  // Buttons and the select menu: vaitro:t:<menuId>:<roleId> and vaitro:s:<menuId>
  async handleComponent(interaction, parts) {
    if (!interaction.guildId) return;
    if (parts[0] !== "t" && parts[0] !== "s") return;
    return handlePress(interaction, parts);
  },
};

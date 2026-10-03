import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { buildWelcomePost, wantsVerify } from "../onboarding/format.js";
import { roleProblem } from "../onboarding/safety.js";
import { verifyMember } from "../onboarding/join.js";
import { getSection, patchSection } from "../settings.js";
import { isAdmin } from "../utils/guards.js";
import { chaomungLines as lines, permLabels } from "../humor/onboarding.js";
import * as humor from "../humor/lines.js";

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });
const POSTABLE = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

const reasonText = (problem) =>
  problem.code === "dangerous" ? lines.unsafe.dangerous(problem.names.map((name) => permLabels[name] ?? name)) : lines.unsafe[problem.code];

// Returns the funny refusal for a role that must not be handed out, or null when it is fine
function refuseRole(guild, option, label) {
  if (!option) return null;
  const role = guild.roles?.cache?.get(option.id) ?? option;
  const top = guild.members?.me?.roles?.highest?.position ?? -1;
  const problem = roleProblem(role, top);
  return problem ? lines.unsafeRole(label, role.name ?? "?", reasonText(problem)) : null;
}

const describe = (settings, guild) => {
  const channel = settings.channelId ? `<#${settings.channelId}>` : guild.systemChannel ? `<#${guild.systemChannel.id}> (kênh hệ thống)` : lines.none;
  const role = (id) => (id ? `<@&${id}>` : lines.none);
  return [
    lines.statusLine("Chào người mới", settings.enabled ? lines.on : lines.off),
    lines.statusLine("Kênh", channel),
    lines.statusLine("Role người mới", role(settings.newbieRoleId)),
    lines.statusLine("Xác minh", settings.verifyEnabled && settings.verifyRoleId ? `${lines.on}, cấp ${role(settings.verifyRoleId)}` : lines.off),
    lines.statusLine("Lời chào", settings.message ? `\`${settings.message.slice(0, 120)}\`` : lines.defaultMessage),
  ];
};

export default {
  data: new SlashCommandBuilder()
    .setName("chaomung")
    .setDescription("Chào người mới vào server, có thể kèm nút xác minh")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("caidat")
        .setDescription("Bật và chỉnh lời chào người mới")
        .addChannelOption((o) => o.setName("kenh").setDescription("Kênh đăng lời chào (mặc định: kênh hệ thống)").addChannelTypes(...POSTABLE))
        .addRoleOption((o) => o.setName("vaitromoi").setDescription("Role cấp ngay khi vào server"))
        .addRoleOption((o) => o.setName("vaitroxacminh").setDescription("Role cấp sau khi bấm nút xác minh"))
        .addStringOption((o) => o.setName("tinnhan").setDescription("Lời chào, dùng {user} và {server} (tối đa 500 ký tự)").setMaxLength(500))
        .addBooleanOption((o) => o.setName("xacminh").setDescription("Bật nút xác minh dưới lời chào")),
    )
    .addSubcommand((s) => s.setName("thu").setDescription("Xem thử lời chào, chỉ mình bạn thấy"))
    .addSubcommand((s) => s.setName("tat").setDescription("Tắt chào người mới")),

  async execute(interaction) {
    const reply = (content) => interaction.reply(ephemeral(content));
    if (!interaction.guild || !interaction.guildId) return reply(lines.guildOnly);
    if (!isAdmin(interaction.member)) return reply(humor.pick(humor.noPermissionLines));
    const { guild, guildId } = interaction;
    const sub = interaction.options.getSubcommand();

    if (sub === "tat") {
      const was = getSection(guildId, "welcome").enabled;
      patchSection(guildId, "welcome", { enabled: false });
      return reply(was ? lines.disabled : lines.alreadyDisabled);
    }

    if (sub === "thu") {
      const settings = getSection(guildId, "welcome");
      if (!settings.enabled) return reply(lines.previewBlocked);
      const post = buildWelcomePost({ ...settings, verifyEnabled: false }, { userId: interaction.user.id, serverName: guild.name });
      const note = wantsVerify(settings) ? `\n${lines.previewVerifyNote}` : "";
      return interaction.reply({ content: `${lines.previewIntro}\n\n${post.content}${note}`, allowedMentions: { parse: [] }, flags: MessageFlags.Ephemeral });
    }

    // caidat
    const channel = interaction.options.getChannel("kenh");
    const newbie = interaction.options.getRole("vaitromoi");
    const verify = interaction.options.getRole("vaitroxacminh");
    const message = interaction.options.getString("tinnhan");
    const verifyFlag = interaction.options.getBoolean("xacminh");

    if (channel && !POSTABLE.includes(channel.type)) return reply(lines.badChannel);
    const refusal = refuseRole(guild, newbie, "người mới") ?? refuseRole(guild, verify, "xác minh");
    if (refusal) return reply(refusal);

    const current = getSection(guildId, "welcome");
    const patch = { enabled: true };
    if (channel) patch.channelId = channel.id;
    if (newbie) patch.newbieRoleId = newbie.id;
    if (verify) patch.verifyRoleId = verify.id;
    if (message !== null && message !== undefined) patch.message = message;
    patch.verifyEnabled = verifyFlag ?? current.verifyEnabled;
    if (patch.verifyEnabled && !(patch.verifyRoleId ?? current.verifyRoleId)) return reply(lines.needVerifyRole);

    const saved = patchSection(guildId, "welcome", patch);
    const notes = [];
    if (!saved.channelId && !guild.systemChannel) notes.push(lines.noChannelNote);
    const me = guild.members?.me;
    if ((saved.newbieRoleId || saved.verifyRoleId) && me && !me.permissions.has(PermissionFlagsBits.ManageRoles)) notes.push(lines.noPermsNote);
    return reply(lines.saved([...describe(saved, guild), ...notes]));
  },

  // Buttons: chaomung:verify:<userId>
  async handleComponent(interaction, [action, userId]) {
    if (action !== "verify" || !interaction.guild) return;
    return verifyMember(interaction, userId);
  },
};

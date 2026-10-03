import { ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits as P, SlashCommandBuilder } from "discord.js";
import { getSection, patchSection } from "../settings.js";
import { gateFeature } from "../utils/gate.js";
import { isAdmin } from "../utils/guards.js";
import { securityLines as lines } from "../humor/security.js";
import * as humor from "../humor/lines.js";
import { missingPerms, startLockdown, stopLockdown } from "../security/guard.js";

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const POSTABLE = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const onOff = (v) => (v ? lines.on : lines.off);
const given = (v) => v !== null && v !== undefined;

const canPost = (guild, channel) => {
  const perms = (guild.channels?.cache?.get(channel.id) ?? channel).permissionsFor?.(guild.members?.me);
  return Boolean(perms && perms.has(P.ViewChannel) && perms.has(P.SendMessages) && perms.has(P.EmbedLinks));
};

function unlockText(result) {
  if (!result.ok) return lines.notLocked;
  const base = lines.unlocked(result.restored, result.skipped);
  return result.failed.length ? `${base}\n${lines.unlockFailed(result.failed)}` : base;
}

export default {
  data: new SlashCommandBuilder()
    .setName("khoakhan")
    .setDescription("Khoá khẩn cấp, chống raid, chống xoá hàng loạt và nhật ký kiểm duyệt")
    .setDefaultMemberPermissions(P.Administrator)
    .setDMPermission(false)
    .addSubcommand((s) => s.setName("bat").setDescription("Khoá ngay: cấm @everyone gửi tin ở các kênh chat"))
    .addSubcommand((s) => s.setName("tat").setDescription("Mở khoá, trả mọi thứ về đúng như trước"))
    .addSubcommand((s) => s.setName("trangthai").setDescription("Xem tình trạng canh cổng và quyền còn thiếu"))
    .addSubcommand((s) =>
      s
        .setName("caidat")
        .setDescription("Chỉnh chống raid và chống xoá hàng loạt")
        .addBooleanOption((o) => o.setName("raid").setDescription("Bật hoặc tắt chống raid"))
        .addIntegerOption((o) => o.setName("solan").setDescription("Bao nhiêu người vào thì báo động (3 đến 50)").setMinValue(3).setMaxValue(50))
        .addIntegerOption((o) => o.setName("giay").setDescription("Trong bao nhiêu giây (10 đến 300)").setMinValue(10).setMaxValue(300))
        .addStringOption((o) =>
          o
            .setName("hanhdong")
            .setDescription("Làm gì khi có raid")
            .addChoices({ name: "Chỉ báo động", value: "alert" }, { name: "Nâng mức xác minh", value: "verify" }, { name: "Khoá kênh chat", value: "lock" }),
        )
        .addIntegerOption((o) => o.setName("phut").setDescription("Tự mở khoá sau bao nhiêu phút (1 đến 120)").setMinValue(1).setMaxValue(120))
        .addChannelOption((o) => o.setName("kenh").setDescription("Kênh nhận báo động (mặc định: kênh hệ thống)").addChannelTypes(...POSTABLE))
        .addBooleanOption((o) => o.setName("chongxoa").setDescription("Bật hoặc tắt chống xoá hàng loạt (gói Pro)"))
        .addIntegerOption((o) => o.setName("xoasolan").setDescription("Xoá bao nhiêu kênh hoặc role thì báo động (2 đến 10)").setMinValue(2).setMaxValue(10))
        .addIntegerOption((o) => o.setName("xoagiay").setDescription("Trong bao nhiêu giây (10 đến 600)").setMinValue(10).setMaxValue(600)),
    )
    .addSubcommand((s) =>
      s
        .setName("nhatky")
        .setDescription("Bật nhật ký kiểm duyệt: cấm, gỡ cấm, đổi quyền role, AutoMod chặn")
        .addBooleanOption((o) => o.setName("bat").setDescription("Bật hoặc tắt nhật ký"))
        .addChannelOption((o) => o.setName("kenh").setDescription("Kênh ghi nhật ký").addChannelTypes(...POSTABLE))
        .addBooleanOption((o) => o.setName("cam").setDescription("Ghi cấm và gỡ cấm"))
        .addBooleanOption((o) => o.setName("role").setDescription("Ghi thay đổi quyền của role"))
        .addBooleanOption((o) => o.setName("automod").setDescription("Ghi những lần AutoMod chặn (không ghi nội dung)")),
    ),

  async execute(interaction) {
    const reply = (content) => interaction.reply(ephemeral(content));
    if (!interaction.guild || !interaction.guildId) return reply(lines.noGuild);
    if (!interaction.member || !isAdmin(interaction.member)) return reply(humor.pick(humor.noPermissionLines));
    const { guild, guildId } = interaction;
    const sub = interaction.options.getSubcommand();

    // Opening the gate again stays possible whatever the plan
    if (sub !== "tat") {
      const blocked = gateFeature(guildId, "security");
      if (blocked) return reply(blocked);
    }

    if (sub === "bat") {
      const settings = getSection(guildId, "security");
      const result = await startLockdown(guild, { channels: true, verify: false, reason: "Khoá khẩn cấp bằng tay" });
      if (result.ok) return reply(lines.lockedOn(result.locked, false, settings.lockMinutes));
      if (result.reason === "active") return reply(lines.alreadyLocked);
      if (result.reason === "perms") return reply(lines.missingPerms(result.missing));
      if (result.reason === "nothing") return reply(lines.lockedNothing);
      return reply(lines.lockFailed);
    }

    if (sub === "tat") return reply(unlockText(await stopLockdown(guild, { reason: "Mở khoá bằng tay" })));

    if (sub === "trangthai") {
      const s = getSection(guildId, "security");
      const m = getSection(guildId, "modlog");
      const lacking = [...new Set([...missingPerms(guild, ["ManageChannels", "ManageGuild"]), ...(s.nukeEnabled ? missingPerms(guild, ["ViewAuditLog", "ManageRoles"]) : [])])];
      const alertTo = s.alertChannelId ? `<#${s.alertChannelId}>` : lines.alertChannelNote;
      const locked = s.lockdown.active ? `🔒 đang khoá từ <t:${Math.floor(s.lockdown.since / 1000)}:R>, ${s.lockdown.channels.length} kênh` : "🔓 đang mở";
      const embed = new EmbedBuilder()
        .setColor(s.lockdown.active ? 0xe74c3c : 0x2ecc71)
        .setTitle(lines.statusTitle)
        .setDescription(
          [
            `Cổng: ${locked}`,
            `Chống raid: ${onOff(s.raidEnabled)}, ${s.raidJoins} người trong ${s.raidWindowSec} giây, hành động \`${s.raidAction}\`, tự mở sau ${s.lockMinutes} phút`,
            `Báo động gửi tới: ${alertTo}`,
            `Chống xoá hàng loạt: ${onOff(s.nukeEnabled)}, ${s.nukeThreshold} lần trong ${s.nukeWindowSec} giây`,
            `Nhật ký kiểm duyệt: ${onOff(m.enabled)}${m.channelId ? `, <#${m.channelId}>` : ""}`,
            lacking.length ? `Thầu đang thiếu quyền: ${lacking.join(", ")}` : "Quyền của thầu đủ dùng.",
            lines.timeoutNote,
          ].join("\n"),
        );
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    if (sub === "caidat") {
      const patch = {};
      const o = interaction.options;
      const take = (value, field) => {
        if (given(value)) patch[field] = value;
      };
      take(o.getBoolean("raid"), "raidEnabled");
      take(o.getInteger("solan"), "raidJoins");
      take(o.getInteger("giay"), "raidWindowSec");
      take(o.getString("hanhdong"), "raidAction");
      take(o.getInteger("phut"), "lockMinutes");
      const channel = o.getChannel("kenh");
      if (channel) {
        if (!canPost(guild, channel)) return reply(lines.badChannel);
        patch.alertChannelId = channel.id;
      }
      const nuke = o.getBoolean("chongxoa");
      const nukeCount = o.getInteger("xoasolan");
      const nukeSeconds = o.getInteger("xoagiay");
      // Turning anti-nuke off stays possible after a plan lapses
      if (nuke === true || given(nukeCount) || given(nukeSeconds)) {
        const blocked = gateFeature(guildId, "nukeGuard");
        if (blocked) return reply(blocked);
      }
      take(nuke, "nukeEnabled");
      take(nukeCount, "nukeThreshold");
      take(nukeSeconds, "nukeWindowSec");
      patchSection(guildId, "security", patch);
      return reply(lines.saved);
    }

    // nhatky
    const patch = {};
    const o = interaction.options;
    for (const [name, field] of [["bat", "enabled"], ["cam", "logBans"], ["role", "logRoles"], ["automod", "logAutomod"]]) {
      const v = o.getBoolean(name);
      if (given(v)) patch[field] = v;
    }
    const channel = o.getChannel("kenh");
    if (channel) {
      if (!canPost(guild, channel)) return reply(lines.badChannel);
      patch.channelId = channel.id;
      if (patch.enabled === undefined) patch.enabled = true;
    }
    patchSection(guildId, "modlog", patch);
    return reply(`${lines.savedLog}\n${lines.timeoutNote}`);
  },

  // Buttons: khoakhan:unlock. Anyone in the channel can press a button, so the person is checked again here.
  async handleComponent(interaction, [action]) {
    if (action !== "unlock" || !interaction.guild) return;
    if (!interaction.member || !isAdmin(interaction.member)) {
      return interaction.reply(ephemeral(humor.pick(humor.noPermissionLines)));
    }
    const result = await stopLockdown(interaction.guild, { reason: "Mở khoá từ nút báo động" });
    if (!result.ok) return interaction.reply(ephemeral(lines.stale));
    await interaction.message?.edit?.({ components: [] })?.catch?.(() => {});
    return interaction.reply(ephemeral(unlockText(result)));
  },
};

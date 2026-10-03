import { ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { automodStatus, classifyError, gateAutomod, removeAutomod, syncAutomod } from "../automod/index.js";
import { getSection, patchSection } from "../settings.js";
import { automodLines as lines, levelLabels, ruleLabels } from "../humor/automod.js";
import * as humor from "../humor/lines.js";
import { isAdmin } from "../utils/guards.js";

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

const stateLabels = { ok: "✅ đang chạy", changed: "⚠️ bị sửa", missing: "❌ bị xoá", extra: "🧹 không còn cần" };

// The friendly sentence for a failed Discord call
function explain(kind, message) {
  if (kind === "perms") return lines.noManageGuild;
  if (kind === "limit") return lines.limitReached;
  return lines.apiError(message);
}

// What a sync did, in words
function describe(result) {
  const names = (keys) => keys.map((k) => ruleLabels[k] ?? k).join(", ");
  if (result.kind) return explain(result.kind, result.message);
  const parts = [];
  if (result.created.length) parts.push(`Dựng mới: ${names(result.created)}.`);
  if (result.updated.length) parts.push(`Cập nhật: ${names(result.updated)}.`);
  if (result.removed.length) parts.push(`Gỡ bớt: ${names(result.removed)}.`);
  if (!parts.length) parts.push("Mọi luật đã đúng ý, thầu khỏi làm gì thêm.");
  return parts.join(" ");
}

function failureText(result) {
  return result.failed.map((f) => `- ${ruleLabels[f.key] ?? f.key}: ${explain(f.kind, f.message)}`).join("\n");
}

export default {
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Bật AutoMod của Discord để chặn spam, link mời, tag bừa")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("bat")
        .setDescription("Dựng luật AutoMod theo mức độ (mức vừa và gắt từ gói Pro)")
        .addStringOption((o) =>
          o
            .setName("muc")
            .setDescription("Mức độ chặn")
            .setRequired(true)
            .addChoices({ name: "Nhẹ: spam và link mời", value: "nhe" }, { name: "Vừa: thêm tag bừa và lời lẽ nhạy cảm", value: "vua" }, { name: "Gắt: thêm nội dung 18+ và link", value: "gat" }),
        )
        .addChannelOption((o) =>
          o.setName("kenhlog").setDescription("Kênh nhận cảnh báo khi có tin bị chặn").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addBooleanOption((o) => o.setName("chanlink").setDescription("Chặn mọi link, chỉ chạy ở mức gắt (gói Pro)")),
    )
    .addSubcommand((s) => s.setName("tat").setDescription("Gỡ các luật do thầu dựng, luật của admin giữ nguyên"))
    .addSubcommand((s) => s.setName("trangthai").setDescription("Xem mức, các luật đang chạy và luật bị sửa hay xoá"))
    .addSubcommand((s) =>
      s
        .setName("mientru")
        .setDescription("Thêm hoặc bỏ role được miễn AutoMod (gói Pro)")
        .addStringOption((o) =>
          o.setName("hanhdong").setDescription("Thêm hay bỏ").setRequired(true).addChoices({ name: "Thêm", value: "them" }, { name: "Bỏ", value: "xoa" }),
        )
        .addRoleOption((o) => o.setName("role").setDescription("Role cần miễn trừ").setRequired(true)),
    ),

  async execute(interaction) {
    const reply = (content) => interaction.reply(ephemeral(content));
    if (!isAdmin(interaction.member)) return reply(humor.pick(humor.noPermissionLines));
    const { guild, guildId } = interaction;
    const sub = interaction.options.getSubcommand();

    if (sub === "bat") {
      const level = interaction.options.getString("muc");
      const logChannel = interaction.options.getChannel("kenhlog");
      const blockLinks = interaction.options.getBoolean("chanlink");
      const blocked = gateAutomod(guildId, { level, blockLinks: blockLinks === true });
      if (blocked) return reply(blocked);

      const patch = { level, enabled: true };
      if (logChannel) patch.logChannelId = logChannel.id;
      if (blockLinks !== null) patch.blockLinks = blockLinks;
      patchSection(guildId, "automod", patch);

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await syncAutomod(guild);
      if (result.kind) {
        // Nothing was built, so the section must not claim AutoMod is on
        patchSection(guildId, "automod", { enabled: Object.keys(getSection(guildId, "automod").ruleIds).length > 0 });
        return interaction.editReply(describe(result));
      }
      const note = blockLinks && level !== "gat" ? ` ${lines.linksOnlyStrict}` : "";
      const head = lines.enabled(level, describe(result));
      return interaction.editReply(result.ok ? head + note : `${head}${note}\n${lines.partial(failureText(result))}`);
    }

    if (sub === "tat") {
      if (!Object.keys(getSection(guildId, "automod").ruleIds).length) return reply(lines.nothingRecorded);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const { removed, left } = await removeAutomod(guild);
      return interaction.editReply(left ? lines.disabledPartial(removed, left) : lines.disabled(removed));
    }

    if (sub === "trangthai") {
      const settings = getSection(guildId, "automod");
      if (!settings.enabled && !Object.keys(settings.ruleIds).length) return reply(lines.notEnabled);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      let status;
      try {
        status = await automodStatus(guild);
      } catch (error) {
        return interaction.editReply(explain(classifyError(error), error.message));
      }
      const rows = status.rules.map((r) => `**${ruleLabels[r.key] ?? r.name}**: ${stateLabels[r.state]}`);
      const drift = status.rules
        .filter((r) => r.state === "missing" || r.state === "changed")
        .map((r) => (r.state === "missing" ? lines.driftMissing(ruleLabels[r.key] ?? r.name) : lines.driftChanged(ruleLabels[r.key] ?? r.name)));
      const embed = new EmbedBuilder()
        .setColor(drift.length ? 0xf5c518 : 0x2ecc71)
        .setTitle(lines.statusTitle)
        .setDescription([`Mức: **${levelLabels[settings.level]}**${status.full ? "" : " (gói miễn phí chỉ chạy mức nhẹ)"}`, settings.logChannelId ? `Cảnh báo gửi về <#${settings.logChannelId}>` : "Chưa đặt kênh cảnh báo", "", ...rows, ...(drift.length ? ["", ...drift] : [])].join("\n").slice(0, 4000));
      return interaction.editReply({ embeds: [embed] });
    }

    // mientru
    const blocked = gateAutomod(guildId, { exempt: true });
    if (blocked) return reply(blocked);
    const role = interaction.options.getRole("role");
    const action = interaction.options.getString("hanhdong");
    const settings = getSection(guildId, "automod");
    const has = settings.exemptRoleIds.includes(role.id);
    if (action === "them") {
      if (role.id === guildId) return reply(lines.badRole);
      if (has) return reply(lines.exemptAlready);
      if (settings.exemptRoleIds.length >= 20) return reply(lines.exemptFull);
    } else if (!has) {
      return reply(lines.exemptMissing);
    }
    patchSection(guildId, "automod", { exemptRoleIds: action === "them" ? [...settings.exemptRoleIds, role.id] : settings.exemptRoleIds.filter((id) => id !== role.id) });
    const done = action === "them" ? lines.exemptAdded(role.id) : lines.exemptRemoved(role.id);
    if (!settings.enabled) return reply(done);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await syncAutomod(guild);
    if (result.kind) return interaction.editReply(`${done}\n${describe(result)}`);
    return interaction.editReply(result.ok ? done : `${done}\n${lines.partial(failureText(result))}`);
  },
};

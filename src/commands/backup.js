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
import { getPlan } from "../license.js";
import { isAdmin, lock, missingBotPermissions } from "../utils/guards.js";
import { gateLimit } from "../utils/gate.js";
import { AttachmentError, readAttachmentText } from "../backups/attachment.js";
import { restoreSnapshot, describeExisting, isForeign, planRestore } from "../backups/restore.js";
import { BackupError, LIMITS, captureSnapshot } from "../backups/snapshot.js";
import { countBackups, deleteBackup, getBackup, getBackupById, hasBackup, listBackups, normalizeName, saveBackup } from "../backups/store.js";
import { progressBar, restoreSummary } from "../backups/summary.js";
import { parseSnapshotFile } from "../backups/validate.js";
import { backupLines as lines } from "../humor/backup.js";
import * as humor from "../humor/lines.js";

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });
const nameOption = (o, description = "Tên bản sao lưu, 1 đến 40 ký tự") => o.setName("ten").setDescription(description).setRequired(true).setMaxLength(40);
const pickedName = (o) => nameOption(o, "Tên bản sao lưu").setAutocomplete(true);

// A safe file name for the export, from a name that may contain spaces and accents
const fileSlug = (name) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "backup";

export default {
  data: new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Sao lưu và khôi phục cấu trúc server (từ gói Pro)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand((s) => s.setName("tao").setDescription("Chụp lại role, danh mục và kênh của server").addStringOption((o) => nameOption(o)))
    .addSubcommand((s) => s.setName("danhsach").setDescription("Xem các bản sao lưu đang giữ"))
    .addSubcommand((s) => s.setName("khoiphuc").setDescription("Tạo lại phần còn thiếu từ một bản sao lưu").addStringOption(pickedName))
    .addSubcommand((s) => s.setName("xoa").setDescription("Xoá một bản sao lưu").addStringOption(pickedName))
    .addSubcommand((s) => s.setName("xuat").setDescription("Tải bản sao lưu về thành tệp .json").addStringOption(pickedName))
    .addSubcommand((s) =>
      s
        .setName("nhap")
        .setDescription("Nhập bản sao lưu từ tệp .json (tối đa 400 KB)")
        .addAttachmentOption((o) => o.setName("tep").setDescription("Tệp .json do /backup xuat tạo ra").setRequired(true))
        .addStringOption((o) => nameOption(o, "Tên đặt cho bản nhập")),
    ),

  async autocomplete(interaction) {
    if (!interaction.guildId || !isAdmin(interaction.member)) return interaction.respond([]);
    const typed = interaction.options.getFocused().toLowerCase();
    const choices = listBackups(interaction.guildId)
      .filter((b) => b.name.toLowerCase().includes(typed))
      .slice(0, 25)
      .map((b) => ({ name: b.name.slice(0, 100), value: b.name }));
    return interaction.respond(choices);
  },

  async execute(interaction) {
    const reply = (content) => interaction.reply(ephemeral(content));
    if (!isAdmin(interaction.member)) return reply(humor.pick(humor.noPermissionLines));
    const { guild, guildId } = interaction;
    const sub = interaction.options.getSubcommand();

    if (sub === "danhsach") {
      const rows = listBackups(guildId);
      const plan = getPlan(guildId);
      if (!rows.length) return reply(`${lines.empty}${plan.backups ? "" : "\nSao lưu là của gói Pro trở lên. Gõ `/goi` để xem cách nâng cấp."}`);
      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle("📸 Bản sao lưu đang giữ")
        .setDescription(
          rows
            .map((b) => `**${b.name}**, <t:${Math.floor(b.createdAt / 1000)}:R>, ${b.counts.roles} role, ${b.counts.categories} danh mục, ${b.counts.channels} kênh`)
            .join("\n")
            .slice(0, 4000),
        )
        .setFooter({ text: `Đang dùng ${rows.length} trên ${plan.backups} bản của gói ${plan.label}` });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === "tao" || sub === "nhap") {
      const blocked = gateLimit(guildId, "backups", countBackups(guildId), "bản sao lưu");
      if (blocked) return reply(blocked);
      const name = normalizeName(interaction.options.getString("ten"));
      if (!name) return reply(lines.badName);
      if (hasBackup(guildId, name)) return reply(lines.nameTaken);

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (sub === "tao") {
        try {
          await guild.roles.fetch();
          await guild.channels.fetch();
          const snapshot = captureSnapshot(guild);
          saveBackup(guildId, name, snapshot);
          return interaction.editReply(lines.created(name, snapshot.counts));
        } catch (error) {
          if (error instanceof BackupError) return interaction.editReply(lines.tooBig);
          throw error;
        }
      }
      try {
        const text = await readAttachmentText(interaction.options.getAttachment("tep"), LIMITS.bytes);
        const snapshot = parseSnapshotFile(text);
        saveBackup(guildId, name, snapshot);
        return interaction.editReply(lines.imported(name, snapshot.counts));
      } catch (error) {
        if (error instanceof AttachmentError) return interaction.editReply(lines.fileProblem);
        if (error instanceof BackupError) return interaction.editReply(lines.notBackup);
        throw error;
      }
    }

    // khoiphuc, xoa, xuat all start from a named backup
    const name = normalizeName(interaction.options.getString("ten"));
    let found = null;
    try {
      found = name ? getBackup(guildId, name) : null;
    } catch (error) {
      if (!(error instanceof BackupError || error instanceof SyntaxError)) throw error;
    }
    if (!found) return reply(lines.notFound);

    if (sub === "xuat") {
      const file = new AttachmentBuilder(Buffer.from(JSON.stringify(found.snapshot)), { name: `thau-backup-${fileSlug(found.name)}.json` });
      return interaction.reply({ content: `Bản sao lưu **${found.name}** đây. Giữ cẩn thận, ai có tệp này đều thấy cấu trúc server của bạn.`, files: [file], flags: MessageFlags.Ephemeral });
    }

    const buttons = (confirmId, label, style) =>
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`backup:${confirmId}:${interaction.user.id}:${found.id}`).setLabel(label).setStyle(style),
        new ButtonBuilder().setCustomId(`backup:no:${interaction.user.id}:${found.id}`).setLabel("Thôi để tui nghĩ lại").setStyle(ButtonStyle.Secondary),
      );

    if (sub === "xoa") {
      return interaction.reply({
        content: `Xoá bản sao lưu **${found.name}**? Xoá là hết quay lại, trừ khi bạn đã \`/backup xuat\` ra tệp.`,
        components: [buttons("del", "Xoá luôn", ButtonStyle.Danger)],
        flags: MessageFlags.Ephemeral,
      });
    }

    // khoiphuc
    const missingPerms = missingBotPermissions(guild);
    if (missingPerms.length) return reply(humor.missingBotPermsLine(missingPerms));
    const plan = planRestore(found.snapshot, describeExisting(guild));
    if (plan.nothingToDo) return reply(lines.noMissing);
    const embed = new EmbedBuilder()
      .setColor(0xf5c518)
      .setTitle(`♻️ Khôi phục từ "${found.name}"`)
      .setDescription(restoreSummary(found.name, plan, isForeign(found.snapshot, guildId)));
    return interaction.reply({ embeds: [embed], components: [buttons("rs", "Khôi phục", ButtonStyle.Success)], flags: MessageFlags.Ephemeral });
  },

  // Buttons under the confirmations: backup:<action>:<userId>:<backupId>
  async handleComponent(interaction, [action, userId, backupId]) {
    if (interaction.user.id !== userId || !isAdmin(interaction.member)) return interaction.reply(ephemeral(lines.expired));
    if (action === "no") return interaction.update({ content: lines.cancelled, embeds: [], components: [] });

    const { guild, guildId } = interaction;
    let found = null;
    try {
      found = getBackupById(guildId, Number(backupId));
    } catch (error) {
      if (!(error instanceof BackupError || error instanceof SyntaxError)) throw error;
    }
    if (!found) return interaction.update({ content: lines.notFound, embeds: [], components: [] });

    if (action === "del") {
      deleteBackup(guildId, found.id);
      return interaction.update({ content: lines.deleted(found.name), components: [] });
    }
    if (action !== "rs") return;

    const missingPerms = missingBotPermissions(guild);
    if (missingPerms.length) return interaction.update({ content: humor.missingBotPermsLine(missingPerms), embeds: [], components: [] });
    // The server may have changed since the summary was shown, so the plan is made again
    if (planRestore(found.snapshot, describeExisting(guild)).nothingToDo) return interaction.update({ content: lines.noMissing, embeds: [], components: [] });
    if (!lock.tryAcquire(guildId)) return interaction.reply(ephemeral(lines.busy));

    await interaction.update({ content: lines.restoring, embeds: [], components: [] });
    try {
      const result = await restoreSnapshot(guild, found.snapshot, {
        onProgress: (done, total) => interaction.editReply({ content: `${lines.restoring}\n${progressBar(done, total)}` }).catch(() => {}),
      });
      await interaction.editReply({ content: lines.restoreDone(result.created) });
    } catch (error) {
      console.error("Restore failed:", error);
      await interaction.editReply({ content: lines.restoreFailed(error.message) });
    } finally {
      lock.release(guildId);
    }
  },
};

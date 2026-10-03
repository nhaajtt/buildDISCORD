import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { FIXES, applyFix, fixIdsOf, getFix, latestReport, reports, runAudit } from "../audit/index.js";
import { SEVERITY_ORDER } from "../audit/rules.js";
import { isAdmin } from "../utils/guards.js";
import { auditLines as lines, severityIcons } from "../humor/audit.js";
import * as humor from "../humor/lines.js";

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });
const TOP = 10;
const SPARK = "▁▂▃▄▅▆▇█";

const colorOf = (score) => (score >= 75 ? 0x2ecc71 : score >= 55 ? 0xf5c518 : score >= 35 ? 0xe67e22 : 0xe74c3c);
const bar = (score) => `${"█".repeat(Math.round(score / 10))}${"░".repeat(10 - Math.round(score / 10))}`;
const bySeverity = (findings) => [...findings].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
const findingLine = (f, withDetail = true) => `${severityIcons[f.severity] ?? "⚪"} **${f.title}**${withDetail ? `\n${f.detail}` : ""}`;

// Keeps a long list inside Discord's embed limit and says how many were left out
function fit(entries, limit = 3900) {
  const out = [];
  let used = 0;
  for (const [i, entry] of entries.entries()) {
    if (used + entry.length + 2 > limit) {
      out.push(lines.moreFindings(entries.length - i));
      break;
    }
    out.push(entry);
    used += entry.length + 2;
  }
  return out.join("\n\n");
}

export function reportEmbed(report) {
  const sorted = bySeverity(report.findings);
  const shown = sorted.slice(0, TOP);
  const head = `**${report.score}/100** \`${bar(report.score)}\`\n${report.grade}`;
  const body = shown.length ? fit(shown.map((f) => findingLine(f)), 3500) : lines.clean;
  const extra = sorted.length > TOP ? `\n\n${lines.moreFindings(sorted.length - TOP)}` : "";
  return new EmbedBuilder()
    .setColor(colorOf(report.score))
    .setTitle("🩺 Khám sức khỏe server")
    .setDescription(`${head}\n\n${body}${extra}`)
    .setFooter({ text: lines.footer });
}

function reportButtons(report, userId, guild) {
  const row = new ActionRowBuilder();
  const fixable = fixIdsOf(report).filter((id) => getFix(id).describe(guild) !== null);
  if (fixable.length) row.addComponents(new ButtonBuilder().setCustomId(`khamsuckhoe:fix:${userId}`).setLabel(`Sửa an toàn (${fixable.length})`).setStyle(ButtonStyle.Success));
  if (report.findings.length) row.addComponents(new ButtonBuilder().setCustomId(`khamsuckhoe:all:${userId}`).setLabel("Xem hết").setStyle(ButtonStyle.Secondary));
  return row.components.length ? [row] : [];
}

const spark = (scores) => scores.map((s) => SPARK[Math.min(7, Math.floor((Math.max(0, Math.min(100, s)) / 100) * 7.99))]).join("");

function historyEmbed(rows) {
  // rows come newest first; the trend reads left to right in time
  const oldestFirst = [...rows].reverse();
  const diff = oldestFirst.at(-1).score - oldestFirst[0].score;
  const verdict = rows.length < 2 ? lines.trendSingle : diff > 0 ? lines.trendUp(diff) : diff < 0 ? lines.trendDown(-diff) : lines.trendFlat;
  const list = rows.map((r) => `<t:${Math.floor(r.createdAt / 1000)}:d> **${r.score}/100** \`${bar(r.score)}\``).join("\n");
  return new EmbedBuilder()
    .setColor(colorOf(rows[0].score))
    .setTitle(lines.historyTitle)
    .setDescription(`${spark(oldestFirst.map((r) => r.score))}\n\n${list}\n\n${verdict}`)
    .setFooter({ text: lines.footer });
}

export default {
  data: new SlashCommandBuilder()
    .setName("khamsuckhoe")
    .setDescription("Khám sức khỏe server: quyền, kênh, bảo mật và cách sửa an toàn")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    // Discord does not allow a command to run on its own and also have subcommands, so the check itself is a subcommand too
    .addSubcommand((s) => s.setName("kiemtra").setDescription("Khám server ngay và xem điểm sức khỏe"))
    .addSubcommand((s) => s.setName("lichsu").setDescription("Xem điểm 5 lần khám gần nhất")),

  async execute(interaction) {
    if (!interaction.guild || !interaction.guildId) return interaction.reply(ephemeral(lines.guildOnly));
    if (!isAdmin(interaction.member)) return interaction.reply(ephemeral(humor.pick(humor.noPermissionLines)));
    const sub = interaction.options.getSubcommand(false) ?? "kiemtra";

    if (sub === "lichsu") {
      const rows = reports(interaction.guildId, 5);
      if (!rows.length) return interaction.reply(ephemeral(lines.historyEmpty));
      return interaction.reply({ embeds: [historyEmbed(rows)], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let report;
    try {
      report = await runAudit(interaction.guild);
    } catch (error) {
      console.error("Audit error:", error);
      return interaction.editReply(lines.failed);
    }
    return interaction.editReply({ embeds: [reportEmbed(report)], components: reportButtons(report, interaction.user.id, interaction.guild) });
  },

  // Buttons: khamsuckhoe:<fix|all|go|no>:<userId>[:<fixIds>]
  async handleComponent(interaction, [action, userId, fixList = ""]) {
    if (interaction.user.id !== userId || !interaction.guild || !isAdmin(interaction.member)) return interaction.reply(ephemeral(lines.expired));
    const { guild } = interaction;

    if (action === "no") return interaction.update({ content: lines.cancelled, components: [] });

    if (action === "all") {
      const report = latestReport(guild.id);
      if (!report) return interaction.reply(ephemeral(lines.noReport));
      const description = fit(bySeverity(report.findings).map((f) => findingLine(f)));
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(colorOf(report.score)).setTitle("🩺 Toàn bộ kết quả khám").setDescription(description || lines.clean)], flags: MessageFlags.Ephemeral });
    }

    if (action === "fix") {
      const report = latestReport(guild.id);
      const steps = fixIdsOf(report)
        .map((id) => ({ id, text: getFix(id).describe(guild) }))
        .filter((s) => s.text);
      if (!steps.length) return interaction.reply(ephemeral(lines.noFixes));
      const row = new ActionRowBuilder().addComponents(
        // The ids ride in the button so what runs is exactly what was listed
        new ButtonBuilder().setCustomId(`khamsuckhoe:go:${userId}:${steps.map((s) => s.id).join(",")}`).setLabel(lines.fixConfirm).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`khamsuckhoe:no:${userId}`).setLabel("Thôi để tui nghĩ lại").setStyle(ButtonStyle.Secondary),
      );
      return interaction.reply({
        content: `${lines.fixIntro}\n${steps.map((s) => `• ${s.text}`).join("\n")}\n\n${lines.fixOutro}`,
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (action !== "go") return;
    const ids = [...new Set(fixList.split(",").filter((id) => Object.hasOwn(FIXES, id)))];
    if (!ids.length) return interaction.update({ content: lines.noFixes, components: [] });
    await interaction.deferUpdate();
    const before = latestReport(guild.id)?.score;
    const done = [];
    for (const id of ids) {
      try {
        done.push((await applyFix(guild, id)).summary);
      } catch {
        done.push(lines.fixFailed(getFix(id).title));
      }
    }
    let after = before;
    try {
      after = (await runAudit(guild)).score;
    } catch {
      // the fixes already happened, so the summary is still worth showing
    }
    return interaction.editReply({ content: lines.fixDone(done, before ?? "?", after ?? "?"), components: [] });
  },
};

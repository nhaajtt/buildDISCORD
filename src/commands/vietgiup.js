import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, StringSelectMenuBuilder } from "discord.js";
import { applyFix, getFix, latestReport, runAudit } from "../audit/index.js";
import { HelperError, KINDS, MOTA_MAX, draft, failureText, finalForSend, gateHelper } from "../ai/helper.js";
import { AiError } from "../ai/gemini.js";
import { addUsage } from "../license.js";
import { isAdmin } from "../utils/guards.js";
import { fixFlowLines as flow } from "../humor/digest.js";
import { helperLines as lines } from "../humor/helper.js";
import * as humor from "../humor/lines.js";

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });
const TEXT_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const MAX_CHANNELS = 25;
// One draft at a time per server: the quota is checked before the slow AI call and charged after it, so without this a burst
// of requests would all pass the check and overshoot the monthly count
const drafting = new Set();

// The draft travels inside the ephemeral reply's embed, which only the bot can write, and is cleaned again when it is sent
const draftOf = (interaction) => String(interaction.message?.embeds?.[0]?.description ?? "").slice(0, 2000);

// Channels the bot can post in and this person may write in, the current one first. A string menu is used because it can hold 25 names.
function channelChoices(interaction) {
  const me = interaction.guild.members?.me;
  const list = [...interaction.guild.channels.cache.values()].filter((c) => TEXT_TYPES.includes(c.type));
  const usable = list.filter((c) => {
    const mine = c.permissionsFor?.(me);
    const theirs = c.permissionsFor?.(interaction.member);
    return mine?.has(PermissionFlagsBits.ViewChannel) && mine?.has(PermissionFlagsBits.SendMessages) && theirs?.has(PermissionFlagsBits.SendMessages);
  });
  usable.sort((a, b) => (a.id === interaction.channelId ? -1 : b.id === interaction.channelId ? 1 : (a.rawPosition ?? 0) - (b.rawPosition ?? 0)));
  return usable.slice(0, MAX_CHANNELS);
}

function resultReply(interaction, kind, text) {
  const userId = interaction.user.id;
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`vietgiup:here:${userId}`).setLabel(lines.sendHere).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`vietgiup:copy:${userId}`).setLabel(lines.copy).setStyle(ButtonStyle.Secondary),
    ),
  ];
  const choices = interaction.guild ? channelChoices(interaction) : [];
  if (choices.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`vietgiup:ch:${userId}`)
          .setPlaceholder(lines.pickChannel)
          .addOptions(choices.map((c) => ({ label: `#${String(c.name).slice(0, 90)}`, value: c.id }))),
      ),
    );
  }
  return {
    embeds: [new EmbedBuilder().setColor(0x3498db).setTitle(lines.titles[kind]).setDescription(text).setFooter({ text: lines.resultNote })],
    components: rows,
    allowedMentions: { parse: [] },
  };
}

export default {
  data: new SlashCommandBuilder()
    .setName("vietgiup")
    .setDescription("Trợ lý AI viết luật, lời chào, thông báo và giải thích kết quả khám (gói Pro trở lên)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s.setName("luat").setDescription("Viết bản nháp luật server").addStringOption((o) => o.setName("mota").setDescription("Server về gì, ai vào, cần luật kiểu nào").setRequired(true).setMinLength(5).setMaxLength(MOTA_MAX)),
    )
    .addSubcommand((s) =>
      s.setName("loichao").setDescription("Viết bản nháp lời chào thành viên mới").addStringOption((o) => o.setName("mota").setDescription("Giọng và nội dung muốn chào").setRequired(true).setMinLength(5).setMaxLength(MOTA_MAX)),
    )
    .addSubcommand((s) =>
      s.setName("thongbao").setDescription("Viết bản nháp thông báo").addStringOption((o) => o.setName("mota").setDescription("Thông báo về chuyện gì").setRequired(true).setMinLength(5).setMaxLength(MOTA_MAX)),
    )
    .addSubcommand((s) => s.setName("giaithich").setDescription("Giải thích kết quả khám sức khoẻ gần nhất bằng lời dễ hiểu")),

  async execute(interaction) {
    const reply = (content) => interaction.reply(ephemeral(content));
    if (!interaction.guild || !interaction.guildId) return reply(lines.guildOnly);
    if (!isAdmin(interaction.member)) return reply(humor.pick(humor.noPermissionLines));
    const kind = interaction.options.getSubcommand(false);
    if (!KINDS.includes(kind)) return reply(lines.failure.bad);

    const blocked = gateHelper(interaction.guildId);
    if (blocked) return reply(blocked);

    const input = {};
    if (kind === "giaithich") {
      input.report = latestReport(interaction.guildId);
      if (!input.report) return reply(lines.noReport);
    } else {
      input.mota = interaction.options.getString("mota");
    }

    if (drafting.has(interaction.guildId)) return reply("Thầu đang viết một bản nháp cho server này rồi. Đợi bản đó xong rồi xin tiếp nhé.");
    drafting.add(interaction.guildId);
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const text = await draft(kind, input);
      // Only a draft that was made and cleaned is charged, like /thietke
      addUsage(interaction.guildId, "ai");
      return await interaction.editReply(resultReply(interaction, kind, text));
    } catch (error) {
      if (!(error instanceof AiError) && !(error instanceof HelperError)) console.error("Helper failed:", error);
      return interaction.editReply({ content: failureText(error), embeds: [], components: [] });
    } finally {
      drafting.delete(interaction.guildId);
    }
  },

  // Components: vietgiup:fix:<fixId> (from the weekly report), vietgiup:go|no:<userId>[:<fixId>], vietgiup:here|copy|ch:<userId>
  async handleComponent(interaction, [action, a, b]) {
    const reply = (content) => interaction.reply(ephemeral(content));
    if (!interaction.guild) return reply(flow.guildOnly);
    if (!isAdmin(interaction.member)) return reply(flow.notAdmin);

    if (action === "fix") {
      // A button on a public report: anyone can see it, so only an admin gets any further, and nothing changes before a second confirmation
      const fix = getFix(a);
      const step = fix?.describe(interaction.guild);
      if (!fix) return reply(flow.expired);
      if (!step) return reply(flow.nothing);
      const userId = interaction.user.id;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`vietgiup:go:${userId}:${fix.id}`).setLabel(flow.confirm).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`vietgiup:no:${userId}`).setLabel(flow.cancel).setStyle(ButtonStyle.Secondary),
      );
      return interaction.reply({ content: `${flow.intro}\n• ${step}\n\n${flow.outro}`, components: [row], flags: MessageFlags.Ephemeral });
    }

    // Everything below belongs to the person who got it
    if (interaction.user.id !== a) return reply(flow.expired);

    if (action === "no") return interaction.update({ content: flow.cancelled, components: [] });

    if (action === "go") {
      const fix = getFix(b);
      if (!fix) return interaction.update({ content: flow.expired, components: [] });
      await interaction.deferUpdate();
      const before = latestReport(interaction.guildId)?.score;
      let summary;
      try {
        summary = (await applyFix(interaction.guild, fix.id)).summary;
      } catch {
        return interaction.editReply({ content: flow.failed(fix.title), components: [] });
      }
      let after = before;
      try {
        after = (await runAudit(interaction.guild)).score;
      } catch {
        // the fix already happened, so the summary is still worth showing
      }
      return interaction.editReply({ content: flow.done(summary, before ?? "?", after ?? "?"), components: [] });
    }

    const text = finalForSend(draftOf(interaction));
    if (!text) return reply(lines.noText);

    if (action === "copy") return reply(`\`\`\`\n${text.replaceAll("```", "'''")}\n\`\`\``);

    if (action === "here" || action === "ch") {
      const channelId = action === "here" ? interaction.channelId : interaction.values?.[0];
      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel || !TEXT_TYPES.includes(channel.type)) return reply(lines.badChannel);
      const me = interaction.guild.members?.me;
      const mine = channel.permissionsFor?.(me);
      const theirs = channel.permissionsFor?.(interaction.member);
      const okBot = mine?.has(PermissionFlagsBits.ViewChannel) && mine?.has(PermissionFlagsBits.SendMessages);
      if (!okBot || !theirs?.has(PermissionFlagsBits.SendMessages)) return reply(lines.noPostPerm);
      try {
        await channel.send({ content: text, allowedMentions: { parse: [] } });
      } catch {
        return reply(lines.sendFailed);
      }
      return reply(lines.sent(channel.id));
    }
  },
};

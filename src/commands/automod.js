import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, escapeMarkdown } from "discord.js";
import { automodStatus, classifyError, gateAutomod, removeAutomod, standardOn, syncAutomod } from "../automod/index.js";
import { CUSTOM_KEY } from "../automod/rules.js";
import { addWords, pageOf, parseWords, removeWords } from "../automod/words.js";
import { getPlan } from "../license.js";
import { gateLimit } from "../utils/gate.js";
import { getSection, patchSection } from "../settings.js";
import { automodLines as lines, levelLabels, refusedText, ruleLabels } from "../humor/automod.js";
import * as humor from "../humor/lines.js";
import { isAdmin } from "../utils/guards.js";

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

const quiet = { allowedMentions: { parse: [] } };

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

const wordsRow = (page, pages, userId) =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`automod:words:${page - 1}:${userId}`).setLabel("Trước").setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(`automod:words:${page + 1}:${userId}`).setLabel("Sau").setStyle(ButtonStyle.Secondary).setDisabled(page >= pages - 1),
  );

function wordsPage(list, page, userId) {
  const view = pageOf(list, page);
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(lines.wordsTitle(view.page, view.pages, list.length))
    .setDescription(view.items.map((w) => escapeMarkdown(w)).join(", ").slice(0, 4000) || lines.wordsEmpty);
  return { embeds: [embed], components: view.pages > 1 ? [wordsRow(view.page, view.pages, userId)] : [], ...quiet };
}

// What the Discord side did after the list changed, in words
function wordsSyncNote(result, count) {
  if (result.kind) return lines.wordsNotLive(explain(result.kind, result.message));
  if (!result.ok) return lines.wordsNotLive(lines.partial(failureText(result)));
  return count ? lines.wordsLive(count) : lines.wordsGone;
}

async function handleWords(interaction, sub) {
  const { guild, guildId } = interaction;
  const reply = (content) => interaction.reply({ ...ephemeral(content), ...quiet });
  const list = getSection(guildId, "automod").customWords;

  if (sub === "danhsach") {
    if (!list.length) return reply(lines.wordsEmpty);
    return interaction.reply({ ...wordsPage(list, 0, interaction.user.id), flags: MessageFlags.Ephemeral });
  }

  if (sub === "xoahet") {
    if (!list.length) return reply(lines.wordsEmpty);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`automod:wipe:${interaction.user.id}`).setLabel(lines.wipeYes).setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`automod:wipeno:${interaction.user.id}`).setLabel(lines.wipeNo).setStyle(ButtonStyle.Secondary),
    );
    return interaction.reply({ content: lines.wipeAsk(list.length), components: [row], flags: MessageFlags.Ephemeral, ...quiet });
  }

  const { words, refused } = parseWords(interaction.options.getString("tu"));
  if (sub === "xoa") {
    const { list: next, removed } = removeWords(list, words);
    if (!removed.length) return reply(lines.wordsMissing);
    patchSection(guildId, "automod", { customWords: next });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await syncAutomod(guild);
    return interaction.editReply({ content: `${lines.wordsRemoved(removed.length)} ${wordsSyncNote(result, next.length)}`, ...quiet });
  }

  // them
  if (!words.length) return reply(lines.wordsNone(refused));
  const limit = getPlan(guildId).customWords;
  const added = addWords(list, words, limit);
  if (!added.added.length) {
    if (added.noRoom.length) return reply(gateLimit(guildId, "customWords", list.length, "từ khoá chặn") ?? lines.wordsNoRoom);
    return reply(lines.wordsAlready);
  }
  patchSection(guildId, "automod", { customWords: added.list });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await syncAutomod(guild);
  const notes = [lines.wordsAdded(added.added.length)];
  if (added.already.length) notes.push(lines.wordsAlreadyNote(added.already.length));
  if (added.noRoom.length) notes.push(lines.wordsNoRoomNote(added.noRoom.length, limit));
  if (refused.length) notes.push(refusedText(refused));
  notes.push(wordsSyncNote(result, added.list.length));
  return interaction.editReply({ content: notes.join(" "), ...quiet });
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
    .addSubcommandGroup((g) =>
      g
        .setName("tukhoa")
        .setDescription("Từ khoá chặn riêng của server, Discord tự chặn")
        .addSubcommand((s) =>
          s
            .setName("them")
            .setDescription("Thêm từ khoá chặn, nhiều từ thì cách nhau bằng dấu phẩy")
            .addStringOption((o) => o.setName("tu").setDescription("Từ cần chặn, có thể dùng dấu sao của Discord").setRequired(true).setMaxLength(1000)),
        )
        .addSubcommand((s) =>
          s
            .setName("xoa")
            .setDescription("Gỡ một từ khoá khỏi danh sách")
            .addStringOption((o) => o.setName("tu").setDescription("Từ cần gỡ").setRequired(true).setAutocomplete(true).setMaxLength(1000)),
        )
        .addSubcommand((s) => s.setName("danhsach").setDescription("Xem các từ khoá đang chặn (chỉ mình bạn thấy)"))
        .addSubcommand((s) => s.setName("xoahet").setDescription("Xoá sạch danh sách từ khoá, có hỏi lại")),
    )
    .addSubcommand((s) =>
      s
        .setName("mientru")
        .setDescription("Thêm hoặc bỏ role được miễn AutoMod (gói Pro)")
        .addStringOption((o) =>
          o.setName("hanhdong").setDescription("Thêm hay bỏ").setRequired(true).addChoices({ name: "Thêm", value: "them" }, { name: "Bỏ", value: "xoa" }),
        )
        .addRoleOption((o) => o.setName("role").setDescription("Role cần miễn trừ").setRequired(true)),
    ),

  async autocomplete(interaction) {
    if (!interaction.guildId || !interaction.member || !isAdmin(interaction.member)) return interaction.respond([]);
    const typed = String(interaction.options.getFocused() ?? "").toLowerCase().slice(0, 60);
    const choices = getSection(interaction.guildId, "automod")
      .customWords.filter((w) => w.includes(typed))
      .slice(0, 25)
      .map((w) => ({ name: w.slice(0, 100), value: w }));
    return interaction.respond(choices);
  },

  async execute(interaction) {
    const reply = (content) => interaction.reply(ephemeral(content));
    if (!interaction.guild || !interaction.member || !isAdmin(interaction.member)) return reply(humor.pick(humor.noPermissionLines));
    const { guild, guildId } = interaction;
    const sub = interaction.options.getSubcommand();
    if (interaction.options.getSubcommandGroup?.(false) === "tukhoa") return handleWords(interaction, sub);

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
        patchSection(guildId, "automod", { enabled: standardOn(getSection(guildId, "automod").ruleIds) });
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
      const keep = getSection(guildId, "automod").customWords.length ? ` ${lines.disabledKeepsWords}` : "";
      return interaction.editReply((left ? lines.disabledPartial(removed, left) : lines.disabled(removed)) + keep);
    }

    if (sub === "trangthai") {
      const settings = getSection(guildId, "automod");
      if (!settings.enabled && !Object.keys(settings.ruleIds).length && !settings.customWords.length) return reply(lines.notEnabled);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      let status;
      try {
        status = await automodStatus(guild);
      } catch (error) {
        return interaction.editReply(explain(classifyError(error), error.message));
      }
      const customExists = status.rules.some((r) => r.key === CUSTOM_KEY && r.state !== "missing");
      const rows = status.rules.map((r) => `**${ruleLabels[r.key] ?? r.name}**: ${stateLabels[r.state]}`);
      const drift = status.rules
        .filter((r) => r.state === "missing" || r.state === "changed")
        .map((r) => (r.state === "missing" ? lines.driftMissing(ruleLabels[r.key] ?? r.name) : lines.driftChanged(ruleLabels[r.key] ?? r.name)));
      const embed = new EmbedBuilder()
        .setColor(drift.length ? 0xf5c518 : 0x2ecc71)
        .setTitle(lines.statusTitle)
        .setDescription([settings.enabled ? `Mức: **${levelLabels[settings.level]}**${status.full ? "" : " (gói miễn phí chỉ chạy mức nhẹ)"}` : lines.statusStandardOff, settings.logChannelId ? `Cảnh báo gửi về <#${settings.logChannelId}>` : "Chưa đặt kênh cảnh báo", lines.statusWords(settings.customWords.length, customExists), "", ...rows, ...(drift.length ? ["", ...drift] : [])].join("\n").slice(0, 4000));
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
    // The words rule has the same exempt roles as the standard ones, so it needs the update even while the standard rules are off
    if (!settings.enabled && !settings.customWords.length) return reply(done);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await syncAutomod(guild);
    if (result.kind) return interaction.editReply(`${done}\n${describe(result)}`);
    return interaction.editReply(result.ok ? done : `${done}\n${lines.partial(failureText(result))}`);
  },

  // Buttons: automod:words:<page>:<userId>, automod:wipe:<userId>, automod:wipeno:<userId>. Anyone in the channel can press a
  // button, so the person and the permission are checked again here.
  async handleComponent(interaction, [action, a, b]) {
    if (!interaction.guild || !["words", "wipe", "wipeno"].includes(action)) return;
    const userId = action === "words" ? b : a;
    if (interaction.user.id !== userId) return interaction.reply({ ...ephemeral(lines.notYours), ...quiet });
    if (!interaction.member || !isAdmin(interaction.member)) return interaction.reply({ ...ephemeral(humor.pick(humor.noPermissionLines)), ...quiet });
    const { guild, guildId } = interaction;
    const list = getSection(guildId, "automod").customWords;

    if (action === "words") {
      const page = Number(a);
      if (!list.length) return interaction.update({ content: lines.wordsEmpty, embeds: [], components: [] });
      return interaction.update(wordsPage(list, Number.isInteger(page) ? page : 0, userId));
    }
    if (action === "wipeno") return interaction.update({ content: lines.wipeCancelled, components: [], ...quiet });
    if (!list.length) return interaction.update({ content: lines.wipeStale, components: [], ...quiet });
    patchSection(guildId, "automod", { customWords: [] });
    await interaction.update({ content: lines.wipeDone(list.length), components: [], ...quiet });
    const result = await syncAutomod(guild);
    return interaction.editReply({ content: `${lines.wipeDone(list.length)} ${wordsSyncNote(result, 0)}`, components: [], ...quiet });
  },
};

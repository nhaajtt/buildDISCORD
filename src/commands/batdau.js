import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { themes } from "../themes/index.js";
import { HUMOR_LEVELS, humorLabels } from "../themes/humor.js";
import { getPlan } from "../license.js";
import { getSection } from "../settings.js";
import { gateFeature } from "../utils/gate.js";
import { isAdmin, lock, missingBotPermissions } from "../utils/guards.js";
import {
  DESCRIPTION_MAX,
  EXTRA_KEYS,
  MAX_THEMES,
  SUGGEST,
  applyExtras,
  applyHumor,
  applyThemes,
  cleanChoices,
  dropSession,
  gateWizard,
  getSession,
  openSession,
  runWizard,
  suggestTheme,
  themeLabel,
  touchSession,
} from "../onboarding/wizard.js";
import { SITE_URL, extraLabels, wizardLines as lines } from "../humor/wizard.js";
import * as humor from "../humor/lines.js";

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });
const NOTHING = { parse: [] };

// ---------- the view: three menus and two buttons ----------

export function wizardView(session, guildId, userId) {
  const plan = getPlan(guildId);
  const { choices } = session;
  const canPick = gateFeature(guildId, "humor") === null;

  const themeMenu = new StringSelectMenuBuilder()
    .setCustomId(`batdau:theme:${userId}`)
    .setPlaceholder(lines.themeMenu)
    .setMinValues(1)
    .setMaxValues(plan.mix ? MAX_THEMES : 1)
    .addOptions(
      ...themes.map((t) => ({ label: t.label.slice(0, 100), value: t.id, description: String(t.blurb ?? "").slice(0, 100), default: choices.themeIds.includes(t.id) })),
      { label: lines.suggestOption, value: SUGGEST, description: lines.suggestDescription, emoji: "💡" },
    );

  const humorMenu = new StringSelectMenuBuilder()
    .setCustomId(`batdau:humor:${userId}`)
    .setPlaceholder(lines.humorMenu)
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      ...HUMOR_LEVELS.map((level) => ({
        label: humorLabels[level],
        value: level,
        description: level !== "troll" && !canPick ? "Của gói Pro" : undefined,
        default: choices.humor === level,
      })),
    );

  const extrasMenu = new StringSelectMenuBuilder()
    .setCustomId(`batdau:extras:${userId}`)
    .setPlaceholder(lines.extrasMenu)
    .setMinValues(0)
    .setMaxValues(EXTRA_KEYS.length)
    .addOptions(...EXTRA_KEYS.map((key) => ({ label: extraLabels[key].label, value: key, description: extraLabels[key].description.slice(0, 100), default: choices.extras.includes(key) })));

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`batdau:go:${userId}`).setLabel(lines.goButton).setStyle(ButtonStyle.Success).setDisabled(!choices.themeIds.length),
    new ButtonBuilder().setCustomId(`batdau:no:${userId}`).setLabel(lines.cancelButton).setStyle(ButtonStyle.Secondary),
  );

  const summary = [
    `**Kiểu server:** ${choices.themeIds.length ? choices.themeIds.map(themeLabel).join(" + ") : "chưa chọn"}`,
    `**Giọng điệu:** ${humorLabels[choices.humor]}`,
    `**Bật thêm:** ${choices.extras.length ? choices.extras.map((k) => extraLabels[k].label).join(", ") : "không bật gì thêm"}`,
  ].join("\n");
  const embed = new EmbedBuilder()
    .setColor(0xf5c518)
    .setTitle(lines.title)
    .setDescription(`${session.note ? `${session.note}\n\n` : ""}${lines.intro}\n\n${summary}`.slice(0, 4000));

  return {
    content: "",
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(themeMenu), new ActionRowBuilder().addComponents(humorMenu), new ActionRowBuilder().addComponents(extrasMenu), buttons],
  };
}

const resultButtons = (userId, shared) => {
  const row = new ActionRowBuilder();
  if (!shared) row.addComponents(new ButtonBuilder().setCustomId(`batdau:share:${userId}`).setLabel(lines.shareButton).setStyle(ButtonStyle.Primary));
  row.addComponents(new ButtonBuilder().setLabel(lines.siteButton).setStyle(ButtonStyle.Link).setURL(SITE_URL));
  return [row];
};

// Modal submits that came from a message edit it, everything else is answered as a new reply
const respond = (interaction, view) => (interaction.isFromMessage?.() ? interaction.update(view) : interaction.reply({ ...view, flags: MessageFlags.Ephemeral }));

function suggestModal(userId) {
  const input = new TextInputBuilder()
    .setCustomId("desc")
    .setLabel(lines.modalLabel)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(lines.modalPlaceholder)
    .setRequired(true)
    .setMaxLength(DESCRIPTION_MAX);
  return new ModalBuilder().setCustomId(`batdau:desc:${userId}`).setTitle(lines.modalTitle).addComponents(new ActionRowBuilder().addComponents(input));
}

async function startWizard(interaction) {
  const session = openSession(interaction.guildId, interaction.user.id);
  if (getSection(interaction.guildId, "setup").done) session.note = lines.alreadyDone;
  return interaction.reply({ ...wizardView(session, interaction.guildId, interaction.user.id), flags: MessageFlags.Ephemeral });
}

export default {
  data: new SlashCommandBuilder()
    .setName("batdau")
    .setDescription("Dựng và cài đặt cả server chỉ trong 60 giây, chọn vài ô rồi bấm một nút")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.guild || !interaction.guildId) return interaction.reply(ephemeral(lines.guildOnly));
    if (!isAdmin(interaction.member)) return interaction.reply(ephemeral(humor.pick(humor.noPermissionLines)));
    return startWizard(interaction);
  },

  // Every component starts with "batdau:". Menus and buttons carry the id of the admin they were made for, and each use is checked again.
  async handleComponent(interaction, [action, userId]) {
    if (!interaction.guild || !interaction.guildId) return;
    if (!interaction.member || !isAdmin(interaction.member)) return interaction.reply(ephemeral(action === "open" ? lines.openRefused : lines.notAdmin));
    if (action === "open") return startWizard(interaction);

    const { guildId } = interaction;
    if (interaction.user.id !== userId) return interaction.reply(ephemeral(lines.expired));
    const session = getSession(guildId, userId);
    if (!session) return respond(interaction, { content: lines.expired, embeds: [], components: [] });

    if (action === "no") {
      dropSession(guildId, userId);
      return interaction.update({ content: lines.cancelled, embeds: [], components: [] });
    }

    const plan = getPlan(guildId);
    const canPick = gateFeature(guildId, "humor") === null;
    session.note = "";

    if (action === "theme") {
      const values = interaction.values ?? [];
      if (values.includes(SUGGEST)) return interaction.showModal(suggestModal(userId));
      const { choices, note } = applyThemes(session.choices, values, { canMix: plan.mix });
      session.choices = choices;
      session.note = note;
      return interaction.update(wizardView(session, guildId, userId));
    }

    if (action === "desc") {
      const text = String(interaction.fields?.getTextInputValue?.("desc") ?? "").slice(0, DESCRIPTION_MAX);
      const found = suggestTheme(text);
      session.choices = { ...session.choices, themeIds: [found.themeId] };
      session.note = found.guessed ? lines.suggestedGuess(themeLabel(found.themeId)) : lines.suggested(themeLabel(found.themeId), found.matched);
      return respond(interaction, wizardView(session, guildId, userId));
    }

    if (action === "humor") {
      const { choices, note } = applyHumor(session.choices, interaction.values?.[0], { canPick });
      session.choices = choices;
      session.note = note;
      return interaction.update(wizardView(session, guildId, userId));
    }

    if (action === "extras") {
      session.choices = applyExtras(session.choices, interaction.values ?? []);
      return interaction.update(wizardView(session, guildId, userId));
    }

    if (action === "share") {
      if (!session.result) return interaction.reply(ephemeral(lines.expired));
      if (session.shared) return interaction.reply(ephemeral(lines.shareDone));
      try {
        await interaction.channel.send({ embeds: [session.result.embed], allowedMentions: NOTHING });
      } catch {
        return interaction.reply(ephemeral(lines.shareFailed));
      }
      session.shared = true;
      return interaction.update({ components: resultButtons(userId, true) });
    }

    if (action !== "go") return;

    const choices = cleanChoices(session.choices);
    const refuse = (note) => {
      session.note = note;
      return interaction.update(wizardView(session, guildId, userId));
    };
    if (!choices) return refuse(lines.pickTheme);
    const missing = missingBotPermissions(interaction.guild);
    if (missing.length) return refuse(humor.missingBotPermsLine(missing));
    const blocked = gateWizard(guildId, choices);
    if (blocked) return refuse(blocked);
    if (!lock.tryAcquire(guildId)) return interaction.reply(ephemeral(lines.busy));

    await interaction.update({ content: lines.progressStart, embeds: [], components: [] });
    try {
      const result = await runWizard(interaction.guild, choices, { onProgress: (text) => interaction.editReply({ content: text }).catch(() => {}) });
      session.result = result;
      touchSession(session);
      await interaction.editReply({ content: "", embeds: [result.embed], components: resultButtons(userId, false), allowedMentions: NOTHING });
    } catch (error) {
      console.error("Wizard failed:", error);
      await interaction.editReply({ content: lines.failed(error.message), embeds: [], components: [] }).catch(() => {});
    } finally {
      lock.release(guildId);
    }
  },
};

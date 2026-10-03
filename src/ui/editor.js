import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { addChannel, createBlueprint, dropBlueprint, getBlueprint, removeCategory, renameCategory } from "../blueprints.js";
import { buildServer } from "../builder.js";
import { countPlan } from "../themes/index.js";
import { gateBuild, recordBuild } from "../utils/gate.js";
import { isAdmin, lock } from "../utils/guards.js";
import * as humor from "../humor/lines.js";

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

function tree(plan) {
  const lines = [];
  for (const category of plan.categories) {
    lines.push(`**${category.name}**`);
    for (const channel of category.channels) lines.push(`${channel.type === "voice" ? "🔊" : "#"} ${channel.name}`);
  }
  let text = lines.join("\n");
  if (text.length > 3300) text = `${text.slice(0, 3300)}\n...`;
  return text;
}

// The message shown while someone edits a blueprint: the tree plus the edit controls
export function editorView(entry, note = "") {
  const { plan, id } = entry;
  const counts = countPlan(plan);
  const embed = new EmbedBuilder()
    .setColor(0xf5c518)
    .setTitle(`🏗️ Bản vẽ: ${plan.label}`)
    .setDescription(
      `${note ? `${note}\n\n` : ""}${tree(plan)}\n\n**Role:** ${plan.roles.map((r) => r.name).join(", ")}`.slice(0, 4000),
    )
    .setFooter({ text: `${counts.categories} danh mục, ${counts.channels} kênh, ${counts.roles} role. Bản vẽ hết hạn sau 15 phút.` });

  const options = (skipFirst) =>
    plan.categories
      .map((category, index) => ({ label: category.name.slice(0, 100), value: String(index) }))
      .filter((_, index) => !(skipFirst && index === 0))
      .slice(0, 25);

  const components = [];
  const removable = options(true);
  if (removable.length) {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`bp:remove:${id}`).setPlaceholder("Bỏ một danh mục").addOptions(removable),
      ),
    );
  }
  components.push(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`bp:rename:${id}`).setPlaceholder("Đổi tên một danh mục").addOptions(options(false)),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bp:add:${id}`).setLabel("Thêm kênh").setStyle(ButtonStyle.Secondary).setEmoji("➕"),
      new ButtonBuilder().setCustomId(`bp:go:${id}`).setLabel("Xây luôn đại ca").setStyle(ButtonStyle.Success).setEmoji("🏗️"),
      new ButtonBuilder().setCustomId(`bp:no:${id}`).setLabel("Để tui nghĩ lại").setStyle(ButtonStyle.Secondary),
    ),
  );
  return { content: "", embeds: [embed], components };
}

// Opens the editor as a fresh private reply (or edits the deferred one)
export async function openEditor(interaction, plan, { deferred = false, note = "" } = {}) {
  const id = createBlueprint({ guildId: interaction.guildId, userId: interaction.user.id, plan });
  const view = editorView(getBlueprint(id), note);
  if (deferred) return interaction.editReply(view);
  return interaction.reply({ ...view, flags: MessageFlags.Ephemeral });
}

const respond = (interaction, view) => (interaction.isFromMessage() ? interaction.update(view) : interaction.reply(view));

async function runBuild(interaction, entry) {
  const blocked = gateBuild(interaction.guildId, entry.plan.id.split("+").length);
  if (blocked) return interaction.update({ content: blocked, embeds: [], components: [] });
  if (!lock.tryAcquire(interaction.guildId)) return interaction.reply(ephemeral(humor.busyLine));

  dropBlueprint(entry.id);
  await interaction.update({ content: "🏗️ Bắt đầu thi công...", embeds: [], components: [] });
  try {
    await buildServer(interaction.guild, entry.plan, (text) => interaction.editReply({ content: text }).catch(() => {}));
    recordBuild(interaction.guildId);
    await interaction.editReply({ content: `✅ ${humor.pick(humor.doneLines)}` });
  } catch (error) {
    console.error("Build failed:", error);
    await interaction.editReply({
      content: `💥 Công trình sập giữa chừng: ${error.message}\nChạy lại \`/build\` được, tui sẽ bỏ qua phần đã xây.`,
    });
  } finally {
    lock.release(interaction.guildId);
  }
}

// Handles every select menu, button and modal whose id starts with "bp:"
export async function handleBlueprint(interaction, [action, id, extra]) {
  const entry = getBlueprint(id);
  if (!entry || entry.guildId !== interaction.guildId) {
    const gone = ephemeral(humor.confirmExpiredLine);
    return interaction.isFromMessage() ? interaction.update({ ...gone, embeds: [], components: [] }) : interaction.reply(gone);
  }
  if (entry.userId !== interaction.user.id) return interaction.reply(ephemeral("Bản vẽ này của người khác, đừng bấm bậy."));
  if (!isAdmin(interaction.member)) return interaction.reply(ephemeral(humor.pick(humor.noPermissionLines)));

  if (action === "no") {
    dropBlueprint(id);
    return interaction.update({ content: humor.cancelLine, embeds: [], components: [] });
  }
  if (action === "go") return runBuild(interaction, entry);

  if (action === "remove") {
    const index = Number(interaction.values[0]);
    const name = entry.plan.categories[index]?.name;
    const ok = removeCategory(entry.plan, index);
    return interaction.update(editorView(entry, ok ? `Đã bỏ danh mục **${name}**.` : "Danh mục này không bỏ được."));
  }

  if (action === "rename") {
    const index = interaction.values[0];
    const current = entry.plan.categories[Number(index)]?.name ?? "";
    const modal = new ModalBuilder().setCustomId(`bp:renamem:${id}:${index}`).setTitle("Đổi tên danh mục");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("name").setLabel("Tên mới").setStyle(TextInputStyle.Short).setMaxLength(90).setValue(current.slice(0, 90)).setRequired(true),
      ),
    );
    return interaction.showModal(modal);
  }
  if (action === "renamem") {
    const ok = renameCategory(entry.plan, Number(extra), interaction.fields.getTextInputValue("name"));
    return respond(interaction, editorView(entry, ok ? "Đã đổi tên danh mục." : "Tên trống hoặc trùng với danh mục khác, giữ nguyên."));
  }

  if (action === "add") {
    const modal = new ModalBuilder().setCustomId(`bp:addm:${id}`).setTitle("Thêm kênh");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("name").setLabel("Tên kênh").setStyle(TextInputStyle.Short).setMaxLength(90).setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("type").setLabel("Loại: text hoặc voice").setStyle(TextInputStyle.Short).setValue("text").setMaxLength(5).setRequired(true),
      ),
    );
    return interaction.showModal(modal);
  }
  if (action === "addm") {
    const type = interaction.fields.getTextInputValue("type").trim().toLowerCase() === "voice" ? "voice" : "text";
    const result = addChannel(entry.plan, interaction.fields.getTextInputValue("name"), type);
    const note = result.ok
      ? `Đã thêm kênh vào **${result.category}**.`
      : result.reason === "duplicate"
        ? "Kênh trùng tên đã có trong bản vẽ."
        : "Tên kênh trống.";
    return respond(interaction, editorView(entry, note));
  }
}

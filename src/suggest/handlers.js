import { ActionRowBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { getSection } from "../settings.js";
import { lines } from "../humor/suggest.js";
import { DECISIONS, MAX_NOTE, cleanNote, isStaff } from "./logic.js";
import { castVote, decide, getSuggestion, tally } from "./store.js";
import { buildSuggestionPayload } from "./view.js";

const reply = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

// The suggestion a component belongs to: same server, still alive, and the press came from the message the bot posted for it
function ownSuggestion(interaction, idText) {
  const s = getSuggestion(Number(idText));
  if (!s || s.guild_id !== interaction.guildId || s.status === "removed") return null;
  if (s.message_id && interaction.message?.id && interaction.message.id !== s.message_id) return null;
  return s;
}

// Buttons: gopy:up:<id>, gopy:down:<id>, gopy:ok:<id>, gopy:no:<id>, gopy:done:<id>. Modal: gopy:m:<action>:<id>.
export async function handleSuggestPress(interaction, [action, ...rest]) {
  if (!interaction.guildId) return;
  if (action === "m" && interaction.isModalSubmit?.()) return handleDecision(interaction, rest);
  if (!interaction.isButton?.()) return;
  const s = ownSuggestion(interaction, rest[0]);
  if (!s) return reply(interaction, lines.pressGone);

  if (action === "up" || action === "down") {
    if (s.status !== "open") return reply(interaction, lines.pressDecided);
    castVote(s.id, interaction.user.id, action === "up" ? 1 : -1);
    return interaction.update(buildSuggestionPayload(s, tally(s.id)));
  }

  if (DECISIONS[action]) {
    // Staff rights are checked at the moment of the press, not when the message was posted
    if (!isStaff(interaction.member, getSection(interaction.guildId, "suggest"))) return reply(interaction, lines.notStaff);
    if (s.status !== "open") return reply(interaction, lines.pressDecided);
    const modal = new ModalBuilder()
      .setCustomId(`gopy:m:${action}:${s.id}`)
      .setTitle(lines.modalTitle(DECISIONS[action].label, s.id))
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("note").setLabel(lines.noteLabel).setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(MAX_NOTE),
        ),
      );
    return interaction.showModal(modal);
  }
}

async function handleDecision(interaction, [action, idText]) {
  const picked = DECISIONS[action];
  if (!picked) return;
  // Asked again here: the modal could have been opened by someone whose rights were taken away meanwhile
  if (!isStaff(interaction.member, getSection(interaction.guildId, "suggest"))) return reply(interaction, lines.notStaff);
  const s = ownSuggestion(interaction, idText);
  if (!s) return reply(interaction, lines.pressGone);
  const note = cleanNote(interaction.fields.getTextInputValue("note"));
  if (!decide(s.id, action, interaction.user.id, note)) return reply(interaction, lines.alreadyDecided);

  const fresh = getSuggestion(s.id);
  const payload = buildSuggestionPayload(fresh, tally(s.id));
  if (interaction.isFromMessage?.()) await interaction.update(payload);
  else {
    await reply(interaction, lines.decidedAck(s.id, lines.status[fresh.status]));
    await interaction.channel?.messages?.fetch?.(s.message_id).then((m) => m.edit(payload)).catch(() => {});
  }

  // A short word to the author; closed DMs are fine
  try {
    const author = await interaction.client.users.fetch(s.user_id);
    await author.send({ content: lines.dm(s.id, lines.status[fresh.status], s.body.slice(0, 80), note), allowedMentions: { parse: [] } });
  } catch {
    // the author may have DMs closed or have left
  }
}

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { lines } from "../humor/suggest.js";

const COLORS = { open: 0x5865f2, approved: 0x2ecc71, rejected: 0xe74c3c, done: 0x1abc9c };

// The suggestion as posted: vote buttons with live counts and staff buttons while open, no buttons once decided.
// Nobody is pinged: the author is only a mention inside the embed and allowedMentions is empty.
export function buildSuggestionPayload(s, { up = 0, down = 0 } = {}) {
  const embed = new EmbedBuilder()
    .setColor(COLORS[s.status] ?? COLORS.open)
    .setTitle(lines.embedTitle(s.id))
    .setDescription(s.body.slice(0, 1000))
    .addFields({ name: lines.authorField, value: `<@${s.user_id}>`, inline: true });
  const label = lines.status[s.status] ?? lines.status.open;
  embed.addFields({ name: lines.statusField, value: s.status === "open" ? label : s.decided_by ? lines.decidedBy(label, s.decided_by) : label, inline: true });
  if (s.note) embed.addFields({ name: lines.noteField, value: s.note.slice(0, 300) });
  embed.setFooter({ text: lines.footer(up, down) });

  if (s.status !== "open") return { embeds: [embed], components: [], allowedMentions: { parse: [] } };
  const votes = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gopy:up:${s.id}`).setEmoji("👍").setLabel(String(up)).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`gopy:down:${s.id}`).setEmoji("👎").setLabel(String(down)).setStyle(ButtonStyle.Secondary),
  );
  const staff = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gopy:ok:${s.id}`).setLabel(lines.buttonApprove).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`gopy:no:${s.id}`).setLabel(lines.buttonReject).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`gopy:done:${s.id}`).setLabel(lines.buttonDone).setStyle(ButtonStyle.Primary),
  );
  return { embeds: [embed], components: [votes, staff], allowedMentions: { parse: [] } };
}

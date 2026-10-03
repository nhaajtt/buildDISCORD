import { EmbedBuilder } from "discord.js";
import { getSection, patchSection } from "../settings.js";
import { ticketLines } from "../humor/tickets.js";
import { panelRows } from "./logic.js";

// The ticket panel message, shared by the slash command and the dashboard so both post exactly the same thing

export const panelPayload = (settings) => ({
  embeds: [new EmbedBuilder().setColor(0x3498db).setTitle(ticketLines.panelTitle).setDescription(ticketLines.panelBody)],
  components: panelRows(settings.types),
});

// Posts the panel, or edits the one already posted, and records it. Never throws.
// Returns { ok: true, channel, message, settings } or { ok: false, reason: "setup" | "channel" | "failed" }.
export async function postTicketPanel(guild, settings = getSection(guild.id, "tickets")) {
  if (!settings.panelChannelId || !settings.staffRoleId) return { ok: false, reason: "setup" };
  const channel = guild.channels.cache.get(settings.panelChannelId);
  if (!channel) return { ok: false, reason: "channel" };
  try {
    const payload = panelPayload(settings);
    let message = null;
    if (settings.panelMessageId) message = await channel.messages.fetch(settings.panelMessageId).catch(() => null);
    if (message) await message.edit(payload);
    else message = await channel.send(payload);
    const stored = patchSection(guild.id, "tickets", { enabled: true, panelMessageId: message.id });
    return { ok: true, channel, message, settings: stored };
  } catch (error) {
    console.error(`Ticket panel failed in ${guild.id}:`, error.message);
    return { ok: false, reason: "failed" };
  }
}

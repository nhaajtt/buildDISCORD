import { getSection } from "../settings.js";
import { ticketLines } from "../humor/tickets.js";
import { closeTicket, cleanPending } from "../tickets/index.js";
import { selectStale, snowflakeTime } from "../tickets/logic.js";
import { closeRow, listAllOpen } from "../tickets/store.js";

// Closes open tickets nobody has written in for autoCloseHours. Activity is read from the id of the channel's last message,
// a snowflake that carries its own time, so no message content is ever fetched.
export async function runTickets(client, { now = Date.now() } = {}) {
  let closed = 0;
  try {
    cleanPending();
  } catch (error) {
    console.error("Ticket cleanup failed:", error.message);
  }

  const byGuild = new Map();
  for (const row of listAllOpen()) byGuild.set(row.guild_id, [...(byGuild.get(row.guild_id) ?? []), row]);

  for (const [guildId, rows] of byGuild) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) continue;
      const settings = getSection(guildId, "tickets");
      // A channel an admin deleted by hand leaves no one to close it, so the row is closed here
      const alive = rows.filter((t) => {
        if (guild.channels.cache.has(t.channel_id)) return true;
        closeRow(t.id, now, "Kênh đã bị xoá");
        return false;
      });
      const lastActivityOf = (t) => {
        try {
          const last = guild.channels.cache.get(t.channel_id)?.lastMessageId;
          return Math.max(t.created_at, last ? snowflakeTime(last) : 0);
        } catch {
          return t.created_at;
        }
      };

      for (const ticket of selectStale(alive, now, settings.autoCloseHours, lastActivityOf)) {
        try {
          const channel = guild.channels.cache.get(ticket.channel_id);
          if (await closeTicket(guild, channel, ticket, { by: client.user.id, reason: ticketLines.autoClosed, settings })) closed += 1;
        } catch (error) {
          // One bad channel must not stop the others
          console.error(`Auto-closing ticket ${ticket.id} failed:`, error.message);
        }
      }
    } catch (error) {
      console.error(`Ticket job failed in ${guildId}:`, error.message);
    }
  }
  return closed;
}

export default {
  name: "tickets",
  everyMs: 15 * 60 * 1000,
  run: (client) => runTickets(client),
};

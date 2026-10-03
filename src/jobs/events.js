import { ChannelType, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel } from "discord.js";
import { config } from "../config.js";
import { getDb } from "../db.js";
import { nextOccurrence } from "../games/schedule.js";
import * as lines from "../humor/games.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Creates the Discord event for any schedule whose next start is less than a day away and has no event yet.
// last_event_start remembers which start was already created, which is what prevents duplicates on every later tick.
export async function runEvents(client, { now = Date.now(), timeZone = config.timezone } = {}) {
  const rows = getDb().prepare("SELECT * FROM recurring_events").all();
  let created = 0;

  for (const row of rows) {
    try {
      const guild = client.guilds.cache.get(row.guild_id);
      if (!guild) continue;

      const start = nextOccurrence(row, now, timeZone);
      if (start - now > DAY_MS || row.last_event_start === start) continue;
      if (!guild.members.me?.permissions.has("ManageEvents")) continue;

      const channel = guild.channels.cache.get(row.channel_id);
      if (!channel) continue;
      const stage = channel.type === ChannelType.GuildStageVoice;

      await guild.scheduledEvents.create({
        name: row.name,
        description: row.description ?? undefined,
        scheduledStartTime: new Date(start),
        scheduledEndTime: new Date(start + row.duration_min * 60_000),
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: stage ? GuildScheduledEventEntityType.StageInstance : GuildScheduledEventEntityType.Voice,
        channel,
        reason: "Sự kiện định kỳ",
      });
      getDb().prepare("UPDATE recurring_events SET last_event_start = ? WHERE id = ?").run(start, row.id);
      created += 1;

      // The announcement is a courtesy: if it fails the event still exists
      try {
        const role = row.notify_role_id;
        await guild.systemChannel?.send({
          content: lines.eventAnnounce(row.name, start, role),
          allowedMentions: { roles: role ? [role] : [] },
        });
      } catch (error) {
        console.error(`Event announcement failed in ${row.guild_id}:`, error.message);
      }
    } catch (error) {
      // One bad server must not stop the others
      console.error(`Recurring event ${row.id} failed:`, error.message);
    }
  }
  return created;
}

export default {
  name: "events",
  everyMs: 5 * 60 * 1000,
  run: (client) => runEvents(client),
};

import { defang } from "../activity/text.js";
import { lines } from "../humor/reminders.js";
import { MAX_PER_RUN, claimReminder, dueReminders, markFailed, pruneReminders } from "../reminders/store.js";
import { MINUTE } from "../reminders/parse.js";

// A reminder this far past its time is sent with an apology
const LATE_MS = 5 * MINUTE;

async function deliver(client, row, late) {
  const body = defang(row.body);
  try {
    const user = await client.users.fetch(row.user_id);
    await user.send({ content: (late ? lines.lateBody : lines.dmBody)(body), allowedMentions: { parse: [] } });
    return "dm";
  } catch {
    // DMs closed or the person is unreachable: try the channel where it was made
  }
  if (!row.channel_id || !row.guild_id) return "failed";
  try {
    const channel = await client.channels.fetch(row.channel_id);
    if (!channel?.send || channel.guild?.id !== row.guild_id) return "failed";
    // Only this one person can be pinged, whatever the text says
    await channel.send({ content: lines.channelBody(row.user_id, late), allowedMentions: { parse: [], users: [row.user_id] } });
    return "channel";
  } catch {
    return "failed";
  }
}

// Sends every reminder that is due, at most MAX_PER_RUN per run. The row is marked done BEFORE anything is sent, so a crash
// or an overlapping run can lose a reminder but never send it twice. Whatever came due while the bot was down is sent on the
// first run after it starts.
export async function runReminders(client, { now = Date.now() } = {}) {
  try {
    pruneReminders(now);
  } catch (error) {
    console.error("Reminder cleanup failed:", error.message);
  }
  const stats = { dm: 0, channel: 0, failed: 0 };
  for (const row of dueReminders(now, MAX_PER_RUN)) {
    if (!claimReminder(row.id)) continue;
    try {
      const outcome = await deliver(client, row, now - row.due_at > LATE_MS);
      stats[outcome] += 1;
      if (outcome === "failed") markFailed(row.id);
    } catch (error) {
      stats.failed += 1;
      markFailed(row.id);
      console.error(`Reminder ${row.id} failed:`, error.message);
    }
  }
  return stats;
}

export default {
  name: "reminders",
  everyMs: 30_000,
  async run(client) {
    await runReminders(client);
  },
};

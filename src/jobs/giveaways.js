import { buildGiveawayPayload, closeGiveaway, dueGiveaways, getGiveaway } from "../activity/giveaways.js";
import { buildPollPayload, closePoll, duePolls, getPoll, tally } from "../activity/polls.js";
import { lines } from "../humor/giveaways.js";

const DAY = 24 * 60 * 60 * 1000;
// Rows that are skipped (server not loaded) must not hide the ones behind them, so every due row is looked at, but only this many are closed per tick
const CLOSE_PER_TICK = 20;

async function fetchMessage(guild, channelId, messageId) {
  const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
  if (!messageId || !channel?.messages?.fetch) return { channel, message: null };
  return { channel, message: await channel.messages.fetch(messageId).catch(() => null) };
}

// Closes every giveaway that is due. The state lives in the database, so a restart loses nothing: whatever came due while the bot
// was down is closed on the first tick after it starts. closeGiveaway flips the status and draws in one step, so each one closes once.
export async function runGiveaways(client, { now = Date.now(), rng = Math.random } = {}) {
  let closed = 0;
  for (const row of dueGiveaways(now)) {
    if (closed >= CLOSE_PER_TICK) break;
    try {
      const guild = client.guilds.cache.get(row.guild_id);
      // A server that is down or not loaded yet is tried again next tick; one the bot left for good is closed quietly after a day
      if (guild?.available === false) continue;
      if (!guild && now - row.ends_at < DAY) continue;
      const result = closeGiveaway(row.id, { rng });
      if (!result.closed) continue;
      closed += 1;
      if (!guild) continue;

      const fresh = getGiveaway(row.id);
      const found = await fetchMessage(guild, row.channel_id, row.message_id).catch(() => null);
      await found?.message?.edit(buildGiveawayPayload(fresh, { entries: result.entries })).catch(() => {});
      const content = result.winners.length ? lines.announce(row.prize, result.winners) : lines.announceNobody(row.prize);
      // Only the winners can be pinged, whatever the prize text says
      await found?.channel?.send?.({ content, allowedMentions: { parse: [], users: result.winners } }).catch(() => {});
    } catch (error) {
      console.error(`Giveaway ${row.id} failed to close:`, error.message);
    }
  }
  return closed;
}

// Closes polls whose time is up and shows the final result in place
export async function runPolls(client, { now = Date.now() } = {}) {
  let closed = 0;
  for (const row of duePolls(now)) {
    if (closed >= CLOSE_PER_TICK) break;
    try {
      const guild = client.guilds.cache.get(row.guild_id);
      if (guild?.available === false) continue;
      if (!guild && now - row.ends_at < DAY) continue;
      if (!closePoll(row.id)) continue;
      closed += 1;
      if (!guild) continue;
      const poll = getPoll(row.id);
      const found = await fetchMessage(guild, row.channel_id, row.message_id).catch(() => null);
      await found?.message?.edit(buildPollPayload(poll, tally(poll.id, poll.options.length))).catch(() => {});
    } catch (error) {
      console.error(`Poll ${row.id} failed to close:`, error.message);
    }
  }
  return closed;
}

export default {
  name: "giveaways",
  everyMs: 30_000,
  async run(client) {
    await runGiveaways(client);
    await runPolls(client);
  },
};

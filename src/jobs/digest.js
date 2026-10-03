import { config } from "../config.js";
import { getPlan } from "../license.js";
import { getSection, patchSection } from "../settings.js";
import { isDue } from "../digest/schedule.js";
import { sendDigest } from "../digest/index.js";

// Posts the weekly report for every server whose slot has come. The "sent" mark is written BEFORE posting, so a crash or a slow
// Discord can never make the same week go out twice. The mark lives in the settings, so it survives restarts.
export async function runDigestJob(client, { now = Date.now(), timeZone = config.timezone, send = sendDigest } = {}) {
  const sent = [];
  for (const guild of client.guilds.cache.values()) {
    try {
      const settings = getSection(guild.id, "digest");
      if (!isDue(settings, now, timeZone) || !getPlan(guild.id, now).digest) continue;
      patchSection(guild.id, "digest", { lastSentAt: now });
      const result = await send(guild, { settings: { ...settings, lastSentAt: now }, now });
      if (result?.ok) sent.push(guild.id);
    } catch (error) {
      console.error(`Digest for ${guild.id} failed:`, error?.message ?? error);
    }
  }
  return sent;
}

export default {
  name: "digest",
  everyMs: 10 * 60 * 1000,
  run: (client) => runDigestJob(client),
};

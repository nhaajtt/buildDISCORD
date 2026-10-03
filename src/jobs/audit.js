import { runAudit } from "../audit/index.js";
import { getPlan } from "../license.js";
import { getSection, patchSection } from "../settings.js";
import { auditDue, droppedBy } from "../digest/schedule.js";
import { sendDropAlert } from "../digest/index.js";

// At most this many servers are checked per run, so a bot in many servers spreads the weekly checks out instead of hitting Discord at once
const PER_RUN = 5;
export const DROP_ALERT_POINTS = 10;

// Weekly health check for servers that switched the weekly report and the weekly check on. The date is written before the check,
// so one failing server is retried next week and never every hour. A drop of 10 points or more is posted to the report channel.
export async function runAuditJob(client, { now = Date.now(), audit = runAudit, alert = sendDropAlert } = {}) {
  const alerted = [];
  let checked = 0;
  for (const guild of client.guilds.cache.values()) {
    if (checked >= PER_RUN) break;
    try {
      const settings = getSection(guild.id, "digest");
      if (!auditDue(settings, now) || !getPlan(guild.id, now).digest) continue;
      checked += 1;
      patchSection(guild.id, "digest", { lastAuditAt: now });
      const before = settings.lastScore;
      const report = await audit(guild);
      patchSection(guild.id, "digest", { lastScore: report.score });
      if (droppedBy(before, report.score, DROP_ALERT_POINTS) && settings.channelId) {
        const posted = await alert(guild, { settings, before, after: report.score, report });
        if (posted?.ok) alerted.push(guild.id);
      }
    } catch (error) {
      console.error(`Weekly check for ${guild.id} failed:`, error?.message ?? error);
    }
  }
  return alerted;
}

export default {
  name: "audit",
  everyMs: 60 * 60 * 1000,
  run: (client) => runAuditJob(client),
};

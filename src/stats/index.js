import { updateGuildStats } from "../jobs/stats.js";

// Called by the dashboard after the stats settings change. The renaming rules (at most once per 10 minutes per channel, only when
// the text changed) live in updateGuildStats, so saving twice never renames a channel twice.
export async function syncStats(guild) {
  return updateGuildStats(guild);
}

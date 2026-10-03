import { EmbedBuilder } from "discord.js";
import { getSection } from "../settings.js";
import { securityLines as lines } from "../humor/security.js";
import { postAlert, stopLockdown } from "../security/guard.js";
import { lockdownDue } from "../security/lockdown.js";

// Opens every lockdown whose time is up. The state lives in settings, so a restart picks up exactly where it left off.
export async function runLockdown(client, { now = Date.now() } = {}) {
  let opened = 0;
  for (const guild of client.guilds.cache.values()) {
    try {
      if (guild.available === false) continue;
      const settings = getSection(guild.id, "security");
      if (!lockdownDue(settings.lockdown, settings.lockMinutes, now)) continue;
      const result = await stopLockdown(guild, { reason: "Hết thời gian khoá, tự mở" });
      if (!result.ok) continue;
      opened += 1;
      const text = [lines.autoUnlocked(settings.lockMinutes), result.failed.length ? lines.unlockFailed(result.failed) : ""].filter(Boolean).join("\n");
      await postAlert(guild, settings, { embeds: [new EmbedBuilder().setColor(0x2ecc71).setDescription(text)] });
    } catch (error) {
      console.error(`Lockdown job failed in ${guild?.id}:`, error.message);
    }
  }
  return opened;
}

export default {
  name: "lockdown",
  everyMs: 60 * 1000,
  run: (client) => runLockdown(client),
};

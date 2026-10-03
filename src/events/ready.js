import { writeFileSync } from "node:fs";
import path from "node:path";
import { Events } from "discord.js";
import { alert } from "../alerts.js";
import { backupDb } from "../backup.js";
import { config } from "../config.js";
import { getDb } from "../db.js";
import { startJobs } from "../jobs.js";
import { startDashboard } from "../web/server.js";

export default {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`Thầu xây dựng online: ${client.user.tag}, ${client.guilds.cache.size} server`);
    client.user.setActivity("đổ bê tông cho server");
    getDb();

    const beat = () => writeFileSync(path.join(config.dataDir, "heartbeat"), String(Date.now()));
    beat();
    setInterval(beat, 30_000).unref();

    // One database copy per day, checked every few hours so a restart never skips a day
    const backup = () => {
      try {
        backupDb();
      } catch (error) {
        console.error("Backup failed:", error);
        alert(`Backup database lỗi: ${error.message}`);
      }
    };
    backup();
    setInterval(backup, 6 * 60 * 60 * 1000).unref();

    startJobs(client).then((names) => console.log(`Jobs: ${names.join(", ") || "none"}`));

    startDashboard(client).catch((error) => {
      console.error("Dashboard failed to start:", error);
      alert(`Dashboard không khởi động được: ${error.message}`);
    });

    alert(`Thầu online: ${client.guilds.cache.size} server`);
  },
};

import { Events } from "discord.js";
import { logAutomod } from "../modlog/handlers.js";

export default {
  name: Events.AutoModerationActionExecution,
  async execute(_client, execution) {
    await logAutomod(execution);
  },
};

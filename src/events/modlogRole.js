import { Events } from "discord.js";
import { logRoleUpdate } from "../modlog/handlers.js";

export default {
  name: Events.GuildRoleUpdate,
  async execute(_client, oldRole, newRole) {
    await logRoleUpdate(oldRole, newRole);
  },
};

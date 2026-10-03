import { Events } from "discord.js";
import { onRoleDelete } from "../security/nukeaction.js";

export default {
  name: Events.GuildRoleDelete,
  async execute(_client, role) {
    await onRoleDelete(role);
  },
};

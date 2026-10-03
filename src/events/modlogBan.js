import { Events } from "discord.js";
import { logBan } from "../modlog/handlers.js";

export default {
  name: Events.GuildBanAdd,
  async execute(_client, ban) {
    await logBan(ban);
  },
};

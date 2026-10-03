import { Events } from "discord.js";
import { logUnban } from "../modlog/handlers.js";

export default {
  name: Events.GuildBanRemove,
  async execute(_client, ban) {
    await logUnban(ban);
  },
};

import { Events } from "discord.js";
import { onChannelDelete } from "../security/nukeaction.js";

export default {
  name: Events.ChannelDelete,
  async execute(_client, channel) {
    await onChannelDelete(channel);
  },
};

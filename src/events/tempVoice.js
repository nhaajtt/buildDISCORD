import { Events } from "discord.js";
import { handleVoiceUpdate } from "../tempvoice/rooms.js";

// Join-to-create rooms. Needs only GuildVoiceStates, which the bot already has.
export default {
  name: Events.VoiceStateUpdate,
  async execute(_client, oldState, newState) {
    try {
      await handleVoiceUpdate(oldState, newState);
    } catch (error) {
      console.error("Temp room error:", error);
    }
  },
};

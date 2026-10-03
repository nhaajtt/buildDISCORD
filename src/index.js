import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { Client, Collection, GatewayIntentBits } from "discord.js";
import { config } from "./config.js";
import { alert } from "./alerts.js";
import { stopDashboard } from "./web/server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// None of these is privileged. GuildMessages gives no message content: it shows Discord's own "member joined" notice and who is active.
// GuildVoiceStates is for voice time, GuildModeration for bans and unbans, AutoModerationExecution for AutoMod blocks.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.AutoModerationExecution,
  ],
});

client.commands = new Collection();
for (const file of readdirSync(path.join(__dirname, "commands")).filter((f) => f.endsWith(".js"))) {
  const { default: command } = await import(pathToFileURL(path.join(__dirname, "commands", file)).href);
  client.commands.set(command.data.name, command);
}

for (const file of readdirSync(path.join(__dirname, "events")).filter((f) => f.endsWith(".js"))) {
  const { default: event } = await import(pathToFileURL(path.join(__dirname, "events", file)).href);
  const register = event.once ? client.once.bind(client) : client.on.bind(client);
  register(event.name, (...args) => event.execute(client, ...args));
}

process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error);
  alert(`Unhandled rejection: ${error?.message ?? error}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);
  await stopDashboard();
  await client.destroy();
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

await client.login(config.token);

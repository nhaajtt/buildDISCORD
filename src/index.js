import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { Client, Collection, GatewayIntentBits } from "discord.js";
import { config } from "./config.js";
import { alert } from "./alerts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// GuildMessages is not privileged and gives no message content; it is used to see Discord's own "member joined" notice
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

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
  await client.destroy();
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

await client.login(config.token);

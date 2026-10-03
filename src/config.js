import "dotenv/config";

const required = ["DISCORD_TOKEN", "CLIENT_ID"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID || null,
  musicInviteUrl: process.env.MUSIC_BOT_INVITE_URL || null,
  ttsInviteUrl: process.env.TTS_BOT_INVITE_URL || null,
  // Where the record of what was built per server is stored (mount as a volume)
  dataDir: process.env.DATA_DIR || "data",
  // Discord user IDs allowed to use /admin (comma separated)
  ownerIds: (process.env.OWNER_IDS || "").split(",").map((id) => id.trim()).filter(Boolean),
  // Shown by /goi so customers know how to buy a code
  contactText: process.env.CONTACT_TEXT || "Muốn mua mã kích hoạt thì nhắn chủ bot.",
  // Google Gemini key for /thietke. Without it the AI features stay off.
  geminiApiKey: process.env.GEMINI_API_KEY || null,
  geminiModel: process.env.GEMINI_MODEL || null,
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || null,
};

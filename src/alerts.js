import { config } from "./config.js";

const lastSent = new Map();
const MIN_GAP_MS = 5 * 60 * 1000;

// Posts a short message to the owner's webhook. The same text is sent at most once per 5 minutes so a crash loop cannot flood the channel.
export async function alert(text, now = Date.now()) {
  if (!config.alertWebhookUrl) return false;
  const key = text.slice(0, 120);
  if (now - (lastSent.get(key) ?? 0) < MIN_GAP_MS) return false;
  lastSent.set(key, now);
  try {
    const response = await fetch(config.alertWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: `⚠️ ${text}`.slice(0, 1900) }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

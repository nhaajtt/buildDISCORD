// Turns whatever the AI returned into a theme the builder can safely run. Anything unsafe or malformed is dropped, never trusted.

const LIMITS = { categories: 6, channelsPerCategory: 8, roles: 8, rules: 6, name: 90, topic: 200, rule: 300, welcome: 300 };

// Blocked outright. Kept short on purpose: the system prompt does the real steering, this is the last net.
const standalone = ["đ[ịi]t", "cặc", "lồn", "đéo", "đụ", "sex", "kill yourself"].map((w) => String.raw`(?<!\p{L})${w}(?!\p{L})`);
const BLOCKED = new RegExp(`(${standalone.join("|")}|fuck|shit|nigg|porn|nsfw|nazi|hitler|tự tử)`, "iu");

const PALETTE = [0xe74c3c, 0x3498db, 0x2ecc71, 0x9b59b6, 0xf39c12, 0x1abc9c, 0xe91e63, 0x34495e];

export class DesignError extends Error {}

const text = (value, max) =>
  typeof value === "string"
    ? value
        .replace(/@(everyone|here)/gi, "")
        .replace(/<[@#&!][^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";

const clean = (value, max) => {
  const out = text(value, max);
  return out && !BLOCKED.test(out) ? out : "";
};

// Discord lowercases text channel names and swaps spaces for dashes
export const textChannelName = (name) => name.toLowerCase().replace(/\s+/g, "-").replace(/-{2,}/g, "-");

function parseColor(value, index) {
  const match = typeof value === "string" ? value.trim().match(/^#?([0-9a-f]{6})$/i) : null;
  const color = match ? Number.parseInt(match[1], 16) : PALETTE[index % PALETTE.length];
  return color === 0 ? PALETTE[index % PALETTE.length] : color;
}

export function sanitizeDesign(raw) {
  if (!raw || typeof raw !== "object") throw new DesignError("not an object");

  const categories = [];
  for (const category of Array.isArray(raw.categories) ? raw.categories : []) {
    const name = clean(category?.name, LIMITS.name);
    if (!name || categories.length >= LIMITS.categories) continue;
    const channels = [];
    for (const channel of Array.isArray(category.channels) ? category.channels : []) {
      const channelName = clean(channel?.name, LIMITS.name);
      if (!channelName || channels.length >= LIMITS.channelsPerCategory) continue;
      const voice = channel.type === "voice";
      const entry = { name: voice ? channelName : textChannelName(channelName), type: voice ? "voice" : "text" };
      if (!voice) {
        const topic = clean(channel.topic, LIMITS.topic);
        if (topic) entry.topic = topic;
      }
      channels.push(entry);
    }
    if (channels.length) categories.push({ name, channels });
  }
  if (!categories.length) throw new DesignError("no usable categories");

  const roles = [];
  for (const role of Array.isArray(raw.roles) ? raw.roles : []) {
    const name = clean(role?.name, LIMITS.name);
    if (!name || roles.length >= LIMITS.roles) continue;
    roles.push({ key: `ai${roles.length}`, name, color: parseColor(role.color, roles.length), pick: true });
  }

  const rules = (Array.isArray(raw.rules) ? raw.rules : []).map((r) => clean(r, LIMITS.rule)).filter(Boolean).slice(0, LIMITS.rules);

  let welcome = clean(raw.welcome, LIMITS.welcome);
  if (!welcome) welcome = "Chào {user}! Thầu đã dựng xong, giờ thì tự lo.";
  if (!welcome.includes("{user}")) welcome = `Chào {user}! ${welcome}`;

  return {
    id: "ai",
    label: clean(raw.label, 60) || "Thiết kế riêng",
    welcome,
    roles,
    extraRules: rules,
    categories,
  };
}

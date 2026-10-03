import { compose, type Category, type Channel, type Plan, type ThemesData } from "@/lib/compose.mjs";
import themesData from "./themes.data.json";
import aiData from "./ai-samples.json";

export type { Category, Channel, Plan };

// Written by scripts/export-web-data.js from the bot's own theme files, and checked by a test
const data = themesData as unknown as ThemesData;
export const themes = data.themes;

// The bot's real plan for any mix of themes (see web/lib/compose.mjs)
export const planFor = (ids: string[]): Plan => compose(data, ids);

// The most themes /build takes at once
export const MAX_MIX = 4;

export type Level = "nhe" | "troll" | "nham";
export type Sample = {
  label: string;
  welcome: string;
  roles: string[];
  rules: string[];
  categories: { name: string; channels: Channel[] }[];
};
// Written by scripts/sample-designs.js: real answers from the AI designer, one per humor level
export const ai = aiData as unknown as { description: string; model: string; generatedAt: string; samples: Record<Level, Sample> };

// Same rule the bot applies to a new text channel name
export const textChannelName = (name: string) => name.toLowerCase().replace(/\s+/g, "-").replace(/-{2,}/g, "-");

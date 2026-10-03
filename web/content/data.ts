import themesData from "./themes.data.json";
import aiData from "./ai-samples.json";

export type Channel = { name: string; type: "text" | "voice" };
export type Category = { name: string; staff?: boolean; channels: Channel[] };
export type Plan = {
  label: string;
  counts: { roles: number; categories: number; channels: number };
  rules: number;
  roles: string[];
  categories: Category[];
};
export type ThemeMeta = { id: string; label: string; blurb: string };

// Both files are written by scripts in the bot repository (export-web-data.js and sample-designs.js) and checked by a test
export const themes = themesData.themes as ThemeMeta[];
export const plans = themesData.plans as unknown as Record<string, Plan>;

export type Level = "nhe" | "troll" | "nham";
export type Sample = {
  label: string;
  welcome: string;
  roles: string[];
  rules: string[];
  categories: { name: string; channels: Channel[] }[];
};
export const ai = aiData as unknown as { description: string; model: string; generatedAt: string; samples: Record<Level, Sample> };

// Same rule the bot applies to a new text channel name
export const textChannelName = (name: string) => name.toLowerCase().replace(/\s+/g, "-").replace(/-{2,}/g, "-");

export type Channel = { name: string; type: "text" | "voice" };
export type Category = { name: string; staff: boolean; channels: Channel[] };
export type ThemeData = {
  id: string;
  label: string;
  blurb: string;
  roles: string[];
  extraRules: number;
  categories: Category[];
};
export type ThemesData = {
  base: { roles: string[]; rules: number; info: Category; dj: Category; staff: Category };
  themes: ThemeData[];
};
export type Plan = {
  label: string;
  roles: string[];
  rules: number;
  categories: Category[];
  counts: { roles: number; categories: number; channels: number };
};
export function compose(data: ThemesData, ids: string[]): Plan;

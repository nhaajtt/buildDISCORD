import gaming from "./gaming.js";
import hocTap from "./hoc-tap.js";
import congDong from "./cong-dong.js";
import chillBanBe from "./chill-ban-be.js";
import booking from "./booking.js";
import anime from "./anime.js";
import devCode from "./dev-code.js";
import creator from "./creator.js";
import phimNhac from "./phim-nhac.js";
import congSo from "./cong-so.js";
import thuCung from "./thu-cung.js";
import { baseRoles, baseRules, infoCategory, djCategory, staffCategory } from "./base.js";

export const themes = [gaming, hocTap, congDong, chillBanBe, booking, anime, devCode, creator, phimNhac, congSo, thuCung];

export function parseThemeIds(value) {
  const list = Array.isArray(value) ? value : String(value).split("+");
  return [...new Set(list.filter(Boolean))];
}

const mixedWelcome =
  "Chào {user}! Server này vừa học vừa chơi vừa chill, nghĩa là không thứ nào làm đến nơi đến chốn. Chào mừng gia nhập.";

// Merges the shared parts with one or more theme objects into the plan the builder executes.
// Same-named channels and categories appear once.
export function composePlan(picked) {
  if (!picked.length) throw new Error("No theme given");

  const seenChannels = new Set();
  const seenCategories = new Set();
  const categories = [];
  const add = (category) => {
    if (seenCategories.has(category.name)) return;
    const channels = category.channels.filter((c) => {
      if (seenChannels.has(c.name)) return false;
      seenChannels.add(c.name);
      return true;
    });
    if (!channels.length) return;
    seenCategories.add(category.name);
    categories.push({ ...category, channels });
  };
  add(infoCategory);
  for (const theme of picked) theme.categories.forEach(add);
  add(djCategory);
  add(staffCategory);

  return {
    id: picked.map((t) => t.id).join("+"),
    label: picked.map((t) => t.label).join(" + "),
    welcome: picked.length === 1 ? picked[0].welcome : mixedWelcome,
    roles: [...baseRoles, ...picked.flatMap((t) => t.roles)],
    rules: [...baseRules, ...picked.flatMap((t) => t.extraRules)],
    categories,
  };
}

// themeIds can be an array or a "+"-joined string
export function buildPlan(themeIds) {
  const picked = parseThemeIds(themeIds).map((id) => {
    const theme = themes.find((t) => t.id === id);
    if (!theme) throw new Error(`Unknown theme: ${id}`);
    return theme;
  });
  return composePlan(picked);
}

export function countPlan(plan) {
  const channels = plan.categories.reduce((n, c) => n + c.channels.length, 0);
  return { roles: plan.roles.length, categories: plan.categories.length, channels };
}

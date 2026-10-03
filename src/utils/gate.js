import { addUsage, getPlan, getUsage } from "../license.js";

// Each gate returns null when allowed, or the funny refusal to show. Plan limits live in license.js.

export function gateBuild(guildId, themeCount) {
  const plan = getPlan(guildId);
  if (themeCount > 1 && !plan.mix) {
    return "Trộn nhiều theme là đặc quyền gói Pro. Gói miễn phí chỉ được một theme thôi, đầu tư chút đi đại ca. Gõ `/goi` để xem cách nâng cấp.";
  }
  if (getUsage(guildId, "build", { lifetime: true }) >= plan.buildsTotal) {
    return "Gói miễn phí xây được đúng một lần, và bạn xài rồi. Muốn xây lại hay đổi theme thì nâng cấp Pro nhé. Gõ `/goi` để biết cách.";
  }
  return null;
}

export const recordBuild = (guildId) => addUsage(guildId, "build", { lifetime: true });

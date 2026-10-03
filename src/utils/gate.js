import { addUsage, getPlan, getUsage } from "../license.js";
import { track } from "../analytics.js";

// Each gate returns null when allowed, or the funny refusal to show. Plan limits live in license.js.

export function gateBuild(guildId, themeCount) {
  const plan = getPlan(guildId);
  if (themeCount > 1 && !plan.mix) {
    return "Trộn nhiều theme là đặc quyền gói Pro. Gói miễn phí chỉ được một theme thôi, đầu tư chút đi đại ca. Gõ `/goi` để xem cách nâng cấp.";
  }
  if (getUsage(guildId, "build", { lifetime: true }) >= plan.buildsTotal) {
    return `Gói miễn phí xây được ${plan.buildsTotal} lần, và bạn xài hết rồi. Muốn xây thêm hay đổi theme thì nâng cấp Pro nhé. Gõ \`/goi\` để biết cách.`;
  }
  return null;
}

export const recordBuild = (guildId) => {
  addUsage(guildId, "build", { lifetime: true });
  track(guildId, "build_done");
};

const UPGRADE = "Gõ `/goi` để xem cách nâng cấp.";

const featureMessages = {
  humor: `Chọn mức hài là đặc quyền gói Pro. Gói miễn phí được mức troll mặc định thôi. ${UPGRADE}`,
  games: `Mini-game và bảng xếp hạng là của gói Pro trở lên. ${UPGRADE}`,
  events: `Sự kiện định kỳ là của gói Pro trở lên. ${UPGRADE}`,
  tickets: `Hệ thống ticket là của gói Pro trở lên. ${UPGRADE}`,
  automodFull: `AutoMod mức gắt, chặn link và tuỳ chỉnh sâu là của gói Pro trở lên. ${UPGRADE}`,
  security: `Chống raid là của gói Pro trở lên. ${UPGRADE}`,
  digest: `Bản tin tuần là của gói Pro trở lên. ${UPGRADE}`,
  nukeGuard: `Chống xoá hàng loạt là của gói Pro trở lên. ${UPGRADE}`,
  activity: `Điểm hoạt động, cấp độ theo chat và giọng nói là của gói Pro trở lên. ${UPGRADE}`,
  giveaways: `Giveaway là của gói Pro trở lên. ${UPGRADE}`,
  aiHelper: `Trợ lý AI viết luật, lời chào và thông báo là của gói Pro trở lên. ${UPGRADE}`,
};

// Returns null when the server's plan includes the feature, or the funny refusal to show
export function gateFeature(guildId, feature) {
  return getPlan(guildId)[feature] ? null : featureMessages[feature];
}

// How many of a counted thing (backups, customThemes, recurringEvents) the plan allows, and a refusal when `used` has reached it
export function gateLimit(guildId, key, used, noun) {
  const limit = getPlan(guildId)[key] ?? 0;
  if (limit === 0) return `${noun} là của gói Pro trở lên. ${UPGRADE}`;
  if (used >= limit) return `Server đã dùng hết ${limit} ${noun} của gói hiện tại. Xoá bớt một cái hoặc nâng cấp. ${UPGRADE}`;
  return null;
}

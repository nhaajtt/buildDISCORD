// Every line the AutoMod command says, plus the short messages Discord shows to someone whose message was blocked.

export const blockMessages = {
  spam: "Spam hả? Thầu chặn rồi, ngồi xuống uống ly trà đá cho bình tĩnh.",
  invites: "Quảng cáo server khác ở đây là không có cửa. Thầu chặn link mời rồi nha.",
  mentions: "Gọi cả làng một lúc vậy? Thầu cho nghỉ 60 giây để hạ hoả.",
  words: "Lời lẽ vậy là toang rồi nha. Thầu chặn, nói lại cho lịch sự đi.",
  links: "Link lạ là thầu chặn, lỡ dính web đen thì ai chịu trách nhiệm.",
};

export const levelLabels = { nhe: "Nhẹ", vua: "Vừa", gat: "Gắt" };

export const ruleLabels = {
  spam: "Chống spam",
  invites: "Chặn link mời server",
  mentions: "Chống tag bừa",
  words: "Chặn lời lẽ nhạy cảm",
  links: "Chặn mọi link",
};

export const automodLines = {
  noManageGuild: "Thầu thiếu quyền Quản lý server nên không bật được AutoMod của Discord. Cấp quyền rồi gọi lại, thầu không biết phép thuật.",
  limitReached: "Server đã chạm giới hạn số luật AutoMod của Discord. Xoá bớt luật cũ trong Cài đặt server rồi thử lại, thầu không dám đụng luật của người khác.",
  apiError: (message) => `Discord từ chối thầu: ${String(message).slice(0, 200)}. Thử lại sau chút, hoặc kiểm tra quyền của bot.`,
  notEnabled: "AutoMod đang tắt. Gõ `/automod bat` để thầu dựng hàng rào.",
  nothingRecorded: "Thầu chưa dựng luật nào ở server này nên không có gì để gỡ. Luật của admin thầu cũng không đụng tới.",
  linksOnlyStrict: "Chặn link chỉ chạy ở mức gắt, nên mức này thầu lưu lại đó chứ chưa dùng.",
  badRole: "Role này không miễn trừ được: không dùng được @everyone. Chọn role thật đi, đừng cho cả làng được miễn.",
  exemptFull: "Danh sách miễn trừ đầy 20 role rồi. Xoá bớt một role trước đã.",
  exemptAlready: "Role này đã được miễn trừ rồi, miễn lần hai không có thêm quà.",
  exemptMissing: "Role này đâu có trong danh sách miễn trừ.",
  exemptAdded: (id) => `Đã miễn trừ <@&${id}> khỏi AutoMod. Đặc quyền này đừng lạm dụng nha.`,
  exemptRemoved: (id) => `Đã bỏ miễn trừ <@&${id}>. Giờ ai cũng bình đẳng trước luật.`,
  enabled: (level, parts) => `🛡️ AutoMod mức **${levelLabels[level]}** đã bật. ${parts} Thầu không đọc tin nhắn của ai, Discord tự chặn giúp.`,
  partial: (failedText) => `Dựng được một phần, còn lại bị vướng:\n${failedText}`,
  disabled: (removed) => `Đã gỡ ${removed} luật do thầu dựng. Luật của admin thầu để nguyên, không dám đụng.`,
  disabledPartial: (removed, left) => `Gỡ được ${removed} luật, còn ${left} luật chưa gỡ được (thiếu quyền hoặc Discord lỗi). Gõ lại \`/automod tat\` sau khi cấp quyền.`,
  driftMissing: (name) => `Luật "${name}" thầu ghi nhận nhưng admin đã xoá mất. Gõ \`/automod bat\` để dựng lại.`,
  driftChanged: (name) => `Luật "${name}" bị sửa so với bản thầu dựng. Gõ \`/automod bat\` để đưa về nguyên bản.`,
  statusTitle: "🛡️ Tình trạng AutoMod",
};

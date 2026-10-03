import { pick } from "./lines.js";

export { pick };

export const checkinAlready = [
  "Hôm nay điểm danh rồi, đừng tham. Mai quay lại, thầu vẫn ở đây.",
  "Một ngày một lần thôi đại ca. Bấm nữa là thầu tưởng bạn đang spam.",
  "Sổ điểm danh đã ghi tên bạn hôm nay rồi. Về ngủ đi.",
];

export const checkinDone = (points, bonus, streak) =>
  `✅ Điểm danh xong, **+${points}** điểm${bonus ? ` (đã gồm ${bonus} điểm thưởng chuỗi)` : ""}. Chuỗi hiện tại: **${streak}** ngày.`;

export const levelUp = (name) => `🎉 Lên cấp! Từ giờ bạn là **${name}**.`;

export const totalLine = (points, levelName, next) =>
  `Tổng: **${points}** điểm, cấp **${levelName}**${next ? `, còn ${next - points} điểm nữa lên cấp.` : ", đã chạm đỉnh, không còn gì để leo."}`;

export const boardTitle = "🏆 Bảng xếp hạng điểm vui";
export const boardEmpty = "Bảng trống trơn. Gõ `/diemdanh` để làm người đầu tiên có tên trong sổ.";

export const capped = "Hôm nay bạn đã đủ 100 điểm từ mini-game rồi. Thắng cho vui thôi, điểm thì mai tính.";

export const guessStart = (expiresAt) =>
  `🎯 Thầu vừa nghĩ ra một số từ **1 đến 100**. Ai đoán trúng thì có thưởng. Gõ \`/doanso so:<số>\` để đoán. Vòng này hết hạn <t:${Math.floor(expiresAt / 1000)}:R>.`;
export const guessRunning = (attempts) => `Vòng đoán số đang chạy rồi (đã có ${attempts} lượt đoán). Gõ \`/doanso so:<số>\` để tham gia.`;
export const guessNone = "Chưa có vòng nào. Gõ `/doanso` không kèm số để thầu nghĩ một số.";
export const guessExpired = (secret) => `⌛ Vòng trước đã hết hạn, số bí mật là **${secret}**. Gõ \`/doanso\` để chơi vòng mới.`;
export const guessHigher = (attempts) => `⬆️ Số bí mật **cao hơn** thế. (lượt thứ ${attempts})`;
export const guessLower = (attempts) => `⬇️ Số bí mật **thấp hơn** thế. (lượt thứ ${attempts})`;
export const guessWin = (userId, attempts, granted) =>
  `🎉 <@${userId}> đoán trúng sau ${attempts} lượt! ${granted ? `**+${granted}** điểm.` : "Hôm nay hết điểm game rồi, nhưng danh dự thì còn."}`;

export const duelSelf = ["Tự thách đấu chính mình? Thắng thua gì cũng là bạn, thầu không chấm điểm.", "Đánh với cái bóng của mình thì thầu không phát điểm đâu."];
export const duelBot = "Bot không biết ra kéo búa bao, nó chỉ biết ra lệnh. Chọn người thật đi.";
export const duelStart = (challengerId, targetId) =>
  `✊ <@${challengerId}> thách đấu kéo búa bao với <@${targetId}>! Hai người bấm nút bên dưới, lựa chọn của bạn chỉ mình bạn thấy. Trận đấu hết hạn sau 2 phút.`;
export const duelLocked = (move) => `Bạn đã chốt **${moveLabel(move)}** rồi, đổi ý là phạm luật.`;
export const duelWaiting = (move) => `Đã chốt **${moveLabel(move)}**. Chờ đối thủ ra tay nhé.`;
export const duelStranger = "Trận này không có tên bạn. Muốn chơi thì tự thách đấu một người.";
export const duelGone = "Trận này đã kết thúc hoặc hết hạn rồi.";
export const duelTimeout = "⌛ Hết giờ mà chưa đủ hai người ra tay. Trận huỷ, không ai thắng, không ai thua.";

export const moveLabel = (move) => ({ keo: "✌️ Kéo", bua: "✊ Búa", bao: "✋ Bao" })[move] ?? move;

export const duelResult = ({ tie, challengerId, targetId, moves, winnerId }, grants) => {
  const head = `<@${challengerId}> ra ${moveLabel(moves.challenger)}, <@${targetId}> ra ${moveLabel(moves.target)}.`;
  if (tie) return `${head}\n🤝 Hòa! Mỗi người **+${grants.tie}** điểm cho vui.`;
  return `${head}\n🏆 <@${winnerId}> thắng! ${grants.win ? `**+${grants.win}** điểm.` : "Hôm nay hết điểm game rồi, nhưng bạn vẫn thắng."}`;
};

export const triviaRunning = "Đang có một câu hỏi chưa ai trả lời xong. Trả lời đi đã rồi hỏi tiếp.";
export const triviaIntro = (question, expiresAt) =>
  `🧠 **Câu hỏi nhanh:** ${question.q}\nAi bấm đúng đầu tiên được thưởng. Mỗi người chỉ được thử một lần. Hết hạn <t:${Math.floor(expiresAt / 1000)}:R>.`;
export const triviaWrong = ["Sai rồi, bạn chỉ có một lượt. Ngồi xem người khác làm đi.", "Không phải đáp án đó. Cú trượt đẹp, nhưng vẫn là trượt."];
export const triviaTried = "Bạn đã dùng lượt của mình rồi.";
export const triviaClosed = "Câu hỏi này đã có người trả lời xong.";
export const triviaGone = "Câu hỏi này không còn nữa.";
export const triviaCorrect = (userId, answerText, granted) =>
  `✅ <@${userId}> trả lời đúng: **${answerText}**! ${granted ? `**+${granted}** điểm.` : "Hôm nay hết điểm game rồi, nhưng bạn vẫn giỏi."}`;
export const triviaTimeout = (answerText) => `⌛ Hết giờ, không ai trả lời đúng. Đáp án là **${answerText}**.`;

export const eventsNeedAdmin = "Chỉ admin mới lập sự kiện định kỳ được. Đừng bắt thầu bán đứng quyền lực.";
export const eventsBadTime = "Giờ phải có dạng HH:mm, ví dụ `20:00` hoặc `8:30`.";
export const eventsNoPerm = "Thầu thiếu quyền tạo sự kiện (Quản lý sự kiện). Cấp quyền hoặc mời lại bot với quyền Administrator, sự kiện mới lên lịch được.";
export const eventsEmpty = "Chưa có sự kiện định kỳ nào. Gõ `/sukien mau` để lấy mẫu có sẵn, hoặc `/sukien tao` để tự lập.";
export const eventsRemoved = (name) => `🗑️ Đã xoá lịch **${name}**. Sự kiện đã tạo trên Discord thì bạn tự huỷ nếu cần.`;
export const eventsMissing = "Không tìm thấy lịch này. Chọn từ danh sách gợi ý nhé.";
export const eventsCreated = (name, slot, startsAt) =>
  `📅 Đã lập lịch **${name}** vào ${slot} hằng tuần. Lần tới: <t:${Math.floor(startsAt / 1000)}:F>. Thầu sẽ tạo sự kiện trên Discord trước 24 giờ và báo ở kênh hệ thống.`;
export const eventAnnounce = (name, startsAt, roleId) =>
  `${roleId ? `<@&${roleId}> ` : ""}📅 Sự kiện **${name}** sắp diễn ra <t:${Math.floor(startsAt / 1000)}:R>. Bấm "Quan tâm" trên sự kiện để thầu nhắc nhé.`;

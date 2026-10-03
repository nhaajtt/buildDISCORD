import { baseRules } from "./base.js";

// Humor levels change the words, never the structure: the same roles, categories and channels are built at every level,
// so a server can be rebuilt at another level without duplicating anything.
export const HUMOR_LEVELS = ["nhe", "troll", "nham"];
export const DEFAULT_HUMOR = "troll";

export const humorLabels = { nhe: "Nhẹ nhàng", troll: "Troll", nham: "Siêu nhảm" };

const gentleRules = [
  "Tôn trọng nhau nhé. Có bất đồng thì nói chuyện bình tĩnh, cần thì nhờ mod giúp.",
  "Vui lòng không spam. Gửi quá nhiều tin liên tiếp sẽ làm trôi mất những tin quan trọng.",
  "Không quảng cáo hay bán hàng khi chưa được mod đồng ý.",
  "Không đăng nội dung nhạy cảm (NSFW). Mọi người ở đây cần cảm thấy thoải mái.",
  "Chia sẻ meme và chuyện vui thoải mái, miễn là không làm ai khó chịu.",
  "Hãy lắng nghe lời nhắc của mod. Nếu thấy chưa hợp lý, nhắn riêng cho mod để trao đổi.",
  "Chỉ dùng @everyone khi thật sự cần thiết, để mọi người không bị làm phiền.",
  "Cảm ơn bạn đã đọc luật. Có câu hỏi gì cứ hỏi mod nhé.",
];

const absurdRules = [
  "Tôn trọng nhau như tôn trọng miếng pizza cuối cùng: nhìn thôi cũng phải lễ phép.",
  "Cấm spam. Gửi mười tin nhắn liền nhau không làm bạn có thêm bạn, chỉ làm con mèo của mod giật mình.",
  "Không quảng cáo. Kể cả quảng cáo xe bay chạy bằng kem, trừ khi là kem thật và có mời mod.",
  "Không NSFW. Đây là nơi các thực thể vũ trụ hiền lành tụ họp.",
  "Meme được phép. Meme lỗi thời được đưa vào bảo tàng. Meme vô nghĩa được trao huân chương.",
  "Mod luôn đúng, đôi khi đúng tuyệt đối, và có lúc đúng hơn cả bản đồ. Phản đối thì xem lại điều 1.",
  "Cấm ping @everyone trừ khi nhà bạn đang cháy hoặc có pizza miễn phí.",
  "Bạn đọc đến đây là một huyền thoại. Hãy tự thưởng cho mình một cái nháy mắt.",
];

const rulesByLevel = { nhe: gentleRules, troll: baseRules, nham: absurdRules };

// The troll welcome is the one written in each theme file. The other two live here.
const welcomes = {
  gaming: {
    nhe: "Chào {user}! Chào mừng bạn đến server game. Cứ chơi vui và nhớ nghỉ ngơi nhé.",
    nham: "Chào {user}! Bạn vừa được dịch chuyển vào đấu trường vũ trụ. Hãy mang theo chuột và một phần dũng khí.",
  },
  "hoc-tap": {
    nhe: "Chào {user}! Chào mừng đến góc học tập. Cùng nhau cố gắng và giúp nhau tiến bộ nhé.",
    nham: "Chào {user}! Bạn vừa bước vào thư viện của những con cú nửa đêm. Sách ở đây đều biết nói.",
  },
  "cong-dong": {
    nhe: "Chào {user}! Rất vui khi có bạn trong cộng đồng. Cứ thoải mái làm quen nhé.",
    nham: "Chào {user}! Cộng đồng tạp hoá hân hạnh đón sinh vật mới. Phiếu giảm giá cho tiếng cười ở quầy bên trái.",
  },
  "chill-ban-be": {
    nhe: "Chào {user}! Chào mừng đến nhóm bạn thân. Ở đây cứ thoải mái là chính mình.",
    nham: "Chào {user}! Bạn vừa đáp xuống hành tinh Chill. Trọng lực ở đây thấp, nên tiếng cười bay rất xa.",
  },
  booking: {
    nhe: "Chào {user}! Chào mừng đến nơi đặt lịch bạn chơi. Hãy đọc hướng dẫn và luật trước khi đặt lịch nhé.",
    nham: "Chào {user}! Bạn vừa bước vào chợ bạn chơi liên thiên hà. Đọc luật trước khi chuyển tiền, vì phi thuyền không hoàn vé.",
  },
  anime: {
    nhe: "Chào {user}! Chào mừng đến hội anime. Chia sẻ bộ phim bạn thích để cả nhóm cùng xem nhé.",
    nham: "Chào {user}! Bạn vừa được triệu hồi từ thế giới khác. Kỹ năng đặc biệt: biết spoil nhưng không được dùng.",
  },
  "dev-code": {
    nhe: "Chào {user}! Chào mừng đến hội lập trình. Có gì khó cứ hỏi, mọi người sẽ giúp.",
    nham: "Chào {user}! Bạn vừa lạc vào vòng lặp vô hạn của tình bạn. Thoát ra bằng Ctrl+C là không được.",
  },
  creator: {
    nhe: "Chào {user}! Chào mừng đến studio. Chia sẻ ý tưởng và cùng nhau làm nội dung tốt hơn nhé.",
    nham: "Chào {user}! Studio vừa bật đèn, cả ba cái bóng đều sáng. Camera đã quay từ lúc bạn bước vào.",
  },
  "phim-nhac": {
    nhe: "Chào {user}! Chào mừng đến rạp phim và phòng nhạc. Chọn một bộ phim hoặc bài hát rồi chia sẻ nhé.",
    nham: "Chào {user}! Vé của bạn có ghế số vô hạn. Bắp rang bơ là giả, nhưng niềm vui thì thật.",
  },
  "cong-so": {
    nhe: "Chào {user}! Chào mừng đến văn phòng chung. Cùng nhau làm việc nhẹ nhàng và đúng hạn nhé.",
    nham: "Chào {user}! Bạn vừa nhận thẻ nhân viên của công ty không có mái nhà. Cà phê miễn phí ở tầng mơ.",
  },
  "thu-cung": {
    nhe: "Chào {user}! Chào mừng đến hội thú cưng. Hãy khoe boss nhà bạn cho mọi người xem nhé.",
    nham: "Chào {user}! Hội đồng các boss vừa phê duyệt bạn làm người hầu chính thức. Lương tính bằng đồ ăn vặt.",
  },
};

const mixedWelcomes = {
  nhe: "Chào {user}! Server này có nhiều chủ đề trộn lại, cứ thoải mái làm quen nhé.",
  troll: "Chào {user}! Server này vừa học vừa chơi vừa chill, nghĩa là không thứ nào làm đến nơi đến chốn. Chào mừng gia nhập.",
  nham: "Chào {user}! Bạn vừa rơi vào nồi lẩu thập cẩm của vũ trụ. Mọi chủ đề đều được thả vào.",
};

export function assertLevel(level) {
  if (!HUMOR_LEVELS.includes(level)) throw new Error(`Unknown humor level: ${level}`);
  return level;
}

export const rulesFor = (level) => rulesByLevel[assertLevel(level)];
export const mixedWelcomeFor = (level) => mixedWelcomes[assertLevel(level)];

// A theme without a variant for the level (an AI or saved theme) keeps the welcome it was written with
export function welcomeFor(theme, level) {
  assertLevel(level);
  if (level === "troll") return theme.welcome;
  return welcomes[theme.id]?.[level] ?? theme.welcome;
}

export const hasWelcomeVariants = (id) => Boolean(welcomes[id]?.nhe && welcomes[id]?.nham);

// What the bot really builds. Names are the bot's own output, so they stay Vietnamese in every language.

export type Channel = { name: string; voice?: boolean };
export type Category = { name: string; channels: Channel[] };

export const baseRoles = [
  "👑 Chủ Tịch (tự phong)",
  "🛡️ Mod Cầm Chổi",
  "🤖 Bot Nô Lệ",
  "🐣 Người Mới Chưa Biết Gì",
];

export const gamingRoles = [
  "🎮 Pro Gamer (tự xưng)",
  "🥔 Gánh Team Ngược",
  "💤 AFK Từ 2019",
  "📹 Streamer 0 View",
];

export const infoCategory: Category = {
  name: "📌 Khu Hành Chính",
  channels: [
    { name: "👋・sảnh-chờ-nhận-lương" },
    { name: "📜・luật-không-ai-đọc" },
    { name: "🎭・xin-role-xin-lộc" },
    { name: "📢・thông-báo-quan-trọng" },
  ],
};

export const djCategory: Category = {
  name: "🎧 Phòng Thu Âm Dở Hơi",
  channels: [
    { name: "🎛️・dj-booth" },
    { name: "🎵 Nhạc Cho Đỡ Buồn", voice: true },
    { name: "🎤 Karaoke Tone Điếc", voice: true },
    { name: "🗣️・chém-gió-bằng-giọng" },
    { name: "🔊 Phòng Đọc Chữ Thành Tiếng", voice: true },
  ],
};

export const staffCategory: Category = {
  name: "🔒 Hậu Trường Của Mod",
  channels: [
    { name: "🕵️・mod-bàn-chuyện" },
    { name: "📋・nhật-ký-phạt" },
    { name: "☕ Phòng Họp Mod", voice: true },
  ],
};

export const themeCategories: Record<string, Category[]> = {
  gaming: [
    {
      name: "🎮 Khu Cày Game",
      channels: [
        { name: "💬・chém-gió-tổng-hợp" },
        { name: "🔍・tìm-team-lfg" },
        { name: "😭・khóc-lóc-sau-trận" },
        { name: "🔥 Phòng Rage Quit", voice: true },
      ],
    },
  ],
  "hoc-tap": [
    {
      name: "📖 Khu Học Tập",
      channels: [
        { name: "❓・hỏi-bài" },
        { name: "⏰・deadline-sắp-cháy" },
        { name: "📝・chia-sẻ-tài-liệu" },
        { name: "😱 Phòng Ôn Đêm Trước Thi", voice: true },
      ],
    },
  ],
  "cong-dong": [
    {
      name: "💬 Khu Tám Chuyện",
      channels: [
        { name: "💬・chém-gió-tổng-hợp" },
        { name: "📸・khoe-ảnh-khoe-đồ" },
        { name: "🎉・sự-kiện-sắp-tới" },
        { name: "🗣️ Phòng Tám Chung", voice: true },
      ],
    },
  ],
  "chill-ban-be": [
    {
      name: "🏠 Nhà Chung",
      channels: [
        { name: "💬・nhà-chung" },
        { name: "📸・ảnh-xấu-của-nhau" },
        { name: "🗓️・kế-hoạch-đi-chơi" },
        { name: "🌙 Phòng Tâm Sự Đêm Khuya", voice: true },
      ],
    },
  ],
};

export const themeRoles: Record<string, string[]> = {
  gaming: gamingRoles,
  "hoc-tap": ["📚 Học Bá (có chứng nhận từ mẹ)", "🔥 Chiến Thần Deadline", "📋 Thợ Chép Bài", "😴 Ngủ Gật Trong Lớp"],
  "cong-dong": ["💎 VIP (chưa ai biết vì sao)", "👻 Thành Viên Tàng Hình", "🗣️ Cây Chém Gió", "🎨 Hoạ Sĩ Tay Run"],
  "chill-ban-be": ["💖 Bạn Thân Cứng", "📷 Thợ Chụp Ảnh Xấu Bạn", "🍜 Hội Ăn Uống", "🦉 Cú Đêm 3 Giờ Sáng"],
};

export const themeIds = ["gaming", "hoc-tap", "cong-dong", "chill-ban-be"] as const;

export const sampleRules = [
  "Cấm spam. Gửi 47 tin nhắn liên tiếp không làm bạn nói đúng hơn, chỉ làm bạn bị mute nhanh hơn.",
  "Không quảng cáo, không bán khoá học 'làm giàu trong 3 ngày'. Nếu thật sự làm giàu được thì bạn đã không ngồi đây.",
  "Mod luôn đúng. Nếu mod sai, xem lại điều 1 của luật này.",
  "Đọc hết luật rồi mà vẫn vi phạm thì bạn không ngu, bạn chỉ đang thử bản lĩnh của mod.",
];

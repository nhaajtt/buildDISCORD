// Parts every server gets, whatever the theme. Themes only add what is specific to them.

export const baseRoles = [
  { key: "boss", name: "👑 Chủ Tịch (tự phong)", color: 0xf5c518, hoist: true },
  { key: "mod", name: "🛡️ Mod Cầm Chổi", color: 0xe74c3c, hoist: true, perms: ["ManageMessages", "ModerateMembers", "KickMembers"] },
  { key: "bot", name: "🤖 Bot Nô Lệ", color: 0x95a5a6, hoist: true },
  { key: "newbie", name: "🐣 Người Mới Chưa Biết Gì", color: 0x2ecc71 },
];

export const baseRules = [
  "Tôn trọng nhau. Muốn cãi thì cãi chuyện, đừng cãi người. Muốn cãi người thì ra kênh #tranh-cãi.",
  "Cấm spam. Gửi 47 tin nhắn liên tiếp không làm bạn nói đúng hơn, chỉ làm bạn bị mute nhanh hơn.",
  "Không quảng cáo, không bán khoá học 'làm giàu trong 3 ngày'. Nếu thật sự làm giàu được thì bạn đã không ngồi đây.",
  "Không NSFW. Đây là server văn minh, chỗ nào cũng có mod cầm chổi.",
  "Meme được phép, meme dở được thương, meme cũ được kính trọng.",
  "Mod luôn đúng. Nếu mod sai, xem lại điều 1 của luật này.",
  "Cấm ping @everyone khi chưa có việc gì to hơn 'ai ăn cơm chưa'.",
  "Đọc hết luật rồi mà vẫn vi phạm thì bạn không ngu, bạn chỉ đang thử bản lĩnh của mod.",
];

// kind marks channels the builder fills with content: rules, welcome, roles, dj, tts.
// modlog and alerts are tags only: the builder reports which channel carries them so the setup wizard can point log settings there.
export const infoCategory = {
  name: "📌 Khu Hành Chính",
  channels: [
    { kind: "welcome", name: "👋・sảnh-chờ-nhận-lương", type: "text", topic: "Chào mừng người mới. Vào đây là hết đường lui.", readonly: true },
    { kind: "rules", name: "📜・luật-không-ai-đọc", type: "text", topic: "Luật server. Đọc 30 giây, tiết kiệm 3 tiếng bị mod nhắc.", readonly: true },
    { kind: "roles", name: "🎭・xin-role-xin-lộc", type: "text", topic: "Bấm nút để lấy role. Không có role nào làm bạn giàu hơn.", readonly: true },
    { name: "📢・thông-báo-quan-trọng", type: "text", topic: "Thông báo thật sự. Hầu hết là về việc bảo trì server.", readonly: true },
  ],
};

export const djCategory = {
  name: "🎧 Phòng Thu Âm Dở Hơi",
  channels: [
    { kind: "dj", name: "🎛️・dj-booth", type: "text", topic: "Mời bot nhạc ở đây. Không có nhạc thì server là cái chợ chiều." },
    { name: "🎵 Nhạc Cho Đỡ Buồn", type: "voice" },
    { name: "🎤 Karaoke Tone Điếc", type: "voice" },
    { kind: "tts", name: "🗣️・chém-gió-bằng-giọng", type: "text", topic: "Gõ chữ, bot đọc thành tiếng. Cho người ngại mở mic và người ngại nói thật." },
    { name: "🔊 Phòng Đọc Chữ Thành Tiếng", type: "voice" },
  ],
};

export const staffCategory = {
  name: "🔒 Hậu Trường Của Mod",
  staff: true,
  channels: [
    { kind: "alerts", name: "🕵️・mod-bàn-chuyện", type: "text", topic: "Nơi mod nói xấu thành viên một cách có tổ chức." },
    { kind: "modlog", name: "📋・nhật-ký-phạt", type: "text", topic: "Ghi lại ai bị phạt vì cái gì. Đọc để cười." },
    { name: "☕ Phòng Họp Mod", type: "voice" },
  ],
};

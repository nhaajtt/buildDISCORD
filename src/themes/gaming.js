export default {
  id: "gaming",
  label: "Game Thủ Cày Đêm",
  blurb: "Cho hội cày game: kênh LFG, kênh khoe clip, kênh than thở vì thua.",
  welcome: "Chào {user}! Server này cày game cả đêm, ngủ là chuyện của tương lai. Nhớ đọc luật rồi hãy rage quit.",
  roles: [
    { key: "pro", name: "🎮 Pro Gamer (tự xưng)", color: 0x9b59b6, pick: true },
    { key: "noob", name: "🥔 Gánh Team Ngược", color: 0xe67e22, pick: true },
    { key: "afk", name: "💤 AFK Từ 2019", color: 0x7f8c8d, pick: true },
    { key: "streamer", name: "📹 Streamer 0 View", color: 0x3498db, pick: true },
  ],
  extraRules: [
    "Thua thì đổ cho lag, không đổ cho đồng đội. Đồng đội cũng đang đổ cho lag.",
    "Không tố cáo người khác dùng hack khi chính bạn vừa bị bắn từ phía sau.",
  ],
  categories: [
    {
      name: "🎮 Khu Cày Game",
      channels: [
        { name: "💬・chém-gió-tổng-hợp", type: "text", topic: "Nói chuyện gì cũng được, miễn là không phải chuyện học." },
        { name: "🔍・tìm-team-lfg", type: "text", topic: "Cần team? Ghi rank thật, đừng ghi rank mơ ước." },
        { name: "🎬・khoe-clip-pha-xử-lý", type: "text", topic: "Khoe clip hay. Clip dở thì gửi vào #khóc-lóc-sau-trận." },
        { name: "😭・khóc-lóc-sau-trận", type: "text", topic: "Nơi xả stress sau khi thua 7 trận liên tiếp." },
        { name: "🎲 Phòng Game 1", type: "voice" },
        { name: "🎲 Phòng Game 2", type: "voice" },
        { name: "🔥 Phòng Rage Quit", type: "voice" },
      ],
    },
    {
      name: "🍕 Khu Giải Trí",
      channels: [
        { name: "🐸・meme-tươi-mới", type: "text", topic: "Meme còn nóng, vừa lấy từ lò." },
        { name: "🍜・ăn-gì-hôm-nay", type: "text", topic: "Câu hỏi triệu đô. Câu trả lời luôn là mì tôm." },
        { name: "🥊・tranh-cãi", type: "text", topic: "Cãi nhau có văn hoá. Mod đang xem bằng bỏng ngô." },
      ],
    },
  ],
};

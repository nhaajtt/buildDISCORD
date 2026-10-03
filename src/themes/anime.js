export default {
  id: "anime",
  label: "Hội Mê Anime",
  blurb: "Cho hội cày anime và manga: gợi ý phim, review, spoiler có rào chắn, fanart và cãi nhau về waifu.",
  welcome: "Chào {user}! Vào hội mê anime là phải chịu trách nhiệm với cái danh sách 'sẽ xem sau' dài như sớ.",
  roles: [
    { key: "an-otaku", name: "🍥 Otaku Chính Hiệu", color: 0xff6b9d, pick: true },
    { key: "an-manga", name: "📚 Mọt Manga", color: 0x6c5ce7, pick: true },
    { key: "an-cosplay", name: "🎭 Cosplayer Gương Mặt Vàng", color: 0xfdcb6e, pick: true },
    { key: "an-cry", name: "😭 Vừa Khóc Vì Tập Cuối", color: 0x74b9ff, pick: true },
  ],
  extraRules: [
    "Spoiler chỉ được nói ở kênh spoiler. Spoil ở chỗ khác là kẻ thù cả đời.",
    "Chưa xem hết ba tập thì đừng phán 'anime này dở'. Có bằng chứng thì cứ phán.",
  ],
  categories: [
    {
      name: "🍥 Thế Giới Anime",
      channels: [
        { name: "💬・chém-anime", type: "text", topic: "Nói chuyện anime thoải mái, miễn là không spoil." },
        { name: "🔥・anime-mùa-này", type: "text", topic: "Đang chiếu gì, đáng xem hay đáng bỏ." },
        { name: "⭐・review-chấm-điểm", type: "text", topic: "Review có điểm số và lý do. 'Hay lắm' không phải review." },
        { name: "🚨・spoiler-cẩn-thận", type: "text", topic: "Chỉ nơi này mới được spoil. Vào đây là tự chịu trách nhiệm." },
        { name: "🎨・fanart-khoe-tranh", type: "text", topic: "Khoe tranh tự vẽ hay sưu tầm. Nhớ ghi nguồn hoạ sĩ." },
        { name: "💞・đua-waifu-husbando", type: "text", topic: "Cãi nhau vì nhân vật yêu thích, có văn hoá. Mod đang xem bằng bỏng ngô." },
        { name: "📺 Phòng Xem Chung", type: "voice" },
        { name: "🎤 Phòng Karaoke Opening", type: "voice" },
      ],
    },
  ],
};

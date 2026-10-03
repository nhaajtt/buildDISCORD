export default {
  id: "creator",
  label: "Studio Content Creator",
  blurb: "Cho streamer, YouTuber, TikToker: ý tưởng, feedback video, lịch livestream, tìm collab và số liệu thật.",
  welcome: "Chào {user}! Studio này đủ ánh sáng, đủ micro, chỉ thiếu mỗi view. Cùng nhau lo vụ đó.",
  roles: [
    { key: "cr-rising", name: "🎬 Creator Mới Nổi", color: 0xff7675, pick: true },
    { key: "cr-live", name: "📹 Đang Livestream", color: 0xd63031, pick: true },
    { key: "cr-edit", name: "✂️ Thợ Dựng Phim", color: 0x00cec9, pick: true },
    { key: "cr-viral", name: "📈 Đang Chờ Viral", color: 0xfdcb6e, pick: true },
  ],
  extraRules: [
    "Feedback phải nêu được điểm hay và điểm cần sửa. 'Hay đấy' là xã giao, không phải feedback.",
    "Xin sub, xin follow chỉ ở kênh tìm collab. Spam link là bị tắt sóng.",
  ],
  categories: [
    {
      name: "🎬 Phòng Thu",
      channels: [
        { name: "💡・ý-tưởng-content", type: "text", topic: "Ném ý tưởng vào đây. Ý nào hay thì có người làm, ý nào dở thì có người cười." },
        { name: "🎞️・feedback-video", type: "text", topic: "Gửi video và nói rõ bạn muốn góp ý phần nào." },
        { name: "📺・lịch-livestream", type: "text", topic: "Báo lịch live để cả hội vào ủng hộ. Live xong nhớ xoá bài." },
        { name: "🤝・tìm-collab", type: "text", topic: "Tìm người làm chung. Ghi rõ kênh của bạn, chủ đề, và bạn cần gì." },
        { name: "📈・chia-sẻ-số-liệu", type: "text", topic: "Khoe số liệu thật. View ảo thì tự biết." },
        { name: "🎙️ Phòng Thu Âm", type: "voice" },
        { name: "📡 Phòng Live Thử", type: "voice" },
      ],
    },
  ],
};

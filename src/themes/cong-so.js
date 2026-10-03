export default {
  id: "cong-so",
  label: "Văn Phòng Một Nhà",
  blurb: "Cho team công ty hoặc nhóm dự án: thông báo, việc hôm nay, deadline và chuyện tám giờ nghỉ trưa.",
  welcome: "Chào {user}! Chào mừng đến văn phòng ảo: không phải đi làm sớm, nhưng deadline vẫn đến đúng giờ.",
  roles: [
    { key: "cs-coffee", name: "☕ Hội Cà Phê Sáng", color: 0x8d6e63, pick: true },
    { key: "cs-meeting", name: "📎 Chuyên Gia Họp Online", color: 0x3498db, pick: true },
    { key: "cs-deadline", name: "🏃 Đang Chạy Deadline", color: 0xe74c3c, pick: true },
    { key: "cs-busy", name: "🙈 Đang Giả Vờ Bận", color: 0x95a5a6, pick: true },
  ],
  extraRules: [
    "Việc quan trọng viết ra kênh chung, đừng nhắn riêng. Nhắn riêng thì mai ai cũng quên.",
    "Họp xong ghi kết luận vào kênh việc hôm nay, đừng để mọi người họp lại cuộc họp về cuộc họp.",
  ],
  categories: [
    {
      name: "🏢 Văn Phòng",
      channels: [
        { name: "📢・thông-báo-công-ty", type: "text", topic: "Thông báo chính thức. Chỉ đọc, đừng cãi ở đây.", readonly: true },
        { name: "📌・việc-hôm-nay", type: "text", topic: "Ai làm gì, đến khi nào. Ghi rõ tên người, đừng ghi 'mọi người'." },
        { name: "⏰・deadline-sát-nút", type: "text", topic: "Việc sắp đến hạn. Nhắc nhau trước khi quá muộn." },
        { name: "🧠・ý-tưởng-họp-nhóm", type: "text", topic: "Ý tưởng cho cuộc họp tới. Ghi sẵn thì họp sẽ ngắn hơn." },
        { name: "☕・tám-giờ-nghỉ-trưa", type: "text", topic: "Chuyện ngoài công việc. Ăn gì, đi đâu, phim nào." },
        { name: "🎂・sinh-nhật-đồng-nghiệp", type: "text", topic: "Chúc mừng sinh nhật. Bánh thì chỉ gửi trong tưởng tượng." },
        { name: "🧑‍💼 Phòng Họp 1", type: "voice" },
        { name: "🧑‍💼 Phòng Họp 2", type: "voice" },
        { name: "☕ Phòng Pha Cà Phê", type: "voice" },
      ],
    },
  ],
};

export default {
  id: "hoc-tap",
  label: "Học Mà Như Không Học",
  blurb: "Cho hội học nhóm: kênh hỏi bài, kênh deadline, kênh drama trước kỳ thi.",
  welcome: "Chào {user}! Server học tập, nghĩa là có người học thật, có người chỉ vào để ở cạnh người học thật.",
  roles: [
    { key: "topper", name: "📚 Học Bá (có chứng nhận từ mẹ)", color: 0x1abc9c, pick: true },
    { key: "deadline", name: "🔥 Chiến Thần Deadline", color: 0xe74c3c, pick: true },
    { key: "copy", name: "📋 Thợ Chép Bài", color: 0xf39c12, pick: true },
    { key: "sleepy", name: "😴 Ngủ Gật Trong Lớp", color: 0x95a5a6, pick: true },
  ],
  extraRules: [
    "Hỏi bài thì ghi rõ bài nào. 'Giúp mình với' không phải câu hỏi, đó là lời cầu nguyện.",
    "Chép bài thì chép có tâm, đừng chép luôn cả cái tên người ta.",
  ],
  categories: [
    {
      name: "📖 Khu Học Tập",
      channels: [
        { name: "💬・trà-đá-giữa-giờ", type: "text", topic: "Nói chuyện linh tinh giữa các giờ học." },
        { name: "❓・hỏi-bài", type: "text", topic: "Hỏi bài. Ghi đề đầy đủ, đừng gửi ảnh mờ như UFO." },
        { name: "⏰・deadline-sắp-cháy", type: "text", topic: "Báo deadline để cả nhà cùng hoảng." },
        { name: "📝・chia-sẻ-tài-liệu", type: "text", topic: "Tài liệu thật, không phải 14 file tên 'final_final_v3'." },
        { name: "📚 Phòng Học Nhóm", type: "voice" },
        { name: "🤫 Phòng Học Im Lặng", type: "voice" },
        { name: "😱 Phòng Ôn Đêm Trước Thi", type: "voice" },
      ],
    },
    {
      name: "☕ Khu Xả Stress",
      channels: [
        { name: "🐸・meme-học-đường", type: "text", topic: "Meme về thầy cô, bài tập và nỗi đau chung." },
        { name: "🍜・ăn-gì-cho-tỉnh", type: "text", topic: "Cà phê hay trà đá? Câu hỏi muôn thuở của sinh viên." },
        { name: "🥊・tranh-cãi", type: "text", topic: "Cãi nhau xem đáp án bài 3 là A hay B. Spoiler: là C." },
      ],
    },
  ],
};

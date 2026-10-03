export default {
  id: "cong-dong",
  label: "Cộng Đồng Tạp Hoá",
  blurb: "Cho mọi loại cộng đồng: chat, ảnh, chia sẻ, sự kiện, đủ thứ lặt vặt.",
  welcome: "Chào {user}! Đây là cộng đồng tạp hoá: cái gì cũng có một chút, cái gì cũng chưa chắc có.",
  roles: [
    { key: "vip", name: "💎 VIP (chưa ai biết vì sao)", color: 0x3498db, pick: true },
    { key: "lurker", name: "👻 Thành Viên Tàng Hình", color: 0x7f8c8d, pick: true },
    { key: "chatty", name: "🗣️ Cây Chém Gió", color: 0xe67e22, pick: true },
    { key: "artist", name: "🎨 Hoạ Sĩ Tay Run", color: 0x9b59b6, pick: true },
  ],
  extraRules: [
    "Đăng sự kiện thì ghi rõ giờ và nơi. 'Tối nay đi chơi' không phải sự kiện, đó là hy vọng.",
    "Có chuyện drama thì kể có đầu có đuôi, đừng 'ai biết thì biết'.",
  ],
  categories: [
    {
      name: "💬 Khu Tám Chuyện",
      channels: [
        { name: "💬・chém-gió-tổng-hợp", type: "text", topic: "Nói gì cũng được, trừ những điều trong luật." },
        { name: "📸・khoe-ảnh-khoe-đồ", type: "text", topic: "Khoe ảnh, khoe đồ ăn, khoe thú cưng. Khoe người yêu thì nhớ xin phép." },
        { name: "🎉・sự-kiện-sắp-tới", type: "text", topic: "Lịch sự kiện. Hầu hết bị dời lịch." },
        { name: "🗣️ Phòng Tám Chung", type: "voice" },
        { name: "🗣️ Phòng Tám Riêng", type: "voice" },
      ],
    },
    {
      name: "🎪 Khu Giải Trí",
      channels: [
        { name: "🐸・meme-tươi-mới", type: "text", topic: "Meme còn nóng, vừa lấy từ lò." },
        { name: "🍜・ăn-gì-hôm-nay", type: "text", topic: "Câu hỏi triệu đô. Câu trả lời luôn là mì tôm." },
        { name: "💡・góp-ý-cho-server", type: "text", topic: "Góp ý nhẹ nhàng. Mod đọc hết, chỉ là chưa chắc làm." },
        { name: "🥊・tranh-cãi", type: "text", topic: "Cãi nhau có văn hoá. Mod đang xem bằng bỏng ngô." },
      ],
    },
  ],
};

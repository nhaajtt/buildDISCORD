export default {
  id: "chill-ban-be",
  label: "Chill Cùng Hội Bạn",
  blurb: "Cho nhóm bạn thân: nhỏ, ấm, ồn ào và đầy chuyện không ai muốn nhớ.",
  welcome: "Chào {user}! Vào hội bạn thân là có bằng chứng đen tối của nhau. Chào mừng gia nhập gia đình.",
  roles: [
    { key: "bestie", name: "💖 Bạn Thân Cứng", color: 0xe91e63, pick: true },
    { key: "photographer", name: "📷 Thợ Chụp Ảnh Xấu Bạn", color: 0x3498db, pick: true },
    { key: "foodie", name: "🍜 Hội Ăn Uống", color: 0xf39c12, pick: true },
    { key: "nightowl", name: "🦉 Cú Đêm 3 Giờ Sáng", color: 0x34495e, pick: true },
  ],
  extraRules: [
    "Ảnh xấu của bạn bè được lưu trữ vĩnh viễn. Không có quyền xoá.",
    "Hẹn đi chơi thì phải đi. 'Để xem' nghĩa là không, và cả nhóm đều biết.",
  ],
  categories: [
    {
      name: "🏠 Nhà Chung",
      channels: [
        { name: "💬・nhà-chung", type: "text", topic: "Chuyện lớn chuyện nhỏ, chuyện thật chuyện bịa." },
        { name: "📸・ảnh-xấu-của-nhau", type: "text", topic: "Kho lưu trữ ảnh xấu. Chỉ thêm, không xoá." },
        { name: "🍜・hôm-nay-ăn-gì", type: "text", topic: "Không bao giờ chốt được." },
        { name: "🗓️・kế-hoạch-đi-chơi", type: "text", topic: "Kế hoạch đẹp, tỉ lệ thực hiện thấp." },
        { name: "🛋️ Phòng Khách", type: "voice" },
        { name: "🌙 Phòng Tâm Sự Đêm Khuya", type: "voice" },
        { name: "🎮 Phòng Chơi Game", type: "voice" },
      ],
    },
    {
      name: "🎭 Khu Vui Chơi",
      channels: [
        { name: "🐸・meme-nội-bộ", type: "text", topic: "Meme chỉ hội mình hiểu." },
        { name: "🥊・tranh-cãi", type: "text", topic: "Cãi nhau xong thì ra ăn, không giận quá 5 phút." },
      ],
    },
  ],
};

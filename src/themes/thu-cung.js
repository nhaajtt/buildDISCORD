export default {
  id: "thu-cung",
  label: "Hội Yêu Thú Cưng",
  blurb: "Cho người nuôi chó mèo: khoe boss, hỏi cách chăm, tìm nhà cho bé và chuyện nhà các sen.",
  welcome: "Chào {user}! Vào hội thú cưng là biết thân biết phận: ở đây bạn là sen, và boss mới là chủ.",
  roles: [
    { key: "tc-dog", name: "🐶 Sen Của Chó", color: 0xe67e22, pick: true },
    { key: "tc-cat", name: "🐱 Sen Của Mèo", color: 0x9b59b6, pick: true },
    { key: "tc-small", name: "🐹 Hội Thú Nhỏ", color: 0x1abc9c, pick: true },
    { key: "tc-wish", name: "🐾 Chưa Có Boss Nhưng Muốn", color: 0xf1c40f, pick: true },
  ],
  extraRules: [
    "Hỏi sức khoẻ thú cưng chỉ để tham khảo. Bệnh nặng thì đi bác sĩ thú y, đừng hỏi Discord.",
    "Không mua bán chó mèo, không quảng cáo bán động vật. Tìm nhà cho bé thì chỉ ở kênh tìm nhà và không thu tiền.",
  ],
  categories: [
    {
      name: "🐾 Nhà Của Boss",
      channels: [
        { name: "📸・khoe-boss", type: "text", topic: "Khoe ảnh và video boss nhà bạn. Boss nhà người khác cũng đáng yêu, nhớ thả tim." },
        { name: "🩺・hỏi-chăm-sóc", type: "text", topic: "Hỏi cách chăm sóc, ăn uống, huấn luyện. Bệnh nặng thì đi thú y." },
        { name: "🏠・tìm-nhà-cho-bé", type: "text", topic: "Tìm nhà cho bé cần được nhận nuôi. Không thu tiền, không bán." },
        { name: "🍖・đồ-ăn-đồ-chơi", type: "text", topic: "Review đồ ăn, đồ chơi, phụ kiện. Ghi rõ boss nhà bạn có chịu dùng không." },
        { name: "😹・chuyện-nhà-các-sen", type: "text", topic: "Kể những chuyện boss làm bạn đứng hình." },
        { name: "🐾 Phòng Cho Boss Lên Sóng", type: "voice" },
        { name: "🛋️ Phòng Sen Tâm Sự", type: "voice" },
      ],
    },
  ],
};

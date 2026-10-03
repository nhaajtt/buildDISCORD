// A server where people book a friend to play a game with or to talk to. The role that vouches for a player (verified, top rated, regular)
// is handed out by staff, never self-assigned, so those roles are not "pick" roles.
export default {
  id: "booking",
  label: "Booking Bạn Chơi",
  blurb: "Cho server thuê bạn chơi game hoặc tâm sự: hướng dẫn đặt lịch, bảng giá, hồ sơ player, feedback và chống lừa đảo.",
  welcome: "Chào {user}! Đây là chợ booking: muốn có bạn chơi cùng thì đặt lịch, muốn có người nghe than thì đặt thêm giờ. Nhớ đọc luật trước khi chuyển tiền nhé.",
  roles: [
    { key: "bk-verified", name: "✅ Player Đã Xác Minh", color: 0x2ecc71, hoist: true },
    { key: "bk-top", name: "🌟 Player Được Yêu Thích", color: 0xf1c40f, hoist: true },
    { key: "bk-regular", name: "💎 Khách Quen Của Tiệm", color: 0x3498db },
    { key: "bk-booker", name: "🎧 Đang Tìm Bạn Chơi", color: 0x9b59b6, pick: true },
    { key: "bk-listener", name: "🗣️ Cần Người Tâm Sự", color: 0xe91e63, pick: true },
    { key: "bk-notify", name: "🔔 Báo Khi Có Lịch Trống", color: 0xe67e22, pick: true },
  ],
  extraRules: [
    "Chỉ giao dịch qua kênh chính thức và có staff xác nhận. Không đưa hay xin thông tin cá nhân (địa chỉ, số điện thoại, giấy tờ): chơi game cần tài khoản, không cần CCCD.",
    "Chỉ nhận người đủ 18 tuổi trở lên làm player hoặc khách đặt lịch. Đặt lịch thì đến đúng giờ, huỷ thì báo trước, 'quên mất' không phải lý do.",
  ],
  categories: [
    {
      name: "📋 Quầy Lễ Tân",
      channels: [
        { name: "📖・hướng-dẫn-đặt-lịch", type: "text", topic: "Đặt lịch trong vài bước. Đọc xong mới được hỏi 'làm sao để book'.", readonly: true },
        { name: "💵・bảng-giá", type: "text", topic: "Giá niêm yết theo giờ của từng player. Trả giá thì ra chợ, ở đây không mặc cả.", readonly: true },
        { name: "🛡️・chống-lừa-đảo", type: "text", topic: "Cách nhận biết người lừa đảo và nơi báo cáo. Chỉ giao dịch ở kênh chính thức.", readonly: true },
        { name: "🧾・xác-nhận-giao-dịch", type: "text", topic: "Gửi bằng chứng giao dịch để staff xác nhận. Chưa xác nhận thì coi như chưa tính." },
      ],
    },
    {
      name: "🎮 Danh Sách Player",
      channels: [
        { name: "🧑‍🎤・hồ-sơ-player", type: "text", topic: "Mỗi player một bài giới thiệu: game chơi, giờ rảnh, giá, kiểu nói chuyện. Không đăng ảnh của người khác." },
        { name: "📅・lịch-trống-hôm-nay", type: "text", topic: "Player báo giờ rảnh trong ngày. Hết giờ nhớ xoá, đừng để khách chờ hụt." },
        { name: "🔍・khách-tìm-player", type: "text", topic: "Khách nói game, khung giờ và ngân sách. Player nào hợp thì nhắn." },
      ],
    },
    {
      name: "🎧 Phòng Chơi Cùng",
      channels: [
        { name: "🎮 Phòng Chơi Cùng 1", type: "voice" },
        { name: "🎮 Phòng Chơi Cùng 2", type: "voice" },
        { name: "🗣️ Phòng Tâm Sự", type: "voice" },
        { name: "👀 Phòng Chờ Khách", type: "voice" },
      ],
    },
    {
      name: "⭐ Uy Tín Là Vàng",
      channels: [
        { name: "⭐・feedback-sau-ca", type: "text", topic: "Chơi xong để lại đánh giá. Khen thì khen thật, chê thì chê có lý do." },
        { name: "🏆・bảng-vàng-player", type: "text", topic: "Vinh danh những player được khách nhớ lâu nhất tháng." },
        { name: "🆘・hỗ-trợ-khiếu-nại", type: "text", topic: "Có tranh chấp thì kể rõ ở đây. Staff xử lý theo bằng chứng, không theo cảm xúc." },
      ],
    },
  ],
};

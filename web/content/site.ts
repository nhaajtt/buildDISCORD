// Public links used across the site. The invite link only holds the application ID, which is public by design.
export const CLIENT_ID = "1555773920815087656";

export const INVITE_URL =
  process.env.NEXT_PUBLIC_INVITE_URL ||
  `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&scope=bot%20applications.commands&permissions=8`;

export const REPO_URL = "https://github.com/nhaajtt/buildDISCORD";

export const INSTAGRAM_URL = "https://www.instagram.com/nhaajt_hehee/";
export const PERSONAL_URL = "https://www.nhaajt.com/";

// Where a customer asks for an activation code
export const CONTACT_URL = process.env.NEXT_PUBLIC_CONTACT_URL || INSTAGRAM_URL;

// A real answer from one run of the AI designer (trimmed), shown as an example on the page
export const aiSample = {
  label: "Tổ Đội Bắn Trượt",
  welcome: "Gáy lên nào {user}, vào đây gánh tụi tao tạ Valorant tối thứ Bảy đi chứ chuỗi thua 10 trận rồi nè!",
  roles: ["Chiến Thần Đáy Sắt", "Bậc Thầy Bán Máu", "Chuyên Gia Đổ Thừa", "Học Lại Đại Cương"],
  categories: [
    { name: "💬・Khu Vực Phét Lác", channels: ["📸・anh-dim-hoi-nhom", "🎙️ Trà Chanh Chém Gió", "🎙️ Góc Than Thở Deadline"] },
    { name: "🎮・Đấu Trường Gà Con", channels: ["🎯・goc-trash-talk", "🎙️ Tổ Đội Gánh Tạ Valorant", "🎙️ Phòng Khóc Thuê Trừ Điểm"] },
    { name: "📚・Hội Học Lại Đóng Học Phí", channels: ["📝・xin-tai-lieu-on-thi", "🎙️ Giả Vờ Học Nhóm"] },
  ],
  rule: "Bắn hụt thì đổ tại ping hoặc chuột dỏm, cấm nhận do tay run.",
};

export default {
  id: "dev-code",
  label: "Hội Code Dạo",
  blurb: "Cho dân lập trình: hỏi bug, khoe project, review code, tìm việc và than về lần deploy chiều thứ Sáu.",
  welcome: "Chào {user}! Vào hội code dạo là chấp nhận một sự thật: bug không biến mất, nó chỉ chuyển sang người khác.",
  roles: [
    { key: "dv-senior", name: "💻 Dev Cấp Cao (tự xưng)", color: 0x00b894, pick: true },
    { key: "dv-bug", name: "🐛 Thợ Săn Bug", color: 0xe17055, pick: true },
    { key: "dv-coffee", name: "☕ Chạy Bằng Cà Phê", color: 0x8d6e63, pick: true },
    { key: "dv-loop", name: "🔁 Sửa Bug Đẻ Ra Bug", color: 0x0984e3, pick: true },
  ],
  extraRules: [
    "Hỏi bug phải kèm code và thông báo lỗi. 'Không chạy được' không phải báo cáo lỗi, đó là cảm xúc.",
    "Cãi nhau tab hay space không quá ba tin nhắn. Vượt quá thì mod sẽ chọn space.",
  ],
  categories: [
    {
      name: "💻 Khu Làm Việc",
      channels: [
        { name: "🆘・hỏi-bug-xin-giúp", type: "text", topic: "Ghi rõ lỗi, đoạn code, và bạn đã thử những gì. Chụp màn hình bằng điện thoại thì mời suy nghĩ lại." },
        { name: "🚀・khoe-project", type: "text", topic: "Khoe sản phẩm của bạn, kèm link và một câu nói nó giải quyết gì." },
        { name: "🔍・review-code", type: "text", topic: "Nhờ người khác đọc code. Chê thì chê code, đừng chê người." },
        { name: "📚・tài-liệu-học", type: "text", topic: "Khoá học, sách, bài viết hay. Link chết thì nhớ báo." },
        { name: "💼・việc-làm-freelance", type: "text", topic: "Đăng việc và tìm việc. Ghi rõ mức lương, đừng ghi 'thoả thuận' rồi biến mất." },
        { name: "😭・deploy-chiều-thứ-sáu", type: "text", topic: "Nơi tưởng niệm những lần deploy lúc 5 giờ chiều thứ Sáu." },
        { name: "🧑‍💻 Phòng Cày Code", type: "voice" },
        { name: "🦆 Phòng Nói Chuyện Với Vịt", type: "voice" },
      ],
    },
  ],
};

import type { Dict } from "./types";

const vi: Dict = {
  lang: "vi",
  meta: {
    title: "Thầu Xây Dựng, bot Discord dựng cả server trong một lệnh",
    description:
      "Mời Thầu Xây Dựng vào server trống, gõ /build, vài phút sau có đủ kênh, role, luật và lời chào. Mọi thứ đều hài hước.",
  },
  nav: { how: "Cách xây", themes: "Bản vẽ", commands: "Lệnh", faq: "Hỏi đáp", cta: "Mời thầu vào server", switchTo: "EN", switchHref: "/en", theme: "Đổi giao diện sáng tối", home: "Về đầu trang" },
  hero: {
    title: "Server trống như ví cuối tháng.",
    sub: "Mời Thầu Xây Dựng vào, gõ /build. Vài phút sau server có đủ kênh, role, luật và vài lời chửi yêu, chưa kịp nghiệm thu nhưng cứ dùng đi.",
    cta: "Mời thầu vào server",
    secondary: "Xem công trình thi công",
    commandLabel: "Bản vẽ đang chờ lệnh",
    empty: "Chưa có kênh nào. Chưa có luật nào. Chưa có ai để cãi nhau.",
  },
  scene: {
    title: "Từ nền đất trống đến server hoàn chỉnh.",
    steps: [
      { t: "Gọi thầu", d: "Admin gõ /build và chọn một theme. Thầu gửi bản vẽ để duyệt trước, chưa đụng gì vào server." },
      { t: "Đổ móng role", d: "Chủ Tịch, Mod, Bot Nô Lệ và vài role xin về cho vui, mỗi role một cái tên không ai dám nhận là mình đặt." },
      { t: "Dựng kênh", d: "Danh mục, kênh chat, phòng voice, kênh của mod chỉ mod thấy. Kênh thông báo và luật khoá sẵn, người thường chỉ đọc." },
      { t: "Dán luật", d: "Luật, lời chào và bảng bấm nút xin role được đăng vào đúng kênh. Phòng DJ và phòng đọc chữ thành tiếng có sẵn nút mời bot." },
      { t: "Nghiệm thu", d: "Xong. Chạy lại /build sẽ không tạo trùng, và /nuke dọn đúng những gì thầu đã xây." },
    ],
    cmd: "/build theme: Game Thủ Cày Đêm",
    roles: "Role",
    rules: "Luật server",
    stamp: "Nghiệm thu",
    done: "xong",
  },
  themes: {
    title: "Chọn một bản vẽ.",
    sub: "Bốn theme có sẵn. Phần chung (hành chính, phòng DJ, hậu trường mod) theme nào cũng có.",
    items: [
      { id: "gaming", label: "Game Thủ Cày Đêm", blurb: "Cho hội cày game: kênh tìm team, kênh khoe clip, kênh khóc lóc sau trận." },
      { id: "hoc-tap", label: "Học Mà Như Không Học", blurb: "Cho hội học nhóm: hỏi bài, deadline sắp cháy, phòng ôn đêm trước thi." },
      { id: "cong-dong", label: "Cộng Đồng Tạp Hoá", blurb: "Cho mọi loại cộng đồng: tám chuyện, khoe ảnh, sự kiện, đủ thứ lặt vặt." },
      { id: "chill-ban-be", label: "Chill Cùng Hội Bạn", blurb: "Cho nhóm bạn thân: kho ảnh xấu của nhau, kế hoạch đi chơi không bao giờ đi." },
    ],
    rolesLabel: "Role mẫu",
    channelsLabel: "Kênh riêng của theme",
    sharedLabel: "Phần chung",
    tablist: "Chọn theme",
  },
  rules: {
    title: "Luật không ai đọc, nhưng ai cũng bị nhắc.",
    sub: "Tám luật chung và hai luật riêng cho mỗi theme, đăng sẵn vào kênh luật. Vài điều mẫu:",
  },
  music: {
    title: "Còn nhạc và đọc chữ thành tiếng thì sao?",
    body: "Discord không cho bot tự mời bot khác vào server, chỉ người thật mới bấm được. Nên thầu làm điều thầu làm được: dựng sẵn phòng DJ, phòng karaoke, phòng đọc chữ thành tiếng, và đặt nút mời bot nhạc, bot TTS ngay trong kênh. Admin bấm một lần là có nhạc.",
    points: ["#dj-booth có nút mời bot nhạc", "#chém-gió-bằng-giọng có nút mời bot TTS", "Link bot do bạn cấu hình, thầu chỉ đặt nút vào"],
  },
  commands: {
    title: "Ba lệnh, không hơn.",
    items: [
      { name: "/build", args: "theme", d: "Dựng server theo một theme. Có bản vẽ xem trước và nút xác nhận. Chỉ admin gọi được." },
      { name: "/nuke", args: "", d: "Đập những gì thầu đã xây. Chỉ đụng kênh và role do bot tạo, có nút xác nhận." },
      { name: "/roast", args: "nguoi", d: "Roast nhẹ một thành viên cho vui. Không mod được, không mute được, chỉ mất lòng." },
    ],
  },
  faq: {
    title: "Hỏi đáp",
    items: [
      { q: "Bot cần quyền gì?", a: "Người gọi lệnh cần quyền Administrator. Bot cần quyền quản lý kênh, quản lý role và quản lý server. Cách dễ nhất là mời bot với quyền Administrator." },
      { q: "Thầu có xoá kênh sẵn có của tôi không?", a: "Không. /build chỉ thêm, kênh trùng tên bị bỏ qua. /nuke chỉ xoá những gì chính bot đã tạo." },
      { q: "Chạy /build hai lần có bị trùng không?", a: "Không. Phần đã có được bỏ qua, và nội dung như luật, lời chào không bị đăng lại." },
      { q: "Bot lưu gì về server của tôi?", a: "Chỉ ID các kênh và role mà bot đã tạo, để /nuke biết đập cái nào và nút xin role chỉ cấp đúng những role đó." },
      { q: "Sao không tự có nhạc luôn?", a: "Vì Discord cấm bot tự mời bot. Thầu đặt sẵn nút mời trong kênh DJ, bạn bấm một lần là xong." },
    ],
  },
  cta: {
    title: "Server của bạn đã chờ đủ lâu rồi.",
    steps: ["Mời Thầu Xây Dựng vào server (cấp quyền Administrator cho khỏe)", "Gõ /build, chọn theme, xem bản vẽ", "Bấm xây luôn, đi pha cà phê"],
    button: "Mời thầu vào server",
    note: "Đã có link mời bot thật thì nút này mới hoạt động. Chưa có thì nút sẽ cuộn về đây.",
    setupId: "cai-dat",
  },
  footer: {
    word: "XÂY XONG",
    privacy: "Quyền riêng tư",
    terms: "Điều khoản",
    line: "Dự án cá nhân, không liên kết với Discord. Công trình hài hước, bảo hành không có.",
  },
};

export default vi;

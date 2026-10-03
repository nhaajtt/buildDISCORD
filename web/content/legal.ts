export type Doc = { title: string; updated: string; back: string; sections: { h: string; p: string[] }[] };
type Pair = { vi: Doc; en: Doc };

const updated = { vi: "Cập nhật lần cuối: 03/10/2026", en: "Last updated: 3 October 2026" };

export const privacy: Pair = {
  vi: {
    title: "Quyền riêng tư",
    updated: updated.vi,
    back: "Về trang chủ",
    sections: [
      { h: "Bot lưu gì", p: ["Với mỗi server, bot lưu ID server, tên theme đã dùng, ID của các kênh, danh mục và role mà bot đã tạo, giấy phép đang dùng (gói, ngày hết hạn) và số lần dùng một số tính năng để tính hạn mức gói.", "Khi bạn dùng các tính năng khác, bot còn lưu: theme riêng đã lưu, bản sao lưu cấu trúc server (tên và quyền của role, kênh, danh mục, không có nội dung tin nhắn), lịch sự kiện định kỳ, và điểm, chuỗi điểm danh cùng ngày điểm danh gần nhất của từng thành viên theo ID Discord. Khi mua gói bằng /mua, bot lưu đơn hàng gồm gói, số ngày, số tiền, trạng thái và ID Discord của server và người gõ lệnh."] },
      { h: "Công cụ quản trị và bảng điều khiển", p: ["Khi bạn dùng chào người mới, AutoMod và ticket, bot lưu cài đặt của từng công cụ (ID kênh và role bạn chọn, lời chào bạn viết), ID kênh ticket cùng ID người mở và người đóng, thời điểm mở và đóng, và các điểm sức khoẻ server của những lần khám gần đây. Bot không lưu nội dung ticket hay tin nhắn nào. Luật AutoMod do chính Discord thực thi.", "Nếu bạn đăng nhập bảng điều khiển trên web, bot dùng đăng nhập Discord để biết bạn là ai và bạn quản trị những server nào, rồi thu hồi ngay mã truy cập đó. Bot chỉ giữ một cookie phiên có chữ ký trong trình duyệt của bạn, không lưu mật khẩu hay mã truy cập của bạn."] },
      { h: "Thiết kế bằng AI", p: ["Khi bạn dùng /thietke, đoạn mô tả bạn gõ được gửi tới dịch vụ Gemini của Google để tạo bản thiết kế. Chỉ đoạn mô tả đó được gửi, không kèm tên người dùng hay nội dung tin nhắn. Bot đang dùng gói miễn phí của Google, nên Google có thể dùng nội dung gửi qua gói này để cải thiện sản phẩm của họ. Đừng nhập thông tin cá nhân hay bí mật vào phần mô tả."] },
      { h: "Thanh toán", p: ["Thanh toán tự động đi qua payOS (payos.vn). Bạn nhập thông tin ngân hàng trên trang của payOS và ngân hàng, không bao giờ trên Discord hay trên bot. Bot không thấy và không lưu số tài khoản hay thẻ của bạn, chỉ biết đơn đã thanh toán hay chưa."] },
      { h: "Bot không làm gì", p: ["Bot không đọc, không lưu nội dung tin nhắn, và không yêu cầu quyền Message Content. Bot không bán hay chia sẻ dữ liệu cho bên thứ ba."] },
      { h: "Quyền hạn trên server", p: ["Bot cần quyền quản lý kênh, role và server để dựng server. Bot chỉ xoá những kênh và role chính nó đã tạo, và chỉ khi quản trị viên bấm xác nhận."] },
      { h: "Xoá dữ liệu", p: ["Quản trị viên gõ /xoadulieu để bot quên danh sách kênh và role đã xây. Giấy phép và số lần dùng vẫn được giữ để tính gói. Đuổi bot khỏi server cũng ngừng mọi hoạt động của bot ở đó."] },
      { h: "Liên hệ", p: ["Có câu hỏi về dữ liệu, hãy nhắn chủ bot trên Instagram: instagram.com/nhaajt_hehee, hoặc xem nhaajt.com."] },
    ],
  },
  en: {
    title: "Privacy",
    updated: updated.en,
    back: "Back to home",
    sections: [
      { h: "What the bot stores", p: ["For each server the bot stores the server ID, the theme used, the IDs of the channels, categories and roles it created, the active license (plan and expiry date) and how many times some features were used, to apply plan limits.", "When you use the other features the bot also stores: saved themes, backups of the server layout (names and permissions of roles, channels and categories, never message content), recurring event schedules, and each member's points, check-in streak and last check-in day, by Discord ID. When you buy a plan with /mua the bot stores the order: the plan, days, amount, status and the Discord IDs of the server and the person who ran the command."] },
      { h: "Admin tools and the dashboard", p: ["When you use the welcome flow, AutoMod and tickets, the bot stores each tool's settings (the channel and role IDs you pick, the welcome text you write), the ID of each ticket channel with the IDs of who opened and closed it and when, and the health scores of recent checks. It stores no ticket content and no messages. AutoMod rules are enforced by Discord itself.", "If you sign in to the web dashboard, the bot uses Discord sign-in to learn who you are and which servers you administer, then revokes that access token straight away. It keeps only a signed session cookie in your browser, never your password or your access token."] },
      { h: "AI design", p: ["When you use /thietke, the description you type is sent to Google's Gemini service to create the design. Only that description is sent, with no usernames or message content. The bot currently uses Google's free tier, so Google may use content sent through it to improve its products. Do not enter personal or secret information in the description."] },
      { h: "Payments", p: ["Automatic payments go through payOS (payos.vn). You enter your bank details on the pages of payOS and your bank, never on Discord or in the bot. The bot does not see or store your account or card number, only whether the order has been paid."] },
      { h: "What the bot does not do", p: ["The bot does not read or store message content and does not ask for the Message Content permission. It does not sell or share data with third parties."] },
      { h: "Permissions on your server", p: ["The bot needs permission to manage channels, roles and the server in order to build it. It only deletes channels and roles it created itself, and only after an administrator confirms."] },
      { h: "Deleting data", p: ["An administrator can run /xoadulieu so the bot forgets the list of channels and roles it built. The license and usage counts are kept to apply the plan. Removing the bot from the server stops all bot activity there."] },
      { h: "Contact", p: ["For questions about data, message the bot owner on Instagram: instagram.com/nhaajt_hehee, or see nhaajt.com."] },
    ],
  },
};

export const terms: Pair = {
  vi: {
    title: "Điều khoản sử dụng",
    updated: updated.vi,
    back: "Về trang chủ",
    sections: [
      { h: "Dịch vụ", p: ["Thầu Xây Dựng là bot Discord dựng kênh, role, luật và nội dung cho server. Đây là dự án cá nhân, không liên kết với Discord Inc."] },
      { h: "Gói và mã kích hoạt", p: ["Gói miễn phí có giới hạn về số lần xây và số theme. Gói trả phí được mở bằng lệnh /mua (tự bật khi thanh toán thành công) hoặc bằng mã kích hoạt dùng một lần, gắn với một server và có hạn dùng. Hết hạn thì server tự về gói miễn phí, những gì đã xây vẫn ở lại."] },
      { h: "Thanh toán và hoàn tiền", p: ["Gói mua bằng /mua và mã kích hoạt bán thủ công qua tin nhắn đều theo quy tắc sau. Gói hoặc mã chưa dùng có thể được hoàn tiền nếu bạn yêu cầu trong vòng 7 ngày kể từ khi mua. Gói hoặc mã đã kích hoạt không được hoàn tiền, trừ khi bot không dùng được vì lỗi của chủ bot trong thời gian dài, khi đó thời hạn sẽ được bù thêm ngày."] },
      { h: "Trách nhiệm của quản trị viên", p: ["Bạn chịu trách nhiệm cho server của mình, kể cả nội dung bạn chỉnh sửa hoặc nhập vào bot. Không dùng bot để vi phạm Điều khoản của Discord hoặc pháp luật."] },
      { h: "Không bảo đảm", p: ["Bot được cung cấp theo hiện trạng. Có thể gián đoạn hoặc lỗi, và nội dung hài hước có thể không hợp với mọi cộng đồng; hãy xem bản vẽ trước khi xác nhận. Chủ bot có quyền từ chối hoặc ngừng phục vụ khi có lạm dụng."] },
      { h: "Thay đổi", p: ["Điều khoản có thể được cập nhật; ngày cập nhật nằm ở đầu trang."] },
    ],
  },
  en: {
    title: "Terms of use",
    updated: updated.en,
    back: "Back to home",
    sections: [
      { h: "The service", p: ["Thau Xay Dung is a Discord bot that builds channels, roles, rules and content for a server. It is a personal project and is not affiliated with Discord Inc."] },
      { h: "Plans and activation codes", p: ["The free plan limits the number of builds and themes. Paid plans are unlocked with the /mua command (the plan switches on when the payment succeeds) or with a one-time activation code tied to one server and valid for a set period. When it ends the server returns to the free plan and what was already built stays."] },
      { h: "Payment and refunds", p: ["Plans bought with /mua and activation codes sold by hand through messages follow the same rule. An unused plan or code can be refunded if you ask within 7 days of buying it. A plan or code that has been activated is not refunded, unless the bot was unusable for a long time because of the owner, in which case extra days are added."] },
      { h: "Administrator responsibility", p: ["You are responsible for your server, including any content you edit or enter into the bot. Do not use the bot to break Discord's terms or the law."] },
      { h: "No warranty", p: ["The bot is provided as is. It may be interrupted or have errors, and its humor may not suit every community; review the blueprint before confirming. The bot owner may refuse or stop service in case of abuse."] },
      { h: "Changes", p: ["These terms may be updated; the date is at the top of the page."] },
    ],
  },
};

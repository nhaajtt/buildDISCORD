export type Doc = { title: string; updated: string; back: string; sections: { h: string; p: string[] }[] };
type Pair = { vi: Doc; en: Doc };

const updated = { vi: "Cập nhật lần cuối: 02/10/2026", en: "Last updated: 2 October 2026" };

export const privacy: Pair = {
  vi: {
    title: "Quyền riêng tư",
    updated: updated.vi,
    back: "Về trang chủ",
    sections: [
      { h: "Bot lưu gì", p: ["Với mỗi server, bot lưu ID server, tên theme đã dùng, ID của các kênh, danh mục và role mà bot đã tạo, giấy phép đang dùng (gói, ngày hết hạn) và số lần dùng một số tính năng để tính hạn mức gói.", "Các tính năng về sau (bản vẽ đã lưu, điểm vui, lịch sự kiện) cũng chỉ lưu dữ liệu gắn với server, và trang này sẽ được cập nhật khi chúng ra mắt."] },
      { h: "Thiết kế bằng AI", p: ["Khi bạn dùng /thietke, đoạn mô tả bạn gõ được gửi tới dịch vụ Gemini của Google để tạo bản thiết kế. Chỉ đoạn mô tả đó được gửi, không kèm tên người dùng hay nội dung tin nhắn. Bot đang dùng gói miễn phí của Google, nên Google có thể dùng nội dung gửi qua gói này để cải thiện sản phẩm của họ. Đừng nhập thông tin cá nhân hay bí mật vào phần mô tả."] },
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
      { h: "What the bot stores", p: ["For each server the bot stores the server ID, the theme used, the IDs of the channels, categories and roles it created, the active license (plan and expiry date) and how many times some features were used, to apply plan limits.", "Later features (saved blueprints, fun points, event schedules) will also store only server-linked data, and this page will be updated when they launch."] },
      { h: "AI design", p: ["When you use /thietke, the description you type is sent to Google's Gemini service to create the design. Only that description is sent, with no usernames or message content. The bot currently uses Google's free tier, so Google may use content sent through it to improve its products. Do not enter personal or secret information in the description."] },
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
      { h: "Gói và mã kích hoạt", p: ["Gói miễn phí có giới hạn về số lần xây và số theme. Gói trả phí được mở bằng mã kích hoạt dùng một lần, gắn với một server và có hạn dùng. Hết hạn thì server tự về gói miễn phí, những gì đã xây vẫn ở lại."] },
      { h: "Thanh toán và hoàn tiền", p: ["Mã kích hoạt được bán thủ công qua tin nhắn. Mã chưa kích hoạt có thể được hoàn tiền nếu bạn yêu cầu trong vòng 7 ngày kể từ khi mua. Mã đã kích hoạt không được hoàn tiền, trừ khi bot không dùng được vì lỗi của chủ bot trong thời gian dài, khi đó thời hạn sẽ được bù thêm ngày."] },
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
      { h: "Plans and activation codes", p: ["The free plan limits the number of builds and themes. Paid plans are unlocked with a one-time activation code tied to one server and valid for a set period. When it ends the server returns to the free plan and what was already built stays."] },
      { h: "Payment and refunds", p: ["Activation codes are sold by hand through messages. An unused code can be refunded if you ask within 7 days of buying it. A code that has been activated is not refunded, unless the bot was unusable for a long time because of the owner, in which case extra days are added."] },
      { h: "Administrator responsibility", p: ["You are responsible for your server, including any content you edit or enter into the bot. Do not use the bot to break Discord's terms or the law."] },
      { h: "No warranty", p: ["The bot is provided as is. It may be interrupted or have errors, and its humor may not suit every community; review the blueprint before confirming. The bot owner may refuse or stop service in case of abuse."] },
      { h: "Changes", p: ["These terms may be updated; the date is at the top of the page."] },
    ],
  },
};

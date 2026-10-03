export type DevlogDoc = {
  title: string;
  intro: string;
  back: string;
  source: string;
  date: string;
  sections: { h: string; items: { b?: string; t: string }[] }[];
};

export const devlog: { vi: DevlogDoc; en: DevlogDoc } = {
  en: {
    title: "Build diary",
    intro: "Short notes on why this bot exists and what went wrong while building it. The full text lives in the repository.",
    back: "Back to home",
    source: "Read it on GitHub",
    date: "2 Oct 2026",
    sections: [
      {
        h: "Why a bot that builds servers",
        items: [
          { t: "Every new Discord server starts the same way: an empty list with one channel called general. Setting up roles, channels, rules and a welcome takes an hour, and most people give up halfway." },
          { t: "The idea: add one bot, type one command and get a server that already has a personality. The personality is the point. Rules like \"no ads, if you could really get rich in three days you would not be sitting here\" are what make people read them." },
        ],
      },
      {
        h: "What I learned",
        items: [
          { b: "A bot cannot add another bot.", t: "Discord only lets a person invite a bot. So the builder makes the DJ booth and the text-to-speech channel and posts an invite button. An admin clicks once." },
          { b: "Preview first, always.", t: "A plain \"build it?\" with two buttons was not enough. The blueprint is now a tree you can edit with a menu, a modal and a few buttons, and it expires after 15 minutes." },
          { b: "Running it twice must not make a mess.", t: "Early on, a second /build created a second copy of every channel and posted the rules twice. Creation now reports whether it made something, and content is only posted into channels that were just created." },
          { b: "Undo only what you made.", t: "/nuke deletes by recorded IDs, never by name. The same record limits the role buttons, so a forged button cannot hand out an admin role." },
          { b: "Rate limits are a design input.", t: "A server with thirty channels is a hundred API calls. A small pause between creations and one progress message edited in place keeps it calm." },
        ],
      },
      {
        h: "Mixing themes and plans",
        items: [
          { b: "Merging, not concatenating.", t: "Mixing three themes gave three channels called meme. Merging by name, dropping empty categories and keeping the admin area first fixed it, and a test checks the Discord limits." },
          { b: "JSON files were fine until there were customers.", t: "Licenses, usage counters and a monthly AI quota want transactions, so storage moved to the SQLite module that ships with Node 22. The old files are imported on first start." },
          { b: "I almost published my customers' database.", t: "The gitignore covered the JSON files but not the new database file. I caught it while preparing the public repository and now ignore the whole data folder." },
        ],
      },
      {
        h: "The AI designer",
        items: [
          { b: "Free tier, no model name needed.", t: "Model names and free limits change often, so the bot asks Google which models the key can use and picks the newest stable flash one." },
          { b: "Never build straight from a model's answer.", t: "The reply is forced into a JSON schema, then cleaned: mentions removed, blocked words dropped, counts and lengths capped. Only then does a person see it as a blueprint." },
          { b: "A regex that passed by accident.", t: "In JavaScript \\b only knows ASCII letters, so the word filter never matched Vietnamese words. My first fix lost a backslash in a template string and the test still passed. Testing innocent words that merely contain a blocked one caught it, and String.raw fixed it." },
          { b: "The description is data.", t: "It goes in the user message, never in the system prompt, and the prompt says to ignore instructions inside it." },
          { b: "Quota is shared by every customer.", t: "There is a per-server monthly limit and a bot-wide limit per minute. When Google says no, the attempt is not counted against the person." },
        ],
      },
      {
        h: "The website",
        items: [
          { b: "One memorable thing.", t: "A blueprint sheet in navy with one safety-orange accent. The big motion is a pinned scene where a server assembles itself as you scroll." },
          { b: "A font name that does not exist.", t: "I used \"Big Shoulders Display\" from memory and next/font refused it. The family is called Big Shoulders." },
          { b: "Mobile cannot pin everything.", t: "On a phone the pinned scene hides its heading from the screen but keeps it for screen readers. With reduced motion on, nothing pins." },
        ],
      },
      {
        h: "Safe to leave alone, and on the Raspberry Pi",
        items: [
          { b: "Alerts that cannot flood.", t: "The same message is sent at most once every five minutes." },
          { b: "A health check that means something.", t: "The bot writes a heartbeat file and the container checks its age. The update script waits for healthy and rolls back otherwise." },
          { b: "Secrets travel over SSH, not through Git.", t: "The repository is public, so the token and the key stay in an ignored file that was copied to the Pi with scp." },
          { b: "The timer needs a human.", t: "Installing the systemd timer needs sudo with a password, so that last step is run by hand." },
        ],
      },
    ],
  },
  vi: {
    title: "Nhật ký làm bot",
    intro: "Ghi chép ngắn về lý do bot này ra đời và những chỗ trục trặc khi làm. Bản đầy đủ nằm trong repo.",
    back: "Về trang chủ",
    source: "Đọc trên GitHub",
    date: "2/10/2026",
    sections: [
      {
        h: "Vì sao làm bot dựng server",
        items: [
          { t: "Server Discord mới nào cũng bắt đầu giống nhau: một danh sách trống với đúng một kênh general. Lập role, kênh, luật và lời chào mất cả tiếng, và đa số người bỏ cuộc giữa chừng." },
          { t: "Ý tưởng: thêm một bot, gõ một lệnh và có ngay một server đã có cá tính. Cá tính mới là điểm chính. Những điều luật như \"cấm quảng cáo, làm giàu được trong 3 ngày thì đã không ngồi đây\" là thứ khiến người ta chịu đọc." },
        ],
      },
      {
        h: "Học được gì",
        items: [
          { b: "Bot không thể tự thêm bot khác.", t: "Discord chỉ cho người thật mời bot. Nên bot dựng sẵn phòng DJ, kênh đọc chữ thành tiếng và đăng nút mời. Admin bấm một lần là xong." },
          { b: "Luôn xem trước.", t: "Hỏi \"xây không?\" với hai nút là chưa đủ. Giờ bản vẽ là một cái cây sửa được bằng ô chọn, hộp thoại và vài nút, và tự hết hạn sau 15 phút." },
          { b: "Chạy hai lần không được bày bừa.", t: "Hồi đầu, /build lần hai tạo thêm một bản sao của mọi kênh và đăng luật hai lần. Giờ việc tạo cho biết có tạo mới hay không, và nội dung chỉ được đăng vào kênh vừa tạo." },
          { b: "Chỉ đập thứ mình đã xây.", t: "/nuke xoá theo ID đã ghi, không bao giờ theo tên. Cùng danh sách đó giới hạn các nút xin role, nên nút giả không thể cấp role admin." },
          { b: "Giới hạn tốc độ là một phần thiết kế.", t: "Server ba mươi kênh là cả trăm lần gọi API. Nghỉ nhẹ giữa mỗi lần tạo và sửa một tin báo tiến độ tại chỗ giúp mọi thứ êm." },
        ],
      },
      {
        h: "Trộn theme và các gói",
        items: [
          { b: "Gộp chứ không nối.", t: "Trộn ba theme ra ba kênh tên meme. Gộp theo tên, bỏ danh mục rỗng và luôn để khu hành chính lên đầu là hết, và có test kiểm tra giới hạn của Discord." },
          { b: "File JSON ổn cho đến khi có khách.", t: "Giấy phép, bộ đếm và hạn mức AI hằng tháng cần giao dịch, nên dữ liệu chuyển sang SQLite có sẵn trong Node 22. File cũ được nhập vào lần khởi động đầu." },
          { b: "Suýt đăng cơ sở dữ liệu của khách.", t: "gitignore chặn file JSON nhưng quên file database mới. Mình phát hiện khi chuẩn bị repo công khai và giờ chặn cả thư mục data." },
        ],
      },
      {
        h: "AI thiết kế",
        items: [
          { b: "Gói miễn phí, không cần biết tên model.", t: "Tên model và hạn mức free đổi liên tục, nên bot hỏi Google xem key dùng được model nào rồi chọn model flash ổn định mới nhất." },
          { b: "Không bao giờ xây thẳng từ câu trả lời của AI.", t: "Câu trả lời bị ép vào schema JSON rồi được lọc: bỏ mention, bỏ từ cấm, giới hạn số lượng và độ dài. Sau đó người dùng mới thấy nó dưới dạng bản vẽ." },
          { b: "Một regex qua được test do tình cờ.", t: "Trong JavaScript, \\b chỉ hiểu chữ cái ASCII nên bộ lọc từ cấm không bao giờ bắt được từ tiếng Việt có dấu. Lần sửa đầu làm mất dấu gạch chéo trong chuỗi template mà test vẫn qua. Thử những từ vô hại có chứa từ cấm mới lộ ra, và String.raw sửa được." },
          { b: "Mô tả chỉ là dữ liệu.", t: "Nó nằm trong tin nhắn của người dùng, không bao giờ nằm trong system prompt, và prompt dặn bỏ qua mọi chỉ dẫn bên trong." },
          { b: "Hạn mức do mọi khách dùng chung.", t: "Có giới hạn theo từng server mỗi tháng và giới hạn cho cả bot mỗi phút. Khi Google từ chối, lượt đó không bị tính cho người dùng." },
        ],
      },
      {
        h: "Website",
        items: [
          { b: "Một điểm nhớ duy nhất.", t: "Một tờ bản vẽ xanh navy với một màu cam an toàn. Chuyển động lớn là cảnh ghim, nơi server tự lắp ráp theo thanh cuộn." },
          { b: "Một cái tên font không tồn tại.", t: "Mình nhớ nhầm \"Big Shoulders Display\" và next/font từ chối. Họ font tên là Big Shoulders." },
          { b: "Điện thoại không ghim hết nổi.", t: "Trên điện thoại cảnh ghim giấu tiêu đề khỏi màn hình nhưng vẫn giữ cho trình đọc màn hình. Bật giảm chuyển động thì không có gì bị ghim." },
        ],
      },
      {
        h: "Để yên không lo, và trên Raspberry Pi",
        items: [
          { b: "Cảnh báo không thể làm ngập kênh.", t: "Cùng một tin chỉ gửi tối đa năm phút một lần." },
          { b: "Health check có ý nghĩa.", t: "Bot ghi một file nhịp tim và container kiểm tra tuổi của nó. Script cập nhật đợi trạng thái khoẻ, không thì quay lại bản cũ." },
          { b: "Bí mật đi qua SSH, không qua Git.", t: "Repo công khai nên token và key nằm trong một file bị bỏ qua, chép lên Pi bằng scp." },
          { b: "Bộ hẹn giờ cần người thật.", t: "Cài timer systemd cần sudo có mật khẩu, nên bước cuối cùng này chạy tay." },
        ],
      },
    ],
  },
};

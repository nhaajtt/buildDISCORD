# Sổ tay Thầu Xây Dựng

Cuốn sổ tay này dành cho người **chưa biết gì về Discord và chưa biết gì về bot**. Đọc từ phần 1 đến hết là đủ để tự dùng. Ai đã quen Discord thì nhảy thẳng tới phần cần tìm bằng mục lục.

Các địa chỉ cần dùng, gom một chỗ:

| Việc | Địa chỉ |
| --- | --- |
| Trang giới thiệu bot | https://builddiscord.vercel.app |
| Mời bot vào server | https://discord.com/oauth2/authorize?client_id=1555773920815087656&scope=bot%20applications.commands&permissions=8 |
| Bảng điều khiển trên web | https://nhaajt.tailc4c5ef.ts.net:10000 |
| Trang quản lý ứng dụng bot của Discord | https://discord.com/developers/applications |
| Mã nguồn | https://github.com/nhaajtt/buildDISCORD |
| Trang quản lý Stripe (thẻ) | https://dashboard.stripe.com |
| Khoá API của Stripe | https://dashboard.stripe.com/apikeys |
| Trang quản lý payOS (QR ngân hàng Việt Nam) | https://my.payos.vn |
| Hướng dẫn của payOS | https://payos.vn/docs/ |

## Có gì mới ở phiên bản 1.6

Nếu bạn đã dùng bản cũ, đây là những thứ mới và chỗ đọc chúng:

| Mới | Làm gì | Đọc ở |
| --- | --- | --- |
| `/batdau` | Dựng server, bật chào mừng, AutoMod, chống raid và bản tin tuần chỉ bằng một lệnh, kèm điểm sức khoẻ trước và sau. Bot cũng hiện nút **Bắt đầu** khi vào server | 2.3 |
| `/trogiup` | Danh sách lệnh theo nhóm, chỉ hiện việc gói của bạn làm được | 8.12 |
| Chống raid, `/khoakhan` | Phát hiện nhiều người vào cùng lúc, báo động, nâng mức xác minh hoặc khoá kênh, tự mở khoá | 8.5 |
| Chống xoá hàng loạt (Pro) | Ngăn một người xoá hàng loạt kênh hoặc role | 8.6 |
| Nhật ký quản trị | Ghi ban, unban, đổi quyền role, AutoMod chặn (không ghi nội dung tin nhắn) | 8.7 |
| `/canhcao`, `/timeout`, `/kick`, `/ban`, `/hoso` | Xử lý thành viên và xem lịch sử vi phạm | 8.8 |
| `/hang` (Pro) | Cấp độ theo hoạt động chat và giọng nói, không đọc tin nhắn | 7.4 |
| `/vaitro` | Menu nhận role bằng nút | 7.5 |
| `/quatang` (Pro), `/binhchon` | Giveaway và bình chọn | 7.6, 7.7 |
| Bản tin tuần, nhắc hết hạn | Báo cáo tuần cho chủ server và nhắc gói sắp hết | 8.9, 8.10 |
| `/vietgiup` (Pro) | Nhờ trợ lý viết luật, lời chào, thông báo | 8.11 |
| Bảng điều khiển có thêm tab | Bảo mật, Hoạt động, Bản tin, Nhật ký, Tổng quan hoạt động | 9 |
| Giá mới | Pro 3,99 đô, Plus 7,99 đô mỗi 30 ngày, mua một năm trả 10 tháng, gói **Dựng giúp** 4,99 đô trả một lần | 10 |
| Gói Free xây được 2 lần | Chọn nhầm theme vẫn làm lại được | 10.1 |
| `/xoadulieu` xoá sạch hơn | Xoá luôn điểm, hồ sơ xử lý, giveaway, bình chọn, menu role | 11.2 |
| Trang trạng thái | Xem bot đang sống hay không | 12.9 |

## Mục lục

1. Những khái niệm Discord cần biết
2. Bắt đầu từ con số không: có server, mời bot, và `/batdau`
3. Cách gõ một lệnh
4. Dựng cả server bằng `/build`
5. Thiết kế bằng AI: `/thietke`
6. Theme riêng, sao lưu và khôi phục
7. Giữ server sôi động: điểm danh, mini-game, sự kiện, hạng hoạt động, menu role, giveaway, bình chọn
8. Chăm sóc và bảo vệ server: chào người mới, khám sức khoẻ, AutoMod, ticket, chống raid, khoá khẩn cấp, nhật ký, lệnh xử lý, bản tin tuần, trợ lý viết giúp, `/trogiup`
9. Bảng điều khiển trên web
10. Gói, giá, dùng thử và thanh toán
11. Dọn dẹp và xoá dữ liệu
12. Dành cho chủ bot: vận hành bot trên Raspberry Pi
13. Chuyện gì xảy ra khi có sự cố
14. Bảng tất cả các lệnh
15. Phụ lục A: cài đặt Stripe từng bước (thẻ, tính bằng đô)
16. Phụ lục B: cài đặt payOS (QR ngân hàng Việt Nam)
17. Phụ lục C: dựng server hỗ trợ cho chính bot, bằng chính bot

---

## 1. Những khái niệm Discord cần biết

Nếu bạn đã dùng Discord, đọc lướt phần này. Nếu chưa, đọc kỹ, vì mọi hướng dẫn phía sau dùng những từ này.

- **Discord**: ứng dụng nhắn tin theo nhóm, tải ở https://discord.com. Bạn cần một tài khoản, miễn phí.
- **Server**: một "ngôi nhà" của một nhóm người. Mỗi server có tên riêng, ví dụ "Hội Chơi Game Lớp 12A". Trên Discord, "server" chỉ nhóm này, không phải máy chủ thật.
- **Kênh (channel)**: một "phòng" trong server. Có hai loại. **Kênh chữ** (có dấu `#` phía trước, ví dụ `#chung`) để nhắn tin. **Kênh thoại (voice)** (có hình cái loa) để nói chuyện bằng giọng nói.
- **Danh mục (category)**: một nhóm kênh gộp lại cho gọn, giống ngăn kéo.
- **Role (vai trò)**: nhãn gắn cho thành viên, có màu và có quyền hạn đi kèm. Ví dụ role "Admin" được làm nhiều việc hơn role "Thành viên".
- **Quyền (permission)**: việc một role được phép làm, như xoá tin nhắn, tạo kênh. Quyền **Administrator** (quản trị viên) là quyền cao nhất, làm được mọi thứ.
- **Chủ server (owner)**: người tạo ra server, luôn có mọi quyền.
- **Bot**: một "tài khoản người máy" chạy 24/24. Bot này tên **Thầu Xây Dựng**. Bạn "mời" nó vào server như mời một người, nhưng nó làm theo lệnh bạn gõ.
- **Lệnh slash (slash command)**: lệnh bắt đầu bằng dấu `/`. Gõ `/` trong ô chat, Discord hiện danh sách lệnh của các bot trong server.
- **ID**: một dãy số dài, mỗi server, kênh, role, người dùng có một số riêng. Phần chủ bot sẽ cần.
- **Chế độ nhà phát triển (Developer Mode)**: công tắc để Discord cho phép sao chép ID. Cách bật: Cài đặt người dùng (hình bánh răng cạnh tên bạn, góc dưới trái), mục **Nâng cao**, bật **Chế độ nhà phát triển**. Sau đó bấm chuột phải vào tên server, tên kênh hay tên người và chọn **Sao chép ID**.
- **Thông báo chỉ mình bạn thấy (ephemeral)**: nhiều câu trả lời của bot hiện kèm dòng "Chỉ mình bạn nhìn thấy tin nhắn này". Những tin đó không ai khác thấy và sẽ biến mất khi bạn tải lại Discord. Bình thường, không phải lỗi.

## 2. Bắt đầu từ con số không: có server, mời bot, và `/batdau`

### 2.1. Tạo server mới (nếu chưa có)

1. Mở Discord. Ở cột bên trái, bấm dấu **+** (Thêm máy chủ).
2. Chọn **Tạo mẫu riêng** (Create My Own), rồi chọn **Cho tôi và bạn bè của tôi**.
3. Đặt tên server và bấm **Tạo**. Server trống chỉ có vài kênh mặc định.

Khuyên dùng: làm quen trên một **server thử** trước. `/build` sẽ thêm khoảng hai chục kênh, bạn sẽ muốn xem nó trên chỗ không quan trọng.

### 2.2. Mời bot vào server

Bạn phải là **chủ server hoặc có quyền Administrator** mới mời được bot.

1. Mở đường dẫn mời: https://discord.com/oauth2/authorize?client_id=1555773920815087656&scope=bot%20applications.commands&permissions=8
2. Ở ô "Thêm vào máy chủ" (Add to server), chọn server của bạn trong danh sách. Chỉ những server bạn quản lý mới hiện ra.
3. Bấm **Tiếp tục**. Discord cho biết bot xin quyền gì (quyền Administrator). Bấm **Cấp quyền** (Authorize).
4. Làm bài kiểm tra "Tôi không phải người máy" nếu Discord hỏi.
5. Quay lại Discord. Bạn thấy thông báo bot **Thầu Xây Dựng** vừa vào server, và tên nó nằm trong danh sách thành viên bên phải.
6. Bot tự đăng một tin chào có nút **Bắt đầu**. Đó là cửa vào cách dựng nhanh ở mục 2.3.

Vì sao xin quyền Administrator: bot phải tạo kênh, tạo role, tạo sự kiện, quản lý AutoMod, và đăng bài vào kênh khoá chỉ đọc. Xin ít quyền hơn thì dễ gặp lỗi khó hiểu giữa chừng. Bot không đọc nội dung tin nhắn của ai.

### 2.3. Cách nhanh nhất: để thầu dựng giúp bằng `/batdau`

Đây là **bước đầu tiên nên làm** sau khi mời bot. Không cần nhớ lệnh nào khác, không cần đọc hết sổ tay.

Ngay khi bot vào server, nó tự đăng một tin chào có nút **Bắt đầu** (ở kênh hệ thống, hoặc kênh chữ đầu tiên nó gửi được). Bấm nút đó, hoặc gõ `/batdau`. Chỉ admin bấm được.

Bot hiện một khung có **ba ô chọn** và hai nút:

1. **Server của bạn thuộc kiểu nào?** Chọn một theme (Game Thủ, Học Tập, Anime...). Gói Pro chọn được tối đa bốn theme để trộn. Nếu chưa biết chọn gì, chọn **Gợi ý cho tôi**, gõ vài chữ tả server (ví dụ "nhóm bạn chơi game cuối tuần"), bot tự chọn giúp. Bot chọn theo từ khoá, không dùng AI, nên luôn chạy được.
2. **Giọng điệu của luật và lời chào**: nhẹ nhàng, troll hoặc nhảm. Chọn khác troll cần gói Pro.
3. **Bật thêm gì cho tiện?** Chọn nhiều ô cùng lúc: chào người mới, AutoMod nhẹ, khám sức khoẻ hằng tuần, bảo vệ cơ bản (báo động raid, nhật ký phạt), bản tin tuần.

Chưa có gì bị đụng tới cho đến khi bạn bấm **Dựng luôn**. Muốn đổi ý thì chọn lại, hoặc bấm **Thôi**.

Khi bấm **Dựng luôn**, bot làm lần lượt: khám sức khoẻ server lấy điểm trước, dựng server, bật các tính năng bạn chọn, rồi khám lại lấy điểm sau. Cuối cùng bot hiện một **thẻ kết quả**: điểm trước, điểm sau, những gì đã làm, và ba việc nên thử tiếp. Bấm **Đăng thẻ khoe lên kênh** nếu muốn khoe với cả server.

Điều cần biết:
- Chạy lại `/batdau` lần nữa **không dựng trùng** và không tốn thêm một lượt xây của gói Miễn phí.
- Kênh bạn đã chọn làm kênh nhật ký thì bot giữ nguyên. Mức AutoMod bạn đang chạy cao hơn mức nhẹ thì bot không hạ xuống.
- Thiếu quyền cho một tính năng nào đó (ví dụ AutoMod), bot ghi rõ ở thẻ kết quả, những phần còn lại vẫn làm xong.
- Bản chọn giữ 15 phút. Quá giờ thì gõ `/batdau` lại.

Muốn tự quyết từng chi tiết (xem bản vẽ, sửa tên danh mục, thêm kênh) thì dùng `/build` ở phần 4. Quên lệnh nào thì gõ `/trogiup` (xem mục 8.12).

### 2.4. Kiểm tra bot đã sẵn sàng

1. Vào bất kỳ kênh chữ nào, gõ `/goi` rồi bấm Enter.
2. Nếu bot trả lời bảng gói dịch vụ, bot đã hoạt động. Dòng đầu cho biết server đang ở gói **Miễn phí**.
3. Nếu gõ `/` không thấy lệnh nào của bot: đợi vài phút, vì lệnh mới có thể mất đến một giờ để hiện lần đầu. Thử thoát Discord và vào lại (Ctrl+R trên máy tính). Còn không thì xem phần 13.

### 2.5. Một việc quan trọng: vị trí role của bot

Khi mời bot, Discord tự tạo một role cho nó tên **Thầu Xây Dựng**. Bot chỉ quản lý được những role **nằm thấp hơn** role của nó.

1. Vào **Cài đặt máy chủ** (bấm tên server, chọn Cài đặt), mục **Vai trò (Roles)**.
2. Kéo role **Thầu Xây Dựng** lên gần đầu danh sách, ngay dưới các role admin của bạn.

Nếu bot báo "role của bot nằm thấp hơn", gần như luôn là vì bước này chưa làm.

## 3. Cách gõ một lệnh

1. Bấm vào ô chat của một kênh chữ.
2. Gõ dấu `/` rồi vài chữ đầu của lệnh. Ví dụ gõ `/bui` thì Discord gợi ý `/build`.
3. Bấm vào lệnh trong danh sách (hoặc Tab).
4. Với lệnh có **tuỳ chọn**, Discord hiện các ô nhỏ có tên. Ô có dấu sao hoặc báo "bắt buộc" thì phải điền. Ô khác điền hay không tuỳ bạn. Chọn từ danh sách xổ xuống khi có.
5. Bấm Enter để gửi.

Lệnh có **lệnh con** (như `/ticket caidat`): sau khi chọn `/ticket`, Discord bắt bạn chọn tiếp `caidat`, `loai`, `dang`... Giống như menu nhiều tầng.

Ai dùng được lệnh nào: ghi ở phần 14. Quy tắc nhanh: **lệnh quản trị cần quyền Administrator**, lệnh vui như `/diemdanh` ai cũng dùng được. Nếu bạn không đủ quyền, bot trả lời một câu hài hước rồi không làm gì.

## 4. Dựng cả server bằng `/build`

Đây là lệnh dựng đầy đủ nhất của bot: nó dựng role, danh mục, kênh chữ, kênh thoại, luật, lời chào và bảng chọn role cho cả server trong một lần, và cho bạn xem bản vẽ để sửa trước khi xây. Muốn nhanh và đơn giản hơn thì dùng `/batdau` (mục 2.3), nó gọi cùng bộ máy xây này.

### 4.1. Chọn theme

Theme là "phong cách" server. Có **11 theme**:

| Giá trị khi chọn | Tên | Hợp với |
| --- | --- | --- |
| `gaming` | Game Thủ Cày Đêm | Nhóm chơi game |
| `hoc-tap` | Học Mà Như Không Học | Nhóm học bài, lớp, câu lạc bộ học thuật |
| `cong-dong` | Cộng Đồng Tạp Hoá | Cộng đồng chung, nhiều chủ đề |
| `chill-ban-be` | Chill Cùng Hội Bạn | Bạn bè tám chuyện |
| `booking` | Booking Bạn Chơi | Server cho thuê bạn chơi game, bạn nói chuyện |
| `anime` | Hội Mê Anime | Người mê anime, manga |
| `dev-code` | Hội Code Dạo | Lập trình viên |
| `creator` | Studio Content Creator | Người làm nội dung |
| `phim-nhac` | Rạp Phim Và Phòng Nhạc | Phim, nhạc |
| `cong-so` | Văn Phòng Một Nhà | Nhóm làm việc, công ty nhỏ |
| `thu-cung` | Hội Yêu Thú Cưng | Người nuôi chó mèo |

### 4.2. Gõ lệnh

1. Gõ `/build`. Ô **theme** là bắt buộc: chọn một theme trong danh sách.
2. Tuỳ chọn: **theme2, theme3, theme4** để **trộn** thêm tối đa bốn theme. Ví dụ `gaming` + `anime` ra một server vừa game vừa anime. Bot gộp role và luật, bỏ kênh trùng tên. Trộn theme là tính năng của gói Pro.
3. Tuỳ chọn: **muc-do-hai** chọn độ "nhảm" của lời lẽ trong luật và lời chào: `nhe` (nhẹ nhàng), `troll` (mặc định), `nham` (siêu nhảm). Chọn mức khác `troll` cần gói Pro. Mức hài chỉ đổi chữ, không đổi cấu trúc server.
4. Bấm Enter.

### 4.3. Bản vẽ: xem và sửa trước khi xây

Bot **không xây ngay**. Nó hiện một **bản vẽ** dạng cây: danh sách role, danh mục, kênh sẽ được tạo. Chỉ mình bạn thấy bản vẽ này. Dưới bản vẽ có:

- Menu **"Bỏ một danh mục"**: chọn danh mục không muốn.
- Menu **"Đổi tên một danh mục"**: chọn rồi gõ tên mới.
- Nút **➕ Thêm kênh**: gõ tên kênh và loại (`text` hoặc `voice`).
- Nút **💾 Lưu thành theme riêng**: giữ bản vẽ đã sửa làm theme của riêng bạn (Pro, xem phần 6).
- Nút **🏗️ Xây luôn đại ca** (xanh): bắt đầu xây.
- Nút **Để tui nghĩ lại**: huỷ, không tạo gì.

Bản vẽ giữ 15 phút. Quá giờ thì gõ `/build` lại. Chỉ người gõ lệnh và có quyền Administrator mới bấm được các nút này.

### 4.4. Xây

Bấm **Xây luôn đại ca**. Bot tạo từng thứ, mỗi thứ nghỉ một chút để Discord không chặn. Một lần xây mất khoảng một đến hai phút. Đừng bấm lại, cứ đợi bot báo xong.

Xong bạn sẽ thấy: các danh mục và kênh mới, role mới, tin luật ở kênh luật, lời chào, và một bảng nút ở kênh chọn role để thành viên tự lấy role sở thích. Nếu kênh có tên giống kênh bạn đã có, bot **bỏ qua**, không xoá và không tạo trùng.

### 4.5. Chạy hai lần có bị trùng không?

Không. Bot chỉ thêm cái còn thiếu, và không đăng lại luật hay lời chào đã có. Gói miễn phí được xây **hai lần** cho mỗi server (lần chạy lại một cấu hình đã xây rồi không tốn lượt).

### 4.6. Về nhạc và đọc chữ thành giọng nói (TTS)

Discord không cho bot mời bot khác. Nên trong kênh DJ và kênh TTS, Thầu đặt sẵn **nút mời** các bot nhạc và bot đọc chữ do chủ bot cấu hình. Bạn bấm nút một lần là xong.

## 5. Thiết kế bằng AI: `/thietke`

Dành cho gói **Pro trở lên**. Thay vì chọn theme có sẵn, bạn mô tả nhóm của mình, AI (Google Gemini) thiết kế một server riêng.

1. Gõ `/thietke`.
2. Ô **mota** (bắt buộc): viết một hai câu về nhóm, ví dụ: `8 người, chơi Valorant và Minecraft, hay tám chuyện khuya`. Tối đa khoảng 400 ký tự.
3. Tuỳ chọn **muc-do-hai** như ở `/build`.
4. Bot hiện **bản vẽ** y hệt phần 4.3, bạn xem, sửa, rồi bấm xây.

Điều cần biết:
- AI **không bao giờ xây thẳng**. Kết quả được lọc (bỏ lời tag người, bỏ từ cấm, giới hạn số lượng) rồi hiện bản vẽ cho bạn duyệt.
- Mô tả bạn gõ được gửi tới Google. Bot dùng gói miễn phí của Google nên **đừng viết thông tin riêng tư** (tên thật, số điện thoại, mật khẩu).
- Mỗi tháng có số lượt hạn chế: Pro 20 lượt, Plus 100 lượt.

## 6. Theme riêng, sao lưu và khôi phục (gói Pro)

### 6.1. Theme riêng: `/theme`

Sau khi sửa bản vẽ, bấm **Lưu thành theme riêng** và đặt tên. Sau này:

| Lệnh | Việc làm |
| --- | --- |
| `/theme danhsach` | Xem các theme riêng đã lưu |
| `/theme dung ten:<tên> [muc-do-hai]` | Mở lại bản vẽ từ theme đã lưu, rồi xây |
| `/theme xoa ten:<tên>` | Xoá một theme riêng (có hỏi xác nhận) |
| `/theme xuat ten:<tên>` | Tải theme về thành tệp `.json` để gửi bạn bè |
| `/theme nhap tep:<tệp> ten:<tên>` | Nhập theme từ tệp `.json` (tối đa 100 KB) |

Theme riêng không bao giờ mang theo quyền hạn, nên tệp từ người khác không thể lén cấp quyền cho ai.

### 6.2. Sao lưu: `/backup`

Sao lưu **chụp cấu trúc server**: role, danh mục, kênh, quyền theo role. **Không** chụp tin nhắn.

| Lệnh | Việc làm |
| --- | --- |
| `/backup tao ten:<tên>` | Chụp lại server hiện tại (tên 1 đến 40 ký tự) |
| `/backup danhsach` | Xem các bản đang giữ |
| `/backup khoiphuc ten:<tên>` | Tạo lại **phần còn thiếu** từ một bản |
| `/backup xoa ten:<tên>` | Xoá một bản |
| `/backup xuat ten:<tên>` | Tải bản sao lưu về tệp `.json` |
| `/backup nhap tep:<tệp> ten:<tên>` | Nhập bản từ tệp `.json` (tối đa 400 KB) |

Khôi phục **chỉ tạo thêm, không xoá và không sửa gì**, và không bao giờ cấp quyền Administrator. Trước khi làm, bot cho xem sẽ tạo những gì và hỏi xác nhận. Số bản được giữ: Pro 3, Plus 10.

Mẹo dùng: tạo một bản sao lưu ngay sau khi dựng xong server, và thêm một bản trước mỗi lần chỉnh lớn. Nếu lỡ ai xoá kênh, `/backup khoiphuc` dựng lại.

## 7. Giữ server sôi động

### 7.1. Điểm danh, cấp, bảng xếp hạng

Gói Pro trở lên bật các tính năng này cho cả server. Ai cũng dùng được, không cần quyền admin.

- `/diemdanh`: mỗi ngày một lần để lấy **điểm vui**. Điểm danh nhiều ngày liên tiếp có thêm thưởng chuỗi. Bỏ lỡ một ngày thì chuỗi về lại từ đầu.
- Điểm cao thì lên **cấp**, bot tự cấp role cấp độ (từ Tân Binh lên các bậc cao hơn).
- `/bangxephang`: 10 người nhiều điểm nhất server.

### 7.2. Mini-game

- `/doanso`: gõ không kèm số để mở vòng mới (bot nghĩ một số từ 1 đến 100). Gõ `/doanso so:50` để đoán. Bot nói cao hay thấp. Đoán trúng được điểm.
- `/thachdau nguoi:@bạn` : thách một người kéo búa bao. Cả hai chọn bằng nút, lựa chọn được giấu cho đến khi cả hai chọn xong. Người thắng được điểm.
- `/cauhoi`: mở một câu hỏi nhanh bốn đáp án A, B, C, D. Ai bấm đúng đầu tiên lấy điểm.
- `/roast nguoi:@bạn`: roast nhẹ một người cho vui. Không mod, không mute, chỉ mất lòng. Dùng được ở mọi gói.

Mỗi người có trần điểm mini-game mỗi ngày để không ai cày điểm.

### 7.3. Sự kiện định kỳ: `/sukien` (Pro)

Bot tự tạo **Sự kiện Discord** hằng tuần và báo cả server, nhắc trước.

- `/sukien tao ten:<tên> thu:<thứ> gio:<HH:mm> kenh:<phòng voice> [thoiluong] [vaitro] [mota]`
  - **thu**: chọn trong danh sách (Thứ Hai đến Chủ Nhật).
  - **gio**: dạng `20:00`, theo múi giờ của bot (mặc định giờ Việt Nam).
  - **kenh**: phòng voice hoặc stage nơi sự kiện diễn ra.
  - **thoiluong**: số phút, mặc định 120.
  - **vaitro**: role được nhắc khi có sự kiện.
- `/sukien mau mau:<mẫu> kenh:<phòng> [vaitro]`: lập nhanh từ mẫu `game-night`, `study-night`, `movie-night`, `chill-talk`.
- `/sukien danhsach`: xem các lịch đang có.
- `/sukien xoa ten:<tên>`: xoá một lịch.

Bot tạo sự kiện thật khi còn dưới 24 giờ là đến giờ, và không tạo trùng. Số lịch tối đa: Pro 3, Plus 10.

### 7.4. Hạng hoạt động: `/hang` (Pro)

Ngoài điểm danh, bot còn tính **điểm hoạt động (XP)** cho người hay chat và hay ngồi voice. Điểm này lên **cấp**, và cấp cao thì nhận role cấp độ.

Bot chỉ biết **ai nhắn ở kênh nào**, không đọc nội dung tin nhắn. Nên nhắn "a" hay nhắn cả đoạn văn đều được điểm như nhau.

- `/hang xem [nguoi]`: xem cấp, điểm và thứ hạng của bạn (hoặc của người bạn chọn). Ai cũng dùng được.
- `/hang caidat`: admin bật, tắt và chỉnh số. Tất cả ô đều không bắt buộc:
  - **bat**: bật hoặc tắt điểm hoạt động. Mặc định **tắt**, phải bật thì mới tính điểm.
  - **xptin**: điểm cho mỗi tin nhắn (1 đến 50, mặc định 5).
  - **cho**: số giây chờ giữa hai lần được điểm (10 đến 600, mặc định 60). Nhắn liên tục không được điểm thêm.
  - **toida**: điểm tối đa mỗi người mỗi ngày (50 đến 5000, mặc định 500).
  - **giong**: có tính điểm cho thời gian ngồi voice hay không (mặc định có).
  - **xpgiong**: điểm mỗi phút ngồi voice (0 đến 20, mặc định 2).
  - **kenh**: kênh báo khi ai đó lên cấp.

Về voice: bot chỉ tính phút khi bạn **không tắt tai nghe (deafen)**, không ở kênh AFK, và trong phòng có **ít nhất một người khác** đang nghe. Ngồi một mình hay treo máy không được điểm.

Bảng xếp hạng điểm hoạt động xem bằng `/bangxephang loai:Hoạt động chat và voice`. Bot lưu cho mỗi thành viên: điểm, số tin nhắn (chỉ là số đếm), số phút voice. Không lưu chữ nào. Mỗi server mở tối đa 10 bình chọn cùng lúc.

### 7.5. Menu nhận role bằng nút: `/vaitro` (admin)

Cho thành viên **tự bấm nút để nhận hoặc bỏ role** (ví dụ role game, role thông báo). Mỗi server tạo tối đa 3 menu ở gói Miễn phí, 10 ở Pro, 25 ở Plus.

1. Gõ `/vaitro tao tieude:<tiêu đề> chedo:<một hay nhiều> role1:<role>` và thêm `role2`, `role3`... (tối đa 10 role mỗi menu). Có thể đặt emoji cho từng role bằng `emoji1`, `emoji2`...
   - **Chọn một**: bấm role mới thì role cũ trong cùng menu tự rút.
   - **Chọn nhiều**: bấm role nào thì bật hoặc tắt role đó.
2. Bot đăng menu ngay ở kênh bạn đang đứng. Từ 6 role trở lên, menu thành một ô chọn thay vì nút.
3. `/vaitro danhsach`: xem các menu đang có. `/vaitro dang menu:<số> [kenh]`: đăng lại hoặc làm mới bảng của một menu (và đổi sang kênh khác nếu muốn). `/vaitro xoa menu:<số>`: xoá một menu.

Bot **chỉ cho phép role an toàn**: không phải role của bot khác, nằm thấp hơn role của bot, và không chứa quyền nguy hiểm như Administrator. Mỗi lần có người bấm, bot kiểm tra lại, nên role bị sửa thành nguy hiểm sau đó sẽ không được phát nữa.

### 7.6. Giveaway: `/quatang` (Pro)

Cần quyền **Quản lý server** (Manage Server). Người tham gia chỉ bấm một nút.

- `/quatang tao giai:<phần thưởng> thoigian:<bao lâu> [soluong] [yeucau]`: mở giveaway ở kênh hiện tại.
  - **thoigian**: chọn trong danh sách có sẵn.
  - **soluong**: số người trúng (1 đến 10, mặc định 1).
  - **yeucau**: chỉ ai có role này mới được tham gia.
- Thành viên bấm **Tham gia**. Bấm lần nữa thì rút lui. Mỗi người một suất.
- Hết giờ, bot **tự bốc thăm** công bằng, nhắc tên người trúng và chỉnh lại tin giveaway. Bot đang tắt đúng lúc hết giờ thì khi bật lên nó bốc bù.
- `/quatang huy so:<số>`: huỷ một giveaway đang chạy.
- `/quatang chonlai so:<số> [soluong]`: chọn thêm người cho giveaway đã kết thúc (không bao giờ chọn lại người đã trúng).
- `/quatang danhsach`: xem các giveaway gần đây.

Mỗi server chạy cùng lúc tối đa 10 giveaway.

### 7.7. Bình chọn ẩn danh: `/binhchon`

Cần quyền **Quản lý tin nhắn** (Manage Messages). Dùng được ở mọi gói.

1. Gõ `/binhchon cauhoi:<câu hỏi> lua1:<lựa chọn> lua2:<lựa chọn>`, có thể thêm tới `lua5`. Tuỳ chọn **thoigian**: tự đóng sau bao lâu. Bỏ trống thì đóng bằng nút.
2. Thành viên bấm nút để bầu. **Mỗi người một phiếu**, bấm lựa chọn khác thì đổi phiếu. Tin nhắn cập nhật ngay số phiếu và thanh phần trăm cho mọi người xem.
3. Bình chọn **ẩn danh**: tin nhắn chỉ hiện số phiếu, không hiện ai bầu gì.
4. Người tạo (và staff) bấm nút **Đóng** để chốt kết quả. Kết quả đăng đúng một lần.

## 8. Chăm sóc và bảo vệ server

Các công cụ dưới đây đều chạy **không cần đọc nội dung tin nhắn của ai**. Cài bằng lệnh hoặc bằng bảng điều khiển trên web (phần 9). Mục 8.1 đến 8.4 là bốn công cụ cơ bản, mục 8.5 trở đi là phần bảo vệ và quản trị.

### 8.1. Chào người mới: `/chaomung`

Khi có người vào server, bot đăng một lời chào hài hước (hoặc lời chào bạn tự viết), có thể cấp role "mới vào" và kèm nút xác minh.

Cách bot biết có người vào: Discord tự đăng thông báo "X đã vào server" ở **kênh hệ thống**. Bot nhận ra thông báo đó. Vì vậy **kênh hệ thống phải bật thông báo chào mừng**: Cài đặt máy chủ, mục **Tổng quan**, phần **Kênh tin nhắn hệ thống**, chọn một kênh và bật "Gửi tin nhắn chào mừng thành viên mới".

Cài đặt:

`/chaomung caidat` với các tuỳ chọn (tất cả không bắt buộc, điền cái nào cần):
- **kenh**: kênh đăng lời chào. Bỏ trống thì dùng kênh hệ thống.
- **vaitromoi**: role cấp ngay khi người mới vào.
- **vaitroxacminh**: role cấp sau khi người đó bấm nút xác minh.
- **tinnhan**: lời chào bạn tự viết, tối đa 500 ký tự. Dùng `{user}` để nhắc tên người mới, `{server}` để chèn tên server. Bỏ trống thì bot chọn câu hài ngẫu nhiên.
- **xacminh**: `True` để hiện nút **"Tui là người, không phải bot"** dưới lời chào. Cần có **vaitroxacminh**.

Các lệnh khác:
- `/chaomung thu`: xem thử lời chào, chỉ mình bạn thấy.
- `/chaomung tat`: tắt chào người mới.

Ví dụ dùng nút xác minh để chặn bot spam: tạo role `Chưa xác minh` có quyền rất hạn chế, đặt làm **vaitromoi**. Tạo role `Thành viên` đặt làm **vaitroxacminh**. Người mới bấm nút là thành thành viên thật.

Bot chỉ cấp những role **an toàn**: không phải role của bot khác, nằm thấp hơn role bot, và không chứa quyền nguy hiểm như Administrator. Role không đạt thì bot từ chối và nói rõ lý do.

Gói miễn phí: lời chào có thêm một dòng nhỏ "Lời chào do Thầu Xây Dựng lo". Gói trả phí không có dòng này.

### 8.2. Khám sức khoẻ server: `/khamsuckhoe`

Bot quét server và cho **điểm từ 0 đến 100**, kèm danh sách vấn đề theo mức độ: ví dụ `@everyone` đang có quyền nguy hiểm, kênh thông báo ai cũng viết được, chưa có luật, mức xác minh quá thấp.

- `/khamsuckhoe kiemtra`: khám ngay. Đừng bấm liên tục, mỗi lần khám gọi nhiều lệnh tới Discord.
- `/khamsuckhoe lichsu`: xem điểm 5 lần khám gần nhất, có biểu đồ xu hướng.

Kết quả có các nút:
- **Xem hết**: xem toàn bộ vấn đề.
- **Sửa an toàn (N)**: nếu có lỗi sửa được an toàn. Bot **cho xem đúng những gì sẽ đổi**, bạn xác nhận ("sửa đi") hoặc huỷ ("Thôi để tui nghĩ lại"). Không có gì tự đổi khi bạn chưa đồng ý.

Mọi gói đều dùng được. Nên khám mỗi khi đổi role hoặc mở rộng server.

### 8.3. AutoMod: `/automod`

AutoMod là bộ lọc **có sẵn của Discord**. Thầu chỉ cài luật giúp bạn, Discord là bên chặn. Nhờ vậy bot không đọc tin nhắn của ai.

Ba mức:

| Mức | Giá trị | Chặn gì | Gói |
| --- | --- | --- | --- |
| Nhẹ | `nhe` | Chống spam, chặn link mời server khác | Miễn phí |
| Vừa | `vua` | Mức Nhẹ, chống tag bừa (kèm cho nghỉ chat 60 giây), chặn chửi thề và lời lẽ xúc phạm | Pro |
| Gắt | `gat` | Mức Vừa, chặn nội dung 18+, và chặn mọi link nếu bạn bật | Pro |

Lệnh:
- `/automod bat muc:<nhe|vua|gat> [kenhlog] [chanlink]`
  - **kenhlog**: kênh nhận cảnh báo mỗi khi có tin bị chặn (nên là kênh riêng cho admin).
  - **chanlink**: `True` để chặn mọi link, chỉ chạy ở mức gắt.
- `/automod trangthai`: xem mức, các luật đang chạy, luật nào bị ai sửa hoặc xoá.
- `/automod mientru hanhdong:<them|xoa> role:<role>`: thêm hoặc bỏ **role được miễn AutoMod** (Pro). Ví dụ miễn cho role Admin, Mod.
- `/automod tat`: gỡ các luật do Thầu dựng. **Luật do chính bạn tự tạo trong Discord được giữ nguyên.**

Lưu ý: bot chỉ sửa và xoá đúng những luật nó đã tạo và ghi nhớ. Mức Vừa dùng hình phạt "cho nghỉ chat", cần quyền Moderate Members. Mời bot với quyền Administrator thì không sao.

### 8.4. Ticket hỗ trợ: `/ticket` (Pro)

Ticket là cách thành viên xin hỗ trợ **riêng tư**. Thành viên bấm nút trên một bảng, bot tạo ra một kênh riêng chỉ người đó và nhóm hỗ trợ (staff) thấy.

Cài đặt từng bước:

1. Chuẩn bị: một role cho nhóm hỗ trợ (ví dụ `Hỗ trợ`), một danh mục để chứa kênh ticket (ví dụ `🎫 Ticket`), một kênh chữ để đăng bảng, và nếu muốn một kênh nhật ký cho admin.
2. Gõ `/ticket caidat` và điền (đều không bắt buộc, điền những cái cần):
   - **kenh**: kênh đăng bảng ticket.
   - **role**: role staff. Staff chỉ được xem và nhắn trong các kênh ticket.
   - **danhmuc**: danh mục chứa kênh ticket.
   - **kenhlog**: kênh nhật ký, ghi ai mở, ai nhận, ai đóng (không ghi nội dung).
   - **tudong**: tự đóng ticket sau bao nhiêu **giờ im lặng**. `0` là tắt. Mặc định 48.
   - **toida**: mỗi người mở tối đa bao nhiêu ticket cùng lúc (1 đến 5).
3. Chọn loại ticket (không bắt buộc): `/ticket loai them ten:<tên hiện trên nút> [emoji]`, tối đa 5 loại, ví dụ "Hỗ trợ", "Báo lỗi", "Hợp tác". Xoá bằng `/ticket loai xoa ten:<tên>`.
4. Gõ `/ticket dang` để **đăng bảng** ở kênh đã chọn. Bảng có một nút cho mỗi loại.
5. Mỗi lần đổi loại hoặc cài đặt, gõ `/ticket dang` lại để cập nhật bảng.

Cách ticket chạy với người dùng:
- Thành viên bấm nút loại ticket. Bot tạo kênh riêng và gắn tên staff.
- Staff bấm **nhận** để báo "tôi lo vụ này".
- Khi xong, ai đó bấm **đóng** và nhập lý do. Kênh bị đóng.
- Nếu im lặng quá số giờ cài ở **tudong**, bot tự đóng.

Các lệnh còn lại: `/ticket danhsach` xem các ticket đang mở. `/ticket tat` tắt việc mở ticket mới (ticket đang mở giữ nguyên).

**Quyền riêng tư:** bot không lưu nội dung ticket, không lưu bản ghi cuộc trò chuyện. Chỉ ghi ai mở, ai đóng và thời điểm.

### 8.5. Chống raid và khoá khẩn cấp: `/khoakhan` (admin)

**Raid** là khi một đám đông (thường là tài khoản giả) ùa vào server cùng lúc để phá, spam link hoặc quảng cáo. Chống raid có ở **mọi gói**.

Cách bot biết có người vào: giống như phần chào người mới (8.1), bot đọc **thông báo "X đã vào server"** mà Discord tự đăng ở kênh hệ thống. Vì vậy kênh hệ thống phải bật thông báo chào mừng. Bot không cần quyền đọc danh sách thành viên.

**Bật và chỉnh:** `/khoakhan caidat` với các ô (đều không bắt buộc):
- **raid**: `True` để bật chống raid.
- **solan**: bao nhiêu người vào thì báo động (3 đến 50, mặc định 8).
- **giay**: trong bao nhiêu giây (10 đến 300, mặc định 30). Ví dụ 8 người trong 30 giây là báo động.
- **hanhdong**: làm gì khi có raid:
  - **Chỉ báo động**: bot chỉ nhắn cảnh báo, không đụng gì vào cài đặt server.
  - **Nâng mức xác minh** (mặc định): bot nâng mức xác minh của server lên một bậc, người mới khó vào hơn.
  - **Khoá kênh chat**: bot cấm @everyone gửi tin ở các kênh chat.
- **phut**: tự mở khoá sau bao nhiêu phút (1 đến 120, mặc định 10).
- **kenh**: kênh nhận báo động. Bỏ trống thì dùng kênh hệ thống. Nên chọn một kênh riêng cho admin.

**Khi báo động xuất hiện, làm gì?**

1. Bình tĩnh. Bot đã làm phần khẩn cấp theo cài đặt của bạn. Tin báo ghi rõ có bao nhiêu người vào trong bao nhiêu giây, và bot đã làm gì.
2. Nếu bot khoá hoặc nâng xác minh, tin báo có nút **Mở khoá**. **Chưa bấm vội.** Xem danh sách thành viên mới: người nào lạ, tên giống nhau, tài khoản mới tạo thì xử lý (đuổi hoặc cấm bằng `/kick`, `/ban`, xem mục 8.8).
3. Khi đã yên, bấm **Mở khoá** hoặc gõ `/khoakhan tat`. Không bấm thì bot **tự mở sau số phút bạn đã cài**.
4. Mở khoá trả mọi thứ **về đúng như trước**: kênh nào ban đầu cho phép thì cho phép lại, kênh nào không có ý kiến thì trả về không có ý kiến, mức xác minh hạ về mức cũ. Kênh nào bị ai chỉnh tay trong lúc khoá, hoặc đã bị xoá, bot **không đụng vào** và nói rõ ở tin trả lời.
5. Nếu bot báo thiếu quyền, cấp quyền (khoá kênh cần **Quản lý kênh** và **Quản lý role**, nâng xác minh cần **Quản lý server**), mời bot với quyền Administrator thì đủ hết.

**Tự khoá bằng tay:** `/khoakhan bat`. Dùng khi bạn tự thấy có chuyện (ví dụ đang bị spam). Bot khoá các kênh chat, và tự mở sau số phút đã cài. Gõ `/khoakhan tat` để mở sớm. Khoá và mở nhiều kênh mất một lúc, bot sẽ báo "đang làm" rồi trả kết quả.

**Xem tình trạng:** `/khoakhan trangthai` cho biết cổng đang khoá hay mở, các cài đặt chống raid và chống xoá hàng loạt, và bot còn thiếu quyền nào.

Nếu bot hay bị báo động nhầm vì server hay có sự kiện đông người, tăng **solan** hoặc đổi **hanhdong** thành "Chỉ báo động".

### 8.6. Chống xoá hàng loạt: bảo vệ khỏi "nuke" (Pro)

Đôi khi một người có quyền (hoặc một tài khoản admin bị hack) xoá hàng loạt kênh hoặc role để phá server. Tính năng này canh việc đó.

Bật bằng `/khoakhan caidat chongxoa:True`, chỉnh bằng:
- **xoasolan**: xoá bao nhiêu kênh hoặc role thì báo động (2 đến 10, mặc định 3).
- **xoagiay**: trong bao nhiêu giây (10 đến 600, mặc định 60).

Khi một người xoá đủ số lần trong khoảng thời gian đó, bot:
1. Nhắn báo động, nói **ai** xoá và xoá bao nhiêu thứ.
2. **Gỡ các role nguy hiểm** của người đó (Administrator, Quản lý server, Quản lý role, Quản lý kênh, Quản lý webhook, Cấm và Đuổi thành viên) để họ không xoá tiếp. Bot nhắn rõ đã gỡ role nào, và admin cấp lại bằng tay nếu hoá ra nhầm.

Bot **không bao giờ** đụng vào: chủ server, chính bot, role của bot khác, và những ai đứng ngang hoặc trên role của bot (bot không có quyền với họ). Với những trường hợp này bot chỉ báo động và ghi rõ lý do không gỡ được.

Điều kiện: bot cần quyền **Xem nhật ký kiểm tra (View Audit Log)** để biết ai xoá, và **Quản lý role** để gỡ role. Thiếu quyền xem nhật ký thì bot không biết ai xoá nên tính năng "ngủ". Chủ server tự xoá kênh thì bot không phản ứng.

Gỡ hết khi thấy lỗi: `/khoakhan caidat chongxoa:False`.

### 8.7. Nhật ký quản trị: `/khoakhan nhatky` (admin)

Nhật ký là một kênh riêng để admin xem lại **ai bị cấm, ai được gỡ cấm, role nào bị đổi quyền, AutoMod đã chặn ai**. Có ở mọi gói.

`/khoakhan nhatky` với các ô (đều không bắt buộc):
- **bat**: bật hoặc tắt nhật ký.
- **kenh**: kênh ghi nhật ký (chọn kênh chỉ admin xem được).
- **cam**: ghi cấm và gỡ cấm.
- **role**: ghi khi quyền của một role bị đổi (ghi rõ quyền nào thêm, quyền nào bớt).
- **automod**: ghi những lần AutoMod chặn tin. Bot ghi **luật nào, ai, ở kênh nào**, **không ghi nội dung tin bị chặn**.

Các lần cảnh cáo, timeout, đuổi, cấm làm qua lệnh của bot (mục 8.8) cũng được ghi vào đây kèm số hồ sơ.

Lưu ý về timeout: Discord không báo cho bot khi **người khác** timeout ai đó (trừ khi bot có quyền đặc biệt). Vì vậy nhật ký chỉ ghi các timeout làm bằng lệnh `/timeout` của bot.

### 8.8. Lệnh xử lý thành viên: `/canhcao`, `/timeout`, `/kick`, `/ban`, `/hoso`

Bốn lệnh xử lý và một lệnh xem hồ sơ. Mỗi lệnh chỉ hiện cho người có **đúng quyền Discord** tương ứng, và có ở mọi gói.

| Lệnh | Quyền cần có | Làm gì |
| --- | --- | --- |
| `/canhcao nguoi lydo` | Timeout thành viên (Moderate Members) | Cảnh cáo và ghi hồ sơ |
| `/timeout nguoi thoigian lydo` | Timeout thành viên | Bắt ngồi im: 60 giây, 5 phút, 1 giờ, 1 ngày hoặc 1 tuần |
| `/kick nguoi lydo` | Đuổi thành viên (Kick Members) | Đuổi ra khỏi server, vẫn vào lại được nếu có lời mời |
| `/ban nguoi lydo [xoatin]` | Cấm thành viên (Ban Members) | Cấm vào server. **xoatin** xoá tin nhắn của họ trong 0 đến 7 ngày gần nhất |
| `/hoso nguoi` | Timeout thành viên | Xem 10 hồ sơ gần nhất của một người |

**lydo** là bắt buộc, tối đa 300 ký tự. Mỗi lần xử lý, bot:
1. Kiểm tra **trước khi làm bất cứ gì**. Bot từ chối nếu: bạn tự xử mình, xử chủ server, xử bot, người đó **ngang hoặc cao hơn bạn** trong danh sách role, hoặc ngang hoặc cao hơn role của bot (kéo role bot lên cao, phần 2.5), hoặc định timeout một Administrator (Discord không cho).
2. Nhắn riêng cho người bị xử một tin ghi lý do (kick và ban nhắn **trước**, vì sau đó họ không còn chung server). Nếu họ khoá tin nhắn riêng thì bỏ qua, không sao.
3. Thực hiện và lưu một **hồ sơ có số** (ví dụ "hồ sơ #12"), rồi ghi vào nhật ký quản trị nếu đã bật.

`/hoso` giúp admin xem một người đã bị cảnh cáo hay xử mấy lần, bởi ai, vì sao, trước khi quyết định xử nặng hơn. Hồ sơ lưu theo **ID thành viên** và chỉ staff xem được. Lệnh `/xoadulieu` xoá luôn hồ sơ này cùng điểm hoạt động, giveaway, bình chọn và menu role của server.

`/kick`, `/timeout`, `/canhcao` chỉ dùng được với người **đang ở trong server**. `/ban` cấm được cả người đã rời (chọn từ danh sách).

### 8.9. Bản tin tuần và khám sức khoẻ hằng tuần

Bản tin tuần là **một tin tóm tắt mỗi tuần** gửi vào kênh mod, giúp bạn nắm server mà không phải đi xem từng chỗ. Có ở mọi gói.

Tin gồm: số người mới vào, số ticket đã mở và đã đóng, số tin bị AutoMod chặn, điểm sức khoẻ server so với tuần trước, và tối đa ba gợi ý việc nên làm (kèm nút **Sửa** cho những lỗi bot sửa được an toàn, bấm vào vẫn phải xác nhận). Bot **chỉ đếm số, không đọc tin nhắn của ai**.

Cách bật:
1. Khi chạy `/batdau`, chọn ô **Bản tin tuần** và **Khám sức khoẻ hằng tuần**, hoặc
2. Vào bảng điều khiển, tab **Báo cáo tuần**: bật, chọn kênh, chọn thứ và giờ gửi, và bấm **Gửi thử** để xem bản mẫu (bản gửi thử không tính vào lịch).

Khám sức khoẻ hằng tuần chạy mỗi tuần một lần. Nếu điểm **tụt 10 điểm trở lên** so với lần trước, bot nhắn một **cảnh báo riêng** nêu mấy chỗ đáng lo nhất và nút sửa an toàn (nếu có). Lần khám đầu tiên chưa có gì để so nên không báo.

Số người mới vào đếm theo thông báo chào của Discord, nếu bạn tắt thông báo đó thì số có thể thấp hơn thật.

### 8.10. Nhắc hết hạn gói

Gói Pro hoặc Plus sắp hết thì bot nhắn vào kênh của bản tin tuần (hoặc kênh báo động, hoặc kênh hệ thống):
- **Trước 3 ngày**: "gói sắp hết hạn", kèm ngày giờ hết.
- **Khi đã hết hạn**: "gói đã hết, server về gói Miễn phí". Cài đặt vẫn còn, chỉ tính năng trả phí tạm nghỉ.

Mỗi lần hết hạn chỉ nhắc **một lần mỗi loại**. Gia hạn xong thì lần hết hạn mới được nhắc riêng. Gia hạn bằng `/mua` hoặc `/goi`, số ngày mới được cộng nối vào hạn cũ.

### 8.11. Trợ lý viết giúp: `/vietgiup` (Pro)

Không biết viết luật hay lời chào thế nào? Mô tả bằng vài chữ, AI viết **bản nháp** cho bạn. Cần quyền Administrator.

| Lệnh | Việc làm |
| --- | --- |
| `/vietgiup luat mota:<...>` | Viết bộ luật ngắn 4 đến 7 dòng |
| `/vietgiup loichao mota:<...>` | Viết lời chào người mới (có chỗ gọi tên `{user}`) |
| `/vietgiup thongbao mota:<...>` | Viết bài thông báo có tiêu đề |
| `/vietgiup giaithich` | Giải thích **kết quả khám sức khoẻ gần nhất** bằng lời dễ hiểu |

`mota` tối đa 300 ký tự, ví dụ: "server học nhóm cho lớp 12, cần luật vui nhưng nghiêm chuyện gian lận". Bot trả bản nháp chỉ mình bạn thấy. **Bot không tự đăng gì.** Bạn đọc, rồi chọn kênh và bấm đăng, hoặc bấm sao chép để tự dán chỗ khác.

Cần biết:
- Mỗi bản nháp dùng **một lượt AI**, trừ chung với lượt của `/thietke` (Pro 20 lượt mỗi tháng, Plus 100). AI lỗi thì không trừ lượt.
- Mô tả của bạn được gửi tới Google, đừng viết thông tin riêng tư.
- Bản nháp được lọc: bỏ lời tag người, bỏ link và từ cấm. Vẫn nên đọc lại trước khi đăng.
- `/vietgiup giaithich` cần đã có ít nhất một lần khám (`/khamsuckhoe kiemtra`).

### 8.12. Xem nhanh mọi lệnh: `/trogiup`

Gõ `/trogiup` ở bất kỳ đâu trong server (ai cũng dùng được). Bot hiện danh sách lệnh **chia theo nhóm**: dựng server, bảo vệ, giữ server sôi động, gói và thanh toán, khác. Lệnh nào thuộc gói cao hơn gói hiện tại thì ghi 🔒 kèm tên gói cần có. Đầu bảng có ba dòng "bắt đầu nhanh" và một nút **Mở sổ tay** để quay lại cuốn sổ này.

## 9. Bảng điều khiển trên web

Bảng điều khiển cho phép chỉnh chào người mới, AutoMod, ticket, bảo vệ, điểm hoạt động, bản tin tuần, nhật ký quản trị, khám sức khoẻ và xem gói, ngay trên trình duyệt, không cần gõ lệnh.

**Địa chỉ:** https://nhaajt.tailc4c5ef.ts.net:10000

Cách vào:
1. Mở địa chỉ trên.
2. Bấm đăng nhập bằng Discord. Discord hỏi bạn có cho phép trang đọc **tên và danh sách server** của bạn không. Bấm **Cho phép**. Trang chỉ đọc hai thứ đó, rồi huỷ quyền ngay.
3. Chọn server. Chỉ hiện những server mà **bạn là Administrator và bot đang ở trong**. Không thấy server của mình: kiểm tra bot đã được mời và bạn có quyền Administrator.
4. Chọn tab:
   - **Tổng quan**: gói hiện tại, mức dùng, điểm sức khoẻ, tính năng nào đang bật, ticket đang mở.
   - **Chào mừng**, **AutoMod**, **Ticket**: như các lệnh ở mục 8.1, 8.3, 8.4.
   - **Bảo vệ**: bật chống raid và chống xoá hàng loạt, chỉnh số người, số giây, hành động, kênh báo động. Cho biết cổng đang khoá hay mở, có nút **Mở khoá** (mục 8.5 và 8.6).
   - **Điểm hoạt động**: bật tắt và chỉnh XP chat và voice (mục 7.4).
   - **Báo cáo tuần**: bật bản tin tuần và khám hằng tuần, chọn kênh, thứ, giờ, và nút **Gửi thử** (mục 8.9).
   - **Nhật ký quản trị**: bật nhật ký, chọn kênh và loại việc cần ghi (mục 8.7).
   - **Hoạt động**: các con số hoạt động của server theo thời gian.
   - **Khám sức khoẻ**, **Gói và thanh toán**.

Ghi chú:
- Mỗi lần bạn thay đổi, trang kiểm tra lại với Discord xem bạn có **còn là admin** không.
- Ở tab Khám sức khoẻ, bấm **Khám lại** để chạy khám và dùng các nút **Sửa**.
- Nút chuyển sáng/tối ở góc trên phải. Nút bên cạnh là đăng xuất.
- Tính năng của gói Pro hiện khoá ở gói Miễn phí, kèm nhãn **PRO**.

Nếu trang không mở: xem phần 13.

## 10. Gói, giá, dùng thử và thanh toán

### 10.1. Các gói

| | Miễn phí | Pro | Plus |
| --- | --- | --- | --- |
| Giá mỗi server | 0 | 3,99 đô mỗi 30 ngày | 7,99 đô mỗi 30 ngày |
| Mua một năm (365 ngày) | | 39,90 đô (trả 10 tháng, tặng 2 tháng) | 79,90 đô (trả 10 tháng, tặng 2 tháng) |
| Theme mỗi lần xây | 1 | tối đa 4 (trộn) | tối đa 4 (trộn) |
| Số lần xây | 2 lần | không giới hạn | không giới hạn |
| Chọn mức hài | không | có | có |
| Dựng nhanh `/batdau`, khám sức khoẻ, chào người mới | có | có | có |
| Chống raid, khoá khẩn cấp, nhật ký quản trị | có | có | có |
| Lệnh xử lý thành viên (cảnh cáo, timeout, kick, ban, hồ sơ) | có | có | có |
| Bình chọn `/binhchon`, bản tin tuần, nhắc hết hạn | có | có | có |
| AutoMod | mức Nhẹ | cả ba mức, miễn trừ role | cả ba mức, miễn trừ role |
| Menu nhận role `/vaitro` | 3 menu | 10 menu | 25 menu |
| Thiết kế bằng AI mỗi tháng | 0 | 20 | 100 |
| Trợ lý viết giúp `/vietgiup` | không | có | có |
| Chống xoá hàng loạt | không | có | có |
| Điểm hoạt động `/hang` | không | có | có |
| Giveaway `/quatang` | không | có | có |
| Ticket | không | có | có |
| Sao lưu | 0 | 3 | 10 |
| Theme riêng | 0 | 3 | 10 |
| Sự kiện định kỳ | 0 | 3 | 10 |
| Điểm danh, mini-game | không | có | có |

Gói tính **theo từng server**, không theo tài khoản. Hết hạn thì server tự về gói Miễn phí và những gì đã xây vẫn ở lại. Bot nhắc trước 3 ngày và khi hết hạn (mục 8.10).

Có thêm một lựa chọn **trả một lần**, không cần đăng ký: **Dựng giúp, 4,99 đô**, nhận **7 ngày Pro** (đủ để dựng và cài xong cả server rồi tính tiếp). Chọn ở lệnh `/mua`.

Gõ `/goi` bất cứ lúc nào để xem gói hiện tại, hạn dùng và số lần đã xây.

### 10.2. Dùng thử miễn phí: `/dungthu`

Gõ `/dungthu` (cần quyền Administrator). Server nhận **7 ngày Pro miễn phí, một lần duy nhất cho mỗi server**. Không cần thẻ, không tự gia hạn. Hết 7 ngày về Miễn phí. Dùng rồi thì không dùng lại được kể cả khi xoá dữ liệu.

### 10.3. Mua bằng thẻ hoặc QR (tự động): `/mua`

1. Gõ `/mua goi:<Pro, Plus hoặc Dựng giúp> [ngay:<30, 90, 180 hoặc 365>] [cach:<stripe hoặc payos>]`. Mặc định 30 ngày. Ô `ngay` bỏ qua với **Dựng giúp** (luôn là 7 ngày Pro). Ô `cach` chọn cách trả: **Stripe** (thẻ quốc tế, tính bằng đô, là mặc định khi Stripe đã bật) hoặc **payOS** (QR ngân hàng Việt Nam, tính bằng đồng).
2. Bảng giá theo số ngày (đô):

   | Số ngày | Pro | Plus |
   | --- | --- | --- |
   | 30 | 3,99 | 7,99 |
   | 90 | 11,97 | 23,97 |
   | 180 | 23,94 | 47,94 |
   | 365 | 39,90 | 79,90 |
   | Dựng giúp (7 ngày Pro, một lần) | 4,99 | |

   Một năm chỉ tính 10 tháng. Còn lại tính 3,99 hoặc 7,99 nhân với số tháng.
3. Bot hiện số tiền kèm nút **Thanh toán**. Với Stripe là giá đúng như bảng giá. Với payOS, số đồng được quy từ giá đô theo tỷ giá bot đang dùng, làm tròn đến nghìn đồng, tối thiểu 2.000 đồng.
4. Bấm nút. Với Stripe, trang thanh toán của Stripe mở ra, bạn nhập thẻ ở đó (bot không bao giờ thấy số thẻ). Với payOS, trang hiện mã QR, bạn quét bằng app ngân hàng và chuyển **đúng số tiền**, không sửa nội dung.
5. Tiền về, trong khoảng một phút bot tự bật gói và nhắn vào kênh nơi bạn gõ lệnh. Không cần nhập mã.
6. Liên kết thanh toán **sống 30 phút**. Quá giờ thì gõ `/mua` lại để lấy liên kết mới. Mỗi server giữ tối đa vài đơn đang chờ cùng lúc, nên đừng bấm `/mua` liên tục.

Mua gia hạn thì số ngày được **cộng nối vào hạn hiện tại**.

**Dựng giúp** chỉ bán cho server **chưa có gói trả phí**. Nếu server đã là Pro hoặc Plus, bot từ chối và bảo bạn chọn Pro hoặc Plus để gia hạn.

Nếu bot nói "Thanh toán tự động chưa được bật": chủ bot chưa cài Stripe hay payOS (xem phụ lục A và B). Dùng mã kích hoạt ở mục dưới.

### 10.4. Mua bằng mã kích hoạt: `/kichhoat`

Nếu bạn mua trực tiếp từ chủ bot, bạn nhận một **mã** dạng `THAU-XXXX-XXXX-XXXX`.

1. Gõ `/kichhoat ma:THAU-XXXX-XXXX-XXXX`.
2. Gói bật ngay, bot báo ngày hết hạn.

Mỗi mã chỉ dùng **một lần**. Hai mã cùng loại gói thì ngày được cộng nối tiếp.

## 11. Dọn dẹp và xoá dữ liệu

### 11.1. Gỡ những gì bot đã xây: `/nuke`

`/nuke` xoá những kênh và role **do bot tạo**. Nó chỉ đụng những thứ nó đã ghi lại theo ID, **không bao giờ xoá theo tên**, nên kênh bạn tự tạo an toàn. Bot hỏi xác nhận với hai nút **Đập đi** và **Thôi tha cho nó**.

Trước khi bấm, nhớ: xoá kênh thì tin nhắn trong đó **mất vĩnh viễn**.

### 11.2. Xoá dữ liệu của server: `/xoadulieu`

Bot **quên** toàn bộ những gì nó lưu về server: danh sách đã xây, mọi cài đặt (chào mừng, AutoMod, ticket, bảo vệ, điểm hoạt động, bản tin tuần, nhật ký), điểm hoạt động và điểm danh của thành viên, hồ sơ xử lý, giveaway và người tham gia, bình chọn, menu role, ticket, bản sao lưu và theme riêng. Nếu server đang bị khoá khẩn cấp, bot **mở khoá trước** rồi mới xoá, để kênh không bị kẹt ở trạng thái khoá.

**Kênh và role trên Discord vẫn còn**, kể cả luật AutoMod còn trên server (bot sẽ gỡ luật do nó tạo và nhắn nếu còn sót). **Gói trả phí, số lần dùng, dấu "đã dùng thử" và đơn thanh toán vẫn được giữ** để giới hạn gói còn đúng và để đối chiếu tiền. Phễu thống kê của chủ bot chỉ giữ ID server và thời điểm, không có người dùng hay nội dung nào.

Khi cần: bạn muốn bot không còn lưu gì về server, hoặc đuổi bot ra khỏi server.

## 12. Dành cho chủ bot: vận hành bot trên Raspberry Pi

Phần này chỉ cần với **chủ bot** (người chạy bot, không phải người mua).

### 12.1. Mô hình chạy

Bot chạy trong **Docker** trên Raspberry Pi tại thư mục `~/buildDISCORD`. Dữ liệu nằm ở `~/buildDISCORD/data` (cơ sở dữ liệu SQLite `thauxaydung.db`, sao lưu mỗi ngày vào `data/backups`, giữ 7 bản). Bot tự khởi động lại nếu sập (`restart: unless-stopped`).

Kết nối vào Pi: `ssh nhaajt@10.0.0.69` (khi bạn đang ở cùng mạng nhà). Hoặc làm trực tiếp trên Pi.

### 12.2. Các lệnh trên Pi

Tất cả chạy trong `cd ~/buildDISCORD`.

| Việc | Lệnh |
| --- | --- |
| Xem bot đang chạy | `docker ps --filter name=thauxaydung` |
| Xem nhật ký (log) | `docker logs thauxaydung --tail 50` |
| Theo dõi log trực tiếp | `docker logs -f thauxaydung` (thoát bằng Ctrl+C) |
| Khởi động lại | `docker compose restart` |
| Dừng | `docker compose down` |
| Chạy | `docker compose up -d` |
| Cập nhật lên bản mới tay | `git pull --ff-only && docker compose up -d --build` |
| Đăng ký lệnh slash (sau khi có lệnh mới) | `docker compose run --rm bot node src/deploy-commands.js` |
| Sửa cấu hình | `nano .env`, lưu bằng Ctrl+O rồi Enter, thoát Ctrl+X, rồi `docker compose up -d` |
| Kiểm tra giờ chạy cập nhật tự động | `systemctl list-timers thauxaydung-update.timer` |
| Chạy cập nhật tự động ngay | `sudo systemctl start thauxaydung-update.service` |
| Xem log cập nhật | `journalctl -u thauxaydung-update.service -n 30 --no-pager` |

Chú ý khi gõ: **lệnh phải trên một dòng**, ví dụ `docker compose run --rm bot node src/deploy-commands.js`. Gõ thiếu phần cuối sẽ mở màn hình Node, thoát bằng Ctrl+C hai lần.

**Đừng** chạy `docker image prune` hay `docker system prune` trên Pi: chúng xoá cả ảnh Docker của các dự án khác.

### 12.3. Cập nhật tự động

Có một bộ hẹn giờ mỗi ngày: nó kéo bản mới từ GitHub, xây lại, đợi bot khoẻ (health check) rồi mới giữ bản mới. Nếu bản mới lỗi thì **tự quay về bản cũ**. Sau cập nhật có lệnh slash mới, bạn phải tự chạy lệnh đăng ký lệnh ở bảng trên.

### 12.4. Các biến trong `.env`

Tệp `~/buildDISCORD/.env` giữ bí mật của bot. **Không gửi tệp này cho ai, không đưa lên GitHub.** Sửa xong phải chạy `docker compose up -d`.

| Biến | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `DISCORD_TOKEN` | có | Mã bot, lấy ở Developer Portal, mục Bot |
| `CLIENT_ID` | có | Application ID của ứng dụng |
| `GUILD_ID` | không | Để trống thì lệnh đăng ký toàn cầu. Điền ID một server thì lệnh hiện ngay ở server đó |
| `OWNER_IDS` | không | ID người dùng (cách nhau dấu phẩy) được dùng `/admin` |
| `MUSIC_BOT_INVITE_URL`, `TTS_BOT_INVITE_URL` | không | Đường dẫn mời bot nhạc và bot đọc chữ, hiện thành nút trong kênh DJ và TTS |
| `GEMINI_API_KEY` | không | Khoá của Google AI Studio (https://aistudio.google.com/apikey). Không có thì `/thietke` tắt |
| `GEMINI_MODEL` | không | Tên mô hình AI. Để trống thì bot tự chọn mô hình flash ổn định mới nhất |
| `STRIPE_SECRET_KEY` | không | Khoá bí mật hoặc khoá giới hạn của Stripe (bắt đầu bằng `sk_` hoặc `rk_`). Có khoá này thì `/mua` nhận thẻ |
| `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` | không | Ba khoá payOS (QR ngân hàng Việt Nam). Điền đủ ba thì cách trả payOS bật |
| `USD_VND_RATE` | không | Số đồng một đô, mặc định 26000. Cập nhật khi tỷ giá lệch nhiều |
| `SITE_URL` | không | Nơi payOS đưa khách về sau khi trả hoặc huỷ |
| `TIMEZONE` | không | Múi giờ cho điểm danh và sự kiện, mặc định `Asia/Ho_Chi_Minh` |
| `CONTACT_TEXT` | không | Câu bot nói khi khách hỏi cách mua mã |
| `ALERT_WEBHOOK_URL` | không | Webhook Discord nhận báo lỗi và "bot đã khởi động" |
| `UNLOCKED_GUILD_IDS` | không | ID các server được mở khoá **mọi tính năng, không giới hạn**, không cần mua (server của bạn và server thử) |
| `DISCORD_CLIENT_SECRET`, `SESSION_SECRET`, `DASHBOARD_URL` | không | Ba biến bật bảng điều khiển web. Hiện đã điền sẵn |
| `DASHBOARD_PORT`, `DASHBOARD_HOST` | không | Cổng (mặc định 8788) và địa chỉ bind |
| `DATA_DIR` | không | Thư mục dữ liệu (mặc định `data`) |
| `BUILD_STEP_DELAY_MS` | không | Nghỉ sau mỗi kênh hay role khi xây (mặc định 350) |

### 12.5. Lệnh của chủ bot: `/admin`

Chỉ người có ID trong `OWNER_IDS` dùng được.

| Lệnh | Việc làm |
| --- | --- |
| `/admin taoma goi:<pro/plus> ngay:<số>` | Tạo một mã kích hoạt dùng một lần (để bán tay) |
| `/admin cap server:<ID> goi:<pro/plus> ngay:<số>` | Cấp gói thẳng cho một server, không cần mã |
| `/admin thuhoi server:<ID>` | Chấm dứt gói trả phí của một server |
| `/admin thongke` | Số server theo từng gói, và **phễu 30 ngày**: bao nhiêu server được mời, chạy xong `/batdau`, dựng xong, dùng thử Pro, trả tiền (kèm phần trăm so với số server được mời) |
| `/admin donhang` | 10 đơn thanh toán gần nhất (đơn Stripe hiện bằng đô, đơn payOS bằng đồng) |

Phễu chỉ đếm **số server** đi qua từng bước, không lưu tên người hay nội dung nào. Dùng nó để biết khách rớt ở bước nào: nếu nhiều server được mời mà ít server chạy `/batdau` thì tin chào có nút Bắt đầu chưa đủ nổi, nếu nhiều server dựng xong mà ít server dùng thử thì cần nhắc họ `/dungthu`.

Cách đơn giản nhất để tạo mã là `/admin taoma` trong Discord. Bot trả mã một lần, bạn gửi mã đó cho khách.

### 12.6. Mở khoá server của bạn

Server của bạn và server thử nghiệm cần mở hết tính năng, không bị giới hạn gói:

1. Lấy ID server (xem phần 1, bật Chế độ nhà phát triển, chuột phải vào tên server, **Sao chép ID**).
2. Trên Pi: `nano ~/buildDISCORD/.env`, tìm dòng `UNLOCKED_GUILD_IDS=` và điền ID. Nhiều server thì cách nhau dấu phẩy, không có khoảng trắng.
3. `docker compose up -d`.
4. Trong server đó gõ `/goi`: gói hiển thị **"Mở khoá (chủ bot)"**.

### 12.7. Bảng điều khiển trên Pi

Bảng điều khiển chạy trong cùng bot, ở cổng 8788 của Pi, và được đưa ra internet bằng **Tailscale Funnel** tại địa chỉ https://nhaajt.tailc4c5ef.ts.net:10000.

- Xem trạng thái: `tailscale funnel status`
- Tắt công khai: `tailscale funnel --https=10000 off`
- Bật lại: `tailscale funnel --bg --https=10000 8788`
- Trong Developer Portal, mục OAuth2, **Redirects** phải có đúng dòng: `https://nhaajt.tailc4c5ef.ts.net:10000/auth/callback`

Nếu bạn đổi địa chỉ, cập nhật cả Redirects và `DASHBOARD_URL`.

### 12.8. Sao lưu và khôi phục cơ sở dữ liệu

- Sao lưu tự động nằm trong `~/buildDISCORD/data/backups`, mỗi ngày một bản, giữ 7 bản gần nhất.
- Muốn khôi phục: dừng bot (`docker compose down`), chép đè bản sao lưu lên `data/thauxaydung.db`, rồi `docker compose up -d`.
- Nên chép thư mục `data/backups` sang máy khác thỉnh thoảng, vì nếu thẻ nhớ Pi hỏng thì mất cả bản sao.

### 12.9. Kiểm tra bot có đang sống không: trang trạng thái

- Trang web: https://builddiscord.vercel.app/status. Trang đọc địa chỉ `https://nhaajt.tailc4c5ef.ts.net:10000/status` ngay trong trình duyệt và hiện bot còn sống không, bao lâu rồi, phiên bản nào. Không đọc được thì trang ghi "không kiểm tra được", đừng hoảng ngay: có thể Funnel đang tắt chứ bot vẫn chạy.
- Kiểm tra bằng tay trên Pi: `curl http://127.0.0.1:8788/status`. Kết quả mẫu: `{"ok":true,"uptimeSec":3600,"version":"1.6.0","guilds":0,"lastHeartbeatAgeSec":4}`. `lastHeartbeatAgeSec` lớn hơn vài chục giây nghĩa là bot đang treo.
- Số server được làm tròn xuống chục để không lộ số liệu chính xác.

## 13. Chuyện gì xảy ra khi có sự cố

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
| --- | --- | --- |
| Gõ `/` không thấy lệnh của bot | Lệnh mới chưa kịp đăng ký, hoặc Discord chưa tải lại | Đợi vài phút, Ctrl+R trong Discord. Chủ bot: chạy lệnh đăng ký lệnh (phần 12.2) |
| Bot offline (không sáng xanh) | Container dừng, hoặc token sai | Trên Pi: `docker ps`, rồi `docker logs thauxaydung --tail 50` |
| Bot báo thiếu quyền | Role của bot quá thấp hoặc thiếu quyền | Kéo role Thầu Xây Dựng lên cao (phần 2.5), mời lại bot với quyền Administrator |
| `/build` hoặc `/batdau` báo đã dùng hết lượt | Gói Miễn phí được xây hai lần | `/dungthu` để thử Pro, hoặc mua gói (Dựng giúp 4,99 đô cho 7 ngày Pro) |
| Lệnh báo "gói Pro trở lên" | Tính năng thuộc gói trả phí | `/dungthu`, `/mua`, hoặc `/kichhoat` |
| Không có lời chào người mới | Kênh hệ thống chưa bật thông báo chào mừng | Cài đặt máy chủ, Tổng quan, bật thông báo ở kênh hệ thống (phần 8.1) |
| Nút xác minh không cấp role | Role xác minh nằm cao hơn role bot, hoặc có quyền nguy hiểm | Kéo role bot lên cao hơn role đó, bỏ quyền nguy hiểm khỏi role |
| AutoMod không tạo được luật | Bot thiếu quyền quản lý server hoặc Moderate Members | Mời lại với quyền Administrator |
| Ticket không mở được | Thiếu danh mục hoặc kênh | Chạy lại `/ticket caidat`, rồi `/ticket dang` |
| `/mua` báo "chưa bật" | Chưa điền khoá Stripe hay payOS | Chủ bot làm phụ lục A (hoặc B) |
| Đã trả tiền mà gói chưa bật | Bot đợi tối đa vài chục giây, hoặc (payOS) chuyển sai số tiền | Đợi 2 phút. Quá lâu thì chủ bot gõ `/admin donhang` xem đơn, đối chiếu với Stripe hoặc payOS, rồi `/admin cap` cấp tay nếu tiền đã về |
| Không thấy tin chào có nút Bắt đầu | Bot không có quyền gửi tin ở kênh hệ thống hay kênh chữ nào | Gõ `/batdau` ở bất kỳ kênh nào |
| Chống raid không báo gì dù có người vào đông | Chưa bật `raid:True`, hoặc kênh hệ thống tắt thông báo chào mừng | `/khoakhan trangthai` để xem, bật thông báo chào mừng ở kênh hệ thống (mục 8.1) |
| `/khoakhan bat` báo thiếu quyền | Khoá kênh cần Quản lý kênh và Quản lý role, nâng xác minh cần Quản lý server | Mời lại bot với quyền Administrator |
| Sau khi mở khoá vẫn còn kênh bị khoá | Kênh đó bị ai chỉnh tay trong lúc khoá, hoặc bot không đủ quyền với nó | Bot đã báo tên kênh. Mở tay trong cài đặt kênh |
| Chống xoá hàng loạt "ngủ" | Bot thiếu quyền Xem nhật ký kiểm tra | Cấp quyền này (hoặc Administrator) |
| `/kick`, `/ban`, `/timeout` bị từ chối | Người đó ngang hoặc cao hơn bạn hoặc bot trong danh sách role, hoặc là chủ server | Kéo role bot lên cao hơn (mục 2.5). Không xử được chủ server |
| Không ai được điểm hoạt động | `/hang caidat bat:True` chưa chạy, hoặc server ở gói Miễn phí | Bật, và cần Pro (`/dungthu` để thử) |
| Ngồi voice mà không được điểm | Đang tắt tai nghe, ở kênh AFK, hoặc ngồi một mình | Cần ít nhất một người khác đang nghe (mục 7.4) |
| Giveaway không tự bốc thăm | Bot đang tắt hoặc không còn trong server lúc hết giờ | Bật bot lên, nó bốc bù. Hoặc `/quatang chonlai` |
| Nút menu role không cấp role | Role nằm cao hơn role bot, hoặc có quyền nguy hiểm | Kéo role bot lên cao hơn, bỏ quyền nguy hiểm (mục 7.5) |
| Không nhận được bản tin tuần | Chưa bật, chưa chọn kênh, hoặc bot không gửi được vào kênh đó | Bảng điều khiển, tab Báo cáo tuần, bấm Gửi thử |
| `/vietgiup` báo hết lượt hoặc AI chưa bật | Hết lượt AI của tháng, hoặc chưa có `GEMINI_API_KEY` | Chờ sang tháng, hoặc chủ bot thêm khoá |
| Trang web bảng điều khiển không mở | Funnel tắt, hoặc bot chưa chạy | Chủ bot: `tailscale funnel status`, `docker logs thauxaydung --tail 20` (phải có dòng `Dashboard:`) |
| Đăng nhập web báo "invalid redirect_uri" | Redirect trong Developer Portal chưa lưu đúng | Thêm đúng dòng ở phần 12.7 rồi bấm Lưu |
| Đăng nhập web xong không thấy server nào | Bạn không phải Administrator, hoặc bot chưa ở trong server đó | Kiểm tra quyền, mời bot |
| `/thietke` báo AI chưa bật | Chưa có `GEMINI_API_KEY` | Chủ bot thêm khoá |
| Mọi thứ hỏng không rõ lý do | Nhiều | `docker logs thauxaydung --tail 100`, gửi nguyên văn lỗi cho người hỗ trợ |

### Một số tình huống thường gặp với tính năng mới

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
| --- | --- | --- |
| `/mua goi:Dựng giúp` bị từ chối | Server đã có gói trả phí | Chọn Pro hoặc Plus để gia hạn |
| `/dungthu` báo đã dùng | Mỗi server chỉ dùng thử một lần, kể cả sau khi xoá dữ liệu | Mua gói hoặc Dựng giúp |
| `/khoakhan bat` báo thiếu quyền | Khoá kênh cần cả Manage Channels và Manage Roles | Mời lại bot với quyền Administrator |
| Raid mà không có báo động | Server tắt thông báo "đã vào server" ở kênh hệ thống | Cài đặt máy chủ, Tổng quan, bật lại thông báo chào mừng |
| Bản tin tuần không tới | Chưa chọn kênh nhận, hoặc thiếu quyền gửi vào kênh đó | Chọn kênh trong tab Bản tin của bảng điều khiển |
| `/hang` không thấy điểm tăng | Tính năng điểm hoạt động chưa bật, hoặc chưa qua thời gian chờ giữa hai lần cộng | Bật trong tab Hoạt động, đợi theo thời gian chờ đã cài |
| Nút role không cấp role | Role nằm cao hơn role bot, hoặc đã mang quyền nguy hiểm | Kéo role bot lên trên, bỏ quyền nguy hiểm khỏi role |
| Giveaway không chốt đúng giờ | Bot chạy lại giữa chừng | Bot tự chốt ở lần kiểm tra kế tiếp, mỗi giveaway chốt đúng một lần |

## 14. Bảng tất cả các lệnh

Cột "Ai dùng" cho biết quyền cần có. **Admin** nghĩa là cần quyền Administrator trong server.

| Lệnh | Ai dùng | Gói | Việc làm |
| --- | --- | --- | --- |
| `/batdau` | Admin | Mọi gói | Dựng và cài đặt nhanh bằng ba ô chọn và một nút |
| `/trogiup` | Mọi người | Mọi gói | Danh sách lệnh chia theo nhóm |
| `/build theme [theme2..theme4] [muc-do-hai]` | Admin | Free (1 theme, 2 lần). Trộn và mức hài: Pro | Dựng cả server, có bản vẽ để sửa |
| `/thietke mota [muc-do-hai]` | Admin | Pro | AI thiết kế server |
| `/vietgiup luat, loichao, thongbao, giaithich` | Admin | Pro | AI viết bản nháp luật, lời chào, thông báo, giải thích kết quả khám |
| `/theme danhsach, dung, xoa, xuat, nhap` | Admin | Pro | Theme riêng |
| `/backup tao, danhsach, khoiphuc, xoa, xuat, nhap` | Admin | Pro | Sao lưu cấu trúc server |
| `/sukien tao, danhsach, xoa, mau` | Admin | Pro | Sự kiện hằng tuần |
| `/diemdanh` | Mọi người | Pro | Điểm danh hằng ngày |
| `/bangxephang [loai]` | Mọi người | Pro | Top 10 điểm vui hoặc điểm hoạt động |
| `/doanso [so]` | Mọi người | Pro | Đoán số 1 đến 100 |
| `/thachdau nguoi` | Mọi người | Pro | Kéo búa bao |
| `/cauhoi` | Mọi người | Pro | Câu hỏi nhanh |
| `/hang xem [nguoi]` | Mọi người | Pro | Cấp độ, điểm và hạng hoạt động |
| `/hang caidat` | Admin | Pro | Bật tắt và chỉnh điểm hoạt động |
| `/vaitro tao, dang, danhsach, xoa` | Admin | Free 3 menu, Pro 10, Plus 25 | Menu nhận role bằng nút |
| `/quatang tao, huy, chonlai, danhsach` | Quản lý server | Pro | Giveaway có nút Tham gia, tự bốc thăm |
| `/binhchon cauhoi lua1..lua5 [thoigian]` | Quản lý tin nhắn | Mọi gói | Bình chọn ẩn danh |
| `/roast nguoi` | Mọi người | Mọi gói | Roast nhẹ |
| `/chaomung caidat, thu, tat` | Admin | Mọi gói | Chào người mới, nút xác minh |
| `/khamsuckhoe kiemtra, lichsu` | Admin | Mọi gói | Điểm sức khoẻ server, sửa an toàn |
| `/automod bat, tat, trangthai, mientru` | Admin | Nhẹ: Free. Vừa, gắt, miễn trừ: Pro | AutoMod gốc của Discord |
| `/ticket caidat, loai them, loai xoa, dang, danhsach, tat` | Admin | Pro | Ticket hỗ trợ |
| `/khoakhan bat, tat, trangthai, caidat, nhatky` | Admin | Chống raid, nhật ký: mọi gói. Chống xoá hàng loạt: Pro | Khoá khẩn cấp, chống raid, nhật ký quản trị |
| `/canhcao nguoi lydo` | Timeout thành viên | Mọi gói | Cảnh cáo, ghi hồ sơ |
| `/timeout nguoi thoigian lydo` | Timeout thành viên | Mọi gói | Cho ngồi im có thời hạn |
| `/kick nguoi lydo` | Đuổi thành viên | Mọi gói | Đuổi khỏi server |
| `/ban nguoi lydo [xoatin]` | Cấm thành viên | Mọi gói | Cấm vào server |
| `/hoso nguoi` | Timeout thành viên | Mọi gói | Xem 10 hồ sơ gần nhất của một người |
| `/goi` | Mọi người | Mọi gói | Xem gói và hạn |
| `/dungthu` | Admin | Free | Thử Pro 7 ngày, một lần |
| `/mua goi [ngay] [cach]` | Admin | Free | Mua Pro, Plus hoặc Dựng giúp bằng thẻ (Stripe) hoặc QR (payOS) |
| `/kichhoat ma` | Admin | Free | Kích hoạt bằng mã |
| `/nuke` | Admin | Mọi gói | Gỡ những gì bot đã xây |
| `/xoadulieu` | Admin | Mọi gói | Bot quên mọi dữ liệu về server (trừ gói và đơn thanh toán) |
| `/admin taoma, cap, thuhoi, thongke, donhang` | Chủ bot | Không áp dụng | Công cụ của chủ bot, có phễu 30 ngày |
---

## 15. Phụ lục A: cài đặt Stripe từng bước (thẻ, tính bằng đô)

Stripe là cổng thanh toán thẻ. Bạn ở Mỹ nên đây là cách chính: khách trả bằng thẻ tín dụng hoặc thẻ ghi nợ, tiền về tài khoản ngân hàng Mỹ của bạn.

### 15.1. Tiền đi như thế nào

1. Khách gõ `/mua`. Bot nhờ Stripe tạo một **trang thanh toán (Checkout Session)** cho đúng số đô của gói.
2. Khách nhập thẻ trên trang của Stripe. Số thẻ **không bao giờ đi qua bot** hay Discord.
3. Stripe chuyển tiền (trừ phí) vào tài khoản ngân hàng của bạn theo lịch chi trả của Stripe.
4. Cứ 30 giây bot hỏi Stripe: "phiên này trả chưa?". Khi Stripe trả lời "đã thu tiền", bot kiểm tra thêm mã đơn, số tiền và đơn vị tiền khớp với đơn của mình rồi mới bật gói, đúng một lần.

Không cần webhook, không cần mở cổng nào cho bên ngoài gọi vào.

### 15.2. Cần chuẩn bị

- Một địa chỉ email và số điện thoại.
- Một **tài khoản ngân hàng Mỹ** đứng tên bạn (số routing và số tài khoản) để nhận tiền.
- Thông tin xác minh cá nhân do Stripe yêu cầu: họ tên, ngày sinh, địa chỉ ở Mỹ, và số SSN (hoặc EIN nếu bạn có công ty). Loại hình đơn giản nhất cho một người làm một mình là **cá nhân kinh doanh tự do (individual / sole proprietor)**.
- Mô tả ngắn về sản phẩm khi Stripe hỏi, ví dụ: "Subscriptions to a Discord bot that builds and manages community servers".

### 15.3. Bước 1: tạo tài khoản

1. Mở https://dashboard.stripe.com/register.
2. Điền email, tên, mật khẩu, rồi xác nhận email.
3. Bạn vào dashboard ở chế độ thử (**Test mode**, hoặc **Sandbox** tuỳ giao diện hiện tại). Ở chế độ này không có tiền thật.

### 15.4. Bước 2: lấy khoá và thử trước ở chế độ thử

1. Vẫn ở chế độ thử, mở https://dashboard.stripe.com/test/apikeys.
2. Có **hai cách lấy khoá**:
   - **Đơn giản:** copy **Secret key** (bắt đầu bằng `sk_test_`). Bấm **Reveal** để xem.
   - **An toàn hơn (nên dùng cho khoá thật):** bấm **Create restricted key** (tạo khoá giới hạn), đặt tên `thau-bot`, và chỉ cấp quyền **Checkout Sessions** ở mức **Write**. Để mọi quyền khác ở **None**. Khoá này (bắt đầu bằng `rk_`) chỉ làm được đúng việc bot cần, nên lộ ra cũng ít thiệt hại hơn.
3. **Giữ bí mật như mật khẩu.** Ai có khoá có thể tạo thanh toán dưới tên bạn. Đừng gửi qua tin nhắn, đừng đưa lên GitHub.

### 15.5. Bước 3: đưa khoá vào bot

Trên Pi (hoặc qua SSH):

```bash
cd ~/buildDISCORD
nano .env
```

Thêm hoặc điền dòng này (không dấu cách, không ngoặc):

```
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxx
```

Lưu bằng Ctrl+O, Enter, thoát Ctrl+X. Rồi chạy lại bot:

```bash
docker compose up -d
```

Gõ `/mua goi:pro` trên một server **không** nằm trong `UNLOCKED_GUILD_IDS` (server được mở khoá không cần mua). Thấy số tiền **$3.99** và nút **Thanh toán** là bot đã nối được Stripe.

### 15.6. Bước 4: thử bằng thẻ giả

1. Bấm **Thanh toán**, trang Stripe mở ra.
2. Nhập thẻ thử: số `4242 4242 4242 4242`, ngày hết hạn là bất kỳ ngày nào trong tương lai, CVC bất kỳ ba số, mã ZIP bất kỳ.
3. Bấm trả. Đợi tối đa vài chục giây. Bot nhắn "Thanh toán thành công" và bật gói. Gõ `/goi` kiểm tra.
4. Chủ bot gõ `/admin donhang`: đơn hiện với số đô (ví dụ `$3.99`) và trạng thái đã trả.
5. Trong dashboard Stripe, mục **Payments** (chế độ thử), bạn thấy giao dịch.

Muốn thử trường hợp thất bại: dùng thẻ `4000 0000 0000 0002` (bị từ chối). Gói không bật, và sau 30 phút đơn hết hạn.

### 15.7. Bước 5: kích hoạt tài khoản để nhận tiền thật

1. Trong dashboard Stripe, bấm **Activate your account** (kích hoạt tài khoản).
2. Điền thông tin doanh nghiệp (chọn cá nhân kinh doanh tự do nếu bạn một mình), thông tin cá nhân, tài khoản ngân hàng để nhận tiền, và mô tả sản phẩm.
3. Chờ Stripe xác minh. Có thể mất từ vài phút đến vài ngày. Stripe có thể hỏi thêm giấy tờ.
4. Khi xong, tắt chế độ thử để sang chế độ thật (**Live mode**).

### 15.8. Bước 6: chuyển sang khoá thật

1. Ở chế độ thật, mở https://dashboard.stripe.com/apikeys, tạo **khoá giới hạn** như ở mục 15.4 (quyền **Checkout Sessions: Write**), hoặc copy Secret key `sk_live_`.
2. Trên Pi, sửa `.env`, thay dòng `STRIPE_SECRET_KEY=` bằng khoá thật.
3. `docker compose up -d`.
4. Khoá thử và khoá thật **khác nhau hoàn toàn**: đơn tạo bằng khoá thử không đọc được bằng khoá thật. Nếu còn đơn đang chờ lúc đổi khoá, chúng báo lỗi trong log rồi hết hạn sau 35 phút, không gây hại.
5. Thử một đơn thật nhỏ của chính bạn (gói Pro 30 ngày, $3.99) trên một server không mở khoá, rồi hoàn lại tiền trong dashboard Stripe.

### 15.9. Phí, thuế, hoàn tiền, tranh chấp

- **Phí:** Stripe thu phí mỗi giao dịch thẻ. Mức phí hiện tại xem ở https://stripe.com/pricing (ở Mỹ, giá chuẩn thường là một tỷ lệ phần trăm cộng một khoản cố định vài chục xu). Với gói $3,99 phí cố định khoảng ba chục xu cộng tỷ lệ phần trăm, tức là hơn một phần mười giá, nên giá thực nhận thấp hơn giá niêm yết rõ rệt. Gói 365 ngày (39,90 đô) và Plus ít bị ảnh hưởng hơn.
- **Hoàn tiền:** làm thủ công trong dashboard Stripe, mục **Payments**, chọn giao dịch, bấm **Refund**. Bot không tự thu hồi gói. Nếu muốn gỡ gói, chủ bot gõ `/admin thuhoi server:<ID>`.
- **Tranh chấp (chargeback):** khi khách khiếu nại với ngân hàng, Stripe báo qua email và dashboard. Trả lời trong hạn Stripe cho. Bot không xử lý phần này.
- **Thuế:** thu tiền bán dịch vụ số ở California và liên bang có nghĩa vụ thuế riêng. Stripe có công cụ **Stripe Tax** để tính và thu thuế bán hàng, nhưng tôi không phải cố vấn thuế. Hãy hỏi một kế toán hoặc người am hiểu trước khi bán nhiều.
- **Khách ngoài nước Mỹ:** trả được bằng thẻ quốc tế. Giá luôn bằng đô.

### 15.10. Khi Stripe gặp sự cố

| Triệu chứng | Xử lý |
| --- | --- |
| `/mua` báo cổng thanh toán trục trặc | Xem `docker logs thauxaydung --tail 30`. Thường do khoá sai, thiếu quyền Checkout Sessions, hoặc Stripe đang lỗi |
| Log báo `Stripe answered 401` | Khoá sai hoặc đã bị thu hồi. Tạo khoá mới |
| Log báo `Stripe answered 403` | Khoá giới hạn thiếu quyền. Bật Checkout Sessions: Write |
| Trả tiền xong gói không bật | Đợi 2 phút. Rồi `/admin donhang` xem trạng thái. Đối chiếu Payments trong Stripe. Tiền đã về thì `/admin cap` cấp tay |
| Log báo `does not match order` | Phiên Stripe không khớp đơn (khác mã đơn hoặc số tiền). Bot cố ý không bật gói. Kiểm tra giao dịch trong Stripe |
| Liên kết hết hạn | Liên kết sống 30 phút. Gõ `/mua` lại |

## 16. Phụ lục B: cài đặt payOS (QR ngân hàng Việt Nam)

**Phần này chỉ dành cho người có tài khoản ngân hàng Việt Nam.** Bạn ở Mỹ thì dùng Stripe ở phụ lục A. payOS vẫn có ích nếu bạn muốn khách ở Việt Nam trả bằng QR, nhưng chủ tài khoản payOS phải là người có giấy tờ và ngân hàng Việt Nam.

payOS là cổng thanh toán Việt Nam cho phép nhận tiền bằng mã QR về tài khoản ngân hàng của bạn. Bot dùng payOS cho cách trả `cach:payos` của `/mua`.

### 16.1. Tiền đi như thế nào

1. Khách gõ `/mua`. Bot nhờ payOS tạo một **liên kết thanh toán** (có mã QR) cho số tiền cố định.
2. Khách quét QR bằng app ngân hàng và chuyển tiền.
3. Tiền đi vào **tài khoản ngân hàng của bạn** (tài khoản đã liên kết với payOS).
4. Cứ 30 giây bot hỏi payOS: "đơn này trả chưa?". Khi payOS trả lời "đã trả", bot bật gói, đúng một lần.

Bot **không cần địa chỉ webhook** và không nhận dữ liệu từ bên ngoài, nên không có cổng nào để kẻ xấu tấn công.

### 16.2. Cần chuẩn bị

- Một **tài khoản ngân hàng** đứng tên bạn, thuộc ngân hàng payOS hỗ trợ. Theo tài liệu payOS, cá nhân liên kết được với MB, OCB, KienlongBank, ACB, BIDV (danh sách có thể thay đổi, xem trang của payOS).
- Thông tin xác minh (căn cước công dân, hoặc giấy tờ doanh nghiệp nếu đăng ký tổ chức).
- Một email dùng được, và điện thoại có app ngân hàng.
- Phí và thời gian duyệt do payOS quy định. Xem trực tiếp ở https://payos.vn trước khi đăng ký, vì tôi không có số liệu cập nhật.

### 16.3. Bước 1: tạo tài khoản payOS

1. Mở https://my.payos.vn/login.
2. Chọn **Đăng ký**, điền đủ thông tin, bấm **Tạo tài khoản**.
3. Mở email payOS vừa gửi, bấm **Xác thực**.
4. Đăng nhập, bạn thấy trang quản lý (dashboard).

Hướng dẫn gốc của payOS: https://payos.vn/docs/huong-dan-su-dung/tao-tai-khoan-payos/

### 16.4. Bước 2: xác thực tổ chức hoặc cá nhân

Ở trang quản lý, làm theo mục **Xác thực tổ chức** (cá nhân hay doanh nghiệp đều được hướng dẫn khai giấy tờ phù hợp) để khai thông tin và giấy tờ. Chờ payOS duyệt. Chưa duyệt xong thì chưa tạo được kênh thanh toán.

### 16.5. Bước 3: liên kết tài khoản ngân hàng

Ở mục **Kết nối tài khoản ngân hàng**, chọn ngân hàng của bạn và làm theo hướng dẫn trên màn hình. payOS liên kết qua ứng dụng **Cas** (một app của hệ sinh thái payOS dùng để xác nhận tài khoản): cài app, đăng nhập, cho phép liên kết với ngân hàng, rồi tài khoản xuất hiện trong danh sách của payOS.

Trang hướng dẫn theo từng ngân hàng nằm trong mục "Hướng dẫn sử dụng" ở https://payos.vn/docs/ . Đúng từng bước tuỳ ngân hàng bạn chọn, nên hãy đọc trang của ngân hàng đó. Giao diện của payOS thỉnh thoảng đổi, nên nhãn nút có thể hơi khác chữ tôi ghi.

### 16.6. Bước 4: tạo kênh thanh toán

1. Trong dashboard, vào mục **Kênh thanh toán** (kênh thu).
2. Bấm **Tạo kênh thanh toán**.
3. Chọn tài khoản ngân hàng bạn vừa liên kết.
4. Đặt tên, ví dụ `Thầu Xây Dựng`.
5. Lưu.

### 16.7. Bước 5: lấy ba khoá

Mở kênh vừa tạo, tìm phần thông tin tích hợp (khoá hệ thống). Có **ba giá trị**:

- **Client ID**
- **API Key**
- **Checksum Key**

Giữ chúng **bí mật như mật khẩu**. Ai có ba khoá này có thể tạo thanh toán dưới tên bạn. Đừng gửi qua tin nhắn, đừng đưa lên GitHub.

### 16.8. Bước 6: đưa ba khoá vào bot

SSH vào Pi (hoặc mở terminal trên Pi):

```bash
cd ~/buildDISCORD
nano .env
```

Tìm ba dòng và điền khoá (không có dấu cách, không có dấu ngoặc):

```
PAYOS_CLIENT_ID=giá_trị_client_id
PAYOS_API_KEY=giá_trị_api_key
PAYOS_CHECKSUM_KEY=giá_trị_checksum_key
```

Nếu ba dòng chưa có, thêm vào cuối tệp. Lưu: Ctrl+O, Enter, Ctrl+X. Rồi chạy lại bot:

```bash
docker compose up -d
```

Kiểm tra: gõ `/mua goi:pro` trong Discord. Nếu thấy số tiền và nút **Thanh toán** thì payOS đã nối thành công. Còn nếu bot báo "chưa được bật" thì ba khoá chưa vào, kiểm tra `.env`.

### 16.9. Bước 7: thử bằng đơn nhỏ

Thử trước khi bán thật, để chắc chắn tiền về đúng và gói tự bật.

1. Trên Pi, tạm thêm dòng `USD_VND_RATE=200` vào `.env`, rồi `docker compose up -d`. Với tỷ giá này, gói Pro 30 ngày chỉ còn khoảng 2.000 đồng (bot không bao giờ tính dưới 2.000 đồng).
2. Dùng một server thử **không** nằm trong `UNLOCKED_GUILD_IDS` (server được mở khoá không cần mua). Gõ `/mua goi:pro`.
3. Bấm **Thanh toán**, quét QR và chuyển đúng số tiền.
4. Đợi tối đa vài chục giây. Bot nhắn "gói đã bật". Gõ `/goi` kiểm tra.
5. Trong Discord, chủ bot gõ `/admin donhang` để xem đơn có trạng thái đã trả.
6. Vào dashboard payOS, xem giao dịch.
7. **Xoá dòng `USD_VND_RATE=200`** khỏi `.env` (hoặc đặt lại 26000), rồi `docker compose up -d`. Quên bước này là bán gói Pro giá 2.000 đồng cho mọi người.

### 16.10. Khi thanh toán gặp sự cố

| Triệu chứng | Xử lý |
| --- | --- |
| `/mua` báo cổng thanh toán trục trặc | Xem `docker logs thauxaydung --tail 30`. Thường do sai khoá, kênh chưa được duyệt, hoặc payOS đang lỗi |
| Chuyển tiền xong gói không bật | Đợi 2 phút. Nếu chuyển **sai số tiền** thì đơn không khớp. Xem `/admin donhang`, đối chiếu giao dịch ở payOS, rồi `/admin cap` cấp tay nếu tiền đã về |
| Liên kết hết hạn | Liên kết sống 30 phút. Gõ `/mua` lại |
| Khách chỉ trả một phần | Bot không tự hoàn tiền hay bật gói, vì payOS không có chức năng đó cho bot. Chủ bot tự xử lý: cấp gói tay nếu đủ, hoặc hoàn tiền tay |
| Cần hoàn tiền cho khách | Làm **thủ công** từ ngân hàng của bạn, rồi `/admin thuhoi server:<ID>` nếu muốn gỡ gói |

### 16.11. Lưu ý quan trọng

- Phần nối payOS của bot được viết theo tài liệu payOS và **kiểm tra bằng giả lập**, chưa chạy với tài khoản thật. Vì vậy đơn thử ở mục 16.9 là bắt buộc.
- Bot kiểm tra trạng thái đơn mỗi 30 giây, nên gói có thể bật chậm đến khoảng một phút sau khi tiền về.
- Giá niêm yết bằng đô (Pro 3,99, Plus 7,99 mỗi 30 ngày, một năm trả 10 tháng, Dựng giúp 4,99). Thu bằng đồng theo `USD_VND_RATE`. Khi tỷ giá lệch nhiều, sửa biến này.
- Thuế, hoá đơn và quy định kinh doanh khi bán dịch vụ là việc của bạn. Hỏi người am hiểu nếu bán nhiều.

## 17. Phụ lục C: dựng server hỗ trợ cho chính bot, bằng chính bot

Chủ bot cần một nơi để khách hỏi, báo lỗi và nhận hướng dẫn. Cách gọn nhất là **dùng chính Thầu Xây Dựng để dựng nó**. Làm một lần, mất khoảng mười phút, và cũng là cách thử bot trên một server thật.

1. **Tạo server mới** tên "Thầu Xây Dựng Hỗ Trợ" (cách tạo ở mục 2.1). Mời bot vào bằng đường dẫn ở đầu sổ tay.
2. **Mở khoá server** để dùng mọi tính năng không giới hạn: lấy ID server (mục 1) rồi thêm vào `UNLOCKED_GUILD_IDS` trong `.env` (mục 12.6).
3. **Dựng nhanh**: gõ `/batdau`. Chọn theme **Cộng Đồng Tạp Hoá** (hợp nhất cho một cộng đồng hỗ trợ). Chọn giọng điệu **nhẹ nhàng** cho khách đỡ giật mình. Bật hết các ô ở "Bật thêm gì cho tiện": chào người mới, AutoMod nhẹ, khám sức khoẻ hằng tuần, bảo vệ cơ bản và bản tin tuần. Bấm **Dựng luôn**.
4. **Chào người mới**: `/chaomung caidat` chọn kênh chào, tạo hai role `Chưa xác minh` và `Thành viên`, đặt `vaitromoi` là `Chưa xác minh`, `vaitroxacminh` là `Thành viên`, bật `xacminh:True`. Người mới bấm nút xác minh rồi mới vào được các kênh khác.
5. **Ticket hỗ trợ**: tạo role `Hỗ trợ`, một danh mục `🎫 Ticket`, rồi `/ticket caidat`, thêm hai loại "Hỗ trợ" và "Báo lỗi" bằng `/ticket loai them`, và `/ticket dang` để đăng bảng ở kênh hỗ trợ.
6. **Menu nhận role**: `/vaitro tao` một menu role thông báo ("Tin cập nhật bot", "Khuyến mãi") để khách tự chọn nhận gì.
7. **Bảo vệ**: `/khoakhan caidat raid:True hanhdong:verify` và `kenh` là kênh mod, rồi `/khoakhan nhatky bat:True kenh:<kênh mod>`. Nếu muốn canh kỹ, bật `chongxoa:True`.
8. **Bình chọn và giveaway**: dùng `/binhchon` hỏi khách muốn tính năng nào tiếp theo, và `/quatang` tặng vài ngày Pro làm quà cho người góp ý hay.
9. **Ghim thông tin**: dùng `/vietgiup luat` và `/vietgiup thongbao` để lấy bản nháp luật và bài giới thiệu, sửa lại cho đúng giọng của bạn, đăng vào kênh luật và kênh thông báo. Ghim trong kênh hỗ trợ ba thứ: đường dẫn mời bot, đường dẫn sổ tay, và cách mua (`/goi`, `/mua`).
10. **Mời nhân viên hỗ trợ** vào role `Hỗ trợ`, giao cho họ quyền Timeout thành viên để dùng `/canhcao`, `/timeout`, `/hoso`.

Server hỗ trợ này cũng là chỗ tốt nhất để thấy bot hoạt động: bản tin tuần, báo động raid và nhật ký quản trị đều chạy ở đó trước khách.


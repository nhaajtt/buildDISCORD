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
| Trang quản lý thanh toán payOS | https://my.payos.vn |
| Hướng dẫn của payOS | https://payos.vn/docs/ |

## Mục lục

1. Những khái niệm Discord cần biết
2. Bắt đầu từ con số không: có server, mời bot
3. Cách gõ một lệnh
4. Dựng cả server bằng `/build`
5. Thiết kế bằng AI: `/thietke`
6. Theme riêng, sao lưu và khôi phục
7. Giữ server sôi động: điểm danh, mini-game, sự kiện
8. Chăm sóc server: chào người mới, khám sức khoẻ, AutoMod, ticket
9. Bảng điều khiển trên web
10. Gói, giá, dùng thử và thanh toán
11. Dọn dẹp và xoá dữ liệu
12. Dành cho chủ bot: vận hành bot trên Raspberry Pi
13. Chuyện gì xảy ra khi có sự cố
14. Bảng tất cả các lệnh
15. Phụ lục: cài đặt payOS từng bước

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

## 2. Bắt đầu từ con số không: có server, mời bot

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

Vì sao xin quyền Administrator: bot phải tạo kênh, tạo role, tạo sự kiện, quản lý AutoMod, và đăng bài vào kênh khoá chỉ đọc. Xin ít quyền hơn thì dễ gặp lỗi khó hiểu giữa chừng. Bot không đọc nội dung tin nhắn của ai.

### 2.3. Kiểm tra bot đã sẵn sàng

1. Vào bất kỳ kênh chữ nào, gõ `/goi` rồi bấm Enter.
2. Nếu bot trả lời bảng gói dịch vụ, bot đã hoạt động. Dòng đầu cho biết server đang ở gói **Miễn phí**.
3. Nếu gõ `/` không thấy lệnh nào của bot: đợi vài phút, vì lệnh mới có thể mất đến một giờ để hiện lần đầu. Thử thoát Discord và vào lại (Ctrl+R trên máy tính). Còn không thì xem phần 13.

### 2.4. Một việc quan trọng: vị trí role của bot

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

Đây là lệnh chính của bot: nó dựng role, danh mục, kênh chữ, kênh thoại, luật, lời chào và bảng chọn role cho cả server trong một lần.

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

Không. Bot chỉ thêm cái còn thiếu, và không đăng lại luật hay lời chào đã có. Gói miễn phí chỉ được xây **một lần** cho mỗi server.

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

## 8. Chăm sóc server

Bốn công cụ này đều chạy **không cần đọc nội dung tin nhắn của ai**. Cài bằng lệnh hoặc bằng bảng điều khiển trên web (phần 9).

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

## 9. Bảng điều khiển trên web

Bảng điều khiển cho phép chỉnh chào người mới, AutoMod, ticket, khám sức khoẻ và xem gói, ngay trên trình duyệt, không cần gõ lệnh.

**Địa chỉ:** https://nhaajt.tailc4c5ef.ts.net:10000

Cách vào:
1. Mở địa chỉ trên.
2. Bấm đăng nhập bằng Discord. Discord hỏi bạn có cho phép trang đọc **tên và danh sách server** của bạn không. Bấm **Cho phép**. Trang chỉ đọc hai thứ đó, rồi huỷ quyền ngay.
3. Chọn server. Chỉ hiện những server mà **bạn là Administrator và bot đang ở trong**. Không thấy server của mình: kiểm tra bot đã được mời và bạn có quyền Administrator.
4. Chọn tab: **Tổng quan**, **Chào mừng**, **AutoMod**, **Ticket**, **Khám sức khoẻ**, **Gói và thanh toán**.

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
| Giá mỗi server | 0 | 9,99 đô mỗi 30 ngày | 19,99 đô mỗi 30 ngày |
| Theme mỗi lần xây | 1 | tối đa 4 (trộn) | tối đa 4 (trộn) |
| Số lần xây | 1 lần | không giới hạn | không giới hạn |
| Chọn mức hài | không | có | có |
| Thiết kế bằng AI mỗi tháng | 0 | 20 | 100 |
| Sao lưu | 0 | 3 | 10 |
| Theme riêng | 0 | 3 | 10 |
| Sự kiện định kỳ | 0 | 3 | 10 |
| Điểm danh, cấp, mini-game | không | có | có |
| Chào người mới, khám sức khoẻ | có | có | có |
| AutoMod | mức Nhẹ | cả ba mức, miễn trừ role | cả ba mức, miễn trừ role |
| Ticket | không | có | có |

Gói tính **theo từng server**, không theo tài khoản. Hết hạn thì server tự về gói Miễn phí và những gì đã xây vẫn ở lại.

Gõ `/goi` bất cứ lúc nào để xem gói hiện tại, hạn dùng và số lần đã xây.

### 10.2. Dùng thử miễn phí: `/dungthu`

Gõ `/dungthu` (cần quyền Administrator). Server nhận **7 ngày Pro miễn phí, một lần duy nhất cho mỗi server**. Không cần thẻ, không tự gia hạn. Hết 7 ngày về Miễn phí. Dùng rồi thì không dùng lại được kể cả khi xoá dữ liệu.

### 10.3. Mua bằng chuyển khoản (tự động): `/mua`

1. Gõ `/mua goi:<pro hoặc plus> [ngay:<30, 90 hoặc 180>]`. Mặc định 30 ngày.
2. Bot hiện số tiền bằng đồng Việt Nam (quy từ giá đô theo tỷ giá bot đang dùng, làm tròn đến nghìn đồng, tối thiểu 2.000 đồng) kèm nút **Thanh toán**.
3. Bấm nút, trang thanh toán mở ra với mã QR. Dùng app ngân hàng quét mã và chuyển khoản **đúng số tiền**, không sửa nội dung.
4. Tiền về, trong khoảng một phút bot tự bật gói và nhắn vào kênh nơi bạn gõ lệnh. Không cần nhập mã.
5. Liên kết thanh toán **sống 30 phút**. Quá giờ thì gõ `/mua` lại để lấy liên kết mới.

Mua gia hạn thì số ngày được **cộng nối vào hạn hiện tại**.

Nếu bot nói "Thanh toán tự động chưa được bật": chủ bot chưa cài payOS (xem phụ lục). Dùng mã kích hoạt ở mục dưới.

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

Bot **quên** danh sách đã xây, các cài đặt chào mừng, AutoMod, ticket. **Kênh và role trên Discord vẫn còn**, kể cả luật AutoMod còn trên server (bot sẽ gỡ luật do nó tạo và nhắn nếu còn sót). Gói trả phí và số lần dùng vẫn được giữ để giới hạn gói còn đúng.

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
| `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` | không | Ba khoá payOS. Điền đủ ba thì `/mua` bật |
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
| `/admin thongke` | Số server theo từng gói |
| `/admin donhang` | 10 đơn thanh toán gần nhất |

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

## 13. Chuyện gì xảy ra khi có sự cố

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
| --- | --- | --- |
| Gõ `/` không thấy lệnh của bot | Lệnh mới chưa kịp đăng ký, hoặc Discord chưa tải lại | Đợi vài phút, Ctrl+R trong Discord. Chủ bot: chạy lệnh đăng ký lệnh (phần 12.2) |
| Bot offline (không sáng xanh) | Container dừng, hoặc token sai | Trên Pi: `docker ps`, rồi `docker logs thauxaydung --tail 50` |
| Bot báo thiếu quyền | Role của bot quá thấp hoặc thiếu quyền | Kéo role Thầu Xây Dựng lên cao (phần 2.4), mời lại bot với quyền Administrator |
| `/build` báo đã dùng hết lượt | Gói Miễn phí chỉ xây một lần | `/dungthu` để thử Pro, hoặc mua gói |
| Lệnh báo "gói Pro trở lên" | Tính năng thuộc gói trả phí | `/dungthu`, `/mua`, hoặc `/kichhoat` |
| Không có lời chào người mới | Kênh hệ thống chưa bật thông báo chào mừng | Cài đặt máy chủ, Tổng quan, bật thông báo ở kênh hệ thống (phần 8.1) |
| Nút xác minh không cấp role | Role xác minh nằm cao hơn role bot, hoặc có quyền nguy hiểm | Kéo role bot lên cao hơn role đó, bỏ quyền nguy hiểm khỏi role |
| AutoMod không tạo được luật | Bot thiếu quyền quản lý server hoặc Moderate Members | Mời lại với quyền Administrator |
| Ticket không mở được | Thiếu danh mục hoặc kênh | Chạy lại `/ticket caidat`, rồi `/ticket dang` |
| `/mua` báo "chưa bật" | Chưa điền khoá payOS | Chủ bot làm phụ lục 15 |
| Đã trả tiền mà gói chưa bật | Bot đợi tối đa vài chục giây, hoặc chuyển sai số tiền | Đợi 2 phút. Quá lâu thì chủ bot gõ `/admin donhang` xem đơn, rồi `/admin cap` cấp tay nếu tiền đã về |
| Trang web bảng điều khiển không mở | Funnel tắt, hoặc bot chưa chạy | Chủ bot: `tailscale funnel status`, `docker logs thauxaydung --tail 20` (phải có dòng `Dashboard:`) |
| Đăng nhập web báo "invalid redirect_uri" | Redirect trong Developer Portal chưa lưu đúng | Thêm đúng dòng ở phần 12.7 rồi bấm Lưu |
| Đăng nhập web xong không thấy server nào | Bạn không phải Administrator, hoặc bot chưa ở trong server đó | Kiểm tra quyền, mời bot |
| `/thietke` báo AI chưa bật | Chưa có `GEMINI_API_KEY` | Chủ bot thêm khoá |
| Mọi thứ hỏng không rõ lý do | Nhiều | `docker logs thauxaydung --tail 100`, gửi nguyên văn lỗi cho người hỗ trợ |

## 14. Bảng tất cả các lệnh

Cột "Ai dùng" cho biết quyền cần có. **Admin** nghĩa là cần quyền Administrator trong server.

| Lệnh | Ai dùng | Gói | Việc làm |
| --- | --- | --- | --- |
| `/build theme [theme2..theme4] [muc-do-hai]` | Admin | Free (1 theme, 1 lần). Trộn và mức hài: Pro | Dựng cả server |
| `/thietke mota [muc-do-hai]` | Admin | Pro | AI thiết kế server |
| `/theme danhsach, dung, xoa, xuat, nhap` | Admin | Pro | Theme riêng |
| `/backup tao, danhsach, khoiphuc, xoa, xuat, nhap` | Admin | Pro | Sao lưu cấu trúc server |
| `/sukien tao, danhsach, xoa, mau` | Admin | Pro | Sự kiện hằng tuần |
| `/diemdanh` | Mọi người | Pro | Điểm danh hằng ngày |
| `/bangxephang` | Mọi người | Pro | Top 10 điểm vui |
| `/doanso [so]` | Mọi người | Pro | Đoán số 1 đến 100 |
| `/thachdau nguoi` | Mọi người | Pro | Kéo búa bao |
| `/cauhoi` | Mọi người | Pro | Câu hỏi nhanh |
| `/roast nguoi` | Mọi người | Mọi gói | Roast nhẹ |
| `/chaomung caidat, thu, tat` | Admin | Mọi gói | Chào người mới, nút xác minh |
| `/khamsuckhoe kiemtra, lichsu` | Admin | Mọi gói | Điểm sức khoẻ server, sửa an toàn |
| `/automod bat, tat, trangthai, mientru` | Admin | Nhẹ: Free. Vừa, gắt, miễn trừ: Pro | AutoMod gốc của Discord |
| `/ticket caidat, loai them, loai xoa, dang, danhsach, tat` | Admin | Pro | Ticket hỗ trợ |
| `/goi` | Mọi người | Mọi gói | Xem gói và hạn |
| `/dungthu` | Admin | Free | Thử Pro 7 ngày, một lần |
| `/mua goi [ngay]` | Admin | Free | Mua gói bằng QR |
| `/kichhoat ma` | Admin | Free | Kích hoạt bằng mã |
| `/nuke` | Admin | Mọi gói | Gỡ những gì bot đã xây |
| `/xoadulieu` | Admin | Mọi gói | Bot quên dữ liệu về server |
| `/admin taoma, cap, thuhoi, thongke, donhang` | Chủ bot | Không áp dụng | Công cụ của chủ bot |

---

## 15. Phụ lục: cài đặt payOS từng bước

payOS là cổng thanh toán Việt Nam cho phép nhận tiền bằng mã QR về tài khoản ngân hàng của bạn. Bot dùng payOS để `/mua` tự động.

### 15.1. Tiền đi như thế nào

1. Khách gõ `/mua`. Bot nhờ payOS tạo một **liên kết thanh toán** (có mã QR) cho số tiền cố định.
2. Khách quét QR bằng app ngân hàng và chuyển tiền.
3. Tiền đi vào **tài khoản ngân hàng của bạn** (tài khoản đã liên kết với payOS).
4. Cứ 30 giây bot hỏi payOS: "đơn này trả chưa?". Khi payOS trả lời "đã trả", bot bật gói, đúng một lần.

Bot **không cần địa chỉ webhook** và không nhận dữ liệu từ bên ngoài, nên không có cổng nào để kẻ xấu tấn công.

### 15.2. Cần chuẩn bị

- Một **tài khoản ngân hàng** đứng tên bạn, thuộc ngân hàng payOS hỗ trợ. Theo tài liệu payOS, cá nhân liên kết được với MB, OCB, KienlongBank, ACB, BIDV (danh sách có thể thay đổi, xem trang của payOS).
- Thông tin xác minh (căn cước công dân, hoặc giấy tờ doanh nghiệp nếu đăng ký tổ chức).
- Một email dùng được, và điện thoại có app ngân hàng.
- Phí và thời gian duyệt do payOS quy định. Xem trực tiếp ở https://payos.vn trước khi đăng ký, vì tôi không có số liệu cập nhật.

### 15.3. Bước 1: tạo tài khoản payOS

1. Mở https://my.payos.vn/login.
2. Chọn **Đăng ký**, điền đủ thông tin, bấm **Tạo tài khoản**.
3. Mở email payOS vừa gửi, bấm **Xác thực**.
4. Đăng nhập, bạn thấy trang quản lý (dashboard).

Hướng dẫn gốc của payOS: https://payos.vn/docs/huong-dan-su-dung/tao-tai-khoan-payos/

### 15.4. Bước 2: xác thực tổ chức hoặc cá nhân

Ở trang quản lý, làm theo mục **Xác thực tổ chức** (cá nhân hay doanh nghiệp đều được hướng dẫn khai giấy tờ phù hợp) để khai thông tin và giấy tờ. Chờ payOS duyệt. Chưa duyệt xong thì chưa tạo được kênh thanh toán.

### 15.5. Bước 3: liên kết tài khoản ngân hàng

Ở mục **Kết nối tài khoản ngân hàng**, chọn ngân hàng của bạn và làm theo hướng dẫn trên màn hình. payOS liên kết qua ứng dụng **Cas** (một app của hệ sinh thái payOS dùng để xác nhận tài khoản): cài app, đăng nhập, cho phép liên kết với ngân hàng, rồi tài khoản xuất hiện trong danh sách của payOS.

Trang hướng dẫn theo từng ngân hàng nằm trong mục "Hướng dẫn sử dụng" ở https://payos.vn/docs/ . Đúng từng bước tuỳ ngân hàng bạn chọn, nên hãy đọc trang của ngân hàng đó. Giao diện của payOS thỉnh thoảng đổi, nên nhãn nút có thể hơi khác chữ tôi ghi.

### 15.6. Bước 4: tạo kênh thanh toán

1. Trong dashboard, vào mục **Kênh thanh toán** (kênh thu).
2. Bấm **Tạo kênh thanh toán**.
3. Chọn tài khoản ngân hàng bạn vừa liên kết.
4. Đặt tên, ví dụ `Thầu Xây Dựng`.
5. Lưu.

### 15.7. Bước 5: lấy ba khoá

Mở kênh vừa tạo, tìm phần thông tin tích hợp (khoá hệ thống). Có **ba giá trị**:

- **Client ID**
- **API Key**
- **Checksum Key**

Giữ chúng **bí mật như mật khẩu**. Ai có ba khoá này có thể tạo thanh toán dưới tên bạn. Đừng gửi qua tin nhắn, đừng đưa lên GitHub.

### 15.8. Bước 6: đưa ba khoá vào bot

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

### 15.9. Bước 7: thử bằng đơn nhỏ

Thử trước khi bán thật, để chắc chắn tiền về đúng và gói tự bật.

1. Trên Pi, tạm thêm dòng `USD_VND_RATE=200` vào `.env`, rồi `docker compose up -d`. Với tỷ giá này, gói Pro 30 ngày chỉ còn khoảng 2.000 đồng (bot không bao giờ tính dưới 2.000 đồng).
2. Dùng một server thử **không** nằm trong `UNLOCKED_GUILD_IDS` (server được mở khoá không cần mua). Gõ `/mua goi:pro`.
3. Bấm **Thanh toán**, quét QR và chuyển đúng số tiền.
4. Đợi tối đa vài chục giây. Bot nhắn "gói đã bật". Gõ `/goi` kiểm tra.
5. Trong Discord, chủ bot gõ `/admin donhang` để xem đơn có trạng thái đã trả.
6. Vào dashboard payOS, xem giao dịch.
7. **Xoá dòng `USD_VND_RATE=200`** khỏi `.env` (hoặc đặt lại 26000), rồi `docker compose up -d`. Quên bước này là bán gói Pro giá 2.000 đồng cho mọi người.

### 15.10. Khi thanh toán gặp sự cố

| Triệu chứng | Xử lý |
| --- | --- |
| `/mua` báo cổng thanh toán trục trặc | Xem `docker logs thauxaydung --tail 30`. Thường do sai khoá, kênh chưa được duyệt, hoặc payOS đang lỗi |
| Chuyển tiền xong gói không bật | Đợi 2 phút. Nếu chuyển **sai số tiền** thì đơn không khớp. Xem `/admin donhang`, đối chiếu giao dịch ở payOS, rồi `/admin cap` cấp tay nếu tiền đã về |
| Liên kết hết hạn | Liên kết sống 30 phút. Gõ `/mua` lại |
| Khách chỉ trả một phần | Bot không tự hoàn tiền hay bật gói, vì payOS không có chức năng đó cho bot. Chủ bot tự xử lý: cấp gói tay nếu đủ, hoặc hoàn tiền tay |
| Cần hoàn tiền cho khách | Làm **thủ công** từ ngân hàng của bạn, rồi `/admin thuhoi server:<ID>` nếu muốn gỡ gói |

### 15.11. Lưu ý quan trọng

- Phần nối payOS của bot được viết theo tài liệu payOS và **kiểm tra bằng giả lập**, chưa chạy với tài khoản thật. Vì vậy đơn thử ở mục 15.9 là bắt buộc.
- Bot kiểm tra trạng thái đơn mỗi 30 giây, nên gói có thể bật chậm đến khoảng một phút sau khi tiền về.
- Giá niêm yết bằng đô (9,99 và 19,99). Thu bằng đồng theo `USD_VND_RATE`. Khi tỷ giá lệch nhiều, sửa biến này.
- Thuế, hoá đơn và quy định kinh doanh khi bán dịch vụ là việc của bạn. Hỏi người am hiểu nếu bán nhiều.

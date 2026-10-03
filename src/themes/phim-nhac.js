export default {
  id: "phim-nhac",
  label: "Rạp Phim Và Phòng Nhạc",
  blurb: "Cho hội xem phim, nghe nhạc: đề cử phim, bình chọn đêm xem chung, chia sẻ playlist và hát hò.",
  welcome: "Chào {user}! Rạp đã bật máy chiếu, phòng nhạc đã bật loa. Còn bắp rang thì bạn tự mang.",
  roles: [
    { key: "pn-movie", name: "🍿 Mọt Phim", color: 0xf39c12, pick: true },
    { key: "pn-music", name: "🎧 Hồn Nhạc", color: 0x1abc9c, pick: true },
    { key: "pn-critic", name: "🎬 Giám Khảo Mạng", color: 0x9b59b6, pick: true },
    { key: "pn-sleep", name: "🛋️ Khán Giả Ngủ Gật", color: 0x95a5a6, pick: true },
  ],
  extraRules: [
    "Không spoil phim đang chiếu. Ai spoil sẽ phải xem lại bộ phim đó một mình.",
    "Nhạc gì cũng được, miễn đừng bắt cả phòng nghe một bài lặp bốn mươi lần.",
  ],
  categories: [
    {
      name: "🍿 Rạp Chiếu",
      channels: [
        { name: "🎥・phim-đề-cử", type: "text", topic: "Đề cử phim cho đêm xem chung, kèm một câu giải thích vì sao đáng xem." },
        { name: "🗳️・bình-chọn-phim-tối-nay", type: "text", topic: "Bình chọn phim chiếu tối nay. Thắng thua do số đông, không do người to tiếng." },
        { name: "🌟・review-không-spoil", type: "text", topic: "Review phim, nhưng giữ kịch tính cho người chưa xem." },
        { name: "🍿 Rạp Chiếu Chung", type: "voice" },
      ],
    },
    {
      name: "🎵 Phòng Nhạc",
      channels: [
        { name: "🎶・playlist-chia-sẻ", type: "text", topic: "Chia sẻ playlist của bạn. Ghi tên bài, đừng chỉ dán link." },
        { name: "🔥・bài-đang-nghe", type: "text", topic: "Đang nghe bài gì thì kể cho cả hội biết." },
        { name: "🎵 Phòng Nghe Nhạc", type: "voice" },
        { name: "🎤 Phòng Hát Hò", type: "voice" },
      ],
    },
  ],
};

/* data.jsx — mock data for Shopee Seeding Bot */

// =========================================================
// Format helpers
// =========================================================
const fmt = {
  vnd: (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n)),
  num: (n) => new Intl.NumberFormat('vi-VN').format(n),
  pct: (n, d = 2) => `${(n).toFixed(d)}%`,
  time: (d) => d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  date: (d) => d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
  dateTime: (d) => `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN').slice(0,5)}`,
  short: (n) => n >= 1e9 ? (n/1e9).toFixed(2) + 'B'
            : n >= 1e6 ? (n/1e6).toFixed(2) + 'M'
            : n >= 1e3 ? (n/1e3).toFixed(1) + 'K' : String(n),
  duration: (s) => {
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
    return h ? `${h}h ${m}m` : m ? `${m}m ${sec}s` : `${sec}s`;
  },
};

// =========================================================
// Initial log lines (lots of variety)
// =========================================================
const INITIAL_LOGS = [
  { t: -3245, k: 'info', tag: 'BOT', msg: 'Khởi động Shopee Seeding Bot v2.4.1' },
  { t: -3240, k: 'info', tag: 'BOT', msg: 'Đã load 156 nhóm FB, 89 keyword, 412 sản phẩm trong kho' },
  { t: -3235, k: 'success', tag: 'EDGE', msg: 'Kết nối Edge debug port 9222 thành công' },
  { t: -3230, k: 'info', tag: 'AI', msg: 'Nguồn AI: 9Router — sẽ tự chuyển sang ChatGPT web khi lỗi' },
  { t: -3215, k: 'keyword', tag: 'SCAN', msg: 'Nhóm "Săn deal Shopee giá rẻ" — đang quét 30 bài gần nhất' },
  { t: -3210, k: 'success', tag: 'MATCH', msg: '7 bài phù hợp với keyword: tai nghe bluetooth, sạc dự phòng, đèn ngủ' },
  { t: -3198, k: 'info', tag: 'AI', msg: 'Phân tích bài "Cần mua tai nghe bluetooth tầm 500k" → MATCH keyword "tai nghe bluetooth"' },
  { t: -3180, k: 'success', tag: 'AFF', msg: 'Tạo affiliate link: https://s.shopee.vn/8AbCdEfGh1' },
  { t: -3175, k: 'info', tag: 'CONV', msg: 'Tạo link Shopee: s.shopee.vn (OK)' },
  { t: -3172, k: 'info', tag: 'CONV', msg: 'Rút gọn TinyURL: s.shopee.vn → tinyurl.com/y9k2m4ab (OK)' },
  { t: -3168, k: 'comment', tag: 'CMT', msg: '@Nguyễn An: "Bạn xem em này nhé, đang sale 39% — tinyurl.com/y9k2m4ab"' },
  { t: -3160, k: 'success', tag: 'CMT', msg: 'Đã đăng comment vào nhóm "Săn deal Shopee giá rẻ"' },
  { t: -3120, k: 'info', tag: 'WAIT', msg: 'Chờ 42s trước comment tiếp theo (delay 30-60s)' },
  { t: -3078, k: 'keyword', tag: 'SCAN', msg: 'Nhóm "Hội mê công nghệ" — đang quét 30 bài' },
  { t: -3070, k: 'skip', tag: 'SKIP', msg: 'Bỏ qua bài "Review iPhone 15 Pro Max" — blacklist keyword: review' },
  { t: -3065, k: 'skip', tag: 'SKIP', msg: 'Bỏ qua bài đã comment trước đó (post_id 7281...)' },
  { t: -3055, k: 'success', tag: 'MATCH', msg: '3 bài phù hợp keyword: bàn phím cơ, chuột không dây' },
  { t: -3040, k: 'info', tag: 'AI', msg: 'Tạo comment cho "Cần bàn phím cơ tầm 1tr" — tone: thân thiện' },
  { t: -3032, k: 'comment', tag: 'CMT', msg: '@Tuấn Minh: "Mình mới mua con này dùng êm lắm, có sale: tinyurl.com/k4p7q2x"' },
  { t: -3025, k: 'success', tag: 'CMT', msg: 'Đã đăng comment vào nhóm "Hội mê công nghệ"' },
  { t: -2980, k: 'buy', tag: 'BUY', msg: '💰 Đơn hàng mới: bàn phím cơ AKKO 3068B — 1.290.000đ — HH: 64.500đ' },
  { t: -2940, k: 'keyword', tag: 'SCAN', msg: 'Nhóm "Mẹ bỉm sữa Hà Nội" — đang quét' },
  { t: -2935, k: 'success', tag: 'MATCH', msg: '5 bài phù hợp: bỉm dán, sữa rửa mặt, máy hút sữa' },
  { t: -2920, k: 'warn', tag: 'AI', msg: 'Bài "Mua bỉm Merries M68 ở đâu rẻ?" — chưa có link trong kho → thêm vào "Từ khóa chờ link"' },
  { t: -2910, k: 'info', tag: 'AI', msg: 'Tạo comment cho "Cần mua máy hút sữa" — link Spectra Q'},
  { t: -2900, k: 'comment', tag: 'CMT', msg: '@Hà My: "Em xài Spectra Q ổn lắm chị ơi, link đây: tinyurl.com/spectra-q"' },
  { t: -2895, k: 'success', tag: 'CMT', msg: 'Đã đăng comment vào nhóm "Mẹ bỉm sữa Hà Nội"' },
  { t: -2850, k: 'info', tag: 'TG', msg: 'Telegram → Gửi báo cáo phiên: 14 comment, 3 đơn, +387K hoa hồng' },
  { t: -2820, k: 'keyword', tag: 'SCAN', msg: 'Nhóm "Yêu bếp ghiền nhà" — quét 30 bài' },
  { t: -2810, k: 'success', tag: 'MATCH', msg: '8 bài phù hợp: nồi chiên không dầu, máy xay sinh tố' },
  { t: -2790, k: 'buy', tag: 'BUY', msg: '💰 Đơn hàng mới: nồi chiên không dầu Lock&Lock 5.5L — 1.890.000đ — HH: 94.500đ' },
  { t: -2770, k: 'comment', tag: 'CMT', msg: '@Thuỷ Tiên: "Nhà em xài Lock&Lock 5.5L ngon, đang sale: tinyurl.com/lnl-55"' },
  { t: -2760, k: 'success', tag: 'CMT', msg: 'Đã đăng comment vào nhóm "Yêu bếp ghiền nhà"' },
  { t: -2700, k: 'error', tag: 'FB', msg: 'Lỗi đăng comment vào "Group ABC" — bị giới hạn tốc độ, retry sau 5p' },
  { t: -2640, k: 'info', tag: 'WAIT', msg: 'Đang chờ slot tiếp theo trong queue (32 nhóm còn lại)' },
  { t: -2580, k: 'keyword', tag: 'SCAN', msg: 'Nhóm "Sinh viên KTX" — quét' },
  { t: -2575, k: 'success', tag: 'MATCH', msg: '4 bài: đèn học, balo laptop, áo mưa' },
  { t: -2560, k: 'comment', tag: 'CMT', msg: '@Nam Phong: "Đèn học Yeelight rất nét, dùng pin xài 8 tiếng — tinyurl.com/yee-d"' },
  { t: -2555, k: 'success', tag: 'CMT', msg: 'Đã đăng comment vào nhóm "Sinh viên KTX"' },
  { t: -2510, k: 'buy', tag: 'BUY', msg: '💰 Đơn hàng mới: đèn học Yeelight Pro — 489.000đ — HH: 24.450đ' },
  { t: -2480, k: 'keyword', tag: 'SCAN', msg: 'Nhóm "Skincare review thật" — quét' },
  { t: -2470, k: 'success', tag: 'MATCH', msg: '6 bài: serum vitamin C, kem chống nắng, retinol' },
  { t: -2455, k: 'info', tag: 'AI', msg: 'Tạo comment cho "Kem chống nắng dưới 300k" — link Anessa Mini' },
  { t: -2445, k: 'comment', tag: 'CMT', msg: '@Linh Chi: "Mình dùng Anessa mini hợp lắm, mã sale 30%: tinyurl.com/anessa-m"' },
  { t: -2440, k: 'success', tag: 'CMT', msg: 'Đã đăng comment vào nhóm "Skincare review thật"' },
  { t: -2400, k: 'info', tag: 'CYCLE', msg: 'Hoàn thành chu kỳ 12/30 — chờ 5 phút trước chu kỳ tiếp theo' },
];

// Streaming log generator — random new entries
const LOG_TEMPLATES = [
  { k: 'keyword', tag: 'SCAN', msgs: ['Nhóm "{group}" — đang quét 30 bài', 'Nhóm "{group}" — phát hiện {n} bài mới', 'Phát hiện {n} từ khóa tiềm năng từ nhóm "{group}"'] },
  { k: 'success', tag: 'MATCH', msgs: ['{n} bài phù hợp keyword: {kw}', 'Match: "{kw}" trong nhóm "{group}"'] },
  { k: 'info', tag: 'AI', msgs: ['Phân tích bài: "{post}" → MATCH "{kw}"', '9Router phân loại "{post}" → "{cat}"', 'Tạo comment cho "{post}" — tone thân thiện'] },
  { k: 'comment', tag: 'CMT', msgs: ['@{user}: "{cmt}"', 'Đăng vào "{group}": {cmt_short}'] },
  { k: 'success', tag: 'CMT', msgs: ['Đã đăng comment vào nhóm "{group}"', 'Comment thành công — wait {wait}s'] },
  { k: 'buy', tag: 'BUY', msgs: ['💰 Đơn hàng mới: {prod} — {price}đ — HH: {comm}đ'] },
  { k: 'skip', tag: 'SKIP', msgs: ['Bỏ qua bài "{post}" — blacklist: {bl}', 'Bỏ qua — đã comment ({pid})', 'Skip nhóm tạm thời rate-limit'] },
  { k: 'warn', tag: 'AI', msgs: ['Bài "{post}" chưa có link trong kho → thêm vào chờ link', 'AI tự chuyển sang ChatGPT web — 9Router timeout'] },
  { k: 'info', tag: 'CONV', msgs: ['s.shopee.vn → tinyurl.com/{tinyid} (OK)', 's.shopee.vn → muahangre.io.vn/{tinyid} (OK)'] },
  { k: 'info', tag: 'TG', msgs: ['Telegram → Gửi báo cáo phiên', 'Telegram → Đã nhận lệnh /pause từ admin'] },
];
const GROUPS_NAMES = ['Săn deal Shopee giá rẻ', 'Hội mê công nghệ', 'Mẹ bỉm sữa Hà Nội', 'Yêu bếp ghiền nhà', 'Sinh viên KTX', 'Skincare review thật', 'Văn phòng tiện ích', 'Trang trí nhà cửa', 'Cha mẹ thông thái', 'Đồ chơi trẻ em VN'];
const KW_LIST = ['tai nghe bluetooth', 'sạc dự phòng', 'đèn ngủ', 'bàn phím cơ', 'chuột không dây', 'bỉm dán', 'sữa rửa mặt', 'máy hút sữa', 'nồi chiên không dầu', 'máy xay sinh tố', 'đèn học', 'balo laptop', 'serum vitamin C', 'kem chống nắng', 'retinol'];
const USERS = ['Nguyễn An', 'Tuấn Minh', 'Hà My', 'Thuỷ Tiên', 'Nam Phong', 'Linh Chi', 'Quốc Bảo', 'Mai Lan', 'Đức Hùng', 'Hồng Nhung'];
const POSTS = ['Cần mua tai nghe bluetooth tầm 500k', 'Tư vấn bàn phím cơ giá rẻ', 'Máy hút sữa nào tốt cho mẹ bỉm?', 'Nồi chiên không dầu dung tích lớn', 'Đèn học LED nào sáng tốt?', 'Serum vitamin C dưới 300k', 'Bỉm Merries M68 ở đâu rẻ?', 'Sạc dự phòng 20000mAh đáng mua?'];
const PRODS = ['bàn phím cơ AKKO 3068B', 'tai nghe Sony WF-C500', 'nồi chiên Lock&Lock 5.5L', 'đèn học Yeelight Pro', 'bỉm Merries M68', 'serum Anua niacinamide', 'sữa rửa mặt Cerave', 'chuột Logitech MX Anywhere 3'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function fillTemplate(s) {
  return s
    .replace('{group}', pick(GROUPS_NAMES))
    .replace('{kw}', pick(KW_LIST))
    .replace('{user}', pick(USERS))
    .replace('{post}', pick(POSTS))
    .replace('{prod}', pick(PRODS))
    .replace('{cat}', pick(['Điện tử', 'Mẹ & Bé', 'Nhà cửa', 'Sắc đẹp', 'Thời trang']))
    .replace('{bl}', pick(['review', 'spam', 'tuyển dụng', 'thanh lý']))
    .replace('{cmt}', 'Bạn xem em này nhé, đang sale — tinyurl.com/x' + Math.random().toString(36).slice(2,6))
    .replace('{cmt_short}', 'tham khảo link affiliate')
    .replace('{n}', String(2 + Math.floor(Math.random() * 8)))
    .replace('{wait}', String(28 + Math.floor(Math.random() * 35)))
    .replace('{price}', fmt.vnd(180000 + Math.random() * 2_500_000))
    .replace('{comm}', fmt.vnd(8000 + Math.random() * 120000))
    .replace('{pid}', String(7280000 + Math.floor(Math.random() * 999999)))
    .replace('{tinyid}', Math.random().toString(36).slice(2, 9));
}
function nextLog() {
  const tpl = pick(LOG_TEMPLATES);
  const msg = fillTemplate(pick(tpl.msgs));
  return { t: 0, k: tpl.k, tag: tpl.tag, msg };
}

// =========================================================
// FB Groups
// =========================================================
const GROUPS = [
  { id: 1, name: 'Săn deal Shopee giá rẻ', url: 'facebook.com/groups/sandeals.shopee', enabled: true, action: 'comment', lastScan: '2 phút trước', scanned: 1284, matched: 187, clicks: 412, orders: 23, commission: 1247500, rating: 'recommend' },
  { id: 2, name: 'Hội mê công nghệ Việt Nam', url: 'facebook.com/groups/hoimecongnghe', enabled: true, action: 'comment', lastScan: '5 phút trước', scanned: 968, matched: 142, clicks: 318, orders: 18, commission: 982000, rating: 'recommend' },
  { id: 3, name: 'Mẹ bỉm sữa Hà Nội', url: 'facebook.com/groups/mebimsua.hn', enabled: true, action: 'comment', lastScan: '8 phút trước', scanned: 2104, matched: 298, clicks: 612, orders: 41, commission: 1862400, rating: 'recommend' },
  { id: 4, name: 'Yêu bếp ghiền nhà', url: 'facebook.com/groups/yeubepghiennha', enabled: true, action: 'telegram', lastScan: '12 phút trước', scanned: 1567, matched: 234, clicks: 487, orders: 29, commission: 1428600, rating: 'recommend' },
  { id: 5, name: 'Sinh viên KTX HCMUT', url: 'facebook.com/groups/sv.ktx.hcmut', enabled: true, action: 'comment', lastScan: '15 phút trước', scanned: 743, matched: 89, clicks: 156, orders: 8, commission: 384200, rating: 'monitor' },
  { id: 6, name: 'Skincare review thật', url: 'facebook.com/groups/skincare.thucte', enabled: true, action: 'comment', lastScan: '18 phút trước', scanned: 1892, matched: 312, clicks: 564, orders: 34, commission: 1684300, rating: 'recommend' },
  { id: 7, name: 'Văn phòng tiện ích', url: 'facebook.com/groups/vanphongtienich', enabled: true, action: 'comment', lastScan: '22 phút trước', scanned: 612, matched: 78, clicks: 134, orders: 6, commission: 287600, rating: 'monitor' },
  { id: 8, name: 'Trang trí nhà cửa Sài Gòn', url: 'facebook.com/groups/trangtrinhacua.sg', enabled: true, action: 'comment', lastScan: '28 phút trước', scanned: 1234, matched: 167, clicks: 289, orders: 14, commission: 678900, rating: 'monitor' },
  { id: 9, name: 'Cha mẹ thông thái', url: 'facebook.com/groups/chamethongthai', enabled: false, action: 'comment', lastScan: '2 giờ trước', scanned: 423, matched: 41, clicks: 67, orders: 2, commission: 89400, rating: 'low' },
  { id: 10, name: 'Đồ chơi trẻ em VN', url: 'facebook.com/groups/dochoitreem.vn', enabled: true, action: 'comment', lastScan: '34 phút trước', scanned: 887, matched: 124, clicks: 218, orders: 11, commission: 542700, rating: 'monitor' },
  { id: 11, name: 'Hội yêu thú cưng', url: 'facebook.com/groups/hoiyeuthucung', enabled: true, action: 'comment', lastScan: '41 phút trước', scanned: 1456, matched: 198, clicks: 376, orders: 22, commission: 1124800, rating: 'recommend' },
  { id: 12, name: 'Đồ chơi cũ - trao đổi', url: 'facebook.com/groups/dochoicu.traodoi', enabled: false, action: 'comment', lastScan: '3 giờ trước', scanned: 234, matched: 18, clicks: 28, orders: 0, commission: 0, rating: 'remove' },
  { id: 13, name: 'Hỏi đáp dân văn phòng', url: 'facebook.com/groups/hoidap.vanphong', enabled: true, action: 'telegram', lastScan: '52 phút trước', scanned: 678, matched: 92, clicks: 167, orders: 9, commission: 432100, rating: 'monitor' },
  { id: 14, name: 'Tìm việc làm thêm SV', url: 'facebook.com/groups/timviec.sv', enabled: false, action: 'comment', lastScan: '5 giờ trước', scanned: 156, matched: 8, clicks: 12, orders: 0, commission: 0, rating: 'remove' },
  { id: 15, name: 'Hội nội trợ thông minh', url: 'facebook.com/groups/noitrothongminh', enabled: true, action: 'comment', lastScan: '1 giờ trước', scanned: 945, matched: 134, clicks: 234, orders: 13, commission: 612400, rating: 'monitor' },
];

const RATING_META = {
  recommend: { label: 'Nên giữ', cls: 'ok' },
  monitor: { label: 'Theo dõi', cls: 'info' },
  low: { label: 'Ít bài phù hợp', cls: 'warn' },
  remove: { label: 'Đề xuất gỡ', cls: 'danger' },
  excellent: { label: 'Rất hiệu quả', cls: 'ok' },
  effective: { label: 'Hiệu quả', cls: 'ok' },
  potential: { label: 'Tiềm năng', cls: 'accent' },
  improve: { label: 'Cần cải thiện', cls: 'warn' },
  optimize: { label: 'Cần tối ưu', cls: 'warn' },
  risk: { label: 'Rủi ro cao', cls: 'danger' },
  inefficient: { label: 'Kém hiệu quả', cls: 'danger' },
  follow: { label: 'Theo dõi', cls: 'warn' },
  none: { label: 'Chưa có dữ liệu', cls: '' },
};

function normalizeGroupRating(rating) {
  const key = String(rating || '').trim().toLowerCase();
  const aliases = {
    keep: 'excellent',
    recommend: 'excellent',
    good: 'effective',
    watch: 'follow',
    monitor: 'follow',
    low: 'optimize',
    remove: 'risk',
    danger: 'risk',
  };
  return aliases[key] || key || 'none';
}

function groupRatingResult(rating, status, meaning, problemLevel = 0) {
  const normalized = normalizeGroupRating(rating);
  const meta = RATING_META[normalized] || RATING_META.none;
  return {
    rating: normalized,
    label: meta.label,
    kind: meta.cls,
    status,
    statusKind: meta.cls,
    statusLabel: meta.label,
    statusMeaning: meaning,
    problemLevel,
  };
}

function evaluateGroupPerformance(row = {}, stats = {}) {
  const n = (value) => {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? numeric : 0;
  };
  const scanned = n(row.scanned ?? row.runs);
  const suitable = n(row.suitable ?? row.matched);
  const hasExplicitSuccess = row.success != null || row.comments != null || row.comment_success != null;
  const successCount = n(row.success ?? row.comments ?? row.comment_success ?? row.handled);
  const pending = n(row.pending ?? row.pending_fb);
  const rejected = n(row.rejected);
  const fail = n(row.fail ?? row.failed);
  const issues = pending + rejected + fail;
  const explicitOutcomes = n(row.outcomes ?? row.handled_posts ?? (hasExplicitSuccess ? row.handled : 0));
  const outcomes = explicitOutcomes || successCount + issues;
  const successRate = row.successRate != null
    ? n(row.successRate) / 100
    : outcomes
      ? successCount / outcomes
      : suitable
        ? successCount / suitable
        : 0;
  const fitPerRun = row.fitPerRun != null
    ? n(row.fitPerRun)
    : scanned
      ? suitable / scanned
      : 0;
  const revenue = n(row.revenue ?? row.commission);
  const orders = n(row.orders);
  const revenuePerRun = row.revenuePerRun != null
    ? n(row.revenuePerRun)
    : scanned
      ? revenue / scanned
      : 0;
  const handled = outcomes || successCount;
  const score = n(row.score);

  if (handled < 10 && revenue === 0) {
    return groupRatingResult(
      'none',
      'neutral',
      'Group có quá ít lượt xử lý hoặc chưa có doanh thu nên chưa đủ cơ sở kết luận.',
      0
    );
  }

  if (revenue > 0) {
    if (successRate < 0.55) {
      return groupRatingResult(
        'improve',
        'watch',
        'Group đã có doanh thu nên không xếp rủi ro cao, nhưng success dưới 55% cần cải thiện trước khi tăng volume.',
        2
      );
    }
    const strongRevenue = revenuePerRun >= (stats.p75 || Infinity) || revenue > 500000 || orders >= 5;
    if (successRate >= 0.75 && (score >= 80 || strongRevenue)) {
      return groupRatingResult(
        'excellent',
        'good',
        'Có doanh thu tốt, mật độ bài phù hợp khá và tỷ lệ thành công đủ cao để ưu tiên chạy tiếp.',
        0
      );
    }
    if (successRate >= 0.75) {
      return groupRatingResult(
        'effective',
        'good',
        'Có doanh thu và tỷ lệ thành công chạy được; lỗi nhỏ chỉ nên xem như cảnh báo phụ.',
        0
      );
    }
    return groupRatingResult(
      'potential',
      'good',
      'Group có doanh thu và success trên 55%, nhưng chưa đủ ngưỡng hiệu quả cao.',
      1
    );
  }

  if (handled >= 10 && successRate < 0.4) {
    return groupRatingResult(
      'risk',
      'bad',
      'Group không có doanh thu và success dưới 40%, nên giảm ưu tiên và kiểm tra lại nội dung, tài khoản hoặc rule group.',
      3
    );
  }
  if (handled >= 10 && successRate < 0.55) {
    return groupRatingResult(
      'optimize',
      'watch',
      'Group chưa có doanh thu và success dưới 55%, cần tối ưu trước khi ưu tiên chạy tiếp.',
      2
    );
  }
  if (handled >= 10 && fitPerRun >= 0.5 && successRate > 0.55) {
    return groupRatingResult(
      'potential',
      'good',
      'Chưa có doanh thu nhưng success trên 55% và có tín hiệu bài phù hợp; nên tiếp tục theo dõi.',
      1
    );
  }
  if (handled >= 10 && fitPerRun >= 0.5) {
    return groupRatingResult(
      'follow',
      'watch',
      'Có tín hiệu bài phù hợp nhưng chưa đủ mạnh để ưu tiên cao.',
      1
    );
  }
  if (handled >= 10) {
    return groupRatingResult(
      'inefficient',
      'bad',
      'Ít bài phù hợp, chưa có doanh thu và đã có đủ lượt xử lý để thấy hiệu quả thấp.',
      3
    );
  }

  const fallback = normalizeGroupRating(row.rating);
  if (fallback !== 'none' && RATING_META[fallback]) {
    return groupRatingResult(fallback, fallback === 'risk' ? 'bad' : 'watch', RATING_META[fallback].label, fallback === 'risk' ? 3 : 1);
  }
  return groupRatingResult('none', 'neutral', 'Group chưa đủ dữ liệu để đánh giá.', 0);
}

// =========================================================
// History
// =========================================================
function buildHistory() {
  const rows = [];
  const modes = ['Comment', 'Comment', 'Comment', 'Telegram'];
  const now = new Date();
  for (let i = 0; i < 48; i++) {
    const t = new Date(now.getTime() - i * (3 + Math.random() * 12) * 60_000);
    rows.push({
      time: t,
      mode: modes[i % modes.length],
      group: pick(GROUPS_NAMES),
      account: pick(['Nguyễn Minh Anh', 'Trần Gia Huy', 'Lê Bảo Ngọc']),
      product: pick(PRODS),
      comment: pick([
        'Mình mới mua con này dùng êm lắm, có sale: tinyurl.com/xxx',
        'Em này đang sale 39%, đáng tiền nha bạn: tinyurl.com/xxx',
        'Mình review chi tiết em này trong link: tinyurl.com/xxx',
        'Bạn xem em này thử nhé, hợp tầm giá: tinyurl.com/xxx',
        'Nhà mình xài tận 2 tháng rồi vẫn ổn: tinyurl.com/xxx',
      ]),
    });
  }
  return rows;
}

// =========================================================
// Revenue
// =========================================================
const REVENUE_KPI = {
  gmv: 47862400,
  commission: 2393120,
  xtraComm: 1436850,
  shopeeComm: 956270,
  orders: 168,
  clicks: 3247,
  epc: 737,
  cvr: 5.17,
  commRate: 5.00,
  avgOrder: 284900,
  byType: {
    video: { orders: 24, gmv: 8124800, comm: 406240 },
    live: { orders: 12, gmv: 4234600, comm: 211730 },
    social: { orders: 121, gmv: 32847100, comm: 1642355 },
    zero: { orders: 6, gmv: 0, comm: 0 },
    cancelled: { orders: 5, gmv: 2655900, comm: 132795 },
  },
  compare: {
    today: { gmv: 3214500, ord: 12 },
    yesterday: { gmv: 2876300, ord: 9 },
    thisWeek: { gmv: 18742300, ord: 67 },
    lastWeek: { gmv: 16234100, ord: 58 },
  },
};

// Daily timeline (30 days)
function buildDailyRevenue() {
  const out = [];
  const base = new Date(); base.setHours(0,0,0,0);
  for (let i = 29; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 86400000);
    const seed = Math.sin(i * 1.7) * 0.4 + Math.cos(i * 0.7) * 0.3 + 1;
    const gmv = Math.round((900_000 + Math.random() * 2_000_000) * seed + 600_000);
    const comm = Math.round(gmv * (0.045 + Math.random() * 0.012));
    const orders = Math.round(8 + Math.random() * 14 * seed);
    const clicks = Math.round(orders * (15 + Math.random() * 12));
    out.push({ date: d, gmv, comm, orders, clicks });
  }
  return out;
}

// Hourly (24)
function buildHourly() {
  const out = [];
  for (let h = 0; h < 24; h++) {
    // Peak hours: 10-12, 19-22
    const peak = (h >= 10 && h <= 12) ? 2.1 : (h >= 19 && h <= 22) ? 2.6 : (h >= 0 && h < 6) ? 0.25 : 1;
    out.push({
      hour: h,
      orders: Math.round((3 + Math.random() * 4) * peak),
      clicks: Math.round((42 + Math.random() * 56) * peak),
    });
  }
  return out;
}

// Top products / shops
const TOP_PRODUCTS = [
  { name: 'Bàn phím cơ AKKO 3068B v2', orders: 18, gmv: 23220000, comm: 1161000 },
  { name: 'Tai nghe Sony WF-C500 Bluetooth', orders: 15, gmv: 13485000, comm: 674250 },
  { name: 'Nồi chiên không dầu Lock&Lock 5.5L', orders: 12, gmv: 22680000, comm: 1134000 },
  { name: 'Sạc dự phòng Anker 20000mAh', orders: 11, gmv: 9889000, comm: 494450 },
  { name: 'Đèn học Yeelight Pro', orders: 10, gmv: 4890000, comm: 244500 },
  { name: 'Serum Anua 5% Niacinamide', orders: 9, gmv: 3960000, comm: 198000 },
  { name: 'Bỉm dán Merries M68', orders: 8, gmv: 4720000, comm: 236000 },
  { name: 'Kem chống nắng Anessa Mini', orders: 8, gmv: 2880000, comm: 144000 },
  { name: 'Chuột Logitech MX Anywhere 3', orders: 7, gmv: 12530000, comm: 626500 },
  { name: 'Sữa rửa mặt CeraVe 236ml', orders: 7, gmv: 2730000, comm: 136500 },
];
const TOP_SHOPS = [
  { name: 'AKKO Official Store', orders: 24, gmv: 28760000, comm: 1438000, rate: 5.0 },
  { name: 'Sony Vietnam', orders: 19, gmv: 17820000, comm: 891000, rate: 5.0 },
  { name: 'Lock&Lock Vietnam', orders: 17, gmv: 24340000, comm: 1217000, rate: 5.0 },
  { name: 'Anker Official', orders: 14, gmv: 11240000, comm: 562000, rate: 5.0 },
  { name: 'Yeelight Vietnam', orders: 12, gmv: 6740000, comm: 337000, rate: 5.0 },
  { name: 'CeraVe Official', orders: 11, gmv: 4640000, comm: 232000, rate: 5.0 },
  { name: 'Merries Vietnam', orders: 10, gmv: 5860000, comm: 293000, rate: 5.0 },
  { name: 'Logitech Vietnam', orders: 9, gmv: 16470000, comm: 823500, rate: 5.0 },
];
const CATEGORIES = [
  { name: 'Điện tử', gmv: 18742000 },
  { name: 'Nhà cửa & Đời sống', gmv: 12468000 },
  { name: 'Mẹ & Bé', gmv: 7240000 },
  { name: 'Sắc đẹp', gmv: 5184000 },
  { name: 'Thời trang', gmv: 2840000 },
  { name: 'Khác', gmv: 1388400 },
];

// SubIDs
function buildSubIds() {
  const types = ['Auto', 'Auto', 'Manual', 'Auto'];
  const cats = ['ELEC', 'HOME', 'BEAU', 'MOMK', 'FASH'];
  const rows = [];
  for (let i = 0; i < 28; i++) {
    const clicks = Math.round(40 + Math.random() * 380);
    const orders = Math.round(clicks * (0.02 + Math.random() * 0.08));
    const comm = orders * (12000 + Math.random() * 80000);
    const epc = comm / clicks;
    const cvr = (orders / clicks) * 100;
    const cpc = 800 + Math.random() * 1400;
    const profit = comm - clicks * cpc;
    rows.push({
      type: types[i % types.length],
      sub1: 'fb',
      sub2: 'auto',
      sub3: cats[i % cats.length],
      sub4: 'g' + (1 + Math.floor(Math.random() * 15)),
      sub5: 'k' + (10 + Math.floor(Math.random() * 50)),
      clicks, orders, comm, epc, cvr, cpc, profit,
      rating: profit > 50000 ? 'Tốt' : profit > 0 ? 'Khá' : 'Lỗ',
    });
  }
  return rows.sort((a, b) => b.comm - a.comm);
}

// Order detail
function buildOrders() {
  const statuses = ['Hoàn thành', 'Hoàn thành', 'Hoàn thành', 'Chờ xử lý', 'Đã hủy'];
  const out = [];
  const now = new Date();
  for (let i = 0; i < 40; i++) {
    const t = new Date(now.getTime() - i * 1800_000 * (1 + Math.random()));
    const gmv = 80000 + Math.random() * 2_400_000;
    out.push({
      time: t,
      product: pick(PRODS),
      shop: pick(['AKKO Store', 'Sony VN', 'Lock&Lock', 'Anker', 'Yeelight', 'CeraVe', 'Merries']),
      gmv, comm: gmv * 0.05,
      channel: pick(['Comment FB', 'Telegram', 'Comment FB', 'Comment FB']),
      subId: 'fb-auto-' + pick(['ELEC', 'HOME', 'BEAU', 'MOMK']) + '-g' + (1 + Math.floor(Math.random() * 12)) + '-k' + (10 + Math.floor(Math.random() * 50)),
      sub1: 'fb',
      sub2: 'auto',
      sub3: pick(['ELEC', 'HOME', 'BEAU', 'MOMK']),
      sub4: 'g' + (1 + Math.floor(Math.random() * 12)),
      sub5: 'k' + (10 + Math.floor(Math.random() * 50)),
      status: statuses[Math.floor(Math.random() * statuses.length)],
    });
  }
  return out;
}

// =========================================================
// Products
// =========================================================
const INDUSTRIES = ['Điện tử', 'Nhà cửa & Đời sống', 'Mẹ & Bé', 'Sắc đẹp', 'Thời trang', 'Thực phẩm', 'Sức khỏe'];
const PROD_STATUSES = { ready: { label: 'Sẵn sàng', cls: 'ok' }, pending: { label: 'Chờ link', cls: 'warn' }, skipped: { label: 'Bỏ qua', cls: '' } };

function buildProducts() {
  const items = [];
  const ready = [
    ['bàn phím cơ akko', 'Bàn phím cơ AKKO 3068B v2', 'https://s.shopee.vn/8AbCd1', 'Điện tử', 14, 'Hội mê công nghệ'],
    ['tai nghe bluetooth sony', 'Tai nghe Sony WF-C500', 'https://s.shopee.vn/9EfGh2', 'Điện tử', 22, 'Săn deal Shopee giá rẻ'],
    ['nồi chiên không dầu', 'Nồi chiên Lock&Lock 5.5L', 'https://s.shopee.vn/2IjKl3', 'Nhà cửa & Đời sống', 31, 'Yêu bếp ghiền nhà'],
    ['sạc dự phòng anker', 'Sạc dự phòng Anker 20000mAh', 'https://s.shopee.vn/4MnOp4', 'Điện tử', 18, 'Văn phòng tiện ích'],
    ['đèn học yeelight', 'Đèn học Yeelight Pro 2', 'https://s.shopee.vn/6QrSt5', 'Nhà cửa & Đời sống', 12, 'Sinh viên KTX HCMUT'],
    ['serum anua niacinamide', 'Serum Anua 5% Niacinamide', 'https://s.shopee.vn/8UvWx6', 'Sắc đẹp', 27, 'Skincare review thật'],
    ['bỉm merries m68', 'Bỉm dán Merries M68 (M)', 'https://s.shopee.vn/1YzAb7', 'Mẹ & Bé', 19, 'Mẹ bỉm sữa Hà Nội'],
    ['kem chống nắng anessa', 'Kem chống nắng Anessa Mini 20ml', 'https://s.shopee.vn/3CdEf8', 'Sắc đẹp', 16, 'Skincare review thật'],
    ['chuột logitech mx', 'Chuột Logitech MX Anywhere 3', 'https://s.shopee.vn/5GhIj9', 'Điện tử', 9, 'Văn phòng tiện ích'],
    ['cerave sữa rửa mặt', 'Sữa rửa mặt CeraVe 236ml', 'https://s.shopee.vn/7KlMn0', 'Sắc đẹp', 21, 'Skincare review thật'],
    ['máy hút sữa spectra', 'Máy hút sữa Spectra Q', 'https://s.shopee.vn/9OpQr1', 'Mẹ & Bé', 8, 'Mẹ bỉm sữa Hà Nội'],
    ['máy xay sinh tố', 'Máy xay sinh tố Philips HR2102', 'https://s.shopee.vn/2StUv2', 'Nhà cửa & Đời sống', 11, 'Yêu bếp ghiền nhà'],
    ['balo laptop targus', 'Balo laptop Targus 15.6"', 'https://s.shopee.vn/4WxYz3', 'Thời trang', 7, 'Sinh viên KTX HCMUT'],
    ['retinol the ordinary', 'Retinol The Ordinary 0.5%', 'https://s.shopee.vn/6AbCd4', 'Sắc đẹp', 14, 'Skincare review thật'],
  ];
  ready.forEach(([k, n, u, c, d, g], i) => items.push({
    id: 1000 + i, status: 'ready', keyword: k, name: n, url: u, category: c, demand: d, group: g,
  }));
  const pending = [
    ['quạt điều hòa', '', '', null, 6, 'Mẹ bỉm sữa Hà Nội'],
    ['máy lọc không khí', '', '', null, 4, 'Trang trí nhà cửa'],
    ['ghế công thái học', '', '', 'Nhà cửa & Đời sống', 9, 'Văn phòng tiện ích'],
    ['son kem 3CE', '', '', 'Sắc đẹp', 11, 'Skincare review thật'],
    ['quần áo trẻ em', '', '', 'Thời trang', 5, 'Cha mẹ thông thái'],
    ['mì gói hàn quốc', '', '', 'Thực phẩm', 3, 'Yêu bếp ghiền nhà'],
    ['tinh dầu treo xe', '', '', null, 2, 'Trang trí nhà cửa'],
  ];
  pending.forEach(([k, n, u, c, d, g], i) => items.push({
    id: 2000 + i, status: 'pending', keyword: k, name: n, url: u, category: c, demand: d, group: g,
  }));
  const skipped = [
    ['iphone 15 pro max', 'iPhone 15 Pro Max', '', 'Điện tử', 8, 'Hội mê công nghệ'],
    ['rolex submariner', 'Rolex Submariner', '', 'Thời trang', 1, 'Săn deal Shopee giá rẻ'],
    ['xe máy honda', '', '', 'Khác', 2, 'Trang trí nhà cửa'],
  ];
  skipped.forEach(([k, n, u, c, d, g], i) => items.push({
    id: 3000 + i, status: 'skipped', keyword: k, name: n, url: u, category: c, demand: d, group: g,
  }));
  return items;
}

// =========================================================
// Mock bootstrap for web-first UI
// =========================================================
function pad2(n) { return String(n).padStart(2, '0'); }
function mockDateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function mockDateTime(d) {
  return `${mockDateKey(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
function unixTs(d) {
  return Math.floor(d.getTime() / 1000);
}
function slugifyText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
function statusToOrderCode(value) {
  if (value === 'Đã hủy') return 'CANCELLED';
  if (value === 'Chờ xử lý') return 'PENDING';
  return 'COMPLETED';
}
function inferCategory(productName, catalog) {
  const product = (catalog || []).find((item) => String(item.name || '').trim() === String(productName || '').trim());
  return product?.category || 'Khác';
}
function buildMockHistoryRows() {
  const baseRows = buildHistory();
  const modeCycle = ['comment', 'comment', 'telegram', 'pending', 'comment', 'rejected'];
  return baseRows.map((row, index) => {
    const group = GROUPS[index % GROUPS.length];
    const mode = modeCycle[index % modeCycle.length];
    const link = `https://www.facebook.com/groups/${slugifyText(group.name)}/posts/${9000000000 + index}`;
    return {
      id: index + 1,
      time: row.time,
      mode,
      group: group.name,
      groupUrl: group.url,
      product: row.product,
      comment: row.comment,
      account: row.account,
      link,
    };
  });
}
function buildMockHistoryMap(rows) {
  return rows.reduce((acc, row) => {
    const key = mockDateKey(row.time);
    const bucket = acc[key] ||= { comments: [] };
    bucket.comments.push({
      id: row.id,
      time: `${pad2(row.time.getHours())}:${pad2(row.time.getMinutes())}:${pad2(row.time.getSeconds())}`,
      mode: row.mode,
      group: row.groupUrl || row.group,
      permalink: row.link,
      product: row.product,
      comment: row.comment,
      account_name: row.account,
    });
    return acc;
  }, {});
}
function buildMockOrdersRaw(productCatalog) {
  const baseOrders = buildOrders();
  return baseOrders.map((row, index) => {
    const gmv = Math.round(Number(row.gmv || 0));
    const comm = Math.round(Number(row.comm || 0));
    const category = inferCategory(row.product, productCatalog);
    const time = row.time instanceof Date ? row.time : new Date();
    const normalizedSubId = String(row.subId || '').replace(/-g(\d+)-/i, '-group$1-');
    return {
      order_id: `MOCK-ORDER-${1000 + index}`,
      purchase_time: unixTs(time),
      click_time: unixTs(new Date(time.getTime() - 60 * 60 * 1000)),
      estimated_total_commission: comm * 100000,
      total_brand_commission: Math.round(comm * 0.58 * 100000),
      utm_content: normalizedSubId,
      direct_source: row.channel || 'Comment FB',
      last_external_source: row.channel || 'Comment FB',
      orders: [{
        order_sn: `SN-${20260700 + index}`,
        order_status: statusToOrderCode(row.status),
        items: [{
          item_name: row.product,
          shop_name: row.shop,
          actual_amount: gmv * 100000,
          item_commission: comm * 100000,
          global_category_lv1_name: category,
          qty: 1,
        }],
      }],
    };
  });
}
function buildMockClicksRaw(orderRows) {
  const clicks = [];
  let cursor = 1;
  orderRows.forEach((order, index) => {
    const count = 4 + (index % 6);
    for (let i = 0; i < count; i += 1) {
      clicks.push({
        click_id: `CLK-${cursor}`,
        click_time: Number(order.click_time || 0) - i * 1800,
        sub_id: order.utm_content,
        direct_source: order.direct_source || 'Comment FB',
        last_external_source: order.last_external_source || order.direct_source || 'Comment FB',
      });
      cursor += 1;
    }
  });
  return clicks.sort((a, b) => Number(b.click_time || 0) - Number(a.click_time || 0));
}
function buildMockGroupPerf() {
  const today = mockDateKey(new Date());
  const groups = {};
  GROUPS.forEach((group) => {
    const success = Math.max(2, Math.round((group.orders || 0) * 1.6));
    const pendingFb = Math.max(0, Math.round((group.matched || 0) * 0.08));
    const rejected = Math.max(0, Math.round((group.matched || 0) * 0.03));
    const fail = group.enabled ? Math.max(0, Math.round((group.matched || 0) * 0.015)) : 0;
    groups[`group-${group.id}`] = {
      group_url: group.url,
      scanned_posts: Number(group.scanned || 0),
      suitable_posts: Number(group.matched || 0),
      handled_posts: success,
      comment_success: success,
      comments: success,
      pending_fb: pendingFb,
      rejected,
      fail,
      clicks: Number(group.clicks || 0),
      orders: Number(group.orders || 0),
      commission: Number(group.commission || 0),
      revenue: Number(group.commission || 0),
      rating: group.rating || 'monitor',
    };
  });
  return { days: { [today]: { groups } } };
}
function buildMockRuns() {
  const now = new Date();
  const makeRun = (id, offsetHours, status, groups) => {
    const started = new Date(now.getTime() - offsetHours * 60 * 60 * 1000);
    const finished = status === 'running' ? '' : mockDateTime(new Date(started.getTime() + (22 + id * 7) * 60 * 1000));
    const runGroups = groups.map((group, index) => ({
      group_name: group.name,
      group_url: group.url,
      scanned: Math.max(20, Math.round((group.scanned || 0) / 18)),
      suitable: Math.max(4, Math.round((group.matched || 0) / 16)),
      direct: Math.max(1, Math.round((group.orders || 0) / 2)),
      telegram: group.action === 'telegram' ? Math.max(1, Math.round((group.orders || 0) / 4)) : 0,
      pending: index % 3 === 0 ? 1 : 0,
      pending_fb: index % 4 === 0 ? 1 : 0,
      rejected: index % 5 === 0 ? 1 : 0,
      fail: index % 6 === 0 ? 1 : 0,
      started_at: mockDateTime(new Date(started.getTime() + index * 3 * 60 * 1000)),
      finished_at: finished || '',
    }));
    return {
      id,
      cycle: id,
      status,
      started_at: mockDateTime(started),
      finished_at: finished,
      account_name: pick(['Nguyễn Minh Anh', 'Trần Gia Huy', 'Lê Bảo Ngọc']),
      scope_type: id % 2 === 0 ? 'collection' : 'groups',
      scope_id: id % 2 === 0 ? id : 0,
      scope_name: id % 2 === 0 ? `Cụm vận hành ${id}` : '',
      groups_total: runGroups.length,
      suitable: runGroups.reduce((sum, row) => sum + Number(row.suitable || 0), 0),
      direct: runGroups.reduce((sum, row) => sum + Number(row.direct || 0), 0),
      telegram: runGroups.reduce((sum, row) => sum + Number(row.telegram || 0), 0),
      pending_fb: runGroups.reduce((sum, row) => sum + Number(row.pending_fb || 0), 0),
      rejected: runGroups.reduce((sum, row) => sum + Number(row.rejected || 0), 0),
      fail: runGroups.reduce((sum, row) => sum + Number(row.fail || 0), 0),
      groups: runGroups,
      failed_posts: status === 'error' ? [{
        id: `FAILED-${id}-1`,
        group_name: runGroups[0]?.group_name || 'Nhóm lỗi',
        group_url: runGroups[0]?.group_url || '',
        permalink: `https://facebook.com/posts/${81000000 + id}`,
        comment_text: 'Facebook từ chối nội dung comment ở phiên mock này. Cần kiểm tra lại nội dung và tài khoản.',
        fail_reason: 'rejected',
      }] : [],
    };
  };
  return [
    makeRun(1, 2.5, 'done', GROUPS.slice(0, 5)),
    makeRun(2, 7, 'error', GROUPS.slice(5, 9)),
    makeRun(3, 15, 'done', GROUPS.slice(9, 14)),
  ];
}
function buildMockCollections() {
  const makeMembers = (ids) => ids.map((id, index) => {
    const group = GROUPS.find((item) => item.id === id);
    return {
      groupId: group.id,
      groupName: group.name,
      groupUrl: group.url,
      enabled: group.enabled !== false,
      memberEnabled: group.enabled !== false,
      paused: index === 2,
      action: group.action,
    };
  });
  return [
    {
      id: 1,
      name: 'Cụm điện tử & deal',
      members: makeMembers([1, 2, 5, 7, 10]),
    },
    {
      id: 2,
      name: 'Cụm mẹ bé & gia đình',
      members: makeMembers([3, 4, 9, 15]),
    },
    {
      id: 3,
      name: 'Cụm beauty & lifestyle',
      members: makeMembers([6, 8, 11, 13]),
    },
  ].map((collection) => ({
    ...collection,
    membersTotal: collection.members.length,
    membersEnabled: collection.members.filter((item) => item.memberEnabled !== false).length,
    membersRunnable: collection.members.filter((item) => item.memberEnabled !== false && !item.paused).length,
  }));
}

const MOCK_PRODUCTS = buildProducts().map((item) => ({
  keyword: item.keyword,
  product_name: item.name || item.keyword,
  name: item.name || item.keyword,
  url: item.url || '',
  category: item.category || '',
  demand_count: item.demand || 0,
  status: item.status === 'pending' ? 'pending_link' : item.status,
}));
const MOCK_HISTORY_ROWS = buildMockHistoryRows();
const MOCK_HISTORY = buildMockHistoryMap(MOCK_HISTORY_ROWS);
const MOCK_ORDERS = buildMockOrdersRaw(MOCK_PRODUCTS);
const MOCK_CLICKS = buildMockClicksRaw(MOCK_ORDERS);
const MOCK_GROUP_PERF = buildMockGroupPerf();
const MOCK_GROUP_COLLECTIONS = buildMockCollections();
const MOCK_RUNS = buildMockRuns();
const MOCK_CONFIG = {
  groups: GROUPS.map((group) => group.url),
  group_settings: Object.fromEntries(GROUPS.map((group) => [group.url, {
    id: group.id,
    name: group.name,
    enabled: group.enabled !== false,
    action_mode: group.action,
    last_scan_text: group.lastScan,
  }])),
  buy_keywords: KW_LIST.slice(0, 10),
  blacklist_keywords: ['review', 'tuyển dụng', 'tuyển CTV', 'pass lại'],
  posts_per_group: 20,
  timing: {
    delay_after_comment: 14,
    run_mode: 'cycle',
    cycle_interval: 900,
  },
  workflow: {
    mode: 'full',
    skip_processed: true,
    delete_unapproved_comment: false,
  },
  edge: {
    browser: 'chrome',
    debugging_port: 9222,
    headless: false,
    use_separate_profile: false,
    profile_id: 'default',
    paths: {
      chrome: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
      edge: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
      brave: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'],
      chromium: [],
      coccoc: [],
    },
  },
  tabs: {
    chatgpt: 'https://chatgpt.com',
    shopee: 'https://shopee.vn',
    shopee_affiliate: 'https://affiliate.shopee.vn/dashboard',
  },
  ai: {
    provider: 'auto',
    analysis_prompt: 'Phân tích nhu cầu mua hàng và tín hiệu tương tác trong bài viết Facebook.',
    comment_prompt: 'Tạo comment tự nhiên, ngắn gọn, không spam, ưu tiên tính hữu ích.',
    '9router': {
      enabled: true,
      url: 'https://router.mock.local',
      token: 'mock-router-token-2026',
      combo: 'gpt-4.1-mini',
    },
  },
  telegram: {
    enabled: true,
    bot_token: '123456:mock-token',
    chat_id: '-1002468001',
    control_enabled: true,
    notify_comment_errors: true,
    link_preview: false,
  },
  affiliate_api: {
    method: 'api',
  },
  link_converter: {
    provider: 'tinyurl',
    affiliate_id: '214365870',
    muahangre: {
      api_key: 'mock-muahangre-key',
      status: 'healthy',
      updated_at: mockDateTime(new Date()),
      last_success_at: mockDateTime(new Date()),
    },
  },
  tinyurl: {
    enabled: true,
    browser_confirm_wait_seconds: 8,
    api_tokens: [
      {
        token: 'tiny-api-mock-01',
        active: true,
        updated_at: mockDateTime(new Date()),
        last_error: '',
      },
      {
        token: 'tiny-api-mock-02',
        active: true,
        updated_at: mockDateTime(new Date(Date.now() - 2 * 60 * 60 * 1000)),
        last_error: '429 trong 3 phút trước',
      },
    ],
  },
  telemetry: {
    enabled: true,
    endpoint: 'https://telemetry.mock.local/collect',
    api_key: 'mock-telemetry-key',
    include_traceback: true,
    send_warning: true,
    recent_log_limit: 20,
  },
  cpc_config: {
    average_cpc: 1250,
    per_subid: {
      ELEC: 1450,
      HOME: 1200,
      BEAU: 980,
      MOMK: 1350,
    },
  },
};
const MOCK_TINY_ROWS = [
  { use: true, token: 'tiny...k-01', last: 'Ổn định', updated: '2 phút trước', limitedUntil: '' },
  { use: true, token: 'tiny...k-02', last: '429 tạm thời', updated: '1 giờ trước', limitedUntil: '00:40' },
];
const MOCK_CONFIG_UI = {
  chatgptUrl: MOCK_CONFIG.tabs.chatgpt,
  shopeeUrl: MOCK_CONFIG.tabs.shopee,
  affUrl: MOCK_CONFIG.tabs.shopee_affiliate,
  aiProvider: '9router',
  aiFallback: true,
  aiRouter9: true,
  routerUrl: MOCK_CONFIG.ai['9router'].url,
  routerToken: '••••••••••••',
  combo: MOCK_CONFIG.ai['9router'].combo,
  analyzePrompt: MOCK_CONFIG.ai.analysis_prompt,
  commentPrompt: MOCK_CONFIG.ai.comment_prompt,
  analysisPromptRule: MOCK_CONFIG.ai.analysis_prompt,
  commentPromptRule: MOCK_CONFIG.ai.comment_prompt,
  telemetryEnabled: true,
  telemetryEndpoint: MOCK_CONFIG.telemetry.endpoint,
  telemetryApiKey: '••••••••••••',
  telemetryTraceback: true,
  telemetryWarnings: true,
  telemetryRecentLogs: 20,
  tgEnabled: true,
  tgToken: '••••••••••••',
  tgChatId: MOCK_CONFIG.telegram.chat_id,
  tgPreview: false,
  tgNotifyCommentErrors: true,
  tgControl: true,
  affMethod: 'api',
  cvProvider: 'tinyurl',
  tinyccWaitSeconds: 8,
  affiliateId: MOCK_CONFIG.link_converter.affiliate_id,
  tinyApiKey: '••••••••••••',
  muahangreApiKey: '••••••••••••',
  muahangreStatus: MOCK_CONFIG.link_converter.muahangre,
  tinyRows: MOCK_TINY_ROWS,
  perGroup: 20,
  delay: 14,
  workflow: 'full',
  skipProcessed: true,
  deleteUnapproved: false,
  runMode: 'cycle',
  cycleWait: 15,
  browserType: 'chrome',
  browserHeadless: false,
  browserProfileId: 'default',
  browserProfiles: ['Default', 'Profile 1'],
  edgePort: 9222,
  useSeparateProfile: false,
  browserChoices: [
    { type: 'chrome', label: 'Google Chrome', path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', paths: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] },
    { type: 'edge', label: 'Microsoft Edge', path: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', paths: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'] },
    { type: 'brave', label: 'Brave', path: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', paths: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'] },
  ],
};
const MOCK_GROUPS_API = GROUPS.map((group) => ({
  id: group.id,
  url: group.url,
  name: group.name,
  enabled: group.enabled !== false,
  action_mode: group.action,
  last_scan_text: group.lastScan,
}));
const MOCK_PROGRESS = {
  groups: GROUPS.filter((group) => group.enabled !== false).length,
  totalGroups: GROUPS.length,
  scanned: GROUPS.reduce((sum, group) => sum + Number(group.scanned || 0), 0),
  suitable: GROUPS.reduce((sum, group) => sum + Number(group.matched || 0), 0),
  direct: MOCK_HISTORY_ROWS.filter((row) => row.mode === 'comment').length,
  telegram: MOCK_HISTORY_ROWS.filter((row) => row.mode === 'telegram').length,
  currentGroupName: GROUPS[2]?.name || '',
};
const MOCK_APP_CURRENT = {
  config: MOCK_CONFIG,
  configUi: MOCK_CONFIG_UI,
  tinyRows: MOCK_TINY_ROWS,
  groups: GROUPS.map((group) => ({
    ...group,
    comments: Math.max(2, Math.round((group.orders || 0) * 1.6)),
  })),
  products: buildProducts(),
  cpcConfig: MOCK_CONFIG.cpc_config,
  history: MOCK_HISTORY_ROWS,
  orders: buildOrders(),
  clicks: MOCK_CLICKS,
  runs: MOCK_RUNS,
  groupCollections: MOCK_GROUP_COLLECTIONS,
  revenueKpi: REVENUE_KPI,
  progress: MOCK_PROGRESS,
  modeText: 'Chạy đầy đủ • Lặp chu kỳ 15 phút',
  summary: {
    groups: GROUPS.length,
    enabledGroups: GROUPS.filter((group) => group.enabled !== false).length,
    products: buildProducts().length,
    comments: MOCK_HISTORY_ROWS.filter((row) => row.mode === 'comment').length,
    orders: buildOrders().length,
    clicks: MOCK_CLICKS.length,
  },
};
const MOCK_BOOTSTRAP = {
  config: MOCK_CONFIG,
  configUi: MOCK_CONFIG_UI,
  tinyRows: MOCK_TINY_ROWS,
  products: MOCK_PRODUCTS,
  history: MOCK_HISTORY,
  groupPerf: MOCK_GROUP_PERF,
  apiGroups: MOCK_GROUPS_API,
  orders: MOCK_ORDERS,
  clicks: MOCK_CLICKS,
  runs: MOCK_RUNS,
  groupCollections: MOCK_GROUP_COLLECTIONS,
  cpcConfig: MOCK_CONFIG.cpc_config,
  appCurrent: MOCK_APP_CURRENT,
};

window.__FB_CRAWLER_MOCK_BOOTSTRAP__ = {
  config: {},
  configUi: {},
  tinyRows: [],
  products: [],
  history: {},
  groupPerf: { days: {} },
  apiGroups: [],
  orders: [],
  clicks: [],
  runs: [],
  groupCollections: [],
  cpcConfig: { average_cpc: 0, per_subid: {} },
  appCurrent: {
    config: {},
    configUi: {},
    tinyRows: [],
    groups: [],
    products: [],
    cpcConfig: { average_cpc: 0, per_subid: {} },
    history: [],
    orders: [],
    clicks: [],
    runs: [],
    groupCollections: [],
    revenueKpi: REVENUE_KPI,
    progress: {
      groups: 0,
      totalGroups: 0,
      scanned: 0,
      suitable: 0,
      direct: 0,
      telegram: 0,
      currentGroupName: '',
    },
    modeText: '',
    summary: {
      groups: 0,
      enabledGroups: 0,
      products: 0,
      comments: 0,
      orders: 0,
      clicks: 0,
    },
  },
};
window.APP_CURRENT = window.__FB_CRAWLER_MOCK_BOOTSTRAP__.appCurrent;
window.staticDataApi = {
  connected: true,
  loadRunHistory() {
    return Promise.resolve({ ok: true, data: { runs: (window.APP_CURRENT?.runs || []) } });
  },
  loadGroupCollections() {
    return Promise.resolve({ ok: true, data: { collections: (window.APP_CURRENT?.groupCollections || []) } });
  },
  refreshGroupPerformance() {
    return Promise.resolve({
      ok: true,
      data: {
        rows: [],
      },
    });
  },
};
window.refreshRealData = function () {
  window.dispatchEvent(new CustomEvent('app:data-refreshed', { detail: window.APP_CURRENT }));
  return Promise.resolve(window.APP_CURRENT);
};
window.refreshRevenueData = function () {
  window.dispatchEvent(new CustomEvent('app:data-refreshed', { detail: window.APP_CURRENT }));
  return Promise.resolve(window.APP_CURRENT);
};

Object.assign(window, {
  fmt,
  INITIAL_LOGS,
  nextLog,
  GROUPS,
  RATING_META,
  normalizeGroupRating,
  evaluateGroupPerformance,
  buildHistory,
  REVENUE_KPI,
  buildDailyRevenue,
  buildHourly,
  TOP_PRODUCTS,
  TOP_SHOPS,
  CATEGORIES,
  buildSubIds,
  buildOrders,
  INDUSTRIES,
  PROD_STATUSES,
  buildProducts,
  staticDataApi: window.staticDataApi,
  refreshRealData: window.refreshRealData,
  refreshRevenueData: window.refreshRevenueData,
});

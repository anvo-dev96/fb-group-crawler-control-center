/* app.jsx — main shell */

// Module-level timers (single App instance) — gom các event data-changed tần suất cao
// để tránh reload toàn bộ DB sau mỗi group/sản phẩm khi bot đang chạy nhiều group.
let _refreshDebounceTimer = null;
let _logBatchTimer = null;
let _logBatch = [];

const APP_DEFAULTS = {
  "theme": "dark",
  "dark": true,
  "accent": "#c8a46b",
  "density": "balanced",
  "nav": "sidebar",
  "status": "idle"
};

const UI_PREFS_STORAGE_KEY = 'fbCrawlerUiPrefs';

// Accent options
const ACCENT_OPTIONS = [
  '#c8a46b', // titanium gold
  '#a67c52', // bronze
  '#6f9cd6', // steel blue
  '#56b985', // olive green
  '#d46a6a', // muted red
];

function classifyLogEntry(entry) {
  const level = String(entry.level || 'info').toLowerCase();
  const tag = String(entry.tag || 'BE').toUpperCase();
  const msg = String(entry.message || '');
  const text = `${tag} ${msg}`.toLowerCase();

  if (level === 'error' || msg.startsWith('❌')) return 'error';
  if (level === 'warning' || level === 'warn' || msg.startsWith('⚠')) return 'warn';
  if (msg.startsWith('⏩') || msg.startsWith('⏭')) return 'skip';
  if (msg.startsWith('✅')) return 'success';
  if (tag.includes('BROWSER') || tag.includes('EDGE') || text.includes('[browser]') || text.includes('debug port') || text.includes('attach')) return 'browser';
  if (tag.includes('FB') || text.includes('[fb]') || text.includes('facebook') || text.includes('feed') || text.includes('permalink')) return 'facebook';
  if (tag.includes('AI') || text.includes('[9router]') || text.includes('[chatgpt]') || text.includes('chatgpt') || text.includes('9router')) return 'ai';
  if (tag.includes('SHOPEE') || tag.includes('AFF') || text.includes('[shopee]') || text.includes('[affiliate') || text.includes('affiliate link')) return 'shopee';
  if (tag.includes('TG') || tag.includes('TELEGRAM') || text.includes('telegram')) return 'telegram';
  if (tag.includes('CACHE') || text.includes('[cache]') || text.includes('[productcache]')) return 'cache';
  if (tag.includes('TINYURL') || tag.includes('TINY.CC') || text.includes('[tinyurl]') || text.includes('[tiny.cc]')) return 'tinyurl';
  if (tag.includes('STATS') || tag.includes('SYNC') || text.includes('[stats]') || text.includes('sync')) return 'stats';
  if (tag.includes('CMT') || text.includes('comment')) return 'comment';
  if (tag.includes('PRODUCT') || text.includes('keyword')) return 'product';
  if (tag.includes('SUMMARY') || text.includes('[summary]')) return 'summary';
  if (level === 'success') return 'success';
  return 'system';
}

function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function formatUpdateSize(bytes) {
  const n = Number(bytes || 0);
  if (!n) return '';
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  if (n >= 1024) return Math.round(n / 1024) + ' KB';
  return n + ' B';
}

function formatReleaseDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function WhatsNewDialog({ info, onClose, onOpenRelease }) {
  if (!info) return null;
  return (
    <Dialog
      title={'Đã cập nhật lên v' + (info.version || '')}
      width={620}
      onClose={onClose}
      footer={(
        <>
          <button className="btn ghost" onClick={() => onOpenRelease(info.release_url)}>
            <Icon name="external" size={13} /> Xem trên GitHub
          </button>
          <span className="spacer" />
          <button className="btn primary" onClick={onClose}>Bắt đầu dùng</button>
        </>
      )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
          {info.previous_version && (
            <>
              <Badge>v{info.previous_version}</Badge>
              <Icon name="chevronRight" size={14} />
            </>
          )}
          <Badge kind="ok">v{info.version}</Badge>
          <span className="dim">Cập nhật thành công, dưới đây là các thay đổi:</span>
        </div>
        <div style={{
          maxHeight: 360,
          overflow: 'auto',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '12px 16px',
          background: 'var(--bg-elev)',
        }}>
          <MarkdownNotes text={info.notes} />
        </div>
      </div>
    </Dialog>
  );
}

function UpdateDialog({ info, busy, message, hideAgain, setHideAgain, onDismiss, onInstall, onOpenRelease }) {
  if (!info) return null;
  const canInstall = !!info.can_install && !info.dev_mode;
  const size = formatUpdateSize(info.asset_size);
  return (
    <Dialog
      title={'Có phiên bản mới v' + (info.latest_version || '')}
      width={620}
      onClose={() => onDismiss(hideAgain)}
      footer={(
        <>
          <button className="btn ghost" onClick={() => onOpenRelease(info.release_url)}>
            <Icon name="external" size={13} /> Mở release
          </button>
          <span className="spacer" />
          <button className="btn" onClick={() => onDismiss(hideAgain)}>
            Để sau
          </button>
          <button className="btn primary" disabled={busy} onClick={onInstall}>
            <Icon name={canInstall ? 'download' : 'external'} size={13} />
            {busy ? 'Đang chuẩn bị…' : canInstall ? 'Cập nhật ngay' : 'Xem bản release'}
          </button>
        </>
      )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="grid grid-2" style={{ gap: 10 }}>
          <div className="section" style={{ margin: 0 }}>
            <div className="section-body" style={{ padding: 12 }}>
              <div className="dim" style={{ fontSize: 12 }}>Phiên bản hiện tại</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>v{info.current_version || '—'}</div>
            </div>
          </div>
          <div className="section" style={{ margin: 0 }}>
            <div className="section-body" style={{ padding: 12 }}>
              <div className="dim" style={{ fontSize: 12 }}>Phiên bản mới</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>v{info.latest_version || '—'}</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
          <Badge kind="info">{info.channel === 'DEV' ? 'Bản DEV / master' : 'Bản release license'}</Badge>
          {info.asset_name && <Badge>{info.asset_name}</Badge>}
          {size && <Badge>{size}</Badge>}
          {info.published_at && <Badge>{formatReleaseDate(info.published_at)}</Badge>}
        </div>

        {info.dev_mode && (
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 12,
            background: 'var(--bg-elev)',
            color: 'var(--fg-muted)',
            fontSize: 13,
            lineHeight: 1.5,
          }}>
            Bạn đang chạy bản DEV từ source/master nên app không tự ghi đè mã nguồn và không yêu cầu license.
            Nút cập nhật sẽ mở trang GitHub Release để tải bản đóng gói nếu cần kiểm tra bản license.
          </div>
        )}

        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Có gì mới trong bản này</div>
          <div style={{
            maxHeight: 340,
            overflow: 'auto',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '12px 16px',
            background: 'var(--bg-elev)',
          }}>
            <MarkdownNotes text={info.notes} />
          </div>
        </div>

        <Checkbox
          checked={hideAgain}
          onChange={setHideAgain}
          label={'Không hiện lại thông báo cho v' + (info.latest_version || '')}
        />

        {message && (
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 10,
            fontSize: 13,
            color: message.includes('Lỗi') || message.includes('Không') ? 'var(--danger)' : 'var(--fg-muted)',
            background: 'var(--bg-elev)',
          }}>
            {message}
          </div>
        )}
      </div>
    </Dialog>
  );
}

const APP_ROUTES = {
  dashboard: {
    key: 'dashboard',
    tab: 'dashboard',
    layout: 'dashboard',
    title: 'Tổng quan',
    nav: 'Tổng quan',
    icon: 'chart',
    description: 'Theo dõi trạng thái crawler, browser, log realtime và nhóm đang chạy trong một màn hình.',
  },
  live: {
    key: 'live',
    tab: 'log',
    layout: 'monitor',
    title: 'Giám sát trực tiếp',
    nav: 'Giám sát trực tiếp',
    icon: 'log',
    description: 'Theo dõi log realtime, lỗi gần đây và tín hiệu vận hành khi crawler đang chạy.',
  },
  crawl: {
    key: 'crawl',
    tab: 'config',
    sub: 'tm',
    layout: 'form',
    title: 'Cấu hình',
    nav: 'Cấu hình',
    icon: 'settings',
    description: 'Điều chỉnh workflow, browser, delay và toàn bộ cấu hình vận hành của crawler.',
  },
  workers: {
    key: 'workers',
    tab: 'workers',
    layout: 'data',
    title: 'Worker',
    nav: 'Worker',
    icon: 'bot',
    description: 'Quản lý browser slot, profile riêng, debug port và trạng thái chạy độc lập cho từng tài khoản bot.',
  },
  keywords: {
    key: 'keywords',
    tab: 'config',
    sub: 'kw',
    layout: 'form',
    title: 'Từ khóa mua hàng',
    nav: 'Từ khóa mua hàng',
    icon: 'filter',
    description: 'Quản lý từ khóa mua, blacklist và rule lọc bài cho luồng crawl Facebook group.',
  },
  groups: {
    key: 'groups',
    tab: 'groups',
    sub: 'list',
    layout: 'data',
    title: 'Nhóm Facebook',
    nav: 'Nhóm Facebook',
    icon: 'users',
    description: 'Quản lý danh sách group, bật tắt nhóm, import/export và quick action trực tiếp trên bảng.',
  },
  groupStats: {
    key: 'groupStats',
    tab: 'groups',
    sub: 'stats',
    layout: 'data',
    title: 'Hiệu quả nhóm',
    nav: 'Hiệu quả nhóm',
    icon: 'chart',
    description: 'Phân tích hiệu quả theo group để phát hiện nhóm mạnh, yếu hoặc cần tối ưu.',
  },
  products: {
    key: 'products',
    tab: 'products',
    sub: 'ready',
    layout: 'data',
    title: 'Kho sản phẩm',
    nav: 'Kho sản phẩm',
    icon: 'box',
    description: 'Kho sản phẩm, URL, trạng thái sẵn sàng và các quick action để xử lý hàng loạt.',
  },
  backlog: {
    key: 'backlog',
    tab: 'products',
    sub: 'pending',
    layout: 'data',
    title: 'Từ khóa chờ xử lý',
    nav: 'Từ khóa chờ xử lý',
    icon: 'post',
    description: 'Các từ khóa chờ link hoặc cần enrich thêm trước khi hệ thống xử lý tiếp.',
  },
  analytics: {
    key: 'analytics',
    tab: 'history',
    sub: 'analytics',
    layout: 'data',
    title: 'Phân tích xử lý',
    nav: 'Phân tích xử lý',
    icon: 'chart',
    description: 'Phân tích hiệu quả comment, xử lý và tỉ lệ lỗi theo cụm, nhóm hoặc tài khoản.',
  },
  history: {
    key: 'history',
    tab: 'history',
    sub: 'comments',
    layout: 'data',
    title: 'Lịch sử xử lý',
    nav: 'Lịch sử xử lý',
    icon: 'history',
    description: 'Lịch sử xử lý, comment, retry và chi tiết record đã đi qua pipeline.',
  },
  runs: {
    key: 'runs',
    tab: 'history',
    sub: 'runs',
    layout: 'data',
    title: 'Lịch sử chạy',
    nav: 'Lịch sử chạy',
    icon: 'refresh',
    description: 'Theo dõi phiên chạy nhóm, trạng thái fail/done và nhịp vận hành theo ngày.',
  },
  revenue: {
    key: 'revenue',
    tab: 'revenue',
    sub: 'overview',
    layout: 'data',
    title: 'Thống kê doanh thu',
    nav: 'Thống kê doanh thu',
    icon: 'chart',
    description: 'Tổng quan stats, click, đơn, subid và các chỉ số hiệu quả hiện có trong app gốc.',
  },
};

const NAV_SECTIONS = [
  {
    title: 'Tổng quan',
    items: ['dashboard', 'live'],
  },
  {
    title: 'Vận hành',
    items: ['workers', 'groups', 'keywords'],
  },
  {
    title: 'Sản phẩm',
    items: ['products', 'backlog'],
  },
  {
    title: 'Dữ liệu & phân tích',
    items: ['analytics', 'history', 'runs', 'revenue', 'groupStats'],
  },
  {
    title: 'Hệ thống',
    items: ['crawl'],
  },
];

function getRouteSectionMeta(routeKey) {
  for (let sectionIndex = 0; sectionIndex < NAV_SECTIONS.length; sectionIndex += 1) {
    const itemIndex = NAV_SECTIONS[sectionIndex].items.indexOf(routeKey);
    if (itemIndex !== -1) {
      return {
        title: NAV_SECTIONS[sectionIndex].title,
        ordinal: `${String(sectionIndex + 1).padStart(2, '0')}.${String(itemIndex + 1).padStart(2, '0')}`,
      };
    }
  }
  return {
    title: 'Điều hướng',
    ordinal: '00.00',
  };
}

const SERVER_HEALTH_STORAGE_KEY = 'fbCrawlerServerHealthUrl';

function normalizeServerBaseInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'http://127.0.0.1:8787';
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  return withProtocol.replace(/\/+$/, '');
}

function buildServerHealthCandidates(value) {
  const base = normalizeServerBaseInput(value);
  const direct = /\/(health|api\/health)$/i.test(base) ? [base] : [];
  return Array.from(new Set([
    ...direct,
    `${base}/health`,
    `${base}/api/health`,
    base,
  ]));
}

function resolveServerPort(value) {
  try {
    const parsed = new URL(normalizeServerBaseInput(value));
    if (parsed.port) return Number(parsed.port) || 8787;
    return parsed.protocol === 'https:' ? 443 : 80;
  } catch (error) {
    return 8787;
  }
}

function formatDashboardNumber(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat('vi-VN').format(Number.isFinite(n) ? n : 0);
}

function formatDashboardCompact(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function normalizeRouteSearchText(route) {
  return `${route.title} ${route.nav} ${route.description}`.toLowerCase();
}

function normalizeGroupRouteUrl(value) {
  return String(value || '')
    .replace(/^https?:\/\/(www\.)?facebook\.com\//i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

function formatLogClock(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function formatLogRelative(value) {
  const time = value instanceof Date ? value : new Date(value || Date.now());
  const diff = Math.max(0, Date.now() - time.getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

function MiniTrend({ values = [], tone = 'accent' }) {
  const safe = values.filter((value) => Number.isFinite(Number(value)));
  const max = Math.max(...safe, 1);
  return (
    <div className={'mini-trend tone-' + tone}>
      {(safe.length ? safe : [0, 0, 0, 0, 0, 0]).slice(-12).map((value, index) => (
        <span
          key={index}
          className="mini-trend-bar"
          style={{ height: `${Math.max(16, (Number(value || 0) / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function ControlMetricCard({ icon, label, value, meta, tone = 'accent', trend = [], onClick }) {
  const content = (
    <>
      <div className="metric-card-head">
        <span className={'metric-card-icon tone-' + tone}><Icon name={icon} size={15} /></span>
        <span className="metric-card-label">{label}</span>
      </div>
      <div className="metric-card-value">{value}</div>
      <div className="metric-card-meta">{meta}</div>
      <MiniTrend values={trend} tone={tone} />
    </>
  );
  if (!onClick) return <div className="metric-card">{content}</div>;
  return (
    <button className="metric-card interactive" onClick={onClick}>
      {content}
    </button>
  );
}

function DashboardPanel({ title, meta, action, children, className = '' }) {
  return (
    <section className={'dashboard-panel ' + className}>
      <div className="dashboard-panel-head">
        <div>
          <h3>{title}</h3>
          {meta && <p>{meta}</p>}
        </div>
        {action}
      </div>
      <div className="dashboard-panel-body">{children}</div>
    </section>
  );
}

function buildSparkPath(values, width, height, padding = 16) {
  const safe = values.map((value) => Math.max(0, Number(value || 0)));
  const max = Math.max(...safe, 1);
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const stepX = safe.length > 1 ? innerWidth / (safe.length - 1) : innerWidth;
  const points = safe.map((value, index) => {
    const x = padding + index * stepX;
    const y = padding + innerHeight - (value / max) * innerHeight;
    return [x, y];
  });
  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  const area = `${line} L ${padding + innerWidth} ${padding + innerHeight} L ${padding} ${padding + innerHeight} Z`;
  return { line, area, max, points };
}

function formatDashboardLabel(value, fallback = '—') {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? fallback
      : value.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  }
  if (value == null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function DashboardLineChart({ rows = [], series = [] }) {
  const width = 640;
  const height = 220;
  const padding = 18;
  const allValues = series.flatMap((item) => rows.map((row) => Number(row[item.key] || 0)));
  const max = Math.max(...allValues, 1);
  const gridValues = [1, 0.66, 0.33, 0].map((ratio) => Math.round(max * ratio));
  const builtSeries = series.map((item) => {
    const values = rows.map((row) => Number(row[item.key] || 0));
    return { ...item, values, ...buildSparkPath(values, width, height, padding) };
  });

  return (
    <div className="dashboard-line-chart">
      <div className="dashboard-chart-legend">
        {series.map((item) => (
          <span key={item.key} className="dashboard-chart-legend-item">
            <span className="dashboard-chart-legend-swatch" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <div className="dashboard-line-chart-shell">
        <svg viewBox={`0 0 ${width} ${height}`} className="dashboard-line-chart-svg" aria-hidden="true">
          {gridValues.map((value, index) => {
            const y = padding + ((height - padding * 2) * index) / (gridValues.length - 1);
            return (
              <g key={index}>
                <line x1={padding} y1={y} x2={width - padding} y2={y} className="dashboard-chart-gridline" />
                <text x="0" y={y + 4} className="dashboard-chart-axis">{formatDashboardCompact(value)}</text>
              </g>
            );
          })}
          {builtSeries[0] && (
            <path
              d={builtSeries[0].area}
              fill="url(#dashboard-area-accent)"
              opacity="0.18"
            />
          )}
          <defs>
            <linearGradient id="dashboard-area-accent" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" />
              <stop offset="100%" stopColor="rgba(45,127,249,0)" />
            </linearGradient>
          </defs>
          {builtSeries.map((item) => (
            <g key={item.key}>
              <path d={item.line} fill="none" stroke={item.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              {item.points.map(([x, y], index) => (
                <circle key={index} cx={x} cy={y} r="2.8" fill={item.color} />
              ))}
            </g>
          ))}
        </svg>
      </div>
      <div className="dashboard-chart-labels">
        {rows.map((row, index) => {
          const label = formatDashboardLabel(row.label, `D${index + 1}`);
          return <span key={`${label}-${index}`}>{label}</span>;
        })}
      </div>
    </div>
  );
}

function DashboardStackedBars({ rows = [], segments = [] }) {
  const max = Math.max(...rows.map((row) => segments.reduce((sum, segment) => sum + Number(row[segment.key] || 0), 0)), 1);
  return (
    <div className="dashboard-stacked-bars">
      <div className="dashboard-chart-legend">
        {segments.map((segment) => (
          <span key={segment.key} className="dashboard-chart-legend-item">
            <span className="dashboard-chart-legend-swatch" style={{ background: segment.color }} />
            {segment.label}
          </span>
        ))}
      </div>
      <div className="dashboard-stacked-bars-shell">
        {rows.map((row) => {
          const total = Math.max(segments.reduce((sum, segment) => sum + Number(row[segment.key] || 0), 0), 0);
          const label = formatDashboardLabel(row.label);
          return (
            <div key={`${label}-${total}`} className="dashboard-stacked-bar-col">
              <div className="dashboard-stacked-bar-value">{formatDashboardCompact(total)}</div>
              <div className="dashboard-stacked-bar-track">
                {segments.map((segment) => {
                  const value = Number(row[segment.key] || 0);
                  const height = total ? `${(value / total) * 100}%` : '0%';
                  return <span key={segment.key} className="dashboard-stacked-bar-segment" style={{ height, background: segment.color }} />;
                })}
              </div>
              <div className="dashboard-stacked-bar-scale" style={{ height: `${Math.max(18, (total / max) * 100)}%` }} />
              <div className="dashboard-stacked-bar-label">{label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DashboardRankBars({ rows = [], primaryKey, secondaryKey, primaryColor = 'var(--accent)', secondaryColor = 'var(--info)' }) {
  const max = Math.max(
    ...rows.flatMap((row) => [Number(row[primaryKey] || 0), Number(secondaryKey ? row[secondaryKey] || 0 : 0)]),
    1
  );
  return (
    <div className="dashboard-rank-bars">
      {rows.map((row) => {
        const primary = Number(row[primaryKey] || 0);
        const secondary = Number(secondaryKey ? row[secondaryKey] || 0 : 0);
        const label = formatDashboardLabel(row.label);
        return (
          <div key={`${label}-${primary}-${secondary}`} className="dashboard-rank-row">
            <div className="dashboard-rank-head">
              <span className="dashboard-rank-label">{label}</span>
              <span className="dashboard-rank-meta">
                {formatDashboardCompact(primary)}
                {secondaryKey ? ` / ${formatDashboardCompact(secondary)}` : ''}
              </span>
            </div>
            <div className="dashboard-rank-track">
              <span className="dashboard-rank-bar primary" style={{ width: `${(primary / max) * 100}%`, background: primaryColor }} />
              {secondaryKey && secondary > 0 && (
                <span className="dashboard-rank-bar secondary" style={{ width: `${(secondary / max) * 100}%`, background: secondaryColor }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DashboardDonutChart({ segments = [], centerLabel, centerValue }) {
  const total = Math.max(segments.reduce((sum, item) => sum + Number(item.value || 0), 0), 1);
  let cursor = 0;
  const gradient = segments.map((item) => {
    const start = (cursor / total) * 360;
    cursor += Number(item.value || 0);
    const end = (cursor / total) * 360;
    return `${item.color} ${start}deg ${end}deg`;
  }).join(', ');
  return (
    <div className="dashboard-donut-wrap">
      <div className="dashboard-donut" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="dashboard-donut-hole">
          <span>{centerLabel}</span>
          <strong>{centerValue}</strong>
        </div>
      </div>
      <div className="dashboard-chart-legend vertical">
        {segments.map((item) => (
          <span key={item.key} className="dashboard-chart-legend-item split">
            <span className="dashboard-chart-legend-swatch" style={{ background: item.color }} />
            <span>{item.label}</span>
            <b>{formatDashboardCompact(item.value)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function DashboardHome({
  appData,
  progress,
  backendLogs,
  browserStatus,
  backendConnected,
  displayStatus,
  resolvedStatusText,
  resolvedModeText,
  progressPct,
  hasProgressContext,
  runningGroupUrl,
  onOpenRoute,
}) {
  const groups = Array.isArray(appData.groups) ? appData.groups : [];
  const products = Array.isArray(appData.products) ? appData.products : [];
  const history = Array.isArray(appData.history) ? appData.history : [];
  const orders = Array.isArray(appData.orders) ? appData.orders : [];
  const clicks = Array.isArray(appData.clicks) ? appData.clicks : [];
  const summary = appData.summary || {};
  const revenueKpi = appData.revenueKpi || window.REVENUE_KPI || {};
  const logList = Array.isArray(backendLogs) && backendLogs.length
    ? backendLogs
    : (window.INITIAL_LOGS || []).map((item, index) => ({
        id: 'fallback-' + index,
        ts: new Date(Date.now() + Number(item.t || 0) * 1000),
        k: item.k,
        tag: item.tag,
        msg: item.msg,
      }));
  const recentLogs = [...logList].slice(-8).reverse();
  const issues = [...logList].filter((item) => item.k === 'error' || item.k === 'warn').slice(-5).reverse();
  const enabledGroups = groups.filter((group) => group.enabled);
  const pendingProducts = products.filter((item) => item.status !== 'ready').length;
  const runningGroupKey = normalizeGroupRouteUrl(runningGroupUrl);
  const currentGroup = groups.find((group) => normalizeGroupRouteUrl(group.url) === runningGroupKey);
  const trendSource = typeof window.buildDailyRevenue === 'function'
    ? window.buildDailyRevenue({ from: '', to: '' }) || []
    : [];
  const trendValues = Array.isArray(trendSource) ? trendSource.map((row) => Number(row.orders || row.clicks || row.comm || 0)) : [];
  const historyByGroup = new Map();
  history.forEach((row) => {
    const key = normalizeGroupRouteUrl(row.groupUrl || row.group || '');
    const fallbackKey = key || String(row.group || '').trim().toLowerCase();
    if (!fallbackKey) return;
    const bucket = historyByGroup.get(fallbackKey) || {
      key: fallbackKey,
      group: row.group || 'Nhóm chưa rõ',
      groupUrl: row.groupUrl || '',
      success: 0,
      pending: 0,
      rejected: 0,
      telegram: 0,
      lastAt: null,
    };
    const mode = String(row.mode || '').toLowerCase();
    if (mode === 'comment') bucket.success += 1;
    else if (mode === 'pending') bucket.pending += 1;
    else if (mode === 'rejected') bucket.rejected += 1;
    else if (mode === 'telegram') bucket.telegram += 1;
    const time = row.time instanceof Date ? row.time : new Date(row.time || Date.now());
    if (!bucket.lastAt || time > bucket.lastAt) bucket.lastAt = time;
    historyByGroup.set(fallbackKey, bucket);
  });
  const groupOutcomeRows = groups.map((group) => {
    const key = normalizeGroupRouteUrl(group.url || '') || String(group.name || '').toLowerCase();
    const bucket = historyByGroup.get(key) || {};
    const success = Number(bucket.success ?? group.comments ?? 0);
    const pending = Number(bucket.pending ?? group.pending_fb ?? group.pending ?? 0);
    const rejected = Number(bucket.rejected ?? group.rejected ?? 0);
    const outcomes = success + pending + rejected;
    return {
      id: group.id,
      label: group.name,
      name: group.name,
      url: group.url,
      enabled: group.enabled,
      action: group.action,
      scanned: Number(group.scanned || 0),
      matched: Number(group.matched || 0),
      success,
      pending,
      rejected,
      clicks: Number(group.clicks || 0),
      orders: Number(group.orders || 0),
      commission: Number(group.commission || 0),
      lastScan: group.lastScan || '—',
      lastCommentAt: bucket.lastAt || null,
      successRate: outcomes ? (success / outcomes) * 100 : 0,
      isCurrent: normalizeGroupRouteUrl(group.url) === runningGroupKey,
    };
  });
  const topCommentGroups = [...groupOutcomeRows]
    .sort((a, b) => b.success - a.success || b.matched - a.matched || b.scanned - a.scanned)
    .slice(0, 6)
    .map((row) => ({
      label: row.name,
      success: row.success,
      pending: row.pending,
      rejected: row.rejected,
    }));
  const scanVsMatchRows = [...groupOutcomeRows]
    .sort((a, b) => b.matched - a.matched || b.scanned - a.scanned)
    .slice(0, 6)
    .map((row) => ({
      label: row.name,
      scanned: row.scanned,
      matched: row.matched,
    }));
  const totalSuccess = groupOutcomeRows.reduce((sum, row) => sum + row.success, 0);
  const totalPending = groupOutcomeRows.reduce((sum, row) => sum + row.pending, 0);
  const totalRejected = groupOutcomeRows.reduce((sum, row) => sum + row.rejected, 0);
  const totalOutcomes = totalSuccess + totalPending + totalRejected;
  const last10Days = Array.from({ length: 10 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (9 - index));
    const key = date.toISOString().slice(0, 10);
    const label = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    return { key, label, success: 0, pending: 0, rejected: 0, telegram: 0 };
  });
  const dayMap = new Map(last10Days.map((row) => [row.key, row]));
  history.forEach((row) => {
    const time = row.time instanceof Date ? row.time : new Date(row.time || Date.now());
    if (Number.isNaN(time.getTime())) return;
    const key = time.toISOString().slice(0, 10);
    const bucket = dayMap.get(key);
    if (!bucket) return;
    const mode = String(row.mode || '').toLowerCase();
    if (mode === 'comment') bucket.success += 1;
    else if (mode === 'pending') bucket.pending += 1;
    else if (mode === 'rejected') bucket.rejected += 1;
    else if (mode === 'telegram') bucket.telegram += 1;
  });
  const dailyOutcomeRows = last10Days.map((row) => ({
    ...row,
    total: row.success + row.pending + row.rejected,
  }));
  const revenueTrendRows = (Array.isArray(trendSource) ? trendSource : []).slice(-10).map((row, index) => ({
    label: row.label || row.day || row.date || dailyOutcomeRows[index]?.label || `D${index + 1}`,
    clicks: Number(row.clicks || 0),
    orders: Number(row.orders || 0),
    commission: Number(row.comm || row.commission || 0),
  }));
  const metricCards = [
    {
      icon: 'users',
      label: 'Nhóm đang quản lý',
      value: formatDashboardNumber(summary.groups || groups.length),
      meta: `${formatDashboardNumber(summary.enabledGroups || enabledGroups.length)} nhóm đang bật`,
      tone: 'accent',
      trend: trendValues,
      route: 'groups',
    },
    {
      icon: 'post',
      label: 'Bài đã quét',
      value: formatDashboardCompact(progress.scanned || 0),
      meta: `${formatDashboardNumber(progress.totalGroups || enabledGroups.length)} group trong nhịp hiện tại`,
      tone: 'info',
      trend: scanVsMatchRows.map((row) => row.scanned),
      route: 'live',
    },
    {
      icon: 'spark',
      label: 'Bài match tín hiệu',
      value: formatDashboardCompact(progress.suitable || 0),
      meta: `${formatDashboardNumber(pendingProducts)} keyword/sản phẩm đang chờ xử lý`,
      tone: 'accent',
      trend: scanVsMatchRows.map((row) => row.matched),
      route: 'analytics',
    },
    {
      icon: 'check',
      label: 'Comment thành công',
      value: formatDashboardCompact(totalSuccess || summary.comments || 0),
      meta: totalOutcomes ? `${Math.round((totalSuccess / totalOutcomes) * 100)}% trên tổng comment outcome` : 'Chưa có outcome comment',
      tone: 'ok',
      trend: dailyOutcomeRows.map((row) => row.success),
      route: 'history',
    },
    {
      icon: 'history',
      label: 'Chờ duyệt',
      value: formatDashboardCompact(totalPending),
      meta: 'Các comment còn nằm trong hàng chờ Facebook duyệt',
      tone: 'warn',
      trend: dailyOutcomeRows.map((row) => row.pending),
      route: 'history',
    },
    {
      icon: 'alert',
      label: 'Bị từ chối',
      value: formatDashboardCompact(totalRejected),
      meta: 'Các comment cần review hoặc repost lại',
      tone: 'danger',
      trend: dailyOutcomeRows.map((row) => row.rejected),
      route: 'history',
    },
    {
      icon: 'telegram',
      label: 'Dispatch',
      value: formatDashboardCompact((progress.direct || 0) + (progress.telegram || 0)),
      meta: `${formatDashboardNumber(progress.direct || 0)} trực tiếp • ${formatDashboardNumber(progress.telegram || 0)} Telegram`,
      tone: 'info',
      trend: dailyOutcomeRows.map((row) => row.telegram),
      route: 'history',
    },
    {
      icon: 'chart',
      label: 'Click / đơn',
      value: `${formatDashboardCompact(summary.clicks || clicks.length)} / ${formatDashboardCompact(summary.orders || orders.length)}`,
      meta: `Hoa hồng ${formatDashboardNumber(revenueKpi.totalCommission || 0)}đ`,
      tone: 'danger',
      trend: revenueTrendRows.map((row) => row.orders),
      route: 'revenue',
    },
  ];
  const tableRows = [...groupOutcomeRows]
    .sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return Number(b.isCurrent) - Number(a.isCurrent);
      if (a.enabled !== b.enabled) return Number(b.enabled) - Number(a.enabled);
      return (b.success + b.pending + b.rejected) - (a.success + a.pending + a.rejected) || b.matched - a.matched;
    })
    .slice(0, 12);

  return (
    <div className="dashboard-grid dashboard-grid-redesign">
      <div className="dashboard-main dashboard-main-redesign">
        <section className="dashboard-status-strip">
          <div className="dashboard-status-copy">
            <div className="dashboard-kicker">Điều phối realtime</div>
            <div className="dashboard-status-head">
              <span className={'status-pill ' + displayStatus}><span className="dot" />{resolvedStatusText}</span>
              <Badge kind={backendConnected ? 'ok' : 'warn'}>{backendConnected ? 'Backend đang chạy' : 'Backend chờ kết nối'}</Badge>
              {browserStatus.connected && <Badge kind="accent">Chrome đã gắn</Badge>}
            </div>
            <div className="dashboard-status-title">{resolvedModeText}</div>
            <div className="dashboard-status-note">
              Giữ browser, crawler và phản hồi comment trong cùng một workspace vận hành thay vì nhảy qua nhiều màn rời rạc.
            </div>
            <div className="dashboard-status-inline">
              <span>{formatDashboardNumber(progress.groups || 0)} / {formatDashboardNumber(progress.totalGroups || enabledGroups.length)} phạm vi</span>
              <span>{formatDashboardNumber(progress.scanned || 0)} bài đã quét</span>
              <span>{currentGroup?.name || progress.currentGroupName || 'Chưa có group đang chạy'}</span>
            </div>
          </div>
          <div className="dashboard-status-side">
            <div className="hero-progress">
              <div className="hero-progress-track">
                <div className="hero-progress-fill" style={{ width: hasProgressContext ? `${progressPct}%` : '8%' }} />
              </div>
              <span>{hasProgressContext ? `${Math.round(progressPct)}%` : 'chưa chạy'}</span>
            </div>
            <div className="hero-actions">
              <button className="btn primary lg" onClick={() => onOpenRoute('live')}>
                <Icon name="log" size={14} /> Mở giám sát trực tiếp
              </button>
              <button className="btn lg" onClick={() => onOpenRoute('groups')}>
                <Icon name="users" size={14} /> Mở danh sách nhóm
              </button>
            </div>
          </div>
        </section>

        <div className="metric-grid dashboard-metric-grid">
          {metricCards.map((card) => (
            <ControlMetricCard
              key={card.label}
              icon={card.icon}
              label={card.label}
              value={card.value}
              meta={card.meta}
              tone={card.tone}
              trend={card.trend}
              onClick={() => onOpenRoute(card.route)}
            />
          ))}
        </div>

        <div className="dashboard-chart-grid">
          <DashboardPanel
            className="wide"
            title="Nhịp comment 10 ngày gần nhất"
            meta="Nhìn cùng lúc comment thành công, chờ duyệt và bị từ chối để phát hiện lệch nhịp sớm."
            action={<button className="btn ghost sm" onClick={() => onOpenRoute('history')}><Icon name="history" size={12} /> Mở lịch sử</button>}>
            <DashboardLineChart
              rows={dailyOutcomeRows}
              series={[
                { key: 'success', label: 'Thành công', color: 'var(--ok)' },
                { key: 'pending', label: 'Chờ duyệt', color: 'var(--warn)' },
                { key: 'rejected', label: 'Từ chối', color: 'var(--danger)' },
              ]}
            />
          </DashboardPanel>

          <DashboardPanel
            title="Tỷ trọng kết quả"
            meta="Phân bổ nhanh giữa comment thành công, chờ duyệt và bị từ chối."
            action={<button className="btn ghost sm" onClick={() => onOpenRoute('history')}><Icon name="alert" size={12} /> Kiểm tra</button>}>
            <DashboardDonutChart
              centerLabel="Kết quả"
              centerValue={formatDashboardCompact(totalOutcomes)}
              segments={[
                { key: 'success', label: 'Thành công', value: totalSuccess, color: 'var(--ok)' },
                { key: 'pending', label: 'Chờ duyệt', value: totalPending, color: 'var(--warn)' },
                { key: 'rejected', label: 'Từ chối', value: totalRejected, color: 'var(--danger)' },
              ]}
            />
          </DashboardPanel>

          <DashboardPanel
            title="Top nhóm theo comment"
            meta="Ưu tiên nhóm có nhiều comment thành công và vẫn còn tồn đọng pending/rejected."
            action={<button className="btn ghost sm" onClick={() => onOpenRoute('groupStats')}><Icon name="chart" size={12} /> Hiệu quả nhóm</button>}>
            <DashboardRankBars
              rows={topCommentGroups}
              primaryKey="success"
              secondaryKey="pending"
              primaryColor="var(--ok)"
              secondaryColor="var(--warn)"
            />
          </DashboardPanel>

          <DashboardPanel
            className="wide"
            title="Đã quét và match theo nhóm"
            meta="Chart này dùng để nhìn nhóm nào quét nhiều nhưng match thấp, từ đó cần đổi keyword hoặc giảm ưu tiên."
            action={<button className="btn ghost sm" onClick={() => onOpenRoute('analytics')}><Icon name="spark" size={12} /> Phân tích</button>}>
            <DashboardRankBars
              rows={scanVsMatchRows}
              primaryKey="scanned"
              secondaryKey="matched"
              primaryColor="var(--accent)"
              secondaryColor="var(--accent-3)"
            />
          </DashboardPanel>

          <DashboardPanel
            className="wide"
            title="Xu hướng click và đơn"
            meta="Không phải chart crawl thuần, nhưng giúp nối luồng comment với hiệu quả đơn/click ở tầng downstream."
            action={<button className="btn ghost sm" onClick={() => onOpenRoute('revenue')}><Icon name="external" size={12} /> Doanh thu</button>}>
            <DashboardLineChart
              rows={revenueTrendRows.length ? revenueTrendRows : dailyOutcomeRows}
              series={[
                { key: 'clicks', label: 'Clicks', color: 'var(--accent)' },
                { key: 'orders', label: 'Orders', color: 'var(--info)' },
              ]}
            />
          </DashboardPanel>
        </div>

        <div className="dashboard-support-grid">
          <DashboardPanel
            title="Browser và runtime"
            meta="Trạng thái browser, port và mode đang dùng."
            action={<button className="btn ghost sm" onClick={() => onOpenRoute('browser')}><Icon name="connect" size={12} /> Cấu hình</button>}>
            <div className="status-stack">
              <div className="status-card-row">
                <span className={'status-pill ' + (browserStatus.connected ? 'running' : browserStatus.busy ? 'paused' : 'idle')}>
                  <span className="dot" />{browserStatus.busy ? 'Đang kết nối' : browserStatus.connected ? 'Đã kết nối' : 'Chưa kết nối'}
                </span>
                <Badge kind={backendConnected ? 'ok' : 'warn'}>{backendConnected ? 'Sẵn sàng' : 'Chưa sẵn sàng'}</Badge>
              </div>
              <div className="status-card-copy">{browserStatus.message || 'Sẵn sàng gắn browser hiện có để crawler làm việc.'}</div>
              <div className="status-mini-grid">
                <div><span>Browser</span><strong>{appData.configUi?.browserType || 'chrome'}</strong></div>
                <div><span>Debug port</span><strong>{formatDashboardNumber(appData.configUi?.edgePort || 9222)}</strong></div>
                <div><span>Profile</span><strong>{appData.configUi?.useSeparateProfile ? 'Riêng' : 'Mặc định'}</strong></div>
                <div><span>Chế độ chạy</span><strong>{appData.configUi?.runMode || 'once'}</strong></div>
              </div>
            </div>
          </DashboardPanel>

          <DashboardPanel
            title="Vấn đề gần đây"
            meta="Giữ riêng các lỗi/cảnh báo gần nhất để không bị chìm trong luồng log dài."
            action={<button className="btn ghost sm" onClick={() => onOpenRoute('live')}><Icon name="alert" size={12} /> Xem tất cả</button>}>
            <div className="issue-list">
              {issues.length === 0 ? (
                <div className="dashboard-empty">Chưa có lỗi nào nổi bật trong luồng log hiện tại.</div>
              ) : issues.map((item) => (
                <div key={item.id} className="issue-item">
                  <span className={'issue-dot tone-' + (item.k === 'error' ? 'danger' : 'warn')} />
                  <div>
                    <div className="issue-title">[{item.tag}] {item.msg}</div>
                    <div className="issue-meta">{formatLogRelative(item.ts)}</div>
                  </div>
                </div>
              ))}
            </div>
          </DashboardPanel>

          <DashboardPanel
            title="Luồng log trực tiếp"
            meta="Realtime feed ngắn để không cần đổi màn liên tục khi đang vận hành."
            action={<button className="btn ghost sm" onClick={() => onOpenRoute('live')}><Icon name="log" size={12} /> Xem toàn bộ log</button>}>
            <div className="dashboard-log-list">
              {recentLogs.map((item) => (
                <div key={item.id} className={'dashboard-log-line kind-' + item.k}>
                  <span className="dashboard-log-time">{formatLogClock(item.ts)}</span>
                  <span className="dashboard-log-tag">{item.tag}</span>
                  <span className="dashboard-log-text">{item.msg}</span>
                </div>
              ))}
            </div>
          </DashboardPanel>
        </div>

        <DashboardPanel
          title="Danh sách nhóm theo kết quả comment"
          meta="Bảng cuối ưu tiên đúng tác vụ vận hành: xem nhóm nào đã comment thành công, nhóm nào còn chờ duyệt hoặc bị từ chối."
          action={<button className="btn ghost sm" onClick={() => onOpenRoute('groups')}><Icon name="users" size={12} /> Quản lý nhóm</button>}>
          <div className="dashboard-table-wrap">
            <table className="dashboard-table dashboard-outcome-table">
              <thead>
                <tr>
                  <th>Nhóm</th>
                  <th>Tác vụ</th>
                  <th>Scanned</th>
                  <th>Matched</th>
                  <th>Thành công</th>
                  <th>Chờ duyệt</th>
                  <th>Từ chối</th>
                  <th>Tỷ lệ thành công</th>
                  <th>Lần quét</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 ? (
                  <tr>
                    <td colSpan="9">
                      <div className="dashboard-empty">Chưa có dữ liệu group để dựng bảng outcome comment.</div>
                    </td>
                  </tr>
                ) : tableRows.map((row) => (
                  <tr key={row.id || row.url || row.name} className={row.isCurrent ? 'is-current' : ''}>
                    <td>
                      <div className="dashboard-table-title">
                        <span>{row.name}</span>
                        {row.isCurrent && <Badge kind="ok">Đang chạy</Badge>}
                        {!row.enabled && <Badge kind="warn">Tạm tắt</Badge>}
                      </div>
                    </td>
                    <td>{row.action === 'telegram' ? 'Telegram' : 'Direct'}</td>
                    <td>{formatDashboardNumber(row.scanned)}</td>
                    <td>{formatDashboardNumber(row.matched)}</td>
                    <td><span className="dashboard-count good">{formatDashboardNumber(row.success)}</span></td>
                    <td><span className="dashboard-count wait">{formatDashboardNumber(row.pending)}</span></td>
                    <td><span className="dashboard-count bad">{formatDashboardNumber(row.rejected)}</span></td>
                    <td>{row.success + row.pending + row.rejected ? `${Math.round(row.successRate)}%` : '—'}</td>
                    <td>{row.lastScan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DashboardPanel>
      </div>
    </div>
  );
}

function ServerCheckPage() {
  const initialUrl = (() => {
    try {
      return window.localStorage?.getItem(SERVER_HEALTH_STORAGE_KEY) || 'http://127.0.0.1:8787';
    } catch (err) {
      return 'http://127.0.0.1:8787';
    }
  })();
  const [serverUrl, setServerUrl] = React.useState(initialUrl);
  const [autoCheck, setAutoCheck] = React.useState(true);
  const [managerBusy, setManagerBusy] = React.useState(false);
  const [managerStatus, setManagerStatus] = React.useState({
    running: false,
    stopping: false,
    pid: null,
    port: resolveServerPort(initialUrl),
    url: normalizeServerBaseInput(initialUrl),
    startedAt: null,
    uptimeMs: 0,
    managed: false,
    lastExit: null,
    logs: [],
    available: true,
    error: '',
  });
  const [status, setStatus] = React.useState({
    state: 'idle',
    title: 'Chưa kiểm tra',
    message: 'Nhập base URL của backend crawler rồi bấm kiểm tra.',
    checkedAt: null,
    latencyMs: null,
    httpStatus: null,
    activeUrl: '',
    details: [],
    data: null,
  });

  const saveUrl = React.useCallback((value) => {
    setServerUrl(value);
    try {
      window.localStorage?.setItem(SERVER_HEALTH_STORAGE_KEY, value);
    } catch (err) {}
  }, []);

  const refreshManagerStatus = React.useCallback(async () => {
    try {
      const response = await fetch('/__control/server', {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      setManagerStatus({
        ...payload.data,
        available: true,
        error: '',
      });
    } catch (error) {
      setManagerStatus((prev) => ({
        ...prev,
        available: false,
        error: error?.message || String(error),
      }));
    }
  }, []);

  const checkServer = React.useCallback(async () => {
    const candidates = buildServerHealthCandidates(serverUrl);
    setStatus((prev) => ({
      ...prev,
      state: 'checking',
      title: 'Đang kiểm tra',
      message: 'Đang ping backend crawler và xác nhận health endpoint...',
      activeUrl: candidates[0] || '',
      details: [],
      data: null,
    }));
    for (const url of candidates) {
      const startedAt = performance.now();
      try {
        const response = await fetch(url, {
          method: 'GET',
          cache: 'no-store',
          headers: { Accept: 'application/json, text/plain;q=0.9, */*;q=0.8' },
        });
        const latencyMs = Math.round(performance.now() - startedAt);
        const raw = await response.text();
        let data = null;
        try {
          data = raw ? JSON.parse(raw) : null;
        } catch (err) {
          data = raw || null;
        }
        if (response.ok) {
          setStatus({
            state: 'online',
            title: 'Server đang chạy',
            message: 'Backend trả lời thành công. Web app có thể dùng endpoint này để điều khiển crawler.',
            checkedAt: new Date(),
            latencyMs,
            httpStatus: response.status,
            activeUrl: url,
            details: candidates.map((item) => ({
              url: item,
              ok: item === url,
              note: item === url ? `OK • HTTP ${response.status}` : 'Chưa cần dùng',
            })),
            data,
          });
          return;
        }
        setStatus({
          state: 'reachable',
          title: 'Server có phản hồi nhưng health chưa đúng',
          message: 'Port có phản hồi nhưng endpoint hiện tại chưa trả về 2xx. Có thể server đã chạy nhưng chưa expose health contract đúng.',
          checkedAt: new Date(),
          latencyMs,
          httpStatus: response.status,
          activeUrl: url,
          details: candidates.map((item) => ({
            url: item,
            ok: item === url,
            note: item === url ? `HTTP ${response.status}` : 'Chưa thử tiếp vì đã có phản hồi',
          })),
          data,
        });
        return;
      } catch (error) {
        try {
          await fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store' });
          const latencyMs = Math.round(performance.now() - startedAt);
          setStatus({
            state: 'reachable',
            title: 'Server có vẻ đang chạy nhưng bị chặn CORS/health',
            message: 'Browser chạm được server nhưng không đọc được response. Khả năng cao server chưa mở CORS hoặc chưa có endpoint health chuẩn.',
            checkedAt: new Date(),
            latencyMs,
            httpStatus: null,
            activeUrl: url,
            details: candidates.map((item) => ({
              url: item,
              ok: item === url,
              note: item === url ? 'Có phản hồi opaque (no-cors)' : 'Chưa thử tiếp vì đã thấy port phản hồi',
            })),
            data: null,
          });
          return;
        } catch (opaqueError) {
          const note = error?.message || String(error);
          setStatus((prev) => ({
            ...prev,
            details: [...prev.details, { url, ok: false, note }],
          }));
        }
      }
    }

    setStatus((prev) => ({
      ...prev,
      state: 'offline',
      title: 'Chưa thấy server chạy',
      message: 'Không kết nối được tới các endpoint đã thử. Khả năng cao backend crawler chưa được start hoặc đang chạy sai port.',
      checkedAt: new Date(),
      latencyMs: null,
      httpStatus: null,
      activeUrl: '',
      data: null,
    }));
  }, [serverUrl]);

  const toggleManagedServer = React.useCallback(async () => {
    setManagerBusy(true);
    try {
      const response = await fetch('/__control/server/toggle', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ port: resolveServerPort(serverUrl) }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      if (payload.state) {
        setManagerStatus({
          ...payload.state,
          available: true,
          error: '',
        });
      }
      window.backendApi?.probeNow?.(true);
      window.setTimeout(() => {
        refreshManagerStatus();
        checkServer();
        window.backendApi?.probeNow?.(true);
      }, 600);
      window.setTimeout(() => {
        checkServer();
        window.backendApi?.probeNow?.(true);
      }, 1600);
    } catch (error) {
      setManagerStatus((prev) => ({
        ...prev,
        available: false,
        error: error?.message || String(error),
      }));
    } finally {
      setManagerBusy(false);
    }
  }, [checkServer, refreshManagerStatus, serverUrl]);

  React.useEffect(() => {
    checkServer();
  }, [checkServer]);

  React.useEffect(() => {
    refreshManagerStatus();
  }, [refreshManagerStatus]);

  React.useEffect(() => {
    if (!autoCheck) return undefined;
    const timer = setInterval(() => {
      checkServer();
    }, 15000);
    return () => clearInterval(timer);
  }, [autoCheck, checkServer]);

  React.useEffect(() => {
    const timer = setInterval(() => {
      refreshManagerStatus();
    }, 5000);
    return () => clearInterval(timer);
  }, [refreshManagerStatus]);

  const toneClass = ({
    online: 'ok',
    reachable: 'warn',
    offline: 'danger',
    checking: 'info',
    idle: 'accent',
  }[status.state] || 'accent');
  const checkedAtLabel = status.checkedAt
    ? status.checkedAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';
  const managerToneClass = managerStatus.running ? 'ok' : managerStatus.stopping ? 'warn' : managerStatus.available ? 'accent' : 'danger';
  const managerTitle = managerStatus.running
    ? 'Server local đang bật'
    : managerStatus.stopping
      ? 'Đang dừng server'
      : managerStatus.available
        ? 'Server local đang tắt'
        : 'Không truy cập được local controller';
  const managerMessage = managerStatus.running
    ? `Tiến trình backend của dự án đang chạy ở ${managerStatus.url || normalizeServerBaseInput(serverUrl)}.`
    : managerStatus.available
      ? 'Bạn có thể bật backend crawler ngay từ màn này mà không cần mở thêm terminal khác.'
      : `Web app hiện không gọi được local controller để bật/tắt server. ${managerStatus.error || ''}`.trim();
  const uptimeLabel = managerStatus.running && managerStatus.uptimeMs > 0
    ? `${Math.max(1, Math.round(managerStatus.uptimeMs / 1000))} giây`
    : '—';
  const candidateUrls = buildServerHealthCandidates(serverUrl);

  return (
    <div className="server-check-layout">
      <DashboardPanel
        title="Backend crawler server"
        meta="Kiểm tra local service đã chạy hay chưa trước khi nối Playwright, Chrome profile và luồng crawl thật."
        action={(
          <div className="server-check-actions">
            <button
              className={'btn sm ' + (managerStatus.running ? 'danger' : 'success')}
              disabled={managerBusy || !managerStatus.available}
              onClick={toggleManagedServer}>
              <Icon name={managerStatus.running ? 'stop' : 'play'} size={12} />
              {managerBusy ? 'Đang xử lý...' : managerStatus.running ? 'Tắt server' : 'Bật server'}
            </button>
            <button className="btn ghost sm" onClick={checkServer}>
              <Icon name="search" size={12} /> Kiểm tra ngay
            </button>
            <button className="btn ghost sm" onClick={() => saveUrl('http://127.0.0.1:8787')}>
              <Icon name="refresh" size={12} /> Reset URL
            </button>
          </div>
        )}>
        <div className="server-check-stack">
          <div className={'server-check-banner tone-' + managerToneClass}>
            <div className="server-check-banner-head">
              <span className={'status-pill ' + (managerStatus.running ? 'running' : managerStatus.stopping ? 'paused' : managerStatus.available ? 'idle' : 'danger')}>
                <span className="dot" />{managerTitle}
              </span>
              <span className="server-check-meta">{managerStatus.url || normalizeServerBaseInput(serverUrl)}</span>
            </div>
            <div className="server-check-message">{managerMessage}</div>
          </div>

          <div className={'server-check-banner tone-' + toneClass}>
            <div className="server-check-banner-head">
              <span className={'status-pill ' + (status.state === 'online' ? 'running' : status.state === 'checking' ? 'paused' : status.state === 'reachable' ? 'paused' : 'idle')}>
                <span className="dot" />{status.title}
              </span>
              <span className="server-check-meta">{status.activeUrl || normalizeServerBaseInput(serverUrl)}</span>
            </div>
            <div className="server-check-message">{status.message}</div>
          </div>

          <div className="server-check-toolbar">
            <label className="server-check-field">
              <span>Server base URL</span>
              <input
                className="input"
                value={serverUrl}
                placeholder="http://127.0.0.1:8787"
                onChange={(event) => saveUrl(event.target.value)}
              />
            </label>
            <label className="server-check-auto">
              <input
                type="checkbox"
                checked={autoCheck}
                onChange={(event) => setAutoCheck(event.target.checked)}
              />
              <span>Tự kiểm tra mỗi 15 giây</span>
            </label>
          </div>

          <div className="server-check-mini-grid">
            <div>
              <span>Server local</span>
              <strong>{managerStatus.running ? 'Đang bật' : managerStatus.stopping ? 'Đang dừng' : 'Đang tắt'}</strong>
            </div>
            <div>
              <span>PID</span>
              <strong>{managerStatus.pid || '—'}</strong>
            </div>
            <div>
              <span>Port</span>
              <strong>{managerStatus.port || resolveServerPort(serverUrl)}</strong>
            </div>
            <div>
              <span>Uptime</span>
              <strong>{uptimeLabel}</strong>
            </div>
            <div>
              <span>Health check</span>
              <strong>{status.title}</strong>
            </div>
            <div>
              <span>Kiểm tra lúc</span>
              <strong>{checkedAtLabel}</strong>
            </div>
            <div>
              <span>Latency</span>
              <strong>{status.latencyMs != null ? `${status.latencyMs} ms` : '—'}</strong>
            </div>
            <div>
              <span>HTTP</span>
              <strong>{status.httpStatus != null ? status.httpStatus : '—'}</strong>
            </div>
          </div>
        </div>
      </DashboardPanel>

      <div className="server-check-grid">
        <DashboardPanel
          title="Các endpoint sẽ thử"
          meta="Base URL được mở rộng ra một số path health phổ biến để phát hiện server sớm hơn.">
          <div className="server-check-list">
            {candidateUrls.map((url) => {
              const match = (status.details || []).find((item) => item.url === url);
              return (
                <div key={url} className={'server-check-list-item' + (match?.ok ? ' is-ok' : '')}>
                  <div className="server-check-list-url">{url}</div>
                  <div className="server-check-list-note">{match?.note || 'Chưa thử ở lượt kiểm tra gần nhất'}</div>
                </div>
              );
            })}
          </div>
        </DashboardPanel>

        <DashboardPanel
          title="Kết luận nhanh"
          meta="Phân biệt rõ server chưa chạy, server có chạy nhưng sai contract, hoặc server chạy nhưng bị chặn CORS.">
          <div className="server-check-result-grid">
            <div className={'server-check-result tone-' + (status.state === 'online' ? 'ok' : 'accent')}>
              <div className="server-check-result-title">1. Server process</div>
              <div className="server-check-result-body">
                {status.state === 'online' || status.state === 'reachable'
                  ? 'Có dấu hiệu process đang mở cổng và trả phản hồi.'
                  : status.state === 'checking'
                    ? 'Đang xác minh process.'
                    : 'Chưa thấy process lắng nghe ở URL đã cấu hình.'}
              </div>
            </div>
            <div className={'server-check-result tone-' + (status.state === 'online' ? 'ok' : status.state === 'reachable' ? 'warn' : 'danger')}>
              <div className="server-check-result-title">2. Health contract</div>
              <div className="server-check-result-body">
                {status.state === 'online'
                  ? 'Endpoint health đã trả 2xx, có thể nối vào web app.'
                  : status.state === 'reachable'
                    ? 'Server có phản hồi nhưng contract health/CORS chưa hoàn chỉnh.'
                    : 'Chưa có endpoint health phản hồi đúng.'}
              </div>
            </div>
            <div className="server-check-result tone-info">
              <div className="server-check-result-title">3. Chrome crawler ready</div>
              <div className="server-check-result-body">
                Khi server đã bật, backend này sẽ là nơi attach Chrome, start/stop bot và stream log thật cho web app.
              </div>
            </div>
          </div>
        </DashboardPanel>
      </div>

      <div className="server-check-grid">
        <DashboardPanel
          title="Response snapshot"
          meta="Nếu backend có trả JSON từ endpoint health, snapshot sẽ hiện ở đây để đối chiếu version, mode hoặc worker status.">
          <pre className="server-check-code">
{status.data != null ? JSON.stringify(status.data, null, 2) : '{\n  \"status\": \"no-response-yet\"\n}'}
          </pre>
        </DashboardPanel>

        <DashboardPanel
          title="Log điều phối local"
          meta="Nhật ký start/stop server do local controller của web app ghi lại.">
          <pre className="server-check-code">
{managerStatus.logs?.length
  ? managerStatus.logs.map((entry) => `[${entry.ts}] ${String(entry.source || 'manager').toUpperCase()} ${entry.line}`).join('\n')
  : 'Chưa có log điều phối local.'}
          </pre>
        </DashboardPanel>
      </div>
    </div>
  );
}

function WorkerManagerView({ backendConnected, backendConfigUi, workers, onRefreshWorkers }) {
  const appDialog = useAppDialog();
  const toast = window.appToast;
  const [busyKey, setBusyKey] = React.useState('');
  const browserChoices = React.useMemo(() => {
    const rows = Array.isArray(backendConfigUi?.browserChoices) ? backendConfigUi.browserChoices : [];
    if (rows.length) return rows;
    return [
      { type: 'chrome', label: 'Google Chrome' },
      { type: 'firefox', label: 'Firefox' },
      { type: 'edge', label: 'Microsoft Edge' },
      { type: 'brave', label: 'Brave' },
    ];
  }, [backendConfigUi]);

  const runWorkerAction = React.useCallback((key, action) => {
    setBusyKey(key);
    return action()
      .catch((error) => {
        toast?.error({ title: 'Không thực hiện được', message: String(error?.message || error) });
      })
      .finally(() => {
        setBusyKey('');
        onRefreshWorkers?.();
      });
  }, [onRefreshWorkers, toast]);

  const updateWorker = React.useCallback((worker, edits, successMessage = '') => {
    if (!window.backendApi?.updateWorker) return Promise.resolve();
    return runWorkerAction(`update-${worker.id}`, async () => {
      const res = await window.backendApi.updateWorker({ id: worker.id, ...edits });
      if (!res?.ok) throw new Error(res?.error || 'Không cập nhật được worker.');
      if (successMessage) toast?.success({ title: 'Đã cập nhật', message: successMessage });
    });
  }, [runWorkerAction, toast]);

  const triggerWorker = React.useCallback((worker, method, successMessage, pendingMessage) => {
    const api = window.backendApi;
    if (!api?.[method]) return;
    runWorkerAction(`${method}-${worker.id}`, async () => {
      if (pendingMessage) toast?.info({ title: 'Đã gửi lệnh', message: pendingMessage });
      const res = await api[method]({ id: worker.id });
      if (!res?.ok) throw new Error(res?.error || 'Worker action failed.');
      if (successMessage) toast?.success({ title: 'Thao tác thành công', message: successMessage });
    });
  }, [runWorkerAction, toast]);

  const createWorker = React.useCallback(async () => {
    if (!backendConnected || !window.backendApi?.createWorker) {
      toast?.warn({ title: 'Backend chưa sẵn sàng', message: 'Cần backend để tạo worker mới.' });
      return;
    }
    const name = await appDialog.prompt({
      title: 'Tạo worker mới',
      message: 'Nhập tên để phân biệt browser slot hoặc tài khoản Facebook.',
      placeholder: 'Ví dụ: FB Account 02',
      confirmText: 'Tạo worker',
      required: true,
    });
    if (!name) return;
    runWorkerAction('create-worker', async () => {
      const res = await window.backendApi.createWorker({
        name,
        browserType: backendConfigUi?.browserType || 'chrome',
        profileMode: backendConfigUi?.useSeparateProfile === false ? 'shared' : 'dedicated',
      });
      if (!res?.ok) throw new Error(res?.error || 'Không tạo được worker.');
      toast?.success({ title: 'Đã tạo worker', message: `Worker ${name} đã sẵn sàng.` });
    });
  }, [appDialog, backendConnected, backendConfigUi, runWorkerAction, toast]);

  const renameWorker = React.useCallback(async (worker) => {
    const name = await appDialog.prompt({
      title: 'Đổi tên worker',
      message: 'Tên này giúp bạn phân biệt browser slot hoặc tài khoản Facebook.',
      defaultValue: worker.name || '',
      placeholder: 'Tên worker',
      confirmText: 'Lưu',
      required: true,
    });
    if (!name) return;
    updateWorker(worker, { name }, `Đã đổi tên thành ${name}.`);
  }, [appDialog, updateWorker]);

  const updateAccountLabel = React.useCallback(async (worker) => {
    const accountLabel = await appDialog.prompt({
      title: 'Ghi chú tài khoản',
      message: 'Ví dụ: FB Mẹ bỉm 01, FB Nội thất A, ...',
      defaultValue: worker.accountLabel || '',
      placeholder: 'Nhãn tài khoản Facebook',
      confirmText: 'Lưu',
    });
    if (accountLabel == null) return;
    updateWorker(worker, { accountLabel }, 'Đã lưu nhãn tài khoản.');
  }, [appDialog, updateWorker]);

  const updatePort = React.useCallback(async (worker) => {
    const value = await appDialog.prompt({
      title: 'Đổi debug port',
      message: 'Mỗi worker cần debug port riêng để không xung đột.',
      defaultValue: String(worker.edgePort || 9222),
      placeholder: '9222',
      confirmText: 'Lưu',
      required: true,
    });
    if (!value) return;
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1000 || port > 65535) {
      toast?.warn({ title: 'Port không hợp lệ', message: 'Vui lòng nhập số từ 1000 đến 65535.' });
      return;
    }
    updateWorker(worker, { edgePort: port }, `Đã đổi port sang ${port}.`);
  }, [appDialog, toast, updateWorker]);

  const deleteWorker = React.useCallback(async (worker) => {
    const confirmed = await appDialog.confirm({
      title: 'Xóa worker',
      message: `Xóa ${worker.name}? Worker này sẽ bị gỡ khỏi danh sách quản lý.`,
      confirmText: 'Xóa',
      danger: true,
    });
    if (!confirmed) return;
    runWorkerAction(`delete-${worker.id}`, async () => {
      const res = await window.backendApi.deleteWorker({ id: worker.id });
      if (!res?.ok) throw new Error(res?.error || 'Không xóa được worker.');
      toast?.success({ title: 'Đã xóa worker', message: worker.name });
    });
  }, [appDialog, runWorkerAction, toast]);

  return (
    <div className="workspace-view route-data" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="command-bar">
        <div className="command-bar-progress">
          <div className="command-bar-label">Browser slot / worker runtime</div>
          <div className="command-bar-meta">
            {workers.length
              ? `${workers.length} worker đang được quản lý. Mỗi worker có browser, profile và port riêng.`
              : 'Chưa có worker nào.'}
          </div>
        </div>
        <div className="command-bar-actions">
          <button className="btn success" disabled={!backendConnected || busyKey === 'create-worker'} onClick={createWorker}>
            <Icon name="plus" size={12} /> Tạo worker
          </button>
          <button className="btn ghost" disabled={!backendConnected} onClick={onRefreshWorkers}>
            <Icon name="refresh" size={12} /> Refresh
          </button>
        </div>
      </section>

      <DashboardPanel
        title="Danh sách worker"
        meta="Mỗi worker là một browser slot độc lập để bạn login một tài khoản Facebook riêng mà không đụng profile/port của worker khác.">
        <div style={{ display: 'grid', gap: 12 }}>
          {!workers.length && (
            <div className="center dim" style={{ padding: 32 }}>Không tìm thấy worker</div>
          )}
          {workers.map((worker, index) => {
            const runtime = worker.runtime || {};
            const botStatus = runtime.botStatus || 'idle';
            const browserConnected = !!runtime.browserConnected;
            const isBusy = !!busyKey && busyKey.includes(worker.id);
            const isLocked = isBusy || !backendConnected;
            return (
              <div
                key={worker.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: 16,
                  background: 'var(--bg-soft)',
                  display: 'grid',
                  gap: 14,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 18 }}>{worker.name}</strong>
                      <Badge kind={index === 0 ? 'accent' : ''}>{index === 0 ? 'Worker mặc định' : worker.id}</Badge>
                      <Badge kind={browserConnected ? 'ok' : 'warn'}>
                        {browserConnected ? 'Browser đã kết nối' : 'Browser chưa kết nối'}
                      </Badge>
                      <Badge kind={botStatus === 'running' ? 'ok' : botStatus === 'paused' ? 'warn' : botStatus === 'error' ? 'danger' : ''}>
                        Bot: {botStatus}
                      </Badge>
                    </div>
                    <div className="dim" style={{ marginTop: 6 }}>
                      {worker.accountLabel || 'Chưa gắn nhãn tài khoản Facebook'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn ghost sm" disabled={isLocked} onClick={() => renameWorker(worker)}>
                      <Icon name="edit" size={12} /> Đổi tên
                    </button>
                    <button className="btn ghost sm" disabled={isLocked} onClick={() => updateAccountLabel(worker)}>
                      <Icon name="users" size={12} /> Nhãn tài khoản
                    </button>
                    {index !== 0 && (
                      <button className="btn danger sm" disabled={isLocked} onClick={() => deleteWorker(worker)}>
                        <Icon name="trash" size={12} /> Xóa
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-4" style={{ gap: 12 }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span className="dim">Browser</span>
                    <select
                      className="select"
                      value={worker.browserType || 'chrome'}
                      disabled={isLocked}
                      onChange={(event) => updateWorker(worker, { browserType: event.target.value }, 'Đã đổi browser cho worker.')}
                    >
                      {browserChoices.map((browser) => (
                        <option key={browser.type} value={browser.type}>{browser.label || browser.type}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span className="dim">Profile mode</span>
                    <select
                      className="select"
                      value={worker.profileMode || 'dedicated'}
                      disabled={isLocked}
                      onChange={(event) => updateWorker(worker, {
                        profileMode: event.target.value,
                        useSeparateProfile: event.target.value === 'dedicated',
                      }, event.target.value === 'dedicated' ? 'Worker sẽ dùng profile riêng.' : 'Worker sẽ dùng profile chia sẻ.')}
                    >
                      <option value="dedicated">Profile riêng</option>
                      <option value="shared">Profile chia sẻ</option>
                    </select>
                  </label>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <span className="dim">Debug port</span>
                    <button className="btn ghost sm" disabled={isLocked} onClick={() => updatePort(worker)}>
                      <Icon name="settings" size={12} /> {worker.edgePort || 9222}
                    </button>
                  </div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <span className="dim">Profile</span>
                    <div className="mono dim" style={{ paddingTop: 8 }}>
                      {worker.profileMode === 'dedicated' ? `workers/${worker.id}` : (worker.browserProfileId || 'Default')}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {!browserConnected ? (
                    <button className="btn success sm" disabled={isLocked} onClick={() => triggerWorker(worker, 'connectWorkerBrowser', `Đã gửi lệnh kết nối browser cho ${worker.name}.`, 'Đang mở hoặc attach browser cho worker.')}>
                      <Icon name="chrome" size={12} /> Kết nối browser
                    </button>
                  ) : (
                    <button className="btn danger sm" disabled={isLocked} onClick={() => triggerWorker(worker, 'closeWorkerBrowser', `Đã ngắt browser của ${worker.name}.`, 'Đang ngắt browser của worker.')}>
                      <Icon name="close" size={12} /> Ngắt browser
                    </button>
                  )}

                  {(botStatus === 'idle' || botStatus === 'done' || botStatus === 'stopped' || botStatus === 'error') && (
                    <button className="btn success sm" disabled={isLocked} onClick={() => triggerWorker(worker, 'startWorkerBot', `Đã bắt đầu worker ${worker.name}.`, 'Đang gửi lệnh start cho worker.')}>
                      <Icon name="play" size={12} /> Start
                    </button>
                  )}
                  {botStatus === 'running' && (
                    <button className="btn warn sm" disabled={isLocked} onClick={() => triggerWorker(worker, 'pauseWorkerBot', `Đã tạm dừng ${worker.name}.`, 'Đang gửi lệnh pause cho worker.')}>
                      <Icon name="pause" size={12} /> Pause
                    </button>
                  )}
                  {botStatus === 'paused' && (
                    <button className="btn success sm" disabled={isLocked} onClick={() => triggerWorker(worker, 'resumeWorkerBot', `Đã tiếp tục ${worker.name}.`, 'Đang gửi lệnh resume cho worker.')}>
                      <Icon name="play" size={12} /> Resume
                    </button>
                  )}
                  {(botStatus === 'running' || botStatus === 'paused' || botStatus === 'stopping') && (
                    <button className="btn danger sm" disabled={isLocked} onClick={() => triggerWorker(worker, 'stopWorkerBot', `Đã gửi lệnh dừng ${worker.name}.`, 'Đang gửi lệnh stop cho worker.')}>
                      <Icon name="stop" size={12} /> Stop
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </DashboardPanel>
    </div>
  );
}

function App() {
  const appData = window.APP_CURRENT || {};
  const [t, setTweakState] = React.useState(() => {
    try {
      const raw = window.localStorage?.getItem(UI_PREFS_STORAGE_KEY);
      if (!raw) return APP_DEFAULTS;
      const parsed = JSON.parse(raw);
      return { ...APP_DEFAULTS, ...(parsed || {}) };
    } catch (_) {
      return APP_DEFAULTS;
    }
  });
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null
      ? keyOrEdits : { [keyOrEdits]: val };
    setTweakState((prev) => ({ ...prev, ...edits }));
  }, []);
  const [route, setRoute] = React.useState('dashboard');
  const [backendConnected, setBackendConnected] = React.useState(false);
  const [backendConfigUi, setBackendConfigUi] = React.useState(null);
  const [workers, setWorkers] = React.useState(() => Array.isArray(appData.workers) ? appData.workers : []);
  const [browserStatus, setBrowserStatus] = React.useState({ connected: false, busy: false, message: '' });
  const [backendLogs, setBackendLogs] = React.useState([]);
  const [statusNote, setStatusNote] = React.useState('');
  const [dataVersion, setDataVersion] = React.useState(0);
  const [groupsVersion, setGroupsVersion] = React.useState(0);
  const [historyVersion, setHistoryVersion] = React.useState(0);
  const [runsVersion, setRunsVersion] = React.useState(0);
  const [botScope, setBotScope] = React.useState(null);
  const [runningGroupUrl, setRunningGroupUrl] = React.useState('');
  const [updateInfo, setUpdateInfo] = React.useState(null);
  const [updateDialogOpen, setUpdateDialogOpen] = React.useState(false);
  const [updateBusy, setUpdateBusy] = React.useState(false);
  const [updateMessage, setUpdateMessage] = React.useState('');
  const [hideUpdateAgain, setHideUpdateAgain] = React.useState(false);
  const [whatsNewInfo, setWhatsNewInfo] = React.useState(null);
  const [whatsNewOpen, setWhatsNewOpen] = React.useState(false);
  const [navSearch, setNavSearch] = React.useState('');
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [progress, setProgress] = React.useState(() => (
    appData.progress || {
      groups: 0,
      totalGroups: 0,
      scanned: 0,
      suitable: 0,
      direct: 0,
      telegram: 0,
      cycleDirect: 0,
      cycleTelegram: 0,
      cycleNewKeyword: 0,
      workflowMode: 'full',
    }
  ));
  const [repostState, setRepostState] = React.useState({
    status: 'idle',
    message: '',
    done: 0,
    total: 0,
    result: {},
  });
  const [systemDark, setSystemDark] = React.useState(() => {
    if (!window.matchMedia) return true;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const searchRef = React.useRef(null);
  const searchInputRef = React.useRef(null);
  const primaryWorkerId = workers[0]?.id || 'default-worker';

  React.useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setSystemDark(e.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener?.(onChange);
    setSystemDark(mq.matches);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener?.(onChange);
    };
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage?.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify({
        theme: t.theme,
        dark: t.dark,
        accent: t.accent,
        density: t.density,
        nav: t.nav,
      }));
    } catch (_) {}
  }, [t]);

  // Import thay thế dữ liệu toàn bộ nên mới cần nạp lại snapshot toàn app.
  // Refresh thông thường phải do từng tab xử lý bằng API và bộ lọc của tab đó.
  const refreshImportedData = React.useCallback(() => {
    if (typeof window.refreshRealData === 'function') {
      const pending = window.refreshRealData();
      if (pending && typeof pending.then === 'function') {
        return pending.then(() => {
          setDataVersion((v) => v + 1);
          return true;
        });
      }
      setDataVersion((v) => v + 1);
      return Promise.resolve(true);
    }
    setBackendLogs((prev) => [...prev, {
      id: 'data-refresh-' + Date.now(),
      ts: new Date(),
      k: 'warn',
      tag: 'DATA',
      msg: 'Chưa có bộ nạp dữ liệu thật để refresh UI.',
    }]);
    return Promise.resolve(false);
  }, []);

  const refreshRevenueData = React.useCallback((filter = {}) => {
    if (typeof window.refreshRevenueData === 'function') {
      return window.refreshRevenueData(filter).then(() => {
        setDataVersion((v) => v + 1);
        return true;
      });
    }
    return Promise.resolve(false);
  }, []);

  const refreshWorkers = React.useCallback(() => {
    const api = window.backendApi;
    if (!api?.connected || typeof api.listWorkers !== 'function') {
      return Promise.resolve([]);
    }
    return api.listWorkers().then((res) => {
      if (res?.ok && Array.isArray(res.data?.workers)) {
        setWorkers(res.data.workers);
        return res.data.workers;
      }
      return [];
    });
  }, []);

  const applyUpdateState = React.useCallback((info, options = {}) => {
    if (!info) return;
    setUpdateInfo((prev) => {
      const sameVersion = prev?.latest_version && prev.latest_version === info.latest_version;
      const next = { ...(prev || {}), ...info };
      if (!sameVersion) next.dismissed = false;
      return next;
    });
    if (info.available && !info.ignored && options.prompt) {
      setHideUpdateAgain(false);
      setUpdateMessage('');
      setUpdateDialogOpen(true);
    }
  }, []);

  const checkUpdates = React.useCallback((force = false, prompt = false) => {
    const api = window.backendApi;
    if (!api?.connected || typeof api.checkForUpdates !== 'function') {
      return Promise.resolve({ ok: false, error: 'Backend bridge chưa sẵn sàng.' });
    }
    return api.checkForUpdates(force).then((res) => {
      if (res?.ok) {
        applyUpdateState(res.data, { prompt: prompt && res.data?.available && !res.data?.ignored });
      } else {
        setUpdateMessage(res?.error || 'Không kiểm tra được cập nhật.');
      }
      return res;
    });
  }, [applyUpdateState]);

  const openReleasePage = React.useCallback((url) => {
    const target = url || updateInfo?.release_url || updateInfo?.releases_url;
    const api = window.backendApi;
    if (api?.connected && typeof api.openReleasePage === 'function') {
      api.openReleasePage(target || '');
    } else if (target) {
      window.open(target, '_blank');
    }
  }, [updateInfo]);

  const dismissUpdateDialog = React.useCallback((doNotShowAgain) => {
    const version = updateInfo?.latest_version;
    setUpdateDialogOpen(false);
    setUpdateMessage('');
    setUpdateInfo((prev) => prev ? {
      ...prev,
      dismissed: true,
      ignored: doNotShowAgain ? true : prev.ignored,
    } : prev);
    if (doNotShowAgain && version && window.backendApi?.connected) {
      window.backendApi.dismissUpdate?.(version, true);
    }
  }, [updateInfo]);

  const installUpdate = React.useCallback(() => {
    if (!updateInfo) return;
    const api = window.backendApi;
    if (updateInfo.dev_mode || !updateInfo.can_install) {
      openReleasePage(updateInfo.release_url);
      setUpdateMessage('Đã mở trang GitHub Release để tải hoặc xem bản cập nhật.');
      return;
    }
    if (!api?.connected || typeof api.installUpdate !== 'function') {
      setUpdateMessage('Backend bridge chưa sẵn sàng nên chưa thể cập nhật.');
      return;
    }
    setUpdateBusy(true);
    const size = formatUpdateSize(updateInfo.asset_size);
    setUpdateMessage(`Đang tải gói cập nhật${size ? ' khoảng ' + size : ''} từ GitHub Release. Sau khi tải xong app sẽ đóng và mở lại, thường mất 30-90 giây.`);
    api.installUpdate(updateInfo).then((res) => {
      setUpdateBusy(false);
      if (!res?.ok) {
        setUpdateMessage(res?.error || 'Không cập nhật được.');
        return;
      }
      setUpdateMessage(res.data?.message || 'Đã chuẩn bị cập nhật.');
    }).catch((err) => {
      setUpdateBusy(false);
      setUpdateMessage('Lỗi cập nhật: ' + String(err));
    });
  }, [updateInfo, openReleasePage]);

  const dismissWhatsNew = React.useCallback(() => {
    setWhatsNewOpen(false);
    window.backendApi?.acknowledgeWhatsNew?.();
  }, []);

  React.useEffect(() => {
    const api = window.backendApi;
    if (!api) return undefined;
    let active = true;

    const hydrateBackendState = () => {
      if (!active) return;
      if (!api?.connected) return;
      api.getState().then((res) => {
        if (!active || !res?.ok) return;
        const botStatus = res.data?.bot?.status;
        if (botStatus) setTweak('status', botStatus);
        setBotScope(res.data?.bot?.scope || null);
        if (res.data?.configUi && typeof res.data.configUi === 'object') {
          if (window.APP_CURRENT) window.APP_CURRENT.configUi = res.data.configUi;
          setBackendConfigUi(res.data.configUi);
          if (Array.isArray(res.data.configUi.tinyRows) && window.APP_CURRENT) {
            window.APP_CURRENT.tinyRows = res.data.configUi.tinyRows;
          }
        }
        if (Array.isArray(res.data?.workers)) setWorkers(res.data.workers);
        if (res.data?.update) applyUpdateState(res.data.update);
        if (res.data?.whatsnew?.show) {
          setWhatsNewInfo(res.data.whatsnew);
          setWhatsNewOpen(true);
        }
      });
      checkUpdates(false, true);
    };

    api.ready.then((ok) => {
      if (!active) return;
      setBackendConnected(!!ok);
      if (!ok) return;
      hydrateBackendState();
    });

    const onBackendReady = (event) => {
      const payload = event.detail || {};
      const connected = !!payload.connected;
      setBackendConnected(connected);
      if (!connected) return;
      hydrateBackendState();
    };

    const onStatus = (event) => {
      const payload = event.detail || {};
      if (payload.workerId) {
        setWorkers((prev) => prev.map((worker) => (
          worker.id === payload.workerId
            ? {
                ...worker,
                runtime: {
                  ...(worker.runtime || {}),
                  botStatus: payload.state || worker.runtime?.botStatus || 'idle',
                },
              }
            : worker
        )));
      }
      const isPrimaryWorkerEvent = !payload.workerId || payload.workerId === primaryWorkerId;
      if (!isPrimaryWorkerEvent) return;
      if (payload.state) setTweak('status', payload.state);
      if (payload.text) setStatusNote(payload.text);
      if (payload.scope !== undefined) setBotScope(payload.scope || null);
      if (payload.state === 'stopped' && payload.scope?.type === 'survey') {
        setProgress((prev) => ({
          ...prev,
          groups: 0,
          totalGroups: 0,
          scanned: 0,
          suitable: 0,
          keywordHits: 0,
          fitRate: 0,
          currentGroupName: '',
          surveyMode: false,
          backlogMode: false,
          backlogCreated: 0,
          backlogNotFound: 0,
          backlogFail: 0,
          backlogMessage: '',
        }));
        setRunningGroupUrl('');
      } else if (payload.state === 'idle') setRunningGroupUrl('');
    };
    const onRuntime = (event) => {
      const r = event.detail || {};
      if (r.workerId) {
        setWorkers((prev) => prev.map((worker) => (
          worker.id === r.workerId
            ? {
                ...worker,
                runtime: {
                  ...(worker.runtime || {}),
                  ...r,
                  botStatus: worker.runtime?.botStatus || 'idle',
                },
              }
            : worker
        )));
      }
      const isPrimaryWorkerEvent = !r.workerId || r.workerId === primaryWorkerId;
      if (!isPrimaryWorkerEvent) return;
      const survey = r.survey || (r.workflow_mode === 'survey' ? r : null);
      const backlog = r.backlog || (r.workflow_mode === 'backlog' ? r : null);
      if (r.current_group_url !== undefined) setRunningGroupUrl(String(r.current_group_url || ''));
      setProgress((prev) => ({
        ...prev,
        groups: backlog ? Number(backlog.done ?? r.backlog_done ?? 0) : Number(r.current_group_index ?? prev.groups ?? 0),
        totalGroups: backlog ? Number(backlog.total ?? r.backlog_total ?? 0) : Number(r.total_groups ?? prev.totalGroups ?? 0),
        scanned: Number(survey?.scanned ?? r.scanned ?? r.current_post ?? 0),
        keywordHits: Number(survey?.keyword_hits ?? r.keyword_hits ?? prev.keywordHits ?? 0),
        fitRate: Number(survey?.fit_rate ?? r.fit_rate ?? prev.fitRate ?? 0),
        currentGroupName: String(survey?.groupName ?? r.current_group_name ?? prev.currentGroupName ?? ''),
        surveyMode: !!survey,
        backlogMode: !!backlog,
        backlogCreated: Number(backlog?.result?.done ?? r.backlog_created ?? prev.backlogCreated ?? 0),
        backlogNotFound: Number(backlog?.result?.not_found ?? r.backlog_not_found ?? prev.backlogNotFound ?? 0),
        backlogFail: Number(backlog?.result?.fail ?? r.backlog_fail ?? prev.backlogFail ?? 0),
        backlogMessage: String(backlog?.message ?? r.backlog_message ?? prev.backlogMessage ?? ''),
        suitable: Number(r.suitable ?? 0),
        direct: Number(r.direct ?? 0),
        telegram: Number(r.telegram ?? 0),
        cycleDirect: Number(r.cycle_direct ?? prev.cycleDirect ?? 0),
        cycleTelegram: Number(r.cycle_telegram ?? prev.cycleTelegram ?? 0),
        cycleNewKeyword: Number(r.cycle_new_warehouse ?? prev.cycleNewKeyword ?? 0),
        workflowMode: r.workflow_mode ?? prev.workflowMode ?? 'full',
      }));
    };
    const onLog = (event) => {
      const entry = event.detail || {};
      const level = String(entry.level || 'info').toLowerCase();
      const kind = classifyLogEntry(entry);
      _logBatch.push({
        id: 'be-' + Date.now() + '-' + Math.random().toString(36).slice(2),
        ts: entry.ts ? new Date(entry.ts) : new Date(),
        k: kind,
        level: level === 'warning' ? 'warn' : level,
        tag: entry.tag || 'BE',
        msg: entry.message || '',
      });
      if (!_logBatchTimer) {
        _logBatchTimer = setTimeout(() => {
          const batch = _logBatch.splice(0);
          _logBatchTimer = null;
          if (batch.length === 0) return;
          setBackendLogs((prev) => {
            const next = [...prev, ...batch];
            return next.length > 800 ? next.slice(-800) : next;
          });
        }, 400);
      }
    };
    const onDataChanged = (event) => {
      const payload = event.detail || {};
      if (payload.type === 'browser') {
        if (payload.workerId) {
          setWorkers((prev) => prev.map((worker) => (
            worker.id === payload.workerId
              ? {
                  ...worker,
                  runtime: {
                    ...(worker.runtime || {}),
                    browserConnected: !!payload.connected,
                    browser: payload.info || worker.runtime?.browser || null,
                  },
                }
              : worker
          )));
        }
        if (payload.workerId && payload.workerId !== primaryWorkerId) return;
        setBrowserStatus({
          connected: !!payload.connected,
          busy: payload.status === 'connecting',
          message: payload.message || '',
        });
      }
      // Các màn hình nghiệp vụ tự xử lý event domain của mình. Không dùng
      // refresh toàn app cho các thay đổi nhỏ vì sẽ đọc lại toàn bộ DB và render lại.
      if (payload.type === 'repost_comments') {
        setRepostState((prev) => ({
          status: payload.status || prev.status || 'idle',
          message: payload.message || prev.message || '',
          done: Number(payload.done ?? prev.done ?? 0),
          total: Number(payload.total ?? prev.total ?? 0),
          result: { ...(prev.result || {}), ...(payload.result || {}) },
        }));
      }
      // Các màn hình nghiệp vụ tự cập nhật từ response/API riêng của mình.
      // Không reload toàn bộ products/orders/clicks/comments chỉ vì một row group,
      // sản phẩm, lịch sử hoặc run vừa thay đổi; refresh toàn app là nguyên nhân
      // làm UI bị chặn khi dữ liệu lớn.
      if (payload.type === 'data' && payload.status === 'imported') {
        if (_refreshDebounceTimer) { clearTimeout(_refreshDebounceTimer); _refreshDebounceTimer = null; }
        refreshImportedData();
      }
      // Sync doanh thu tự patch KPI đang hiển thị bằng snapshot nhỏ ở TabRevenue.
      // Không nạp lại toàn bộ raw orders/clicks tại đây vì có thể làm UI khựng.
      // Group names are learned by the bot while it is running. Reload the
      // group list and collection members without refreshing all business data.
      if (payload.type === 'group_name' || payload.type === 'groups' || payload.type === 'group_collections') {
        setGroupsVersion((v) => v + 1);
      }
      // Run progress/status is needed by both the group run history and the
      // dedicated history tab, but must not refresh unrelated data domains.
      if (payload.type === 'runs') {
        setRunsVersion((v) => v + 1);
      }
      if (payload.type === 'workers') {
        refreshWorkers();
      }
    };
    const onUpdate = (event) => {
      applyUpdateState(event.detail || {});
    };

    window.addEventListener('backend:ready', onBackendReady);
    window.addEventListener('backend:status', onStatus);
    window.addEventListener('backend:runtime', onRuntime);
    window.addEventListener('backend:log', onLog);
    window.addEventListener('backend:data-changed', onDataChanged);
    window.addEventListener('backend:update', onUpdate);

    return () => {
      active = false;
      window.removeEventListener('backend:ready', onBackendReady);
      window.removeEventListener('backend:status', onStatus);
      window.removeEventListener('backend:runtime', onRuntime);
      window.removeEventListener('backend:log', onLog);
      window.removeEventListener('backend:data-changed', onDataChanged);
      window.removeEventListener('backend:update', onUpdate);
      if (_refreshDebounceTimer) { clearTimeout(_refreshDebounceTimer); _refreshDebounceTimer = null; }
      if (_logBatchTimer) { clearTimeout(_logBatchTimer); _logBatchTimer = null; _logBatch = []; }
    };
  }, [setTweak, refreshImportedData, refreshRevenueData, applyUpdateState, checkUpdates, primaryWorkerId, refreshWorkers]);

  // Apply theme/density to document root so CSS vars cascade to body + scrollbars
  const accent = t.accent || '#2d7ff9';
  const themeMode = t.theme || (t.dark ? 'dark' : 'light');
  const isDark = themeMode === 'system' ? systemDark : themeMode === 'dark';
  const themeCls = isDark ? 'theme-dark' : 'theme-light';
  const densityCls = 'density-' + (t.density || 'balanced');
  React.useLayoutEffect(() => {
    document.documentElement.className = themeCls + ' ' + densityCls;
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--accent-soft', hexToRgba(accent, 0.13));
    document.documentElement.style.setProperty('--accent-fg', '#fff');
  }, [themeCls, densityCls, accent]);

  const navCls = t.nav === 'sidebar' ? 'expanded-nav' : 'compact-nav';
  const isNavCompact = t.nav !== 'sidebar';
  const toggleTheme = React.useCallback(() => {
    const nextDark = !isDark;
    setTweak({
      theme: nextDark ? 'dark' : 'light',
      dark: nextDark,
    });
  }, [isDark, setTweak]);
  const toggleNav = React.useCallback(() => {
    setTweak('nav', isNavCompact ? 'sidebar' : 'compact');
  }, [isNavCompact, setTweak]);

  const repostActive = ['running', 'paused', 'stopping'].includes(repostState.status);
  const displayStatus = repostActive ? (repostState.status === 'stopping' ? 'running' : repostState.status) : t.status;
  const statusText = repostActive
    ? ({ running: 'Đang chạy', paused: 'Tạm dừng', stopping: 'Đang dừng' }[repostState.status] || 'Đang chạy')
    : ({ running: 'Đang chạy', paused: 'Tạm dừng', idle: 'Sẵn sàng' }[t.status]);
  const isCollectionRun = t.status !== 'idle' && botScope?.type === 'collection';
  const modeText = repostActive ? 'Đăng lại comment' : t.status === 'idle'
    ? (statusNote || '—')
    : (isCollectionRun
      ? `Cụm: ${botScope?.name || 'Cụm nhóm'}`
      : (statusNote || appData.modeText || 'Chạy đầy đủ • Lặp 15p'));
  const repostResult = repostState.result || {};
  const repostDone = Number(repostState.done || repostResult.processed || 0);
  const repostTotal = Number(repostState.total || 0);
  const repostSuccess = Number(repostResult.success || 0);
  const repostFail = Number(repostResult.fail || 0);
  const progressPct = repostActive
    ? (repostTotal ? Math.min(100, (repostDone / repostTotal) * 100) : 0)
    : (progress.totalGroups ? (progress.groups / progress.totalGroups) * 100 : 0);
  const runActive = ['running', 'paused', 'stopping'].includes(t.status);
  const resolvedStatusText = ({
    running: 'Đang chạy', paused: 'Tạm dừng', stopping: 'Đang dừng',
    done: 'Đã hoàn tất', stopped: 'Đã dừng', error: 'Lỗi', idle: 'Sẵn sàng',
  }[t.status] || statusText || 'Sẵn sàng');
  const resolvedModeText = botScope?.type === 'survey'
    ? `Khảo sát: ${botScope?.name || 'Khảo sát'}`
    : botScope?.type === 'backlog'
      ? 'Xử lý tồn kho'
      : modeText;
  const currentGroupLabel = progress.currentGroupName || runningGroupUrl || '';
  const isBacklogRun = botScope?.type === 'backlog';
  const hasProgressContext = repostActive || progress.surveyMode || progress.backlogMode || runActive;
  const routeMeta = APP_ROUTES[route] || APP_ROUTES.dashboard;
  const routeLayout = routeMeta.layout || 'data';
  const routeSectionMeta = getRouteSectionMeta(route);
  const tab = routeMeta.tab;
  const navItems = React.useMemo(() => Object.values(APP_ROUTES), []);
  const navResults = navSearch.trim()
    ? navItems.filter((item) => normalizeRouteSearchText(item).includes(navSearch.trim().toLowerCase())).slice(0, 7)
    : [];
  const searchExpanded = searchOpen || !!navSearch.trim();

  const clearSearch = React.useCallback(() => {
    setNavSearch('');
    setSearchOpen(true);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus?.();
    });
  }, []);

  React.useEffect(() => {
    if (!searchOpen) return undefined;
    const onPointerDown = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [searchOpen]);

  const openRoute = React.useCallback((nextRoute) => {
    if (APP_ROUTES[nextRoute]) setRoute(nextRoute);
    setNavSearch('');
    setSearchOpen(false);
  }, []);

  const callBackend = (method, fallback, options = {}) => {
    const api = window.backendApi;
    const toast = window.appToast;
    const successMessage = options.successMessage || '';
    const pendingMessage = options.pendingMessage || '';
    const invoke = () => {
      if (pendingMessage) toast?.info({ title: 'Đã gửi lệnh', message: pendingMessage });
      api[method]().then((res) => {
        if (!res?.ok) {
          toast?.error({ title: 'Không thực hiện được', message: res?.error || 'Backend trả về lỗi không xác định.' });
          setBackendLogs((prev) => [...prev, {
            id: 'be-error-' + Date.now(),
            ts: new Date(),
            k: 'error',
            tag: 'BE',
            msg: res?.error || 'Backend trả về lỗi không xác định.',
          }]);
          return;
        }
        if (successMessage) toast?.success({ title: 'Thao tác thành công', message: successMessage });
      });
    };
    if (backendConnected && api && typeof api[method] === 'function') {
      if (method === 'startBot' && typeof window.__flushConfigUiSave === 'function') {
        window.__flushConfigUiSave()
          .then((saveRes) => {
            if (!saveRes?.ok) {
              toast?.error({ title: 'Không lưu được cấu hình', message: saveRes?.error || 'Không thể lưu cấu hình trước khi chạy.' });
              setBackendLogs((prev) => [...prev, {
                id: 'cfg-save-error-' + Date.now(),
                ts: new Date(),
                k: 'error',
                tag: 'CONFIG',
                msg: saveRes?.error || 'Không lưu được cấu hình trước khi chạy.',
              }]);
              return;
            }
            invoke();
          })
          .catch((err) => {
            toast?.error({ title: 'Không lưu được cấu hình', message: String(err?.message || err) });
            setBackendLogs((prev) => [...prev, {
              id: 'cfg-save-error-' + Date.now(),
              ts: new Date(),
              k: 'error',
              tag: 'CONFIG',
              msg: 'Không lưu được cấu hình trước khi chạy: ' + String(err?.message || err),
            }]);
          });
        return;
      }
      invoke();
      return;
    }
    if (!fallback) {
      toast?.warn({
        title: 'Backend chưa sẵn sàng',
        message: 'Hãy chạy backend server rồi mở web app qua local server thay vì mở file HTML trực tiếp.',
      });
      setBackendLogs((prev) => [...prev, {
        id: 'be-missing-' + Date.now(),
        ts: new Date(),
        k: 'warn',
        tag: 'BE',
        msg: 'Backend server chưa sẵn sàng. Hãy chạy web app cùng local server và backend HTTP trước khi thao tác.',
      }]);
      return;
    }
    fallback && fallback();
  };

  return (
    <AppDialogProvider>
      <AppToastProvider>
        <div className="win-host">
          <div className="win">
            <div className={'control-center-shell ' + navCls + ' is-' + displayStatus + ' route-' + routeLayout}>
              <aside className="control-sidebar">
                <div className="brand-block">
                  <img className="brand-logo" src="assets/logo.png" alt="FB Crawler logo" />
                  <div className="brand-copy">
                    <div className="brand-eyebrow">FB Crawler</div>
                    <div className="brand-title">Control Center</div>
                  </div>
                  <button
                    type="button"
                    className="sidebar-collapse-btn"
                    onClick={toggleNav}
                    aria-label={isNavCompact ? 'Mở rộng menu' : 'Thu gọn menu'}
                    title={isNavCompact ? 'Mở rộng menu' : 'Thu gọn menu'}>
                    <Icon name={isNavCompact ? 'chevronRight' : 'chevronLeft'} size={15} />
                  </button>
                </div>

                <nav className="control-nav">
                  {NAV_SECTIONS.map((section) => (
                    <div key={section.title} className="nav-section">
                      <div className="nav-section-title">{section.title}</div>
                      <div className="nav-section-links">
                        {section.items.map((key) => {
                          const item = APP_ROUTES[key];
                          const isActive = route === key;
                          return (
                            <button
                              key={key}
                              className={'nav-link' + (isActive ? ' active' : '')}
                              onClick={() => openRoute(key)}>
                              <span className="nav-link-icon"><Icon name={item.icon} size={15} /></span>
                              <span className="nav-link-label">{item.nav}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </nav>

                <div className="sidebar-footer">
                  <div className="sidebar-runtime">
                    <span>Browser</span>
                    <b className="mono">{backendConfigUi?.browserType || appData.configUi?.browserType || 'edge'}</b>
                  </div>
                  <div className="sidebar-runtime">
                    <span>Cổng</span>
                    <b className="mono">{backendConfigUi?.edgePort || appData.configUi?.edgePort || 9222}</b>
                  </div>
                  <div className="sidebar-runtime">
                    <span>Kết nối</span>
                    <b className={'mono ' + (backendConnected ? 'runtime-ok' : 'runtime-warn')}>
                      {backendConnected ? 'Đã kết nối' : 'Đang chờ'}
                    </b>
                  </div>
                </div>

                <button
                  type="button"
                  className="sidebar-collapse-footer"
                  onClick={toggleNav}>
                  <Icon name={isNavCompact ? 'chevronRight' : 'chevronLeft'} size={14} />
                  <span>{isNavCompact ? 'Mở rộng' : 'Thu gọn'}</span>
                </button>
              </aside>

              <main className={'control-workspace route-' + routeLayout}>
                <header className="workspace-topbar">
                  <div className={'workspace-search' + (searchExpanded ? ' expanded' : '') + (navSearch.trim() ? ' has-value' : '')} ref={searchRef}>
                    <Icon name="search" size={14} />
                    <input
                      ref={searchInputRef}
                      value={navSearch}
                      onFocus={() => setSearchOpen(true)}
                      onChange={(event) => {
                        setNavSearch(event.target.value);
                        setSearchOpen(true);
                      }}
                      placeholder="Tìm màn chức năng, nhóm thao tác, khu dữ liệu..."
                    />
                    <kbd className="workspace-search-shortcut">Ctrl/⌘ K</kbd>
                    {navSearch.trim() && (
                      <button
                        type="button"
                        className="workspace-search-clear"
                        onClick={clearSearch}
                        aria-label="Xóa nội dung tìm kiếm"
                        title="Xóa">
                        <Icon name="close" size={13} />
                      </button>
                    )}
                    {searchOpen && navResults.length > 0 && (
                      <div className="search-results">
                        {navResults.map((item) => (
                          <button key={item.key} className="search-result" onClick={() => openRoute(item.key)}>
                            <Icon name={item.icon} size={13} />
                            <div>
                              <strong>{item.title}</strong>
                              <span>{item.description}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="topbar-stats">
                    <div className="topbar-system">
                      <div className="topbar-system-main">
                        <span className={'status-pill ' + displayStatus}><span className="dot" />{resolvedStatusText}</span>
                        <Badge kind={backendConnected ? 'ok' : 'warn'}>{backendConnected ? 'Backend đang chạy' : 'Backend chờ kết nối'}</Badge>
                        <Badge kind={browserStatus.connected ? 'ok' : browserStatus.busy ? 'warn' : 'info'}>
                          {browserStatus.connected ? 'Chrome đã kết nối' : browserStatus.busy ? 'Đang kết nối browser' : 'Browser chưa kết nối'}
                        </Badge>
                        <span>{resolvedModeText}</span>
                        {currentGroupLabel && <span>{currentGroupLabel}</span>}
                      </div>
                    </div>
                    <button
                      className="topbar-icon-btn"
                      type="button"
                      onClick={toggleNav}
                      title={isNavCompact ? 'Mở rộng menu' : 'Thu gọn menu'}
                      aria-label={isNavCompact ? 'Mở rộng menu' : 'Thu gọn menu'}>
                      <Icon name={isNavCompact ? 'chevronRight' : 'chevronLeft'} size={14} />
                    </button>
                    <button
                      className="topbar-theme-toggle"
                      type="button"
                      onClick={toggleTheme}
                      title={isDark ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
                      aria-label={isDark ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}>
                      <span className={'topbar-theme-toggle-slot' + (!isDark ? ' active' : '')}>
                        <Icon name="sun" size={15} />
                      </span>
                      <span className={'topbar-theme-toggle-slot' + (isDark ? ' active' : '')}>
                        <Icon name="moon" size={15} />
                      </span>
                    </button>
                  </div>
                </header>

                <section className="workspace-header">
                  <div className="workspace-header-copy">
                    <div className="workspace-header-kicker">
                      <span className="workspace-header-index">{routeSectionMeta.ordinal}</span>
                      <span>{routeSectionMeta.title}</span>
                    </div>
                    <h2>{routeMeta.title}</h2>
                    <p>{routeMeta.description}</p>
                  </div>
                  {runningGroupUrl && (
                    <div className="workspace-header-aside">
                      <Badge kind="accent">{runningGroupUrl}</Badge>
                    </div>
                  )}
                </section>

                {tab === 'dashboard' && (
                  <section className="command-bar">
                    <div className="command-bar-progress">
                      <div className="command-bar-label">Tiến trình chạy</div>
                      <div className="command-bar-track">
                        <div className="command-bar-fill" style={{ width: hasProgressContext ? `${progressPct}%` : '0%' }} />
                      </div>
                      <div className="command-bar-meta">
                        {!hasProgressContext ? 'Chưa có tiến trình đang chạy' : repostActive
                          ? `${repostDone}/${repostTotal || 0} bài`
                          : progress.backlogMode
                            ? `${progress.groups}/${progress.totalGroups} keyword`
                            : `${progress.groups}/${progress.totalGroups} nhóm`}
                      </div>
                    </div>

                    <div className="command-bar-actions">
                      <button
                        className={'btn browser-btn ' + (browserStatus.connected ? 'danger connected' : browserStatus.busy ? 'warn connecting' : '')}
                        disabled={browserStatus.busy}
                        onClick={() => callBackend(
                          browserStatus.connected ? 'closeDriver' : 'connectBrowser',
                          null,
                          {
                            pendingMessage: browserStatus.connected ? 'Đang gửi lệnh ngắt browser.' : 'Đang gửi lệnh kết nối browser.',
                            successMessage: browserStatus.connected ? 'Đã gửi lệnh ngắt browser.' : 'Đã gửi lệnh kết nối browser.',
                          }
                        )}>
                        <Icon name="chrome" size={14} />
                        {(browserStatus.busy || browserStatus.connected) && <span className="state-dot" />}
                            {browserStatus.busy ? 'Đang kết nối...' : browserStatus.connected ? 'Ngắt browser' : 'Kết nối browser'}
                      </button>

                      {!repostActive && t.status === 'idle' && (
                        <button className="btn success" onClick={() => callBackend('startBot', null, {
                          pendingMessage: 'Đang lưu cấu hình và gửi lệnh bắt đầu crawler.',
                          successMessage: 'Crawler đã nhận lệnh bắt đầu.',
                        })}>
                          <Icon name="play" size={12} /> Bắt đầu
                        </button>
                      )}
                      {repostActive && repostState.status === 'running' && (
                        <button className="btn warn" onClick={() => callBackend('pauseRepostComments', null, {
                          pendingMessage: 'Đang tạm dừng luồng repost comment.',
                          successMessage: 'Luồng repost đã nhận lệnh tạm dừng.',
                        })}>
                          <Icon name="pause" size={12} /> Pause
                        </button>
                      )}
                      {repostActive && repostState.status === 'paused' && (
                        <button className="btn success" onClick={() => callBackend('resumeRepostComments', null, {
                          pendingMessage: 'Đang tiếp tục luồng repost comment.',
                          successMessage: 'Luồng repost đã nhận lệnh tiếp tục.',
                        })}>
                          <Icon name="play" size={12} /> Resume
                        </button>
                      )}
                      {repostActive && (
                        <button className="btn danger" disabled={repostState.status === 'stopping'} onClick={() => callBackend('stopRepostComments', null, {
                          pendingMessage: 'Đang dừng luồng repost comment.',
                          successMessage: 'Luồng repost đã nhận lệnh dừng.',
                        })}>
                          <Icon name="stop" size={12} /> Stop
                        </button>
                      )}
                      {!repostActive && t.status === 'running' && (
                        <button className="btn warn" onClick={() => callBackend(isBacklogRun ? 'pauseBacklog' : 'pauseBot', null, {
                          pendingMessage: 'Đang gửi lệnh tạm dừng crawler.',
                          successMessage: 'Crawler đã nhận lệnh tạm dừng.',
                        })}>
                          <Icon name="pause" size={12} /> Pause
                        </button>
                      )}
                      {!repostActive && t.status === 'paused' && (
                        <button className="btn success" onClick={() => callBackend(isBacklogRun ? 'resumeBacklog' : 'resumeBot', null, {
                          pendingMessage: 'Đang gửi lệnh tiếp tục crawler.',
                          successMessage: 'Crawler đã nhận lệnh tiếp tục.',
                        })}>
                          <Icon name="play" size={12} /> Resume
                        </button>
                      )}
                      {!repostActive && runActive && (
                        <button className="btn danger" onClick={() => callBackend(isBacklogRun ? 'stopBacklog' : 'stopBot', null, {
                          pendingMessage: 'Đang gửi lệnh dừng crawler.',
                          successMessage: 'Crawler đã nhận lệnh dừng.',
                        })}>
                          <Icon name="stop" size={12} /> Stop
                        </button>
                      )}
                    </div>
                  </section>
                )}

                <div className={'workspace-stage route-' + routeLayout}>
                  {tab === 'dashboard' && (
                    <div className="workspace-view dashboard-view route-dashboard">
                      <DashboardHome
                        appData={appData}
                        progress={progress}
                        backendLogs={backendLogs}
                        browserStatus={browserStatus}
                        backendConnected={backendConnected}
                        displayStatus={displayStatus}
                        resolvedStatusText={resolvedStatusText}
                        resolvedModeText={resolvedModeText}
                        progressPct={progressPct}
                        hasProgressContext={hasProgressContext}
                        runningGroupUrl={runningGroupUrl}
                        onOpenRoute={openRoute}
                      />
                    </div>
                  )}
                  {tab === 'log' && (
                    <div className="workspace-view route-monitor">
                      <TabLog
                        status={t.status}
                        externalLogs={backendLogs}
                        dataVersion={dataVersion}
                        updateInfo={updateInfo}
                        onShowUpdate={() => setUpdateDialogOpen(true)}
                      />
                    </div>
                  )}
                  {tab === 'config' && (
                    <div className="workspace-view route-form">
                      <TabConfig
                        configUi={backendConfigUi}
                        tweaks={t}
                        setTweak={setTweak}
                        accentOptions={ACCENT_OPTIONS}
                        forcedSub={routeMeta.sub}
                        dataVersion={dataVersion}
                        updateInfo={updateInfo}
                        updateBusy={updateBusy}
                        updateMessage={updateMessage}
                        onInstallUpdate={installUpdate}
                        onCheckUpdates={() => checkUpdates(true, true)}
                        onOpenRelease={openReleasePage}
                      />
                    </div>
                  )}
                  {tab === 'workers' && (
                    <WorkerManagerView
                      backendConnected={backendConnected}
                      backendConfigUi={backendConfigUi}
                      workers={workers}
                      onRefreshWorkers={refreshWorkers}
                    />
                  )}
                  <div className="workspace-view route-data" style={{ display: tab === 'groups' ? 'flex' : 'none' }}>
                    <TabGroups
                      active={tab === 'groups'}
                      forcedSub={routeMeta.sub}
                      dataVersion={groupsVersion}
                      botStatus={t.status}
                      botScope={botScope}
                      runningGroupUrl={runningGroupUrl}
                    />
                  </div>
                  <div className="workspace-view route-data" style={{ display: tab === 'history' ? 'flex' : 'none' }}>
                    <TabHistory
                      active={tab === 'history'}
                      forcedSub={routeMeta.sub}
                      dataVersion={historyVersion}
                      runsVersion={runsVersion}
                    />
                  </div>
                  {tab === 'revenue' && (
                    <div className="workspace-view route-data">
                      <TabRevenue forcedSub={routeMeta.sub} dataVersion={dataVersion} onRefreshData={refreshRevenueData} />
                    </div>
                  )}
                  {tab === 'products' && (
                    <div className="workspace-view route-data">
                      <TabProducts forcedSub={routeMeta.sub} dataVersion={dataVersion} />
                    </div>
                  )}
                </div>
              </main>
            </div>

            {whatsNewOpen && whatsNewInfo?.show && (
              <WhatsNewDialog
                info={whatsNewInfo}
                onClose={dismissWhatsNew}
                onOpenRelease={openReleasePage}
              />
            )}

            {updateDialogOpen && updateInfo?.available && !updateInfo?.ignored && (
              <UpdateDialog
                info={updateInfo}
                busy={updateBusy}
                message={updateMessage}
                hideAgain={hideUpdateAgain}
                setHideAgain={setHideUpdateAgain}
                onDismiss={dismissUpdateDialog}
                onInstall={installUpdate}
                onOpenRelease={openReleasePage}
              />
            )}
          </div>
        </div>
      </AppToastProvider>
    </AppDialogProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

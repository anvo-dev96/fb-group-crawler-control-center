/* tab-log.jsx — real-time log stream */

function TabLog({ status, externalLogs, updateInfo, onShowUpdate }) {
  // Build initial log entries with real timestamps
  const initial = React.useMemo(() => {
    const now = Date.now();
    return INITIAL_LOGS.map((l, i) => ({
      ...l,
      id: 'init-' + i,
      ts: new Date(now + l.t * 1000),
    }));
  }, []);

  const [logs, setLogs] = React.useState(initial);
  const [paused, setPaused] = React.useState(false);
  const [filter, setFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const streamRef = React.useRef(null);
  const wasAtBottom = React.useRef(true);
  const hasExternalLogs = Array.isArray(externalLogs) && externalLogs.length > 0;
  const hasUpdate = !!(updateInfo?.available && !updateInfo?.ignored);

  React.useEffect(() => {
    if (hasExternalLogs && !paused) setLogs(externalLogs);
  }, [hasExternalLogs, externalLogs, paused]);

  // Auto-scroll to bottom
  React.useLayoutEffect(() => {
    const el = streamRef.current;
    if (!el || !wasAtBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [logs]);

  const onScroll = () => {
    const el = streamRef.current;
    if (!el) return;
    wasAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  const groupOf = (kind) => {
    const normalized = kind === 'keyword' ? 'product' : kind === 'buy' ? 'shopee' : kind;
    if (['error', 'warn'].includes(normalized)) return 'problems';
    if (['success'].includes(normalized)) return 'success';
    if (['browser', 'facebook'].includes(normalized)) return 'browser_fb';
    if (['ai'].includes(normalized)) return 'ai';
    if (['shopee', 'cache', 'tinyurl', 'tiny.cc', 'stats'].includes(normalized)) return 'commerce';
    if (['telegram', 'comment'].includes(normalized)) return 'delivery';
    if (['product', 'skip'].includes(normalized)) return 'product_skip';
    if (['summary', 'system'].includes(normalized)) return 'system';
    return 'system';
  };

  const filtered = React.useMemo(() => {
    return logs.filter((l) => {
      const kind = l.k === 'keyword' ? 'product' : l.k === 'buy' ? 'shopee' : l.k;
      if (filter !== 'all' && groupOf(kind) !== filter) return false;
      if (search && !l.msg.toLowerCase().includes(search.toLowerCase()) && !l.tag.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [logs, filter, search]);

  // Counts per kind
  const counts = React.useMemo(() => {
    const c = {
      problems: 0, success: 0, browser_fb: 0, ai: 0,
      commerce: 0, delivery: 0, product_skip: 0, system: 0,
    };
    logs.forEach((l) => {
      const kind = l.k === 'keyword' ? 'product' : l.k === 'buy' ? 'shopee' : l.k;
      const group = groupOf(kind);
      if (c[group] != null) c[group] += 1;
    });
    return c;
  }, [logs]);

  const FILTERS = [
    { v: 'all', l: 'Tất cả', n: logs.length },
    { v: 'problems', l: 'Lỗi/Cảnh báo', n: counts.problems, kind: 'danger' },
    { v: 'success', l: 'Thành công', n: counts.success, kind: 'ok' },
    { v: 'browser_fb', l: 'Browser/FB', n: counts.browser_fb },
    { v: 'ai', l: 'AI', n: counts.ai },
    { v: 'commerce', l: 'Shopee/Link/Sync', n: counts.commerce },
    { v: 'delivery', l: 'Comment/Telegram', n: counts.delivery },
    { v: 'product_skip', l: 'Sản phẩm/Bỏ qua', n: counts.product_skip },
    { v: 'system', l: 'Hệ thống', n: counts.system },
  ];

  return (
    <div className="tab-body">
      <div className="log-toolbar">
        <div className="row" style={{ gap: 4 }}>
          {FILTERS.map((f) => (
            <button key={f.v}
                    className={'btn sm ' + (filter === f.v ? 'primary' : 'ghost')}
                    onClick={() => setFilter(f.v)}>
              {f.l}
              {f.n > 0 && <span style={{
                marginLeft: 6, opacity: 0.7,
                fontVariantNumeric: 'tabular-nums',
              }}>{f.n}</span>}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <SearchInput value={search} onChange={setSearch}
                     placeholder="Tìm trong log…" style={{ width: 200 }} />
        <div className="divider" style={{ alignSelf: 'stretch' }} />
        <button className={'btn sm ' + (paused ? 'warn' : 'ghost')}
                onClick={() => setPaused(!paused)}>
          <Icon name={paused ? 'play' : 'pause'} size={12} />
          {paused ? 'Tiếp tục' : 'Tạm dừng'}
        </button>
        <button className="btn sm ghost" onClick={() => setLogs([])}>
          <Icon name="trash" size={12} />
          Xóa
        </button>
      </div>

      <div className="log-stream" ref={streamRef} onScroll={onScroll}>
        {filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--fg-faint)' }}>
            {logs.length === 0 ? 'Chưa có log nào. Bấm Bắt đầu để chạy bot.' : 'Không tìm thấy log phù hợp.'}
          </div>
        ) : filtered.map((l) => (
          <div key={l.id} className={'log-line ' + l.k}>
            <span className="ts">{fmt.time(l.ts)}</span>
            <span className="tag">[{l.tag}]</span>
            <span className="msg">{l.msg}</span>
          </div>
        ))}
      </div>

      <div className="log-footer">
        <span>Hiển thị <b style={{ color: 'var(--fg)' }}>{filtered.length}</b> / {logs.length} dòng</span>
        <span>•</span>
        <span style={{ color: 'var(--ok)' }}>✓ {counts.success}</span>
        <span style={{ color: 'var(--info)' }}>💬 {counts.delivery}</span>
        <span style={{ color: 'var(--accent)' }}>AI {counts.ai}</span>
        <span style={{ color: 'var(--info)' }}>FB {counts.browser_fb}</span>
        <span style={{ color: 'var(--danger)' }}>⚠ {counts.problems}</span>
        <span className="spacer" />
        {hasUpdate && (
          <button className="btn sm warn" onClick={onShowUpdate} data-tooltip="Xem thông tin cập nhật" aria-label="Xem thông tin cập nhật">
            <Icon name="download" size={12} />
            Có bản v{updateInfo.latest_version} mới
          </button>
        )}
        {status === 'running' && !paused && (
          <span style={{ color: 'var(--ok)' }}>
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
              background: 'currentColor', marginRight: 6, verticalAlign: 'middle',
              boxShadow: '0 0 0 3px color-mix(in oklab, currentColor 25%, transparent)' }} />
            Bot đang chạy
          </span>
        )}
        {paused && <span style={{ color: 'var(--warn)' }}>● Log đang tạm dừng</span>}
      </div>
    </div>
  );
}

window.TabLog = TabLog;

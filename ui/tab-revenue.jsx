/* tab-revenue.jsx — revenue dashboard with Chart.js */

// ── Chart hooks ─────────────────────────────────────────────────────────────
function useChart(setupFn, deps) {
  const ref = React.useRef(null);
  const chartRef = React.useRef(null);
  React.useEffect(() => {
    if (!ref.current || typeof Chart === 'undefined') return;
    if (chartRef.current) chartRef.current.destroy();
    const cs = getComputedStyle(document.documentElement);
    const colors = {
      accent: cs.getPropertyValue('--accent').trim() || '#3b82f6',
      ok: cs.getPropertyValue('--ok').trim() || '#10b981',
      warn: cs.getPropertyValue('--warn').trim() || '#f59e0b',
      info: cs.getPropertyValue('--info').trim() || '#6366f1',
      danger: cs.getPropertyValue('--danger').trim() || '#ef4444',
      grid: cs.getPropertyValue('--chart-grid').trim() || 'rgba(0,0,0,.06)',
      axis: cs.getPropertyValue('--chart-axis').trim() || 'rgba(0,0,0,.5)',
      fg: cs.getPropertyValue('--fg').trim() || '#111',
      bg: cs.getPropertyValue('--bg-elev').trim() || '#fff',
    };
    chartRef.current = setupFn(ref.current, colors);
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, deps);
  return ref;
}

function dateInputValue(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysAgoValue(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return dateInputValue(d);
}

function revenueFetchRange(range) {
  const from = new Date((range?.from || '') + 'T00:00:00');
  const to = new Date((range?.to || '') + 'T00:00:00');
  if (isNaN(from) || isNaN(to) || to < from) return range || {};
  const days = Math.max(1, Math.round((to - from) / 86400000) + 1);
  const previousFrom = new Date(from.getTime() - days * 86400000);
  return { from: dateInputValue(previousFrom), to: range.to };
}

function dailyClickBreakdown(day) {
  const seedingComment = Number(day?.clicksSeedingComment ?? day?.clicks_seeding_comment ?? 0) || 0;
  const explicitOther = day?.clicksOther ?? day?.clicks_other;
  const total = Number(day?.clicks ?? (seedingComment + Number(explicitOther || 0))) || 0;
  const other = explicitOther == null ? total - seedingComment : Number(explicitOther || 0);
  return {
    seedingComment: Math.max(0, seedingComment),
    other: Math.max(0, other),
  };
}

// Giữ subtab đang xem khi đổi tab (component bị unmount/remount).
const _revenueState = { sub: 'overview' };

// ── Tab root ────────────────────────────────────────────────────────────────
function TabRevenue({ dataVersion = 0, onRefreshData, forcedSub = '' }) {
  const [sub, _setSub] = React.useState(_revenueState.sub);
  const setSub = React.useCallback((v) => { _revenueState.sub = v; _setSub(v); }, []);
  const today = dateInputValue(new Date());
  const yesterday = daysAgoValue(1);
  const [from, setFrom] = React.useState(yesterday);
  const [to, setTo] = React.useState(yesterday);
  const [quick, setQuick] = React.useState('yesterday');
  const range = React.useMemo(() => ({ from, to }), [from, to]);
  const fetchRange = React.useMemo(() => revenueFetchRange(range), [range]);
  const fetchRangeKey = `${fetchRange.from || ''}:${fetchRange.to || ''}`;
  const [syncState, setSyncState] = React.useState({
    status: 'idle',
    mode: '',
    message: 'Sẵn sàng đồng bộ.',
    lastDone: null,
  });
  const [overviewSnapshot, setOverviewSnapshot] = React.useState(null);
  const [loadedFetchRangeKey, setLoadedFetchRangeKey] = React.useState('');
  const [refreshing, setRefreshing] = React.useState(false);
  const [refreshError, setRefreshError] = React.useState('');
  const syncing = syncState.status === 'running';
  const isRangeLoading = refreshing || (!refreshError && loadedFetchRangeKey !== fetchRangeKey);

  React.useEffect(() => {
    if (forcedSub && forcedSub !== sub) setSub(forcedSub);
  }, [forcedSub, sub, setSub]);

  // Mở tab hoặc đổi bộ lọc đều nạp lại kỳ hiện tại + kỳ so sánh tương ứng.
  // Không render snapshot của bộ lọc trước trong lúc response mới chưa về.
  const refreshCurrentRange = React.useCallback(() => {
    setRefreshing(true);
    setRefreshError('');
    return Promise.resolve(onRefreshData?.(fetchRange))
      .then(() => setLoadedFetchRangeKey(fetchRangeKey))
      .catch(() => setRefreshError('Không thể tải dữ liệu doanh thu. Vui lòng thử lại.'))
      .finally(() => setRefreshing(false));
  }, [fetchRange, fetchRangeKey, onRefreshData]);

  React.useEffect(() => {
    let active = true;
    setRefreshing(true);
    setRefreshError('');
    Promise.resolve(onRefreshData?.(fetchRange))
      .then(() => { if (active) setLoadedFetchRangeKey(fetchRangeKey); })
      .catch(() => { if (active) setRefreshError('Không thể tải dữ liệu doanh thu. Vui lòng thử lại.'); })
      .finally(() => { if (active) setRefreshing(false); });
    return () => { active = false; };
  }, [fetchRange, fetchRangeKey, onRefreshData]);

  React.useEffect(() => {
    const onDataChanged = (event) => {
      const payload = event.detail || {};
      if (payload.type !== 'sync') return;
      setSyncState((prev) => ({
        status: payload.status || 'idle',
        mode: payload.mode || '',
        message: payload.message || '',
        lastDone: payload.status === 'done' ? new Date() : prev.lastDone,
      }));
      // Chỉ nạp snapshot KPI của khoảng ngày đang xem. Không đọc/parse toàn bộ
      // click để cập nhật một card sau sync.
      if (payload.status === 'done') {
        const api = window.backendApi;
        if (typeof api?.getRevenueSnapshot !== 'function') return;
        api.getRevenueSnapshot({ dateFrom: from, dateTo: to }).then((res) => {
          if (!res?.ok) return;
          setOverviewSnapshot({
            rangeKey: `${from}:${to}`,
            clicks: Number(res.data?.clicks || 0),
          });
        }).catch(() => {});
      }
    };
    window.addEventListener('backend:data-changed', onDataChanged);
    return () => window.removeEventListener('backend:data-changed', onDataChanged);
  }, [from, to]);

  const startSync = (mode) => {
    const api = window.backendApi;
    if (!api?.connected) {
      setSyncState({
        status: 'error',
        mode,
        message: 'Backend HTTP server chưa sẵn sàng. Hãy chạy server rồi mở web app qua local server.',
        lastDone: syncState.lastDone,
      });
      return;
    }
    setSyncState({
      status: 'running',
      mode,
      message: mode === 'orders' ? 'Đang sync đơn...' : mode === 'clicks' ? 'Đang sync click...' : 'Đang sync đơn và click...',
      lastDone: syncState.lastDone,
    });
    // Tính days dựa vào date filter đang chọn — đảm bảo sync đủ khoảng thời gian
    const syncDays = from
      ? Math.max(30, Math.ceil((Date.now() - new Date(from + 'T00:00:00').getTime()) / 86400000) + 1)
      : 30;
    const req = mode === 'orders' ? api.syncOrders(syncDays)
      : mode === 'clicks' ? api.syncClicks(syncDays, 50000)
      : api.syncStats({ days: syncDays, maxClicks: 50000 });
    req.then((res) => {
      if (!res?.ok) {
        setSyncState({
          status: 'error',
          mode,
          message: res?.error || 'Backend trả về lỗi không xác định.',
          lastDone: syncState.lastDone,
        });
      }
    });
  };

  const setQuickAndDates = (v) => {
    setQuick(v);
    if (v === 'yesterday') {
      const y = daysAgoValue(1);
      setFrom(y); setTo(y);
    } else if (v === '7days') {
      setFrom(daysAgoValue(6));
      setTo(today);
    } else if (v === '30days') {
      setFrom(daysAgoValue(29));
      setTo(today);
    }
  };

  return (
    <div className="tab-body">
      <Subtabs
        tabs={[
          { value: 'overview', label: 'Tổng quan' },
          { value: 'gmv', label: 'Phân tích' },
          { value: 'shops', label: 'Sản phẩm & Shop' },
          { value: 'subid', label: 'SubID' },
          { value: 'orders', label: 'Chi tiết đơn' },
          { value: 'clicks', label: 'Tổng quan Click' },
          { value: 'prodhot', label: 'Sản phẩm' },
        ]}
        value={sub} onChange={setSub} />

      {/* Shared toolbar */}
      <div style={{
        flex: 'none', padding: '8px 16px',
        background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <QuickFilter value={quick} onChange={setQuickAndDates} options={[
          { value: 'yesterday', label: 'Hôm qua' },
          { value: '7days', label: '7 ngày' },
          { value: '30days', label: '30 ngày' },
        ]} />
        <div className="divider" style={{ alignSelf: 'stretch' }} />
        <DateInput value={from} onChange={(v) => { setFrom(v); setQuick(''); }} label="Từ" />
        <DateInput value={to} onChange={(v) => { setTo(v); setQuick(''); }} label="Đến" />
        <button className="btn sm" disabled={refreshing} onClick={refreshCurrentRange}><Icon name="refresh" size={12}/> Refresh</button>
        <div className="spacer" />
        <button className="btn sm" disabled={syncing} onClick={() => startSync('stats')}><Icon name="download" size={12}/> Sync</button>
        <button className="btn sm" onClick={() => window.backendApi?.exportOrders?.({ format: 'csv' })}><Icon name="download" size={12}/> Export CSV</button>
      </div>
      <SyncStatus state={syncState} />

      <div className="tab-content">
        {refreshError ? (
          <div className="collection-empty large">{refreshError}</div>
        ) : <>
          {sub === 'overview' && <RevenueOverview dataVersion={dataVersion} range={range} quick={quick} liveSnapshot={overviewSnapshot} loading={isRangeLoading} />}
          {sub !== 'overview' && isRangeLoading && <RevenueCardsSkeleton />}
          {sub === 'gmv' && !isRangeLoading && <RevenueAnalysis dataVersion={dataVersion} range={range} />}
          {sub === 'shops' && !isRangeLoading && <RevenueShops dataVersion={dataVersion} range={range} />}
          {sub === 'subid' && !isRangeLoading && <RevenueSubId dataVersion={dataVersion} range={range} />}
          {sub === 'orders' && !isRangeLoading && <RevenueOrders dataVersion={dataVersion} range={range} />}
          {sub === 'clicks' && !isRangeLoading && <RevenueClicks dataVersion={dataVersion} range={range} />}
          {sub === 'prodhot' && !isRangeLoading && <RevenueProdHot dataVersion={dataVersion} range={range} />}
        </>}
      </div>
    </div>
  );
}

function SyncStatus({ state }) {
  const status = state?.status || 'idle';
  const running = status === 'running';
  const failed = status === 'error';
  const done = status === 'done';
  const [pct, setPct] = React.useState(0);
  React.useEffect(() => {
    if (!running) {
      setPct(done ? 100 : 0);
      return undefined;
    }
    const id = setInterval(() => {
      setPct((p) => (p + 1.3) % 100);
    }, 90);
    return () => clearInterval(id);
  }, [running, done]);

  const modeText = state?.mode === 'orders' ? 'Đơn' : state?.mode === 'clicks' ? 'Click' : state?.mode === 'stats' ? 'Đơn & Click' : 'Dữ liệu';
  const color = failed ? 'var(--danger)' : done ? 'var(--ok)' : 'var(--fg-muted)';
  return (
    <div style={{
      flex: 'none', padding: '6px 16px', display: 'flex', gap: 10, alignItems: 'center',
      background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)',
      fontSize: 'var(--font-xs)', color,
    }}>
      <div className="ov-progress-bar" style={{ flex: 1, maxWidth: 320, height: 4 }}>
        <div className="ov-progress-fill" style={{ width: pct + '%' }} />
      </div>
      <span>{state?.message || 'Sẵn sàng đồng bộ từ Shopee Affiliate Dashboard.'}</span>
      <span className="spacer" />
      <span>Loại: <b style={{ color: 'var(--fg)' }}>{modeText}</b></span>
      {state?.lastDone && (
        <>
          <span>•</span>
          <span>Xong lúc: <b style={{ color: 'var(--fg)' }}>{fmt.time(state.lastDone)}</b></span>
        </>
      )}
    </div>
  );
}

// =========================================================
// Overview
// =========================================================
function RevenueOverview({ dataVersion = 0, range, quick, liveSnapshot = null, loading = false }) {
  const baseK = React.useMemo(() => (
    typeof buildRevenueKpi === 'function' ? buildRevenueKpi(range) : REVENUE_KPI
  ), [dataVersion, range?.from, range?.to]);
  const rangeKey = `${range?.from || ''}:${range?.to || ''}`;
  const k = React.useMemo(() => {
    if (liveSnapshot?.rangeKey !== rangeKey) return baseK;
    const clicks = liveSnapshot.clicks;
    return {
      ...baseK,
      clicks,
      epc: clicks ? Math.round(baseK.commission / clicks) : 0,
      cvr: clicks ? (baseK.orders / clicks) * 100 : 0,
    };
  }, [baseK, liveSnapshot, rangeKey]);

  // KPI kỳ trước (cùng độ dài, lùi lại) để tính % thay đổi thực tế theo filter
  const kPrev = React.useMemo(() => {
    if (typeof buildRevenueKpi !== 'function' || !range?.from || !range?.to) return null;
    const fromD = new Date(range.from + 'T00:00:00');
    const toD = new Date(range.to + 'T00:00:00');
    if (isNaN(fromD) || isNaN(toD)) return null;
    const DAY = 86400000;
    const days = Math.max(1, Math.round((toD - fromD) / DAY) + 1);
    const prevTo = new Date(fromD.getTime() - DAY);
    const prevFrom = new Date(prevTo.getTime() - (days - 1) * DAY);
    return buildRevenueKpi({ from: dateInputValue(prevFrom), to: dateInputValue(prevTo) });
  }, [dataVersion, range?.from, range?.to]);

  // delta % cho chỉ số tiền/tỷ lệ
  const dp = (cur, prevKey) => {
    if (!kPrev) return {};
    const prev = kPrev[prevKey] || 0;
    // Giữ định dạng phần trăm nhất quán cả khi kỳ trước bằng 0.
    if (!prev) return cur > 0 ? { delta: '+100.0%', up: true } : {};
    const pct = ((cur - prev) / prev) * 100;
    if (!isFinite(pct)) return {};
    return { delta: (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%', up: pct >= 0, down: pct < 0 };
  };
  // delta dạng số đếm (đơn hàng)
  const dc = (cur, prevKey) => {
    if (!kPrev) return {};
    const diff = cur - (kPrev[prevKey] || 0);
    if (!diff) return { delta: '0' };
    return { delta: (diff > 0 ? '+' : '') + fmt.num(diff), up: diff > 0, down: diff < 0 };
  };

  if (loading) return <RevenueCardsSkeleton />;

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="grid grid-4">
        <StatCard label="Tổng GMV" value={fmt.vnd(k.gmv) + '₫'} {...dp(k.gmv, 'gmv')} loading={loading}
          help="Tổng giá trị đơn hàng phát sinh trong khoảng thời gian đang lọc." />
        <StatCard label="Hoa hồng" value={fmt.vnd(k.commission) + '₫'} {...dp(k.commission, 'commission')} accent loading={loading}
          help="Tổng hoa hồng dự kiến nhận được từ các đơn hợp lệ trong kỳ." />
        <StatCard label="Xtra Comm" value={fmt.vnd(k.xtraComm) + '₫'} {...dp(k.xtraComm, 'xtraComm')} loading={loading}
          help="Phần hoa hồng Xtra Commission từ chương trình ưu đãi bổ sung của Shopee." />
        <StatCard label="Shopee Comm" value={fmt.vnd(k.shopeeComm) + '₫'} {...dp(k.shopeeComm, 'shopeeComm')} loading={loading}
          help="Phần hoa hồng tiêu chuẩn do Shopee Affiliate ghi nhận." />
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        <StatCard label="Đơn hàng" value={fmt.num(k.orders)} {...dc(k.orders, 'orders')} small loading={loading}
          help="Số đơn hàng được ghi nhận trong kỳ lọc, gồm các trạng thái trong dữ liệu hiện tại." />
        <StatCard label="Lượt click" value={fmt.num(k.clicks)} {...dp(k.clicks, 'clicks')} small loading={loading}
          help="Tổng số lượt click affiliate dẫn về Shopee trong kỳ lọc." />
        <StatCard label="EPC" value={fmt.vnd(k.epc) + '₫'} {...dp(k.epc, 'epc')} small loading={loading}
          help="Doanh thu hoa hồng trung bình trên mỗi lượt click. Công thức: Hoa hồng / Lượt click." />
        <StatCard label="CVR" value={fmt.pct(k.cvr)} {...dp(k.cvr, 'cvr')} small loading={loading}
          help="Tỷ lệ chuyển đổi từ click sang đơn. Công thức: Đơn hàng / Lượt click." />
        <StatCard label="Comm Rate" value={fmt.pct(k.commRate)} {...dp(k.commRate, 'commRate')} small loading={loading}
          help="Tỷ lệ hoa hồng trên GMV. Công thức: Hoa hồng / GMV." />
        <StatCard label="Avg Order" value={fmt.vnd(k.avgOrder) + '₫'} {...dp(k.avgOrder, 'avgOrder')} small loading={loading}
          help="Giá trị đơn hàng trung bình. Công thức: GMV / Số đơn." />
      </div>

      <div className="grid grid-2">
        <div className="section">
          <div className="section-hd">
            <h3>Loại đơn</h3>
            <span className="meta">Phân loại theo nguồn dẫn</span>
          </div>
          <div className="section-body">
            <table className="tbl" style={{ background: 'transparent' }}>
              <thead>
                <tr><th>Loại</th><th className="num">Đơn</th><th className="num">GMV (đ)</th><th className="num">HH (đ)</th></tr>
              </thead>
              <tbody>
                {[
                  ['Video', k.byType.video, 'info'],
                  ['Live', k.byType.live, 'warn'],
                  ['Social', k.byType.social, 'ok'],
                  ['Zero GMV', k.byType.zero, ''],
                  ['Đã hủy', k.byType.cancelled, 'danger'],
                ].map(([lbl, v, c]) => (
                  <tr key={lbl} style={{ background: 'transparent' }}>
                    <td><Badge kind={c}>{lbl}</Badge></td>
                    <td className="num mono">{v.orders}</td>
                    <td className="num mono">{fmt.vnd(v.gmv)}</td>
                    <td className="num mono"><b>{fmt.vnd(v.comm)}</b></td>
                  </tr>
                ))}
                {![
                  k.byType.video,
                  k.byType.live,
                  k.byType.social,
                  k.byType.zero,
                  k.byType.cancelled,
                ].some((item) => Number(item?.orders || 0) || Number(item?.gmv || 0) || Number(item?.comm || 0)) && (
                  <TableEmptyRow colSpan={4} />
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="section">
          <div className="section-hd">
            <h3>So sánh kỳ trước</h3>
            <span className="meta">Theo dữ liệu thực tế</span>
          </div>
          <div className="section-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <CompareRow
              label={`${k.compare.lastDayLabel} vs ${k.compare.prevDayLabel}`}
              now={k.compare.lastDay} prev={k.compare.prevDay} />
            {quick !== 'yesterday' && (
              <>
                <div className="divider h" />
                <CompareRow
                  label={`${k.compare.periodDays} ngày này vs ${k.compare.periodDays} ngày trước`}
                  now={k.compare.currPeriod} prev={k.compare.prevPeriod} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RevenueCardsSkeleton() {
  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="grid grid-4">{['a', 'b', 'c', 'd'].map((id) => <StatCard key={id} label=" " loading />)}</div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        {['a', 'b', 'c', 'd', 'e', 'f'].map((id) => <StatCard key={id} label=" " small loading />)}
      </div>
    </div>
  );
}

function StatCard({ label, value, delta, up, down, small, accent, help, loading = false }) {
  return (
    <div className="stat-card" style={accent ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px var(--accent-soft)' } : null}>
      {help && (
        <span className="stat-info" tabIndex="0" aria-label={help}>
          <Icon name="infoCircle" size={14} />
          <span className="stat-tooltip">{help}</span>
        </span>
      )}
      <div className="lbl">{label}</div>
      <div className="val" style={{ fontSize: small ? 18 : 22 }}>
        {loading ? <span className="stat-skeleton" style={{ width: small ? '54%' : '68%' }} /> : value}
      </div>
      {!loading && delta && (
        <div className="sub">
          <span className={'delta ' + (up ? 'up' : down ? 'down' : '')}>
            {up && '▲ '}{down && '▼ '}{delta}
          </span>
        </div>
      )}
    </div>
  );
}

function CompareRow({ label, now, prev }) {
  const commDelta = prev.comm ? ((now.comm - prev.comm) / prev.comm) * 100 : 0;
  const ordDelta = prev.ord ? ((now.ord - prev.ord) / prev.ord) * 100 : 0;
  return (
    <div>
      <div className="dim" style={{ fontSize: 'var(--font-xs)', marginBottom: 8 }}>{label}</div>
      <div className="grid grid-2" style={{ gap: 14 }}>
        <div>
          <div className="dim-2" style={{ fontSize: 'var(--font-xs)' }}>Hoa hồng</div>
          <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{fmt.vnd(now.comm)}₫</span>
            <span className={'badge ' + (commDelta >= 0 ? 'ok' : 'danger')}>
              {commDelta >= 0 ? '▲' : '▼'} {Math.abs(commDelta).toFixed(1)}%
            </span>
          </div>
          <div className="dim-2" style={{ fontSize: 'var(--font-xs)' }}>so với {fmt.vnd(prev.comm)}₫</div>
        </div>
        <div>
          <div className="dim-2" style={{ fontSize: 'var(--font-xs)' }}>Đơn</div>
          <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{now.ord}</span>
            <span className={'badge ' + (ordDelta >= 0 ? 'ok' : 'danger')}>
              {ordDelta >= 0 ? '▲' : '▼'} {Math.abs(ordDelta).toFixed(1)}%
            </span>
          </div>
          <div className="dim-2" style={{ fontSize: 'var(--font-xs)' }}>so với {prev.ord} đơn</div>
        </div>
      </div>
    </div>
  );
}

// =========================================================
// Analysis
// =========================================================
function RevenueAnalysis({ dataVersion = 0, range }) {
  const daily = React.useMemo(() => buildDailyRevenue(range), [dataVersion, range?.from, range?.to]);
  const clickBreakdown = React.useMemo(() => daily.map(dailyClickBreakdown), [daily]);
  const hourly = React.useMemo(() => buildHourly(range), [dataVersion, range?.from, range?.to]);
  const k = React.useMemo(() => (
    typeof buildRevenueKpi === 'function' ? buildRevenueKpi(range) : REVENUE_KPI
  ), [dataVersion, range?.from, range?.to]);
  const maxOrders = React.useMemo(() => (
    Math.max(1, ...daily.map((d) => Number(d.orders || 0)))
  ), [daily]);

  const analysisRef = useChart((el, c) => new Chart(el, {
    type: 'bar',
    data: {
      labels: daily.map((d) => d.date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })),
      datasets: [
        {
          type: 'bar', label: 'Click tool', format: 'count', yAxisID: 'y', stack: 'clicks',
          data: clickBreakdown.map((d) => d.seedingComment),
          backgroundColor: c.warn + 'aa', borderColor: c.warn,
          borderRadius: 4, borderWidth: 0, borderSkipped: false, maxBarThickness: 18,
        },
        {
          type: 'bar', label: 'Click khác', format: 'count', yAxisID: 'y', stack: 'clicks',
          data: clickBreakdown.map((d) => d.other),
          backgroundColor: c.info + '66', borderColor: c.info,
          borderRadius: 4, borderWidth: 0, borderSkipped: false, maxBarThickness: 18,
        },
        {
          type: 'line', label: 'Đơn', format: 'count', yAxisID: 'yOrders',
          data: daily.map((d) => d.orders), tension: 0.35,
          borderColor: c.accent, backgroundColor: c.accent + '22', borderWidth: 2,
          pointRadius: 0, pointHoverRadius: 4, fill: false,
        },
        {
          type: 'line', label: 'Hoa hồng', format: 'money', yAxisID: 'y1',
          data: daily.map((d) => d.comm), tension: 0.35,
          borderColor: c.ok, backgroundColor: c.ok + '22', borderWidth: 2,
          pointRadius: 0, pointHoverRadius: 4, fill: false,
        },
      ],
    },
    options: chartOpts(c, {
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { color: c.axis, font: { size: 10 } } },
        y: { stacked: true, grid: { color: c.grid }, ticks: { color: c.axis, font: { size: 10 }, precision: 0 } },
        yOrders: { position: 'right', offset: true, grid: { display: false }, min: 0,
              suggestedMax: Math.max(2, Math.ceil(maxOrders * 1.25)),
              ticks: { color: c.accent, font: { size: 10 }, precision: 0, callback: (v) => fmt.num(v) } },
        y1: { position: 'right', grid: { display: false }, ticks: { color: c.axis, font: { size: 10 },
              callback: (v) => fmt.short(v) } },
      },
    }),
  }), [dataVersion, range?.from, range?.to, clickBreakdown, maxOrders]);

  const mixRef = useChart((el, c) => new Chart(el, {
    type: 'doughnut',
    data: {
      labels: ['Xtra', 'Shopee', 'Khác'],
      datasets: [{
        data: [k.xtraComm, k.shopeeComm, k.commission - k.xtraComm - k.shopeeComm],
        backgroundColor: [c.accent, c.info, c.warn],
        borderColor: c.bg, borderWidth: 2,
      }],
    },
    options: chartOpts(c, { cutout: '70%', plugins: { legend: { position: 'right' } } }),
  }), [dataVersion, range?.from, range?.to]);

  const hourRef = useChart((el, c) => new Chart(el, {
    type: 'bar',
    data: {
      labels: hourly.map((h) => String(h.hour).padStart(2, '0') + 'h'),
      datasets: [
        { type: 'bar', label: 'Click', yAxisID: 'y', data: hourly.map((h) => h.clicks),
          backgroundColor: c.info + '60', borderRadius: 3, maxBarThickness: 14 },
        { type: 'line', label: 'Đơn', yAxisID: 'y1', data: hourly.map((h) => h.orders),
          borderColor: c.accent, borderWidth: 2, tension: 0.4,
          pointRadius: 0, pointHoverRadius: 4 },
      ],
    },
    options: chartOpts(c, {
      scales: {
        x: { grid: { display: false }, ticks: { color: c.axis, font: { size: 10 }, maxRotation: 0 } },
        y: { grid: { color: c.grid }, ticks: { color: c.axis, font: { size: 10 } } },
        y1: { position: 'right', grid: { display: false }, ticks: { color: c.axis, font: { size: 10 } } },
      },
    }),
  }), [dataVersion, range?.from, range?.to]);

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="section">
        <div className="section-hd">
          <h3>Click, Đơn & Hoa hồng theo ngày</h3>
          <span className="meta">Tách click tool và click khác trong khoảng ngày đang lọc</span>
          <div className="spacer" />
          <Legend items={[
            { c: 'var(--warn)', l: 'Click tool', shape: 'bar' },
            { c: 'var(--info)', l: 'Click khác', shape: 'bar' },
            { c: 'var(--accent)', l: 'Đơn', shape: 'line' },
            { c: 'var(--ok)', l: 'Hoa hồng', shape: 'line' },
          ]} />
        </div>
        <div className="section-body">
          <div className="chart-host tall"><canvas ref={analysisRef} /></div>
        </div>
      </div>
      <div className="grid grid-2">
        <div className="section">
          <div className="section-hd">
            <h3>Cơ cấu hoa hồng</h3>
            <span className="meta">Xtra • Shopee • Khác</span>
          </div>
          <div className="section-body">
            <div className="chart-host"><canvas ref={mixRef} /></div>
          </div>
        </div>
        <div className="section">
          <div className="section-hd">
            <h3>Đơn & Click theo giờ</h3>
            <span className="meta">Giờ vàng: 19h–22h</span>
          </div>
          <div className="section-body">
            <div className="chart-host"><canvas ref={hourRef} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Legend({ items }) {
  return (
    <div className="row" style={{ gap: 14, fontSize: 'var(--font-xs)', color: 'var(--fg-muted)' }}>
      {items.map((it, i) => (
        <span key={i} className="row" style={{ gap: 6 }}>
          {it.shape === 'line'
            ? <span style={{ width: 14, height: 2, background: it.c, borderRadius: 1 }} />
            : <span style={{ width: 10, height: 10, background: it.c, borderRadius: 2 }} />}
          {it.l}
        </span>
      ))}
    </div>
  );
}

function chartOpts(c, extra = {}) {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false, labels: { color: c.fg, font: { size: 11 } } },
      tooltip: {
        backgroundColor: c.bg,
        titleColor: c.fg, bodyColor: c.fg,
        borderColor: 'rgba(0,0,0,.1)', borderWidth: 1,
        padding: 10, displayColors: true, boxPadding: 4,
        titleFont: { size: 11, weight: '600' },
        bodyFont: { size: 11 },
        callbacks: {
          label: (ctx) => {
            const value = ctx.parsed?.y ?? ctx.parsed ?? 0;
            const label = ctx.dataset?.label || '';
            if (ctx.dataset?.format === 'count') return `${label}: ${fmt.num(value)}`;
            return `${label}: ${fmt.vnd(value)}`;
          },
        },
      },
      ...extra.plugins,
    },
    scales: extra.scales,
    cutout: extra.cutout,
  };
}

// =========================================================
// Products & Shops
// =========================================================
function RevenueShops({ dataVersion = 0, range }) {
  const products = React.useMemo(() => (
    typeof buildTopProducts === 'function' ? buildTopProducts(range) : TOP_PRODUCTS
  ), [dataVersion, range?.from, range?.to]);
  const shops = React.useMemo(() => (
    typeof buildTopShops === 'function' ? buildTopShops(range) : TOP_SHOPS
  ), [dataVersion, range?.from, range?.to]);
  const categories = React.useMemo(() => (
    typeof buildCategories === 'function' ? buildCategories(range) : CATEGORIES
  ), [dataVersion, range?.from, range?.to]);
  const catRef = useChart((el, c) => new Chart(el, {
    type: 'bar',
    data: {
      labels: categories.map((x) => x.name),
      datasets: [{
        data: categories.map((x) => x.gmv),
        backgroundColor: [c.accent, c.info, c.ok, c.warn, c.danger, c.axis],
        borderRadius: 4, maxBarThickness: 28,
      }],
    },
    options: {
      ...chartOpts(c, {
        scales: {
          x: { grid: { display: false }, ticks: { color: c.axis, font: { size: 10 } } },
          y: { grid: { color: c.grid }, ticks: { color: c.axis, font: { size: 10 },
                callback: (v) => fmt.short(v) } },
        },
      }),
      indexAxis: 'y',
    },
  }), [dataVersion, range?.from, range?.to]);

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="grid grid-2">
        <div className="section">
          <div className="section-hd"><h3>Top sản phẩm</h3><span className="meta">Theo hoa hồng</span></div>
          <div className="tbl-wrap" style={{ maxHeight: 380, overflow: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Sản phẩm</th><th className="num">Đơn</th><th className="num">GMV (đ)</th><th className="num">HH (đ)</th></tr></thead>
              <tbody>
                {products.map((p, i) => (
                  <tr key={i}>
                    <td className="truncate" style={{ maxWidth: 280, fontWeight: 500 }}>{p.name}</td>
                    <td className="num mono">{p.orders}</td>
                    <td className="num mono">{fmt.vnd(p.gmv)}</td>
                    <td className="num mono"><b style={{ color: 'var(--ok)' }}>{fmt.vnd(p.comm)}</b></td>
                  </tr>
                ))}
                {products.length === 0 && <TableEmptyRow colSpan={4} />}
              </tbody>
            </table>
          </div>
        </div>
        <div className="section">
          <div className="section-hd"><h3>Top shop</h3><span className="meta">Theo hoa hồng</span></div>
          <div className="tbl-wrap" style={{ maxHeight: 380, overflow: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Shop</th><th className="num">Đơn</th><th className="num">GMV (đ)</th><th className="num">HH (đ)</th><th className="num">Rate %</th></tr></thead>
              <tbody>
                {shops.map((s, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{s.name}</td>
                    <td className="num mono">{s.orders}</td>
                    <td className="num mono">{fmt.vnd(s.gmv)}</td>
                    <td className="num mono"><b style={{ color: 'var(--ok)' }}>{fmt.vnd(s.comm)}</b></td>
                    <td className="num mono dim">{s.rate}%</td>
                  </tr>
                ))}
                {shops.length === 0 && <TableEmptyRow colSpan={5} />}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="section">
        <div className="section-hd"><h3>Theo danh mục</h3><span className="meta">GMV theo ngành hàng</span></div>
        <div className="section-body"><div className="chart-host"><canvas ref={catRef} /></div></div>
      </div>
    </div>
  );
}

// =========================================================
// SubID
// =========================================================
function RevenueSubId({ dataVersion = 0, range }) {
  const rows = React.useMemo(() => buildSubIds(range), [dataVersion, range?.from, range?.to]);
  const [search, setSearch] = React.useState('');
  const [pageSize, setPageSize] = React.useState(25);
  const [page, setPage] = React.useState(0);
  const [detail, setDetail] = React.useState(null);

  const filtered = rows.filter((r) => {
    const s = search.toLowerCase();
    if (!s) return true;
    return [r.sub1, r.sub2, r.sub3, r.sub4, r.sub5].some((x) => x.toLowerCase().includes(s));
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const view = filtered.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="section">
      <div className="section-hd">
        <h3>SubID hiệu năng</h3>
        <span className="meta">{filtered.length} sub-id</span>
        <div className="spacer" />
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(0); }}
                     placeholder="Lọc theo Sub ID…" style={{ width: 220 }} />
        <select className="select sm" value={pageSize} style={{ width: 80 }}
                onChange={(e) => { setPageSize(+e.target.value); setPage(0); }}>
          {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Loại</th>
              <th>Sub 1</th><th>Sub 2</th><th>Sub 3</th><th>Sub 4</th><th>Sub 5</th>
              <th className="num">Click</th>
              <th className="num">Đơn</th>
              <th className="num">Hoa hồng (₫)</th>
              <th className="num">EPC (₫)</th>
              <th className="num">CVR (%)</th>
              <th className="num">CPC (₫)</th>
              <th className="num">Profit (₫)</th>
              <th>Đánh giá</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => (
              <tr key={i}>
                <td><Badge kind={r.type === 'Auto' ? 'info' : ''}>{r.type}</Badge></td>
                <td className="mono">{r.sub1}</td>
                <td className="mono">{r.sub2}</td>
                <td className="mono">{r.sub3}</td>
                <td className="mono">{r.sub4}</td>
                <td className="mono">{r.sub5}</td>
                <td className="num mono">{r.clicks}</td>
                <td className="num mono">{r.orders}</td>
                <td className="num mono"><b>{fmt.vnd(r.comm)}</b></td>
                <td className="num mono">{fmt.vnd(r.epc)}</td>
                <td className="num mono">{fmt.pct(r.cvr)}</td>
                <td className="num mono">{fmt.vnd(r.cpc)}</td>
                <td className="num mono" style={{ color: r.profit > 0 ? 'var(--ok)' : 'var(--danger)' }}>
                  {r.profit > 0 ? '+' : ''}{fmt.vnd(r.profit)}
                </td>
                <td>
                  <Badge kind={r.rating === 'Tốt' ? 'ok' : r.rating === 'Khá' ? 'info' : 'danger'}>{r.rating}</Badge>
                </td>
                <td>
                  <button className="btn sm ghost" data-tooltip="Xem chi tiết đơn hàng" aria-label="Xem chi tiết đơn hàng" onClick={() => setDetail(r)}>Chi tiết</button>
                </td>
              </tr>
            ))}
            {view.length === 0 && <TableEmptyRow colSpan={15} />}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-elev)' }}>
        <span className="dim" style={{ fontSize: 'var(--font-xs)' }}>
          {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} / {filtered.length}
        </span>
        <div className="spacer" />
        <button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
          <Icon name="chevronLeft" size={12} /> Trước
        </button>
        <span className="dim mono" style={{ fontSize: 'var(--font-xs)' }}>{page + 1}/{totalPages}</span>
        <button className="btn sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
          Sau <Icon name="chevronRight" size={12} />
        </button>
      </div>
      {detail && <SubIdDetailDialog row={detail} range={range} onClose={() => setDetail(null)} />}
    </div>
  );
}

function SubIdDetailDialog({ row, range, onClose }) {
  const sub = row.full || `${row.sub1}-${row.sub2}-${row.sub3}-${row.sub4}-${row.sub5}`;
  const [detail, setDetail] = React.useState(() => (
    typeof buildSubIdDetail === 'function' ? buildSubIdDetail(row, range) : { clicks: [], orders: [] }
  ));
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const api = window.backendApi;
    if (!api?.connected || !api.getSubidDetail) return undefined;
    setLoading(true);
    api.getSubidDetail({ field: 'sub_id3', value: row.sub3 }).then((res) => {
      if (!active) return;
      if (res?.ok) {
        const fromTime = range?.from ? new Date(range.from + 'T00:00:00') : null;
        const toTime = range?.to ? new Date(range.to + 'T23:59:59.999') : null;
        const inRange = (item) => {
          if (!item.time) return false;
          const d = new Date(item.time.replace(' ', 'T'));
          if (Number.isNaN(d.getTime())) return false;
          if (fromTime && d < fromTime) return false;
          if (toTime && d > toTime) return false;
          return true;
        };
        setDetail({
          clicks: (res.data?.clicks || []).filter((item) => item.subids === sub && inRange(item)).map((item) => ({
            ...item,
            time: item.time ? new Date(item.time.replace(' ', 'T')) : null,
          })),
          orders: (res.data?.orders || []).filter((item) => item.subids === sub && inRange(item)).map((item) => ({
            ...item,
            time: item.time ? new Date(item.time.replace(' ', 'T')) : null,
          })),
        });
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [row, sub, range?.from, range?.to]);

  const clickRows = detail.clicks || [];
  const orderRows = detail.orders || [];

  return (
    <Dialog title={`Chi tiết SubID: ${sub}`} onClose={onClose} width={720}
            footer={<button className="btn primary" onClick={onClose}>Đóng</button>}>
      <div className="grid grid-2" style={{ gap: 14 }}>
        <StatCard label="Click" value={row.clicks} small />
        <StatCard label="Đơn" value={row.orders} small />
        <StatCard label="Hoa hồng" value={fmt.vnd(row.comm) + '₫'} small />
        <StatCard label="Profit" value={(row.profit > 0 ? '+' : '') + fmt.vnd(row.profit) + '₫'} small />
      </div>
      {loading && <div className="dim" style={{ marginTop: 12, fontSize: 'var(--font-xs)' }}>Đang nạp chi tiết từ backend...</div>}
      <h3 style={{ fontSize: 13, marginTop: 16 }}>Lịch sử click ({clickRows.length})</h3>
      <table className="tbl">
        <thead><tr><th>#</th><th>Click ID</th><th>SubID</th><th>Nguồn</th><th>Thời gian</th></tr></thead>
        <tbody>
          {clickRows.slice(0, 20).map((item, i) => (
            <tr key={i}>
              <td className="dim">{i + 1}</td>
              <td className="mono">{item.click_id || '-'}</td>
              <td className="mono dim">{item.subids || sub}</td>
              <td className="dim">{item.source || '-'}</td>
              <td className="dim mono">{item.time ? fmt.dateTime(item.time) : '-'}</td>
            </tr>
          ))}
          {clickRows.length === 0 && <TableEmptyRow colSpan={5} padding={18} />}
        </tbody>
      </table>
      <h3 style={{ fontSize: 13, marginTop: 16 }}>Lịch sử đơn ({orderRows.length})</h3>
      <table className="tbl">
        <thead><tr><th>#</th><th>Order ID</th><th>SubID</th><th>Sản phẩm</th><th>Thời gian</th><th className="num">HH</th><th className="num">Giá trị</th></tr></thead>
        <tbody>
          {orderRows.slice(0, 20).map((item, i) => (
            <tr key={i}>
              <td className="dim">{i + 1}</td>
              <td className="mono">{item.order_id || '-'}</td>
              <td className="mono dim">{item.subids || sub}</td>
              <td className="truncate" style={{ maxWidth: 220 }}>{item.product || '-'}</td>
              <td className="dim mono">{item.time ? fmt.dateTime(item.time) : '-'}</td>
              <td className="num mono">{fmt.vnd(item.commission || 0)}</td>
              <td className="num mono">{fmt.vnd(item.gmv || 0)}</td>
            </tr>
          ))}
          {orderRows.length === 0 && <TableEmptyRow colSpan={7} padding={18} />}
        </tbody>
      </table>
    </Dialog>
  );
}

// =========================================================
// Orders detail
// =========================================================
function RevenueOrders({ dataVersion = 0, range }) {
  const rows = React.useMemo(() => buildOrders(range), [dataVersion, range?.from, range?.to]);
  const [subIdQ, setSubIdQ] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const fullSubId = (r) => r.subId || [r.sub1, r.sub2, r.sub3, r.sub4, r.sub5]
    .map((x) => String(x || '-'))
    .join('-');

  const filtered = rows.filter((r) => {
    if (status !== 'all' && r.status !== status) return false;
    if (!subIdQ) return true;
    return fullSubId(r).toLowerCase().includes(subIdQ.toLowerCase());
  });

  return (
    <div className="section">
      <div className="section-hd">
        <h3>Chi tiết đơn hàng</h3>
        <span className="meta">{filtered.length} đơn</span>
        <div className="spacer" />
        <input className="input sm" value={subIdQ} placeholder="SubID…"
               onChange={(e) => setSubIdQ(e.target.value)} style={{ width: 260 }} />
      </div>
      <Subtabs tabs={[
        { value: 'all', label: 'Tất cả', count: rows.length },
        { value: 'Chờ xử lý', label: 'Chờ xử lý', count: rows.filter((r) => r.status === 'Chờ xử lý').length },
        { value: 'Hoàn thành', label: 'Hoàn thành', count: rows.filter((r) => r.status === 'Hoàn thành').length },
        { value: 'Đã hủy', label: 'Đã hủy', count: rows.filter((r) => r.status === 'Đã hủy').length },
      ]} value={status} onChange={setStatus} />
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Sản phẩm</th>
              <th>Shop</th>
              <th className="num">GMV (đ)</th>
              <th className="num">Hoa hồng (đ)</th>
              <th>Kênh</th>
              <th>Sub ID</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 30).map((r, i) => (
              <tr key={i}>
                <td className="dim mono">{fmt.dateTime(r.time)}</td>
                <td className="truncate" style={{ maxWidth: 240 }}>{r.product}</td>
                <td className="dim">{r.shop}</td>
                <td className="num mono">{fmt.vnd(r.gmv)}</td>
                <td className="num mono"><b style={{ color: 'var(--ok)' }}>{fmt.vnd(r.comm)}</b></td>
                <td><Badge kind={r.channel === 'Telegram' ? 'accent' : 'info'}>{r.channel}</Badge></td>
                <td className="mono truncate" style={{ maxWidth: 280 }}>{fullSubId(r)}</td>
                <td>
                  <Badge kind={r.status === 'Hoàn thành' ? 'ok' : r.status === 'Chờ xử lý' ? 'warn' : 'danger'}>
                    {r.status}
                  </Badge>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <TableEmptyRow colSpan={8} />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =========================================================
// Clicks overview
// =========================================================
const CLICK_PAGE_SIZE = 30;
function RevenueClicks({ dataVersion = 0, range }) {
  const rows = React.useMemo(() => buildSubIds(range), [dataVersion, range?.from, range?.to]);
  const [showCpc, setShowCpc] = React.useState(false);
  const [subIdQ, setSubIdQ] = React.useState('');
  const [appPage, setAppPage] = React.useState(0);
  const [otherPage, setOtherPage] = React.useState(0);
  const [sortKey, setSortKey] = React.useState('clicks');
  const [sortDir, setSortDir] = React.useState('desc');
  React.useEffect(() => { setAppPage(0); setOtherPage(0); }, [subIdQ, dataVersion, range?.from, range?.to]);
  const isAppSubId = (r) => String(r.sub1 || '').toLowerCase() === 'seeding';

  const clickSortKey = (k) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'sub1' || k === 'sub2' || k === 'sub3' || k === 'sub4' ? 'asc' : 'desc'); }
    setAppPage(0); setOtherPage(0);
  };
  const sortRows = (arr) => {
    return [...arr].sort((a, b) => {
      const av = a[sortKey] ?? ''; const bv = b[sortKey] ?? '';
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  };
  const SortTh = ({ k, children, num }) => {
    const active = sortKey === k;
    return (
      <th className={'sortable' + (active ? ' active' : '') + (num ? ' num' : '')}
          onClick={() => clickSortKey(k)}
          style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
        {children}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </th>
    );
  };

  const filtered = rows.filter((r) => {
    if (!subIdQ) return true;
    return [r.sub1, r.sub2, r.sub3, r.sub4, r.sub5].some((x) => x.toLowerCase().includes(subIdQ.toLowerCase()));
  });
  const appRows = sortRows(filtered.filter(isAppSubId));
  const otherRows = sortRows(filtered.filter((r) => !isAppSubId(r)));
  const totals = filtered.reduce((a, r) => ({
    clicks: a.clicks + r.clicks, orders: a.orders + r.orders,
    comm: a.comm + r.comm, profit: a.profit + r.profit,
  }), { clicks: 0, orders: 0, comm: 0, profit: 0 });
  const epcAvg = totals.clicks ? totals.comm / totals.clicks : 0;
  const cvrAvg = totals.clicks ? (totals.orders / totals.clicks) * 100 : 0;
  const renderSubIdRow = (r, key) => (
    <tr key={key}>
      <td><Badge kind={isAppSubId(r) ? 'info' : ''}>{isAppSubId(r) ? 'App' : 'Shopee'}</Badge></td>
      <td className="mono">{r.sub1}</td>
      <td className="mono">{r.sub2}</td>
      <td className="mono">{r.sub3}</td>
      <td className="mono">{r.sub4}</td>
      <td className="mono">{r.sub5}</td>
      <td className="num mono">{r.clicks}</td>
      <td className="num mono">{r.orders}</td>
      <td className="num mono"><b>{fmt.vnd(r.comm)}</b></td>
      <td className="num mono">{fmt.vnd(r.epc)}</td>
      <td className="num mono">{fmt.pct(r.cvr)}</td>
      <td className="num mono">{fmt.vnd(r.cpc)}</td>
      <td className="num mono" style={{ color: r.profit > 0 ? 'var(--ok)' : 'var(--danger)' }}>
        {r.profit > 0 ? '+' : ''}{fmt.vnd(r.profit)}
      </td>
      <td><Badge kind={r.rating === 'Tốt' ? 'ok' : r.rating === 'Khá' ? 'info' : 'danger'}>{r.rating}</Badge></td>
    </tr>
  );

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="section">
        <div className="section-hd">
          <input className="input sm" value={subIdQ} placeholder="Lọc SubID khớp một phần…"
                 onChange={(e) => setSubIdQ(e.target.value)} style={{ width: 220 }} />
          {subIdQ && <button className="btn sm ghost" onClick={() => setSubIdQ('')}>Xóa lọc</button>}
          <div className="spacer" />
          <button className="btn sm" onClick={() => setShowCpc(true)}>
            <Icon name="settings" size={12} /> Cấu hình CPC
          </button>
        </div>
        <div className="section-body">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
            <StatCard label="Tổng Click" value={fmt.num(totals.clicks)} small />
            <StatCard label="Tổng Đơn" value={fmt.num(totals.orders)} small />
            <StatCard label="Tổng HH" value={fmt.vnd(totals.comm) + '₫'} small />
            <StatCard label="EPC TB" value={fmt.vnd(epcAvg) + '₫'} small />
            <StatCard label="CVR TB" value={fmt.pct(cvrAvg)} small />
            <StatCard label="Lợi nhuận" value={(totals.profit > 0 ? '+' : '') + fmt.vnd(totals.profit) + '₫'} small />
            <StatCard label="Số Sub ID" value={filtered.length} small />
            <StatCard label="SubID khác" value={otherRows.length} small
              help="Các SubID không bắt đầu bằng seeding, lấy trực tiếp từ dữ liệu Shopee Affiliate." />
          </div>
        </div>
      </div>
      <div className="section">
        <div className="section-hd">
          <h3>Chi tiết SubID</h3>
          <span className="meta">App seeding ở trên, SubID khác từ Shopee ở cuối.</span>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Nguồn</th>
                <SortTh k="sub1">Sub 1</SortTh>
                <SortTh k="sub2">Sub 2</SortTh>
                <SortTh k="sub3">Sub 3</SortTh>
                <SortTh k="sub4">Sub 4</SortTh>
                <SortTh k="sub5">Sub 5</SortTh>
                <SortTh k="clicks" num>Click</SortTh>
                <SortTh k="orders" num>Đơn</SortTh>
                <SortTh k="comm" num>HH (đ)</SortTh>
                <SortTh k="epc" num>EPC</SortTh>
                <SortTh k="cvr" num>CVR %</SortTh>
                <SortTh k="cpc" num>CPC</SortTh>
                <SortTh k="profit" num>Profit (đ)</SortTh>
                <SortTh k="rating">Đánh giá</SortTh>
              </tr>
            </thead>
            <tbody>
              {appRows.slice(appPage * CLICK_PAGE_SIZE, (appPage + 1) * CLICK_PAGE_SIZE).map((r, i) => renderSubIdRow(r, `app-${appPage}-${i}`))}
              {otherRows.length > 0 && (
                <tr>
                  <td colSpan="14" className="dim" style={{ background: 'var(--bg-elev)', fontWeight: 700 }}>
                    SubID khác từ Shopee Affiliate ({otherRows.length})
                  </td>
                </tr>
              )}
              {otherRows.slice(otherPage * CLICK_PAGE_SIZE, (otherPage + 1) * CLICK_PAGE_SIZE).map((r, i) => renderSubIdRow(r, `other-${otherPage}-${i}`))}
              {appRows.length === 0 && otherRows.length === 0 && <TableEmptyRow colSpan={14} />}
            </tbody>
          </table>
        </div>
        {/* Pagination — App SubIDs */}
        {appRows.length > CLICK_PAGE_SIZE && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderTop: '1px solid var(--border)', fontSize: 'var(--font-xs)' }}>
            <span className="dim">App SubID:</span>
            <button className="btn sm" disabled={appPage === 0} onClick={() => setAppPage(0)}>«</button>
            <button className="btn sm" disabled={appPage === 0} onClick={() => setAppPage(p => p - 1)}>‹</button>
            <span className="dim mono">{appPage + 1} / {Math.ceil(appRows.length / CLICK_PAGE_SIZE)}</span>
            <button className="btn sm" disabled={(appPage + 1) * CLICK_PAGE_SIZE >= appRows.length} onClick={() => setAppPage(p => p + 1)}>›</button>
            <button className="btn sm" disabled={(appPage + 1) * CLICK_PAGE_SIZE >= appRows.length} onClick={() => setAppPage(Math.ceil(appRows.length / CLICK_PAGE_SIZE) - 1)}>»</button>
            <span className="dim">{appPage * CLICK_PAGE_SIZE + 1}–{Math.min((appPage + 1) * CLICK_PAGE_SIZE, appRows.length)} / {appRows.length}</span>
          </div>
        )}
        {/* Pagination — Other SubIDs */}
        {otherRows.length > CLICK_PAGE_SIZE && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderTop: '1px solid var(--border)', fontSize: 'var(--font-xs)' }}>
            <span className="dim">SubID khác:</span>
            <button className="btn sm" disabled={otherPage === 0} onClick={() => setOtherPage(0)}>«</button>
            <button className="btn sm" disabled={otherPage === 0} onClick={() => setOtherPage(p => p - 1)}>‹</button>
            <span className="dim mono">{otherPage + 1} / {Math.ceil(otherRows.length / CLICK_PAGE_SIZE)}</span>
            <button className="btn sm" disabled={(otherPage + 1) * CLICK_PAGE_SIZE >= otherRows.length} onClick={() => setOtherPage(p => p + 1)}>›</button>
            <button className="btn sm" disabled={(otherPage + 1) * CLICK_PAGE_SIZE >= otherRows.length} onClick={() => setOtherPage(Math.ceil(otherRows.length / CLICK_PAGE_SIZE) - 1)}>»</button>
            <span className="dim">{otherPage * CLICK_PAGE_SIZE + 1}–{Math.min((otherPage + 1) * CLICK_PAGE_SIZE, otherRows.length)} / {otherRows.length}</span>
          </div>
        )}
      </div>
      {showCpc && <CpcConfigDialog onClose={() => setShowCpc(false)} />}
    </div>
  );
}

function CpcConfigDialog({ onClose }) {
  const initialConfig = window.APP_CURRENT?.cpcConfig || { average_cpc: 0, per_subid: {} };
  const toRows = (cfg) => Object.entries(cfg?.per_subid || {}).map(([id, cpc]) => ({ id, cpc: Number(cpc || 0) }));
  const [rows, setRows] = React.useState(() => toRows(initialConfig));
  const [avg, setAvg] = React.useState(Number(initialConfig.average_cpc || 0));
  const [message, setMessage] = React.useState('');

  React.useEffect(() => {
    const api = window.backendApi;
    if (!api?.connected || !api.loadCpcConfig) return undefined;
    let active = true;
    api.loadCpcConfig().then((res) => {
      if (!active || !res?.ok) return;
      setAvg(Number(res.data?.average_cpc || 0));
      setRows(toRows(res.data || {}));
    });
    return () => { active = false; };
  }, []);

  const save = () => {
    const payload = {
      average_cpc: avg,
      per_subid: Object.fromEntries(rows.filter((r) => r.id).map((r) => [r.id, Number(r.cpc || 0)])),
    };
    window.APP_CURRENT = { ...(window.APP_CURRENT || {}), cpcConfig: payload };
    if (!window.backendApi?.connected || !window.backendApi.saveCpcConfig) {
      setMessage('Đã cập nhật tạm trong UI. Backend chưa sẵn sàng nên chưa lưu được vào config.json.');
      return;
    }
    window.backendApi.saveCpcConfig(payload).then((res) => {
      if (res?.ok) onClose();
      else setMessage(res?.error || 'Không lưu được cấu hình CPC.');
    });
  };

  return (
    <Dialog title="Cấu hình CPC" onClose={onClose} width={520}
            footer={<>
              <button className="btn" onClick={onClose}>Huỷ</button>
              <button className="btn primary" onClick={save}>Lưu</button>
            </>}>
      <FieldRow label="CPC trung bình" help="Áp dụng cho mọi SubID chưa có cấu hình riêng.">
        <Spinbox value={avg} min={0} max={50000} step={50} suffix="₫" onChange={setAvg} />
      </FieldRow>
      <div style={{ paddingTop: 16 }}>
        <div className="row" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 13 }}>CPC theo SubID</h3>
          <div className="spacer" />
          <button className="btn sm" onClick={() => setRows((p) => [...p, { id: '', cpc: 0 }])}><Icon name="plus" size={12}/> Thêm dòng</button>
          <button className="btn sm ghost" onClick={() => setRows((p) => p.slice(0, -1))}><Icon name="trash" size={12}/> Xóa dòng</button>
        </div>
        <table className="tbl">
          <thead><tr><th>SubID</th><th className="num">CPC (VND)</th><th style={{ width: 60 }}></th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><input className="input sm mono" value={r.id} onChange={(e) => setRows((p) => p.map((x, j) => j === i ? { ...x, id: e.target.value } : x))} /></td>
                <td><input className="input sm mono" value={r.cpc} onChange={(e) => setRows((p) => p.map((x, j) => j === i ? { ...x, cpc: Number(e.target.value || 0) } : x))} /></td>
                <td><button className="btn sm ghost" data-tooltip="Xóa dòng CPC" aria-label="Xóa dòng CPC" onClick={() => setRows((p) => p.filter((_, j) => j !== i))}><Icon name="trash" size={12} /></button></td>
              </tr>
            ))}
            {rows.length === 0 && <TableEmptyRow colSpan={3} padding={18} />}
          </tbody>
        </table>
        {message && <div style={{ color: 'var(--warn)', marginTop: 10, fontSize: 'var(--font-xs)' }}>{message}</div>}
      </div>
    </Dialog>
  );
}

// =========================================================
// Hot products
// =========================================================
function RevenueProdHot({ dataVersion = 0, range }) {
  const [sub, setSub] = React.useState('hot');
  const [search, setSearch] = React.useState('');
  const [sort, setSort] = React.useState('comm-desc');
  const [hotBy, setHotBy] = React.useState('comm');
  const sourceProducts = React.useMemo(() => (
    typeof buildTopProducts === 'function' ? buildTopProducts(range) : TOP_PRODUCTS
  ), [dataVersion, range?.from, range?.to]);
  const rows = sourceProducts.map((p, i) => ({
    ...p, idx: i + 1,
    shop: p.shop || '-',
    category: p.category || 'Khác',
    sold: Number(p.sold ?? p.orders ?? 0),
    clicks: Number(p.clicks || 0),
    epc: Number(p.epc || 0),
  }));

  const filtered = rows.filter((p) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return p.name.toLowerCase().includes(s) || p.shop.toLowerCase().includes(s);
  }).sort((a, b) => {
    const [field, direction] = sort.split('-');
    const key = field === 'comm' ? 'comm' : field;
    const diff = Number(a[key] || 0) - Number(b[key] || 0);
    return direction === 'asc' ? diff : -diff;
  });

  return (
    <div className="section">
      <div className="section-hd">
        <SearchInput value={search} onChange={setSearch}
                     placeholder="Tìm sản phẩm hoặc shop…" style={{ width: 240 }} />
        <select className="select sm" value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 180 }}>
          <option value="comm-desc">Hoa hồng giảm dần</option>
          <option value="comm-asc">Hoa hồng tăng dần</option>
          <option value="sold-desc">Đã bán giảm dần</option>
          <option value="sold-asc">Đã bán tăng dần</option>
          <option value="clicks-desc">Clicks giảm dần</option>
          <option value="clicks-asc">Clicks tăng dần</option>
          <option value="epc-desc">EPC giảm dần</option>
          <option value="epc-asc">EPC tăng dần</option>
        </select>
        <select className="select sm" value={hotBy} onChange={(e) => {
          const value = e.target.value;
          setHotBy(value);
          setSort(value + '-desc');
        }} style={{ width: 140 }}>
          <option value="comm">Hot theo hoa hồng</option>
          <option value="sold">Hot theo đã bán</option>
          <option value="epc">Hot theo EPC</option>
        </select>
        <div className="spacer" />
        <button className="btn sm" onClick={() => window.backendApi?.getProductAnalytics?.({}).then((res) => {
          if (res?.ok) navigator.clipboard?.writeText(JSON.stringify(res.data?.products || [], null, 2));
        })}><Icon name="download" size={12}/> Export</button>
      </div>
      <Subtabs tabs={[
        { value: 'hot', label: 'Sản phẩm Hot' },
        { value: 'top', label: 'Bán chạy nhất' },
      ]} value={sub} onChange={setSub} />
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Sản phẩm</th>
              <th>Shop</th>
              <th>Danh mục</th>
              <th className="num">Đã bán</th>
              <th className="num">Clicks</th>
              <th className="num">Hoa hồng (đ)</th>
              <th className="num">EPC</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.idx}>
                <td className="dim mono">{p.idx}</td>
                <td className="truncate" style={{ maxWidth: 260, fontWeight: 500 }}>{p.name}</td>
                <td className="dim">{p.shop}</td>
                <td><Badge>{p.category}</Badge></td>
                <td className="num mono">{p.sold}</td>
                <td className="num mono">{p.clicks}</td>
                <td className="num mono"><b style={{ color: 'var(--ok)' }}>{fmt.vnd(p.comm)}</b></td>
                <td className="num mono">{fmt.vnd(p.epc)}</td>
              </tr>
            ))}
            {filtered.length === 0 && <TableEmptyRow colSpan={8} />}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)',
        background: 'var(--bg-elev)', fontSize: 'var(--font-xs)', color: 'var(--fg-faint)' }}>
        Clicks theo sản phẩm đang hiển thị 0 khi dữ liệu Shopee click không có item_id để đối soát sản phẩm.
      </div>
    </div>
  );
}

window.TabRevenue = TabRevenue;

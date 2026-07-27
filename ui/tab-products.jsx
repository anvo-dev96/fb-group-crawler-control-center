/* tab-products.jsx — product warehouse */

// Giữ subtab đang xem khi đổi tab (component bị unmount/remount).
const _productsState = { sub: 'ready', sortKey: '', sortDir: 'asc' };

// ── Resizable column hook ──────────────────────────────────────────────────
// widths[i] = null  → column uses 'auto' (grows to fill space)
// widths[i] = N     → column has explicit min-width N px (user can drag to change)
function useColResize(defaults) {
  const [widths, setWidths] = React.useState(defaults);

  const startResize = React.useCallback((idx, e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[idx] ?? 80;

    const onMove = (ev) => {
      const newW = Math.max(60, startW + (ev.clientX - startX));
      setWidths((prev) => { const n = [...prev]; n[idx] = newW; return n; });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [widths]);

  return [widths, startResize];
}

function ResizableTh({ children, width, onResizeStart, className, style, onClick, title }) {
  return (
    <th className={className} style={{
      position: 'relative',
      width: width ?? undefined,
      minWidth: width ?? 80,
      ...style,
    }} onClick={onClick} title={title}>
      {children}
      {onResizeStart && (
        <div
          onMouseDown={onResizeStart}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: 6,
            cursor: 'col-resize', userSelect: 'none', zIndex: 1,
          }}
        />
      )}
    </th>
  );
}

function ProductSortIndicator({ active, dir }) {
  const up = active && dir === 'asc';
  const down = active && dir === 'desc';
  return (
    <span className="sort-ind">
      <svg viewBox="0 0 8 5" style={{ opacity: up ? 1 : 0.35 }}>
        <path d="M0 5L4 0L8 5Z" fill="currentColor" />
      </svg>
      <svg viewBox="0 0 8 5" style={{ opacity: down ? 1 : 0.35 }}>
        <path d="M0 0L4 5L8 0Z" fill="currentColor" />
      </svg>
    </span>
  );
}

const PAGE_SIZE = 50;
const PRODUCT_SORT_KEYS = { keyword: true, name: true, url: true, category: true, demand: true };

function productNameFromShopeeUrl(value) {
  const rawUrl = String(value || '').trim();
  if (!rawUrl || !/-i\.\d+\.\d+(?:$|[?#])/i.test(rawUrl)) return '';
  try {
    const parsed = new URL(rawUrl);
    const last = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
    return last.replace(/-i\.\d+\.\d+.*$/i, '').replace(/[-_]+/g, ' ').trim();
  } catch (_) {
    return '';
  }
}

// API kho dùng field SQLite (product_name, demand_count, pending_link), còn bảng UI
// dùng name, demand, pending. Luôn chuẩn hóa trước khi thay snapshot đang hiển thị.
function normalizeBackendProduct(entry, index) {
  const raw = entry && typeof entry === 'object' ? entry : {};
  const rawStatus = String(raw.status || '').toLowerCase();
  const status = rawStatus === 'skipped' || rawStatus === 'ignored'
    ? 'skipped'
    : rawStatus === 'pending' || rawStatus === 'pending_link'
      ? 'pending'
      : (raw.url ? 'ready' : 'pending');
  const keyword = raw.keyword || raw.product_name || raw.name || '';
  const storedName = String(raw.product_name || raw.name || '').trim();
  const urlName = productNameFromShopeeUrl(raw.original_url || raw.url);
  return {
    ...raw,
    id: raw.id ?? index + 1,
    keyword,
    name: storedName && storedName !== String(keyword).trim() ? storedName : (urlName || storedName || keyword),
    status,
    url: raw.url || '',
    category: raw.category || null,
    demand: Number(raw.demand_count ?? raw.demand ?? raw.use_count ?? 0) || 0,
  };
}

function TabProducts({ dataVersion = 0, forcedSub = '' }) {
  const [items, setItems] = React.useState(buildProducts);
  const [sub, _setSub] = React.useState(_productsState.sub);
  const setSub = React.useCallback((v) => { _productsState.sub = v; _setSub(v); }, []);
  const [sortKey, _setSortKey] = React.useState(PRODUCT_SORT_KEYS[_productsState.sortKey] ? _productsState.sortKey : '');
  const [sortDir, _setSortDir] = React.useState(_productsState.sortDir || 'asc');
  const setSortState = React.useCallback((key, dir) => {
    _productsState.sortKey = key;
    _productsState.sortDir = dir;
    _setSortKey(key);
    _setSortDir(dir);
  }, []);
  const [search, setSearch] = React.useState('');
  const [statusF, setStatusF] = React.useState('all');
  const [industryF, setIndustryF] = React.useState('all');
  const [selected, setSelected] = React.useState(new Set());
  const [autoStore, setAutoStore] = React.useState(true);
  const [showAdd, setShowAdd] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const [backlog, setBacklog] = React.useState({ status: 'idle', message: '', done: 0, total: 0 });
  const [refreshState, setRefreshState] = React.useState({ loading: false, error: '' });
  const [showMoreMenu, setShowMoreMenu] = React.useState(false);
  const [confirmAction, setConfirmAction] = React.useState(null);
  const moreMenuRef = React.useRef(null);
  const didMountRef = React.useRef(false);
  const suppressSaveRef = React.useRef(false);
  const itemsRef = React.useRef(items);
  const productFiltersReadyRef = React.useRef(false);
  const appDialog = useAppDialog();

  React.useEffect(() => {
    if (forcedSub && forcedSub !== sub) setSub(forcedSub);
  }, [forcedSub, sub, setSub]);

  React.useEffect(() => { itemsRef.current = items; }, [items]);

  const reloadProducts = React.useCallback(async () => {
    const api = window.backendApi;
    if (!api?.connected || typeof api.getProducts !== 'function') {
      setRefreshState({ loading: false, error: 'Backend chưa sẵn sàng, chưa thể tải lại kho sản phẩm.' });
      return false;
    }
    setRefreshState({ loading: true, error: '' });
    try {
      const res = await api.getProducts();
      const rawProducts = res?.data?.products;
      const count = Number(res?.data?.count);
      if (!res?.ok || !Array.isArray(rawProducts)) {
        throw new Error(res?.error || 'Không nhận được danh sách sản phẩm hợp lệ.');
      }
      if (Number.isFinite(count) && count !== rawProducts.length) {
        throw new Error('Dữ liệu kho nhận về chưa đầy đủ. Danh sách hiện tại được giữ nguyên.');
      }
      if (rawProducts.length === 0 && itemsRef.current.length > 0) {
        throw new Error('Backend trả về kho trống bất thường. Danh sách hiện tại được giữ nguyên.');
      }
      const products = rawProducts.map(normalizeBackendProduct);
      // Snapshot từ backend không phải chỉnh sửa của người dùng: tuyệt đối không
      // để autosave gọi products_replace_all() sau Refresh.
      suppressSaveRef.current = true;
      setItems(products);
      setSelected(new Set());
      setPage(0);
      setRefreshState({ loading: false, error: '' });
      return true;
    } catch (err) {
      setRefreshState({ loading: false, error: err?.message || 'Không tải lại được kho sản phẩm.' });
      return false;
    }
  }, []);

  // Tab Sản phẩm bị unmount khi đổi tab, nên mỗi lần mở lại sẽ lấy snapshot mới.
  // Bộ lọc hiện tại vẫn được áp dụng ngay trên danh sách vừa nhận.
  React.useEffect(() => { reloadProducts(); }, [reloadProducts]);

  // Đổi filter thì lấy snapshot kho mới; debounce tìm kiếm để không request mỗi ký tự.
  React.useEffect(() => {
    if (!productFiltersReadyRef.current) {
      productFiltersReadyRef.current = true;
      return undefined;
    }
    const timer = setTimeout(reloadProducts, 280);
    return () => clearTimeout(timer);
  }, [sub, search, statusF, industryF, reloadProducts]);

  // Đóng More menu khi click ra ngoài
  React.useEffect(() => {
    if (!showMoreMenu) return;
    const handler = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMoreMenu]);

  // Col widths: [checkbox, keyword, name, url, category, demand, actions]
  // null = auto-grow, number = fixed px (resizable)
  const [colWidths, startResize] = useColResize([32, 150, null, null, 130, 54, 110]);


  React.useEffect(() => {
    suppressSaveRef.current = true;
    setItems(buildProducts());
    setSelected(new Set());
    setPage(0);
  }, [dataVersion]);

  React.useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (suppressSaveRef.current) {
      suppressSaveRef.current = false;
      return;
    }
    if (window.backendApi?.connected) {
      clearTimeout(window.__productsSaveTimer);
      window.__productsSaveTimer = setTimeout(() => {
        window.backendApi.saveProducts(items);
      }, 500);
    }
  }, [items]);

  React.useEffect(() => {
    const onDataChanged = (event) => {
      const payload = event.detail || {};
      if (payload.type !== 'backlog') return;
      setBacklog((prev) => ({
        status: payload.status || 'idle',
        message: payload.message || '',
        done: payload.done != null ? payload.done : prev.done,
        total: payload.total != null ? payload.total : prev.total,
      }));
      if (payload.status === 'done' || payload.status === 'stopped') {
        // Chỉ nạp lại kho sản phẩm; không refresh orders/clicks/comments toàn app.
        reloadProducts();
      }
    };
    window.addEventListener('backend:data-changed', onDataChanged);
    return () => window.removeEventListener('backend:data-changed', onDataChanged);
  }, [reloadProducts]);

  const backlogActive = backlog.status === 'running' || backlog.status === 'paused' || backlog.status === 'stopping';

  const beginBacklog = () => {
    const api = window.backendApi;
    if (!api?.connected) {
      appDialog.alert({
        title: 'Backend chưa sẵn sàng',
        message: 'Chưa sẵn sàng backend. Thử lại sau giây lát.',
        icon: 'alert',
      });
      return;
    }
    setBacklog({ status: 'running', message: 'Đang khởi động...', done: 0, total: counts.pending || 0 });
    api.processBacklog?.().then((res) => {
      if (!res?.ok) {
        setBacklog({ status: 'error', message: res?.error || 'Không bắt đầu được.', done: 0, total: 0 });
        appDialog.alert({
          title: 'Không bắt đầu được',
          message: res?.error || 'Không bắt đầu được xử lý tồn kho.',
          icon: 'alert',
        });
      }
    });
  };
  const startBacklog = () => {
    if (!window.backendApi?.connected) {
      appDialog.alert({
        title: 'Backend chưa sẵn sàng',
        message: 'Chưa sẵn sàng backend. Thử lại sau giây lát.',
        icon: 'alert',
      });
      return;
    }
    setConfirmAction({
      type: 'backlog',
      title: 'Xử lý keyword tồn kho?',
      message: `Bot sẽ tìm Shopee và tạo affiliate link cho ${counts.pending || 0} keyword đang chờ link.`,
      confirmText: 'Xử lý tồn kho',
      icon: 'bot',
      danger: false,
    });
  };
  const filtered = items.filter((it) => {
    // Subtab filter
    if (sub === 'ready' && it.status !== 'ready') return false;
    if (sub === 'pending' && it.status === 'ready') return false;
    if (statusF !== 'all' && it.status !== statusF) return false;
    if (industryF !== 'all' && it.category !== industryF) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!it.keyword.toLowerCase().includes(s) &&
          !(it.name || '').toLowerCase().includes(s)) return false;
    }
    return true;
  });
  const sorted = React.useMemo(() => {
    if (!sortKey) return filtered;
    const valueOf = (item) => {
      if (sortKey === 'name') return item.name || item.keyword || '';
      if (sortKey === 'demand') return Number(item.demand || 0);
      return item[sortKey] || '';
    };
    return filtered.map((item, index) => ({ item, index })).sort((a, b) => {
      const av = valueOf(a.item);
      const bv = valueOf(b.item);
      let cmp;
      if (typeof av === 'number' || typeof bv === 'number') {
        cmp = Number(av || 0) - Number(bv || 0);
      } else {
        cmp = String(av || '').localeCompare(String(bv || ''), 'vi', { sensitivity: 'base' });
      }
      if (cmp === 0) cmp = a.index - b.index;
      return sortDir === 'asc' ? cmp : -cmp;
    }).map((entry) => entry.item);
  }, [filtered, sortKey, sortDir]);

  const clickSort = (key) => {
    if (sortKey === key) {
      setSortState(key, sortDir === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortState(key, key === 'demand' ? 'desc' : 'asc');
  };

  const ProductSortHeader = ({ k, children, width, resizeIdx, num, style }) => {
    const active = sortKey === k;
    const content = num ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        <ProductSortIndicator active={active} dir={sortDir} />{children}
      </span>
    ) : (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        {children}<ProductSortIndicator active={active} dir={sortDir} />
      </span>
    );
    return (
      <ResizableTh
        width={width}
        onResizeStart={resizeIdx != null ? (e) => startResize(resizeIdx, e) : null}
        className={'sortable' + (active ? ' active' : '') + (num ? ' num' : '')}
        style={style}
        title="Bấm để sắp xếp, kéo mép phải để đổi độ rộng"
        onClick={() => clickSort(k)}>
        {content}
      </ResizableTh>
    );
  };

  // Reset trang khi filter/sub thay đổi
  React.useEffect(() => { setPage(0); }, [sub, search, statusF, industryF, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const counts = {
    total: items.length,
    pending: items.filter((i) => i.status === 'pending').length,
    ready: items.filter((i) => i.status === 'ready').length,
    skipped: items.filter((i) => i.status === 'skipped').length,
    demand: items.reduce((a, i) => a + (i.demand || 0), 0),
  };

  const removeOne = (id) => setItems((p) => p.filter((i) => i.id !== id));
  const requestRemoveOne = (item) => {
    if (!item) return;
    setConfirmAction({
      type: 'delete-one',
      item,
      title: 'Xóa sản phẩm?',
      message: `Bạn có chắc muốn xóa "${item.keyword}" khỏi kho sản phẩm không?`,
      confirmText: 'Xóa sản phẩm',
      icon: 'trash',
      danger: true,
    });
  };
  const requestRemoveSelected = () => {
    const picked = items.filter((i) => selected.has(i.id));
    if (!picked.length) return;
    setConfirmAction({
      type: 'delete-bulk',
      items: picked,
      title: 'Xóa các sản phẩm đã chọn?',
      message: `Bạn có chắc muốn xóa ${picked.length} sản phẩm đã chọn khỏi kho sản phẩm không?`,
      confirmText: 'Xóa sản phẩm',
      icon: 'trash',
      danger: true,
    });
  };
  const confirmCurrentAction = () => {
    const action = confirmAction;
    if (!action) return;
    setConfirmAction(null);

    if (action.type === 'backlog') {
      beginBacklog();
      return;
    }

    if (action.type === 'delete-one' && action.item) {
      window.backendApi?.deleteProduct?.(action.item.keyword);
      removeOne(action.item.id);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(action.item.id);
        return next;
      });
      return;
    }

    if (action.type === 'delete-bulk') {
      const picked = action.items || [];
      const ids = new Set(picked.map((i) => i.id));
      window.backendApi?.bulkDeleteProducts?.({ keywords: picked.map((i) => i.keyword) });
      setItems((p) => p.filter((i) => !ids.has(i.id)));
      setSelected(new Set());
    }
  };
  const moveToStore = (id) => setItems((p) => p.map((i) => i.id === id ? { ...i, status: 'ready' } : i));
  const updateField = (id, k, v) => setItems((p) => p.map((i) => i.id === id ? { ...i, [k]: v } : i));
  const toggleSelect = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const allSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));
  const toggleAll = (v) => {
    const next = new Set(selected);
    filtered.forEach((i) => { if (v) next.add(i.id); else next.delete(i.id); });
    setSelected(next);
  };

  return (
    <div className="tab-body">
      <div style={{
        flex: 'none', padding: 12,
        background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <SearchInput value={search} onChange={setSearch}
                     placeholder="Tìm keyword, sản phẩm, nhóm…" style={{ width: 260 }} />
        <select className="select sm" value={statusF} onChange={(e) => setStatusF(e.target.value)} style={{ width: 140 }}>
          <option value="all">Tất cả trạng thái</option>
          <option value="pending">Chờ link</option>
          <option value="ready">Sẵn sàng</option>
          <option value="skipped">Bỏ qua</option>
        </select>
        <select className="select sm" value={industryF} onChange={(e) => setIndustryF(e.target.value)} style={{ width: 160 }}>
          <option value="all">Tất cả ngành</option>
          {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <div className="spacer" />
        <button className="btn sm primary" onClick={() => setShowAdd(true)}>
          <Icon name="plus" size={12}/> Thêm
        </button>
        <div style={{ position: 'relative' }} ref={moreMenuRef}>
          <button className="btn sm ghost" onClick={() => setShowMoreMenu((v) => !v)}
                  title="Import / Export">
            <Icon name="more" size={14}/>
          </button>
          {showMoreMenu && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 200,
              background: 'var(--bg-elev)', border: '1px solid var(--border)',
              borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.18)',
              minWidth: 180, padding: '4px 0',
            }}>
              <button className="btn ghost" style={{ width: '100%', textAlign: 'left', padding: '8px 14px', borderRadius: 0, fontSize: 'var(--font-sm)' }}
                      onClick={async () => {
                        setShowMoreMenu(false);
                        const text = await appDialog.prompt({
                          title: 'Import sản phẩm',
                          message: 'Dán dữ liệu JSON/CSV sản phẩm để import.',
                          placeholder: 'keyword,name,url\n...',
                          confirmText: 'Import',
                          icon: 'upload',
                          multiline: true,
                          rows: 10,
                        });
                        if (text) window.backendApi?.importProducts?.(text).then((res) => {
                          if (res?.ok) reloadProducts();
                        });
                      }}>
                <Icon name="upload" size={13}/> <span style={{ marginLeft: 6 }}>Import sản phẩm</span>
              </button>
              <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }}/>
              <button className="btn ghost" style={{ width: '100%', textAlign: 'left', padding: '8px 14px', borderRadius: 0, fontSize: 'var(--font-sm)' }}
                      onClick={() => {
                        setShowMoreMenu(false);
                        window.backendApi?.exportProductsFiltered?.({ format: 'csv' });
                      }}>
                <Icon name="download" size={13}/> <span style={{ marginLeft: 6 }}>Export CSV (đang hiển thị)</span>
              </button>
              <button className="btn ghost" style={{ width: '100%', textAlign: 'left', padding: '8px 14px', borderRadius: 0, fontSize: 'var(--font-sm)' }}
                      onClick={() => {
                        setShowMoreMenu(false);
                        window.backendApi?.exportProductsFiltered?.({ format: 'csv', status: 'pending_link' });
                      }}>
                <Icon name="download" size={13}/> <span style={{ marginLeft: 6 }}>Export CSV (chờ link)</span>
              </button>
            </div>
          )}
        </div>
        <button className="btn sm" disabled={backlogActive || counts.pending === 0}
                title="Tìm Shopee + tạo affiliate link cho keyword đang chờ link"
                onClick={startBacklog}>
          {backlogActive
            ? 'Đang xử lý tồn kho…'
            : `Xử lý tồn kho${counts.pending ? ` (${counts.pending})` : ''}`}
        </button>
        <button className="btn sm ghost" disabled={refreshState.loading} onClick={reloadProducts}>
          <Icon name="refresh" size={12}/> {refreshState.loading ? 'Đang tải...' : 'Refresh'}
        </button>
      </div>
      {refreshState.error && (
        <div style={{ flex: 'none', padding: '6px 14px', color: 'var(--danger)', fontSize: 'var(--font-xs)' }}>
          {refreshState.error}
        </div>
      )}

      <div style={{
        flex: 'none', padding: '8px 14px',
        background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 14, alignItems: 'center',
      }}>
        <Checkbox checked={autoStore} onChange={setAutoStore}
                  label="Tự động chuyển vào kho khi nhập link" />
        <div className="divider" style={{ alignSelf: 'stretch' }} />
        <Checkbox checked={allSelected} indeterminate={selected.size > 0 && !allSelected}
                  onChange={toggleAll} label="Chọn tất cả trong tab hiện tại" />
        {selected.size > 0 && (
          <button className="btn sm danger" onClick={requestRemoveSelected}>
            <Icon name="trash" size={12}/> Xóa đã chọn ({selected.size})
          </button>
        )}
        <div className="spacer" />
        <div style={{ fontSize: 'var(--font-xs)', color: 'var(--fg-muted)',
          display: 'flex', gap: 14, fontVariantNumeric: 'tabular-nums' }}>
          <span>Tổng: <b style={{ color: 'var(--fg)' }}>{counts.total}</b></span>
          <span style={{ color: 'var(--warn)' }}>Chờ link: <b>{counts.pending}</b></span>
          <span style={{ color: 'var(--ok)' }}>Sẵn sàng: <b>{counts.ready}</b></span>
          <span>Bỏ qua: <b style={{ color: 'var(--fg)' }}>{counts.skipped}</b></span>
          <span>Nhu cầu: <b style={{ color: 'var(--accent)' }}>{counts.demand}</b></span>
          <span>Kết quả: <b style={{ color: 'var(--fg)' }}>{filtered.length}</b></span>
        </div>
      </div>

      {!forcedSub && (
        <Subtabs
          tabs={[
            { value: 'ready', label: 'Kho sản phẩm', count: counts.ready },
            { value: 'pending', label: 'Từ khóa chờ link', count: counts.pending + counts.skipped },
          ]}
          value={sub}
          onChange={setSub}
        />
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="tbl products-table" style={{ tableLayout: 'auto', width: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-elev)' }}>
            <tr>
              <th style={{ width: 32, minWidth: 32 }}></th>
              <ProductSortHeader k="keyword" width={colWidths[1]} resizeIdx={1}>Keyword</ProductSortHeader>
              <ProductSortHeader k="name" width={colWidths[2]} resizeIdx={2} style={{ minWidth: 160 }}>Tên sản phẩm</ProductSortHeader>
              <ProductSortHeader k="url" width={colWidths[3]} resizeIdx={3} style={{ minWidth: 180 }}>URL</ProductSortHeader>
              <ProductSortHeader k="category" width={colWidths[4]} resizeIdx={4}>Ngành hàng</ProductSortHeader>
              <ProductSortHeader k="demand" width={54} num style={{ textAlign: 'center' }}>Nhu cầu</ProductSortHeader>
              <th style={{ width: 110, minWidth: 110 }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((it) => (
              <ProductRow key={it.id} it={it}
                          selected={selected.has(it.id)}
                          onToggle={() => toggleSelect(it.id)}
                          onUpdate={(k, v) => updateField(it.id, k, v)}
                          onMoveStore={() => {
                            window.backendApi?.promoteProductToReady?.({ keyword: it.keyword });
                            moveToStore(it.id);
                          }}
                          onRemove={() => {
                            requestRemoveOne(it);
                          }} />
            ))}
            {filtered.length === 0 && (
              <TableEmptyRow colSpan={7} padding={32} />
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          flex: 'none', padding: '8px 14px',
          borderTop: '1px solid var(--border)', background: 'var(--bg-elev)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <button className="btn sm" disabled={safePage === 0} onClick={() => setPage(0)}>«</button>
          <button className="btn sm" disabled={safePage === 0} onClick={() => setPage((p) => p - 1)}>‹</button>
          <span style={{ fontSize: 'var(--font-xs)', color: 'var(--fg-muted)', padding: '0 6px' }}>
            Trang <b style={{ color: 'var(--fg)' }}>{safePage + 1}</b> / {totalPages}
            <span style={{ marginLeft: 10 }}>
              ({safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} / {filtered.length})
            </span>
          </span>
          <button className="btn sm" disabled={safePage >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>›</button>
          <button className="btn sm" disabled={safePage >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</button>
        </div>
      )}

      {showAdd && <AddProductDialog onClose={() => setShowAdd(false)}
                                    onAdd={(p) => { setItems((prev) => [{ ...p, id: Date.now() }, ...prev]); setShowAdd(false); }} />}
      {confirmAction && (
        <Dialog title={confirmAction.title} onClose={() => setConfirmAction(null)} width={460}
                footer={<>
                  <button className="btn" onClick={() => setConfirmAction(null)}>Hủy</button>
                  <button className={'btn ' + (confirmAction.danger ? 'danger' : 'primary')} onClick={confirmCurrentAction}>
                    <Icon name={confirmAction.icon || 'check'} size={12}/> {confirmAction.confirmText || 'Xác nhận'}
                  </button>
                </>}>
          <div style={{ color: 'var(--fg-muted)', lineHeight: 1.6 }}>{confirmAction.message}</div>
        </Dialog>
      )}
    </div>
  );
}

function ProductRow({ it, selected, onToggle, onUpdate, onMoveStore, onRemove }) {
  const appDialog = useAppDialog();
  return (
    <tr className={selected ? 'selected' : ''}>
      <td><Checkbox checked={selected} onChange={onToggle} /></td>
      <td>
        <input className="input sm" style={{ height: 26, background: 'transparent', border: 0, padding: 0 }}
               value={it.keyword} onChange={(e) => onUpdate('keyword', e.target.value)} />
      </td>
      <td>
        <input className="input sm" style={{ height: 26, background: 'transparent', border: 0, padding: 0 }}
               value={it.name || ''} placeholder={'(dùng keyword)'}
               onChange={(e) => onUpdate('name', e.target.value)} />
      </td>
      <td>
        {it.url ? (
          <input className="input sm mono" style={{ height: 26, background: 'transparent', border: 0, padding: 0, color: 'var(--accent)' }}
                 value={it.url} onChange={(e) => onUpdate('url', e.target.value)} />
        ) : (
          <span className="dim-2">— chưa có link —</span>
        )}
      </td>
      <td>
        <select className="select sm" value={it.category || ''}
                onChange={(e) => onUpdate('category', e.target.value || null)}
                style={{ height: 26 }}>
          <option value="">—</option>
          {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </td>
      <td className="center mono">{it.demand || 0}</td>
      <td>
        <div className="row-actions">
          {!it.category && (
            <button className="btn sm ghost" data-tooltip="Phân loại bằng AI" aria-label="Phân loại bằng AI"
                    onClick={() => window.backendApi?.classifyProduct?.({ keyword: it.keyword, product_name: it.name }).then((res) => {
                      if (res?.ok && res.data?.category) onUpdate('category', res.data.category);
                    })}
                    style={{ color: 'var(--accent)' }}>
              <Icon name="bot" size={12} />
            </button>
          )}
          {it.url && (
            <button className="btn sm ghost" data-tooltip="Mở link" aria-label="Mở link" onClick={() => openBackendLink('product', it.url, appDialog)}>
              <Icon name="external" size={12} />
            </button>
          )}
          {it.url && it.status !== 'ready' && (
            <button className="btn sm" onClick={onMoveStore} data-tooltip="Cập nhật vào kho" aria-label="Cập nhật vào kho">
              <Icon name="check" size={12} />
            </button>
          )}
          <button className="btn sm ghost" onClick={onRemove} data-tooltip="Xóa" aria-label="Xóa">
            <Icon name="trash" size={12} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function AddProductDialog({ onClose, onAdd }) {
  const [kw, setKw] = React.useState('');
  const [name, setName] = React.useState('');
  const [url, setUrl] = React.useState('');
  const [autoCat, setAutoCat] = React.useState(true);

  const submit = () => {
    if (!kw.trim()) return;
    onAdd({
      keyword: kw, name: name || '', url,
      category: null, demand: 1,
      status: url ? 'ready' : 'pending',
    });
  };

  return (
    <Dialog title="Thêm sản phẩm vào kho" onClose={onClose} width={560}
            footer={<>
              <button className="btn" onClick={onClose}>Huỷ</button>
              <button className="btn primary" onClick={submit} disabled={!kw.trim()}>Thêm vào kho</button>
            </>}>
      <FieldRow label="Keyword" help="Bắt buộc — keyword này sẽ được match khi quét bài.">
        <input className="input" value={kw} placeholder="vd: tai nghe bluetooth sony"
               onChange={(e) => setKw(e.target.value)} autoFocus />
      </FieldRow>
      <FieldRow label="Tên sản phẩm" help="Để trống sẽ dùng keyword làm tên.">
        <input className="input" value={name} placeholder="(dùng keyword)"
               onChange={(e) => setName(e.target.value)} />
      </FieldRow>
      <FieldRow label="URL Shopee" help="Link affiliate hoặc link sản phẩm gốc.">
        <input className="input" value={url} placeholder="https://shopee.vn/..."
               onChange={(e) => setUrl(e.target.value)} />
      </FieldRow>
      <FieldRow label="Tuỳ chọn">
        <Checkbox checked={autoCat} onChange={setAutoCat}
                  label="Tự động phân loại ngành hàng bằng AI" />
      </FieldRow>
    </Dialog>
  );
}

window.TabProducts = TabProducts;

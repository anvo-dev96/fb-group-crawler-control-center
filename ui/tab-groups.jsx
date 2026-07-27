/* tab-groups.jsx — FB Groups list + analytics */

// Giữ lại khi đổi tab (TabGroups bị unmount/remount): subtab đang xem + cụm đang chọn.
const _tabGroupsState = { sub: 'list', collectionsActiveId: null, surveyActiveId: null, statsNameColWidth: 360, statsCache: null };

// ── Tiny checkbox: plain <input> (không stopPropagation) để click bubble lên <td> ──
function SelCheckbox({ checked }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      readOnly
      style={{ pointerEvents: 'none', margin: 0, cursor: 'pointer', accentColor: 'var(--accent)' }}
    />
  );
}

// ── GroupRow: memoized để chỉ dòng có thay đổi mới render lại ──
// Tất cả handler nhận vào đều là useCallback ổn định ở TabGroups, nên khi tick
// checkbox/chọn nhóm chỉ những dòng đổi prop (g, isSel, drag…) mới re-render.
const GroupRow = React.memo(function GroupRow({
  g, realIdx, isSel, isDragging, isOver, dropPos, isEditingUrl, draggableOn,
  onSelClick, onToggle, onEditUrl, onSaveUrl, onCancelEdit,
  onDragStart, onDragOver, onDrop, onDragEnd, onTogglePaused, onRequestRemove, onOpenLink,
}) {
  const isPaused = !!g.paused;
  let cls = isSel ? 'selected' : '';
  if (isDragging) cls += ' dragging-row';
  if (isOver && dropPos === 'before') cls += ' drop-before';
  if (isOver && dropPos === 'after') cls += ' drop-after';
  if (isPaused) cls += ' paused-row';
  const lastScanText = isPaused ? `Tạm dừng từ ${g.pausedAt || ''}` : g.lastScan;
  return (
    <tr key={g.id}
        className={cls}
        style={{
          opacity: isPaused ? 0.5 : (g.enabled ? (isDragging ? 0.4 : 1) : 0.55),
          filter: isPaused ? 'grayscale(0.6)' : 'none',
        }}
        draggable={draggableOn && !isPaused}
        onDragStart={() => !isPaused && onDragStart(realIdx)}
        onDragOver={(e) => !isPaused && onDragOver(e, realIdx)}
        onDrop={() => !isPaused && onDrop(realIdx)}
        onDragEnd={onDragEnd}>
      {/* SelCheckbox: bỏ qua nhóm đang tạm dừng */}
      <td onClick={(e) => !isPaused && onSelClick(g.id, e)}
          style={{ cursor: isPaused ? 'default' : 'pointer', userSelect: 'none' }}>
        {!isPaused && <SelCheckbox checked={isSel} />}
      </td>
      <td><span className="drag-handle" title={isPaused ? '' : 'Kéo để đổi thứ tự'}
                style={{ opacity: isPaused ? 0.2 : 1 }} /></td>
      <td className="group-run-col"><Checkbox checked={g.enabled} onChange={(v) => onToggle(g.id, v)} disabled={isPaused} /></td>
      <td className="mono dim">{g.id}</td>
      <td className="truncate" title={g.name} style={{ fontWeight: 500 }}>{g.name}</td>
      <td className="mono dim truncate editable-url-cell"
          title={isPaused ? g.url : 'Double click để chỉnh sửa URL'}
          onDoubleClick={(e) => { if (isPaused) return; e.stopPropagation(); onEditUrl(g.id); }}>
        {!isPaused && isEditingUrl ? (
          <InlineEditInput value={g.url} className="mono"
                           onSave={(value) => onSaveUrl(g.id, value)}
                           onCancel={onCancelEdit} />
        ) : g.url}
      </td>
      <td className="dim truncate" title={lastScanText}
          style={{ color: isPaused ? 'var(--fg-muted)' : undefined, fontStyle: isPaused ? 'italic' : undefined }}>
        {lastScanText}
      </td>
      <td>
        <div className="row-actions">
          <button className="btn sm ghost" data-tooltip="Mở nhóm" aria-label="Mở nhóm"
                  onClick={() => onOpenLink(g.url)}>
            <Icon name="external" size={12}/>
          </button>
          <button className="btn sm ghost"
                  data-tooltip={isPaused ? 'Tiếp tục nhóm' : 'Tạm dừng nhóm'}
                  aria-label={isPaused ? 'Tiếp tục nhóm' : 'Tạm dừng nhóm'}
                  style={{ color: isPaused ? 'var(--accent)' : 'var(--fg-muted)' }}
                  onClick={() => onTogglePaused(g)}>
            <Icon name={isPaused ? 'play' : 'pause'} size={12}/>
          </button>
          <button className="btn sm ghost" data-tooltip="Xóa" aria-label="Xóa"
                  onClick={() => onRequestRemove(g.id)}>
            <Icon name="trash" size={12}/>
          </button>
        </div>
      </td>
    </tr>
  );
});

function groupDateInputValue(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function groupDaysAgoValue(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return groupDateInputValue(d);
}

function TabGroups({ active = false, dataVersion = 0, botStatus = 'idle', botScope = null, runningGroupUrl = '', forcedSub = '' }) {
  const [sub, _setSub] = React.useState(_tabGroupsState.sub);
  const setSub = React.useCallback((v) => { _tabGroupsState.sub = v; _setSub(v); }, []);
  const [groups, setGroups] = React.useState([]);
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState(new Set());

  // Drag state (same pattern as original — single draggingIdx for tracking)
  const [draggingIdx, setDraggingIdx] = React.useState(null);
  const [overIdx, setOverIdx] = React.useState(null);
  const [dropPos, setDropPos] = React.useState(null); // 'before' | 'after'

  const [actionFilter, setActionFilter] = React.useState('all');
  const [newUrl, setNewUrl] = React.useState('');
  const [showImport, setShowImport] = React.useState(false);
  const [showBulkDelete, setShowBulkDelete] = React.useState(false);
  const [showExport, setShowExport] = React.useState(false);
  const [exportType, setExportType] = React.useState('all');
  const [importText, setImportText] = React.useState('');
  const [bulkDeleteText, setBulkDeleteText] = React.useState('');
  const [confirmDelete, setConfirmDelete] = React.useState(null);
  const [groupColWidths, setGroupColWidths] = React.useState({ name: 300, url: 320, lastScan: 160 });
  const [editingCell, setEditingCell] = React.useState(null);
  const didMountRef = React.useRef(false);
  const skipSaveRef = React.useRef(false);
  const groupsActiveRef = React.useRef(false);
  const groupFiltersReadyRef = React.useRef(false);
  const appDialog = useAppDialog();

  // Shift-click: track last clicked id
  const lastClickedIdRef = React.useRef(null);

  React.useEffect(() => {
    if (forcedSub && forcedSub !== sub) setSub(forcedSub);
  }, [forcedSub, sub, setSub]);

  const setGroupsFromBackend = React.useCallback((data) => {
    skipSaveRef.current = true;
    setGroups(data);
    setSelected(new Set()); // xóa selection khi reload từ backend tránh stale id
  }, []);

  const reloadGroupsFromServer = React.useCallback(() => {
    if (!window.backendApi?.loadGroups) return Promise.resolve(false);
    return window.backendApi.loadGroups().then((res) => {
      if (res?.ok && Array.isArray(res.data?.groups)) {
        setGroupsFromBackend(res.data.groups);
        return true;
      }
      return false;
    }).catch(() => false);
  }, [setGroupsFromBackend]);

  const ensureGroupsServer = React.useCallback(() => {
    if (window.backendApi?.connected) return true;
    appDialog.alert({
      title: 'Backend chưa sẵn sàng',
      message: 'Danh sách nhóm Facebook giờ được quản lý hoàn toàn bằng server. Hãy bật backend rồi thử lại.',
      icon: 'alert',
    });
    return false;
  }, [appDialog]);

  const filtered = React.useMemo(() => {
    const s = search.toLowerCase();
    return groups.filter((g) => {
      if (actionFilter !== 'all' && g.action !== actionFilter) return false;
      return !s || g.name.toLowerCase().includes(s) || g.url.toLowerCase().includes(s);
    });
  }, [groups, search, actionFilter]);

  // Latest-value refs: cho phép các handler dùng useCallback([]) ổn định tham chiếu,
  // nhờ đó GroupRow (React.memo) không bị re-render khi handler "thay đổi" mỗi render.
  const groupsRef = React.useRef(groups); groupsRef.current = groups;
  const selectedRef = React.useRef(selected); selectedRef.current = selected;
  const filteredRef = React.useRef(filtered); filteredRef.current = filtered;
  const draggingIdxRef = React.useRef(draggingIdx); draggingIdxRef.current = draggingIdx;
  const dropPosRef = React.useRef(dropPos); dropPosRef.current = dropPos;
  const appDialogRef = React.useRef(appDialog); appDialogRef.current = appDialog;

  // Tab Nhóm FB vẫn mounted khi bị ẩn, nên nạp lại danh sách mỗi lần quay vào tab.
  React.useEffect(() => {
    if (!active || groupsActiveRef.current) {
      groupsActiveRef.current = active;
      return;
    }
    groupsActiveRef.current = true;
    window.backendApi?.ready?.then((ok) => {
      if (!ok) return;
      reloadGroupsFromServer();
    });
    const onBackendReady = (event) => {
      if (!active) return;
      if (!event.detail?.connected) return;
      reloadGroupsFromServer();
    };
    window.addEventListener('backend:ready', onBackendReady);
    return () => window.removeEventListener('backend:ready', onBackendReady);
  }, [active, reloadGroupsFromServer]);

  React.useEffect(() => {
    if (!active || !dataVersion) return;
    let isCurrent = true;
    if (window.backendApi?.connected && window.backendApi.loadGroups) {
      reloadGroupsFromServer().then((ok) => {
        if (isCurrent && ok) {
          setSelected(new Set());
        }
      });
    } else {
      setGroupsFromBackend([]);
      setSelected(new Set());
    }
    return () => { isCurrent = false; };
  }, [dataVersion, active, reloadGroupsFromServer, setGroupsFromBackend]);

  // Search/lọc thao tác chỉ làm mới danh sách nhóm, không kéo theo doanh thu/lịch sử.
  React.useEffect(() => {
    const listActive = active && sub === 'list';
    if (!listActive) {
      groupFiltersReadyRef.current = false;
      return undefined;
    }
    if (!groupFiltersReadyRef.current) {
      groupFiltersReadyRef.current = true;
      return undefined;
    }
    const timer = setTimeout(() => {
      if (!window.backendApi?.connected || !window.backendApi.loadGroups) return;
      reloadGroupsFromServer();
    }, 280);
    return () => clearTimeout(timer);
  }, [active, sub, search, actionFilter, reloadGroupsFromServer]);

  // Debounce saveGroups: mỗi lần tick checkbox "Chạy" sẽ setGroups → nếu lưu ngay
  // sẽ ghi lại TOÀN BỘ nhóm trong DB + reload mọi nơi, click nhiều phát = giật/lag.
  // Gộp các thay đổi liên tiếp thành một lần ghi sau 500ms ngừng thao tác.
  const saveTimerRef = React.useRef(null);
  const pendingSaveRef = React.useRef(null);
  const flushSave = React.useCallback(() => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    if (pendingSaveRef.current != null && window.backendApi?.connected) {
      const snapshot = pendingSaveRef.current;
      pendingSaveRef.current = null;
      const p = window.backendApi.saveGroups(snapshot);
      // Backend không còn emit dataChanged{groups} (tránh reload toàn cục gây đơ).
      // Chỉ đối chiếu khi backend thực sự chuẩn hoá/gộp dòng (đổi tập id) — lúc đó mới
      // thay state; tick enabled bình thường không đổi id nên không re-render cả bảng.
      p?.then?.((res) => {
        if (!res?.ok || !Array.isArray(res.data?.groups)) return;
        const cur = groupsRef.current;
        const next = res.data.groups;
        const same = cur.length === next.length && cur.every((g, i) => g.id === next[i].id);
        if (!same) setGroupsFromBackend(next);
      });
    }
  }, [setGroupsFromBackend]);
  React.useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    if (skipSaveRef.current) { skipSaveRef.current = false; return; }
    if (!window.backendApi?.connected) return;
    pendingSaveRef.current = groups;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushSave, 500);
  }, [groups, flushSave]);
  // Flush khi rời tab/unmount để không mất thao tác vừa click trong 500ms cuối.
  React.useEffect(() => () => flushSave(), [flushSave]);

  // select-all / toggle-all chỉ áp dụng cho nhóm KHÔNG bị tạm dừng
  const selectableFiltered = filtered.filter((g) => !g.paused);
  const allSelected = selectableFiltered.length > 0 && selectableFiltered.every((g) => g.enabled);
  const someSelected = selectableFiltered.some((g) => g.enabled) && !allSelected;
  const toggleAll = (v) => {
    setGroups((p) => p.map((g) => (!g.paused && filtered.find((f) => f.id === g.id)) ? { ...g, enabled: v } : g));
  };
  const toggle = React.useCallback((id, v) => setGroups((p) => p.map((g) => g.id === id ? { ...g, enabled: v } : g)), []);

  const togglePaused = React.useCallback((g) => {
    const newPaused = !g.paused;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const pausedAt = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${now.getDate()}/${now.getMonth() + 1}`;
    // skipSaveRef để setGroups không trigger saveGroups — paused chỉ lưu qua toggleGroupPaused
    skipSaveRef.current = true;
    setGroups((p) => p.map((gr) => gr.id === g.id ? { ...gr, paused: newPaused, pausedAt } : gr));
    if (window.backendApi?.connected && window.backendApi.toggleGroupPaused) {
      window.backendApi.toggleGroupPaused({ url: g.url, paused: newPaused });
    }
  }, []);
  const setGroupField = React.useCallback((id, field, value) => {
    setGroups((p) => p.map((g) => g.id === id ? { ...g, [field]: value } : g));
    setEditingCell(null);
  }, []);
  const onEditUrl = React.useCallback((id) => setEditingCell({ id, field: 'url' }), []);
  const onCancelEdit = React.useCallback(() => setEditingCell(null), []);
  const onSaveUrl = React.useCallback((id, value) => setGroupField(id, 'url', String(value || '').trim()), [setGroupField]);
  const onOpenLink = React.useCallback((url) => openBackendLink('group', url, appDialogRef.current), []);

  const exportUrls = React.useMemo(() => {
    const source = exportType === 'selected'
      ? groups.filter((g) => selected.has(g.id))
      : exportType === 'filtered' ? filtered : groups;
    return source.map((g) => cleanGroupUrl(g.url)).filter(Boolean);
  }, [groups, filtered, selected, exportType]);
  const exportText = exportUrls.join('\n');
  const copyExportUrls = () => {
    if (!exportText) return;
    if (copyToClipboard(exportText)) {
      appDialog.alert({ title: 'Đã copy danh sách group', message: `Đã copy ${exportUrls.length} link vào clipboard.`, icon: 'success' });
    } else {
      appDialog.alert({ title: 'Không copy được', message: 'Không thể sao chép danh sách group. Hãy bôi đen nội dung rồi nhấn Ctrl+C.', icon: 'alert' });
    }
  };

  // ── Multi-select: click trực tiếp trên <td> (bypass Checkbox.stopPropagation) ──
  const handleSelClick = React.useCallback((id, e) => {
    e.stopPropagation();
    const isCtrl = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;

    if (isShift && lastClickedIdRef.current != null) {
      const ids = filteredRef.current.map((g) => g.id);
      const a = ids.indexOf(lastClickedIdRef.current);
      const b = ids.indexOf(id);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelected((prev) => {
          const next = new Set(prev);
          for (let i = lo; i <= hi; i++) next.add(ids[i]);
          return next;
        });
        return; // không cập nhật lastClickedId khi shift
      }
    }

    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    lastClickedIdRef.current = id;
  }, []);

  const requestRemove = React.useCallback((id) => {
    const group = groupsRef.current.find((g) => g.id === id);
    if (!group) return;
    setConfirmDelete({ type: 'single', ids: [id], title: 'Xóa nhóm Facebook?', message: `Bạn có chắc muốn xóa nhóm "${group.name}" khỏi danh sách preview không?` });
  }, []);
  const requestRemoveSelected = () => {
    if (selected.size === 0) return;
    setConfirmDelete({ type: 'bulk', ids: [...selected], title: 'Xóa các nhóm đã chọn?', message: `Bạn có chắc muốn xóa ${selected.size} nhóm đã chọn không?` });
  };
  const confirmRemove = () => {
    if (!confirmDelete) return;
    const ids = new Set(confirmDelete.ids || []);
    const toDelete = groups.filter((g) => ids.has(g.id));
    setSelected((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
    setConfirmDelete(null);

    if (window.backendApi?.connected && window.backendApi.deleteGroup && toDelete.length > 0) {
      // Gọi deleteGroup trực tiếp theo URL — bỏ qua saveGroups để tránh stuck group
      const urls = toDelete.map((g) => g.url);
      const deleteSequential = (idx) => {
        if (idx >= urls.length) {
          // Các row đã được patch ngay sau từng response thành công; không
          // gọi loadGroups() vì endpoint này còn tính lại performance toàn bộ.
          return;
        }
        window.backendApi.deleteGroup({ url: urls[idx] }).then((res) => {
          if (res?.ok) {
            reloadGroupsFromServer();
          }
          deleteSequential(idx + 1);
        }).catch(() => deleteSequential(idx + 1));
      };
      deleteSequential(0);
    } else {
      ensureGroupsServer();
    }
  };

  // ── Drag: original single-idx approach, multi-move on drop ───
  const onDragStart = React.useCallback((realIdx) => setDraggingIdx(realIdx), []);

  const onDragOver = React.useCallback((e, realIdx) => {
    e.preventDefault();
    const dIdx = draggingIdxRef.current;
    const groups = groupsRef.current;
    if (dIdx == null) return;
    const draggedGroup = groups[dIdx];
    if (!draggedGroup) return;
    // Khi kéo multi, không cho drop vào dòng đang được kéo
    const selected = selectedRef.current;
    const movingIds = (selected.has(draggedGroup.id) && selected.size > 1)
      ? selected : new Set([draggedGroup.id]);
    const targetGroup = groups[realIdx];
    if (!targetGroup || movingIds.has(targetGroup.id)) {
      setOverIdx(null); setDropPos(null); return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
    setOverIdx(realIdx);
    setDropPos(pos);
  }, []);

  const onDrop = React.useCallback((realIdx) => {
    const dIdx = draggingIdxRef.current;
    const dPos = dropPosRef.current;
    const groups = groupsRef.current;
    if (dIdx == null || !dPos) {
      setDraggingIdx(null); setOverIdx(null); setDropPos(null); return;
    }
    const draggedGroup = groups[dIdx];
    if (!draggedGroup) { setDraggingIdx(null); setOverIdx(null); setDropPos(null); return; }

    const selected = selectedRef.current;
    const movingIds = (selected.has(draggedGroup.id) && selected.size > 1)
      ? selected : new Set([draggedGroup.id]);

    const targetGroup = groups[realIdx];
    if (!targetGroup || movingIds.has(targetGroup.id)) {
      setDraggingIdx(null); setOverIdx(null); setDropPos(null); return;
    }

    // Lấy các dòng di chuyển theo thứ tự gốc
    const movingItems = groups.filter((g) => movingIds.has(g.id));
    const rest = groups.filter((g) => !movingIds.has(g.id));
    let insertIdx = rest.findIndex((g) => g.id === targetGroup.id);
    if (insertIdx === -1) { setDraggingIdx(null); setOverIdx(null); setDropPos(null); return; }
    if (dPos === 'after') insertIdx += 1;
    rest.splice(insertIdx, 0, ...movingItems);
    setGroups(rest);
    setDraggingIdx(null); setOverIdx(null); setDropPos(null);
  }, []);

  const onDragEnd = React.useCallback(() => { setDraggingIdx(null); setOverIdx(null); setDropPos(null); }, []);

  // ── Column resize ─────────────────────────────────────────────
  const startColumnResize = (column) => (e) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const startWidth = groupColWidths[column];
    const limits = {
      name: { min: 200, max: 620 }, url: { min: 220, max: 720 }, lastScan: { min: 120, max: 320 },
    }[column];
    const move = (ev) => {
      const width = Math.max(limits.min, Math.min(limits.max, startWidth + ev.clientX - startX));
      setGroupColWidths((prev) => ({ ...prev, [column]: width }));
    };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  const groupRunColWidth = 44;
  const groupTableWidth = 28 + 36 + groupRunColWidth + 50 + groupColWidths.name + groupColWidths.url + 180 + groupColWidths.lastScan + 100;

  // Map id→index một lần (O(n)) thay cho groups.indexOf(g) mỗi row (O(n²)).
  const idxById = React.useMemo(() => {
    const m = new Map();
    groups.forEach((g, i) => m.set(g.id, i));
    return m;
  }, [groups]);
  // Tập id đang được kéo (chỉ tính 1 lần khi đang drag) thay vì tạo Set mỗi row.
  const movingIds = React.useMemo(() => {
    if (draggingIdx == null) return null;
    const dg = groups[draggingIdx];
    if (!dg) return null;
    return (selected.has(dg.id) && selected.size > 1) ? selected : new Set([dg.id]);
  }, [draggingIdx, groups, selected]);

  return (
    <div className="tab-body">
      {!forcedSub && (
        <Subtabs
          tabs={[
            { value: 'list', label: 'Danh sách nhóm', count: groups.length },
            { value: 'collections', label: 'Cụm nhóm' },
            { value: 'stats', label: 'Phân tích hiệu quả' },
            { value: 'survey', label: 'Khảo sát' },
          ]}
          value={sub}
          onChange={setSub}
        />
      )}
      <div className={'tab-content no-pad groups-tab-content' + (sub !== 'list' ? ' scrollable' : '')} style={{ padding: 16 }}>
        {sub === 'list' && (
          <div className="section groups-list-section">
            <div className="section-hd">
              <Checkbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll}
                        label="Chọn tất cả nhóm" />
              <span className="meta">
                {groups.filter((g) => g.enabled && !g.paused).length}/{groups.length} đang chạy
                {groups.filter((g) => g.paused).length > 0 && (
                  <span style={{ marginLeft: 6, color: 'var(--fg-muted)' }}>
                    · {groups.filter((g) => g.paused).length} tạm dừng
                  </span>
                )}
              </span>
              <div className="spacer" />
              <QuickFilter value={actionFilter} onChange={setActionFilter} options={[
                { value: 'all', label: `Tất cả (${groups.length})` },
                { value: 'comment', label: `Comment (${groups.filter((g) => g.action === 'comment').length})` },
                { value: 'telegram', label: `Telegram (${groups.filter((g) => g.action === 'telegram').length})` },
              ]} />
              <SearchInput value={search} onChange={setSearch}
                           placeholder="Tìm theo tên hoặc URL…" style={{ width: 260 }} />
              <button className="btn sm ghost" onClick={() => {
                if (window.backendApi?.connected && window.backendApi.loadGroups) {
                  reloadGroupsFromServer();
                } else {
                  ensureGroupsServer();
                }
              }}><Icon name="refresh" size={12}/> Refresh</button>
              <button className="btn sm" onClick={() => { setExportType(selected.size ? 'selected' : 'all'); setShowExport(true); }}>
                <Icon name="download" size={12}/> Xuất
              </button>
            </div>

            {/* Context bar khi đang chọn nhiều */}
            {selected.size > 0 && (
              <div style={{
                padding: '6px 14px', background: 'rgba(99,102,241,0.07)',
                borderBottom: '1px solid var(--border)',
                display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
                fontSize: 'var(--font-sm)',
              }}>
                <span style={{ color: 'var(--fg-muted)' }}>
                  <b style={{ color: 'var(--fg)' }}>{selected.size}</b> nhóm đang chọn
                  <span style={{ marginLeft: 10, fontSize: 'var(--font-xs)' }}>
                    · Shift+click chọn vùng · Kéo drag di chuyển tất cả
                  </span>
                </span>
                <div className="spacer" />
                <button className="btn sm" style={{ borderColor: '#f57c00', color: '#f57c00' }}
                        onClick={() => setGroups((p) => p.map((g) => (selected.has(g.id) && !g.paused) ? { ...g, action: 'comment' } : g))}>
                  → Comment ({selected.size})
                </button>
                <button className="btn sm" style={{ borderColor: '#1e88e5', color: '#1e88e5' }}
                        onClick={() => setGroups((p) => p.map((g) => (selected.has(g.id) && !g.paused) ? { ...g, action: 'telegram' } : g))}>
                  → Telegram ({selected.size})
                </button>
                <button className="btn sm danger" onClick={requestRemoveSelected}>
                  <Icon name="trash" size={12}/> Xóa ({selected.size})
                </button>
                <button className="btn sm ghost" onClick={() => { setSelected(new Set()); lastClickedIdRef.current = null; }}>
                  Bỏ chọn
                </button>
              </div>
            )}

            <div className="tbl-wrap">
              <table className="tbl groups-table" style={{ minWidth: groupTableWidth, tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 28 }} />
                  <col style={{ width: 36 }} />
                  <col style={{ width: groupRunColWidth }} />
                  <col style={{ width: 50 }} />
                  <col style={{ width: groupColWidths.name }} />
                  <col style={{ width: groupColWidths.url }} />
                  <col style={{ width: groupColWidths.lastScan }} />
                  <col style={{ width: 100 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th></th>
                    <th></th>
                    <th className="group-run-col">Chạy</th>
                    <th>ID</th>
                    <th className="resizable-th">
                      Tên nhóm
                      <span className="col-resizer" onMouseDown={startColumnResize('name')} />
                    </th>
                    <th className="resizable-th">
                      URL nhóm
                      <span className="col-resizer" onMouseDown={startColumnResize('url')} />
                    </th>
                    <th className="resizable-th">
                      Quét lần cuối
                      <span className="col-resizer" onMouseDown={startColumnResize('lastScan')} />
                    </th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((g) => {
                    const realIdx = idxById.get(g.id);
                    const isDragging = movingIds ? movingIds.has(g.id) : false;
                    const isOver = overIdx === realIdx && draggingIdx != null && !isDragging;
                    return (
                      <GroupRow
                        key={g.id}
                        g={g}
                        realIdx={realIdx}
                        isSel={selected.has(g.id)}
                        isDragging={isDragging}
                        isOver={isOver}
                        dropPos={isOver ? dropPos : null}
                        isEditingUrl={editingCell?.id === g.id && editingCell?.field === 'url'}
                        draggableOn={!editingCell}
                        onSelClick={handleSelClick}
                        onToggle={toggle}
                        onEditUrl={onEditUrl}
                        onSaveUrl={onSaveUrl}
                        onCancelEdit={onCancelEdit}
                        onDragStart={onDragStart}
                        onDragOver={onDragOver}
                        onDrop={onDrop}
                        onDragEnd={onDragEnd}
                        onTogglePaused={togglePaused}
                        onRequestRemove={requestRemove}
                        onOpenLink={onOpenLink}
                      />
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableEmptyRow colSpan={8} padding={32} />
                  )}
                </tbody>
              </table>
            </div>

            <div className="groups-add-bar" style={{
              padding: '12px 14px', borderTop: '1px solid var(--border)',
              display: 'flex', gap: 8, alignItems: 'center', background: 'var(--bg-elev)',
            }}>
              <input className="input" placeholder="Paste URL nhóm Facebook…"
                     value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
                     style={{ flex: 1 }} />
              <button className="btn primary" disabled={!newUrl.trim()}
                      onClick={() => {
                        const url = newUrl.trim();
                        if (!url) return;
                        if (window.backendApi?.connected && window.backendApi.addGroup) {
                          window.backendApi.addGroup(url).then(async (res) => {
                            if (res?.ok) { await reloadGroupsFromServer(); return; }
                            const blacklisted = res?.data?.blacklisted;
                            if (Array.isArray(blacklisted) && blacklisted.length > 0) {
                              const ok = await appDialog.confirm({
                                title: 'Nhóm nằm trong danh sách đen',
                                message: 'Nhóm này từng bị xóa khỏi danh sách nên đã được chặn để tránh thêm nhầm lại. Bạn vẫn muốn thêm? (Nhóm sẽ được xóa khỏi danh sách đen.)',
                                confirmText: 'Vẫn thêm',
                                icon: 'alert',
                              });
                              if (!ok) return;
                              window.backendApi.restoreBlacklistedGroups?.({ urls: blacklisted }).then((r2) => {
                                if (r2?.ok) reloadGroupsFromServer();
                              });
                            } else if (res && !res.ok && res.error) {
                              appDialog.alert({ title: 'Không thêm được nhóm', message: res.error, icon: 'alert' });
                            }
                          });
                        } else {
                          ensureGroupsServer();
                        }
                        setNewUrl('');
                      }}>
                <Icon name="plus" size={12}/> Thêm
              </button>
              <button className="btn" onClick={() => setShowImport(true)}>
                <Icon name="upload" size={12}/> Import nhiều
              </button>
              <button className="btn" onClick={() => setShowBulkDelete(true)}>
                <Icon name="trash" size={12}/> Xóa theo list
              </button>
            </div>
          </div>
        )}

        {sub === 'collections' && (
          <GroupCollections
            groups={groups}
            dataVersion={dataVersion}
            botStatus={botStatus}
            botScope={botScope}
            runningGroupUrl={runningGroupUrl}
          />
        )}

        {sub === 'stats' && (
          <GroupStats groups={groups} setGroups={setGroups}
                      active={active && sub === 'stats'} dataVersion={dataVersion} />
        )}

        {sub === 'survey' && (
          <GroupSurvey groups={groups} dataVersion={dataVersion} onGroupsChanged={setGroups} />
        )}
      </div>

      {showImport && (
        <Dialog title="Import nhiều nhóm Facebook" onClose={() => setShowImport(false)}
                footer={<>
                  <button className="btn" onClick={() => setShowImport(false)}>Huỷ</button>
                  <button className="btn primary" onClick={() => {
                    if (!ensureGroupsServer()) return;
                    if (!importText.trim()) {
                      appDialog.alert({
                        title: 'Chưa có dữ liệu import',
                        message: 'Hãy nhập mỗi dòng một link nhóm Facebook trước khi import.',
                        icon: 'alert',
                      });
                      return;
                    }
                    window.backendApi?.bulkImportGroups?.(importText).then(async (res) => {
                      if (res?.ok) {
                        await reloadGroupsFromServer();
                        setShowImport(false);
                        setImportText('');
                        const invalidLines = Array.isArray(res.data?.invalid_urls) ? res.data.invalid_urls : [];
                        const invalidPreview = invalidLines.length
                          ? `\n\nLink không hợp lệ:\n${invalidLines.slice(0, 8).join('\n')}${invalidLines.length > 8 ? '\n…' : ''}`
                          : '';
                        appDialog.alert({
                          title: 'Import hoàn tất',
                          message:
                            `Đã thêm ${fmt.num(res.data?.added || 0)} nhóm.` +
                            `\nBỏ qua ${fmt.num(res.data?.duplicates || 0)} nhóm đã có sẵn.` +
                            `\nKhông hợp lệ ${fmt.num(res.data?.invalid || 0)} dòng.` +
                            invalidPreview,
                          icon: 'success',
                        });
                        return;
                      }
                      appDialog.alert({
                        title: 'Không import được nhóm',
                        message: res?.error || 'Backend không trả về dữ liệu hợp lệ.',
                        icon: 'alert',
                      });
                    });
                  }}>Import</button>
                </>}>
          <div className="field">
            <label className="field-label">Mỗi dòng là một URL nhóm FB</label>
            <textarea className="textarea mono" rows={12} value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      placeholder="https://facebook.com/groups/group-1&#10;https://facebook.com/groups/group-2" />
          </div>
        </Dialog>
      )}
      {showBulkDelete && (
        <Dialog title="Xoá nhóm theo danh sách" onClose={() => setShowBulkDelete(false)}
                footer={<>
                  <button className="btn" onClick={() => setShowBulkDelete(false)}>Huỷ</button>
                  <button className="btn danger" onClick={() => {
                    if (!ensureGroupsServer()) return;
                    if (!bulkDeleteText.trim()) {
                      appDialog.alert({
                        title: 'Chưa có dữ liệu xóa',
                        message: 'Hãy nhập mỗi dòng một link nhóm Facebook cần xóa.',
                        icon: 'alert',
                      });
                      return;
                    }
                    window.backendApi?.bulkDeleteGroups?.(bulkDeleteText).then((res) => {
                      if (res?.ok) {
                        reloadGroupsFromServer();
                        setSelected(new Set());
                        setShowBulkDelete(false);
                        setBulkDeleteText('');
                        const invalidLines = Array.isArray(res.data?.invalid_urls) ? res.data.invalid_urls : [];
                        const missingLines = Array.isArray(res.data?.missing_urls) ? res.data.missing_urls : [];
                        const details = [];
                        if (missingLines.length) {
                          details.push(`\nKhông tìm thấy:\n${missingLines.slice(0, 8).join('\n')}${missingLines.length > 8 ? '\n…' : ''}`);
                        }
                        if (invalidLines.length) {
                          details.push(`\nLink không hợp lệ:\n${invalidLines.slice(0, 8).join('\n')}${invalidLines.length > 8 ? '\n…' : ''}`);
                        }
                        appDialog.alert({
                          title: 'Xóa theo list hoàn tất',
                          message:
                            `Đã xóa ${fmt.num(res.data?.deleted || 0)} nhóm.` +
                            `\nKhông tìm thấy ${fmt.num(res.data?.missing || 0)} nhóm.` +
                            `\nKhông hợp lệ ${fmt.num(res.data?.invalid || 0)} dòng.` +
                            details.join('\n'),
                          icon: 'trash',
                        });
                        return;
                      }
                      appDialog.alert({
                        title: 'Không xóa được nhóm',
                        message: res?.error || 'Backend không trả về dữ liệu hợp lệ.',
                        icon: 'alert',
                      });
                    });
                  }}>Xoá</button>
                </>}>
          <div className="field">
            <label className="field-label">Mỗi dòng là một URL nhóm cần xoá</label>
            <textarea className="textarea mono" rows={12} value={bulkDeleteText}
                      onChange={(e) => setBulkDeleteText(e.target.value)}
                      placeholder="https://facebook.com/groups/group-x" />
          </div>
        </Dialog>
      )}
      {showExport && (
        <Dialog title="Xuất danh sách group" width={680} onClose={() => setShowExport(false)}
                footer={<>
                  <button className="btn" onClick={() => setShowExport(false)}>Đóng</button>
                  <button className="btn" disabled={!exportText} onClick={copyExportUrls}>Copy</button>
                  <button className="btn primary" disabled={!exportText} onClick={() => {
                    if (!ensureGroupsServer()) return;
                    window.backendApi?.exportGroupsTxt?.({
                      urls: exportUrls,
                      filename: exportType === 'selected' ? 'group_da_chon.txt' : 'danh_sach_group.txt',
                    }).then((res) => {
                      if (res?.ok && !res.data?.cancelled) {
                        appDialog.alert({ title: 'Đã lưu file', message: `Đã lưu ${res.data.count} link vào:\n${res.data.path}`, icon: 'success' });
                        setShowExport(false);
                      } else if (res && !res.ok) {
                        appDialog.alert({ title: 'Không lưu được file', message: res.error || 'Có lỗi khi lưu file TXT.', icon: 'alert' });
                      }
                    });
                  }}>Lưu file TXT</button>
                </>}>
          <div className="field">
            <label className="field-label">Loại danh sách</label>
            <select className="select" value={exportType} onChange={(e) => setExportType(e.target.value)}>
              <option value="all">Tất cả group ({groups.length})</option>
              <option value="filtered">Group đang hiển thị ({filtered.length})</option>
              <option value="selected">Group đã chọn ({selected.size})</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label">Danh sách link ({exportUrls.length})</label>
            <textarea className="textarea mono" rows={14} value={exportText} readOnly
                      placeholder="Chưa có group để xuất" />
          </div>
        </Dialog>
      )}
      {confirmDelete && (
        <Dialog title={confirmDelete.title} onClose={() => setConfirmDelete(null)} width={460}
                footer={<>
                  <button className="btn" onClick={() => setConfirmDelete(null)}>Hủy</button>
                  <button className="btn danger" onClick={confirmRemove}>
                    <Icon name="trash" size={12}/> Xóa nhóm
                  </button>
                </>}>
          <div style={{ color: 'var(--fg-muted)', lineHeight: 1.6 }}>{confirmDelete.message}</div>
          <div className="dim-2" style={{ marginTop: 10, fontSize: 'var(--font-xs)' }}>
            Thao tác này sẽ cập nhật danh sách nhóm trong config khi backend sẵn sàng.
          </div>
        </Dialog>
      )}
    </div>
  );
}

// ── Shared action badge ───────────────────────────────────────
function ActionBadge({ action }) {
  const isTg = action === 'telegram';
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 3,
      background: isTg ? 'rgba(30,136,229,0.15)' : 'rgba(245,124,0,0.15)',
      color: isTg ? '#1e88e5' : '#f57c00',
      minWidth: 30, textAlign: 'center', letterSpacing: 0.3, flexShrink: 0,
      whiteSpace: 'nowrap', verticalAlign: 'middle',
    }}>
      {isTg ? 'TG' : 'CMT'}
    </span>
  );
}

// Bỏ query/hash khỏi link nhóm để hiển thị gọn (giữ nguyên link gốc khi mở).
// vd: .../groups/635116449959578/?sorting_setting=... -> .../groups/635116449959578
function cleanGroupUrl(url) {
  const raw = String(url || '').split('?')[0].split('#')[0];
  return raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
}

function GroupCollections({ groups, dataVersion = 0, botStatus = 'idle', botScope = null, runningGroupUrl = '' }) {
  const [collections, setCollections] = React.useState([]);
  const [activeId, _setActiveId] = React.useState(_tabGroupsState.collectionsActiveId);
  const setActiveId = React.useCallback((v) => {
    _setActiveId((prev) => {
      const next = typeof v === 'function' ? v(prev) : v;
      _tabGroupsState.collectionsActiveId = next;
      return next;
    });
  }, []);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createName, setCreateName] = React.useState('');
  const [groupSearch, setGroupSearch] = React.useState('');
  const [editingName, setEditingName] = React.useState(false);
  const [draggingIdx, setDraggingIdx] = React.useState(null);
  const [overIdx, setOverIdx] = React.useState(null);
  const [dropPos, setDropPos] = React.useState(null);

  const [menuOpenId, setMenuOpenId] = React.useState(null);
  const [renameTarget, setRenameTarget] = React.useState(null);
  const [renameName, setRenameName] = React.useState('');
  const [addOpen, setAddOpen] = React.useState(false);
  const [addDraftMembers, setAddDraftMembers] = React.useState(null);
  const [addSaving, setAddSaving] = React.useState(false);
  const [addCloseConfirmOpen, setAddCloseConfirmOpen] = React.useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = React.useState(new Set());
  const menuRef = React.useRef(null);
  const appDialog = useAppDialog();

  const botBusy = botStatus !== 'idle';
  const runningCollectionId = (botScope && botScope.type === 'collection') ? Number(botScope.id || 0) : 0;
  const runningUrlNorm = botBusy ? cleanGroupUrl(runningGroupUrl) : '';

  // Đóng menu "..." khi click ra ngoài
  React.useEffect(() => {
    if (menuOpenId == null) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpenId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpenId]);

  const groupById = React.useMemo(() => {
    const map = {};
    groups.forEach((g) => { map[g.id] = g; });
    return map;
  }, [groups]);

  const normalizeMember = React.useCallback((m) => {
    const groupId = Number(m.groupId || m.group_id || m.id || 0);
    const base = groupById[groupId] || {};
    return {
      ...base,
      ...m,
      id: groupId,
      groupId,
      name: base.name || m.name || ('Nhóm Facebook #' + groupId),
      url: base.url || m.url || '',
      enabled: base.enabled !== undefined ? base.enabled : (m.enabled !== false),
      paused: base.paused !== undefined ? !!base.paused : !!m.paused,
      pausedAt: base.pausedAt || m.pausedAt || '',
      action: m.action || base.action || 'comment',
      memberEnabled: m.memberEnabled !== false,
    };
  }, [groupById]);

  const loadCollections = React.useCallback(() => {
    if (!window.backendApi?.connected || !window.backendApi.loadGroupCollections) {
      setCollections([]);
      setActiveId(null);
      return;
    }
    window.backendApi.loadGroupCollections().then((res) => {
      if (!res?.ok || !Array.isArray(res.data?.collections)) return;
      setCollections(res.data.collections);
      setActiveId((current) => {
        if (current && res.data.collections.some((c) => c.id === current)) return current;
        return res.data.collections[0]?.id || null;
      });
    });
  }, []);

  React.useEffect(() => { loadCollections(); }, [loadCollections]);
  React.useEffect(() => { if (dataVersion) loadCollections(); }, [dataVersion, loadCollections]);

  const active = collections.find((c) => c.id === activeId) || collections[0] || null;
  const members = React.useMemo(
    () => ((active?.members || []).map(normalizeMember)),
    [active, normalizeMember]
  );
  const runCount = members.filter((m) => m.memberEnabled && !m.paused).length;
  const activeIsRunning = !!active && botBusy && runningCollectionId === active.id;
  const selectedMemberCount = selectedMemberIds.size;
  const allMembersSelected = members.length > 0 && members.every((m) => selectedMemberIds.has(m.groupId));
  const someMembersSelected = selectedMemberCount > 0 && !allMembersSelected;
  const allMembersEnabled = members.length > 0 && members.every((m) => m.memberEnabled !== false);
  const someMembersEnabled = members.some((m) => m.memberEnabled !== false) && !allMembersEnabled;

  React.useEffect(() => {
    setSelectedMemberIds(new Set());
  }, [active?.id]);

  const updateCollectionFromBackend = (res) => {
    if (res?.ok && Array.isArray(res.data?.collections)) {
      setCollections(res.data.collections);
      return true;
    }
    if (res && !res.ok) {
      appDialog.alert({
        title: 'Backend trả về lỗi',
        message: res.error || 'Backend trả về lỗi.',
        icon: 'alert',
      });
    }
    return false;
  };

  const memberPayload = (nextMembers) => nextMembers.map((m) => ({
    groupId: m.groupId || m.id,
    enabled: m.memberEnabled !== false,
  }));

  const updateActiveMembersLocal = (nextMembers) => {
    setCollections((prev) => prev.map((c) => c.id === active.id ? {
      ...c,
      members: nextMembers,
      membersTotal: nextMembers.length,
      membersEnabled: nextMembers.filter((m) => m.memberEnabled !== false).length,
      membersRunnable: nextMembers.filter((m) => m.memberEnabled !== false && !m.paused).length,
    } : c));
  };

  const membersChanged = (leftMembers, rightMembers) => {
    const left = leftMembers || [];
    const right = rightMembers || [];
    if (left.length !== right.length) return true;
    for (let i = 0; i < left.length; i += 1) {
      const leftId = Number(left[i].groupId || left[i].id || 0);
      const rightId = Number(right[i].groupId || right[i].id || 0);
      if (leftId !== rightId) return true;
      if ((left[i].memberEnabled !== false) !== (right[i].memberEnabled !== false)) return true;
    }
    return false;
  };

  const saveMembers = (nextMembers) => {
    if (!active) return Promise.resolve(false);
    updateActiveMembersLocal(nextMembers);
    if (!window.backendApi?.saveGroupCollectionMembers) {
      appDialog.alert({ title: 'Backend chưa sẵn sàng', message: 'Backend bridge chưa sẵn sàng.', icon: 'alert' });
      return Promise.resolve(false);
    }
    return window.backendApi.saveGroupCollectionMembers({
      id: active.id,
      members: memberPayload(nextMembers),
    }).then((res) => {
      if (!res?.ok) {
        appDialog.alert({
          title: 'Không lưu được cụm nhóm',
          message: res?.error || 'Backend trả về lỗi khi lưu cụm nhóm.',
          icon: 'alert',
        });
        return false;
      }
      return true;
    }).catch((err) => {
      appDialog.alert({
        title: 'Không lưu được cụm nhóm',
        message: String(err?.message || err),
        icon: 'alert',
      });
      return false;
    });
  };

  const submitCreate = () => {
    const name = createName.trim() || `Cụm nhóm ${collections.length + 1}`;
    if (!window.backendApi?.connected || !window.backendApi.createGroupCollection) {
      appDialog.alert({ title: 'Backend chưa sẵn sàng', message: 'Backend bridge chưa sẵn sàng.', icon: 'alert' });
      return;
    }
    window.backendApi.createGroupCollection({ name }).then((res) => {
      if (updateCollectionFromBackend(res)) {
        const createdId = res.data?.id;
        if (createdId) setActiveId(createdId);
        setCreateName('');
        setCreateOpen(false);
      }
    });
  };

  const duplicateNameFor = (collection) => {
    const base = (collection?.name || 'Cụm nhóm').trim() || 'Cụm nhóm';
    const existingNames = new Set(collections.map((c) => String(c.name || '').trim()));
    let name = `${base} (bản sao)`;
    let index = 2;
    while (existingNames.has(name)) {
      name = `${base} (bản sao ${index})`;
      index += 1;
    }
    return name;
  };

  const duplicateCollection = (collection) => {
    if (!collection) return;
    setMenuOpenId(null);
    if (!window.backendApi?.connected || !window.backendApi.createGroupCollection) {
      appDialog.alert({ title: 'Backend chưa sẵn sàng', message: 'Backend bridge chưa sẵn sàng.', icon: 'alert' });
      return;
    }
    const nextMembers = (collection.members || []).map(normalizeMember);
    window.backendApi.createGroupCollection({
      name: duplicateNameFor(collection),
      members: memberPayload(nextMembers),
    }).then((res) => {
      if (updateCollectionFromBackend(res)) {
        const createdId = res.data?.id;
        if (createdId) setActiveId(createdId);
      }
    });
  };

  const updateName = (name) => {
    if (!active) return;
    const clean = (name || '').trim();
    setEditingName(false);
    if (!clean || clean === active.name) return;
    if (!window.backendApi?.updateGroupCollection) {
      appDialog.alert({ title: 'Backend chưa sẵn sàng', message: 'Backend bridge chưa sẵn sàng.', icon: 'alert' });
      return;
    }
    window.backendApi.updateGroupCollection({ id: active.id, name: clean }).then(updateCollectionFromBackend);
  };

  const openRename = (collection) => {
    setMenuOpenId(null);
    setRenameTarget(collection);
    setRenameName(collection.name || '');
  };

  const submitRename = () => {
    if (!renameTarget) return;
    const clean = renameName.trim();
    if (!clean || clean === renameTarget.name) { setRenameTarget(null); return; }
    if (!window.backendApi?.updateGroupCollection) {
      appDialog.alert({ title: 'Backend chưa sẵn sàng', message: 'Backend bridge chưa sẵn sàng.', icon: 'alert' });
      return;
    }
    window.backendApi.updateGroupCollection({ id: renameTarget.id, name: clean }).then((res) => {
      updateCollectionFromBackend(res);
      setRenameTarget(null);
    });
  };

  const deleteCollection = async (collection) => {
    if (!collection) return;
    if (botBusy && runningCollectionId === collection.id) {
      appDialog.alert({
        title: 'Cụm đang chạy',
        message: 'Không thể xóa cụm nhóm đang chạy. Hãy dừng bot hoặc đợi phiên chạy kết thúc rồi xóa.',
        icon: 'alert',
      });
      return;
    }
    const ok = await appDialog.confirm({
      title: 'Xóa cụm nhóm?',
      message: `Xóa cụm nhóm "${collection.name}"? Các nhóm Facebook gốc vẫn được giữ trong danh sách chính.`,
      confirmText: 'Xóa cụm',
      icon: 'trash',
      danger: true,
    });
    if (!ok) return;
    if (!window.backendApi?.deleteGroupCollection) {
      appDialog.alert({ title: 'Backend chưa sẵn sàng', message: 'Backend bridge chưa sẵn sàng.', icon: 'alert' });
      return;
    }
    window.backendApi.deleteGroupCollection({ id: collection.id }).then((res) => {
      if (updateCollectionFromBackend(res)) setActiveId(null);
    });
  };

  const runCollection = (collection) => {
    if (!collection) return;
    if (botBusy) {
      appDialog.alert({
        title: 'Bot đang chạy',
        message: 'Đang có phiên chạy khác. Hãy đợi xong hoặc bấm Dừng rồi chạy cụm.',
        icon: 'alert',
      });
      return;
    }
    if (runCount <= 0) {
      appDialog.alert({
        title: 'Không có nhóm để chạy',
        message: 'Cụm này chưa có nhóm nào đang bật để chạy.',
        icon: 'alert',
      });
      return;
    }
    if (!window.backendApi?.runGroupCollection) {
      appDialog.alert({ title: 'Backend chưa sẵn sàng', message: 'Backend bridge chưa sẵn sàng.', icon: 'alert' });
      return;
    }
    window.backendApi.runGroupCollection({ id: collection.id }).then((res) => {
      if (!res?.ok) {
        appDialog.alert({
          title: 'Không chạy được cụm nhóm',
          message: res?.error || 'Không chạy được cụm nhóm.',
          icon: 'alert',
        });
      }
    });
  };

  const toggleMember = (groupId) => {
    saveMembers(members.map((m) => (
      m.groupId === groupId ? { ...m, memberEnabled: !m.memberEnabled } : m
    )));
  };

  // Đổi hành động (CMT/TG) của 1 nhóm — cập nhật luôn danh sách nhóm tổng.
  const setMemberAction = (groupId, action) => {
    if (!window.backendApi?.setGroupAction) {
      appDialog.alert({ title: 'Backend chưa sẵn sàng', message: 'Backend bridge chưa sẵn sàng.', icon: 'alert' });
      return;
    }
    // Cập nhật lạc quan tại chỗ để bảng phản hồi ngay.
    updateActiveMembersLocal(members.map((m) => (
      m.groupId === groupId ? { ...m, action } : m
    )));
    window.backendApi.setGroupAction({ id: groupId, action }).then((res) => {
      updateCollectionFromBackend(res);
    });
  };

  const removeMember = (groupId) => {
    saveMembers(members.filter((m) => m.groupId !== groupId));
    setSelectedMemberIds((prev) => {
      if (!prev.has(groupId)) return prev;
      const next = new Set(prev);
      next.delete(groupId);
      return next;
    });
  };

  const toggleMemberSelection = (groupId, checked) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(groupId);
      else next.delete(groupId);
      return next;
    });
  };

  const toggleAllMemberSelection = (checked) => {
    setSelectedMemberIds(checked ? new Set(members.map((m) => m.groupId)) : new Set());
  };

  const removeSelectedMembers = () => {
    if (selectedMemberCount <= 0) return;
    const ids = selectedMemberIds;
    saveMembers(members.filter((m) => !ids.has(m.groupId)));
    setSelectedMemberIds(new Set());
  };

  const setAllMembersEnabled = (enabled) => {
    if (members.length === 0) return;
    saveMembers(members.map((m) => ({ ...m, memberEnabled: enabled })));
  };

  const openAddDialog = () => {
    setGroupSearch('');
    setAddDraftMembers(members);
    setAddSaving(false);
    setAddCloseConfirmOpen(false);
    setAddOpen(true);
  };

  const draftMembers = addDraftMembers || members;
  const draftMemberIds = React.useMemo(
    () => new Set(draftMembers.map((m) => Number(m.groupId || m.id || 0))),
    [draftMembers]
  );
  const addDirty = addOpen && membersChanged(draftMembers, members);

  const closeAddDialogNow = () => {
    setAddCloseConfirmOpen(false);
    setAddOpen(false);
    setAddDraftMembers(null);
    setGroupSearch('');
  };

  const closeAddDialog = () => {
    if (addSaving) return;
    if (addDirty) {
      setAddCloseConfirmOpen(true);
      return;
    }
    closeAddDialogNow();
  };

  const discardAddDialog = () => {
    closeAddDialogNow();
  };

  const submitAddDialog = () => {
    if (!active) return;
    if (!addDirty) {
      closeAddDialogNow();
      return;
    }
    setAddSaving(true);
    saveMembers(draftMembers).then((ok) => {
      setAddSaving(false);
      if (!ok) return;
      closeAddDialogNow();
    });
  };

  const addDraftMember = (group) => {
    if (!active || draftMemberIds.has(group.id)) return;
    setAddDraftMembers((prev) => [
      ...(prev || members),
      normalizeMember({ ...group, groupId: group.id, memberEnabled: true }),
    ]);
  };

  const removeDraftMember = (groupId) => {
    setAddDraftMembers((prev) => (prev || members).filter((m) => m.groupId !== groupId));
  };

  const onMemberDragOver = (e, idx) => {
    e.preventDefault();
    if (draggingIdx == null || draggingIdx === idx) {
      setOverIdx(null); setDropPos(null); return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setOverIdx(idx);
    setDropPos((e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after');
  };

  const onMemberDrop = (idx) => {
    if (draggingIdx == null || !dropPos || draggingIdx === idx) {
      setDraggingIdx(null); setOverIdx(null); setDropPos(null); return;
    }
    const next = [...members];
    const [item] = next.splice(draggingIdx, 1);
    let insertIdx = idx;
    if (draggingIdx < idx) insertIdx -= 1;
    if (dropPos === 'after') insertIdx += 1;
    next.splice(insertIdx, 0, item);
    saveMembers(next);
    setDraggingIdx(null); setOverIdx(null); setDropPos(null);
  };

  // Danh sách cho dialog "Thêm nhóm": tất cả nhóm (đã thêm vẫn hiện, gắn cờ).
  const dialogGroups = React.useMemo(() => {
    const s = groupSearch.trim().toLowerCase();
    return groups.filter((g) => {
      if (!s) return true;
      return String(g.name || '').toLowerCase().includes(s) || String(g.url || '').toLowerCase().includes(s);
    });
  }, [groups, groupSearch]);
  const addableCount = dialogGroups.filter((g) => !draftMemberIds.has(g.id)).length;

  return (
    <div className="section group-collections-section">
      <div className="section-hd" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="btn sm primary" onClick={() => { setCreateName(''); setCreateOpen(true); }}>
          <Icon name="plus" size={12}/> Tạo cụm
        </button>
        <button className="btn sm ghost" onClick={loadCollections}>
          <Icon name="refresh" size={12}/> Refresh
        </button>
        <div className="spacer" />
        <span className="meta">{collections.length} cụm nhóm</span>
      </div>

      <div className="group-collections-grid">
        <div className="collection-list">
          {collections.length === 0 && (
            <div className="collection-empty">Chưa có cụm nhóm nào.</div>
          )}
          {collections.map((c) => {
            const isRunning = runningCollectionId === c.id;
            return (
              <div key={c.id}
                   className={'collection-list-item' + (active?.id === c.id ? ' active' : '') + (isRunning ? ' running' : '')}
                   onClick={() => { setActiveId(c.id); setEditingName(false); }}>
                <div className="collection-list-main">
                  <span className="collection-name truncate">{c.name}</span>
                  <span className="collection-count">
                    {c.membersRunnable || 0}/{c.membersTotal || 0} chạy
                    {isRunning && <span className="collection-running-tag">Đang chạy</span>}
                  </span>
                </div>
                <div className="collection-more" ref={menuOpenId === c.id ? menuRef : null}>
                  <button className="btn sm ghost collection-more-btn" data-tooltip="Tùy chọn" aria-label="Tùy chọn"
                          onClick={(e) => { e.stopPropagation(); setMenuOpenId((v) => v === c.id ? null : c.id); }}>
                    <Icon name="more" size={14}/>
                  </button>
                  {menuOpenId === c.id && (
                    <div className="collection-more-menu" onClick={(e) => e.stopPropagation()}>
                      <button className="collection-more-item" onClick={() => openRename(c)}>
                        <Icon name="edit" size={13}/> <span>Đổi tên</span>
                      </button>
                      <button className="collection-more-item" onClick={() => duplicateCollection(c)}>
                        <Icon name="copy" size={13}/> <span>Duplicate cụm</span>
                      </button>
                      <div className="collection-more-sep" />
                      <button className="collection-more-item danger"
                              disabled={isRunning}
                              title={isRunning ? 'Không thể xóa cụm đang chạy' : 'Xóa cụm nhóm'}
                              onClick={() => { setMenuOpenId(null); deleteCollection(c); }}>
                        <Icon name="trash" size={13}/> <span>Xóa cụm</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="collection-detail">
          {!active ? (
            <div className="collection-empty large">Tạo một cụm rồi thêm nhóm Facebook vào cụm đó.</div>
          ) : (
            <>
              <div className="collection-detail-hd">
                <div style={{ minWidth: 0 }}>
                  {editingName ? (
                    <InlineEditInput
                      value={active.name}
                      onSave={updateName}
                      onCancel={() => setEditingName(false)} />
                  ) : (
                    <div className="collection-title-row">
                      <div className="collection-title truncate" title="Bấm đúp để đổi tên"
                           onDoubleClick={() => setEditingName(true)}>
                        {active.name}
                      </div>
                      {activeIsRunning && (
                        <span className="collection-detail-running">
                          <span className="member-running-dot" /> Đang chạy
                        </span>
                      )}
                    </div>
                  )}
                  <div className="dim-2" style={{ fontSize: 'var(--font-xs)' }}>
                    Run cụm sẽ chạy {runCount}/{members.length} nhóm theo thứ tự bên dưới.
                  </div>
                </div>
                <div className="spacer" />
                <button className="btn sm" onClick={openAddDialog}>
                  <Icon name="plus" size={12}/> Thêm nhóm
                </button>
                <button className="btn sm success"
                        disabled={runCount <= 0 || botBusy}
                        title={runCount <= 0
                          ? 'Cụm chưa có nhóm nào đang bật để chạy'
                          : (botBusy ? 'Đang có phiên chạy khác — hãy đợi hoặc bấm Dừng' : 'Chạy cụm này')}
                        onClick={() => runCollection(active)}>
                  <Icon name="play" size={12}/> {botBusy && runningCollectionId === active.id ? 'Đang chạy' : 'Run'}
                </button>
              </div>

              {members.length === 0 ? (
                <div className="collection-empty">
                  Cụm này chưa có nhóm nào. Bấm <b>Thêm nhóm</b> ở trên để chọn.
                </div>
              ) : (
                <div className="collection-members-wrap">
                  {selectedMemberCount > 0 && (
                    <div className="collection-bulk-bar">
                      <span>
                        <b>{selectedMemberCount}</b> nhóm đang chọn
                      </span>
                      <div className="spacer" />
                      <button className="btn sm danger" onClick={removeSelectedMembers}>
                        <Icon name="trash" size={12}/> Bỏ khỏi cụm ({selectedMemberCount})
                      </button>
                      <button className="btn sm ghost" onClick={() => setSelectedMemberIds(new Set())}>
                        Bỏ chọn
                      </button>
                    </div>
                  )}
                  <table className="tbl collection-members-table">
                    <thead>
                      <tr>
                        <th className="collection-member-select" style={{ width: 40 }}>
                          <Checkbox checked={allMembersSelected} indeterminate={someMembersSelected} onChange={toggleAllMemberSelection} />
                        </th>
                        <th style={{ width: 32 }}></th>
                        <th style={{ width: 86 }}>
                          <div className="collection-run-header">
                            <Checkbox checked={allMembersEnabled} indeterminate={someMembersEnabled} onChange={setAllMembersEnabled} />
                            <span>Chạy</span>
                          </div>
                        </th>
                        <th>Nhóm Facebook</th>
                        <th style={{ width: 170 }}>Hành động</th>
                        <th style={{ width: 150 }}>Quét lần cuối</th>
                        <th className="collection-member-status-col" style={{ width: 124 }}>Trạng thái</th>
                        <th style={{ width: 80 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m, idx) => {
                        const isRunningMember = !!runningUrlNorm
                          && runningCollectionId === active.id
                          && cleanGroupUrl(m.url) === runningUrlNorm;
                        const isSelected = selectedMemberIds.has(m.groupId);
                        let cls = '';
                        if (isSelected) cls += ' selected';
                        if (!m.memberEnabled) cls += ' member-off';
                        if (m.paused) cls += ' paused-row';
                        if (isRunningMember) cls += ' member-running';
                        if (overIdx === idx && dropPos === 'before') cls += ' drop-before';
                        if (overIdx === idx && dropPos === 'after') cls += ' drop-after';
                        return (
                          <tr key={m.groupId}
                              className={cls}
                              draggable
                              onDragStart={() => setDraggingIdx(idx)}
                              onDragOver={(e) => onMemberDragOver(e, idx)}
                              onDrop={() => onMemberDrop(idx)}
                              onDragEnd={() => { setDraggingIdx(null); setOverIdx(null); setDropPos(null); }}>
                            <td className="collection-member-select">
                              <Checkbox checked={isSelected} onChange={(checked) => toggleMemberSelection(m.groupId, checked)} />
                            </td>
                            <td><span className="drag-handle" title="Kéo để đổi thứ tự trong cụm" /></td>
                            <td><Checkbox checked={!!m.memberEnabled} onChange={() => toggleMember(m.groupId)} /></td>
                            <td>
                              <div style={{ minWidth: 0 }}>
                                <div className="truncate" title={m.name} style={{ fontWeight: 500 }}>{m.name}</div>
                                <div className="mono dim-2 group-url-cell" title={m.url} style={{ fontSize: 'var(--font-xs)' }}>{cleanGroupUrl(m.url)}</div>
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <ActionBadge action={m.action} />
                                <select className="select sm" value={m.action} disabled={m.paused}
                                        onChange={(e) => !m.paused && setMemberAction(m.groupId, e.target.value)}>
                                  <option value="comment">Comment trực tiếp</option>
                                  <option value="telegram">Gửi qua Telegram</option>
                                </select>
                              </div>
                            </td>
                            <td className="dim truncate" title={m.lastScan || 'Chưa quét'} style={{ fontSize: 'var(--font-xs)' }}>
                              {m.lastScan || 'Chưa quét'}
                            </td>
                            <td className="collection-member-status-col"><MemberStatusBadges member={m} running={isRunningMember} /></td>
                            <td>
                              <div className="row-actions">
                                <button className="btn sm ghost" data-tooltip="Mở nhóm" aria-label="Mở nhóm"
                                        onClick={() => openBackendLink('group', m.url, appDialog)}>
                                  <Icon name="external" size={12}/>
                                </button>
                                <button className="btn sm ghost" data-tooltip="Bỏ khỏi cụm" aria-label="Bỏ khỏi cụm"
                                        onClick={() => removeMember(m.groupId)}>
                                  <Icon name="trash" size={12}/>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {members.length === 0 && (
                        <TableEmptyRow colSpan={8} />
                      )}
                    </tbody>
                  </table>
                </div>
              )}

            </>
          )}
        </div>
      </div>

      {createOpen && (
        <Dialog title="Tạo cụm nhóm mới" width={380} onClose={() => setCreateOpen(false)}
                footer={(
                  <>
                    <button className="btn ghost" onClick={() => setCreateOpen(false)}>Hủy</button>
                    <button className="btn primary" onClick={submitCreate}>Tạo cụm</button>
                  </>
                )}>
          <FieldRow label="Tên cụm nhóm">
            <input className="input" autoFocus value={createName}
                   onChange={(e) => setCreateName(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') submitCreate(); }}
                   placeholder="VD: Nhóm thanh lý mỹ phẩm" />
          </FieldRow>
        </Dialog>
      )}

      {renameTarget && (
        <Dialog title="Đổi tên cụm nhóm" width={380} onClose={() => setRenameTarget(null)}
                footer={(
                  <>
                    <button className="btn ghost" onClick={() => setRenameTarget(null)}>Hủy</button>
                    <button className="btn primary" onClick={submitRename}>Lưu</button>
                  </>
                )}>
          <FieldRow label="Tên cụm nhóm">
            <input className="input" autoFocus value={renameName}
                   onChange={(e) => setRenameName(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') submitRename(); }}
                   placeholder="Tên mới cho cụm" />
          </FieldRow>
        </Dialog>
      )}

      {addOpen && active && (
        <Dialog title={`Thêm nhóm vào "${active.name}"`} width={820} onClose={closeAddDialog}
                footer={(
                  <>
                    <span className="meta">
                      {draftMembers.length} nhóm trong cụm • {addableCount} có thể thêm
                      {addDirty && <span className="collection-unsaved-dot">Chưa lưu</span>}
                    </span>
                    <span className="spacer" />
                    <button className="btn ghost" disabled={addSaving} onClick={closeAddDialog}>Hủy</button>
                    <button className="btn primary" disabled={addSaving} onClick={submitAddDialog}>
                      {addSaving ? 'Đang lưu…' : 'Xong'}
                    </button>
                  </>
                )}>
          <div style={{ marginBottom: 10 }}>
            <SearchInput value={groupSearch} onChange={setGroupSearch}
                         placeholder="Tìm nhóm theo tên hoặc link…" style={{ width: '100%' }} />
          </div>
          <div className="collection-add-dialog-table">
            <table className="tbl collection-members-table">
              <thead>
                <tr>
                  <th>Nhóm Facebook</th>
                  <th style={{ width: 100 }}>Hành động</th>
                  <th style={{ width: 120 }}></th>
                </tr>
              </thead>
              <tbody>
                {dialogGroups.length === 0 && (
                  <TableEmptyRow colSpan={3} />
                )}
                {dialogGroups.map((g) => {
                  const added = draftMemberIds.has(g.id);
                  return (
                    <tr key={g.id} className={(g.paused ? 'paused-row' : '') + (added ? ' member-added' : '')}>
                      <td>
                        <div style={{ minWidth: 0 }}>
                          <div className="truncate" title={g.name} style={{ fontWeight: 500 }}>{g.name}</div>
                          <div className="mono dim-2 group-url-cell" title={g.url} style={{ fontSize: 'var(--font-xs)' }}>{cleanGroupUrl(g.url)}</div>
                        </div>
                      </td>
                      <td><ActionBadge action={g.action} /></td>
                      <td>
                        {added ? (
                          <button className="btn sm ghost collection-add-action-btn collection-added-toggle" data-tooltip="Bấm để gỡ khỏi cụm" aria-label="Bấm để gỡ khỏi cụm"
                                  disabled={addSaving}
                                  onClick={() => removeDraftMember(g.id)}>
                            <span className="added-state"><Icon name="check" size={12}/> Đã thêm</span>
                            <span className="undo-state"><Icon name="trash" size={12}/> Gỡ</span>
                          </button>
                        ) : (
                          <button className="btn sm primary collection-add-action-btn" data-tooltip="Thêm vào cụm" aria-label="Thêm vào cụm" disabled={addSaving} onClick={() => addDraftMember(g)}>
                            <Icon name="plus" size={12}/> Thêm
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Dialog>
      )}

      {addCloseConfirmOpen && (
        <Dialog title="Lưu thay đổi?" width={500} onClose={() => setAddCloseConfirmOpen(false)}
                footer={(
                  <>
                    <button className="btn ghost" disabled={addSaving} onClick={() => setAddCloseConfirmOpen(false)}>
                      Tiếp tục chỉnh
                    </button>
                    <button className="btn danger" disabled={addSaving} onClick={discardAddDialog}>
                      <Icon name="trash" size={12}/> Hủy bỏ
                    </button>
                    <button className="btn primary" disabled={addSaving} onClick={submitAddDialog}>
                      <Icon name="check" size={12}/> {addSaving ? 'Đang lưu…' : 'Đóng và lưu'}
                    </button>
                  </>
                )}>
          <div style={{ color: 'var(--fg-muted)', lineHeight: 1.6 }}>
            Bạn đã thêm/gỡ nhóm nhưng chưa lưu. Bạn muốn lưu thay đổi rồi đóng popup, hay hủy bỏ các thay đổi này?
          </div>
        </Dialog>
      )}
    </div>
  );
}

function MemberStatusBadges({ member, running = false }) {
  const badges = [];
  if (running) {
    badges.push(
      <span key="running" className="badge member-running-badge">
        <span className="member-running-dot" /> Đang chạy
      </span>
    );
  }
  if (!member.memberEnabled) badges.push(<Badge key="member-off" kind="danger">Tắt trong cụm</Badge>);
  if (member.paused) badges.push(<Badge key="paused" kind="warn">Tạm dừng</Badge>);
  if (badges.length === 0) badges.push(<Badge key="ready" kind="ok">Sẵn sàng</Badge>);
  return <div className="member-status-badges">{badges}</div>;
}

// ── FailedPostsSection — bài thất bại cần xử lý thủ công ────
const FAIL_LABELS = {
  fail_fb:        'Lỗi đăng FB',
  fail_telegram:  'Lỗi Telegram',
  fail_permalink: 'Không có link bài',
};

// Copy text vào clipboard — dùng execCommand vì navigator.clipboard không chạy trong WebEngine
function copyToClipboard(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
}

function FailedPostItem({ fp, onResolve }) {
  const [expanded, setExpanded] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const appDialog = useAppDialog();

  const comment = fp.comment_text || '';
  // Truncate ngưỡng: nếu > 120 ký tự hoặc > 2 dòng thì có nút Xem thêm
  const isLong = comment.length > 120 || comment.split('\n').length > 2;

  const handleCopy = () => {
    if (copyToClipboard(comment)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleOpen = () => {
    if (fp.permalink) openBackendLink('post', fp.permalink, appDialog);
  };

  return (
    <div className="failed-post-item">
      {/* Header row: nhóm | badge lý do | nút thao tác */}
      <div className="failed-post-hd">
        <span className="failed-post-group truncate" title={fp.group_url}>
          {fp.group_name || fp.group_url}
        </span>
        <span className="failed-post-badge">{FAIL_LABELS[fp.fail_reason] || fp.fail_reason}</span>
        <div style={{ flex: 1 }} />
        {fp.permalink && (
          <button className="btn xs ghost icon-only" data-tooltip="Mở bài viết" aria-label="Mở bài viết" onClick={handleOpen}>
            <Icon name="external" size={13} />
          </button>
        )}
        <button className="btn xs ghost icon-only" data-tooltip={copied ? 'Đã copy' : 'Copy nội dung comment'} aria-label={copied ? 'Đã copy' : 'Copy nội dung comment'}
                onClick={handleCopy}
                style={copied ? { color: 'var(--success, #16a34a)' } : undefined}>
          <Icon name={copied ? 'check' : 'copy'} size={13} />
        </button>
        <button className="btn xs ghost" data-tooltip="Đánh dấu đã xử lý thủ công" aria-label="Đánh dấu đã xử lý thủ công"
                onClick={() => onResolve(fp.id)}>
          <Icon name="check" size={13} />
          <span style={{ marginLeft: 4 }}>Đã xử lý</span>
        </button>
      </div>
      {/* Comment body: thu gọn mặc định */}
      {comment && (
        <div className={'failed-post-body' + (expanded ? ' expanded' : ' collapsed')}>
          {comment}
        </div>
      )}
      {isLong && (
        <button className="btn xs ghost failed-post-toggle"
                onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Thu gọn' : 'Xem thêm'}
        </button>
      )}
    </div>
  );
}

function FailedPostsSection({ failedPosts = [], onResolve }) {
  return (
    <div className="failed-posts-wrap">
      <div className="failed-posts-hd">
        <Icon name="alert" size={13} />
        <span>{failedPosts.length} bài thất bại — cần đăng thủ công</span>
      </div>
      <div className="failed-posts-list">
        {failedPosts.map((fp) => (
          <FailedPostItem key={fp.id} fp={fp} onResolve={onResolve} />
        ))}
      </div>
    </div>
  );
}

// ── RunHistory — lịch sử từng phiên chạy ─────────────────────
const RUN_STATUS = {
  running:     { label: 'Đang chạy', cls: 'st-running' },
  done:        { label: 'Hoàn tất',  cls: 'st-done' },
  stopped:     { label: 'Đã dừng',   cls: 'st-stopped' },
  error:       { label: 'Lỗi',       cls: 'st-error' },
  interrupted: { label: 'Gián đoạn', cls: 'st-interrupted' },
};

function RunHistory({ active = false, runsVersion = 0 }) {
  const today = groupDateInputValue(new Date());

  const [runs, setRuns] = React.useState([]);
  const [expanded, setExpanded] = React.useState(new Set());
  const [loading, setLoading] = React.useState(false);
  const [from, setFrom] = React.useState(today);
  const [to, setTo] = React.useState(today);
  const [quick, setQuick] = React.useState('today');

  const load = React.useCallback(() => {
    if (!window.backendApi?.connected || !window.backendApi.loadRunHistory) {
      setRuns([]);
      return;
    }
    setLoading(true);
    window.backendApi.loadRunHistory({ from, to }).then((res) => {
      if (res?.ok && Array.isArray(res.data?.runs)) setRuns(res.data.runs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [from, to]);

  // Chỉ nạp khi view đang mở hoặc khi đổi khoảng ngày đang xem.
  React.useEffect(() => { if (active) load(); }, [active, load]);

  // Auto-refresh khi có sự kiện "runs" từ backend (sau mỗi chu kỳ hoàn thành)
  const prevVersionRef = React.useRef(runsVersion);
  React.useEffect(() => {
    if (runsVersion !== prevVersionRef.current) {
      prevVersionRef.current = runsVersion;
      if (active) load();
    }
  }, [active, runsVersion, load]);

  const setQuickAndDates = (value) => {
    setQuick(value);
    const t = groupDateInputValue(new Date());
    if (value === 'today') {
      setFrom(t);
      setTo(t);
      return;
    }
    if (value === 'yesterday') {
      const y = groupDaysAgoValue(1);
      setFrom(y);
      setTo(y);
      return;
    }
    if (value === '30days') {
      setFrom(groupDaysAgoValue(29));
      setTo(t);
      return;
    }
    setFrom(groupDaysAgoValue(6));
    setTo(t);
  };
  const setCustomFrom = (value) => {
    setQuick('custom');
    setFrom(value);
  };
  const setCustomTo = (value) => {
    setQuick('custom');
    setTo(value);
  };

  const toggleExpand = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // "2026-05-27 08:00:15" → "08:00 27/05"
  const fmtDt = (s) => {
    if (!s) return '—';
    const [date, time] = s.split(' ');
    if (!date || !time) return s;
    const [y, m, d] = date.split('-');
    const [hh, mm] = time.split(':');
    return `${hh}:${mm} ${d}/${m}`;
  };

  const fmtTime = (s) => {
    if (!s) return '—';
    const parts = s.split(' ');
    const time = parts[1] || parts[0];
    if (!time) return '—';
    const [hh, mm] = time.split(':');
    return hh && mm ? `${hh}:${mm}` : '—';
  };

  const fmtDuration = (start, end) => {
    if (!start || !end) return '';
    const diff = Math.round((new Date(end) - new Date(start)) / 60000);
    if (diff <= 0) return '';
    return diff >= 60 ? `${Math.floor(diff / 60)}g${diff % 60}p` : `${diff}p`;
  };

  // Nhãn phiên: "<Tên FB> - 09:50 30/05" (theo tài khoản FB chạy phiên đó),
  // fallback "Phiên 09:50 30/05" nếu chưa bắt được tên.
  const fmtSession = (run) => {
    const base = fmtDt(run.started_at);
    const name = String(run.account_name || '').trim();
    if (name) return base === '—' ? name : `${name} - ${base}`;
    return base === '—' ? `Phiên #${run.id}` : `Phiên ${base}`;
  };
  const statusMeta = (run) => {
    let key = String(run.status || '').toLowerCase();
    if (!key) key = run.finished_at ? 'done' : 'running';
    return RUN_STATUS[key] || RUN_STATUS.done;
  };
  const timeRange = (start, end) => `${fmtTime(start)} → ${end ? fmtTime(end) : '…'}`;
  const numCell = (v, cls) => (Number(v) > 0
    ? <span className={'run-pill ' + cls}>{v}</span>
    : <span className="run-zero">0</span>);

  const onResolveFailedPost = (runId, postId) => {
    window.backendApi?.resolveFailedPost?.({ id: postId });
    setRuns((prev) => prev.map((r) => r.id === runId
      ? { ...r, failed_posts: (r.failed_posts || []).filter((fp) => fp.id !== postId) }
      : r
    ));
  };

  return (
    <div className="section run-history">
      <div className="section-hd" style={{ gap: 10, flexWrap: 'wrap' }}>
        <QuickFilter value={quick} onChange={setQuickAndDates} options={[
          { value: 'today', label: 'Hôm nay' },
          { value: 'yesterday', label: 'Hôm qua' },
          { value: '7days', label: '7 ngày' },
          { value: '30days', label: '30 ngày' },
        ]} />
        <div className="divider" style={{ alignSelf: 'stretch' }} />
        <DateInput value={from} onChange={setCustomFrom} label="Từ" />
        <DateInput value={to} onChange={setCustomTo} label="Đến" />
        <button className="btn sm" onClick={load} disabled={loading}>
          <Icon name="refresh" size={12} /> Refresh
        </button>
        <div className="spacer" />
        <span className="dim-2" style={{ fontSize: 'var(--font-xs)' }}>
          {loading ? 'Đang tải...' : `${runs.length} chu kỳ`}
        </span>
      </div>

      <div className="tbl-wrap run-history-wrap">
        <table className="tbl run-history-table">
          <thead>
            <tr>
              <th style={{ width: 210 }}>Phiên</th>
              <th style={{ width: 110 }}>Trạng thái</th>
              <th style={{ width: 140 }}>Thời gian</th>
              <th className="num" style={{ width: 70 }}>Nhóm</th>
              <th className="num" style={{ width: 70 }} title="Bài phù hợp">Phù hợp</th>
              <th className="num" style={{ width: 60 }} title="Comment Facebook thành công">Cmt</th>
              <th className="num" style={{ width: 60 }} title="Gửi qua Telegram">TG</th>
              <th className="num" style={{ width: 80 }} title="Chờ FB duyệt (chỉ mình bạn thấy)">Chờ duyệt</th>
              <th className="num" style={{ width: 80 }} title="Bị FB từ chối (vi phạm tiêu chuẩn cộng đồng)">Bị từ chối</th>
              <th className="num" style={{ width: 60 }}>Lỗi</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && !loading && (
              <TableEmptyRow colSpan={10} padding={32} />
            )}
            {runs.map((run) => {
              const isOpen = expanded.has(run.id);
              const grpsDone = (run.groups || []).length;
              const failedCount = (run.failed_posts || []).length;
              const st = statusMeta(run);
              const dur = fmtDuration(run.started_at, run.finished_at);
              return (
                <React.Fragment key={run.id}>
                  <tr className={'run-row' + (isOpen ? ' open' : '')} onClick={() => toggleExpand(run.id)}>
                    <td>
                      <span className="run-chev">
                        <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={12} />
                      </span>
                      <span className="run-session">{fmtSession(run)}</span>
                      {run.cycle > 1 && <span className="run-cycle-tag">vòng {run.cycle}</span>}
                      {run.scope_type === 'collection' && (
                        <span className="run-scope-tag" title="Phiên chạy từ một cụm nhóm">
                          <Icon name="users" size={11}/> {run.scope_name || 'Cụm nhóm'}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={'run-status ' + st.cls}>{st.label}</span>
                    </td>
                    <td>
                      <span className="run-timerange">{timeRange(run.started_at, run.finished_at)}</span>
                      {dur && <span className="run-duration">{dur}</span>}
                    </td>
                    <td className="num">{grpsDone}/{run.groups_total}</td>
                    <td className="num">{run.suitable || 0}</td>
                    <td className="num">{numCell(run.direct || 0, 'ok')}</td>
                    <td className="num">{numCell(run.telegram || 0, 'ok')}</td>
                    <td className="num">{numCell(run.pending_fb || 0, 'wait')}</td>
                    <td className="num">{numCell(run.rejected || 0, 'reject')}</td>
                    <td className="num">
                      {numCell(failedCount > 0 ? failedCount : (run.fail || 0), 'bad')}
                    </td>
                  </tr>
                  {isOpen && (run.groups || []).map((g) => {
                    const groupTitle = g.group_name || g.group_url;
                    const isBlocked = Boolean(g.blocked);
                    return (
                      <tr key={g.id} className={'run-subrow' + (isBlocked ? ' blocked' : '')}>
                        <td>
                          <span className="truncate" title={groupTitle}>
                            {groupTitle}
                          </span>
                        </td>
                        <td className="dim">—</td>
                        <td className="dim mono">{timeRange(g.started_at, g.finished_at)}</td>
                        <td className="num dim">
                          {isBlocked
                            ? <span className="badge danger run-blocked-badge">Nhóm bị chặn</span>
                            : `${g.scanned} bài`}
                        </td>
                        <td className="num">{g.suitable}</td>
                        <td className="num">{numCell(g.direct, 'ok')}</td>
                        <td className="num">{numCell(g.telegram, 'ok')}</td>
                        <td className="num">{numCell(g.pending_fb || 0, 'wait')}</td>
                        <td className="num">{numCell(g.rejected || 0, 'reject')}</td>
                        <td className="num">{numCell(g.fail || 0, 'bad')}</td>
                      </tr>
                    );
                  })}
                  {isOpen && failedCount > 0 && (
                    <tr className="run-subrow run-failed-row">
                      <td colSpan={10} style={{ padding: 0 }}>
                        <FailedPostsSection
                          failedPosts={run.failed_posts}
                          onResolve={(id) => onResolveFailedPost(run.id, id)}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Rating order for sorting
const RATING_ORDER = {
  excellent: 8,
  effective: 7,
  recommend: 7,
  potential: 6,
  monitor: 5,
  follow: 5,
  improve: 4,
  optimize: 3,
  low: 3,
  inefficient: 2,
  risk: 1,
  remove: 1,
  none: 0,
};

function GroupStats({ active = false, groups, setGroups, dataVersion = 0 }) {
  const [search, setSearch] = React.useState('');
  const yesterday = groupDaysAgoValue(1);
  const [from, setFrom] = React.useState(yesterday);
  const [to, setTo] = React.useState(yesterday);
  const [quick, setQuick] = React.useState('yesterday');
  const [sortKey, setSortKey] = React.useState('commission');
  const [sortDir, setSortDir] = React.useState('desc');
  const [rows, setRows] = React.useState([]);
  const [deletingId, setDeletingId] = React.useState(null);
  const [statsLoading, setStatsLoading] = React.useState(false);
  const [statsNameColWidth, _setStatsNameColWidth] = React.useState(_tabGroupsState.statsNameColWidth || 360);
  const appDialog = useAppDialog();

  const groupsRef = React.useRef(groups);
  const statsRequestRef = React.useRef(0);
  const statsDepsRef = React.useRef({ from: '', to: '', dataVersion: null });
  const statsActiveRef = React.useRef(false);
  React.useEffect(() => { groupsRef.current = groups; }, [groups]);
  const setStatsNameColWidth = React.useCallback((width) => {
    _tabGroupsState.statsNameColWidth = width;
    _setStatsNameColWidth(width);
  }, []);

  const mapStatsRows = React.useCallback((data) => {
    const byUrl = {};
    groupsRef.current.forEach((g) => { if (g.url) byUrl[g.url] = g; });

    return data.map((r) => {
      const existing = byUrl[r.url] || {};
      const id = r.id ?? r.groupId ?? r.group_id ?? existing.id ?? r.subid ?? r.url;
      const commentSuccess = r.comments ?? r.comment_success ?? r.handled ?? 0;
      const scanned = Number(r.scanned || 0);
      const matched = Number(r.suitable || 0);
      const comments = Number(commentSuccess || 0);
      const clicks = Number(r.clicks || 0);
      const orders = Number(r.orders || 0);
      const commission = Number(r.commission || 0);
      const ratingInfo = window.evaluateGroupPerformance
        ? window.evaluateGroupPerformance({
            scanned,
            suitable: matched,
            comments,
            handled: r.handled,
            pending: r.pending,
            rejected: r.rejected,
            fail: r.fail,
            clicks,
            orders,
            commission,
            rating: r.rating,
          })
        : null;
      const rating = ratingInfo
        ? ratingInfo.rating
        : (r.rating === 'keep' ? 'recommend' : r.rating === 'watch' ? 'monitor' : r.rating || 'none');
      return {
        id,
        subid: r.subid || '',
        name: r.name,
        url: r.url,
        enabled: existing.enabled !== undefined ? existing.enabled : Boolean(r.enabled),
        action: existing.action || 'comment',
        lastScan: existing.lastScan || '',
        scanned,
        matched,
        comments,
        clicks,
        orders,
        commission,
        rating,
        ratingMeaning: ratingInfo?.statusMeaning || '',
      };
    });
  }, []);

  const fetchRef = React.useRef(null);
  fetchRef.current = (options = {}) => {
    const cacheKey = `${from}|${to}`;
    const cache = _tabGroupsState.statsCache;
    const cacheFresh = cache
      && cache.key === cacheKey
      && cache.version === dataVersion
      && Array.isArray(cache.rawRows)
      && Date.now() - cache.loadedAt < 60000;
    if (!options.force && cacheFresh) {
      statsRequestRef.current += 1;
      setStatsLoading(false);
      setRows(mapStatsRows(cache.rawRows));
      return Promise.resolve(cache.rawRows);
    }
    if (!window.backendApi?.refreshGroupPerformance) return Promise.resolve(null);

    const requestId = statsRequestRef.current + 1;
    statsRequestRef.current = requestId;
    setStatsLoading(true);
    return window.backendApi.refreshGroupPerformance({ from, to }).then((res) => {
      if (requestId !== statsRequestRef.current) return null;
      const data = res?.data?.rows;
      if (!res?.ok || !Array.isArray(data)) return;

      // Map by URL (reliable) để lấy action từ danh sách nhóm
      const byUrl = {};
      groupsRef.current.forEach((g) => { if (g.url) byUrl[g.url] = g; });

      const mapped = data.map((r) => {
        const existing = byUrl[r.url] || {};
        const id = r.id ?? r.groupId ?? r.group_id ?? existing.id ?? r.subid ?? r.url;
        const commentSuccess = r.comments ?? r.comment_success ?? r.handled ?? 0;
        const scanned = Number(r.scanned || 0);
        const matched = Number(r.suitable || 0);
        const comments = Number(commentSuccess || 0);
        const clicks = Number(r.clicks || 0);
        const orders = Number(r.orders || 0);
        const commission = Number(r.commission || 0);
        const ratingInfo = window.evaluateGroupPerformance
          ? window.evaluateGroupPerformance({
              scanned,
              suitable: matched,
              comments,
              handled: r.handled,
              pending: r.pending,
              rejected: r.rejected,
              fail: r.fail,
              clicks,
              orders,
              commission,
              rating: r.rating,
            })
          : null;
        const rating = ratingInfo
          ? ratingInfo.rating
          : (r.rating === 'keep' ? 'recommend' : r.rating === 'watch' ? 'monitor' : r.rating || 'none');
        return {
          id,
          subid: r.subid || '',
          name: r.name,
          url: r.url,
          enabled: existing.enabled !== undefined ? existing.enabled : Boolean(r.enabled),
          action: existing.action || 'comment',
          lastScan: existing.lastScan || '',
          scanned,
          matched,
          comments,
          clicks,
          orders,
          commission,
          rating,
          ratingMeaning: ratingInfo?.statusMeaning || '',
        };
      });
      _tabGroupsState.statsCache = {
        key: cacheKey,
        version: dataVersion,
        rawRows: data,
        loadedAt: Date.now(),
      };
      setRows(mapped);
      return data;
    }).finally(() => {
      if (requestId === statsRequestRef.current) setStatsLoading(false);
    });
  };

  React.useEffect(() => {
    if (!active) {
      statsActiveRef.current = false;
      return;
    }
    const prev = statsDepsRef.current;
    const initialized = prev.dataVersion !== null;
    const versionChanged = initialized && prev.dataVersion !== dataVersion;
    const becameActive = !statsActiveRef.current;
    statsActiveRef.current = true;
    statsDepsRef.current = { from, to, dataVersion };
    fetchRef.current({ force: becameActive || versionChanged });
  }, [active, from, to, dataVersion]);

  const clickSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' || key === 'id' ? 'asc' : 'desc'); }
  };

  const filtered = React.useMemo(() => {
    const s = search.toLowerCase();
    let out = rows.filter((g) => {
      const ratingLabel = (RATING_META[g.rating] || RATING_META.none).label.toLowerCase();
      return !s || g.name.toLowerCase().includes(s) || g.url.toLowerCase().includes(s) || ratingLabel.includes(s);
    });
    out = [...out].sort((a, b) => {
      let av, bv;
      if (sortKey === 'rating') { av = RATING_ORDER[a.rating] || 0; bv = RATING_ORDER[b.rating] || 0; }
      else { av = a[sortKey]; bv = b[sortKey]; }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return out;
  }, [rows, search, sortKey, sortDir]);

  const toggle = (id) => {
    setGroups((p) => p.map((g) => g.id === id ? { ...g, enabled: !g.enabled } : g));
    setRows((r) => r.map((row) => row.id === id ? { ...row, enabled: !row.enabled } : row));
  };
  const remove = async (row) => {
    if (!row) return;
    const ok = await appDialog.confirm({
      title: 'Xóa nhóm Facebook?',
      message: `Bạn có chắc muốn xóa nhóm "${row.name}" khỏi danh sách nhóm chính không?`,
      confirmText: 'Xóa nhóm',
      icon: 'trash',
      danger: true,
    });
    if (!ok) return;
    if (!window.backendApi?.deleteGroupFromStats) {
      appDialog.alert({ title: 'Backend chưa sẵn sàng', message: 'Backend bridge chưa sẵn sàng.', icon: 'alert' });
      return;
    }
    setDeletingId(row.id);
    window.backendApi.deleteGroupFromStats({ url: row.url }).then((res) => {
      setDeletingId(null);
      if (!res?.ok) {
        appDialog.alert({
          title: 'Không xóa được nhóm',
          message: res?.error || 'Backend trả về lỗi khi xóa nhóm.',
          icon: 'alert',
        });
        return;
      }
      setGroups((current) => current.filter((item) => item.id !== row.id));
      setRows((current) => current.filter((item) => item.id !== row.id));
      _tabGroupsState.statsCache = null;
      fetchRef.current?.({ force: true });
    }).catch((err) => {
      setDeletingId(null);
      appDialog.alert({
        title: 'Không xóa được nhóm',
        message: String(err?.message || err),
        icon: 'alert',
      });
    });
  };

  const startStatsNameResize = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = statsNameColWidth;
    const move = (ev) => {
      const width = Math.max(260, Math.min(760, startWidth + ev.clientX - startX));
      setStatsNameColWidth(width);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  const statsIdColWidth = 52;
  const statsScannedColWidth = 78;
  const statsMatchedColWidth = 98;
  const statsCommentsColWidth = 116;
  const statsClicksColWidth = 66;
  const statsOrdersColWidth = 58;
  const statsCommissionColWidth = 118;
  const statsRatingColWidth = 86;
  const statsActionsColWidth = 104;
  const statsTableWidth = statsIdColWidth + statsNameColWidth + statsScannedColWidth + statsMatchedColWidth
    + statsCommentsColWidth + statsClicksColWidth + statsOrdersColWidth + statsCommissionColWidth
    + statsRatingColWidth + statsActionsColWidth;

  const SortHeader = ({ k, children, num, center = false, resizable = false, onResizeStart, className = '' }) => {
    const active = sortKey === k;
    const alignStyle = center
      ? { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 2, width: '100%' }
      : { display: 'inline-flex', alignItems: 'center', gap: 2 };
    return (
      <th className={'sortable' + (active ? ' active' : '') + (num ? ' num' : '') + (center ? ' center' : '') + (resizable ? ' resizable-th' : '') + (className ? ' ' + className : '')}
          onClick={() => clickSort(k)}>
        {num ? (
          <span style={alignStyle}>
            <SortIndicator active={active} dir={sortDir} />{children}
          </span>
        ) : (
          <span style={alignStyle}>
            {children}<SortIndicator active={active} dir={sortDir} />
          </span>
        )}
        {resizable && (
          <span
            className="col-resizer"
            title="Kéo để đổi độ rộng cột"
            onMouseDown={onResizeStart}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </th>
    );
  };

  const setQuickAndDates = (value) => {
    setQuick(value);
    if (value === 'yesterday') {
      const y = groupDaysAgoValue(1);
      setFrom(y);
      setTo(y);
    } else if (value === '7days') {
      setFrom(groupDaysAgoValue(6));
      setTo(today);
    } else if (value === '30days') {
      setFrom(groupDaysAgoValue(29));
      setTo(today);
    }
  };

  const setCustomFrom = (value) => {
    setFrom(value);
    setQuick('');
  };

  const setCustomTo = (value) => {
    setTo(value);
    setQuick('');
  };

  return (
    <div className="section group-stats-section">
      <div className="section-hd">
        <QuickFilter value={quick} onChange={setQuickAndDates} options={[
          { value: 'yesterday', label: 'Hôm qua' },
          { value: '7days', label: '7 ngày' },
          { value: '30days', label: '30 ngày' },
        ]} />
        <div className="divider" style={{ alignSelf: 'stretch' }} />
        <DateInput value={from} onChange={setCustomFrom} label="Từ" />
        <DateInput value={to} onChange={setCustomTo} label="Đến" />
        <button className="btn sm" disabled={statsLoading} onClick={() => fetchRef.current({ force: true })}>
          <Icon name="refresh" size={12}/> Refresh
        </button>
        {statsLoading && <span className="dim-2" style={{ fontSize: 'var(--font-xs)' }}>Đang tải thống kê...</span>}
        <div className="spacer" />
        <span className="dim-2" style={{ fontSize: 'var(--font-xs)' }}>
          Sort: <b style={{ color: 'var(--fg-muted)' }}>{sortKey}</b> {sortDir === 'asc' ? '↑' : '↓'}
        </span>
        <SearchInput value={search} onChange={setSearch}
                     placeholder="Tìm theo tên, URL, đánh giá…" style={{ width: 260 }} />
      </div>
      <div className="tbl-wrap">
        <table className="tbl group-stats-table" style={{ minWidth: statsTableWidth, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: statsIdColWidth }} />
            <col style={{ width: statsNameColWidth }} />
            <col style={{ width: statsScannedColWidth }} />
            <col style={{ width: statsMatchedColWidth }} />
            <col style={{ width: statsCommentsColWidth }} />
            <col style={{ width: statsClicksColWidth }} />
            <col style={{ width: statsOrdersColWidth }} />
            <col style={{ width: statsCommissionColWidth }} />
            <col style={{ width: statsRatingColWidth }} />
            <col style={{ width: statsActionsColWidth }} />
          </colgroup>
          <thead>
            <tr>
              <SortHeader k="id" className="group-stats-id-col">ID</SortHeader>
              <SortHeader k="name" resizable onResizeStart={startStatsNameResize}>Nhóm</SortHeader>
              <SortHeader k="scanned" num center>Đã quét</SortHeader>
              <SortHeader k="matched" num center>Bài phù hợp</SortHeader>
              <SortHeader k="comments" num center>CMT thành công</SortHeader>
              <SortHeader k="clicks" num center>Click</SortHeader>
              <SortHeader k="orders" num center>Đơn</SortHeader>
              <SortHeader k="commission" num center>Hoa hồng (đ)</SortHeader>
              <SortHeader k="rating" className="group-stats-rating-col">Đánh giá</SortHeader>
              <th className="group-stats-actions-col" style={{ width: statsActionsColWidth }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g) => {
              const r = RATING_META[g.rating] || RATING_META.none;
              const displayId = g.id || g.subid || '-';
              const displayUrl = cleanGroupUrl(g.url);
              return (
                <tr key={g.id} style={{ opacity: g.enabled ? 1 : 0.55 }}>
                  <td className="mono dim group-stats-id-cell" title={String(displayId)}>{displayId}</td>
                  <td className="group-stats-group-cell">
                    {/* Badge nằm cùng dòng với tên nhóm */}
                    <div className="group-stats-group-main">
                      <ActionBadge action={g.action} />
                      <div className="group-stats-group-text">
                        <div className="group-stats-group-name" title={g.name}>{g.name}</div>
                        <div className="mono dim-2 group-stats-group-url" title={g.url}>{displayUrl}</div>
                      </div>
                    </div>
                  </td>
                  <td className="center mono">{fmt.num(g.scanned)}</td>
                  <td className="center mono">{fmt.num(g.matched)}</td>
                  <td className="center mono">{fmt.num(g.comments)}</td>
                  <td className="center mono">{fmt.num(g.clicks)}</td>
                  <td className="center mono">{g.orders}</td>
                  <td className="num mono group-stats-commission-cell"><b>{fmt.vnd(g.commission)}</b></td>
                  <td className="group-stats-rating-col">
                    <Badge kind={r.cls} title={g.ratingMeaning || r.label}>{r.label}</Badge>
                  </td>
                  <td className="group-stats-actions-col">
                    <div className="row-actions">
                      <button className="btn sm ghost"
                              data-tooltip={g.enabled ? 'Tắt nhóm trong thống kê' : 'Bật nhóm trong thống kê'}
                              aria-label={g.enabled ? 'Tắt nhóm trong thống kê' : 'Bật nhóm trong thống kê'}
                              onClick={() => toggle(g.id)}>
                        {g.enabled ? 'Tắt' : 'Bật'}
                      </button>
                      <button className="btn sm ghost" data-tooltip="Xóa nhóm khỏi danh sách chính" aria-label="Xóa nhóm khỏi danh sách chính"
                              disabled={deletingId === g.id}
                              onClick={() => remove(g)}>
                        <Icon name="trash" size={12}/>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <TableEmptyRow colSpan={10} padding={32} />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const SURVEY_STATUS_META = {
  draft: { label: 'Nháp', kind: '' },
  running: { label: 'Đang khảo sát', kind: 'accent' },
  done: { label: 'Hoàn thành', kind: 'ok' },
  stopped: { label: 'Đã dừng', kind: 'warn' },
  error: { label: 'Lỗi', kind: 'danger' },
};

const SURVEY_RATING_OPTIONS = [
  { value: 'good', label: 'Tốt', kind: 'ok' },
  { value: 'demand', label: 'Có nhu cầu', kind: 'info' },
  { value: 'consider', label: 'Cân nhắc', kind: 'accent' },
  { value: 'low', label: 'Ít nhu cầu', kind: 'warn' },
  { value: 'not_fit', label: 'Không phù hợp', kind: 'danger' },
  { value: 'none', label: 'Chưa có dữ liệu', kind: '' },
];

function GroupSurvey({ dataVersion = 0, onGroupsChanged }) {
  const appDialog = useAppDialog();
  const [surveys, setSurveys] = React.useState([]);
  const [activeId, _setActiveId] = React.useState(_tabGroupsState.surveyActiveId);
  const [detail, setDetail] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState('');
  const [surveyName, setSurveyName] = React.useState('');
  const [surveyUrls, setSurveyUrls] = React.useState('');
  const [postsPerGroup, setPostsPerGroup] = React.useState(100);
  const [bulkDialog, setBulkDialog] = React.useState(null);
  const [showSurveyExport, setShowSurveyExport] = React.useState(false);
  const [surveyExportType, setSurveyExportType] = React.useState('all');
  const [surveyDeleteBusyId, setSurveyDeleteBusyId] = React.useState(0);

  const setActiveId = React.useCallback((value) => {
    _tabGroupsState.surveyActiveId = value;
    _setActiveId(value);
  }, []);

  const recomputeSummary = React.useCallback((survey, groups) => {
    const totalScanned = (groups || []).reduce((sum, row) => sum + Number(row.scanned || 0), 0);
    const totalKeywordHits = (groups || []).reduce((sum, row) => sum + Number(row.keywordHits || 0), 0);
    const totalSuitable = (groups || []).reduce((sum, row) => sum + Number(row.suitable || 0), 0);
    const scannedGroups = (groups || []).filter((row) => ['done', 'skipped'].includes(String(row.status || ''))).length;
    const counts = { good: 0, demand: 0, consider: 0, low: 0, not_fit: 0, none: 0 };
    (groups || []).forEach((row) => {
      const rating = String(row.rating || 'none');
      if (Object.prototype.hasOwnProperty.call(counts, rating)) counts[rating] += 1;
      else counts.none += 1;
    });
    return {
      ...survey,
      totalGroups: groups?.length || 0,
      scannedGroups,
      totalScanned,
      totalKeywordHits,
      totalSuitable,
      fitRate: totalScanned ? Number(((totalSuitable / totalScanned) * 100).toFixed(2)) : 0,
      counts,
      groups,
    };
  }, []);

  const loadDetail = React.useCallback((surveyId, options = {}) => {
    const targetId = Number(surveyId || 0);
    if (!targetId || !window.backendApi?.loadGroupSurveyDetail) {
      if (!options.silent) setDetail(null);
      return Promise.resolve(null);
    }
    if (!options.silent) setDetailLoading(true);
    return window.backendApi.loadGroupSurveyDetail({ surveyId: targetId }).then((res) => {
      if (!res?.ok || !res.data?.survey) {
        if (!options.silent) setDetail(null);
        return null;
      }
      setDetail(res.data.survey);
      return res.data.survey;
    }).finally(() => {
      if (!options.silent) setDetailLoading(false);
    });
  }, []);

  const loadSurveys = React.useCallback((preferredId = null) => {
    if (!window.backendApi?.loadGroupSurveys) return Promise.resolve(null);
    setLoading(true);
    return window.backendApi.loadGroupSurveys().then((res) => {
      if (!res?.ok || !Array.isArray(res.data?.surveys)) return null;
      const next = res.data.surveys;
      setSurveys(next);
      const resolvedId = Number(preferredId || activeId || 0);
      const selectedId = next.some((row) => row.id === resolvedId) ? resolvedId : (next[0]?.id || null);
      setActiveId(selectedId);
      if (selectedId) return loadDetail(selectedId, { silent: true });
      setDetail(null);
      return null;
    }).finally(() => setLoading(false));
  }, [activeId, loadDetail, setActiveId]);

  React.useEffect(() => {
    loadSurveys();
  }, [loadSurveys]);

  React.useEffect(() => {
    if (dataVersion) loadSurveys(activeId);
  }, [dataVersion]);

  React.useEffect(() => {
    const handler = (event) => {
      const detailPayload = event?.detail || {};
      if (detailPayload.type === 'group_survey_progress') {
        const payload = detailPayload.payload || {};
        if (Number(payload.surveyId || 0) !== Number(activeId || 0)) return;
        setDetail((prev) => {
          if (!prev || Number(prev.id || 0) !== Number(payload.surveyId || 0)) return prev;
          const groups = (prev.groups || []).map((row) => Number(row.id || 0) === Number(payload.groupRowId || 0) ? {
            ...row,
            groupName: payload.groupName || row.groupName,
            groupUrl: payload.groupUrl || row.groupUrl,
            status: 'running',
            scanned: Number(payload.scanned || 0),
            keywordHits: Number(payload.keyword_hits || payload.keywordHits || 0),
            suitable: Number(payload.suitable || 0),
            fitRate: Number(payload.fit_rate || payload.fitRate || 0),
            topKeywords: Array.isArray(payload.top_keywords) ? payload.top_keywords : row.topKeywords,
          } : row);
          return recomputeSummary({ ...prev, status: 'running' }, groups);
        });
        return;
      }
      if (detailPayload.type === 'group_survey_bulk_delete_done') {
        const surveyId = Number(detailPayload.surveyId || 0);
        const nextSurvey = detailPayload.survey || null;
        setSurveyDeleteBusyId((prev) => (Number(prev || 0) === surveyId ? 0 : prev));
        if (nextSurvey) {
          setSurveys((prev) => prev.map((row) => (
            Number(row.id || 0) === surveyId ? { ...row, ...nextSurvey } : row
          )));
          if (surveyId === Number(activeId || 0)) setDetail(nextSurvey);
        } else {
          loadSurveys(surveyId);
          if (surveyId === Number(activeId || 0)) loadDetail(surveyId, { silent: true });
        }
        appDialog.alert({
          title: 'Đã xóa nhóm khỏi khảo sát',
          message: `Đã xóa ${fmt.num(detailPayload.deleted || 0)} group khỏi phiên khảo sát hiện tại.`,
          icon: 'trash',
        });
        return;
      }
      if (detailPayload.type === 'group_survey_bulk_delete_failed') {
        const surveyId = Number(detailPayload.surveyId || 0);
        setSurveyDeleteBusyId((prev) => (Number(prev || 0) === surveyId ? 0 : prev));
        appDialog.alert({
          title: 'Không xóa được nhóm',
          message: detailPayload.error || 'Backend trả về lỗi khi xóa nhóm theo trạng thái.',
          icon: 'alert',
        });
        return;
      }
      if (detailPayload.type === 'group_surveys') {
        const preferredId = Number(detailPayload.surveyId || activeId || 0);
        loadSurveys(preferredId);
        if (preferredId) loadDetail(preferredId, { silent: true });
      }
    };
    window.addEventListener('backend:data-changed', handler);
    return () => window.removeEventListener('backend:data-changed', handler);
  }, [activeId, appDialog, loadDetail, loadSurveys, recomputeSummary]);

  const activeSurvey = detail || surveys.find((row) => row.id === activeId) || null;
  const isRunning = String(activeSurvey?.status || '') === 'running';
  const canCreate = surveyUrls.split('\n').filter((line) => line.trim()).length > 0 && !creating;
  const bulkRatings = bulkDialog?.ratings || [];
  const bulkRatingSet = React.useMemo(() => new Set(bulkRatings), [bulkRatings]);
  const deleteBusy = !!activeSurvey?.id && Number(surveyDeleteBusyId || 0) === Number(activeSurvey.id || 0);
  const bulkMatchCount = React.useMemo(() => {
    if (!activeSurvey || !bulkDialog || bulkRatings.length === 0) return 0;
    return (activeSurvey.groups || []).filter((row) => bulkRatingSet.has(String(row.rating || 'none'))).length;
  }, [activeSurvey, bulkDialog, bulkRatings, bulkRatingSet]);
  const bulkOptions = React.useMemo(() => {
    const counts = activeSurvey?.counts || {};
    return SURVEY_RATING_OPTIONS.map((option) => ({
      ...option,
      count: Number(counts[option.value] || 0),
    }));
  }, [activeSurvey]);
  const surveyExportUrls = React.useMemo(() => {
    const groups = activeSurvey?.groups || [];
    const source = surveyExportType === 'scanned'
      ? groups.filter((row) => ['done', 'skipped'].includes(String(row.status || '')))
      : surveyExportType === 'pending'
        ? groups.filter((row) => ['pending', 'running', 'error'].includes(String(row.status || '')))
        : groups;
    return source.map((row) => cleanGroupUrl(row.groupUrl)).filter(Boolean);
  }, [activeSurvey, surveyExportType]);
  const surveyExportText = surveyExportUrls.join('\n');
  const copySurveyExportUrls = () => {
    if (!surveyExportText) return;
    if (copyToClipboard(surveyExportText)) {
      appDialog.alert({ title: 'Đã copy danh sách group', message: `Đã copy ${surveyExportUrls.length} link vào clipboard.`, icon: 'success' });
    } else {
      appDialog.alert({ title: 'Không copy được', message: 'Không thể sao chép danh sách group. Hãy bôi đen nội dung rồi nhấn Ctrl+C.', icon: 'alert' });
    }
  };

  const createSurvey = () => {
    if (!window.backendApi?.createGroupSurvey) {
      appDialog.alert({ title: 'Backend chưa sẵn sàng', message: 'Backend bridge chưa sẵn sàng.', icon: 'alert' });
      return;
    }
    setCreating(true);
    window.backendApi.createGroupSurvey({
      name: surveyName.trim(),
      urls: surveyUrls,
      postsPerGroup,
    }).then((res) => {
      if (!res?.ok || !res.data?.survey) {
        appDialog.alert({
          title: 'Không tạo được khảo sát',
          message: res?.error || 'Backend trả về lỗi khi tạo khảo sát.',
          icon: 'alert',
        });
        return;
      }
      setSurveyName('');
      setSurveyUrls('');
      setPostsPerGroup(100);
      setDetail(res.data.survey);
      setActiveId(res.data.survey.id);
      loadSurveys(res.data.survey.id);
    }).finally(() => setCreating(false));
  };

  const startSurvey = () => {
    if (!activeSurvey?.id || !window.backendApi?.startGroupSurvey) return;
    setActionLoading('start');
    window.backendApi.startGroupSurvey({ surveyId: activeSurvey.id }).then((res) => {
      if (!res?.ok) {
        appDialog.alert({
          title: 'Không bắt đầu được khảo sát',
          message: res?.error || 'Backend trả về lỗi khi bắt đầu khảo sát.',
          icon: 'alert',
        });
        return;
      }
      loadSurveys(activeSurvey.id);
    }).finally(() => setActionLoading(''));
  };

  const stopSurvey = () => {
    if (!window.backendApi?.stopGroupSurvey) return;
    setActionLoading('stop');
    window.backendApi.stopGroupSurvey().then((res) => {
      if (!res?.ok) {
        appDialog.alert({
          title: 'Không dừng được khảo sát',
          message: res?.error || 'Backend trả về lỗi khi dừng khảo sát.',
          icon: 'alert',
        });
      }
    }).finally(() => setActionLoading(''));
  };

  const removeSurvey = async () => {
    if (!activeSurvey?.id || !window.backendApi?.deleteGroupSurvey) return;
    const ok = await appDialog.confirm({
      title: 'Xóa phiên khảo sát?',
      message: `Phiên "${activeSurvey.name}" sẽ bị xóa cùng toàn bộ kết quả khảo sát của phiên này.`,
      confirmText: 'Xóa khảo sát',
      icon: 'trash',
      danger: true,
    });
    if (!ok) return;
    setActionLoading('delete');
    window.backendApi.deleteGroupSurvey({ surveyId: activeSurvey.id }).then((res) => {
      if (!res?.ok) {
        appDialog.alert({
          title: 'Không xóa được khảo sát',
          message: res?.error || 'Backend trả về lỗi khi xóa khảo sát.',
          icon: 'alert',
        });
        return;
      }
      setDetail(null);
      setActiveId(null);
      loadSurveys();
    }).finally(() => setActionLoading(''));
  };

  const addOneGroup = (row) => {
    if (!row?.id || !window.backendApi?.addSurveyGroupToGroups) return;
    setActionLoading(`add:${row.id}`);
    window.backendApi.addSurveyGroupToGroups({ surveyId: activeSurvey.id, groupRowId: row.id }).then((res) => {
      if (!res?.ok) {
        appDialog.alert({
          title: 'Không thêm được nhóm',
          message: res?.error || 'Backend trả về lỗi khi thêm nhóm.',
          icon: 'alert',
        });
        return;
      }
      if (Array.isArray(res.data?.groups)) onGroupsChanged?.(res.data.groups);
      if (res.data?.survey) setDetail(res.data.survey);
      loadSurveys(activeSurvey.id);
    }).finally(() => setActionLoading(''));
  };

  const openBulkDialog = (mode) => {
    if (!activeSurvey?.id) return;
    setBulkDialog({ mode, ratings: [] });
  };

  const bulkActionKey = bulkDialog?.mode === 'delete' ? 'bulk-delete' : 'bulk-add';
  const bulkBusy = !!bulkDialog && actionLoading === bulkActionKey;

  const closeBulkDialog = () => {
    if (bulkBusy) return;
    setBulkDialog(null);
  };
  const forceCloseBulkDialog = () => setBulkDialog(null);

  const toggleBulkRating = (rating, checked) => {
    setBulkDialog((prev) => {
      if (!prev) return prev;
      const current = new Set(prev.ratings || []);
      if (checked) current.add(rating);
      else current.delete(rating);
      return { ...prev, ratings: Array.from(current) };
    });
  };

  const runBulkSurveyAction = () => {
    if (!activeSurvey?.id || !bulkDialog || bulkRatings.length === 0) return;
    const isDelete = bulkDialog.mode === 'delete';
    if (isDelete && bulkMatchCount <= 0) {
      appDialog.alert({
        title: 'Không có group để xóa',
        message: 'Trạng thái đang chọn hiện không còn group nào trong phiên khảo sát này.',
        icon: 'alert',
      });
      return;
    }
    const actionKey = isDelete ? 'bulk-delete' : 'bulk-add';
    const surveyId = activeSurvey.id;
    setActionLoading(actionKey);
    let request;
    try {
      request = isDelete
        ? window.backendApi?.bulkDeleteSurveyGroupsToBlacklist?.({ surveyId: activeSurvey.id, ratings: bulkRatings })
        : window.backendApi?.bulkAddSurveyGroupsToGroups?.({ surveyId: activeSurvey.id, ratings: bulkRatings });
    } catch (err) {
      setActionLoading('');
      appDialog.alert({
        title: isDelete ? 'Không xóa được nhóm' : 'Không thêm được nhóm',
        message: String(err?.message || err || 'Không gọi được backend.'),
        icon: 'alert',
      });
      return;
    }
    if (!request) {
      setActionLoading('');
      return;
    }
    Promise.resolve(request).then((res) => {
      if (!res?.ok) {
        appDialog.alert({
          title: isDelete ? 'Không xóa được nhóm' : 'Không thêm được nhóm',
          message: res?.error || (isDelete
            ? 'Backend trả về lỗi khi xóa nhóm theo trạng thái.'
            : 'Backend trả về lỗi khi thêm nhóm theo trạng thái.'),
          icon: 'alert',
        });
        return;
      }
      if (isDelete) {
        if (res.data?.queued) {
          setSurveyDeleteBusyId(Number(surveyId || 0));
          forceCloseBulkDialog();
          return;
        }
        setDetail((prev) => {
          if (!prev || Number(prev.id || 0) !== Number(surveyId || 0)) return prev;
          const nextGroups = (prev.groups || []).filter((row) => !bulkRatingSet.has(String(row.rating || 'none')));
          const nextSurvey = recomputeSummary(prev, nextGroups);
          setSurveys((current) => current.map((row) => (
            Number(row.id || 0) === Number(nextSurvey.id || 0)
              ? { ...row, ...nextSurvey }
              : row
          )));
          return nextSurvey;
        });
      } else {
        const nextSurvey = res.data?.survey || null;
        if (nextSurvey) {
          setDetail(nextSurvey);
          setSurveys((prev) => prev.map((row) => (
            Number(row.id || 0) === Number(nextSurvey.id || 0)
              ? { ...row, ...nextSurvey }
              : row
          )));
        }
        if (Array.isArray(res.data?.groups)) onGroupsChanged?.(res.data.groups);
        loadSurveys(surveyId);
      }
      forceCloseBulkDialog();
      appDialog.alert({
        title: isDelete ? 'Đã xóa nhóm khỏi khảo sát' : 'Đã thêm nhóm theo trạng thái',
        message: isDelete
          ? `Đã xóa ${fmt.num(res.data?.deleted || 0)} group khỏi phiên khảo sát hiện tại.`
          : `Đã thêm ${fmt.num(res.data?.added || 0)} nhóm. Bỏ qua ${fmt.num(res.data?.duplicates || 0)} nhóm đã có sẵn và ${fmt.num((res.data?.blacklisted || []).length || 0)} nhóm đang nằm trong blacklist.`,
        icon: isDelete ? 'trash' : 'check',
      });
    }).catch((err) => {
      appDialog.alert({
        title: isDelete ? 'Không xóa được nhóm' : 'Không thêm được nhóm',
        message: String(err?.message || err || 'Backend không phản hồi.'),
        icon: 'alert',
      });
    }).finally(() => setActionLoading(''));
  };

  const deleteSurveyGroup = async (row) => {
    if (!row?.id || !window.backendApi?.deleteSurveyGroup) return;
    const ok = await appDialog.confirm({
      title: 'Xóa group khỏi khảo sát?',
      message: `Group "${row.groupName}" sẽ bị xóa khỏi phiên khảo sát hiện tại.`,
      confirmText: 'Xóa group',
      icon: 'trash',
      danger: true,
    });
    if (!ok) return;
    setActionLoading(`remove:${row.id}`);
    window.backendApi.deleteSurveyGroup({ groupRowId: row.id }).then((res) => {
      if (!res?.ok || !res.data?.survey) {
        appDialog.alert({
          title: 'Không xóa được group',
          message: res?.error || 'Backend trả về lỗi khi xóa group khỏi khảo sát.',
          icon: 'alert',
        });
        return;
      }
      setDetail(res.data.survey);
      loadSurveys(res.data.survey.id);
    }).finally(() => setActionLoading(''));
  };

  return (
    <div className="group-survey-layout">
      <div className="section group-survey-panel group-survey-create-panel">
        <div className="section-hd"><h3>Tạo khảo sát mới</h3></div>
        <div className="section-body group-survey-panel-body">
          <div className="field">
            <label className="field-label">Tên phiên</label>
            <input className="input" value={surveyName} onChange={(e) => setSurveyName(e.target.value)} placeholder="Ví dụ: Khảo sát nhóm mẹ và bé" />
          </div>
          <div className="field">
            <label className="field-label">Số bài mỗi group</label>
            <input className="input mono" type="number" min="1" max="500" value={postsPerGroup}
                   onChange={(e) => setPostsPerGroup(Math.max(1, Number(e.target.value || 100)))} />
          </div>
          <div className="field group-survey-url-field">
            <label className="field-label">Danh sách link group</label>
            <textarea
              className="textarea mono group-survey-url-input"
              rows={12}
              value={surveyUrls}
              onChange={(e) => setSurveyUrls(e.target.value)}
              placeholder="Mỗi dòng là một link group Facebook"
            />
          </div>
          <div className="group-survey-actions">
            <button className="btn primary" disabled={!canCreate} onClick={createSurvey}>
              <Icon name="plus" size={12}/> {creating ? 'Đang tạo...' : 'Tạo khảo sát'}
            </button>
            <button className="btn ghost" disabled={loading} onClick={() => loadSurveys(activeId)}>
              <Icon name="refresh" size={12}/> Refresh
            </button>
          </div>

          <div className="group-survey-subtitle">Phiên khảo sát</div>
          <div className="group-survey-list">
            {surveys.length === 0 && (
              <div className="group-survey-empty dim center">
                Chưa có phiên khảo sát nào.
              </div>
            )}
            {surveys.map((survey) => {
              const meta = SURVEY_STATUS_META[survey.status] || SURVEY_STATUS_META.draft;
              const isActive = Number(activeId || 0) === Number(survey.id || 0);
              const fitRate = Number(survey.fitRate || 0);
              return (
                <button
                  key={survey.id}
                  type="button"
                  className={'btn ghost group-survey-session' + (isActive ? ' active' : '')}
                  onClick={() => {
                    setActiveId(survey.id);
                    loadDetail(survey.id);
                  }}
                  title={survey.name}
                >
                  <div className="group-survey-session-head">
                    <strong className="group-survey-session-name">{survey.name}</strong>
                    <Badge kind={meta.kind}>{meta.label}</Badge>
                  </div>
                  <div className="group-survey-session-meta dim-2">
                    {survey.scannedGroups}/{survey.totalGroups} nhóm • {fmt.num(survey.totalSuitable)} bài phù hợp • {fitRate.toFixed(2)}%
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="section group-survey-panel">
        <div className="section-hd group-survey-detail-hd">
          <h3 className="group-survey-detail-title" title={activeSurvey?.name || 'Chi tiết khảo sát'}>{activeSurvey?.name || 'Chi tiết khảo sát'}</h3>
          {activeSurvey && <Badge kind={(SURVEY_STATUS_META[activeSurvey.status] || SURVEY_STATUS_META.draft).kind}>{(SURVEY_STATUS_META[activeSurvey.status] || SURVEY_STATUS_META.draft).label}</Badge>}
          <div className="spacer" />
          <div className="group-survey-header-actions">
            <button className="btn sm" disabled={!activeSurvey?.id || isRunning || !!actionLoading} onClick={startSurvey}>
              <Icon name="play" size={12}/> {actionLoading === 'start' ? 'Đang bắt đầu...' : 'Bắt đầu'}
            </button>
            <button className="btn sm ghost" disabled={!isRunning || !!actionLoading} onClick={stopSurvey}>
              <Icon name="pause" size={12}/> {actionLoading === 'stop' ? 'Đang dừng...' : 'Dừng'}
            </button>
            <button className="btn sm ghost" disabled={!activeSurvey?.id || !!actionLoading} onClick={() => openBulkDialog('add')}>
              Thêm
            </button>
            <button className="btn sm ghost danger" disabled={!activeSurvey?.id || !!actionLoading || deleteBusy} onClick={() => openBulkDialog('delete')}>
              {deleteBusy ? 'Đang xóa...' : 'Xóa'}
            </button>
            <button className="btn sm" disabled={!activeSurvey?.id || !!actionLoading} onClick={() => { setSurveyExportType('all'); setShowSurveyExport(true); }}>
              <Icon name="download" size={12}/> Xuất
            </button>
            <button className="btn sm danger" disabled={!activeSurvey?.id || !!actionLoading} onClick={removeSurvey}>
              <Icon name="trash" size={12}/> Xóa phiên
            </button>
          </div>
        </div>

        {!activeSurvey && !detailLoading && (
          <div className="section-body group-survey-panel-body">
            <div className="center dim" style={{ padding: 40 }}>
              Chọn một phiên khảo sát để xem chi tiết.
            </div>
          </div>
        )}

        {activeSurvey && (
          <div className="section-body group-survey-panel-body">
            <div className="group-survey-stats">
              <div className="stat-card"><div className="lbl">Nhóm đã quét</div><div className="val">{fmt.num(activeSurvey.scannedGroups || 0)}/{fmt.num(activeSurvey.totalGroups || 0)}</div></div>
              <div className="stat-card"><div className="lbl">Bài đã quét</div><div className="val">{fmt.num(activeSurvey.totalScanned || 0)}</div></div>
              <div className="stat-card"><div className="lbl">Bài phù hợp</div><div className="val">{fmt.num(activeSurvey.totalSuitable || 0)}</div></div>
              <div className="stat-card"><div className="lbl">Tỷ lệ phù hợp</div><div className="val">{Number(activeSurvey.fitRate || 0).toFixed(2)}%</div></div>
            </div>

            <div className="group-survey-rating-summary dim-2">
              Tốt: {activeSurvey.counts?.good || 0} • Có nhu cầu: {activeSurvey.counts?.demand || 0} • Cân nhắc: {activeSurvey.counts?.consider || 0} • Ít nhu cầu: {activeSurvey.counts?.low || 0} • Không phù hợp: {activeSurvey.counts?.not_fit || 0}
            </div>

            <div className="tbl-wrap group-survey-table-wrap">
              <table className="tbl group-survey-table">
                <colgroup>
                  <col className="group-survey-status-col" />
                  <col className="group-survey-group-col" />
                  <col className="group-survey-num-col" />
                  <col className="group-survey-num-col" />
                  <col className="group-survey-num-col" />
                  <col className="group-survey-rate-col" />
                  <col className="group-survey-keyword-col" />
                  <col className="group-survey-rating-col" />
                  <col className="group-survey-actions-col" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Trạng thái</th>
                    <th>Group</th>
                    <th className="num">Đã quét</th>
                    <th className="num">Keyword</th>
                    <th className="num">Phù hợp</th>
                    <th className="num">Tỷ lệ</th>
                    <th>Top keyword</th>
                    <th>Đánh giá</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(activeSurvey.groups || []).map((row) => (
                    <tr key={row.id}>
                      <td className="group-survey-status-cell">
                        <Badge kind={(SURVEY_STATUS_META[row.status] || SURVEY_STATUS_META.draft).kind}>
                          {(SURVEY_STATUS_META[row.status] || SURVEY_STATUS_META.draft).label}
                        </Badge>
                      </td>
                      <td>
                        <div className="group-survey-group-name truncate" title={row.groupName}>{row.groupName}</div>
                        <div className="mono dim-2 truncate" title={row.groupUrl}>{cleanGroupUrl(row.groupUrl)}</div>
                        {!!row.error && <div className="dim-2 truncate" title={row.error} style={{ color: 'var(--danger)' }}>{row.error}</div>}
                      </td>
                      <td className="num mono">{fmt.num(row.scanned || 0)}</td>
                      <td className="num mono">{fmt.num(row.keywordHits || 0)}</td>
                      <td className="num mono">{fmt.num(row.suitable || 0)}</td>
                      <td className="num mono">{Number(row.fitRate || 0).toFixed(2)}%</td>
                      <td className="truncate" title={(row.topKeywords || []).join(', ') || 'Chưa có'}>
                        {(row.topKeywords || []).join(', ') || 'Chưa có'}
                      </td>
                      <td className="group-survey-rating-cell">
                        <Badge kind={row.ratingKind || ''} title={row.ratingMeaning || row.ratingLabel}>{row.ratingLabel}</Badge>
                      </td>
                      <td className="group-survey-actions-cell">
                        <div className="row-actions">
                          <button className="btn sm ghost" onClick={() => openBackendLink('group', row.groupUrl, appDialog)}>
                            <Icon name="external" size={12}/>
                          </button>
                          <button className="btn sm ghost" disabled={!!row.addedToGroups || String(row.status || '') === 'running' || actionLoading === `add:${row.id}`}
                                  onClick={() => addOneGroup(row)}>
                            {row.addedToGroups ? 'Đã thêm' : 'Thêm'}
                          </button>
                          <button className="btn sm ghost danger" disabled={String(row.status || '') === 'running' || actionLoading === `remove:${row.id}`}
                                  onClick={() => deleteSurveyGroup(row)}>
                            <Icon name="trash" size={12}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(activeSurvey.groups || []).length === 0 && !detailLoading && (
                    <TableEmptyRow colSpan={9} padding={30} />
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showSurveyExport && (
        <Dialog title="Xuất group khảo sát" width={680} onClose={() => setShowSurveyExport(false)}
                footer={<>
                  <button className="btn" onClick={() => setShowSurveyExport(false)}>Đóng</button>
                  <button className="btn" disabled={!surveyExportText} onClick={copySurveyExportUrls}>Copy</button>
                  <button className="btn primary" disabled={!surveyExportText} onClick={() => {
                    window.backendApi?.exportGroupsTxt?.({
                      urls: surveyExportUrls,
                      filename: `group_khao_sat_${activeSurvey?.id || 'danh_sach'}.txt`,
                    }).then((res) => {
                      if (res?.ok && !res.data?.cancelled) {
                        appDialog.alert({ title: 'Đã lưu file', message: `Đã lưu ${res.data.count} link vào:\n${res.data.path}`, icon: 'success' });
                        setShowSurveyExport(false);
                      } else if (res && !res.ok) {
                        appDialog.alert({ title: 'Không lưu được file', message: res.error || 'Có lỗi khi lưu file TXT.', icon: 'alert' });
                      }
                    });
                  }}>Lưu file TXT</button>
                </>}>
          <div className="field">
            <label className="field-label">Loại danh sách</label>
            <select className="select" value={surveyExportType} onChange={(e) => setSurveyExportType(e.target.value)}>
              <option value="all">Tất cả group ({activeSurvey?.groups?.length || 0})</option>
              <option value="scanned">Group đã quét ({(activeSurvey?.groups || []).filter((row) => ['done', 'skipped'].includes(String(row.status || ''))).length})</option>
              <option value="pending">Group chưa hoàn tất/lỗi ({(activeSurvey?.groups || []).filter((row) => ['pending', 'running', 'error'].includes(String(row.status || ''))).length})</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label">Danh sách link ({surveyExportUrls.length})</label>
            <textarea className="textarea mono" rows={14} value={surveyExportText} readOnly
                      placeholder="Chưa có group để xuất" />
          </div>
        </Dialog>
      )}
      {bulkDialog && (
        <Dialog
          title={bulkDialog.mode === 'delete' ? 'Chọn trạng thái để xóa' : 'Chọn trạng thái để thêm'}
          width={560}
          onClose={() => {
            if (!bulkBusy) closeBulkDialog();
          }}
          footer={(
            <>
              <button className="btn" disabled={bulkBusy} onClick={closeBulkDialog}>Hủy</button>
              <button
                className={'btn ' + (bulkDialog.mode === 'delete' ? 'danger' : 'primary')}
                disabled={bulkRatings.length === 0 || !!actionLoading || (bulkDialog.mode === 'delete' && bulkMatchCount <= 0)}
                onClick={runBulkSurveyAction}>
                {bulkBusy
                  ? (bulkDialog.mode === 'delete' ? `Đang xóa ${fmt.num(bulkMatchCount)} group...` : 'Đang thêm...')
                  : (bulkDialog.mode === 'delete' ? 'Xóa khỏi khảo sát' : 'Thêm vào nhóm FB')}
              </button>
            </>
          )}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="field-help">
              {bulkDialog.mode === 'delete'
                ? 'Chọn một hoặc nhiều trạng thái. Các group khớp trạng thái sẽ bị xóa khỏi phiên khảo sát hiện tại. Danh sách nhóm FB chính không bị ảnh hưởng.'
                : 'Chọn một hoặc nhiều trạng thái. Các group khớp trạng thái sẽ được thêm vào danh sách nhóm FB.'}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {bulkOptions.map((option) => (
                <div
                  key={option.value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    justifyContent: 'space-between',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    background: bulkRatingSet.has(option.value) ? 'rgba(59,130,246,0.08)' : 'transparent',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Checkbox
                      checked={bulkRatingSet.has(option.value)}
                      onChange={(checked) => toggleBulkRating(option.value, checked)}
                    />
                    <Badge kind={option.kind}>{option.label}</Badge>
                  </div>
                  <span className="mono dim-2">{fmt.num(option.count)} group</span>
                </div>
              ))}
            </div>
            <div className="dim-2" style={{ fontSize: 'var(--font-xs)' }}>
              Đang chọn {fmt.num(bulkRatings.length)} trạng thái • Khớp {fmt.num(bulkMatchCount)} group trong phiên khảo sát này
            </div>
            {bulkDialog.mode === 'delete' && bulkRatings.length > 0 && bulkMatchCount <= 0 && !bulkBusy && (
              <div className="dim-2" style={{ fontSize: 'var(--font-xs)', color: 'var(--danger)' }}>
                Không có group nào khớp để xóa. Hãy chọn trạng thái khác.
              </div>
            )}
            {bulkBusy && (
              <div className="dim-2" style={{ fontSize: 'var(--font-xs)', color: 'var(--accent)' }}>
                Đang xử lý dữ liệu khảo sát, vui lòng chờ trong giây lát...
              </div>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}

function SortIndicator({ active, dir }) {
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

function InlineEditInput({ value, onSave, onCancel, className = '' }) {
  const [draft, setDraft] = React.useState(value || '');
  const inputRef = React.useRef(null);
  const cancelledRef = React.useRef(false);

  React.useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  const commit = () => { if (cancelledRef.current) return; onSave(draft); };

  return (
    <input ref={inputRef}
           className={'input sm inline-edit-input ' + className}
           value={draft}
           draggable={false}
           onChange={(e) => setDraft(e.target.value)}
           onBlur={commit}
           onMouseDown={(e) => e.stopPropagation()}
           onDoubleClick={(e) => e.stopPropagation()}
           onKeyDown={(e) => {
             if (e.key === 'Enter') { e.preventDefault(); commit(); }
             else if (e.key === 'Escape') { e.preventDefault(); cancelledRef.current = true; onCancel(); }
           }} />
  );
}

window.RunHistory = RunHistory;
window.TabGroups = TabGroups;

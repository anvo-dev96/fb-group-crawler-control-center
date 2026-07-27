/* tab-config.jsx — settings with subtabs */

function copyTextToClipboard(text) {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  } catch (err) {
    return false;
  }
}

const DEFAULT_BUYER_INTENT_KEYWORDS_TEXT = [
  'cần mua',
  'muốn mua',
  'tìm mua',
  'cần tìm',
  'mua ở đâu',
  'nên mua ở đâu',
  'xin chỗ mua',
  'xin địa chỉ mua',
  'xin link mua',
  'xin link shop',
  'xin shop',
  'xin recommend',
  'nhờ tư vấn mua',
  'tư vấn giúp',
  'gợi ý giúp',
  'ai biết chỗ mua',
  'ai biết shop nào',
  'shop nào uy tín',
  'có ai bán',
  'ai bán',
  'ai có bán',
  'có chỗ nào bán',
  'có ai thanh lý',
  'ai thanh lý',
  'có ai pass',
  'ai pass lại',
  'nhượng lại',
  'pass lại',
].join('\n');

let buyerIntentKeywordRowSeq = 1;

function createBuyerIntentKeywordRow(value = '') {
  return {
    id: `buyer-intent-${Date.now()}-${buyerIntentKeywordRowSeq++}`,
    value: String(value || ''),
  };
}

function buyerIntentKeywordRowsFromValue(value) {
  const list = Array.isArray(value)
    ? value
    : String(value || '').split('\n');
  return list.map((item) => createBuyerIntentKeywordRow(item));
}

function normalizeBuyerIntentKeywordRows(rows) {
  const seen = new Set();
  const list = [];
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const text = String(row?.value || '').trim();
    if (!text) return;
    const key = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    list.push(text);
  });
  return list;
}

function TabConfig({
  configUi,
  tweaks,
  setTweak,
  accentOptions,
  forcedSub,
  updateInfo,
  updateBusy,
  updateMessage,
  onInstallUpdate,
  onCheckUpdates,
  onOpenRelease,
}) {
  const [sub, setSub] = React.useState('url');
  const hasUpdateTab = !!(updateInfo?.available && !updateInfo?.ignored);
  const [cfg, setCfg] = React.useState(() => window.APP_CURRENT?.configUi || ({
    chatgptUrl: 'https://chat.openai.com',
    shopeeUrl: 'https://shopee.vn',
    affUrl: 'https://affiliate.shopee.vn',
    aiProvider: 'auto',
    aiRouter9: true,
    routerUrl: 'http://localhost:9090/api/chat',
    routerToken: '••••••••••••••••••',
    combo: 'Pro 50k',
    analyzePrompt: 'Phân tích bài viết sau và xác định người dùng có ý định mua hàng nào, keyword cụ thể.',
    commentPrompt: 'Viết comment tự nhiên ~25 từ, tone bạn bè, đính kèm 1 link affiliate, không quá phô trương.',
    analysisPromptRule: '',
    commentPromptRule: '',
    tgEnabled: true,
    tgToken: '••••••••••••••••••',
    tgChatId: '-1001234567890',
    tgPreview: false,
    tgNotifyCommentErrors: false,
    tgControl: true,
    cvProvider: 'off',
    tinyccWaitSeconds: 8,
    affiliateId: '',
    tinyApiKey: '',
    muahangreStatus: {},
    perGroup: 20,
    delay: 42,
    workflow: 'full',
    skipProcessed: true,
    deleteUnapproved: true,
    runMode: 'cycle',
    cycleWait: 15,
    browserType: 'edge',
    edgePort: 9222,
    useSeparateProfile: false,
    browserChoices: [
      { type: 'edge', label: 'Microsoft Edge', path: '' },
    ],
    browserPaths: {},
    edgePaths: [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      '%LOCALAPPDATA%\\Microsoft\\Edge\\Application\\msedge.exe',
    ],
    chromePaths: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      '%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe',
    ],
    theme: 'system',
    buyKeywords: 'cần mua\nai biết shop nào\ngợi ý giúp\nshop nào uy tín\nlink shopee\nmua ở đâu rẻ\ngiá tốt\nlink tham khảo\ntư vấn giúp\nrecommend\nsuggest',
    blacklistKeywords: 'review\nspam\ntuyển dụng\nthanh lý\nhết hàng\nlừa đảo\nbao giá\nmua sỉ',
  }));
  const [tinyRows, setTinyRows] = React.useState(() => window.APP_CURRENT?.configUi?.tinyRows || window.APP_CURRENT?.tinyRows || [
    { use: true, name: 'key1', token: 'aBc1...zX9', last: '—', updated: '14:32 hôm nay' },
    { use: true, name: 'key2', token: 'dE4g...kL2', last: 'Rate limit', updated: '12:08 hôm nay' },
    { use: false, name: 'key3', token: 'mNp6...wQ7', last: '—', updated: 'Hôm qua' },
  ]);
  const [tinyTokenDraft, setTinyTokenDraft] = React.useState('');
  const [tinyNameEdit, setTinyNameEdit] = React.useState(null);
  const [tinyNameDraft, setTinyNameDraft] = React.useState('');
  const [buyerIntentKeywordRows, setBuyerIntentKeywordRows] = React.useState(() => buyerIntentKeywordRowsFromValue(
    window.APP_CURRENT?.buyerIntentKeywords || window.APP_CURRENT?.configUi?.buyKeywords || DEFAULT_BUYER_INTENT_KEYWORDS_TEXT
  ));
  const [buyerIntentBusy, setBuyerIntentBusy] = React.useState('');
  const [buyerIntentMessage, setBuyerIntentMessage] = React.useState('');
  const [autosaveAt, setAutosaveAt] = React.useState(null);
  const [dataBusy, setDataBusy] = React.useState('');
  const [dataMessage, setDataMessage] = React.useState('');
  const [tgTestState, setTgTestState] = React.useState(null); // null | 'loading' | 'ok' | 'error'
  const [tgTestMsg, setTgTestMsg] = React.useState('');
  const [routerTestState, setRouterTestState] = React.useState(null); // null | 'loading' | 'ok' | 'error'
  const [routerTestMsg, setRouterTestMsg] = React.useState('');
  const [promptCopyMsg, setPromptCopyMsg] = React.useState('');
  const [browserChanged, setBrowserChanged] = React.useState(false);
  const [browserDetectMsg, setBrowserDetectMsg] = React.useState('');
  const [installedBrowsers, setInstalledBrowsers] = React.useState([]);
  const appDialog = useAppDialog();

  React.useEffect(() => {
    if (forcedSub && forcedSub !== sub) setSub(forcedSub);
  }, [forcedSub, sub, setSub]);

  // Đồng bộ từ backend sau khi WebChannel sẵn sàng, tránh giữ fallback/default
  // nếu lần đọc config.json ban đầu bị trễ.
  React.useEffect(() => {
    if (!configUi || typeof configUi !== 'object') return;
    setCfg(configUi);
    if (Array.isArray(configUi.tinyRows)) setTinyRows(configUi.tinyRows);
  }, [configUi]);

  React.useEffect(() => {
    if (sub !== 'kw') return undefined;
    const api = window.backendApi;
    if (!api?.connected || !api.loadBuyerIntentKeywords) return undefined;
    let cancelled = false;
    setBuyerIntentBusy('loading');
    setBuyerIntentMessage('');
    api.loadBuyerIntentKeywords().then((res) => {
      if (cancelled) return;
      if (!res?.ok) {
        setBuyerIntentBusy('');
        setBuyerIntentMessage(res?.error || 'Không tải được buyer-intent keywords.');
        return;
      }
      const next = Array.isArray(res.data?.keywords) && res.data.keywords.length
        ? res.data.keywords
        : DEFAULT_BUYER_INTENT_KEYWORDS_TEXT.split('\n');
      setBuyerIntentKeywordRows(buyerIntentKeywordRowsFromValue(next));
      if (window.APP_CURRENT) window.APP_CURRENT.buyerIntentKeywords = next.join('\n');
      setBuyerIntentBusy('');
    });
    return () => {
      cancelled = true;
    };
  }, [sub]);

  const scheduleSave = (nextCfg, nextTinyRows = tinyRows, tinyRowsTouched = false) => {
    setAutosaveAt('saving');
    // Cập nhật APP_CURRENT.configUi ngay lập tức để khi switch tab rồi quay lại,
    // lazy init của useState đọc được giá trị mới nhất (tránh reset về default).
    const payload = { ...nextCfg, tinyRows: nextTinyRows, tinyRowsTouched };
    if (window.APP_CURRENT) {
      window.APP_CURRENT.configUi = payload;
      window.APP_CURRENT.tinyRows = nextTinyRows;
    }
    clearTimeout(window.__cfgSaveTimer);
    const flushSave = () => {
      clearTimeout(window.__cfgSaveTimer);
      const api = window.backendApi;
      if (api?.connected) {
        return api.saveConfigUi(payload).then((res) => {
          setAutosaveAt(res?.ok ? 'saved' : 'error');
          if (res?.ok && res.data?.configUi) {
            if (window.APP_CURRENT) window.APP_CURRENT.configUi = res.data.configUi;
            if (Array.isArray(res.data.configUi.tinyRows)) {
              setTinyRows(res.data.configUi.tinyRows);
              if (window.APP_CURRENT) window.APP_CURRENT.tinyRows = res.data.configUi.tinyRows;
            }
          }
          return res;
        });
      }
      setAutosaveAt('saved');
      return Promise.resolve({ ok: true, data: { configUi: payload } });
    };
    window.__flushConfigUiSave = flushSave;
    window.__cfgSaveTimer = setTimeout(flushSave, 700);
  };

  const update = (k, v) => {
    setCfg((p) => {
      const next = { ...p, [k]: v };
      if (k === 'aiProvider') next.aiFallback = v === 'auto';
      scheduleSave(next);
      return next;
    });
  };

  const addBuyerIntentKeywordRow = () => {
    setBuyerIntentKeywordRows((rows) => [...rows, createBuyerIntentKeywordRow('')]);
    setBuyerIntentMessage('');
  };

  const updateBuyerIntentKeywordRow = (id, value) => {
    setBuyerIntentKeywordRows((rows) => rows.map((row) => (
      row.id === id ? { ...row, value } : row
    )));
    setBuyerIntentMessage('');
  };

  const deleteBuyerIntentKeywordRow = (id) => {
    setBuyerIntentKeywordRows((rows) => rows.filter((row) => row.id !== id));
    setBuyerIntentMessage('');
  };

  const saveBuyerIntentKeywords = () => {
    const api = window.backendApi;
    if (!api?.connected || !api.saveBuyerIntentKeywords) {
      setBuyerIntentMessage('Backend chưa sẵn sàng để lưu buyer-intent keywords.');
      return;
    }
    setBuyerIntentBusy('saving');
    setBuyerIntentMessage('');
    const keywords = normalizeBuyerIntentKeywordRows(buyerIntentKeywordRows);
    api.saveBuyerIntentKeywords({ keywords }).then((res) => {
      setBuyerIntentBusy('');
      if (!res?.ok) {
        setBuyerIntentMessage(res?.error || 'Không lưu được buyer-intent keywords.');
        return;
      }
      const next = Array.isArray(res.data?.keywords) ? res.data.keywords : keywords;
      setBuyerIntentKeywordRows(buyerIntentKeywordRowsFromValue(next));
      if (window.APP_CURRENT) window.APP_CURRENT.buyerIntentKeywords = next.join('\n');
      setBuyerIntentMessage(`Đã lưu ${Array.isArray(res.data?.keywords) ? res.data.keywords.length : keywords.length} buyer-intent keywords.`);
    });
  };

  const reloadBuyerIntentKeywords = () => {
    const api = window.backendApi;
    if (!api?.connected || !api.loadBuyerIntentKeywords) {
      setBuyerIntentMessage('Backend chưa sẵn sàng để tải buyer-intent keywords.');
      return;
    }
    setBuyerIntentBusy('loading');
    setBuyerIntentMessage('');
    api.loadBuyerIntentKeywords().then((res) => {
      setBuyerIntentBusy('');
      if (!res?.ok) {
        setBuyerIntentMessage(res?.error || 'Không tải lại được buyer-intent keywords.');
        return;
      }
      const next = Array.isArray(res.data?.keywords) ? res.data.keywords : DEFAULT_BUYER_INTENT_KEYWORDS_TEXT.split('\n');
      setBuyerIntentKeywordRows(buyerIntentKeywordRowsFromValue(next));
      if (window.APP_CURRENT) window.APP_CURRENT.buyerIntentKeywords = next.join('\n');
      setBuyerIntentMessage('Đã tải lại buyer-intent keywords từ file dữ liệu.');
    });
  };

  const copyPromptRule = (rule, label) => {
    const text = String(rule || '').trim();
    if (!text) {
      setPromptCopyMsg('Chưa tải được rule.');
      return;
    }
    if (!copyTextToClipboard(text)) {
      setPromptCopyMsg('Không thể sao chép tự động. Hãy bôi đen nội dung rule rồi nhấn Ctrl+C.');
      return;
    }
    setPromptCopyMsg(`Đã sao chép ${label}. Bạn có thể dán vào ô prompt để chỉnh sửa.`);
    window.clearTimeout(window.__promptCopyTimer);
    window.__promptCopyTimer = window.setTimeout(() => setPromptCopyMsg(''), 3500);
  };

  const restorePromptRule = (key, rule, label) => {
    const text = String(rule || '').trim();
    if (!text) {
      setPromptCopyMsg('Chưa tải được rule.');
      return;
    }
    update(key, text);
    setPromptCopyMsg(`Đã khôi phục ${label} mặc định mới nhất.`);
    window.clearTimeout(window.__promptCopyTimer);
    window.__promptCopyTimer = window.setTimeout(() => setPromptCopyMsg(''), 3500);
  };

  const showEdgeRollbackGuide = () => {
    appDialog.alert({
      title: 'Khi Edge không kết nối được',
      width: 760,
      confirmText: 'Đã hiểu',
      message: (
        <div style={{ display: 'grid', gap: 10, lineHeight: 1.55 }}>
          <p style={{ margin: 0 }}>
            Nếu Edge báo lỗi debug port hoặc không attach được vào profile hiện tại, dùng script đi kèm tool để đưa Edge về bản cũ ổn định hơn. Script sẽ tự backup dữ liệu Edge, chặn update, rollback/cài Edge và restore dữ liệu đăng nhập.
          </p>
          <p style={{ margin: 0 }}>
            Trước khi làm, hãy tắt hết cửa sổ Edge và Shopee Seeding Bot.
          </p>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>Mở trang <a href="https://aka.ms/EdgeEnterprise" target="_blank" rel="noreferrer">https://aka.ms/EdgeEnterprise</a>.</li>
            <li>Kéo xuống phần <b>Looking for an older version of Edge?</b>.</li>
            <li>Ở ô <b>Channel / Version</b>, chọn <b>Stable 149</b>.</li>
            <li>Ở ô <b>Build</b>, chọn <b>149.0.4022.98</b> nếu có. Nếu không thấy, chọn bản 149 mới nhất đang có trong danh sách.</li>
            <li>Ở ô <b>Platform</b>, đa số máy chọn <b>Windows 64-bit</b>. Chỉ chọn <b>Windows ARM64</b> nếu máy là Surface/Windows ARM hoặc mục About của Windows ghi ARM-based processor. Không chọn ARM64 cho máy Intel/AMD bình thường.</li>
            <li>Bấm <b>Download</b> để tải file MSI. Không cần bấm <b>Get policy files</b>.</li>
            <li>Để nguyên file MSI trong thư mục Downloads, hoặc copy file đó vào thư mục <code>scripts</code> của tool.</li>
            <li>Mở thư mục tool, vào <code>scripts</code>, bấm chuột phải <code>rollback_edge_legacy.bat</code> rồi chọn <b>Run as administrator</b>.</li>
            <li>Khi cửa sổ script hiện danh sách file MSI, nhập số của file Edge 149 vừa tải rồi nhấn Enter.</li>
            <li>Chờ script chạy xong, mở lại tool rồi bấm <b>Kết nối Browser</b> hoặc <b>Chạy</b> như bình thường.</li>
          </ol>
          <p style={{ margin: 0 }}>
            File script nằm trong bản build tại <code>scripts\rollback_edge_legacy.bat</code>.
          </p>
        </div>
      ),
    });
  };

  const maskTinyToken = (token) => {
    const text = String(token || '').trim();
    if (!text) return '';
    if (text.includes('...') || text.includes('…') || text.includes('•')) return text;
    if (text.length <= 8) return '••••••••';
    return `${text.slice(0, 4)}...${text.slice(-4)}`;
  };

  const saveTinyRows = (rows) => {
    setTinyRows(rows);
    scheduleSave(cfg, rows, true);
  };

  const nextTinyKeyName = (rows = tinyRows) => {
    const used = new Set((rows || []).map((row) => String(row.name || '').trim().toLowerCase()).filter(Boolean));
    let index = 1;
    while (used.has(`key${index}`)) index += 1;
    return `key${index}`;
  };

  const addTinyToken = () => {
    const token = tinyTokenDraft.trim();
    if (!token) return;
    const duplicate = tinyRows.some((row) => String(row.token || '').trim() === token || maskTinyToken(row.token) === maskTinyToken(token));
    if (duplicate) {
      appDialog.alert?.({
        title: 'TinyURL',
        message: 'Key này đã có trong danh sách.',
      });
      setTinyTokenDraft('');
      return;
    }
    const now = new Date().toLocaleString('vi-VN', { hour12: false });
    saveTinyRows([
      ...tinyRows,
      { use: true, name: nextTinyKeyName(), token, last: '—', updated: now, limitedUntil: '' },
    ]);
    setTinyTokenDraft('');
  };

  const updateTinyRow = (index, patch) => {
    saveTinyRows(tinyRows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const deleteTinyRow = (index) => {
    saveTinyRows(tinyRows.filter((_, i) => i !== index));
  };

  const startTinyNameEdit = (index, row) => {
    setTinyNameEdit(index);
    setTinyNameDraft(String(row.name || `key${index + 1}`));
  };

  const cancelTinyNameEdit = () => {
    setTinyNameEdit(null);
    setTinyNameDraft('');
  };

  const saveTinyNameEdit = (index) => {
    const name = tinyNameDraft.trim() || `key${index + 1}`;
    updateTinyRow(index, { name });
    cancelTinyNameEdit();
  };

  const tinyRowIsLimitError = (row) => {
    const last = String(row?.last || '').toLowerCase();
    return !!row?.limitedUntil
      || last.includes('http 422')
      || last.includes('tinyurl links limit reached')
      || last.includes('"code": 5')
      || last.includes('code 5');
  };

  const tinyRowStatus = (row) => {
    if (tinyRowIsLimitError(row)) {
      return {
        text: 'Tới giới hạn',
        tone: 'warn',
        title: row.limitedUntil ? `Tạm tắt đến ${row.limitedUntil}` : 'TinyURL đã chạm giới hạn',
      };
    }
    if (row.use) return { text: 'Đang dùng', tone: 'ok' };
    if (row.last && row.last !== '—') return { text: 'Đang tắt', tone: 'bad' };
    return { text: 'Đang tắt', tone: 'idle' };
  };

  const tinyRowLastText = (row) => {
    if (tinyRowIsLimitError(row)) return '—';
    return row.last || '—';
  };

  const muahangreStatusInfo = () => {
    const status = cfg.muahangreStatus || {};
    const code = String(status.lastErrorCode || '').trim();
    const last = String(status.lastError || '').trim();
    const titleParts = [
      code ? `Mã lỗi: ${code}` : '',
      last,
      status.updatedAt ? `Cập nhật: ${status.updatedAt}` : '',
      status.lastSuccessAt ? `Lần thành công gần nhất: ${status.lastSuccessAt}` : '',
    ].filter(Boolean);
    if (status.status === 'expired') {
      return { text: 'Cần kiểm tra', tone: 'bad', detail: titleParts.join('\n') || 'Dịch vụ rút gọn đang cần kiểm tra.' };
    }
    if (status.status === 'rate_limited') {
      return { text: 'Tạm hết lượt', tone: 'warn', detail: titleParts.join('\n') || 'Dịch vụ rút gọn đang tạm hết lượt hôm nay.' };
    }
    if (status.status === 'error') {
      return { text: 'Lỗi', tone: 'bad', detail: titleParts.join('\n') || 'Chưa rút gọn link được.' };
    }
    if (status.status === 'ok') {
      return { text: 'Đang dùng', tone: 'ok', detail: titleParts.join('\n') || 'Dịch vụ rút gọn đang hoạt động bình thường.' };
    }
    return { text: 'Sẵn sàng', tone: 'ok', detail: 'Trạng thái sẽ cập nhật sau lần rút gọn link tiếp theo.' };
  };

  const browserLabels = {
    edge: 'Microsoft Edge',
    chrome: 'Google Chrome',
    brave: 'Brave',
    firefox: 'Firefox',
    coccoc: 'Cốc Cốc',
    chromium: 'Chromium',
    opera: 'Opera',
    safari: 'Safari',
  };
  const browserChoices = React.useMemo(() => {
    const rows = Array.isArray(cfg.browserChoices) ? cfg.browserChoices : [];
    const byType = new Map();
    rows.forEach((row) => {
      if (row?.type) byType.set(row.type, row);
    });
    const currentType = cfg.browserType || 'edge';
    if (!byType.has(currentType)) {
      byType.set(currentType, { type: currentType, label: browserLabels[currentType] || currentType, path: '' });
    }
    return Array.from(byType.values());
  }, [cfg.browserChoices, cfg.browserType]);

  const updateBrowserType = (value) => {
    setBrowserChanged(true);
    update('browserType', value);
  };

  const detectBrowserPath = (browserType) => {
    const api = window.backendApi;
    if (!api?.connected || !api.detectBrowserPath) {
      setBrowserDetectMsg('Backend chưa sẵn sàng để tự phát hiện đường dẫn.');
      return;
    }
    const label = browserType === 'chrome' ? 'Chrome' : 'Edge';
    setBrowserDetectMsg(`Đang dò đường dẫn ${label}...`);
    api.detectBrowserPath(browserType)
      .then((res) => {
        if (!res?.ok) throw new Error(res?.error || `Không dò được đường dẫn ${label}.`);
        const paths = res.data?.paths || [];
        if (!paths.length) {
          setBrowserDetectMsg(`Chưa tìm thấy ${label} trong các thư mục mặc định.`);
          return;
        }
        update(browserType === 'chrome' ? 'chromePaths' : 'edgePaths', paths);
        setBrowserDetectMsg(`Đã tìm thấy ${paths.length} đường dẫn ${label}.`);
      })
      .catch((err) => setBrowserDetectMsg(String(err?.message || err)));
  };

  const scanBrowsers = () => {
    const api = window.backendApi;
    if (!api?.connected || !api.scanBrowsers || !api.detectInstalledBrowsers) {
      setBrowserDetectMsg('Backend chưa sẵn sàng để quét trình duyệt.');
      return;
    }
    setBrowserDetectMsg('Đang quét trình duyệt trên máy...');
    Promise.all([api.scanBrowsers(), api.detectInstalledBrowsers()])
      .then(([supportedRes, detectedRes]) => {
        if (!supportedRes?.ok) throw new Error(supportedRes?.error || 'Không quét được trình duyệt hỗ trợ.');
        if (!detectedRes?.ok) throw new Error(detectedRes?.error || 'Không lấy được danh sách trình duyệt đã cài.');
        const browsers = supportedRes.data?.browsers || [];
        const detected = detectedRes.data?.browsers || [];
        setInstalledBrowsers(detected);
        setCfg((prev) => {
          const supportedBrowsers = browsers.length ? browsers : (Array.isArray(prev.browserChoices) ? prev.browserChoices : []);
          const nextPaths = { ...(prev.browserPaths || {}) };
          supportedBrowsers.forEach((browser) => {
            if (browser?.type) nextPaths[browser.type] = browser.paths || (browser.path ? [browser.path] : []);
          });
          const currentFound = supportedBrowsers.some((browser) => browser.type === prev.browserType);
          const next = {
            ...prev,
            browserChoices: supportedBrowsers,
            browserPaths: nextPaths,
            edgePaths: nextPaths.edge || prev.edgePaths || [],
            chromePaths: nextPaths.chrome || prev.chromePaths || [],
            bravePaths: nextPaths.brave || prev.bravePaths || [],
            firefoxPaths: nextPaths.firefox || prev.firefoxPaths || [],
            browserType: currentFound ? prev.browserType : (supportedBrowsers[0]?.type || prev.browserType || 'edge'),
          };
          scheduleSave(next);
          return next;
        });
        if (!detected.length) {
          setBrowserDetectMsg('Chưa phát hiện trình duyệt nào trong các thư mục mặc định.');
          return;
        }
        const supportedCount = detected.filter((browser) => browser.supported !== false).length;
        setBrowserDetectMsg(`Đã phát hiện ${detected.length} trình duyệt, hỗ trợ ${supportedCount}.`);
      })
      .catch((err) => setBrowserDetectMsg(String(err?.message || err)));
  };

  const testNineRouter = () => {
    const api = window.backendApi;
    if (!api?.connected || !api.testNineRouter) {
      setRouterTestState('error');
      setRouterTestMsg('Backend bridge chưa sẵn sàng.');
      return;
    }
    setRouterTestState('loading');
    setRouterTestMsg('');
    api.saveConfigUi(cfg)
      .then((saveRes) => {
        if (!saveRes?.ok) throw new Error(saveRes?.error || 'Không lưu được cấu hình trước khi test.');
        if (saveRes.data?.configUi) setCfg(saveRes.data.configUi);
        return api.testNineRouter();
      })
      .then((res) => {
        if (res?.ok) {
          setRouterTestState('ok');
          setRouterTestMsg(res.data?.message || '9Router hoạt động.');
        } else {
          setRouterTestState('error');
          setRouterTestMsg(res?.error || res?.data?.message || 'Không kết nối được 9Router.');
        }
      })
      .catch((err) => {
        setRouterTestState('error');
        setRouterTestMsg(String(err?.message || err));
      });
  };

  const testTelegram = () => {
    const api = window.backendApi;
    if (!api?.connected || !api.testTelegram) {
      setTgTestState('error');
      setTgTestMsg('Backend bridge chưa sẵn sàng.');
      return;
    }
    setTgTestState('loading');
    setTgTestMsg('');
    api.saveConfigUi(cfg)
      .then((saveRes) => {
        if (!saveRes?.ok) throw new Error(saveRes?.error || 'Không lưu được cấu hình trước khi test.');
        if (saveRes.data?.configUi) setCfg(saveRes.data.configUi);
        return api.testTelegram();
      })
      .then((res) => {
        if (res?.ok) {
          setTgTestState('ok');
          setTgTestMsg('Gửi thành công!');
        } else {
          setTgTestState('error');
          setTgTestMsg(res?.error || 'Gửi thất bại.');
        }
      })
      .catch((err) => {
        setTgTestState('error');
        setTgTestMsg(String(err?.message || err));
      });
  };

  const SUBTABS = [
    { value: 'url', label: 'URL' },
    { value: 'ai', label: 'AI' },
    { value: 'tg', label: 'Telegram' },
    { value: 'kw', label: 'Từ khóa' },
    { value: 'tm', label: 'Vận hành' },
    { value: 'cv', label: 'Rút gọn link' },
    { value: 'ui', label: 'Giao diện' },
    { value: 'data', label: 'Dữ liệu' },
    ...(hasUpdateTab ? [{ value: 'update', label: 'Cập nhật' }] : []),
    { value: 'license', label: 'Giấy phép & Hướng dẫn' },
  ];

  React.useEffect(() => {
    if (sub === 'update' && !hasUpdateTab) setSub('license');
  }, [sub, hasUpdateTab]);

  const setupGuides = {
    url: {
      title: 'Cách setup URL',
      steps: [
        'Chọn browser bot sẽ điều khiển, rồi đăng nhập Facebook, ChatGPT, Shopee và Shopee Affiliate trong chính browser đó.',
        'Nếu đổi từ Edge sang Chrome hoặc ngược lại, hãy Dừng + Start lại bot; browser mới cần đăng nhập lại các tài khoản lần đầu.',
        'Giữ port debug mặc định 9222 nếu bạn để app tự mở browser; chỉ đổi khi bạn tự mở browser bằng --remote-debugging-port khác.',
        'Giữ ChatGPT URL là chatgpt.com hoặc chat.openai.com nếu dùng ChatGPT web hoặc Auto cần tự chuyển sang ChatGPT web khi 9Router lỗi.',
        'Shopee URL nên là trang chủ shopee.vn để bot giữ cookie phiên.',
        'Shopee Affiliate URL nên trỏ tới affiliate.shopee.vn để bot tạo link và sync doanh thu.',
        'Sau khi đổi URL, kết nối lại browser hoặc chạy lại bot để app mở/kiểm tra các tab bắt buộc.',
      ],
    },
    ai: {
      title: 'Cách setup AI',
      steps: [
        'Chọn Auto nếu muốn ưu tiên 9Router và tự chuyển sang ChatGPT web khi 9Router lỗi.',
        'Nếu dùng 9Router, điền URL, token và combo đang có quyền dùng, rồi nhấn Test 9Router.',
        'Chọn Chỉ dùng 9Router nếu muốn lỗi 9Router thì dừng AI, không tự chuyển sang ChatGPT web.',
        'Nếu không dùng 9Router, chọn Chỉ dùng ChatGPT web và đăng nhập ChatGPT trong Edge.',
        'Khi chỉnh prompt, hãy nhấn Sao chép rule để lấy sẵn các biến và format JSON bắt buộc.',
        'Không đổi tên hoặc xoá các biến trong rule; sau khi sửa prompt, nên chạy thử ít nhóm trước.',
      ],
    },
    tg: {
      title: 'Cách setup Telegram',
      steps: [
        'Tạo bot bằng @BotFather, lấy token và dán vào ô Token.',
        'Nhắn một tin cho bot, rồi mở https://api.telegram.org/bot<TOKEN>/getUpdates (thay <TOKEN> bằng token thật) để lấy chat_id.',
        'Nếu dùng group, thêm vào group trước và dùng Chat ID dạng -100...',
        'Bật Telegram nếu muốn nhận báo cáo, bài cần duyệt và cảnh báo lỗi dừng.',
        'Nhấn Gửi tin test để chắc chắn token/chat ID đúng trước khi chạy thật.',
      ],
    },
    cv: {
      title: 'Cách setup rút gọn link',
      steps: [
        'Chọn Muahangre để rút gọn link tự động, phù hợp nhất cho đa số tài khoản.',
        'Chọn TinyURL nếu bạn đã có key riêng và muốn tự quản lý lượt rút gọn.',
        'Chọn tiny.cc nếu muốn bot thao tác rút gọn trên tab browser đang kết nối.',
        'Chọn Tắt nếu muốn giữ nguyên link affiliate Shopee.',
        'Mã Affiliate chỉ cần nhập nếu muốn bot có thêm cách tạo link dự phòng khi Shopee Affiliate không trả link riêng cho nhóm.',
        'TinyURL free thường giới hạn khoảng 30 link/30 ngày cho mỗi key. Sau khi đăng nhập TinyURL, vào Manage Account → Settings → API → Create API, rồi copy key vào bảng bên dưới.',
        'Nếu rút gọn lỗi, bot vẫn có thể lưu sản phẩm vào trạng thái chờ link để xử lý lại.',
      ],
    },
    tm: {
      title: 'Cách setup vận hành',
      steps: [
        'Số bài/nhóm là số bài tối đa bot duyệt trong mỗi nhóm ở một lượt chạy.',
        'Delay sau comment nên để đủ chậm để hạn chế thao tác dồn dập trên Facebook.',
        'Chọn Chạy đầy đủ để bot tìm sản phẩm, tạo affiliate và comment/gửi Telegram.',
        'Chọn Chỉ thu thập keyword nếu muốn gom nhu cầu trước, chưa tạo link và chưa comment.',
        'Cổng debug là mục nâng cao. Giữ 9222 nếu bạn mở browser bằng nút Kết nối Browser của app; chỉ đổi khi bạn tự mở browser bằng port khác.',
      ],
    },
    ui: {
      title: 'Cách setup giao diện',
      steps: [
        'Chọn Theo hệ thống nếu muốn app tự đổi sáng/tối theo Windows hoặc trình duyệt.',
        'Chọn Sáng hoặc Tối nếu muốn cố định theme khi chạy lâu.',
        'Accent color chỉ đổi màu nhấn của giao diện, không ảnh hưởng dữ liệu hay cách bot chạy.',
        'Compact hiển thị nhiều dòng hơn; Spacious dễ đọc hơn khi kiểm tra log và bảng dữ liệu.',
      ],
    },
    kw: {
      title: 'Cách setup keywords',
      steps: [
        'Buyer Intent Keywords là các cụm từ giúp bot nhận diện bài có khả năng là nhu cầu mua trước khi gọi API phân tích.',
        'Mỗi dòng trong bảng là một keyword, có thể thêm, sửa, xóa trực tiếp theo từng dòng.',
        'Tránh keyword quá rộng như đồ, máy, hàng nếu không muốn bot bắt quá nhiều bài nhiễu.',
        'Nên giữ vài ví dụ có dấu như cần mua, mua ở đâu, tư vấn giúp.',
      ],
    },
    data: {
      title: 'Cách setup dữ liệu',
      steps: [
        'Export data trước khi đổi máy, cập nhật app hoặc chỉnh cấu hình lớn.',
        'File export chứa cấu hình, lịch sử, bài đã xử lý, thống kê, click/đơn và kho sản phẩm.',
        'Import data sẽ ghi đè dữ liệu hiện tại nhưng app tự tạo backup trước khi thay.',
        'Nên dừng bot trước khi import/export để tránh vừa chạy vừa ghi dữ liệu.',
        'Không gửi file backup cho người lạ vì có thể chứa token Telegram, 9Router hoặc TinyURL.',
      ],
    },
  };

  const exportData = () => {
    const api = window.backendApi;
    if (!api?.connected) {
      setDataMessage('Backend chưa sẵn sàng. Hãy chạy backend HTTP server và mở web app qua local server.');
      return;
    }
    setDataBusy('export');
    setDataMessage('');
    api.exportAppData().then((res) => {
      setDataBusy('');
      if (!res?.ok) {
        setDataMessage(res?.error || 'Không export được dữ liệu.');
        return;
      }
      if (res.data?.cancelled) {
        setDataMessage('Đã hủy export dữ liệu.');
        return;
      }
      setDataMessage(`Đã export ${res.data?.count || 0} file dữ liệu: ${res.data?.path || ''}`);
    });
  };

  const importData = async () => {
    const api = window.backendApi;
    if (!api?.connected) {
      setDataMessage('Backend chưa sẵn sàng. Hãy chạy backend HTTP server và mở web app qua local server.');
      return;
    }
    const ok = await appDialog.confirm({
      title: 'Import dữ liệu?',
      message: 'Import dữ liệu sẽ ghi đè dữ liệu hiện tại bằng file backup đã chọn. App sẽ tự tạo backup dữ liệu hiện tại trước khi import. Tiếp tục?',
      confirmText: 'Tiếp tục import',
      icon: 'upload',
      danger: true,
    });
    if (!ok) return;
    setDataBusy('import');
    setDataMessage('');
    api.importAppData().then((res) => {
      setDataBusy('');
      if (!res?.ok) {
        setDataMessage(res?.error || 'Không import được dữ liệu.');
        return;
      }
      if (res.data?.cancelled) {
        setDataMessage('Đã hủy import dữ liệu.');
        return;
      }
      if (window.APP_CURRENT?.configUi) setCfg(window.APP_CURRENT.configUi);
      if (window.APP_CURRENT?.tinyRows) setTinyRows(window.APP_CURRENT.tinyRows);
      setDataMessage(`Đã import ${res.data?.count || 0} file dữ liệu. Backup cũ: ${res.data?.backup || ''}`);
    });
  };

  return (
    <div className="tab-body">
      {!forcedSub && <Subtabs tabs={SUBTABS} value={sub} onChange={setSub} />}
      <div className="tab-content" style={{ position: 'relative' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          {/* Autosave indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 10, fontSize: 'var(--font-xs)', color: 'var(--fg-faint)' }}>
            {autosaveAt === 'saving' && <>
              <span className="dot" style={{ width: 6, height: 6, borderRadius: '50%',
                background: 'var(--warn)' }} />
              Đang lưu cấu hình…
            </>}
            {autosaveAt === 'saved' && <>
              <Icon name="check" size={12} />
              Đã tự động lưu lúc {fmt.time(new Date())}
            </>}
            {autosaveAt === 'error' && <>
              <span className="dot" style={{ width: 6, height: 6, borderRadius: '50%',
                background: 'var(--danger)' }} />
              Không lưu được cấu hình qua backend.
            </>}
            {!autosaveAt && <>Tự động lưu sau 0.7s khi có thay đổi.</>}
          </div>

          {sub === 'url' && (
            <div className="section">
              <div className="section-hd"><h3>URL hệ thống</h3>
                <span className="meta">Đường dẫn dùng cho Selenium attach.</span></div>
              <div className="section-body" style={{ padding: '0 14px' }}>
                <ConfigSetupGuide {...setupGuides.url} />
                <FieldRow label="ChatGPT URL" help="Dùng khi chọn Chỉ dùng ChatGPT web, hoặc khi Auto cần tự chuyển sang ChatGPT web.">
                  <input className="input" value={cfg.chatgptUrl} onChange={(e) => update('chatgptUrl', e.target.value)} />
                </FieldRow>
                <FieldRow label="Shopee URL" help="Trang chủ Shopee để lấy cookie phiên.">
                  <input className="input" value={cfg.shopeeUrl} onChange={(e) => update('shopeeUrl', e.target.value)} />
                </FieldRow>
                <FieldRow label="Shopee Affiliate URL" help="Dashboard affiliate để sync click/đơn.">
                  <input className="input" value={cfg.affUrl} onChange={(e) => update('affUrl', e.target.value)} />
                </FieldRow>
              </div>
            </div>
          )}

          {sub === 'ai' && (
            <div className="section">
              <div className="section-hd"><h3>Nguồn AI</h3>
                <span className="meta">9Router (private) hoặc ChatGPT web.</span></div>
              <div className="section-body" style={{ padding: '0 14px' }}>
                <ConfigSetupGuide {...setupGuides.ai} />
                <FieldRow label="Nguồn AI" help="Auto sẽ thử 9Router trước; nếu 9Router lỗi thì tự chuyển sang ChatGPT web. Chỉ dùng 9Router thì lỗi sẽ dừng AI. Chỉ dùng ChatGPT web thì bỏ qua 9Router.">
                  <select className="select" value={cfg.aiProvider} onChange={(e) => update('aiProvider', e.target.value)} style={{ maxWidth: 320 }}>
                    <option value="auto">Ưu tiên 9Router, lỗi thì dùng ChatGPT web</option>
                    <option value="9router">Chỉ dùng 9Router</option>
                    <option value="web">Chỉ dùng ChatGPT web</option>
                  </select>
                </FieldRow>
                {cfg.aiProvider !== 'web' && (
                  <>
                    <FieldRow label="9Router URL">
                      <input className="input" value={cfg.routerUrl} onChange={(e) => update('routerUrl', e.target.value)} />
                    </FieldRow>
                    <FieldRow label="Token">
                      <input className="input" type="password" value={cfg.routerToken} onChange={(e) => update('routerToken', e.target.value)} />
                    </FieldRow>
                    <FieldRow label="Combo">
                      <input className="input" value={cfg.combo} onChange={(e) => update('combo', e.target.value)} style={{ maxWidth: 220 }} />
                    </FieldRow>
                    <FieldRow label="Kiểm tra 9Router">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <button className="btn primary" disabled={routerTestState === 'loading'} onClick={testNineRouter}>
                          <Icon name="bot" size={14} /> {routerTestState === 'loading' ? 'Đang test…' : 'Test 9Router'}
                        </button>
                        <span style={{
                          fontSize: 12,
                          color: routerTestState === 'ok' ? 'var(--ok)' : routerTestState === 'error' ? 'var(--danger)' : 'var(--fg-muted)',
                        }}>
                          {routerTestMsg || 'Lưu cấu hình rồi gọi thử /v1/chat/completions.'}
                        </span>
                      </div>
                    </FieldRow>
                  </>
                )}
                <FieldRow label="Prompt phân tích bài" help="Dùng khi quét bài Facebook để xác định ý định mua. Có thể chỉnh sửa theo nhu cầu.">
                  <div>
                    <textarea className="textarea" rows={5} value={cfg.analyzePrompt}
                              onChange={(e) => update('analyzePrompt', e.target.value)} />
                    <button className="btn" type="button" onClick={() => copyPromptRule(cfg.analysisPromptRule || cfg.analyzePrompt, 'rule phân tích bài')}>
                      Sao chép rule mẫu
                    </button>
                    <button className="btn" type="button" onClick={() => restorePromptRule('analyzePrompt', cfg.analysisPromptRule, 'rule phân tích bài')}>
                      Khôi phục rule mặc định
                    </button>
                  </div>
                </FieldRow>
                <FieldRow label="Prompt tạo comment" help="Dùng để viết comment Facebook tự nhiên. Có thể chỉnh sửa theo nhu cầu.">
                  <div>
                    <textarea className="textarea" rows={5} value={cfg.commentPrompt}
                              onChange={(e) => update('commentPrompt', e.target.value)} />
                    <button className="btn" type="button" onClick={() => copyPromptRule(cfg.commentPromptRule || cfg.commentPrompt, 'rule tạo comment')}>
                      Sao chép rule mẫu
                    </button>
                    <button className="btn" type="button" onClick={() => restorePromptRule('commentPrompt', cfg.commentPromptRule, 'rule tạo comment')}>
                      Khôi phục rule mặc định
                    </button>
                  </div>
                </FieldRow>
                {promptCopyMsg && <div className="dim" style={{ margin: '0 0 12px 180px', fontSize: 12 }}>{promptCopyMsg}</div>}
              </div>
            </div>
          )}

          {sub === 'tg' && (
            <div className="section">
              <div className="section-hd"><h3>Telegram</h3>
                <span className="meta">Notify + remote control bot.</span></div>
              <div className="section-body" style={{ padding: '0 14px' }}>
                <ConfigSetupGuide {...setupGuides.tg} />
                <FieldRow label="Bật Telegram">
                  <Checkbox checked={cfg.tgEnabled} onChange={(v) => update('tgEnabled', v)}
                            label="Gửi thông báo qua Telegram" />
                </FieldRow>
                <FieldRow label="Bot token">
                  <input className="input" type="password" value={cfg.tgToken}
                         onChange={(e) => update('tgToken', e.target.value)} />
                </FieldRow>
                <FieldRow label="Chat ID">
                  <input className="input" value={cfg.tgChatId}
                         onChange={(e) => update('tgChatId', e.target.value)} style={{ maxWidth: 280 }} />
                </FieldRow>
                <FieldRow label="Hiển thị preview link">
                  <Checkbox checked={cfg.tgPreview} onChange={(v) => update('tgPreview', v)}
                            label="Bật preview link trong Telegram" />
                </FieldRow>
                <FieldRow label="Cho phép điều khiển bot qua tin nhắn"
                          help="Hỗ trợ /start_bot, /start, /pause, /resume, /stop, /status từ Telegram.">
                  <Checkbox checked={cfg.tgControl} onChange={(v) => update('tgControl', v)}
                            label="Bật điều khiển từ xa" />
                </FieldRow>
                <FieldRow label="Kiểm tra kết nối">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button className="btn primary" disabled={tgTestState === 'loading'}
                      onClick={testTelegram}>
                      <Icon name="telegram" size={14} /> {tgTestState === 'loading' ? 'Đang gửi…' : 'Gửi tin test'}
                    </button>
                    {tgTestState === 'ok' && <span style={{ color: 'var(--green, #22c55e)', fontSize: 13 }}>✓ {tgTestMsg}</span>}
                    {tgTestState === 'error' && <span style={{ color: 'var(--red, #ef4444)', fontSize: 13 }}>✗ {tgTestMsg}</span>}
                  </div>
                </FieldRow>
              </div>
            </div>
          )}

          {sub === 'cv' && (
            <div className="section">
              <div className="section-hd"><h3>Rút gọn link</h3>
                <span className="meta">Chọn kiểu link bot sẽ dùng khi comment.</span></div>
              <div className="section-body" style={{ padding: '0 14px 16px' }}>
                <ConfigSetupGuide {...setupGuides.cv} />
                <FieldRow label="Kiểu rút gọn">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      { id: 'muahangre', label: 'Muahangre — tự động, khuyên dùng' },
                      { id: 'tinyurl',  label: 'TinyURL — dùng key riêng bên dưới' },
                      { id: 'tinycc_browser', label: 'tiny.cc — dùng tab browser đang kết nối' },
                      { id: 'off',      label: 'Tắt — giữ nguyên link Shopee' },
                    ].map(({ id, label }) => (
                      <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 8,
                        cursor: 'pointer', fontSize: 'var(--font-sm)' }}>
                        <input type="radio" name="cvProvider" value={id}
                               checked={cfg.cvProvider === id}
                               onChange={() => update('cvProvider', id)}
                               style={{ accentColor: 'var(--accent)', width: 15, height: 15 }} />
                        {label}
                      </label>
                    ))}
                  </div>
                </FieldRow>

                {cfg.cvProvider === 'tinycc_browser' && (
                  <FieldRow label="Thời gian chờ tiny.cc" help="Sau khi tiny.cc báo thành công, bot sẽ chờ thêm khoảng này rồi mới copy link mới.">
                    <Spinbox value={cfg.tinyccWaitSeconds || 8} min={1} max={30} step={1} suffix="giây"
                             onChange={(v) => update('tinyccWaitSeconds', v)} />
                  </FieldRow>
                )}

                <FieldRow label="Mã Affiliate" help="Dùng cho link dự phòng khi bot chưa lấy được link riêng cho từng nhóm. Chỉ nhập dãy số trong tài khoản Shopee Affiliate.">
                  <input
                    className="input mono"
                    value={cfg.affiliateId || ''}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="VD: 14354840000"
                    onChange={(e) => update('affiliateId', e.target.value.replace(/\D/g, ''))}
                    style={{ maxWidth: 260 }}
                  />
                </FieldRow>

                {cfg.cvProvider === 'muahangre' && (
                  <FieldRow label="Trạng thái">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', maxWidth: 560 }}>
                      <span className="field-help" style={{ margin: 0 }}>
                        Sử dụng Muahangre là một cách ủng hộ nhà phát triển.
                      </span>
                      {(() => {
                        const status = muahangreStatusInfo();
                        return (
                          <span
                            className={`tinyurl-status tinyurl-status-${status.tone}`}
                            title={status.detail}
                          >
                            {status.text}
                          </span>
                        );
                      })()}
                      {cfg.muahangreStatus?.lastError && (
                        <span className="field-help" style={{ margin: 0 }}>
                          {cfg.muahangreStatus.lastErrorCode ? `${cfg.muahangreStatus.lastErrorCode}: ` : ''}
                          {cfg.muahangreStatus.lastError}
                        </span>
                      )}
                    </div>
                  </FieldRow>
                )}

                <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0 4px' }} />

                <div className="tinyurl-config-row">
                  <div className="tinyurl-config-help">
                    <div className="field-label">Key TinyURL riêng</div>
                    <div className="field-help">
                      Chỉ cần nhập nếu bạn chọn TinyURL. Mỗi key thường có giới hạn khoảng 30 link/30 ngày; key hết lượt sẽ tự tạm tắt và thử lại vào ngày hôm sau.
                    </div>
                    <div className="field-help" style={{ marginTop: 6 }}>
                      Tổng số key đang có: <b style={{ color: 'var(--fg)' }}>{tinyRows.length}</b>
                    </div>
                  </div>
                  <div className="tinyurl-config-main">
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        className="input mono"
                        value={tinyTokenDraft}
                        type="password"
                        style={{ maxWidth: 420, flex: '1 1 260px' }}
                        placeholder="Dán key TinyURL"
                        onChange={(e) => setTinyTokenDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') addTinyToken();
                        }}
                      />
                      <button className="btn primary" disabled={!tinyTokenDraft.trim()} onClick={addTinyToken}>
                        <Icon name="plus" size={14} /> Thêm
                      </button>
                    </div>
                    <div className="tbl-wrap tinyurl-table-wrap">
                      <table className="tbl tinyurl-table">
                        <thead>
                          <tr>
                            <th className="center">Sử dụng</th>
                            <th>Tên</th>
                            <th>Key</th>
                            <th>Trạng thái</th>
                            <th>Ghi chú</th>
                            <th>Cập nhật</th>
                            <th className="center">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tinyRows.length === 0 && (
                            <tr>
                              <td colSpan={7} style={{ color: 'var(--fg-muted)' }}>
                                Chưa có key TinyURL riêng.
                              </td>
                            </tr>
                          )}
                          {tinyRows.map((row, index) => {
                            const status = tinyRowStatus(row);
                            const lastText = tinyRowLastText(row);
                            return (
                              <tr key={`${row.token}-${index}`}>
                                <td className="center">
                                  <input
                                    type="checkbox"
                                    checked={!!row.use}
                                    onChange={(e) => updateTinyRow(index, { use: e.target.checked, limitedUntil: e.target.checked ? '' : row.limitedUntil })}
                                    style={{ accentColor: 'var(--accent)', width: 15, height: 15 }}
                                  />
                                </td>
                                <td
                                  className="tinyurl-name-cell"
                                  title="Nhấn đúp để đổi tên"
                                  onDoubleClick={() => startTinyNameEdit(index, row)}
                                >
                                  {tinyNameEdit === index ? (
                                    <input
                                      className="input sm tinyurl-name-input"
                                      value={tinyNameDraft}
                                      autoFocus
                                      onChange={(e) => setTinyNameDraft(e.target.value)}
                                      onBlur={() => saveTinyNameEdit(index)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveTinyNameEdit(index);
                                        if (e.key === 'Escape') cancelTinyNameEdit();
                                      }}
                                    />
                                  ) : (
                                    <span className="tinyurl-name-text">{row.name || `key${index + 1}`}</span>
                                  )}
                                </td>
                                <td className="mono">{maskTinyToken(row.token)}</td>
                                <td>
                                  <span
                                    className={`tinyurl-status tinyurl-status-${status.tone}`}
                                    title={status.title || status.text}
                                  >
                                    {status.text}
                                  </span>
                                </td>
                                <td className="truncate" title={row.last || ''}>{lastText}</td>
                                <td className="mono dim">{row.updated || '—'}</td>
                                <td className="center">
                                  <button
                                    className="btn sm ghost tinyurl-delete-btn"
                                    data-tooltip="Xóa"
                                    aria-label="Xóa"
                                    onClick={() => deleteTinyRow(index)}
                                  >
                                    <Icon name="trash" size={13} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {sub === 'tm' && (
            <div className="section">
              <div className="section-hd"><h3>Vận hành & quy trình</h3>
                <span className="meta">Quy trình chạy, tần suất comment, lặp chu kỳ, cổng debug browser.</span></div>
              <div className="section-body" style={{ padding: '0 14px' }}>
                <ConfigSetupGuide {...setupGuides.tm} />
                <FieldRow label="Workflow" help="Quy trình bot chạy — chọn trước vì nó quyết định các bước còn lại.">
                  <select className="select" value={cfg.workflow} style={{ maxWidth: 360 }}
                          onChange={(e) => update('workflow', e.target.value)}>
                    <option value="full">Chạy đầy đủ: tìm Shopee → affiliate → comment</option>
                    <option value="collect_keywords">Chỉ thu thập keyword vào kho sản phẩm</option>
                    <option value="warehouse_only">Chỉ dùng kho sản phẩm (không search Shopee — dự phòng khi Shopee lỗi)</option>
                  </select>
                </FieldRow>
                <FieldRow label="Browser chạy bot" help="Chọn trình duyệt app sẽ mở và điều khiển. Sau khi đổi browser, vui lòng disconnect và connect lại.">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select className="select" value={cfg.browserType || 'edge'} onChange={(e) => updateBrowserType(e.target.value)} style={{ maxWidth: 280 }}>
                      {browserChoices.map((browser) => (
                        <option key={browser.type} value={browser.type}>
                          {browser.label || browserLabels[browser.type] || browser.type}
                        </option>
                      ))}
                    </select>
                    <button className="btn sm" type="button" onClick={scanBrowsers}>
                      <Icon name="search" size={13} /> Quét trình duyệt
                    </button>
                    {browserDetectMsg && <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{browserDetectMsg}</span>}
                  </div>
                  {installedBrowsers.length > 0 && (
                    <div style={{
                      marginTop: 10,
                      display: 'grid',
                      gap: 8,
                    }}>
                      {installedBrowsers.map((browser) => (
                        <div
                          key={browser.type}
                          style={{
                            display: 'flex',
                            gap: 10,
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            padding: '10px 12px',
                            borderRadius: 10,
                            border: '1px solid var(--border)',
                            background: 'var(--bg-soft)',
                          }}
                        >
                          <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                            <div style={{ fontWeight: 600 }}>
                              {browser.label || browserLabels[browser.type] || browser.type}
                            </div>
                            <div className="mono dim" style={{ marginTop: 4, wordBreak: 'break-all' }}>
                              {browser.path || 'Không có đường dẫn'}
                            </div>
                          </div>
                          <span
                            style={{
                              whiteSpace: 'nowrap',
                              padding: '5px 10px',
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 600,
                              color: browser.supported === false ? 'var(--warn)' : 'var(--ok)',
                              background: browser.supported === false
                                ? 'color-mix(in oklab, var(--warn) 16%, transparent)'
                                : 'color-mix(in oklab, var(--ok) 16%, transparent)',
                              border: `1px solid ${browser.supported === false
                                ? 'color-mix(in oklab, var(--warn) 35%, var(--border))'
                                : 'color-mix(in oklab, var(--ok) 35%, var(--border))'}`,
                            }}
                          >
                            {browser.supported === false ? 'Đã cài, chưa hỗ trợ' : 'Đã cài, được hỗ trợ'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </FieldRow>
                {browserChanged && (
                  <div style={{
                    border: '1px solid color-mix(in oklab, var(--warn) 45%, var(--border))',
                    background: 'color-mix(in oklab, var(--warn) 9%, var(--bg-elev))',
                    color: 'var(--fg)', borderRadius: 8, padding: '10px 12px',
                    margin: '8px 0 12px', fontSize: 13, lineHeight: 1.5,
                  }}>
                    Vui lòng disconnect và connect lại browser.
                  </div>
                )}
                {(cfg.browserType || 'edge') === 'edge' && (
                  <FieldRow label="Edge lỗi debug port" help="Nếu Edge mới không cho tool kết nối vào profile hiện tại, có thể chạy script đi kèm để dùng Edge bản cũ ổn định hơn và giữ dữ liệu đăng nhập.">
                    <button className="btn sm" type="button" onClick={showEdgeRollbackGuide}>
                      <Icon name="infoCircle" size={13} /> Xem cách xử lý Edge lỗi
                    </button>
                  </FieldRow>
                )}
                <details style={{ margin: '8px 0 12px' }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--fg-muted)', fontSize: 'var(--font-sm)' }}>
                    Nâng cao
                  </summary>
                  <div style={{ marginTop: 10 }}>
                    <FieldRow label="Profile" help="Mặc định dùng profile gốc của trình duyệt (đã đăng nhập sẵn). Nếu không kết nối được (hay gặp với Chrome), bật cái này để dùng profile riêng rồi đăng nhập lại trong cửa sổ bot mở ra.">
                      <Checkbox checked={!!cfg.useSeparateProfile} onChange={(v) => update('useSeparateProfile', v)}
                                label="Dùng profile riêng cho bot" />
                    </FieldRow>
                    <FieldRow label="Cổng debug" help="Mặc định 9222. Chỉ đổi nếu bạn tự mở browser bằng --remote-debugging-port khác; đổi xong cần kết nối lại browser.">
                      <Spinbox value={cfg.edgePort} min={1000} max={65535} step={1}
                               onChange={(v) => update('edgePort', v)} />
                    </FieldRow>
                  </div>
                </details>
                <FieldRow label="Chế độ chạy">
                  <select className="select" value={cfg.runMode} style={{ maxWidth: 280 }}
                          onChange={(e) => update('runMode', e.target.value)}>
                    <option value="once">Chạy 1 lần rồi dừng</option>
                    <option value="cycle">Lặp lại theo chu kỳ</option>
                  </select>
                </FieldRow>
                {cfg.runMode === 'cycle' && (
                  <FieldRow label="Thời gian chờ giữa chu kỳ" help="Bot sẽ chờ khoảng này sau khi chạy xong toàn bộ nhóm, rồi bắt đầu lượt mới.">
                    <Spinbox value={cfg.cycleWait} min={1} max={480} step={5} suffix="phút"
                             onChange={(v) => update('cycleWait', v)} />
                  </FieldRow>
                )}
                <FieldRow label="Số bài/nhóm" help="Bao nhiêu bài tối đa được comment trong 1 lượt quét.">
                  <Spinbox value={cfg.perGroup} min={1} max={100} suffix="bài"
                           onChange={(v) => update('perGroup', v)} />
                </FieldRow>
                <FieldRow label="Delay sau comment (s)" help="Bot sẽ random từ 80% đến 120% giá trị này.">
                  <Spinbox value={cfg.delay} min={1} max={300} step={5} suffix="giây"
                           onChange={(v) => update('delay', v)} />
                </FieldRow>
                <FieldRow label="Bỏ qua bài đã quét" help="Khi bật: gặp bài đã xử lý trước đó thì dừng nhóm, chuyển sang nhóm mới. Khi tắt: quét lại toàn bộ bài (lịch sử vẫn được lưu bình thường).">
                  <label className="row" style={{ gap: 8, cursor: 'pointer', alignItems: 'center' }}>
                    <input type="checkbox" checked={!!cfg.skipProcessed}
                           onChange={(e) => update('skipProcessed', e.target.checked)} />
                    <span>{cfg.skipProcessed ? 'Bật — dừng nhóm khi gặp bài đã quét' : 'Tắt — quét lại từ đầu mỗi lần chạy'}</span>
                  </label>
                </FieldRow>
                <FieldRow label="Xóa comment chờ duyệt/từ chối" help="Khi comment của bot bị Facebook cho 'Đang chờ duyệt' hoặc 'Bị từ chối', bot tự bấm ⋯ → Xóa để dọn dẹp. Tắt nếu muốn giữ lại để tự xử lý.">
                  <label className="row" style={{ gap: 8, cursor: 'pointer', alignItems: 'center' }}>
                    <input type="checkbox" checked={cfg.deleteUnapproved !== false}
                           onChange={(e) => update('deleteUnapproved', e.target.checked)} />
                    <span>{cfg.deleteUnapproved !== false ? 'Bật — tự xóa comment chờ duyệt / bị từ chối' : 'Tắt — giữ lại comment chờ duyệt / bị từ chối'}</span>
                  </label>
                </FieldRow>
                <FieldRow label="Gửi lỗi comment qua Telegram"
                          help="Khi bot không đăng được comment Facebook, gửi link bài và nội dung comment qua Telegram để bạn xử lý thủ công. Trạng thái xử lý trong app vẫn giữ nguyên.">
                  <Checkbox checked={cfg.tgNotifyCommentErrors} onChange={(v) => update('tgNotifyCommentErrors', v)}
                            label="Bật — gửi comment lỗi qua Telegram" />
                </FieldRow>
              </div>
            </div>
          )}

          {sub === 'ui' && (
            <>
              <div className="section">
                <div className="section-hd">
                  <h3>Giao diện</h3>
                  <span className="meta">Đồng bộ với panel Tweaks (góc dưới phải).</span>
                </div>
                <div className="section-body" style={{ padding: '0 14px' }}>
                  <ConfigSetupGuide {...setupGuides.ui} />
                  <FieldRow label="Theme" help="Theo hệ thống sẽ tự đổi sáng/tối theo Windows hoặc trình duyệt.">
                    <SegmentChoice value={tweaks.theme || (tweaks.dark ? 'dark' : 'light')}
                                   onChange={(v) => setTweak({ theme: v, dark: v === 'dark' })}
                                   options={[
                                     { value: 'system', label: 'Theo hệ thống' },
                                     { value: 'light', label: '☀ Sáng' },
                                     { value: 'dark', label: '☾ Tối' },
                                   ]} />
                  </FieldRow>
                  <FieldRow label="Accent color" help="Màu chính dùng cho nút bấm, link, tab đang chọn.">
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      {accentOptions.map((c) => {
                        const on = tweaks.accent === c;
                        return (
                          <button key={c}
                                  onClick={() => setTweak('accent', c)}
                                  style={{
                                    width: 64, height: 32, borderRadius: 8,
                                    background: c, border: 0, cursor: 'default',
                                    boxShadow: on
                                      ? '0 0 0 2px var(--bg-elev), 0 0 0 4px ' + c
                                      : '0 0 0 1px rgba(0,0,0,.1)',
                                    position: 'relative',
                                  }}
                                  title={c}>
                            {on && (
                              <svg viewBox="0 0 24 24" fill="none" stroke="#fff"
                                   strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                                   style={{ width: 14, height: 14, position: 'absolute',
                                            top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
                                <path d="m5 12 5 5L20 7"/>
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </FieldRow>
                  <FieldRow label="Mật độ thông tin" help="Compact hiển thị nhiều hàng hơn; Spacious dễ đọc hơn.">
                    <SegmentChoice value={tweaks.density}
                                   onChange={(v) => setTweak('density', v)}
                                   options={[
                                     { value: 'compact', label: 'Dày' },
                                     { value: 'balanced', label: 'Cân bằng' },
                                     { value: 'spacious', label: 'Thoáng' },
                                   ]} />
                  </FieldRow>
                  <FieldRow label="Bố cục điều hướng" help="Tab bar trên đầu (mặc định) hoặc sidebar bên trái.">
                    <SegmentChoice value={tweaks.nav}
                                   onChange={(v) => setTweak('nav', v)}
                                   options={[
                                     { value: 'tabbar', label: '☰ Tab bar' },
                                     { value: 'sidebar', label: '⬜ Sidebar' },
                                   ]} />
                  </FieldRow>
                </div>
              </div>
            </>
          )}

          {sub === 'kw' && (
            <>
              <div className="section">
                <div className="section-hd"><h3>Keywords</h3>
                  <span className="meta">Quản lý danh sách buyer-intent keywords để lọc bài trước khi gọi API phân tích.</span></div>
                <div className="section-body" style={{ padding: '0 14px' }}>
                  <ConfigSetupGuide {...setupGuides.kw} />
                </div>
              </div>
              <div className="section">
                <div className="section-hd section-hd-stack">
                  <h3>Buyer Intent Keywords</h3>
                  <span className="meta">Lưu riêng trong file dữ liệu. Chỉ bài chứa các keyword trong bảng này mới được gửi sang API phân tích.</span>
                </div>
                <div className="section-body">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    <button className="btn" onClick={addBuyerIntentKeywordRow}>
                      <Icon name="plus" size={14} /> Thêm dòng
                    </button>
                    <button className="btn primary" disabled={buyerIntentBusy === 'saving'} onClick={saveBuyerIntentKeywords}>
                      {buyerIntentBusy === 'saving' ? 'Đang lưu...' : 'Lưu buyer-intent keywords'}
                    </button>
                    <button className="btn" disabled={buyerIntentBusy === 'loading'} onClick={reloadBuyerIntentKeywords}>
                      {buyerIntentBusy === 'loading' ? 'Đang tải...' : 'Tải lại từ file'}
                    </button>
                  </div>
                  <div className="tbl-wrap">
                    <table className="tbl" style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ width: 70 }}>#</th>
                          <th>Keyword</th>
                          <th style={{ width: 120 }} className="center">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {buyerIntentKeywordRows.length === 0 && (
                          <tr>
                            <td colSpan={3} style={{ color: 'var(--fg-muted)' }}>
                              Chưa có buyer-intent keyword nào. Bấm "Thêm dòng" để bắt đầu.
                            </td>
                          </tr>
                        )}
                        {buyerIntentKeywordRows.map((row, index) => (
                          <tr key={row.id}>
                            <td className="mono dim">{index + 1}</td>
                            <td>
                              <input
                                className="input"
                                value={row.value}
                                placeholder="Ví dụ: cần mua"
                                onChange={(e) => updateBuyerIntentKeywordRow(row.id, e.target.value)}
                              />
                            </td>
                            <td className="center">
                              <button
                                className="btn sm ghost"
                                aria-label="Xóa keyword"
                                onClick={() => deleteBuyerIntentKeywordRow(row.id)}
                              >
                                <Icon name="trash" size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!!buyerIntentMessage && (
                    <div className="dim-2" style={{ marginTop: 8, fontSize: 'var(--font-xs)' }}>
                      {buyerIntentMessage}
                    </div>
                  )}
                  <div className="dim-2" style={{ marginTop: 8, fontSize: 'var(--font-xs)' }}>
                    {normalizeBuyerIntentKeywordRows(buyerIntentKeywordRows).length} keyword hợp lệ
                  </div>
                </div>
              </div>
            </>
          )}

          {sub === 'data' && (
            <div className="section">
              <div className="section-hd">
                <h3>Sao lưu & khôi phục</h3>
                <span className="meta">Export/import khi chuyển máy để không mất cấu hình và lịch sử.</span>
              </div>
              <div className="section-body" style={{ padding: 14 }}>
                <ConfigSetupGuide {...setupGuides.data} />
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button className="btn primary" disabled={!!dataBusy} onClick={exportData}>
                    <Icon name="download" size={14} />
                    {dataBusy === 'export' ? 'Đang export...' : 'Export dữ liệu'}
                  </button>
                  <button className="btn" disabled={!!dataBusy} onClick={importData}>
                    <Icon name="upload" size={14} />
                    {dataBusy === 'import' ? 'Đang import...' : 'Import dữ liệu'}
                  </button>
                </div>
                <div className="dim" style={{ fontSize: 'var(--font-xs)', lineHeight: 1.5, marginTop: 10 }}>
                  Export sẽ tạo file .zip. Import sẽ ghi đè dữ liệu hiện tại, nhưng app tự tạo backup trước trong thư mục data_backups.
                  File config có thể chứa token Telegram, 9Router và TinyURL, nên chỉ gửi cho máy bạn tin tưởng.
                </div>
                {dataMessage && (
                  <div style={{
                    border: '1px solid var(--border)', borderRadius: 6, padding: 10, marginTop: 10,
                    background: 'var(--bg-elev)', fontSize: 'var(--font-xs)', wordBreak: 'break-word',
                    color: dataMessage.includes('Không') || dataMessage.includes('Lỗi') ? 'var(--danger)' : 'var(--fg-muted)',
                  }}>
                    {dataMessage}
                  </div>
                )}
              </div>
            </div>
          )}
          {sub === 'update' && hasUpdateTab && (
            <TabUpdate
              info={updateInfo}
              busy={updateBusy}
              message={updateMessage}
              onInstall={onInstallUpdate}
              onCheck={onCheckUpdates}
              onOpenRelease={onOpenRelease}
            />
          )}
          {sub === 'license' && <TabLicense />}
        </div>
      </div>
    </div>
  );
}

function configUpdateSize(bytes) {
  const n = Number(bytes || 0);
  if (!n) return '';
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  if (n >= 1024) return Math.round(n / 1024) + ' KB';
  return n + ' B';
}

function ConfigSetupGuide({ title, steps = [] }) {
  return (
    <div style={{
      border: '1px solid var(--border)',
      background: 'var(--bg-elev)',
      borderRadius: 8,
      padding: '12px 14px',
      margin: '14px 0',
    }}>
      <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 13 }}>{title}</div>
      <ol style={{ margin: 0, paddingLeft: 20, color: 'var(--fg-muted)', lineHeight: 1.6, fontSize: 13 }}>
        {steps.map((step, idx) => <li key={idx}>{step}</li>)}
      </ol>
    </div>
  );
}

function configReleaseDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function renderInlineMd(text) {
  // **bold** support
  const parts = String(text || '').split(/(\*\*[^*\n]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? React.createElement('strong', { key: i }, p.slice(2, -2))
      : p
  );
}

function MarkdownNotes({ text }) {
  const raw = String(text || '').trim();
  if (!raw) return React.createElement('span', { style: { color: 'var(--fg-muted)' } }, 'Release này chưa có ghi chú thay đổi.');
  const truncated = raw.length > 1800 ? raw.slice(0, 1800).trim() + '\n…' : raw;
  const lines = truncated.split('\n');
  const els = [];
  let listBuf = [];
  let k = 0;

  const flushList = () => {
    if (!listBuf.length) return;
    els.push(React.createElement('ul', { key: k++, style: { margin: '4px 0 8px', paddingLeft: 18 } },
      listBuf.map((item, i) => React.createElement('li', { key: i, style: { marginBottom: 2 } }, renderInlineMd(item)))
    ));
    listBuf = [];
  };

  lines.forEach((line) => {
    if (/^#{1,3} /.test(line)) {
      flushList();
      const level = line.match(/^(#+) /)[1].length;
      const content = line.replace(/^#+\s/, '');
      const size = level === 1 ? '1.05em' : '1em';
      const mt = level === 1 ? 14 : 10;
      els.push(React.createElement('div', { key: k++, style: { fontWeight: 700, fontSize: size, marginTop: mt, marginBottom: 3, color: 'var(--fg)' } }, renderInlineMd(content)));
    } else if (/^[-*] /.test(line)) {
      listBuf.push(line.slice(2));
    } else if (line.trim() === '') {
      flushList();
      els.push(React.createElement('div', { key: k++, style: { height: 6 } }));
    } else {
      flushList();
      els.push(React.createElement('div', { key: k++, style: { marginBottom: 2 } }, renderInlineMd(line)));
    }
  });
  flushList();
  return React.createElement('div', { style: { lineHeight: 1.6, color: 'var(--fg-muted)', fontSize: 13 } }, els);
}

function TabUpdate({ info, busy, message, onInstall, onCheck, onOpenRelease }) {
  if (!info) return null;
  const canInstall = !!info.can_install && !info.dev_mode;
  const size = configUpdateSize(info.asset_size);
  const published = configReleaseDate(info.published_at);
  const notes = configUpdateNotes(info.notes);

  return (
    <div className="section">
      <div className="section-hd">
        <h3>Cập nhật phiên bản mới</h3>
        <span className="meta">Nguồn: GitHub Release</span>
      </div>
      <div className="section-body" style={{ padding: 14 }}>
        <div className="grid grid-2" style={{ gap: 14, marginBottom: 14 }}>
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 14,
            background: 'var(--bg-elev)',
          }}>
            <div className="dim" style={{ fontSize: 12 }}>Đang dùng</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>v{info.current_version || '—'}</div>
            <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
              {info.channel === 'DEV' ? 'Bản DEV / master' : 'Bản release license'}
            </div>
          </div>
          <div style={{
            border: '1px solid color-mix(in oklab, var(--accent) 45%, var(--border))',
            borderRadius: 8,
            padding: 14,
            background: 'var(--accent-soft)',
          }}>
            <div className="dim" style={{ fontSize: 12 }}>Bản mới</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)' }}>v{info.latest_version || '—'}</div>
            <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
              {published || 'Chưa rõ thời điểm phát hành'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {info.asset_name && <Badge>{info.asset_name}</Badge>}
          {size && <Badge>{size}</Badge>}
          <Badge kind={canInstall ? 'ok' : 'warn'}>
            {canInstall ? 'Có thể cập nhật tự động' : 'Mở release để tải thủ công'}
          </Badge>
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
            marginBottom: 14,
          }}>
            Đây là bản DEV chạy từ source/master. App cho xem UI và không yêu cầu nhập key,
            nhưng sẽ không tự ghi đè source khi bấm cập nhật. Hãy tải bản release license nếu cần test đúng gói phát hành.
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Nội dung cập nhật</div>
          <div style={{
            maxHeight: 280,
            overflow: 'auto',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '10px 14px',
            background: 'var(--bg-elev)',
          }}>
            <MarkdownNotes text={info.notes} />
          </div>
        </div>

        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary" disabled={busy} onClick={onInstall}>
            <Icon name={canInstall ? 'download' : 'external'} size={14} />
            {busy ? 'Đang chuẩn bị…' : canInstall ? 'Cập nhật ngay' : 'Mở bản release'}
          </button>
          <button className="btn" disabled={busy} onClick={onCheck}>
            <Icon name="refresh" size={14} /> Kiểm tra lại
          </button>
          <button className="btn ghost" onClick={() => onOpenRelease?.(info.release_url)}>
            <Icon name="external" size={14} /> Trang GitHub Release
          </button>
        </div>

        {message && (
          <div style={{
            marginTop: 12,
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 10,
            background: 'var(--bg-elev)',
            color: message.includes('Lỗi') || message.includes('Không') ? 'var(--danger)' : 'var(--fg-muted)',
            fontSize: 13,
          }}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

// ── License & Hướng dẫn ─────────────────────────────────────────────────────
function TabLicense() {
  const [info, setInfo] = React.useState(null);   // license info từ backend
  const [newKey, setNewKey] = React.useState('');
  const [msg, setMsg] = React.useState({ text: '', ok: true });
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    window.backendApi?.ready?.then((ok) => {
      if (!ok || !window.backendApi.getLicenseInfo) return;
      window.backendApi.getLicenseInfo().then((res) => {
        if (res?.ok) setInfo(res.data);
      });
    });
  }, []);

  const submitKey = () => {
    const key = newKey.trim().toUpperCase();
    if (!key) return;
    setLoading(true);
    setMsg({ text: '', ok: true });
    window.backendApi?.updateLicense?.(key).then((res) => {
      setLoading(false);
      if (res?.ok) {
        setInfo((prev) => ({ ...prev, ...res.data, key, valid: true }));
        setNewKey('');
        setMsg({ text: 'Cập nhật key thành công!', ok: true });
      } else {
        setMsg({ text: res?.error || 'Key không hợp lệ.', ok: false });
      }
    });
  };

  const editionColor = info?.valid
    ? (info.days_left === -1 ? '#7c3aed' : '#2563eb')
    : '#dc2626';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Trạng thái license ── */}
      <div className="section">
        <div className="section-hd"><h3>Trạng thái giấy phép</h3></div>
        <div className="section-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Status card */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px',
            borderRadius: 8, border: `1px solid ${editionColor}40`,
            background: `${editionColor}08`,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
              background: editionColor, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 22,
            }}>
              {info?.valid ? (info.days_left === -1 ? '♾' : '✓') : '✗'}
            </div>
            <div style={{ flex: 1 }}>
              {info?.valid ? (
                <>
                  <div style={{ fontWeight: 700, fontSize: 16, color: editionColor }}>
                    {info.edition}
                    {info.days_left === -1
                      ? <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, opacity: 0.7 }}>Không giới hạn thời gian</span>
                      : <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, opacity: 0.7 }}>Còn {info.days_left} ngày</span>
                    }
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
                    {info.days_left === -1
                      ? 'License vĩnh viễn — không hết hạn'
                      : `Hết hạn cuối tháng ${info.expiry}`
                    }
                  </div>
                  {info.days_left > 0 && info.days_left <= 30 && (
                    <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 4 }}>
                      ⚠ Sắp hết hạn — liên hệ để gia hạn
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#dc2626' }}>Chưa kích hoạt</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
                    Nhập license key bên dưới để sử dụng đầy đủ tính năng.
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Machine ID */}
          <div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 4 }}>
              Machine ID — gửi cho người cấp key khi cần tạo hoặc gia hạn:
            </div>
            <div style={{
              fontFamily: 'Consolas, monospace', fontSize: 18, fontWeight: 700,
              letterSpacing: 4, padding: '10px 14px', borderRadius: 6,
              background: 'var(--bg-elev)', border: '1px solid var(--border)',
              userSelect: 'all', textAlign: 'center', color: 'var(--fg)',
            }}>
              {info?.machine_hash ?? '—'}
            </div>
          </div>

          {/* Nhập key mới */}
          <div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 6 }}>
              {info?.valid ? 'Cập nhật / thay thế key:' : 'Nhập license key:'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input mono"
                placeholder="XXXXXX-XXXXXX-XXXXXX-XXXXXX"
                maxLength={27}
                value={newKey}
                onChange={(e) => setNewKey(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && submitKey()}
                style={{ flex: 1, letterSpacing: 2, fontSize: 14 }}
              />
              <button className="btn primary" disabled={!newKey.trim() || loading} onClick={submitKey}>
                {loading ? 'Đang kiểm tra…' : 'Kích hoạt'}
              </button>
            </div>
            {msg.text && (
              <div style={{ marginTop: 6, fontSize: 12, color: msg.ok ? 'var(--ok)' : 'var(--danger)' }}>
                {msg.text}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Hướng dẫn sử dụng ── */}
      <div className="section">
        <div className="section-hd"><h3>Hướng dẫn sử dụng</h3></div>
        <div className="section-body" style={{ padding: '4px 0' }}>
          <GuideContent />
        </div>
      </div>

    </div>
  );
}

function GuideSection({ title, summary, defaultOpen = false, children }) {
  return (
    <details open={defaultOpen} style={{ borderBottom: '1px solid var(--border)' }}>
      <summary style={{
        listStyle: 'none',
        cursor: 'pointer',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
          {summary && (
            <div style={{ color: 'var(--fg-muted)', fontSize: 12, marginTop: 3, lineHeight: 1.45 }}>
              {summary}
            </div>
          )}
        </div>
        <span className="dim" style={{ fontSize: 12 }}>Mở rộng</span>
      </summary>
      <div style={{ padding: '0 20px 18px 20px', fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.65 }}>
        {children}
      </div>
    </details>
  );
}

function GuideStep({ n, children }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
      <span style={{
        flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
        background: 'var(--accent)', color: 'var(--accent-fg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, marginTop: 1,
      }}>{n}</span>
      <span>{children}</span>
    </div>
  );
}

function GuideList({ children }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
      {children}
    </ul>
  );
}

function GuideNote({ children, tone = 'info' }) {
  const color = tone === 'warn' ? 'var(--warn)' : 'var(--accent)';
  return (
    <div style={{
      border: `1px solid color-mix(in oklab, ${color} 35%, var(--border))`,
      background: tone === 'warn' ? 'var(--warn-soft)' : 'var(--accent-soft)',
      color: 'var(--fg-muted)',
      borderRadius: 8,
      padding: 10,
      marginTop: 10,
      lineHeight: 1.55,
    }}>
      {children}
    </div>
  );
}

function GuideContent() {
  return (
    <div>
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 10,
      }}>
        {[
          ['1', 'Cấu hình', 'Điền URL, AI, Telegram, timing và dữ liệu.'],
          ['2', 'Nhóm FB', 'Thêm nhóm, bật/tắt, chọn Comment hoặc Telegram.'],
          ['3', 'Sản phẩm', 'Quản lý kho link affiliate đã tạo hoặc chờ xử lý.'],
        ].map(([n, title, desc]) => (
          <div key={n} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--bg-elev)' }}>
            <div style={{ fontWeight: 800, color: 'var(--accent)', marginBottom: 4 }}>{n}. {title}</div>
            <div className="dim" style={{ fontSize: 12, lineHeight: 1.45 }}>{desc}</div>
          </div>
        ))}
      </div>

      <GuideSection
        title="Xem nhanh flow chạy bot"
        summary="Các bước tối thiểu để mở app, kết nối browser, thêm nhóm và bắt đầu chạy."
        defaultOpen
      >
        <GuideStep n="1">Chọn trình duyệt ở <b>Cấu hình → Vận hành</b> (Edge / Chrome / Cốc Cốc), đăng nhập sẵn Facebook và ChatGPT (nếu dùng ChatGPT web).</GuideStep>
        <GuideStep n="2">Nhấn <b>Kết nối Browser</b> ở thanh trên, trạng thái chuyển xanh là thành công. Sau khi đổi trình duyệt, vui lòng disconnect và connect lại.</GuideStep>
        <GuideStep n="3">Vào tab <b>Cấu hình → URL</b>: điền URL ChatGPT / Shopee / Affiliate đúng.</GuideStep>
        <GuideStep n="4">Vào tab <b>Nhóm FB</b>: paste URL các nhóm Facebook cần quét.</GuideStep>
        <GuideStep n="5">Nhấn <b>Bắt đầu</b>, bot sẽ tự động duyệt từng nhóm theo chu kỳ.</GuideStep>
      </GuideSection>

      <GuideSection
        title="Tab Cấu hình dùng để làm gì?"
        summary="Nơi thiết lập URL, AI, Telegram, convert link, timing, dữ liệu, update và license."
      >
        <GuideList>
          <li><b>URL</b>: đặt link ChatGPT, Shopee và Shopee Affiliate. Bot dùng các URL này để mở đúng tab khi chạy.</li>
          <li><b>AI</b>: chọn nguồn AI. Dùng <b>Auto</b> nếu muốn thử 9Router trước và tự chuyển sang ChatGPT web khi 9Router lỗi.</li>
          <li><b>Telegram</b>: bật gửi thông báo, nhập Bot Token, Chat ID và bật điều khiển từ xa.</li>
          <li><b>Rút gọn link</b>: chọn kiểu link ngắn hơn trước khi bot comment.</li>
          <li><b>Timing</b>: chỉnh số bài mỗi nhóm, delay sau comment, chế độ chạy một lần hoặc chạy lặp.</li>
          <li><b>Keywords</b>: quản lý buyer-intent keywords để bot chỉ gửi đúng bài có nhu cầu mua sang API phân tích.</li>
          <li><b>Dữ liệu</b>: export/import toàn bộ data khi đổi máy hoặc backup.</li>
          <li><b>Giấy phép & Hướng dẫn</b>: xem license, machine ID và hướng dẫn sử dụng chi tiết.</li>
        </GuideList>
        <GuideNote>
          Các mục trong Cấu hình đang auto-save. Với token đã nhập, UI chỉ hiển thị dạng che để tránh lộ key.
        </GuideNote>
      </GuideSection>

      <GuideSection
        title="Setup Telegram chi tiết"
        summary="Tạo bot Telegram, lấy Bot Token, lấy Chat ID, bật nhận lệnh /status và /start_bot."
      >
        <GuideStep n="1">Mở Telegram, tìm <b>@BotFather</b>, gửi lệnh <code>/newbot</code>.</GuideStep>
        <GuideStep n="2">Đặt tên bot và username kết thúc bằng <code>bot</code>, ví dụ <code>ShopeeSeedingNotifyBot</code>.</GuideStep>
        <GuideStep n="3">BotFather trả về <b>Token</b>. Copy vào <b>Cấu hình → Telegram → Token</b>.</GuideStep>
        <GuideStep n="4">Nhắn một tin bất kỳ cho bot vừa tạo. Nếu dùng group, thêm bot vào group trước.</GuideStep>
        <GuideStep n="5">Lấy <b>Chat ID</b>: mở trình duyệt tới <code>https://api.telegram.org/bot{'<TOKEN>'}/getUpdates</code>, thay <code>{'<TOKEN>'}</code> bằng token thật.</GuideStep>
        <GuideStep n="6">Tìm trường <code>chat_id</code> trong JSON. Chat cá nhân thường là số dương, group thường bắt đầu bằng <code>-100</code>.</GuideStep>
        <GuideStep n="7">Dán Chat ID vào app, bật <b>Gửi thông báo qua Telegram</b> và nhấn <b>Gửi tin test</b>.</GuideStep>
        <GuideStep n="8">Nếu muốn điều khiển bot từ xa, bật <b>Cho phép điều khiển bot qua tin nhắn</b>.</GuideStep>
        <GuideNote tone="warn">
          Không gửi Bot Token cho người khác. Ai có token có thể điều khiển bot Telegram của bạn.
        </GuideNote>
        <p style={{ margin: '12px 0 6px', fontWeight: 700, color: 'var(--fg)' }}>Lệnh Telegram hỗ trợ</p>
        <GuideList>
          <li><code>/status</code>: xem trạng thái bot, browser và tiến độ hiện tại.</li>
          <li><code>/start_bot</code> hoặc <code>/start</code>: bắt đầu chạy bot nếu app đang mở.</li>
          <li><code>/pause</code>: tạm dừng bot đang chạy.</li>
          <li><code>/resume</code>: chạy tiếp sau khi tạm dừng.</li>
          <li><code>/stop</code>: dừng bot.</li>
          <li><code>/connect</code>: kết nối browser nếu chưa có driver.</li>
        </GuideList>
      </GuideSection>

      <GuideSection
        title="Cấu hình AI và 9Router"
        summary="Chọn nguồn AI, nhập token 9Router, chỉnh hai rule phân tích và tạo comment."
      >
        <GuideList>
          <li><b>Auto</b>: bot ưu tiên 9Router nếu bật và test OK; khi 9Router lỗi sẽ tự chuyển sang ChatGPT web.</li>
          <li><b>Chỉ dùng 9Router</b>: nếu 9Router lỗi thì AI dừng, không tự chuyển sang ChatGPT web.</li>
          <li><b>Chỉ dùng ChatGPT web</b>: dùng tab ChatGPT đang mở trên trình duyệt đã chọn, không cần 9Router.</li>
          <li><b>Prompt phân tích bài</b>: kiểm soát cách bot xác định nhu cầu mua và sản phẩm.</li>
          <li><b>Prompt tạo comment</b>: kiểm soát cách bot viết comment tự nhiên.</li>
          <li><b>Sao chép rule</b>: lấy đầy đủ biến và format JSON trước khi chỉnh sửa prompt.</li>
        </GuideList>
        <GuideNote>
          9Router không bắt buộc để chạy bot nếu bạn dùng ChatGPT web. Nó chỉ bắt buộc khi bạn muốn chạy AI qua API riêng hoặc dùng các tính năng phân loại sản phẩm bằng 9Router.
        </GuideNote>
      </GuideSection>

      <GuideSection
        title="Tab Nhóm FB dùng để làm gì?"
        summary="Quản lý danh sách nhóm, thứ tự quét, chế độ comment hoặc gửi Telegram, và phân tích hiệu quả nhóm."
      >
        <GuideList>
          <li><b>Thêm nhóm</b>: paste URL nhóm Facebook. Có thể import nhiều URL, mỗi dòng một nhóm.</li>
          <li><b>Bật/tắt chạy</b>: tắt nhóm để bot bỏ qua nhưng vẫn giữ dữ liệu lịch sử.</li>
          <li><b>Action Comment</b>: bot comment trực tiếp lên bài phù hợp.</li>
          <li><b>Action Telegram</b>: bot gửi bài viết, sản phẩm và comment gợi ý sang Telegram để bạn duyệt thủ công.</li>
          <li><b>Bulk đổi action</b>: chọn nhiều nhóm rồi đổi hàng loạt sang Comment hoặc Telegram.</li>
          <li><b>Thứ tự nhóm</b>: nhóm ở trên được quét trước. Sắp xếp nhóm quan trọng lên đầu.</li>
          <li><b>Phân tích hiệu quả</b>: xem số bài đã quét, bài phù hợp, click, đơn, hoa hồng và đề xuất giữ/gỡ nhóm.</li>
        </GuideList>
        <GuideNote>
          Với nhóm mới hoặc nhóm kiểm duyệt nghiêm, nên để action <b>Telegram</b> trước vài ngày để kiểm tra chất lượng comment.
        </GuideNote>
      </GuideSection>

      <GuideSection
        title="Tab Sản phẩm dùng để làm gì?"
        summary="Kho lưu keyword, sản phẩm và link affiliate để bot tái sử dụng, giảm lỗi và giảm số lần gọi Shopee."
      >
        <GuideList>
          <li><b>Ready</b>: có link affiliate, sẵn dùng</li>
          <li><b>Pending</b>: đã tìm được keyword nhưng chưa tạo được link — bot sẽ thử lại</li>
          <li><b>Bỏ qua</b>: đánh dấu để bot không xử lý sản phẩm này nữa</li>
          <li><b>Thêm thủ công</b>: nhập keyword, tên sản phẩm và URL nếu bạn đã có link tốt.</li>
          <li><b>Promote sang Ready</b>: khi một dòng pending đã có link, chuyển sang ready để bot dùng ngay.</li>
          <li><b>Export / Import</b>: dùng để chỉnh hàng loạt hoặc chuyển kho sản phẩm sang máy khác.</li>
          <li><b>Phân loại</b>: gắn category để tab doanh thu và phân tích sản phẩm đọc dữ liệu rõ hơn.</li>
        </GuideList>
        <GuideNote>
          Kho sản phẩm càng sạch thì comment càng ổn định. Nên xóa hoặc bỏ qua các sản phẩm hết hàng, link lỗi, hoặc keyword quá rộng.
        </GuideNote>
      </GuideSection>

      <GuideSection
        title="Affiliate và rút gọn link"
        summary="Cách bot tạo link Shopee Affiliate và đổi sang link ngắn hơn trước khi comment."
      >
        <GuideList>
          <li><b>Shopee Affiliate</b>: bot tự tạo link qua tab Affiliate đang mở.</li>
          <li><b>TinyURL</b>: dùng key riêng của bạn để rút gọn link.</li>
          <li><b>Muahangre</b>: rút gọn link tự động bằng dịch vụ có sẵn của app.</li>
          <li><b>tiny.cc</b>: rút gọn bằng tab browser đang kết nối.</li>
          <li><b>Khi lỗi link</b>: sản phẩm sẽ vào trạng thái pending để thử lại ở lượt sau.</li>
        </GuideList>
      </GuideSection>

      <GuideSection
        title="Lịch sử, Doanh thu và Tổng quan Click"
        summary="Theo dõi comment đã gửi, đồng bộ đơn/click Shopee Affiliate và xem hiệu quả SubID."
      >
        <GuideList>
          <li>Tab <b>Lịch sử</b>: xem toàn bộ comment / Telegram đã gửi, lọc theo nhóm hoặc ngày</li>
          <li>Tab <b>Doanh thu</b>: sync số liệu click, đơn hàng, hoa hồng từ Shopee Affiliate</li>
          <li>Tab <b>Nhóm FB → Phân tích</b>: xếp hạng nhóm theo hiệu quả thực tế</li>
          <li><b>Tổng quan Click</b>: xem cả SubID của app seeding và SubID khác từ Shopee Affiliate.</li>
        </GuideList>
      </GuideSection>

      <GuideSection
        title="Timing, workflow và dữ liệu"
        summary="Các cài đặt ảnh hưởng tốc độ chạy, độ an toàn, backup và chuyển máy."
      >
        <GuideList>
          <li><b>Bài/nhóm</b>: số bài tối đa bot quét mỗi lần vào nhóm (mặc định 50)</li>
          <li><b>Delay sau comment</b>: nghỉ bao nhiêu giây trước khi xử lý bài tiếp theo</li>
          <li><b>Chu kỳ lặp</b>: sau khi quét hết tất cả nhóm, chờ bao lâu rồi lặp lại</li>
          <li><b>Workflow</b>: <b>Đầy đủ</b> = phân tích + Shopee + affiliate + comment; <b>Chỉ thu thập keyword</b> = lưu keyword vào kho, không comment; <b>Chỉ dùng kho</b> = lấy link sẵn trong kho, không mở Shopee (dự phòng khi Shopee lỗi)</li>
          <li><b>Buyer Intent Keywords</b>: các từ khoá nhận diện ý định mua, quản lý trực tiếp bằng bảng và lưu riêng trong `data/buyer-intent-keywords.json`</li>
          <li><b>Export dữ liệu</b>: tạo file zip chứa config, sản phẩm, lịch sử, doanh thu và thống kê nhóm.</li>
        </GuideList>
      </GuideSection>

      <GuideSection
        title="Mẹo sử dụng hiệu quả"
        summary="Các nguyên tắc vận hành để giảm lỗi, giảm spam và tăng chất lượng dữ liệu."
      >
        <GuideList>
          <li>Dùng chế độ <b>Telegram</b> cho nhóm lớn / nhóm admin nghiêm — bạn review trước khi đăng</li>
          <li>Nhóm nhỏ/mới nên <b>tắt</b> trước, bật dần khi xác nhận không bị hạn chế</li>
          <li>Dùng nhiều token TinyURL để tránh rate limit khi lượng comment cao</li>
          <li>Export dữ liệu định kỳ (<b>Cấu hình → Dữ liệu</b>) để không mất kho sản phẩm khi đổi máy</li>
          <li>Workflow <b>Chỉ thu thập keyword</b> phù hợp để "làm nóng" kho sản phẩm trước khi bật comment</li>
        </GuideList>
      </GuideSection>

      <div style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-faint)', textAlign: 'center' }}>
        Phiên bản hiện tại — Shopee Seeding Bot
      </div>
    </div>
  );
}

window.TabConfig = TabConfig;
window.MarkdownNotes = MarkdownNotes;

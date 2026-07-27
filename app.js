const root = document.documentElement;
const pageRoot = document.getElementById("pageRoot");
const navItems = [...document.querySelectorAll(".nav-item")];

const templates = {
  overview: "overviewTemplate",
  workers: "workersTemplate",
  "facebook-accounts": "facebookAccountsTemplate",
  groups: "groupsTemplate",
  keywords: "keywordsTemplate",
  products: "productsTemplate",
  pending: "pendingTemplate",
  processing: "processingTemplate",
  history: "historyTemplate",
  runs: "runsTemplate",
  revenue: "revenueTemplate",
  "group-performance": "groupPerformanceTemplate",
  settings: "settingsTemplate",
};

const DEFAULT_BACKEND_BASE = "http://127.0.0.1:8787";
const STORAGE_KEYS = {
  page: "fbcc-page-v2",
  theme: "fbcc-theme-v2",
  backend: "fbcc-backend-v1",
};

const appState = {
  page: (() => {
    const storedPage = localStorage.getItem(STORAGE_KEYS.page) || "overview";
    if (storedPage === "live") return "overview";
    if (storedPage === "pending") return "products";
    return storedPage;
  })(),
  backendBase: localStorage.getItem(STORAGE_KEYS.backend) || DEFAULT_BACKEND_BASE,
  backendConnected: false,
  browserConnected: false,
  browserInfo: null,
  bot: { status: "idle", scope: null, text: "Sẵn sàng" },
  progress: {
    groups: 0,
    totalGroups: 0,
    scanned: 0,
    suitable: 0,
    direct: 0,
    telegram: 0,
    workflowMode: "full",
  },
  configUi: {},
  summary: {},
  workers: [],
  facebookAccounts: [],
  groups: [],
  groupTypes: [],
  productTypes: [],
  keywords: [],
  products: [],
  history: [],
  runs: [],
  revenueOverview: null,
  revenueStats: null,
  revenueCharts: { daily: [], hourly: [] },
  revenueTopProducts: [],
  revenueTopShops: [],
  revenueTopSubids: [],
  groupPerformance: [],
  logs: [],
  eventSource: null,
  currentRenderId: 0,
  ui: {
    settingsTab: "operations",
    facebookAccountsQuery: "",
    selectedFacebookAccounts: new Set(),
    groupsQuery: "",
    groupsFilter: "all",
    groupsTypeFilter: "all",
    selectedGroups: new Set(),
    selectedProducts: new Set(),
    keywordsQuery: "",
    keywordsFilter: "all",
    productsQuery: "",
    productsFilter: "all",
    pendingFilter: "pending",
    historyQuery: "",
    historyFilter: "all",
    runsQuery: "",
    runsFilter: "all",
    performanceQuery: "",
    performanceFilter: "all",
    revenueRange: "30d",
    tablePages: {},
    workerMonitor: {
      workerId: "",
      filter: "all",
      search: "",
    },
  },
};

const pageDeps = {
  overview: ["core", "groups", "workers", "history", "runs", "revenue"],
  workers: ["core", "workers", "facebookAccounts", "groups"],
  "facebook-accounts": ["core", "facebookAccounts", "workers"],
  groups: ["core", "groups", "workers"],
  keywords: ["core", "keywords", "products"],
  products: ["core", "products"],
  pending: ["core", "products"],
  processing: ["core", "groups", "products", "history", "runs"],
  history: ["core", "history"],
  runs: ["core", "runs", "workers"],
  revenue: ["core", "revenue"],
  "group-performance": ["core", "groupPerformance"],
  settings: ["core", "keywords"],
};

const icons = {
  success: "✓",
  warning: "!",
  info: "i",
};

let workerMonitorDialog = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value) {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat("vi-VN").format(Number.isFinite(numeric) ? numeric : 0);
}

function formatPercent(value, digits = 1) {
  const numeric = Number(value || 0);
  return `${numeric.toFixed(digits)}%`;
}

function formatShortNumber(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "0";
  if (numeric >= 1_000_000_000) return `${(numeric / 1_000_000_000).toFixed(1)}B`;
  if (numeric >= 1_000_000) return `${(numeric / 1_000_000).toFixed(1)}M`;
  if (numeric >= 1_000) return `${(numeric / 1_000).toFixed(1)}K`;
  return String(Math.round(numeric));
}

function formatMoneyShort(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "0";
  if (numeric >= 1_000_000_000) return `${(numeric / 1_000_000_000).toFixed(1)}B`;
  if (numeric >= 1_000_000) return `${(numeric / 1_000_000).toFixed(1)}M`;
  if (numeric >= 1_000) return `${(numeric / 1_000).toFixed(0)}K`;
  return String(Math.round(numeric));
}

function formatDate(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("vi-VN");
}

function formatDateTime(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("vi-VN", { hour12: false });
}

function formatTime(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function foldSearchText(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function primaryWorker(workers = appState.workers) {
  return Array.isArray(workers) && workers.length ? workers[0] : null;
}

function workerBrowserConnected(worker = primaryWorker()) {
  return !!worker?.runtime?.browserConnected;
}

function normalizeFacebookAccountsState(values = []) {
  return (Array.isArray(values) ? values : []).map((account, index) => ({
    id: String(account?.id || `facebook-account-${index + 1}`).trim() || `facebook-account-${index + 1}`,
    name: String(account?.name || "").trim() || `Facebook ${index + 1}`,
    cookieJson: String(account?.cookieJson ?? account?.facebookCookieJson ?? "").trim(),
    cookieStatus: String(account?.cookieStatus || "unchecked").trim() || "unchecked",
    cookieCheckedAt: String(account?.cookieCheckedAt || "").trim(),
    cookieStatusMessage: String(account?.cookieStatusMessage || "").trim(),
    assignedWorkerId: String(account?.assignedWorkerId || "").trim(),
    assignedWorkerName: String(account?.assignedWorkerName || "").trim(),
    pendingComments: Number(account?.pendingComments || 0),
    rejectedComments: Number(account?.rejectedComments || 0),
    createdAt: account?.createdAt || "",
    updatedAt: account?.updatedAt || "",
  }));
}

function facebookAccountById(accountId) {
  const id = String(accountId || "").trim();
  if (!id) return null;
  return appState.facebookAccounts.find((account) => account.id === id) || null;
}

function workerUsingFacebookAccount(accountId, excludeWorkerId = "") {
  const id = String(accountId || "").trim();
  if (!id) return null;
  return appState.workers.find((worker) => (
    String(worker?.id || "") !== String(excludeWorkerId || "")
    && String(worker?.facebookAccountId || "").trim() === id
  )) || null;
}

function availableFacebookAccountsForWorker(worker = null) {
  return appState.facebookAccounts.map((account) => {
    const assignedWorker = workerUsingFacebookAccount(account.id, worker?.id || "");
    return {
      ...account,
      assignedWorker,
      available: !assignedWorker,
    };
  });
}

function cookiePreview(cookieJson) {
  const value = String(cookieJson || "").trim();
  if (!value) return "Chưa có cookie";
  return value.length > 96 ? `${value.slice(0, 96)}...` : value;
}

function facebookCookieStatusMeta(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "valid") {
    return {
      label: "Cookie hợp lệ",
      pillClass: "success-pill account-cookie-pill",
    };
  }
  if (normalized === "expired") {
    return {
      label: "Cookie hết hạn",
      pillClass: "danger-pill account-cookie-pill",
    };
  }
  return {
    label: "Chưa xác minh",
    pillClass: "warning-pill account-cookie-pill",
  };
}

function normalizeIdList(values) {
  const seen = new Set();
  const rows = [];
  (Array.isArray(values) ? values : []).forEach((value) => {
    const id = String(value ?? "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    rows.push(id);
  });
  return rows;
}

function supportedBrowserCatalogFallback() {
  return [
    { type: "chrome", label: "Google Chrome", supported: true, installed: false, paths: [] },
    { type: "edge", label: "Microsoft Edge", supported: true, installed: false, paths: [] },
    { type: "brave", label: "Brave", supported: true, installed: false, paths: [] },
    { type: "firefox", label: "Firefox", supported: true, installed: false, paths: [] },
  ];
}

function normalizeBrowserCatalog(entries = []) {
  const source = Array.isArray(entries) && entries.length ? entries : supportedBrowserCatalogFallback();
  const seen = new Set();
  return source
    .map((browser) => ({
      type: String(browser?.type || "").trim(),
      label: String(browser?.label || browser?.type || "").trim(),
      supported: browser?.supported !== false,
      installed: !!browser?.installed || (Array.isArray(browser?.paths) && browser.paths.length > 0) || !!browser?.path,
      path: browser?.path || "",
      paths: Array.isArray(browser?.paths) ? browser.paths : [],
    }))
    .filter((browser) => browser.supported && browser.type && !seen.has(browser.type) && seen.add(browser.type));
}

function browserInstallLabel(browser) {
  return browser?.installed ? "Đã cài trên máy" : "Chưa cài trên máy";
}

function browserOptionLabel(browser) {
  return `${browser.label} - ${browserInstallLabel(browser)}`;
}

function normalizeGroupsState(values = []) {
  const fallbackTypeId = groupTypeOptions()[0]?.id || "community-general";
  return (Array.isArray(values) ? values : []).map((group, index) => ({
    ...group,
    id: group?.id ?? index + 1,
    name: String(group?.name || "").trim() || String(group?.url || "").trim() || `Group ${index + 1}`,
    url: String(group?.url || "").trim(),
    groupTypeId: String(group?.groupTypeId || group?.typeId || fallbackTypeId).trim() || fallbackTypeId,
  }));
}

function defaultGroupTypes() {
  return [
    { id: "community-general", label: "Cộng đồng chung" },
    { id: "buy-sell-general", label: "Mua bán tổng hợp" },
    { id: "real-estate", label: "Bất động sản" },
    { id: "vehicles", label: "Xe cộ" },
    { id: "jobs-services", label: "Việc làm dịch vụ" },
    { id: "mother-baby", label: "Mẹ và bé" },
    { id: "technology", label: "Công nghệ điện tử" },
    { id: "fashion-beauty", label: "Thời trang làm đẹp" },
    { id: "home-living", label: "Đồ gia dụng nhà cửa" },
    { id: "food-travel-pets", label: "Ẩm thực du lịch thú cưng" },
  ];
}

function normalizeGroupTypes(values = []) {
  const seen = new Set();
  const source = Array.isArray(values) && values.length ? values : defaultGroupTypes();
  return source
    .map((item, index) => ({
      id: String(item?.id || `group-type-${index + 1}`).trim(),
      label: String(item?.label || item?.name || "").trim() || `Loai nhom ${index + 1}`,
    }))
    .filter((item) => item.id && !seen.has(item.id) && seen.add(item.id));
}

function groupTypeOptions() {
  return normalizeGroupTypes(appState.groupTypes);
}

function groupTypeLabel(groupTypeId) {
  const match = groupTypeOptions().find((item) => String(item.id) === String(groupTypeId || ""));
  return match?.label || "Chưa phân loại";
}

function defaultProductTypes() {
  return [
    { id: "phone-accessories", label: "Điện thoại phụ kiện" },
    { id: "home-living", label: "Gia dụng nhà cửa" },
    { id: "mother-baby", label: "Mẹ và bé" },
    { id: "beauty-personal-care", label: "Làm đẹp cá nhân" },
    { id: "fashion-lifestyle", label: "Thời trang lifestyle" },
    { id: "pet-travel-food", label: "Thú cưng du lịch ẩm thực" },
  ];
}

function normalizeProductTypes(values = []) {
  const seen = new Set();
  const source = Array.isArray(values) && values.length ? values : defaultProductTypes();
  return source
    .map((item, index) => ({
      id: String(item?.id || `product-type-${index + 1}`).trim(),
      label: String(item?.label || item?.name || "").trim() || `Loai san pham ${index + 1}`,
    }))
    .filter((item) => item.id && !seen.has(item.id) && seen.add(item.id));
}

function productTypeOptions() {
  return normalizeProductTypes(appState.productTypes);
}

function productTypeLabel(productTypeId, fallback = "") {
  const match = productTypeOptions().find((item) => String(item.id) === String(productTypeId || ""));
  return match?.label || fallback || "Chưa phân loại";
}

function workerUsesGroup(worker, groupId) {
  const selected = normalizeIdList(worker?.groupIds);
  if (!selected.length) return true;
  return selected.includes(String(groupId ?? ""));
}

function groupWorkers(group, workers = appState.workers) {
  return (Array.isArray(workers) ? workers : [])
    .filter((worker) => workerUsesGroup(worker, group?.id))
    .map((worker) => worker.name || worker.id || "Worker")
    .filter(Boolean);
}

function groupWorkersTitle(names = []) {
  return names.map((name, index) => `${index + 1}. ${name}`).join("\n");
}

const TABLE_PAGE_SIZES = {
  overviewGroups: 4,
  facebookAccounts: 20,
  groups: 20,
  keywords: 20,
  products: 20,
  pending: 20,
  history: 20,
  runs: 20,
  groupPerformance: 20,
};

function tablePageSize(key) {
  return TABLE_PAGE_SIZES[key] || 20;
}

function setTablePage(key, page) {
  const nextPage = Math.max(1, Number(page) || 1);
  appState.ui.tablePages[key] = nextPage;
  return nextPage;
}

function resetTablePage(key) {
  delete appState.ui.tablePages[key];
}

function paginateRows(rows, key, pageSize = tablePageSize(key)) {
  const items = Array.isArray(rows) ? rows : [];
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(Math.max(total, 1) / pageSize));
  const requestedPage = Number(appState.ui.tablePages[key] || 1);
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  appState.ui.tablePages[key] = page;
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, total);
  return {
    items: items.slice(startIndex, endIndex),
    page,
    pageSize,
    total,
    totalPages,
    start: total ? startIndex + 1 : 0,
    end: endIndex,
  };
}

function ensurePaginationElement(table, key, beforeNode = null) {
  if (!(table instanceof HTMLElement)) return null;
  const parent = table.parentElement;
  if (!parent) return null;
  let pagination = parent.querySelector(`.pagination[data-pagination-key="${key}"]`);
  if (!pagination) {
    const adjacent = table.nextElementSibling;
    if (adjacent instanceof HTMLElement && adjacent.classList.contains("pagination") && !adjacent.dataset.paginationKey) {
      pagination = adjacent;
    } else {
      pagination = document.createElement("div");
      pagination.className = "pagination";
      if (beforeNode && beforeNode.parentElement === parent) parent.insertBefore(pagination, beforeNode);
      else parent.insertBefore(pagination, table.nextSibling);
    }
  }
  pagination.dataset.paginationKey = key;
  return pagination;
}

function renderPagination(pagination, config) {
  if (!(pagination instanceof HTMLElement)) return;
  const {
    key,
    page,
    totalPages,
    start,
    end,
    total,
    noun = "mục",
  } = config || {};
  pagination.innerHTML = `
    <span>${total ? `Hiển thị ${formatNumber(start)}–${formatNumber(end)} / ${formatNumber(total)} ${escapeHtml(noun)}` : `Hiển thị 0 / 0 ${escapeHtml(noun)}`}</span>
    <div class="pagination-pages">
      <button class="btn ghost" data-table-page-key="${escapeHtml(key)}" data-table-page="${Math.max(1, Number(page || 1) - 1)}"${page <= 1 ? " disabled" : ""}>←</button>
      <span>Trang ${formatNumber(page || 1)} / ${formatNumber(totalPages || 1)}</span>
      <button class="btn ghost" data-table-page-key="${escapeHtml(key)}" data-table-page="${Math.min(Number(totalPages || 1), Number(page || 1) + 1)}"${page >= totalPages ? " disabled" : ""}>→</button>
    </div>
  `;
}

const KPI_TONE_SEQUENCE = ["total", "success", "warning", "danger", "info", "primary"];

function renderKpiBadges(cards, items = []) {
  const nodes = Array.isArray(cards) ? cards : [...cards];
  nodes.forEach((card, index) => {
    if (!(card instanceof HTMLElement)) return;
    const item = items[index];
    if (!item) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    const tone = String(item.tone || KPI_TONE_SEQUENCE[index % KPI_TONE_SEQUENCE.length]).trim().toLowerCase();
    const meta = String(item.meta || "").trim();
    const note = String(item.note || "").trim();
    const tooltip = [meta, note].filter(Boolean).join("\n");
    card.className = `kpi kpi-badge kpi-tone-${escapeHtml(tone)}`;
    card.title = tooltip;
    card.innerHTML = `
      <span class="kpi-label">${escapeHtml(item.label || "Chỉ số")}</span>
      <strong>${escapeHtml(item.value || "0")}</strong>
    `;
  });
}

function layoutTablePanelKpis(page) {
  if (!(page instanceof HTMLElement)) return;
  const heads = [...page.querySelectorAll(".table-panel-head")];
  heads.forEach((head) => {
    if (!(head instanceof HTMLElement)) return;
    const kpiGrid = head.querySelector(".table-panel-kpis");
    if (!(kpiGrid instanceof HTMLElement)) return;
    kpiGrid.hidden = false;
    if (head.scrollWidth > head.clientWidth + 1) {
      kpiGrid.hidden = true;
    }
  });
}

function filteredFacebookAccounts() {
  const query = appState.ui.facebookAccountsQuery.trim().toLowerCase();
  return appState.facebookAccounts.filter((account) => {
    if (!query) return true;
    return `${account.name} ${account.assignedWorkerName} ${account.cookieJson}`.toLowerCase().includes(query);
  });
}

function filteredGroupsList() {
  return appState.groups.filter((group) => {
    if (appState.ui.groupsFilter === "running" && group.enabled === false) return false;
    if (appState.ui.groupsFilter === "paused" && !group.paused) return false;
    if (appState.ui.groupsFilter === "error" && Number(group.fail || 0) <= 0) return false;
    if (appState.ui.groupsTypeFilter !== "all" && String(group.groupTypeId || "") !== appState.ui.groupsTypeFilter) return false;
    const query = appState.ui.groupsQuery.trim().toLowerCase();
    if (!query) return true;
    return `${group.name} ${group.url} ${groupTypeLabel(group.groupTypeId)}`.toLowerCase().includes(query);
  });
}

async function loadBrowserCatalog() {
  try {
    const response = await api.call("detectInstalledBrowsers");
    return normalizeBrowserCatalog(response.data?.browsers);
  } catch (error) {
    console.error("[fbcc] loadBrowserCatalog failed", error);
    return normalizeBrowserCatalog();
  }
}

function workerAssignedGroups(worker, groups = appState.groups) {
  const rows = Array.isArray(groups) ? groups : [];
  const groupIds = normalizeIdList(worker?.groupIds);
  if (!groupIds.length) return rows.filter((group) => group?.url);
  const allowed = new Set(groupIds);
  return rows.filter((group) => allowed.has(String(group?.id ?? "").trim()));
}

function workerGroupScopeLabel(worker, groups = appState.groups) {
  const assignedIds = normalizeIdList(worker?.groupIds);
  if (!assignedIds.length) {
    const enabledCount = groups.filter((group) => group.enabled !== false && group.url).length;
    return enabledCount ? `Tất cả ${enabledCount} nhóm bật` : "Tất cả nhóm";
  }
  return `${workerAssignedGroups(worker, groups).length} nhóm đã gán`;
}

function suggestedWorkerPort(worker = null) {
  const usedPorts = new Set(
    appState.workers
      .filter((item) => item?.id !== worker?.id)
      .map((item) => Number(item?.edgePort || 0))
      .filter((port) => Number.isInteger(port) && port > 0),
  );
  let port = Number(worker?.edgePort || appState.configUi.edgePort || 9222);
  if (!Number.isInteger(port) || port < 1024) port = 9222;
  while (usedPorts.has(port) && port < 65535) {
    port += 1;
  }
  return port;
}

function validateWorkerEdgePort(rawValue, worker = null) {
  const edgePort = Number(rawValue);
  if (!Number.isInteger(edgePort) || edgePort < 1024 || edgePort > 65535) {
    throw new Error("Port phải là số nguyên từ 1024 đến 65535.");
  }
  const duplicate = appState.workers.find((item) => (
    item?.id !== worker?.id
    && Number(item?.edgePort || 0) === edgePort
  ));
  if (duplicate) {
    throw new Error(`Port ${edgePort} đang được worker ${duplicate.name || duplicate.id || "khác"} sử dụng.`);
  }
  return edgePort;
}

function validateFacebookCookieJson(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  let parsed = null;
  try {
    parsed = JSON.parse(value);
  } catch (_) {
    throw new Error("Cookie Facebook phải là JSON hợp lệ.");
  }
  const cookies = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.cookies)
      ? parsed.cookies
      : (parsed && typeof parsed === "object" && parsed.name && Object.prototype.hasOwnProperty.call(parsed, "value"))
        ? [parsed]
        : null;
  if (!Array.isArray(cookies) || !cookies.length) {
    throw new Error("Cookie Facebook phải là mảng cookie hoặc object có trường cookies.");
  }
  return value;
}

async function showWorkerEditor(worker = null) {
  const browserCatalog = await loadBrowserCatalog();
  const installedBrowser = browserCatalog.find((browser) => browser.installed);
  const selectedGroupIds = normalizeIdList(worker?.groupIds);
  const selectedFacebookAccountId = String(worker?.facebookAccountId || "").trim();
  const defaultBrowserType = worker?.browserType
    || installedBrowser?.type
    || appState.configUi.browserType
    || browserCatalog[0]?.type
    || "chrome";
  const defaultEdgePort = suggestedWorkerPort(worker);
  const facebookAccountOptions = availableFacebookAccountsForWorker(worker);
  const groups = [...appState.groups];
  const result = await openDialog({
    kicker: "Worker",
    title: worker ? `Cấu hình ${worker.name || "worker"}` : "Tạo worker",
    message: worker
      ? "Bạn có thể đổi browser và chọn nhiều nhóm cho worker này. Một nhóm có thể gán cho nhiều worker."
      : "Chọn browser cho worker và danh sách nhóm sẽ chạy. Nếu không chọn nhóm nào, worker sẽ dùng tất cả nhóm đang bật.",
    confirmLabel: worker ? "Lưu worker" : "Tạo worker",
    cardClass: "dialog-wide dialog-worker-form",
    fields: [
      {
        name: "name",
        label: "Tên worker",
        type: "text",
        value: worker?.name || "",
        placeholder: "Ví dụ: FB Account 02",
        className: "dialog-field-half",
      },
      {
        name: "browserType",
        label: "Browser",
        type: "select",
        value: defaultBrowserType,
        className: "dialog-field-half",
        options: browserCatalog.map((browser) => ({
          value: browser.type,
          label: browserOptionLabel(browser),
          disabled: !browser.installed && browser.type !== worker?.browserType,
        })),
      },
      {
        name: "edgePort",
        label: "Debug port",
        type: "number",
        value: defaultEdgePort,
        placeholder: "Ví dụ: 9223",
        className: "dialog-field-half",
      },
      {
        name: "facebookAccountId",
        label: "Tài khoản Facebook",
        type: "select",
        value: selectedFacebookAccountId,
        options: [
          { value: "", label: "Chưa gắn tài khoản Facebook" },
          ...facebookAccountOptions.map((account) => ({
            value: account.id,
            label: account.assignedWorker
              ? `${account.name} - đang gắn ${account.assignedWorker.name || account.assignedWorker.id}`
              : account.name,
            disabled: !!account.assignedWorker,
          })),
        ],
        className: "dialog-field-half",
      },
      {
        name: "groupIds",
        label: "Danh sách nhóm cho worker",
        type: "group-table",
        value: selectedGroupIds,
        options: groups.map((group) => {
          const workerNames = groupWorkers(group, appState.workers);
          return {
            value: String(group.id),
            label: group.name || group.url,
            groupTypeId: String(group.groupTypeId || ""),
            groupTypeLabel: groupTypeLabel(group.groupTypeId),
            url: group.url || "",
            workersText: workerNames.length ? workerNames.join(", ") : "Chưa có worker",
            workersTitle: workerNames.length ? groupWorkersTitle(workerNames) : "Chưa có worker nào dùng nhóm này.",
          };
        }),
        emptyText: "Chưa có group nào để chọn.",
      },
    ],
  });
  if (!result) return null;
  let edgePort = defaultEdgePort;
  try {
    edgePort = validateWorkerEdgePort(result.edgePort, worker);
  } catch (error) {
    await showAlert(error.message || String(error), {
      title: "Port worker chưa hợp lệ",
      description: "Hãy nhập một debug port riêng cho worker này.",
      confirmLabel: "Đã hiểu",
      confirmClass: "warning",
    });
    return null;
  }
  return {
    name: String(result.name || "").trim(),
    browserType: String(result.browserType || defaultBrowserType).trim(),
    edgePort,
    facebookAccountId: String(result.facebookAccountId || "").trim(),
    groupIds: normalizeIdList(result.groupIds),
  };
}

async function showFacebookAccountEditor(account = null) {
  const result = await openDialog({
    kicker: "Facebook",
    title: account ? `Chỉnh sửa ${account.name || "tài khoản"}` : "Thêm tài khoản Facebook",
    message: account
      ? "Cập nhật tên Facebook và cookie JSON cho tài khoản này."
      : "Tạo tài khoản Facebook riêng để worker có thể chọn và restore session bằng cookie.",
    confirmLabel: account ? "Lưu tài khoản" : "Thêm tài khoản",
    cardClass: "dialog-wide dialog-facebook-account",
    fields: [
      {
        name: "name",
        label: "Tên Facebook",
        type: "text",
        value: account?.name || "",
        placeholder: "Ví dụ: FB Account 02",
      },
      {
        name: "cookieJson",
        label: "Cookie Facebook (JSON)",
        type: "textarea",
        value: account?.cookieJson || "",
        placeholder: '[{"name":"c_user","value":"...","domain":".facebook.com","path":"/"}]',
      },
    ],
  });
  if (!result) return null;
  const rawCookieJson = String(result.cookieJson || "").trim();
  let cookieJson = "";
  if (rawCookieJson) {
    try {
      cookieJson = validateFacebookCookieJson(rawCookieJson);
    } catch (error) {
      await showAlert(error.message || String(error), {
        title: "Cookie Facebook chưa đúng",
        description: "Hãy dán lại JSON cookie hợp lệ rồi lưu tài khoản.",
        confirmLabel: "Đã hiểu",
        confirmClass: "warning",
      });
      return null;
    }
  }
  return {
    name: String(result.name || "").trim(),
    cookieJson,
  };
}

async function showGroupEditor(group = null) {
  workerMonitorDialog?.close?.();
  const defaultTypeId = group?.groupTypeId || groupTypeOptions()[0]?.id || "community-general";
  const result = await openDialog({
    kicker: "Nhóm Facebook",
    title: group ? `Chỉnh sửa ${group.name || "nhóm"}` : "Thêm nhóm Facebook",
    message: group
      ? "Cập nhật tên nhóm, URL và loại nhóm cho nguồn crawl này."
      : "Nhập tên nhóm, URL và loại nhóm để đưa vào danh sách worker có thể sử dụng.",
    confirmLabel: group ? "Lưu nhóm" : "Thêm nhóm",
    fields: [
      {
        name: "name",
        label: "Tên nhóm",
        type: "text",
        value: group?.name || "",
        placeholder: "Ví dụ: Nhóm mẹ và bé HCM",
      },
      {
        name: "url",
        label: "URL nhóm",
        type: "text",
        value: group?.url || "",
        placeholder: "https://www.facebook.com/groups/...",
      },
      {
        name: "groupTypeId",
        label: "Loại nhóm",
        type: "select",
        value: defaultTypeId,
        options: groupTypeOptions().map((item) => ({
          value: item.id,
          label: item.label,
        })),
      },
    ],
  });
  if (!result) return null;
  return {
    name: String(result.name || "").trim(),
    url: String(result.url || "").trim(),
    groupTypeId: String(result.groupTypeId || defaultTypeId).trim() || defaultTypeId,
  };
}

async function saveGroupTypesState(nextGroupTypes) {
  const normalized = normalizeGroupTypes(nextGroupTypes);
  await api.call("saveGroupTypes", normalized);
  appState.groupTypes = normalized;
  return normalized;
}

function openGroupTypesManagerDialog() {
  workerMonitorDialog?.close?.();
  const rootElement = ensureDialogRoot();
  let pendingTypes = normalizeGroupTypes(appState.groupTypes);

  const groupUsageCount = (groupTypeId) => appState.groups.filter((group) => String(group.groupTypeId || "") === String(groupTypeId || "")).length;

  const render = () => {
    const tableBody = rootElement.querySelector("[data-group-types-body]");
    if (!tableBody) return;
    tableBody.innerHTML = pendingTypes.map((item, index) => {
      const usageCount = groupUsageCount(item.id);
      const canDelete = pendingTypes.length > 1 && usageCount === 0;
      return `<div class="group-type-row">
        <span>${index + 1}</span>
        <span><b>${escapeHtml(item.label)}</b></span>
        <span>${usageCount ? `${usageCount} nhóm` : "Chưa dùng"}</span>
        <span><button type="button" class="btn danger" data-group-type-delete="${escapeHtml(item.id)}" title="${canDelete ? "Xóa loại nhóm" : "Không thể xóa loại đang được sử dụng"}"${canDelete ? "" : " disabled"}>Xóa</button></span>
      </div>`;
    }).join("") || `<div class="group-type-row group-type-row-empty"><span>—</span><span><b>Chưa có loại nhóm</b></span><span>—</span><span></span></div>`;
  };

  const close = () => {
    document.removeEventListener("keydown", handleKeydown);
    rootElement.removeEventListener("click", handleClick);
    rootElement.classList.remove("active");
    rootElement.innerHTML = "";
  };

  const handleKeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  const handleClick = async (event) => {
    if (event.target.closest(".dialog-backdrop") || event.target.closest("[data-group-types-close]")) {
      close();
      return;
    }
    const addButton = event.target.closest("[data-group-types-add]");
    if (addButton) {
      const input = rootElement.querySelector("[data-group-types-input]");
      const label = String(input?.value || "").trim();
      if (!label) {
        input?.focus();
        return;
      }
      const slug = label
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "d")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || `group-type-${pendingTypes.length + 1}`;
      const foldedLabel = foldSearchText(label);
      if (pendingTypes.some((item) => item.id === slug || foldSearchText(item.label) === foldedLabel)) {
        showToast("Loại nhóm này đã tồn tại.", {
          title: "Trùng loại nhóm",
          tone: "warning",
        });
        return;
      }
      pendingTypes = await saveGroupTypesState([...pendingTypes, { id: slug, label }]);
      input.value = "";
      render();
      refreshCurrentPage();
      input?.focus();
      return;
    }
    const deleteButton = event.target.closest("[data-group-type-delete]");
    if (!deleteButton) return;
    const groupTypeId = String(deleteButton.dataset.groupTypeDelete || "");
    const usageCount = groupUsageCount(groupTypeId);
    if (usageCount > 0 || pendingTypes.length <= 1) return;
    const groupTypeLabelText = pendingTypes.find((item) => item.id === groupTypeId)?.label || groupTypeId;
    if (!window.confirm(`Xóa loại nhóm "${groupTypeLabelText}"?`)) return;
    pendingTypes = await saveGroupTypesState(pendingTypes.filter((item) => item.id !== groupTypeId));
    render();
    refreshCurrentPage();
  };

  rootElement.classList.add("active");
  rootElement.innerHTML = `
    <div class="dialog-backdrop"></div>
    <div class="dialog-wrap">
      <div class="dialog-card dialog-wide" role="dialog" aria-modal="true" aria-labelledby="groupTypesManagerTitle">
        <div class="dialog-head">
          <span class="dialog-kicker">Loại Nhóm</span>
          <h2 id="groupTypesManagerTitle">Quản lý loại nhóm</h2>
          <p>Danh sách này được dùng cho bộ lọc, form thêm nhóm và chỉnh sửa nhanh trên bảng Nhóm Facebook.</p>
        </div>
        <div class="dialog-body">
          <div class="group-type-create">
            <input type="text" data-group-types-input placeholder="Nhập loại nhóm mới...">
            <button type="button" class="btn primary" data-group-types-add>Thêm loại</button>
          </div>
          <div class="group-type-table">
            <div class="group-type-head"><span>STT</span><span>Loại nhóm</span><span>Đang dùng</span><span></span></div>
            <div class="group-type-body" data-group-types-body></div>
          </div>
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn secondary" data-group-types-close>Đóng</button>
        </div>
      </div>
    </div>
  `;

  rootElement.addEventListener("click", handleClick);
  document.addEventListener("keydown", handleKeydown);
  render();
  window.requestAnimationFrame(() => {
    rootElement.querySelector("[data-group-types-input]")?.focus();
  });
}

async function saveProductTypesState(nextProductTypes) {
  const normalized = normalizeProductTypes(nextProductTypes);
  await api.call("saveProductTypes", normalized);
  appState.productTypes = normalized;
  return normalized;
}

function openProductTypesManagerDialog() {
  workerMonitorDialog?.close?.();
  const rootElement = ensureDialogRoot();
  let pendingTypes = normalizeProductTypes(appState.productTypes);

  const productUsageCount = (productTypeId) => appState.products.filter((product) => (
    String(product.productTypeId || "") === String(productTypeId || "")
  )).length;

  const render = () => {
    const tableBody = rootElement.querySelector("[data-product-types-body]");
    if (!tableBody) return;
    tableBody.innerHTML = pendingTypes.map((item, index) => {
      const usageCount = productUsageCount(item.id);
      const canDelete = pendingTypes.length > 1 && usageCount === 0;
      return `<div class="group-type-row">
        <span>${index + 1}</span>
        <span><b>${escapeHtml(item.label)}</b></span>
        <span>${usageCount ? `${usageCount} sản phẩm` : "Chưa dùng"}</span>
        <span><button type="button" class="btn danger" data-product-type-delete="${escapeHtml(item.id)}" title="${canDelete ? "Xóa loại sản phẩm" : "Không thể xóa loại đang được sử dụng"}"${canDelete ? "" : " disabled"}>Xóa</button></span>
      </div>`;
    }).join("") || `<div class="group-type-row group-type-row-empty"><span>—</span><span><b>Chưa có loại sản phẩm</b></span><span>—</span><span></span></div>`;
  };

  const close = () => {
    document.removeEventListener("keydown", handleKeydown);
    rootElement.removeEventListener("click", handleClick);
    rootElement.classList.remove("active");
    rootElement.innerHTML = "";
  };

  const handleKeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  const handleClick = async (event) => {
    if (event.target.closest(".dialog-backdrop") || event.target.closest("[data-product-types-close]")) {
      close();
      return;
    }
    const addButton = event.target.closest("[data-product-types-add]");
    if (addButton) {
      const input = rootElement.querySelector("[data-product-types-input]");
      const label = String(input?.value || "").trim();
      if (!label) {
        input?.focus();
        return;
      }
      const slug = label
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "d")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || `product-type-${pendingTypes.length + 1}`;
      const foldedLabel = foldSearchText(label);
      if (pendingTypes.some((item) => item.id === slug || foldSearchText(item.label) === foldedLabel)) {
        showToast("Loại sản phẩm này đã tồn tại.", {
          title: "Trùng loại sản phẩm",
          tone: "warning",
        });
        return;
      }
      pendingTypes = await saveProductTypesState([...pendingTypes, { id: slug, label }]);
      input.value = "";
      render();
      refreshCurrentPage();
      input?.focus();
      return;
    }
    const deleteButton = event.target.closest("[data-product-type-delete]");
    if (!deleteButton) return;
    const productTypeId = String(deleteButton.dataset.productTypeDelete || "");
    const usageCount = productUsageCount(productTypeId);
    if (usageCount > 0 || pendingTypes.length <= 1) return;
    const productTypeLabelText = pendingTypes.find((item) => item.id === productTypeId)?.label || productTypeId;
    if (!window.confirm(`Xóa loại sản phẩm "${productTypeLabelText}"?`)) return;
    pendingTypes = await saveProductTypesState(pendingTypes.filter((item) => item.id !== productTypeId));
    render();
    refreshCurrentPage();
  };

  rootElement.classList.add("active");
  rootElement.innerHTML = `
    <div class="dialog-backdrop"></div>
    <div class="dialog-wrap">
      <div class="dialog-card dialog-wide" role="dialog" aria-modal="true" aria-labelledby="productTypesManagerTitle">
        <div class="dialog-head">
          <span class="dialog-kicker">Loại Sản Phẩm</span>
          <h2 id="productTypesManagerTitle">Quản lý loại sản phẩm</h2>
          <p>Danh sách này được dùng cho form thêm sản phẩm, fallback match theo category và bảng Kho sản phẩm.</p>
        </div>
        <div class="dialog-body">
          <div class="group-type-create">
            <input type="text" data-product-types-input placeholder="Nhập loại sản phẩm mới...">
            <button type="button" class="btn primary" data-product-types-add>Thêm loại</button>
          </div>
          <div class="group-type-table">
            <div class="group-type-head"><span>STT</span><span>Loại sản phẩm</span><span>Đang dùng</span><span></span></div>
            <div class="group-type-body" data-product-types-body></div>
          </div>
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn secondary" data-product-types-close>Đóng</button>
        </div>
      </div>
    </div>
  `;

  rootElement.addEventListener("click", handleClick);
  document.addEventListener("keydown", handleKeydown);
  render();
  window.requestAnimationFrame(() => {
    rootElement.querySelector("[data-product-types-input]")?.focus();
  });
}

async function showProductEditor(product = null) {
  workerMonitorDialog?.close?.();
  const affiliateLinksValue = Array.isArray(product?.affiliateLinks)
    ? product.affiliateLinks.join("\n")
    : String(product?.affiliateLinks || "");
  const result = await openDialog({
    kicker: "Sản phẩm",
    title: product ? `Chỉnh sửa ${product.name || "sản phẩm"}` : "Thêm sản phẩm",
    message: product
      ? "Cập nhật tên sản phẩm, loại sản phẩm và danh sách link affiliate."
      : "Nhập thông tin sản phẩm và danh sách link affiliate để dùng cho bước match và sinh comment tự động.",
    confirmLabel: product ? "Lưu sản phẩm" : "Thêm sản phẩm",
    fields: [
      {
        name: "name",
        label: "Tên sản phẩm",
        type: "text",
        value: product?.name || "",
        placeholder: "Ví dụ: Máy xay sinh tố cầm tay",
      },
      {
        name: "productTypeId",
        label: "Loại sản phẩm",
        type: "select",
        value: String(product?.productTypeId || ""),
        options: [
          { value: "", label: "Chưa gắn loại sản phẩm" },
          ...productTypeOptions().map((item) => ({
            value: item.id,
            label: item.label,
          })),
        ],
      },
      {
        name: "affiliateLinks",
        label: "Danh sách link affiliate",
        type: "textarea",
        value: affiliateLinksValue,
        placeholder: "Mỗi dòng là một link affiliate",
      },
    ],
  });
  if (!result) return null;
  const name = String(result.name || "").trim();
  if (!name) return null;
  const affiliateLinks = String(result.affiliateLinks || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    name,
    keyword: foldSearchText(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || name,
    productTypeId: String(result.productTypeId || "").trim(),
    affiliateLinks,
  };
}

function formatDuration(fromValue, toValue = Date.now()) {
  const from = new Date(fromValue || Date.now()).getTime();
  const to = new Date(toValue).getTime();
  const total = Math.max(0, Math.floor((to - from) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours) return `${hours} giờ ${minutes} phút`;
  if (minutes) return `${minutes} phút ${seconds}s`;
  return `${seconds}s`;
}

function normalizeMode(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function statusText(status) {
  return ({
    running: "Đang chạy",
    paused: "Tạm dừng",
    stopping: "Đang dừng",
    stopped: "Đã dừng",
    done: "Hoàn tất",
    idle: "Sẵn sàng",
    error: "Lỗi",
  }[normalizeStatus(status)] || "Sẵn sàng");
}

function historyLabel(mode) {
  return ({
    comment: "Thành công",
    pending: "Chờ duyệt",
    rejected: "Từ chối",
    failed: "Thất bại",
    fail: "Thất bại",
  }[normalizeMode(mode)] || "Thất bại");
}

function historyPillClass(mode) {
  return ({
    comment: "success-pill",
    pending: "warning-pill",
    rejected: "danger-pill",
    failed: "danger-pill",
    fail: "danger-pill",
  }[normalizeMode(mode)] || "danger-pill");
}

function liveGroup(kind) {
  const value = normalizeStatus(kind);
  if (value === "error" || value === "warn" || value === "warning") return "issues";
  if (value === "facebook" || value === "fb" || value === "post" || value === "browser") return "facebook";
  if (value === "ai" || value === "analyze") return "ai";
  if (value === "comment" || value === "cmt") return "comment";
  if (value === "shopee" || value === "buy" || value === "aff" || value === "product") return "shopee";
  if (value === "telegram" || value === "tg") return "telegram";
  return "system";
}

function logTagClass(kind) {
  const group = liveGroup(kind);
  return ({
    issues: "warn-tag",
    facebook: "fb",
    ai: "ai",
    comment: "bot",
    shopee: "browser",
    telegram: "system",
    system: "system",
  }[group] || "system");
}

function makePolyline(values) {
  const safe = (Array.isArray(values) ? values : []).map((item) => Math.max(0, Number(item || 0)));
  if (!safe.length) return "40,220 700,220";
  const max = Math.max(...safe, 1);
  const startX = 40;
  const endX = 700;
  const startY = 220;
  const topY = 48;
  const step = safe.length > 1 ? (endX - startX) / (safe.length - 1) : 0;
  return safe
    .map((value, index) => {
      const x = startX + step * index;
      const y = startY - ((startY - topY) * value) / max;
      return `${Math.round(x)},${Math.round(y)}`;
    })
    .join(" ");
}

function parseLogTimestamp(value) {
  const stamp = new Date(value || "");
  return Number.isNaN(stamp.getTime()) ? 0 : stamp.getTime();
}

function workerGroupIsActive(worker, group) {
  const workerUrl = String(worker?.runtime?.current_group_url || "").trim();
  const workerName = String(worker?.runtime?.current_group_name || "").trim();
  const groupUrl = String(group?.url || "").trim();
  const groupName = String(group?.name || "").trim();
  if (workerUrl && groupUrl && workerUrl === groupUrl) return true;
  if (workerName && groupName && workerName === groupName) return true;
  return false;
}

function activeWorkerForGroup(group, workers = appState.workers) {
  return (Array.isArray(workers) ? workers : []).find((worker) => workerGroupIsActive(worker, group)) || null;
}

function groupCommentFailedCount(group) {
  return Number(group?.fail || 0) + Number(group?.rejected || 0);
}

function buildWorkerRealtimeSeries() {
  const bucketCount = 12;
  const bucketMs = 30_000;
  const now = Date.now();
  const minTs = now - bucketCount * bucketMs;
  const ranked = (Array.isArray(appState.workers) ? appState.workers : []).map((worker, index) => {
    const workerId = String(worker?.id || "");
    const recentLogs = appState.logs.filter((entry) => (
      String(entry?.workerId || "") === workerId
      && parseLogTimestamp(entry.ts) >= minTs
    ));
    const runtimeScore = Number(worker?.runtime?.scanned || 0) + Number(worker?.runtime?.direct || 0);
    const liveScore = recentLogs.length + (workerBotStatus(worker, index) === "running" ? 4 : 0) + (runtimeScore > 0 ? 1 : 0);
    return { worker, index, recentLogs, liveScore };
  });
  const selected = ranked
    .sort((a, b) => b.liveScore - a.liveScore || a.index - b.index)
    .slice(0, 3);
  return selected.map(({ worker, index, recentLogs }) => {
    const values = Array(bucketCount).fill(0);
    recentLogs.forEach((entry) => {
      const ts = parseLogTimestamp(entry.ts);
      if (!ts || ts < minTs || ts > now) return;
      const bucket = Math.min(
        bucketCount - 1,
        Math.max(0, Math.floor((ts - minTs) / bucketMs)),
      );
      values[bucket] += liveGroup(entry.kind) === "issues" ? 2 : 1;
    });
    if (!values.some((value) => value > 0)) {
      values[bucketCount - 1] = workerBotStatus(worker, index) === "running" ? 2 : Number(worker?.runtime?.browserConnected) ? 1 : 0;
    } else {
      values[bucketCount - 1] += Math.min(3, Number(worker?.runtime?.direct || 0) > 0 ? 1 : 0);
    }
    return {
      worker,
      status: workerBotStatus(worker, index),
      values,
    };
  });
}

function lastDays(days, formatter) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (days - index - 1));
    return {
      key: date.toISOString().slice(0, 10),
      label: formatter ? formatter(date) : date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }),
      date,
    };
  });
}

function setTheme(theme) {
  root.dataset.theme = theme === "light" ? "light" : "dark";
  localStorage.setItem(STORAGE_KEYS.theme, root.dataset.theme);
}

function getCurrentTheme() {
  return localStorage.getItem(STORAGE_KEYS.theme) || root.dataset.theme || "dark";
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `${response.status} ${response.statusText}`);
  }
  return data;
}

const api = {
  async health() {
    return fetchJson(`${appState.backendBase}/api/health`, { method: "GET" });
  },
  async call(method, ...args) {
    return fetchJson(`${appState.backendBase}/api/call`, {
      method: "POST",
      body: JSON.stringify({ method, args }),
    });
  },
};

function updateNavBadges() {
  const pendingCount = appState.products.filter((item) => normalizeStatus(item.status) !== "ready").length;
  const pendingNav = navItems.find((item) => item.dataset.page === "pending");
  if (pendingNav) {
    let badge = pendingNav.querySelector("em");
    if (!badge) {
      badge = document.createElement("em");
      pendingNav.appendChild(badge);
    }
    badge.textContent = String(pendingCount);
  }
}

function hydrateShell() {
  const statuses = [...document.querySelectorAll(".status-cluster .status")];
  if (statuses[0]) {
    statuses[0].className = `status ${appState.backendConnected ? "success" : "warning"}`;
    statuses[0].innerHTML = `<i></i>${escapeHtml(appState.backendConnected ? "Backend đang chạy" : "Backend chưa kết nối")}`;
  }
  if (statuses[1]) {
    const totalWorkers = appState.workers.length;
    const runningWorkers = runningWorkersCount(appState.workers);
    statuses[1].className = `status ${runningWorkers > 0 ? "success" : "warning"}`;
    statuses[1].innerHTML = `<i></i>${escapeHtml(`Worker: ${runningWorkers}/${totalWorkers}`)}`;
  }
  updateNavBadges();
}

async function refreshCore() {
  try {
    const [healthRes, stateRes] = await Promise.all([api.health(), api.call("getState")]);
    const workers = Array.isArray(stateRes.data?.workers) ? stateRes.data.workers : [];
    const healthWorkers = Array.isArray(healthRes.workers) ? healthRes.workers : [];
    const connectedFromWorker = workerBrowserConnected(primaryWorker(workers)) || workerBrowserConnected(primaryWorker(healthWorkers));
    appState.backendConnected = true;
    appState.browserConnected = !!healthRes.browser || connectedFromWorker;
    appState.browserInfo = healthRes.browser || primaryWorker(workers)?.runtime?.browser || primaryWorker(healthWorkers)?.runtime?.browser || null;
    appState.bot = {
      status: stateRes.data?.bot?.status || healthRes.bot?.status || "idle",
      scope: stateRes.data?.bot?.scope || healthRes.bot?.scope || null,
      text: statusText(stateRes.data?.bot?.status || healthRes.bot?.status || "idle"),
    };
    appState.progress = {
      ...appState.progress,
      ...(stateRes.data?.progress || {}),
    };
    appState.configUi = {
      ...(stateRes.data?.configUi || {}),
    };
    appState.summary = {
      ...(stateRes.data?.summary || {}),
    };
    appState.facebookAccounts = normalizeFacebookAccountsState(stateRes.data?.facebookAccounts);
    appState.groupTypes = normalizeGroupTypes(stateRes.data?.groupTypes);
    appState.productTypes = normalizeProductTypes(stateRes.data?.productTypes);
    appState.workers = workers;
    hydrateShell();
    return stateRes.data || {};
  } catch (error) {
    appState.backendConnected = false;
    appState.browserConnected = false;
    appState.browserInfo = null;
    hydrateShell();
    console.error("[fbcc] refreshCore failed", error);
    return null;
  }
}

async function loadGroups() {
  const response = await api.call("loadGroups");
  appState.groups = normalizeGroupsState(Array.isArray(response.data?.groups) ? response.data.groups : []);
  if (response.data?.groupTypes) {
    appState.groupTypes = normalizeGroupTypes(response.data.groupTypes);
    appState.groups = normalizeGroupsState(appState.groups);
  }
}

async function loadWorkers() {
  const response = await api.call("listWorkers");
  appState.workers = Array.isArray(response.data?.workers) ? response.data.workers : [];
}

async function loadFacebookAccounts() {
  const response = await api.call("loadFacebookAccounts");
  appState.facebookAccounts = normalizeFacebookAccountsState(response.data?.accounts);
}

async function loadKeywords() {
  const response = await api.call("loadBuyerIntentKeywords");
  appState.keywords = Array.isArray(response.data?.keywords) ? response.data.keywords : [];
}

async function loadProducts() {
  const response = await api.call("getProducts");
  appState.products = Array.isArray(response.data?.products) ? response.data.products : [];
  appState.productTypes = normalizeProductTypes(response.data?.productTypes);
}

async function loadHistory() {
  const response = await api.call("loadHistory");
  appState.history = Array.isArray(response.data?.entries) ? response.data.entries : [];
}

async function loadRuns() {
  const response = await api.call("loadRunHistory");
  appState.runs = Array.isArray(response.data?.runs) ? response.data.runs : [];
}

async function loadRevenue() {
  const [overviewRes, chartsRes, topProductsRes, topShopsRes, topSubidsRes] = await Promise.all([
    api.call("getStatsOverview", {}),
    api.call("getStatsCharts", {}),
    api.call("getTopProducts", {}),
    api.call("getTopShops", {}),
    api.call("getTopSubids", {}),
  ]);
  appState.revenueStats = overviewRes.data || null;
  appState.revenueOverview = overviewRes.data?.overview || null;
  appState.revenueCharts = chartsRes.data || { daily: [], hourly: [] };
  appState.revenueTopProducts = Array.isArray(topProductsRes.data?.rows) ? topProductsRes.data.rows : [];
  appState.revenueTopShops = Array.isArray(topShopsRes.data?.rows) ? topShopsRes.data.rows : [];
  appState.revenueTopSubids = Array.isArray(topSubidsRes.data?.rows) ? topSubidsRes.data.rows : [];
}

async function loadGroupPerformance() {
  const response = await api.call("refreshGroupPerformance");
  appState.groupPerformance = Array.isArray(response.data?.rows) ? response.data.rows : [];
}

async function ensurePageData(page) {
  const deps = pageDeps[page] || ["core"];
  const loaders = {
    core: refreshCore,
    groups: loadGroups,
    workers: loadWorkers,
    facebookAccounts: loadFacebookAccounts,
    keywords: loadKeywords,
    products: loadProducts,
    history: loadHistory,
    runs: loadRuns,
    revenue: loadRevenue,
    groupPerformance: loadGroupPerformance,
  };
  const queue = deps.map((dep) => loaders[dep]).filter(Boolean);
  for (const job of queue) {
    await job();
  }
}

function currentGroupName() {
  if (appState.bot.scope?.name) return appState.bot.scope.name;
  if (appState.progress.currentGroupName) return appState.progress.currentGroupName;
  return "";
}

function overviewKpis() {
  const groups = appState.groups;
  const enabled = groups.filter((group) => group.enabled !== false);
  const totalWorkers = appState.workers.length;
  const runningWorkers = runningWorkersCount(appState.workers);
  const scanned = groups.reduce((sum, group) => sum + Number(group.scanned || 0), 0);
  const comments = groups.reduce((sum, group) => sum + Number(group.comments || 0), 0);
  const clicks = appState.revenueOverview?.clicks || appState.summary.clicks || 0;
  const orders = appState.revenueStats?.summary?.orders || appState.summary.orders || 0;
  const commission = appState.revenueOverview?.commission || 0;
  const commentRate = scanned ? (comments / scanned) * 100 : 0;
  const conversion = clicks ? (orders / clicks) * 100 : 0;
  return [
    {
      label: "Worker đang chạy",
      value: `${formatNumber(runningWorkers)}/${formatNumber(totalWorkers)}`,
      meta: totalWorkers ? `${formatNumber(totalWorkers - runningWorkers)} worker còn chờ` : "Chưa có worker",
      note: "đang hoạt động / tổng worker",
      tone: "total",
    },
    {
      label: "Nhóm đang bật",
      value: formatNumber(enabled.length),
      meta: `${formatNumber(groups.length)} nhóm cấu hình`,
      note: "sẵn sàng cho worker chạy",
      tone: "success",
    },
    {
      label: "Bài đã quét",
      value: formatNumber(scanned),
      meta: formatPercent(appState.progress.totalGroups ? (appState.progress.groups / Math.max(appState.progress.totalGroups, 1)) * 100 : 0),
      note: "tiến độ nhịp đang chạy",
      tone: "warning",
    },
    {
      label: "Comment thành công",
      value: formatNumber(comments),
      meta: formatPercent(commentRate),
      note: "trên số bài đã quét",
      tone: "danger",
    },
    {
      label: "Lượt click / Đơn",
      value: `${formatNumber(clicks)} / ${formatNumber(orders)}`,
      meta: formatPercent(conversion, 2),
      note: "tỷ lệ chuyển đổi",
      tone: "info",
    },
    {
      label: "Doanh thu",
      value: formatMoneyShort(commission),
      meta: formatPercent(appState.revenueOverview?.commRate || 0, 1),
      note: "hoa hồng / GMV",
      tone: "primary",
    },
  ];
}

function buildOverviewAlerts() {
  const alerts = [];
  const expiredAccounts = appState.facebookAccounts.filter((account) => account.cookieStatus === "expired");
  const runningWithoutBrowser = appState.workers.filter((worker, index) => (
    workerBotStatus(worker, index) === "running" && !worker?.runtime?.browserConnected
  ));
  const moderationGroups = [...appState.groups]
    .map((group) => ({
      group,
      hits: Number(group?.pending || 0) + Number(group?.rejected || 0),
    }))
    .filter((item) => item.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3);

  if (expiredAccounts.length) {
    alerts.push({
      tone: "danger",
      label: "Cookie lỗi",
      value: formatNumber(expiredAccounts.length),
      detail: expiredAccounts.slice(0, 2).map((account) => account.name).join(", "),
      jump: "facebook-accounts",
      action: "Rà tài khoản",
    });
  }

  if (runningWithoutBrowser.length) {
    alerts.push({
      tone: "danger",
      label: "Worker mất browser",
      value: formatNumber(runningWithoutBrowser.length),
      detail: runningWithoutBrowser.slice(0, 2).map((worker) => worker.name || worker.id).join(", "),
      jump: "workers",
      action: "Kiểm tra worker",
    });
  }

  if (moderationGroups.length) {
    alerts.push({
      tone: "warning",
      label: "Group bị moderation",
      value: formatNumber(moderationGroups.reduce((sum, item) => sum + item.hits, 0)),
      detail: moderationGroups.map((item) => item.group.name || item.group.url || "Nhóm Facebook").join(", "),
      jump: "groups",
      action: "Xem nhóm",
    });
  }

  return alerts.slice(0, 4);
}

function buildOverviewHealthRows() {
  const totalAccounts = appState.facebookAccounts.length;
  const validAccounts = appState.facebookAccounts.filter((account) => account.cookieStatus === "valid").length;
  const riskyAccounts = appState.facebookAccounts.filter((account) => account.cookieStatus === "expired").length;
  const groupsWithFailures = appState.groups.filter((group) => groupCommentFailedCount(group) > 0).length;
  return [
    {
      label: "Cookie hợp lệ",
      value: `${formatNumber(validAccounts)}/${formatNumber(totalAccounts)}`,
      tone: validAccounts === totalAccounts && totalAccounts > 0 ? "success" : "warning",
    },
    {
      label: "Account rủi ro",
      value: formatNumber(riskyAccounts),
      tone: riskyAccounts > 0 ? "danger" : "success",
    },
    {
      label: "Group có lỗi",
      value: formatNumber(groupsWithFailures),
      tone: groupsWithFailures > 0 ? "warning" : "success",
    },
    {
      label: "Log realtime",
      value: formatNumber(appState.logs.length),
      tone: appState.logs.length > 0 ? "info" : "total",
    },
  ];
}

function renderOverview() {
  const page = pageRoot.querySelector(".page");
  if (!page) return;
  const [dateButton] = page.querySelectorAll(".page-actions .btn");
  const hero = page.querySelector(".hero-status");
  const kpiCards = [...page.querySelectorAll(".kpi-grid .kpi")];
  const kpis = overviewKpis();
  if (dateButton) dateButton.textContent = formatDate(Date.now());
  if (hero) {
    hero.querySelector("h2").textContent = appState.backendConnected
      ? `Bot ${statusText(appState.bot.status).toLowerCase()}`
      : "Backend chưa sẵn sàng";
    hero.querySelector("p").textContent = appState.backendConnected
      ? `${appState.summary.enabledGroups || 0} nhóm bật, ${appState.workers.length} worker, ${appState.browserConnected ? "browser đã kết nối" : "browser chưa kết nối"}.`
      : "Hãy bật backend thật để đồng bộ dữ liệu và thao tác vận hành.";
    const [browserBtn, botBtn] = hero.querySelectorAll(".hero-actions .btn");
    if (browserBtn) {
      browserBtn.dataset.action = appState.browserConnected ? "close-browser" : "connect-browser";
      browserBtn.className = `btn ${appState.browserConnected ? "danger" : "info"}`;
      browserBtn.textContent = appState.browserConnected ? "Ngắt browser" : "Kết nối browser";
    }
    if (botBtn) {
      const status = normalizeStatus(appState.bot.status);
      botBtn.dataset.action = status === "running" ? "pause-bot" : status === "paused" ? "resume-bot" : "start-bot";
      botBtn.className = `btn ${status === "running" ? "warning" : "success"}`;
      botBtn.textContent = status === "running" ? "❚❚ Tạm dừng" : status === "paused" ? "▶ Tiếp tục chạy" : "▶ Bắt đầu chạy";
    }
  }
  renderKpiBadges(kpiCards, kpis);

  const alertStrip = page.querySelector(".overview-alert-strip");
  if (alertStrip) {
    const alerts = buildOverviewAlerts();
    alertStrip.innerHTML = alerts.map((item) => `
      <button class="overview-alert-card overview-alert-${escapeHtml(item.tone)}" data-jump="${escapeHtml(item.jump || "overview")}">
        <span class="overview-alert-top">
          <b>${escapeHtml(item.label)}</b>
          <strong>${escapeHtml(item.value)}</strong>
        </span>
        <span class="overview-alert-detail">${escapeHtml(item.detail || "—")}</span>
        <span class="overview-alert-action">${escapeHtml(item.action || "Xem chi tiết")} →</span>
      </button>
    `).join("");
  }

  const table = page.querySelector(".table");
  if (table) {
    const sortedGroups = [...appState.groups]
      .sort((a, b) => {
        const activeDiff = Number(!!activeWorkerForGroup(b)) - Number(!!activeWorkerForGroup(a));
        if (activeDiff) return activeDiff;
        return Number(b.scanned || 0) - Number(a.scanned || 0);
      });
    const pageState = paginateRows(sortedGroups, "overviewGroups");
    const groups = pageState.items;
    table.innerHTML = `
      <div class="tr th"><span>Nhóm</span><span>Đã quét</span><span>Lần quét cuối</span><span>Comment thành công</span><span>Comment thất bại</span></div>
      ${groups.length ? groups.map((group) => {
        const activeWorker = activeWorkerForGroup(group);
        const lastScanLabel = activeWorker
          ? `<b>Đang quét</b>`
          : `<b>${escapeHtml(group.lastScan || "—")}</b>`;
        const groupName = escapeHtml(group.name || group.url || "Nhóm Facebook");
        const groupUrl = escapeHtml(group.url || "");
        const groupTooltip = escapeHtml(`${group.name || group.url || "Nhóm Facebook"}\n${group.url || ""}`.trim());
        const groupLink = group.url
          ? `<a class="overview-group-link" href="${groupUrl}" target="_blank" rel="noreferrer noopener" title="${groupTooltip}"><b class="overview-group-label">${groupName}</b></a>`
          : `<span class="overview-group-link" title="${groupTooltip}"><b class="overview-group-label">${groupName}</b></span>`;
        return `<div class="tr">
          <span>${groupLink}</span>
          <span>${formatNumber(group.scanned || 0)}</span>
          <span>${lastScanLabel}</span>
          <span>${formatNumber(group.comments || 0)}</span>
          <span>${formatNumber(groupCommentFailedCount(group))}</span>
        </div>`;
      }).join("") : `<div class="tr"><span><b>Chưa có nhóm</b></span><span>0</span><span>—</span><span>0</span><span>0</span></div>`}
    `;
    renderPagination(ensurePaginationElement(table, "overviewGroups"), {
      key: "overviewGroups",
      page: pageState.page,
      totalPages: pageState.totalPages,
      start: pageState.start,
      end: pageState.end,
      total: pageState.total,
      noun: "nhóm",
    });
  }

  const series = buildWorkerRealtimeSeries();
  const legends = page.querySelectorAll(".legend span");
  const chartLines = page.querySelectorAll(".chart .line");
  const chartPanel = page.querySelector(".chart")?.closest(".panel");
  if (chartPanel) {
    const title = chartPanel.querySelector(".panel-head h2");
    const subtitle = chartPanel.querySelector(".panel-head p");
    if (title) title.textContent = "Biểu đồ hoạt động Worker";
    if (subtitle) subtitle.textContent = "Realtime theo số sự kiện của từng worker trong 6 phút gần nhất.";
  }
  [0, 1, 2].forEach((index) => {
    const line = chartLines[index];
    const legend = legends[index];
    const item = series[index];
    if (line) {
      line.setAttribute("points", makePolyline(item?.values || [0, 0, 0, 0]));
      line.style.opacity = item ? "1" : ".18";
    }
    if (legend) {
      legend.textContent = item
        ? `${item.worker.name || item.worker.id} · ${statusText(item.status)}`
        : "Chưa có worker";
    }
  });

  const activity = page.querySelector(".activity-list");
  if (activity) {
    const recent = [...appState.logs].slice(-6).reverse();
    activity.innerHTML = recent.length ? recent.map((item) => {
      const level = normalizeStatus(item.level || item.kind);
      const tone = level === "error" || level === "warn" || level === "warning"
        ? "warn"
        : level === "success" || liveGroup(item.kind) === "comment"
          ? "ok"
          : "info";
      const symbol = icons[tone] || "i";
      return `<li><time>${escapeHtml(formatTime(item.ts))}</time><i class="${tone}">${symbol}</i><span>${escapeHtml(item.message)}</span></li>`;
    }).join("") : `<li><time>—</time><i class="info">i</i><span>Chưa có log realtime từ backend.</span></li>`;
  }

  const resources = page.querySelector(".resource-grid");
  if (resources) {
    const totalWorkers = appState.workers.length;
    const runningWorkers = runningWorkersCount(appState.workers);
    const pendingCount = appState.products.filter((item) => normalizeStatus(item.status) !== "ready").length;
    resources.innerHTML = `
      <div><span>Worker chạy</span><strong>${formatNumber(runningWorkers)}/${formatNumber(totalWorkers)}</strong></div>
      <div><span>Hàng chờ</span><strong>${formatNumber(pendingCount)}</strong></div>
      <div><span>Lịch sử</span><strong>${formatNumber(appState.history.length)}</strong></div>
      <div><span>Lượt chạy</span><strong>${formatNumber(appState.runs.length)}</strong></div>
    `;
  }

  const storage = page.querySelector(".storage");
  if (storage) {
    const totalGroups = Math.max(appState.groups.length, 1);
    const enabledGroups = appState.groups.filter((group) => group.enabled !== false).length;
    const percent = Math.round((enabledGroups / totalGroups) * 100);
    storage.innerHTML = `<span>Nhóm đang bật</span><b>${enabledGroups} / ${appState.groups.length}</b><i><em style="width:${percent}%"></em></i>`;
  }

  const healthList = page.querySelector(".overview-health-list");
  if (healthList) {
    const rows = buildOverviewHealthRows();
    healthList.innerHTML = rows.map((item) => `
      <div class="overview-health-item overview-health-${escapeHtml(item.tone)}">
        <span>${escapeHtml(item.label)}</span>
        <b>${escapeHtml(item.value)}</b>
      </div>
    `).join("");
  }

  const channels = page.querySelector(".channel-list");
  if (channels) {
    const byType = appState.revenueOverview?.byType || {};
    const rows = [
      { label: "Social", value: byType.social?.comm || 0 },
      { label: "Live", value: byType.live?.comm || 0 },
      { label: "Video", value: byType.video?.comm || 0 },
    ];
    const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;
    channels.innerHTML = rows.map((row) => `
      <div><span>${escapeHtml(row.label)}</span><b>${formatMoneyShort(row.value)}</b><em>${Math.round((row.value / total) * 100)}%</em></div>
    `).join("");
  }
}

function buildMonitorCounts(logs = []) {
  const counts = {
    all: Array.isArray(logs) ? logs.length : 0,
    issues: 0,
    facebook: 0,
    ai: 0,
    comment: 0,
    shopee: 0,
    telegram: 0,
    system: 0,
  };
  (Array.isArray(logs) ? logs : []).forEach((item) => {
    counts[liveGroup(item.kind)] += 1;
  });
  return counts;
}

function filterMonitorLogs(logs = [], filter = "all", search = "") {
  const query = String(search || "").trim().toLowerCase();
  return (Array.isArray(logs) ? logs : []).filter((item) => {
    if (filter !== "all" && liveGroup(item.kind) !== filter) return false;
    if (!query) return true;
    return `${item.tag} ${item.message}`.toLowerCase().includes(query);
  });
}

function buildMonitorFilterButtons(activeFilter, counts) {
  const filters = [
    ["all", "Tất cả"],
    ["issues", "Lỗi/Cảnh báo"],
    ["facebook", "Facebook"],
    ["ai", "AI"],
    ["comment", "Comment"],
    ["shopee", "Shopee"],
    ["telegram", "Telegram"],
    ["system", "Hệ thống"],
  ];
  return filters.map(([key, label]) => (
    `<button class="${activeFilter === key ? "active" : ""}" data-monitor-filter="${key}">${escapeHtml(label)}${counts[key] ? ` (${counts[key]})` : ""}</button>`
  )).join("");
}

function buildMonitorStreamMarkup(logs = []) {
  return logs.length ? logs.map((item) => {
    const warn = liveGroup(item.kind) === "issues";
    const tagClass = logTagClass(item.kind);
    return `<div class="log-line${warn ? " warn-row" : ""}">
      <time>${escapeHtml(formatTime(item.ts))}</time>
      <span class="tag ${tagClass}">[${escapeHtml(item.tag)}]</span>
      <span>${escapeHtml(item.message)}</span>
    </div>`;
  }).join("") : `<div class="log-line"><time>—</time><span class="tag system">[SYSTEM]</span><span>Chưa có log realtime cho worker này.</span></div>`;
}

function workerMonitorLogs(workerId) {
  return appState.logs.filter((item) => String(item.workerId || "") === String(workerId || ""));
}

function renderWorkerMonitorDialog() {
  if (!workerMonitorDialog?.rootElement) return;
  const workerId = workerMonitorDialog.workerId;
  const worker = appState.workers.find((item) => item.id === workerId) || { id: workerId, name: workerId };
  const workerIndex = appState.workers.findIndex((item) => item.id === workerId);
  const state = appState.ui.workerMonitor;
  const logs = workerMonitorLogs(workerId);
  const counts = buildMonitorCounts(logs);
  const filteredLogs = filterMonitorLogs(logs, state.filter, state.search).slice(-300);
  const rootElement = workerMonitorDialog.rootElement;
  const title = rootElement.querySelector("[data-monitor-title]");
  const subtitle = rootElement.querySelector("[data-monitor-subtitle]");
  const filters = rootElement.querySelector(".tabs");
  const searchInput = rootElement.querySelector("[data-monitor-search-input]");
  const stream = rootElement.querySelector(".log-stream");
  const footer = rootElement.querySelector(".log-footer");
  if (title) {
    title.textContent = `Giám sát trực tiếp · ${worker.name || worker.id || "Worker"}`;
  }
  if (subtitle) {
    subtitle.textContent = `${counts.all} log cho worker này. Browser và bot của mỗi worker được theo dõi riêng.`;
  }
  if (filters) {
    filters.innerHTML = buildMonitorFilterButtons(state.filter, counts);
  }
  if (searchInput) {
    searchInput.value = state.search;
  }
  if (stream) {
    stream.innerHTML = buildMonitorStreamMarkup(filteredLogs);
  }
  if (footer) {
    footer.innerHTML = `
      <span>Hiển thị ${filteredLogs.length} / ${counts.all} dòng</span>
      <span>✓ ${counts.comment}</span>
      <span>⚠ ${counts.issues}</span>
      <span>AI ${counts.ai}</span>
      <span>FB ${counts.facebook}</span>
      <span class="ml-auto status ${workerBotStatus(worker, workerIndex) === "running" ? "success" : "warning"}"><i></i>${escapeHtml(statusText(workerBotStatus(worker, workerIndex)))}</span>
    `;
  }
}

function openWorkerMonitorDialog(worker) {
  if (!worker?.id) return;
  workerMonitorDialog?.close?.();
  const rootElement = ensureDialogRoot();
  appState.ui.workerMonitor = {
    workerId: worker.id,
    filter: "all",
    search: "",
  };
  const handleKeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };
  const handleClick = (event) => {
    const closeButton = event.target.closest("[data-monitor-close]");
    if (closeButton || event.target.closest(".dialog-backdrop")) {
      close();
      return;
    }
    const filterButton = event.target.closest("[data-monitor-filter]");
    if (!filterButton) return;
    appState.ui.workerMonitor.filter = filterButton.dataset.monitorFilter || "all";
    renderWorkerMonitorDialog();
  };
  const handleInput = (event) => {
    const input = event.target.closest("[data-monitor-search-input]");
    if (!input) return;
    appState.ui.workerMonitor.search = input.value;
    renderWorkerMonitorDialog();
  };
  const close = () => {
    document.removeEventListener("keydown", handleKeydown);
    rootElement.removeEventListener("click", handleClick);
    rootElement.removeEventListener("input", handleInput);
    rootElement.classList.remove("active");
    rootElement.innerHTML = "";
    if (workerMonitorDialog?.workerId === worker.id) workerMonitorDialog = null;
    appState.ui.workerMonitor = { workerId: "", filter: "all", search: "" };
  };
  rootElement.classList.add("active");
  rootElement.innerHTML = `
    <div class="dialog-backdrop"></div>
    <div class="dialog-wrap">
      <div class="dialog-card dialog-monitor" role="dialog" aria-modal="true" aria-labelledby="workerMonitorTitle">
        <div class="dialog-head">
          <span class="dialog-kicker">Worker Monitor</span>
          <h2 id="workerMonitorTitle" data-monitor-title></h2>
          <p data-monitor-subtitle></p>
        </div>
        <div class="dialog-body dialog-monitor-body">
          <article class="panel log-panel">
            <div class="log-topbar">
              <div class="tabs"></div>
              <input data-monitor-search-input placeholder="Tìm trong log của worker...">
            </div>
            <div class="log-stream"></div>
            <div class="log-footer"></div>
          </article>
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn secondary" data-monitor-close>Đóng</button>
        </div>
      </div>
    </div>
  `;
  rootElement.addEventListener("click", handleClick);
  rootElement.addEventListener("input", handleInput);
  document.addEventListener("keydown", handleKeydown);
  workerMonitorDialog = {
    workerId: worker.id,
    rootElement,
    close,
  };
  renderWorkerMonitorDialog();
}

function workerBotStatus(worker, index) {
  if (worker.runtime?.botStatus) return normalizeStatus(worker.runtime.botStatus);
  if (index === 0) return normalizeStatus(appState.bot.status);
  return "idle";
}

function runningWorkersCount(workers = appState.workers) {
  return (Array.isArray(workers) ? workers : []).filter((worker, index) => workerBotStatus(worker, index) === "running").length;
}

function renderWorkers() {
  const page = pageRoot.querySelector(".page");
  if (!page) return;
  const summaryBar = page.querySelector(".worker-summary");
  const workerList = page.querySelector(".worker-list");
  const pageButtons = page.querySelectorAll(".page-actions .btn");
  if (pageButtons[0]) pageButtons[0].dataset.action = "refresh-workers";
  if (pageButtons[1]) pageButtons[1].dataset.action = "create-worker";
  const total = appState.workers.length;
  const running = runningWorkersCount(appState.workers);
  const waiting = appState.workers.filter((worker, index) => workerBotStatus(worker, index) === "idle" || workerBotStatus(worker, index) === "paused").length;
  const errors = appState.workers.filter((worker, index) => workerBotStatus(worker, index) === "error").length;
  if (summaryBar) {
    summaryBar.innerHTML = [
      ["Tổng worker", total, "total"],
      ["Đang chạy", running, "success"],
      ["Đang chờ", waiting, "warning"],
      ["Lỗi", errors, "danger"],
    ].map(([label, value, tone]) => (
      `<span class="worker-summary-badge worker-summary-badge-${escapeHtml(tone)}"><span class="worker-summary-label">${escapeHtml(label)}</span><b>${formatNumber(value)}</b></span>`
    )).join("");
  }
  if (workerList) {
    workerList.innerHTML = appState.workers.length ? appState.workers.map((worker, index) => {
      const browserConnected = index === 0 ? appState.browserConnected : !!worker.runtime?.browserConnected;
      const botStatus = workerBotStatus(worker, index);
      const facebookAccount = facebookAccountById(worker.facebookAccountId);
      const facebookAccountLabel = facebookAccount?.name || worker.accountLabel || "Chưa gán";
      const browserAction = browserConnected ? "worker-close-browser" : "worker-connect-browser";
      const botAction = botStatus === "running" ? "worker-pause" : botStatus === "paused" ? "worker-resume" : "worker-start";
      const botActionLabel = botStatus === "running" ? "Tạm dừng" : botStatus === "paused" ? "Tiếp tục" : "▶ Bắt đầu";
      const stopButton = botStatus === "running" || botStatus === "paused"
        ? `<button class="btn danger" data-action="worker-stop" data-worker-id="${escapeHtml(worker.id)}">Dừng</button>`
        : "";
      return `<article class="panel worker-card">
        <div class="worker-head">
          <div class="worker-head-primary">
            <button class="btn ${browserConnected ? "danger" : "info"} worker-browser-btn" data-action="${browserAction}" data-worker-id="${escapeHtml(worker.id)}">${browserConnected ? "Ngắt browser" : "Kết nối browser"}</button>
            <button class="btn ${botStatus === "running" ? "warning" : "success"} worker-start-btn" data-action="${botAction}" data-worker-id="${escapeHtml(worker.id)}">${escapeHtml(botActionLabel)}</button>
          </div>
          <div class="worker-head-title"><h2>${escapeHtml(worker.name || `Worker #${index + 1}`)}</h2></div>
          <div class="worker-head-actions">
            <button class="btn secondary worker-config-btn" data-action="worker-edit" data-worker-id="${escapeHtml(worker.id)}">Cấu hình</button>
            <button class="btn info worker-monitor-btn" data-action="worker-monitor" data-worker-id="${escapeHtml(worker.id)}">Giám sát</button>
            <button class="btn danger worker-delete-btn" data-action="worker-delete" data-worker-id="${escapeHtml(worker.id)}">Xóa</button>
            ${stopButton}
          </div>
        </div>
        <div class="worker-meta">
          <div><span>Browser</span><b>${escapeHtml((worker.browserType || "chrome").replace(/^./, (char) => char.toUpperCase()))}</b></div>
          <div><span>Debug port</span><b>${escapeHtml(String(worker.edgePort || 9222))}</b></div>
          <div><span>Profile</span><b>${escapeHtml(worker.profileMode === "dedicated" ? `workers/${worker.id}` : (worker.browserProfileId || "Mặc định"))}</b></div>
          <div><span>Nhóm chạy</span><b>${escapeHtml(workerGroupScopeLabel(worker, appState.groups))}</b></div>
          <div><span>Tài khoản</span><b>${escapeHtml(facebookAccountLabel)}</b></div>
        </div>
      </article>`;
    }).join("") : `<article class="panel worker-card"><div class="worker-head"><div class="worker-head-primary"></div><div class="worker-head-title"><h2>Chưa có worker</h2></div><div class="worker-head-actions"><button class="btn primary" data-action="create-worker">＋ Tạo worker</button></div></div></article>`;
  }
}

function renderFacebookAccounts() {
  const page = pageRoot.querySelector(".page");
  if (!page) return;
  const [refreshBtn, addBtn] = page.querySelectorAll(".page-actions .btn");
  if (refreshBtn) refreshBtn.dataset.action = "refresh-facebook-accounts";
  if (addBtn) addBtn.dataset.action = "create-facebook-account";
  const bulkSelect = page.querySelector(".accounts-table .row.head input[type=checkbox]");
  const table = page.querySelector(".accounts-table");
  const bulkBar = page.querySelector(".bulk-bar");
  const rows = filteredFacebookAccounts();
  const pageState = paginateRows(rows, "facebookAccounts");
  const pageRows = pageState.items;
  if (bulkSelect) {
    const filteredIds = pageRows.map((account) => account.id);
    const checkedCount = filteredIds.filter((id) => appState.ui.selectedFacebookAccounts.has(id)).length;
    bulkSelect.dataset.facebookAccountsSelectAll = "1";
    bulkSelect.checked = !!filteredIds.length && checkedCount === filteredIds.length;
    bulkSelect.indeterminate = checkedCount > 0 && checkedCount < filteredIds.length;
  }
  if (table) {
    table.innerHTML = `
      <div class="row head"><span><label class="table-check-label"><input type="checkbox"><b>Tên Facebook</b></label></span><span>Worker</span><span>Cookie</span><span>Comment chờ / từ chối</span><span></span></div>
      ${pageRows.length ? pageRows.map((account) => {
        const assigned = !!account.assignedWorkerId;
        const cookieMeta = facebookCookieStatusMeta(account.cookieStatus);
        return `<div class="row">
          <span><label class="table-check-label"><input type="checkbox" ${appState.ui.selectedFacebookAccounts.has(account.id) ? "checked" : ""} data-facebook-account-select="1" data-facebook-account-id="${escapeHtml(account.id)}"><span><b>${escapeHtml(account.name)}</b></span></label></span>
          <span>${assigned ? escapeHtml(account.assignedWorkerName || account.assignedWorkerId) : "Chưa gán"}</span>
          <span class="account-cookie-cell">
            <span class="pill ${escapeHtml(cookieMeta.pillClass)}">${escapeHtml(cookieMeta.label)}</span>
          </span>
          <span class="account-risk-cell">
            <span class="pill warning-pill">Chờ ${formatNumber(account.pendingComments)}</span>
            <span class="pill danger-pill">Từ chối ${formatNumber(account.rejectedComments)}</span>
          </span>
          <span>
            <button class="btn secondary" data-action="edit-facebook-account" data-facebook-account-id="${escapeHtml(account.id)}">Sửa</button>
            <button class="btn danger" data-action="delete-facebook-account" data-facebook-account-id="${escapeHtml(account.id)}"${assigned ? " disabled" : ""}>Xóa</button>
          </span>
        </div>`;
      }).join("") : `<div class="row"><span><b>Chưa có tài khoản Facebook</b></span><span>—</span><span>—</span><span>—</span><span></span></div>`}
    `;
    const headCheckbox = table.querySelector(".row.head input[type=checkbox]");
    if (headCheckbox) {
      const filteredIds = pageRows.map((account) => account.id);
      const checkedCount = filteredIds.filter((id) => appState.ui.selectedFacebookAccounts.has(id)).length;
      headCheckbox.dataset.facebookAccountsSelectAll = "1";
      headCheckbox.checked = !!filteredIds.length && checkedCount === filteredIds.length;
      headCheckbox.indeterminate = checkedCount > 0 && checkedCount < filteredIds.length;
    }
    renderPagination(ensurePaginationElement(table, "facebookAccounts", bulkBar), {
      key: "facebookAccounts",
      page: pageState.page,
      totalPages: pageState.totalPages,
      start: pageState.start,
      end: pageState.end,
      total: pageState.total,
      noun: "tài khoản",
    });
  }
  if (bulkBar) {
    bulkBar.innerHTML = `<span>${appState.ui.selectedFacebookAccounts.size} tài khoản được chọn</span><button class="btn danger" data-action="delete-selected-facebook-accounts"${appState.ui.selectedFacebookAccounts.size ? "" : " disabled"}>Xóa</button>`;
  }
}

function renderGroups() {
  const page = pageRoot.querySelector(".page");
  if (!page) return;
  const summaryBar = page.querySelector(".groups-summary");
  const [exportBtn, importBtn, manageTypesBtn, addBtn] = page.querySelectorAll(".page-actions .btn");
  if (exportBtn) exportBtn.dataset.action = "export-groups";
  if (importBtn) importBtn.dataset.action = "import-groups";
  if (manageTypesBtn) manageTypesBtn.dataset.action = "manage-group-types";
  if (addBtn) addBtn.dataset.action = "add-group";
  const segmented = page.querySelector(".segmented");
  const toolbarActions = page.querySelector(".toolbar-actions");
  const dataTable = page.querySelector(".groups-table");
  const bulkBar = page.querySelector(".bulk-bar");
  const groupTypes = groupTypeOptions();
  if (!groupTypes.some((item) => item.id === appState.ui.groupsTypeFilter) && appState.ui.groupsTypeFilter !== "all") {
    appState.ui.groupsTypeFilter = "all";
  }
  const allGroups = appState.groups;
  const activeGroups = allGroups.filter((group) => group.enabled !== false);
  const pausedGroups = allGroups.filter((group) => group.paused);
  const riskyGroups = allGroups.filter((group) => (
    Number(group.pending || 0) + Number(group.rejected || 0) + Number(group.fail || 0) > 0
  ));
  const assignedGroups = allGroups.filter((group) => groupWorkers(group).length > 0);
  if (summaryBar) {
    summaryBar.innerHTML = [
      ["Tổng nhóm", allGroups.length, "total"],
      ["Đang bật", activeGroups.length, "success"],
      ["Tạm dừng", pausedGroups.length, "warning"],
      ["Cần chú ý", riskyGroups.length, "danger"],
      ["Có worker", assignedGroups.length, "success"],
    ].map(([label, value, tone]) => (
      `<span class="worker-summary-badge worker-summary-badge-${escapeHtml(tone)}"><span class="worker-summary-label">${escapeHtml(label)}</span><b>${formatNumber(value)}</b></span>`
    )).join("");
  }
  if (toolbarActions) {
    toolbarActions.innerHTML = `
      <select data-groups-type-filter="1">
        <option value="all">Tất cả loại nhóm</option>
        ${groupTypes.map((item) => `<option value="${escapeHtml(item.id)}"${appState.ui.groupsTypeFilter === item.id ? " selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
      </select>
      <input placeholder="Tìm tên nhóm hoặc URL..." data-groups-search="1">
    `;
  }
  const searchInput = page.querySelector("[data-groups-search]");
  const typeFilterSelect = page.querySelector("[data-groups-type-filter]");
  const filteredGroups = filteredGroupsList();
  const pageState = paginateRows(filteredGroups, "groups");
  const pageGroups = pageState.items;
  if (segmented) {
    const counts = {
      all: allGroups.length,
      running: allGroups.filter((group) => group.enabled !== false).length,
      paused: allGroups.filter((group) => group.paused).length,
    };
    segmented.innerHTML = `
      <button class="${appState.ui.groupsFilter === "all" ? "active" : ""}" data-action="set-groups-filter" data-filter="all">Tất cả (${counts.all})</button>
      <button class="${appState.ui.groupsFilter === "running" ? "active" : ""}" data-action="set-groups-filter" data-filter="running">Đang chạy (${counts.running})</button>
      <button class="${appState.ui.groupsFilter === "paused" ? "active" : ""}" data-action="set-groups-filter" data-filter="paused">Tạm dừng (${counts.paused})</button>
    `;
  }
  if (searchInput) {
    searchInput.value = appState.ui.groupsQuery;
  }
  if (typeFilterSelect) {
    typeFilterSelect.value = appState.ui.groupsTypeFilter;
  }
  if (dataTable) {
    const allVisibleSelected = pageGroups.length > 0 && pageGroups.every((group) => appState.ui.selectedGroups.has(String(group.id)));
    dataTable.innerHTML = `
      <div class="row head"><span><label class="table-check-label"><input type="checkbox" data-groups-select-all="1"><span></span></label></span><span>Nhóm</span><span>Loại nhóm</span><span>Worker</span><span>Lần quét cuối</span><span>Comment</span><span>Thao tác</span></div>
      ${pageGroups.length ? pageGroups.map((group) => {
        const checked = appState.ui.selectedGroups.has(String(group.id));
        const workerNames = groupWorkers(group);
        const workersText = workerNames.length ? workerNames.join(", ") : "Chưa có worker";
        const workersTitle = workerNames.length ? groupWorkersTitle(workerNames) : "Chưa có worker nào sử dụng nhóm này.";
        const activeWorker = activeWorkerForGroup(group);
        const lastScanLabel = activeWorker
          ? `<span class="pill success-pill">Đang quét</span>`
          : `<b>${escapeHtml(group.lastScan || "—")}</b>`;
        const currentTypeId = String(group.groupTypeId || groupTypes[0]?.id || "");
        const typeOptions = groupTypes.some((item) => item.id === currentTypeId)
          ? groupTypes
          : [{ id: currentTypeId, label: groupTypeLabel(currentTypeId) }, ...groupTypes];
        const groupLabel = escapeHtml(group.name || group.url || "Nhóm Facebook");
        const groupUrl = escapeHtml(group.url || "");
        const groupTooltip = escapeHtml(`${group.name || group.url || "Nhóm Facebook"}\n${group.url || ""}`.trim());
        const commentSuccess = Number(group.comments || 0);
        const commentPending = Number(group.pending || 0);
        const commentRejected = Number(group.rejected || 0);
        return `<div class="row">
          <span><input type="checkbox" ${checked ? "checked" : ""} data-group-select="1" data-group-id="${escapeHtml(group.id)}"></span>
          <span>
            ${group.url
              ? `<a class="group-name-link" href="${groupUrl}" target="_blank" rel="noreferrer noopener" title="${groupTooltip}"><b class="group-name-title">${groupLabel}</b></a>`
              : `<span class="group-name-link" title="${groupTooltip}"><b class="group-name-title">${groupLabel}</b></span>`}
          </span>
          <span><select class="group-type-select" data-group-type-select="1" data-group-id="${escapeHtml(group.id)}">${typeOptions.map((item) => `<option value="${escapeHtml(item.id)}"${item.id === currentTypeId ? " selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}</select></span>
          <span class="group-workers-cell" title="${escapeHtml(workersTitle)}"><span class="group-workers-text">${escapeHtml(workersText)}</span></span>
          <span class="group-scan-cell">${lastScanLabel}</span>
          <span class="group-metric-badges">
            <span class="pill success-pill">OK ${formatNumber(commentSuccess)}</span>
            <span class="pill warning-pill">Chờ ${formatNumber(commentPending)}</span>
            <span class="pill danger-pill">Từ chối ${formatNumber(commentRejected)}</span>
          </span>
          <span class="group-actions"><button class="btn secondary" data-action="edit-group" data-group-id="${escapeHtml(group.id)}">Sửa</button></span>
        </div>`;
      }).join("") : `<div class="row"><span></span><span><b>Chưa có nhóm</b></span><span>—</span><span>—</span><span>—</span><span>—</span><span></span></div>`}
    `;
    const bulkSelect = dataTable.querySelector(".row.head input[type=checkbox]");
    if (bulkSelect) {
      bulkSelect.checked = allVisibleSelected;
      bulkSelect.indeterminate = !allVisibleSelected && pageGroups.some((group) => appState.ui.selectedGroups.has(String(group.id)));
      bulkSelect.dataset.groupsSelectAll = "1";
    }
    hydrateCustomControls(dataTable);
    renderPagination(ensurePaginationElement(dataTable, "groups", bulkBar), {
      key: "groups",
      page: pageState.page,
      totalPages: pageState.totalPages,
      start: pageState.start,
      end: pageState.end,
      total: pageState.total,
      noun: "nhóm",
    });
  }
  if (bulkBar) {
    const hasSelection = appState.ui.selectedGroups.size > 0;
    bulkBar.innerHTML = `
      <span>${appState.ui.selectedGroups.size} nhóm được chọn</span>
      <div class="bulk-bar-actions">
        <button class="btn danger" data-action="delete-selected-groups"${hasSelection ? "" : " disabled"}>Xóa</button>
      </div>
    `;
  }
  hydrateCustomControls(page);
}

function keywordMeta(keyword, index) {
  const lower = String(keyword || "").toLowerCase();
  let group = "Khác";
  if (lower.includes("mua")) group = "Mua trực tiếp";
  else if (lower.includes("shop") || lower.includes("bán")) group = "Tìm người bán";
  else if (lower.includes("giá")) group = "Hỏi giá";
  const priority = index < 8 ? "Cao" : index < 18 ? "Vừa" : "Thấp";
  const matches = appState.products.filter((item) => String(item.keyword || item.name || "").toLowerCase().includes(lower)).length;
  return { group, priority, matches, accuracy: Math.max(68, 96 - index) };
}

function renderKeywords() {
  const page = pageRoot.querySelector(".page");
  if (!page) return;
  const [importBtn, addBtn] = page.querySelectorAll(".page-actions .btn");
  if (importBtn) importBtn.dataset.action = "import-keywords";
  if (addBtn) addBtn.dataset.action = "add-keyword";
  const table = page.querySelector(".keyword-table");
  const pagination = page.querySelector(".pagination");
  const rows = appState.keywords
    .map((keyword, index) => ({ keyword, index, ...keywordMeta(keyword, index) }));
  const pageState = paginateRows(rows, "keywords");
  const pageRows = pageState.items;
  const kpis = page.querySelectorAll(".kpi-grid.four .kpi");
  const totalMatches = rows.reduce((sum, row) => sum + row.matches, 0);
  const avgAccuracy = rows.length ? rows.reduce((sum, row) => sum + row.accuracy, 0) / rows.length : 0;
  renderKpiBadges(kpis, [
    { label: "Tổng từ khóa", value: formatNumber(appState.keywords.length), meta: "Đang hoạt động", tone: "total" },
    { label: "Nhóm nhu cầu", value: formatNumber(new Set(rows.map((row) => row.group)).size), meta: "Được phân loại", tone: "success" },
    { label: "Kết quả khớp", value: formatNumber(totalMatches), meta: "Từ dữ liệu sản phẩm", tone: "warning" },
    { label: "Độ chính xác TB", value: formatPercent(avgAccuracy), meta: "Ước tính theo tín hiệu", tone: "info" },
  ]);
  if (table) {
    table.innerHTML = `
      <div class="row head"><span>Từ khóa</span><span>Thao tác</span></div>
      ${pageRows.length ? pageRows.map((row) => `
        <div class="row">
          <span><b>${escapeHtml(row.keyword)}</b></span>
          <span class="table-actions"><button class="btn secondary" data-action="edit-keyword" data-keyword="${escapeHtml(row.keyword)}">Sửa</button><button class="btn danger" data-action="remove-keyword" data-keyword="${escapeHtml(row.keyword)}">Xóa</button></span>
        </div>`).join("") : `<div class="row"><span><b>Chưa có từ khóa</b></span><span>—</span></div>`}
    `;
  }
  if (pagination) {
    renderPagination(pagination, {
      key: "keywords",
      page: pageState.page,
      totalPages: pageState.totalPages,
      start: pageState.start,
      end: pageState.end,
      total: pageState.total,
      noun: "từ khóa",
    });
  }
}

function normalizeProduct(item, index) {
  const keyword = item.keyword || item.product_name || item.name || `product-${index + 1}`;
  const name = item.product_name || item.name || keyword;
  return {
    ...item,
    keyword,
    name,
    productTypeId: String(item.productTypeId || item.categoryId || "").trim(),
    category: item.category || "",
    comments: Array.isArray(item.comments)
      ? item.comments.map((comment) => String(comment || "").trim()).filter(Boolean)
      : String(item.comments || "").split(/\r?\n/).map((comment) => comment.trim()).filter(Boolean),
    affiliateLinks: Array.isArray(item.affiliateLinks)
      ? item.affiliateLinks.map((link) => String(link || "").trim()).filter(Boolean)
      : String(item.affiliateLinks || item.links || "").split(/\r?\n/).map((link) => link.trim()).filter(Boolean),
    status: normalizeStatus(item.status || (item.url ? "ready" : "pending")),
    demand: Number(item.demand_count || item.demand || 0),
    url: item.url || "",
  };
}

function matchesProductHistoryEntry(product, entry) {
  const productName = foldSearchText(product?.name || product?.product_name || product?.keyword || "");
  const entryName = foldSearchText(entry?.product || entry?.product_name || "");
  if (!productName || !entryName) return false;
  return productName.includes(entryName) || entryName.includes(productName);
}

function productHistoryStats(product, history = appState.history) {
  const rows = (Array.isArray(history) ? history : []).filter((entry) => matchesProductHistoryEntry(product, entry));
  const commented = rows.filter((entry) => normalizeMode(entry.mode) === "comment").length;
  const rejectedRows = rows.filter((entry) => normalizeMode(entry.mode) === "rejected");
  const rejected = rejectedRows.length;
  const rejectedPositions = rejectedRows.reduce((map, entry) => {
    const key = String(entry.comment_position || entry.commentPosition || "").trim();
    if (!key) {
      map.unknown = (map.unknown || 0) + 1;
      return map;
    }
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});
  const rejectedPositionText = Object.entries(rejectedPositions)
    .map(([key, value]) => key === "unknown" ? `Không rõ ×${value}` : `#${key} ×${value}`)
    .join(", ");
  return {
    commented,
    rejected,
    rejectedPositionText: rejectedPositionText || "—",
  };
}

function renderProducts() {
  const page = pageRoot.querySelector(".page");
  if (!page) return;
  const [manageTypesBtn, importBtn, addBtn] = page.querySelectorAll(".page-actions .btn");
  if (manageTypesBtn) manageTypesBtn.dataset.action = "manage-product-types";
  if (importBtn) importBtn.dataset.action = "import-products";
  if (addBtn) addBtn.dataset.action = "add-product";
  const searchInput = page.querySelector(".toolbar-actions input");
  const table = page.querySelector(".product-table");
  const bulkBar = page.querySelector(".bulk-bar");
  const summaryBar = page.querySelector(".products-summary");
  const items = appState.products.map(normalizeProduct);
  if (searchInput) {
    searchInput.value = appState.ui.productsQuery;
    searchInput.dataset.productsSearch = "1";
  }
  const filtered = items.filter((item) => {
    const query = appState.ui.productsQuery.trim().toLowerCase();
    if (!query) return true;
    return `${item.keyword} ${item.name} ${productTypeLabel(item.productTypeId, item.category)} ${item.comments.join(" ")} ${item.affiliateLinks.join(" ")}`.toLowerCase().includes(query);
  });
  const pageState = paginateRows(filtered, "products");
  const pageItems = pageState.items;
  if (summaryBar) {
    const typedCount = items.filter((item) => item.productTypeId).length;
    const withCommentsCount = items.filter((item) => item.comments.length > 0).length;
    const rejectedCount = items.reduce((sum, item) => sum + productHistoryStats(item).rejected, 0);
    summaryBar.innerHTML = [
      ["Tổng sản phẩm", items.length, "total"],
      ["Có loại", typedCount, "success"],
      ["Có comments", withCommentsCount, "warning"],
      ["Bị từ chối", rejectedCount, "danger"],
    ].map(([label, value, tone]) => (
      `<span class="worker-summary-badge worker-summary-badge-${escapeHtml(tone)}"><span class="worker-summary-label">${escapeHtml(label)}</span><b>${formatNumber(value)}</b></span>`
    )).join("");
  }
  if (table) {
    const allVisibleSelected = pageItems.length > 0 && pageItems.every((item) => appState.ui.selectedProducts.has(String(item.id)));
    table.innerHTML = `
      <div class="row head"><span><label class="table-check-label"><input type="checkbox" data-products-select-all="1"><span></span></label></span><span>Tên sản phẩm</span><span>Loại</span><span>Danh sách comment</span><span>SL</span><span>Thao tác</span></div>
      ${pageItems.length ? pageItems.map((item) => {
        const stats = productHistoryStats(item);
        const checked = appState.ui.selectedProducts.has(String(item.id));
        return `
        <div class="row">
          <span><input type="checkbox" ${checked ? "checked" : ""} data-product-select="1" data-product-id="${escapeHtml(item.id)}"></span>
          <span><b>${escapeHtml(item.name)}</b></span>
          <span>${escapeHtml(productTypeLabel(item.productTypeId, item.category))}</span>
          <span class="product-comment-list">${item.comments.length ? item.comments.map((comment) => `<small>${escapeHtml(comment)}</small>`).join("") : `<small>Chưa có comment tự động</small>`}</span>
          <span class="product-metric-cell"><span class="product-count-badge"><span class="product-count-success">${formatNumber(stats.commented)}</span><span class="product-count-separator">/</span><span class="product-count-danger">${formatNumber(stats.rejected)}</span></span></span>
          <span class="table-actions"><button class="btn secondary" data-action="edit-product" data-product-id="${escapeHtml(item.id)}">Sửa</button><button class="btn info btn-icon-only" data-action="generate-product-comments" data-product-id="${escapeHtml(item.id)}" title="Tự động lấy comment" aria-label="Tự động lấy comment">💬</button><button class="btn danger" data-action="delete-product" data-product-id="${escapeHtml(item.id)}">Xóa</button></span>
        </div>`;
      }).join("") : `<div class="row"><span>—</span><span><b>Chưa có sản phẩm</b></span><span>—</span><span><small>—</small></span><span><small>—</small></span><span></span></div>`}
    `;
    const bulkSelect = table.querySelector(".row.head input[type=checkbox]");
    if (bulkSelect) {
      bulkSelect.checked = allVisibleSelected;
      bulkSelect.indeterminate = !allVisibleSelected && pageItems.some((item) => appState.ui.selectedProducts.has(String(item.id)));
    }
    renderPagination(ensurePaginationElement(table, "products", bulkBar), {
      key: "products",
      page: pageState.page,
      totalPages: pageState.totalPages,
      start: pageState.start,
      end: pageState.end,
      total: pageState.total,
      noun: "sản phẩm",
    });
  }
  if (bulkBar) {
    const hasSelection = appState.ui.selectedProducts.size > 0;
    bulkBar.innerHTML = `<span>${appState.ui.selectedProducts.size} sản phẩm được chọn</span><div class="bulk-bar-actions"><button class="btn danger" data-action="delete-selected-products"${hasSelection ? "" : " disabled"}>Xóa</button></div>`;
  }
}

async function refreshProductCommentsAfterSave(productId, productName) {
  const response = await api.call("generateProductComments", { id: productId });
  const comments = Array.isArray(response.data?.product?.comments) ? response.data.product.comments : [];
  showToast(
    comments.length
      ? `Đã tự động cập nhật ${comments.length} comment cho ${productName}.`
      : `Đã tự động cập nhật comment cho ${productName}.`,
    {
      title: "Kho sản phẩm",
      tone: "success",
    },
  );
  return comments;
}

function renderPending() {
  const page = pageRoot.querySelector(".page");
  if (!page) return;
  const [batchBtn, addBtn] = page.querySelectorAll(".page-actions .btn");
  if (batchBtn) batchBtn.dataset.action = "process-backlog";
  if (addBtn) addBtn.dataset.action = "add-pending-product";
  const segmented = page.querySelector(".segmented");
  const searchInput = page.querySelector(".toolbar-actions input");
  const table = page.querySelector(".pending-table");
  const pendingRows = appState.products.map(normalizeProduct).filter((item) => item.status !== "ready");
  if (searchInput) {
    searchInput.value = appState.ui.productsQuery;
    searchInput.dataset.productsSearch = "1";
  }
  if (segmented) {
    const pending = pendingRows.filter((item) => item.status === "pending").length;
    const processing = pendingRows.filter((item) => item.status === "processing").length;
    const failed = pendingRows.filter((item) => item.status === "failed").length;
    segmented.innerHTML = `
      <button class="${appState.ui.pendingFilter === "pending" ? "active" : ""}" data-action="set-pending-filter" data-filter="pending">Chờ xử lý (${pending})</button>
      <button class="${appState.ui.pendingFilter === "processing" ? "active" : ""}" data-action="set-pending-filter" data-filter="processing">Đang xử lý (${processing})</button>
      <button class="${appState.ui.pendingFilter === "failed" ? "active" : ""}" data-action="set-pending-filter" data-filter="failed">Thất bại (${failed})</button>
    `;
  }
  const filtered = pendingRows.filter((item) => {
    if (appState.ui.pendingFilter !== "all" && item.status !== appState.ui.pendingFilter) return false;
    const query = appState.ui.productsQuery.trim().toLowerCase();
    if (!query) return true;
    return `${item.keyword} ${item.name}`.toLowerCase().includes(query);
  });
  const pageState = paginateRows(filtered, "pending");
  const pageItems = pageState.items;
  if (table) {
    table.innerHTML = `
      <div class="row head"><span>Từ khóa</span><span>Nguồn</span><span>Số lần gặp</span><span>Ưu tiên</span><span>Ngày tạo</span><span>Trạng thái</span><span></span></div>
      ${pageItems.length ? pageItems.map((item, index) => {
        const absoluteIndex = Math.max(0, pageState.start + index - 1);
        return `<div class="row">
          <span><b>${escapeHtml(item.keyword)}</b></span>
          <span>Facebook</span>
          <span>${formatNumber(item.demand || absoluteIndex + 1)}</span>
          <span><span class="pill ${absoluteIndex < 5 ? "gold-pill" : ""}">${absoluteIndex < 5 ? "Cao" : "Vừa"}</span></span>
          <span>${escapeHtml(formatDate(Date.now()))}</span>
          <span><span class="pill ${item.status === "failed" ? "danger-pill" : item.status === "processing" ? "gold-pill" : "warning-pill"}">${escapeHtml(item.status === "failed" ? "Thất bại" : item.status === "processing" ? "Đang xử lý" : "Chờ xử lý")}</span></span>
          <span><button class="btn success" data-action="promote-product" data-product-id="${escapeHtml(String(item.id))}">Sẵn sàng</button></span>
        </div>`;
      }).join("") : `<div class="row"><span><b>Không có backlog</b></span><span>—</span><span>0</span><span>—</span><span>—</span><span><span class="pill success-pill">Hoàn tất</span></span><span></span></div>`}
    `;
    renderPagination(ensurePaginationElement(table, "pending"), {
      key: "pending",
      page: pageState.page,
      totalPages: pageState.totalPages,
      start: pageState.start,
      end: pageState.end,
      total: pageState.total,
      noun: "mục chờ xử lý",
    });
  }
}

function renderProcessing() {
  const page = pageRoot.querySelector(".page");
  if (!page) return;
  const kpis = page.querySelectorAll(".kpi-grid.four .kpi");
  const scanned = appState.groups.reduce((sum, group) => sum + Number(group.scanned || 0), 0);
  const matched = appState.groups.reduce((sum, group) => sum + Number(group.matched || 0), 0);
  const comments = appState.groups.reduce((sum, group) => sum + Number(group.comments || 0), 0);
  const fails = appState.groups.reduce((sum, group) => sum + Number(group.fail || 0), 0);
  renderKpiBadges(kpis, [
    { label: "Đã phân tích", value: formatNumber(scanned), meta: `${appState.runs.length} phiên chạy`, tone: "info" },
    { label: "Bài khớp", value: formatNumber(matched), meta: scanned ? formatPercent((matched / scanned) * 100) : "0%", tone: "primary" },
    { label: "Comment thành công", value: formatNumber(comments), meta: matched ? formatPercent((comments / matched) * 100) : "0%", tone: "success" },
    { label: "Lỗi pipeline", value: formatNumber(fails), meta: "Từ dữ liệu thật", tone: "danger" },
  ]);
  const funnel = page.querySelector(".funnel");
  if (funnel) {
    const buyerIntent = Math.max(matched, Math.round(scanned * 0.7));
    const aiAnalyzed = Math.max(matched, Math.round(buyerIntent * 0.85));
    funnel.innerHTML = `
      <div style="--w:100%"><span>Quét bài</span><b>${formatNumber(scanned)}</b></div>
      <div style="--w:${scanned ? Math.max(28, (buyerIntent / scanned) * 100) : 28}%"><span>Lọc nhu cầu mua</span><b>${formatNumber(buyerIntent)}</b></div>
      <div style="--w:${scanned ? Math.max(22, (aiAnalyzed / scanned) * 100) : 22}%"><span>AI phân tích</span><b>${formatNumber(aiAnalyzed)}</b></div>
      <div style="--w:${scanned ? Math.max(16, (matched / scanned) * 100) : 16}%"><span>Khớp sản phẩm</span><b>${formatNumber(matched)}</b></div>
      <div style="--w:${scanned ? Math.max(10, (comments / scanned) * 100) : 10}%"><span>Comment thành công</span><b>${formatNumber(comments)}</b></div>
    `;
  }
  const reasonList = page.querySelector(".reason-list");
  if (reasonList) {
    const pendingProducts = appState.products.filter((item) => normalizeStatus(item.status) !== "ready").length;
    const pendingHistory = appState.history.filter((entry) => normalizeMode(entry.mode) === "pending").length;
    const rejectedHistory = appState.history.filter((entry) => normalizeMode(entry.mode) === "rejected").length;
    const noMatch = Math.max(0, scanned - matched);
    const total = pendingProducts + pendingHistory + rejectedHistory + noMatch || 1;
    const rows = [
      ["Không có sản phẩm phù hợp", pendingProducts],
      ["Không khớp nhu cầu mua", noMatch],
      ["Comment chờ duyệt", pendingHistory],
      ["Comment bị từ chối", rejectedHistory],
    ];
    reasonList.innerHTML = rows.map(([label, value]) => `<li><span>${escapeHtml(label)}</span><b>${Math.round((value / total) * 100)}%</b></li>`).join("");
  }
}

function renderHistory() {
  const page = pageRoot.querySelector(".page");
  if (!page) return;
  const searchInput = page.querySelector(".table-toolbar input.grow");
  const segmented = page.querySelector(".segmented");
  const table = page.querySelector(".history-table");
  if (searchInput) {
    searchInput.value = appState.ui.historyQuery;
    searchInput.dataset.historySearch = "1";
  }
  if (segmented) {
    const counts = {
      all: appState.history.length,
      success: appState.history.filter((entry) => normalizeMode(entry.mode) === "comment").length,
      pending: appState.history.filter((entry) => normalizeMode(entry.mode) === "pending").length,
      rejected: appState.history.filter((entry) => normalizeMode(entry.mode) === "rejected").length,
      failed: appState.history.filter((entry) => !["comment", "pending", "rejected"].includes(normalizeMode(entry.mode))).length,
    };
    segmented.innerHTML = `
      <button class="${appState.ui.historyFilter === "all" ? "active" : ""}" data-action="set-history-filter" data-filter="all">Tất cả</button>
      <button class="${appState.ui.historyFilter === "success" ? "active" : ""}" data-action="set-history-filter" data-filter="success">Thành công</button>
      <button class="${appState.ui.historyFilter === "pending" ? "active" : ""}" data-action="set-history-filter" data-filter="pending">Chờ duyệt</button>
      <button class="${appState.ui.historyFilter === "rejected" ? "active" : ""}" data-action="set-history-filter" data-filter="rejected">Từ chối</button>
      <button class="${appState.ui.historyFilter === "failed" ? "active" : ""}" data-action="set-history-filter" data-filter="failed">Thất bại</button>
    `;
  }
  const filtered = appState.history.filter((entry) => {
    const mode = normalizeMode(entry.mode);
    if (appState.ui.historyFilter === "success" && mode !== "comment") return false;
    if (appState.ui.historyFilter === "pending" && mode !== "pending") return false;
    if (appState.ui.historyFilter === "rejected" && mode !== "rejected") return false;
    if (appState.ui.historyFilter === "failed" && ["comment", "pending", "rejected"].includes(mode)) return false;
    const query = appState.ui.historyQuery.trim().toLowerCase();
    if (!query) return true;
    return `${entry.group} ${entry.product} ${entry.comment} ${entry.permalink}`.toLowerCase().includes(query);
  });
  const pageState = paginateRows(filtered, "history");
  const pageItems = pageState.items;
  if (table) {
    table.innerHTML = `
      <div class="row head"><span>Thời gian</span><span>Nhóm</span><span>Nội dung</span><span>Sản phẩm</span><span>Trạng thái</span><span></span></div>
      ${pageItems.length ? pageItems.map((entry) => `
        <div class="row">
          <span>${escapeHtml(`${entry.time || "00:00:00"} ${entry.date || ""}`.trim())}</span>
          <span>${escapeHtml(entry.group || "—")}</span>
          <span>${escapeHtml(String(entry.comment || "").slice(0, 80) || "—")}</span>
          <span>${escapeHtml(entry.product || "—")}</span>
          <span><span class="pill ${historyPillClass(entry.mode)}">${historyLabel(entry.mode)}</span></span>
          <span>${entry.permalink ? `<a href="${escapeHtml(entry.permalink)}" target="_blank" rel="noreferrer">↗</a>` : "—"}</span>
        </div>`).join("") : `<div class="row"><span>—</span><span>—</span><span>Chưa có lịch sử xử lý</span><span>—</span><span><span class="pill warning-pill">Trống</span></span><span>—</span></div>`}
    `;
    renderPagination(ensurePaginationElement(table, "history"), {
      key: "history",
      page: pageState.page,
      totalPages: pageState.totalPages,
      start: pageState.start,
      end: pageState.end,
      total: pageState.total,
      noun: "lịch sử",
    });
  }
}

function runStatusPill(status) {
  return ({
    done: "success-pill",
    stopped: "warning-pill",
    error: "danger-pill",
    interrupted: "danger-pill",
  }[normalizeStatus(status)] || "warning-pill");
}

function renderRuns() {
  const page = pageRoot.querySelector(".page");
  if (!page) return;
  const segmented = page.querySelector(".segmented");
  const searchInput = page.querySelector(".toolbar-actions input");
  const table = page.querySelector(".runs-table");
  if (searchInput) {
    searchInput.value = appState.ui.runsQuery;
    searchInput.dataset.runsSearch = "1";
  }
  if (segmented) {
    const counts = {
      all: appState.runs.length,
      done: appState.runs.filter((run) => normalizeStatus(run.status) === "done").length,
      stopped: appState.runs.filter((run) => normalizeStatus(run.status) === "stopped").length,
      error: appState.runs.filter((run) => normalizeStatus(run.status) === "error").length,
      interrupted: appState.runs.filter((run) => normalizeStatus(run.status) === "interrupted").length,
    };
    segmented.innerHTML = `
      <button class="${appState.ui.runsFilter === "all" ? "active" : ""}" data-action="set-runs-filter" data-filter="all">Tất cả</button>
      <button class="${appState.ui.runsFilter === "done" ? "active" : ""}" data-action="set-runs-filter" data-filter="done">Hoàn tất</button>
      <button class="${appState.ui.runsFilter === "stopped" ? "active" : ""}" data-action="set-runs-filter" data-filter="stopped">Đã dừng</button>
      <button class="${appState.ui.runsFilter === "error" ? "active" : ""}" data-action="set-runs-filter" data-filter="error">Lỗi</button>
      <button class="${appState.ui.runsFilter === "interrupted" ? "active" : ""}" data-action="set-runs-filter" data-filter="interrupted">Bị gián đoạn</button>
    `;
  }
  const filtered = appState.runs.filter((run) => {
    if (appState.ui.runsFilter !== "all" && normalizeStatus(run.status) !== appState.ui.runsFilter) return false;
    const query = appState.ui.runsQuery.trim().toLowerCase();
    if (!query) return true;
    return `${run.id} ${run.label} ${run.worker_id || ""}`.toLowerCase().includes(query);
  });
  const pageState = paginateRows(filtered, "runs");
  const pageItems = pageState.items;
  if (table) {
    const primaryWorker = appState.workers[0]?.name || "Worker mặc định";
    table.innerHTML = `
      <div class="row head"><span>Mã phiên</span><span>Worker</span><span>Bắt đầu</span><span>Thời lượng</span><span>Nhóm</span><span>Bài quét</span><span>Trạng thái</span></div>
      ${pageItems.length ? pageItems.map((run) => `
        <div class="row">
          <span>${escapeHtml(run.id || run.label || "—")}</span>
          <span>${escapeHtml(run.worker_id || primaryWorker)}</span>
          <span>${escapeHtml(formatDateTime(run.startedAt))}</span>
          <span>${escapeHtml(formatDuration(run.startedAt))}</span>
          <span>${formatNumber(Array.isArray(run.children) ? run.children.length : 0)}</span>
          <span>${formatNumber(run.scanned || run.runs || 0)}</span>
          <span><span class="pill ${runStatusPill(run.status)}">${escapeHtml(statusText(run.status || "idle"))}</span></span>
        </div>`).join("") : `<div class="row"><span>—</span><span>—</span><span>—</span><span>—</span><span>0</span><span>0</span><span><span class="pill warning-pill">Trống</span></span></div>`}
    `;
    renderPagination(ensurePaginationElement(table, "runs"), {
      key: "runs",
      page: pageState.page,
      totalPages: pageState.totalPages,
      start: pageState.start,
      end: pageState.end,
      total: pageState.total,
      noun: "phiên chạy",
    });
  }
}

function renderRevenue() {
  const page = pageRoot.querySelector(".page");
  if (!page) return;
  const kpis = page.querySelectorAll(".kpi-grid .kpi");
  const overview = appState.revenueOverview || { gmv: 0, commission: 0, orders: 0, clicks: 0, avgOrder: 0, commRate: 0 };
  const topSubid = appState.revenueTopSubids[0];
  renderKpiBadges(kpis, [
    { label: "Lượt click", value: formatNumber(overview.clicks || 0), meta: `${appState.revenueCharts.daily.length} ngày dữ liệu`, tone: "info" },
    { label: "Đơn hàng", value: formatNumber(appState.revenueStats?.summary?.orders || 0), meta: formatPercent(overview.cvr || 0, 2), tone: "success" },
    { label: "Doanh thu", value: formatMoneyShort(overview.gmv || 0), meta: `${formatNumber(overview.gmv || 0)} đ`, tone: "primary" },
    { label: "Hoa hồng", value: formatMoneyShort(overview.commission || 0), meta: formatPercent(overview.commRate || 0), tone: "warning" },
    { label: "AOV", value: formatMoneyShort(overview.avgOrder || 0), meta: "giá trị đơn TB", tone: "danger" },
    { label: "SubID cao nhất", value: topSubid?.full || "—", meta: `${formatMoneyShort(topSubid?.comm || 0)}`, tone: "total" },
  ]);
  const line = page.querySelector(".revenue-chart .gold-line");
  if (line) {
    const values = (appState.revenueCharts.daily || []).slice(-14).map((row) => Number(row.comm || row.gmv || row.orders || 0));
    line.setAttribute("points", makePolyline(values));
  }
  const ranking = page.querySelector(".ranking");
  if (ranking) {
    ranking.innerHTML = appState.revenueTopProducts.slice(0, 4).map((item, index) => `
      <div><span>${index + 1}</span><b>${escapeHtml(item.name || item.product || "—")}</b><em>${formatMoneyShort(item.comm || 0)}</em></div>
    `).join("") || `<div><span>1</span><b>Chưa có dữ liệu</b><em>0</em></div>`;
  }
}

function ratingLabel(rating) {
  const value = normalizeStatus(rating);
  return ({
    excellent: ["Mạnh", "success-pill"],
    effective: ["Ổn định", "gold-pill"],
    potential: ["Tiềm năng", "gold-pill"],
    monitor: ["Ổn định", "gold-pill"],
    follow: ["Theo dõi", ""],
    optimize: ["Cần tối ưu", "warning-pill"],
    improve: ["Cần tối ưu", "warning-pill"],
    risk: ["Nên loại bỏ", "danger-pill"],
    remove: ["Nên loại bỏ", "danger-pill"],
    none: ["Chưa có dữ liệu", ""],
  }[value] || ["Theo dõi", ""]);
}

function renderGroupPerformance() {
  const page = pageRoot.querySelector(".page");
  if (!page) return;
  const segmented = page.querySelector(".segmented");
  const searchInput = page.querySelector(".toolbar-actions input");
  const table = page.querySelector(".performance-table");
  const kpis = page.querySelectorAll(".kpi-grid.four .kpi");
  if (searchInput) {
    searchInput.value = appState.ui.performanceQuery;
    searchInput.dataset.performanceSearch = "1";
  }
  const rows = appState.groupPerformance;
  const filtered = rows.filter((row) => {
    const [label] = ratingLabel(row.rating);
    if (appState.ui.performanceFilter === "strong" && label !== "Mạnh") return false;
    if (appState.ui.performanceFilter === "stable" && label !== "Ổn định") return false;
    if (appState.ui.performanceFilter === "optimize" && label !== "Cần tối ưu") return false;
    if (appState.ui.performanceFilter === "remove" && label !== "Nên loại bỏ") return false;
    const query = appState.ui.performanceQuery.trim().toLowerCase();
    if (!query) return true;
    return `${row.name} ${row.url}`.toLowerCase().includes(query);
  });
  const pageState = paginateRows(filtered, "groupPerformance");
  const pageItems = pageState.items;
  if (segmented) {
    segmented.innerHTML = `
      <button class="${appState.ui.performanceFilter === "all" ? "active" : ""}" data-action="set-performance-filter" data-filter="all">Tất cả</button>
      <button class="${appState.ui.performanceFilter === "strong" ? "active" : ""}" data-action="set-performance-filter" data-filter="strong">Mạnh</button>
      <button class="${appState.ui.performanceFilter === "stable" ? "active" : ""}" data-action="set-performance-filter" data-filter="stable">Ổn định</button>
      <button class="${appState.ui.performanceFilter === "optimize" ? "active" : ""}" data-action="set-performance-filter" data-filter="optimize">Cần tối ưu</button>
      <button class="${appState.ui.performanceFilter === "remove" ? "active" : ""}" data-action="set-performance-filter" data-filter="remove">Nên loại bỏ</button>
    `;
  }
  const totalScanned = rows.reduce((sum, row) => sum + Number(row.scanned || 0), 0);
  const totalMatched = rows.reduce((sum, row) => sum + Number(row.suitable || 0), 0);
  const totalComments = rows.reduce((sum, row) => sum + Number(row.comment_success || row.comments || 0), 0);
  const optimizeCount = rows.filter((row) => ["optimize", "improve", "risk", "remove"].includes(normalizeStatus(row.rating))).length;
  renderKpiBadges(kpis, [
    { label: "Nhóm hoạt động", value: formatNumber(rows.length), meta: `${rows.filter((row) => Number(row.scanned || 0) > 0).length} có dữ liệu`, tone: "total" },
    { label: "Tỷ lệ match TB", value: totalScanned ? formatPercent((totalMatched / totalScanned) * 100) : "0%", meta: "dựa trên scanned", tone: "primary" },
    { label: "Tỷ lệ comment", value: totalMatched ? formatPercent((totalComments / totalMatched) * 100) : "0%", meta: "trên số bài match", tone: "success" },
    { label: "Nhóm nên tối ưu", value: formatNumber(optimizeCount), meta: "rating từ backend", tone: "warning" },
  ]);
  if (table) {
    table.innerHTML = `
      <div class="row head"><span>Nhóm</span><span>Bài quét</span><span>Khớp</span><span>Comment</span><span>Lượt click</span><span>Đơn</span><span>Đánh giá</span></div>
      ${pageItems.length ? pageItems.map((row) => {
        const [label, pill] = ratingLabel(row.rating);
        return `<div class="row">
          <span><b>${escapeHtml(row.name || row.url || "—")}</b></span>
          <span>${formatNumber(row.scanned || 0)}</span>
          <span>${formatNumber(row.suitable || 0)}</span>
          <span>${formatNumber(row.comment_success || row.comments || 0)}</span>
          <span>${formatNumber(row.clicks || 0)}</span>
          <span>${formatNumber(row.orders || 0)}</span>
          <span><span class="pill ${pill}">${escapeHtml(label)}</span></span>
        </div>`;
      }).join("") : `<div class="row"><span><b>Chưa có dữ liệu</b></span><span>0</span><span>0</span><span>0</span><span>0</span><span>0</span><span><span class="pill warning-pill">Trống</span></span></div>`}
    `;
    renderPagination(ensurePaginationElement(table, "groupPerformance"), {
      key: "groupPerformance",
      page: pageState.page,
      totalPages: pageState.totalPages,
      start: pageState.start,
      end: pageState.end,
      total: pageState.total,
      noun: "nhóm",
    });
  }
}

function renderSettingsTab(tab) {
  const cfg = appState.configUi || {};
  const value = (key, fallback = "") => escapeHtml(cfg[key] ?? fallback);
  const selected = (key, option) => String(cfg[key] ?? "") === option ? "selected" : "";
  const theme = root.dataset.theme === "light" ? "light" : "dark";
  const views = {
    operations: `
      <div class="settings-section"><h2>Vận hành</h2><p>Luồng xử lý, số bài mỗi nhóm, độ trễ, trình duyệt và chế độ chạy.</p><div class="form-grid">
      <div class="form-row"><label><b>Luồng xử lý</b><small>Luồng xử lý chính của bot</small></label><select data-field="workflow"><option value="full" ${selected("workflow", "full")}>Facebook → Lọc nhu cầu mua → AI → Sản phẩm → Comment</option></select></div>
      <div class="form-row"><label><b>Số bài mỗi nhóm</b><small>Số bài tối đa trong một lượt</small></label><input type="number" data-field="perGroup" value="${value("perGroup", 20)}"></div>
      <div class="form-row"><label><b>Delay sau comment</b><small>Giây, random 80–120%</small></label><input type="number" data-field="delay" value="${value("delay", 10)}"></div>
      <div class="form-row"><label><b>Chế độ chạy</b><small>Một lần hoặc lặp theo chu kỳ</small></label><select data-field="runMode"><option value="once" ${selected("runMode", "once")}>Chạy 1 lần rồi dừng</option><option value="cycle" ${selected("runMode", "cycle")}>Chạy lặp</option></select></div>
      <div class="form-row"><label><b>Trình duyệt mặc định</b><small>Trình duyệt dùng cho worker mới</small></label><select data-field="browserType"><option value="chrome" ${selected("browserType", "chrome")}>Google Chrome</option><option value="edge" ${selected("browserType", "edge")}>Microsoft Edge</option><option value="brave" ${selected("browserType", "brave")}>Brave</option><option value="firefox" ${selected("browserType", "firefox")}>Firefox</option></select></div></div><div class="setting-actions"><button class="btn primary" data-action="save-settings-tab" data-tab="operations">Lưu thay đổi</button></div></div>`,
    urls: `
      <div class="settings-section"><h2>URL</h2><p>Cấu hình ChatGPT, Shopee và Affiliate endpoint.</p><div class="form-grid">
      <div class="form-row"><label><b>ChatGPT URL</b><small>Trang AI dùng cho workflow</small></label><input data-field="chatgptUrl" value="${value("chatgptUrl", "https://chatgpt.com")}"></div>
      <div class="form-row"><label><b>Shopee URL</b><small>Trang tìm kiếm sản phẩm</small></label><input data-field="shopeeUrl" value="${value("shopeeUrl", "https://shopee.vn")}"></div>
      <div class="form-row"><label><b>Affiliate URL</b><small>Endpoint tạo link affiliate</small></label><input data-field="affUrl" value="${value("affUrl", "")}"></div></div><div class="setting-actions"><button class="btn primary" data-action="save-settings-tab" data-tab="urls">Lưu cấu hình</button></div></div>`,
    ai: `
      <div class="settings-section settings-section-ai"><h2>AI</h2><p>Nhà cung cấp AI, model, 9Router và kiểm tra kết nối.</p><div class="form-grid">
      <div class="form-row"><label><b>Nhà cung cấp</b><small>Nhà cung cấp AI</small></label><select data-field="aiProvider"><option value="auto" ${selected("aiProvider", "auto")}>Tự động</option><option value="openai" ${selected("aiProvider", "openai")}>OpenAI</option><option value="gemini" ${selected("aiProvider", "gemini")}>Gemini</option></select></div>
      <div class="form-row"><label><b>9Router URL</b><small>Base URL của 9Router, ví dụ https://domain.com</small></label><input data-field="routerUrl" value="${value("routerUrl", "")}"></div>
      <div class="form-row"><label><b>9Router Token</b><small>Token nếu endpoint yêu cầu</small></label><input type="password" data-field="routerToken" value="${value("routerToken", "")}"></div>
      <div class="form-row"><label><b>9Router Model</b><small>Model dùng cho /v1/chat/completions</small></label><input data-field="combo" value="${value("combo", "")}"></div>
      <div class="prompt-stack">
        <div class="prompt-editor">
          <div class="prompt-editor-head"><b>Prompt phân tích</b><small>Prompt hệ thống cho phân tích</small></div>
          <textarea data-field="analyzePrompt">${escapeHtml(cfg.analyzePrompt || "")}</textarea>
        </div>
        <div class="prompt-editor">
          <div class="prompt-editor-head"><b>Prompt comment</b><small>Prompt dùng để sinh comment từ tên sản phẩm và link affiliate</small></div>
          <textarea data-field="commentPrompt">${escapeHtml(cfg.commentPrompt || "")}</textarea>
        </div>
      </div></div><div class="setting-actions"><button class="btn info" data-action="test-ai">Test kết nối</button><button class="btn primary" data-action="save-settings-tab" data-tab="ai">Lưu cấu hình</button></div></div>`,
    telegram: `
      <div class="settings-section"><h2>Telegram</h2><p>Bot token, chat ID và các loại thông báo.</p><div class="form-grid">
      <div class="form-row"><label><b>Bot Token</b><small>Token từ BotFather</small></label><input type="password" data-field="tgToken" value="${value("tgToken", "")}"></div>
      <div class="form-row"><label><b>Chat ID</b><small>Nơi nhận bài và cảnh báo</small></label><input data-field="tgChatId" value="${value("tgChatId", "")}"></div>
      <div class="form-row"><label><b>Bật Telegram</b><small>Gửi kết quả và cảnh báo</small></label><select data-field="tgEnabled"><option value="true" ${String(cfg.tgEnabled) === "true" ? "selected" : ""}>Bật</option><option value="false" ${String(cfg.tgEnabled) !== "true" ? "selected" : ""}>Tắt</option></select></div></div><div class="setting-actions"><button class="btn info" data-action="test-telegram">Gửi tin test</button><button class="btn primary" data-action="save-settings-tab" data-tab="telegram">Lưu cấu hình</button></div></div>`,
    shortlink: `
      <div class="settings-section"><h2>Rút gọn link</h2><p>Chọn dịch vụ rút gọn link affiliate.</p><div class="form-grid">
      <div class="form-row"><label><b>Affiliate ID</b><small>Định danh affiliate hiện dùng</small></label><input data-field="affiliateId" value="${value("affiliateId", "")}"></div>
      <div class="form-row"><label><b>Tiny API Key</b><small>Nếu dịch vụ yêu cầu</small></label><input type="password" data-field="tinyApiKey" value="${value("tinyApiKey", "")}"></div>
      <div class="form-row"><label><b>Chờ giữa các request</b><small>Số giây nghỉ</small></label><input type="number" data-field="tinyccWaitSeconds" value="${value("tinyccWaitSeconds", 8)}"></div></div><div class="setting-actions"><button class="btn primary" data-action="save-settings-tab" data-tab="shortlink">Lưu cấu hình</button></div></div>`,
    appearance: `
      <div class="settings-section"><h2>Giao diện</h2><p>Tông màu, mật độ và sidebar.</p><div class="form-grid">
      <div class="form-row"><label><b>Tông màu</b><small>Sáng hoặc tối</small></label><select data-field="theme"><option value="dark" ${theme === "dark" ? "selected" : ""}>Tối</option><option value="light" ${theme === "light" ? "selected" : ""}>Sáng</option></select></div>
      <div class="form-row"><label><b>Mật độ</b><small>Bản static UI này đang dùng mật độ cố định</small></label><select disabled><option>Gọn / Thoải mái</option></select></div>
      <div class="form-row"><label><b>Điều hướng</b><small>Sidebar hiện hỗ trợ thu gọn tại client</small></label><select disabled><option>Sidebar cố định / thu gọn</option></select></div></div><div class="setting-actions"><button class="btn primary" data-action="save-settings-tab" data-tab="appearance">Áp dụng</button></div></div>`,
    data: `
      <div class="settings-section"><h2>Dữ liệu</h2><p>Xuất dữ liệu thật đang được backend lưu trong thư mục /data.</p><div class="form-grid">
      <div class="form-row"><label><b>Xuất toàn bộ dữ liệu</b><small>Nhóm, từ khóa, sản phẩm, lịch sử, runs, revenue data</small></label><button class="btn secondary" data-action="export-app-data">Xuất JSON</button></div>
      <div class="form-row"><label><b>Xuất sản phẩm</b><small>Ảnh chụp kho sản phẩm hiện tại</small></label><button class="btn secondary" data-action="export-products">Xuất sản phẩm</button></div>
      <div class="form-row"><label><b>Nhập sản phẩm</b><small>Mỗi dòng một keyword mới sẽ được lưu vào /data/app-state.json</small></label><button class="btn secondary" data-action="import-products-prompt">Nhập nhanh</button></div></div></div>`,
    update: `
      <div class="settings-section"><h2>Cập nhật</h2><p>Backend hiện chỉ scaffold phần release/update.</p><div class="form-grid">
      <div class="form-row"><label><b>Phiên bản hiện tại</b><small>Giao diện tĩnh đang nối với backend hiện tại</small></label><div>v2.6.0</div></div>
      <div class="form-row"><label><b>Kênh cập nhật</b><small>Server scaffold đang trả null cho update</small></label><select><option>Ổn định</option></select></div></div><div class="setting-actions"><button class="btn info" data-action="check-update">Kiểm tra cập nhật</button></div></div>`,
    license: `
      <div class="settings-section"><h2>Giấy phép & Hướng dẫn</h2><p>Server scaffold hiện chưa có license manager thật.</p><div class="form-grid">
      <div class="form-row"><label><b>Trạng thái</b><small>Backend hiện tại</small></label><div><span class="pill success-pill">Scaffold đang hoạt động</span></div></div>
      <div class="form-row"><label><b>License Key</b><small>Khóa mẫu</small></label><input value="FBCC-LOCAL-SCAFFOLD" disabled></div>
      <div class="form-row"><label><b>Hướng dẫn</b><small>Data thật đang được lưu ở thư mục /data</small></label><button class="btn secondary" data-action="show-data-path">Xem đường dẫn</button></div></div></div>`,
  };
  return views[tab] || views.operations;
}

function renderSettings() {
  const content = document.getElementById("settingsContent");
  const buttons = [...document.querySelectorAll("[data-settings]")];
  if (!content) return;
  buttons.forEach((button) => button.classList.toggle("active", button.dataset.settings === appState.ui.settingsTab));
  content.innerHTML = renderSettingsTab(appState.ui.settingsTab);
  hydrateCustomControls(content);
}

function renderPageData(name) {
  hydrateShell();
  switch (name) {
    case "overview":
      renderOverview();
      break;
    case "workers":
      renderWorkers();
      break;
    case "facebook-accounts":
      renderFacebookAccounts();
      break;
    case "groups":
      renderGroups();
      break;
    case "keywords":
      renderKeywords();
      break;
    case "products":
      renderProducts();
      break;
    case "pending":
      renderPending();
      break;
    case "processing":
      renderProcessing();
      break;
    case "history":
      renderHistory();
      break;
    case "runs":
      renderRuns();
      break;
    case "revenue":
      renderRevenue();
      break;
    case "group-performance":
      renderGroupPerformance();
      break;
    case "settings":
      renderSettings();
      break;
    default:
      break;
  }
  layoutTablePanelKpis(pageRoot.querySelector(".page"));
}

function renderTemplate(name) {
  const tpl = document.getElementById(templates[name] || templates.overview);
  if (!tpl) return;
  pageRoot.innerHTML = "";
  pageRoot.appendChild(tpl.content.cloneNode(true));
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.page === name));
  localStorage.setItem(STORAGE_KEYS.page, name);
}

async function renderPage(name) {
  const page = templates[name] && name !== "live" ? name : "overview";
  appState.page = page;
  appState.currentRenderId += 1;
  const renderId = appState.currentRenderId;
  renderTemplate(page);
  renderPageData(page);
  try {
    await ensurePageData(page);
    if (renderId !== appState.currentRenderId) return;
    renderPageData(page);
  } catch (error) {
    console.error("[fbcc] renderPage failed", page, error);
  }
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function promptMultiline(message, placeholder = "") {
  return showPrompt(message, {
    title: "Nhập dữ liệu",
    description: placeholder || "Mỗi dòng là một mục riêng.",
    multiline: true,
    value: "",
    confirmLabel: "Xác nhận",
    fieldLabel: message,
  });
}

async function refreshCurrentPage() {
  await renderPage(appState.page);
}

let dialogRoot = null;
let toastRoot = null;

function ensureDialogRoot() {
  if (dialogRoot && document.body.contains(dialogRoot)) return dialogRoot;
  dialogRoot = document.createElement("div");
  dialogRoot.className = "dialog-root";
  document.body.appendChild(dialogRoot);
  return dialogRoot;
}

function ensureToastRoot() {
  if (toastRoot && document.body.contains(toastRoot)) return toastRoot;
  toastRoot = document.createElement("div");
  toastRoot.className = "toast-root";
  document.body.appendChild(toastRoot);
  return toastRoot;
}

function showToast(message, options = {}) {
  const rootElement = ensureToastRoot();
  const tone = String(options.tone || "info").trim().toLowerCase();
  const toast = document.createElement("article");
  toast.className = `toast toast-${tone}`;
  toast.innerHTML = `
    <div class="toast-copy">
      ${options.title ? `<strong>${escapeHtml(options.title)}</strong>` : ""}
      <span>${escapeHtml(message)}</span>
    </div>
    <button type="button" class="toast-close" aria-label="Đóng thông báo">✕</button>
  `;
  const close = () => {
    toast.classList.remove("is-visible");
    window.setTimeout(() => toast.remove(), 220);
  };
  const timer = window.setTimeout(close, Math.max(1800, Number(options.duration || 3600)));
  toast.querySelector(".toast-close")?.addEventListener("click", () => {
    window.clearTimeout(timer);
    close();
  });
  rootElement.appendChild(toast);
  window.requestAnimationFrame(() => {
    toast.classList.add("is-visible");
  });
}

function resetCustomSelectMenu(shell) {
  if (!(shell instanceof HTMLElement)) return;
  const menu = shell.querySelector(".select-menu");
  if (!(menu instanceof HTMLElement)) return;
  menu.style.left = "";
  menu.style.top = "";
  menu.style.width = "";
  menu.style.maxHeight = "";
  delete menu.dataset.placement;
}

function positionCustomSelectMenu(shell) {
  if (!(shell instanceof HTMLElement) || !shell.classList.contains("open")) return;
  const button = shell.querySelector(".select-button");
  const menu = shell.querySelector(".select-menu");
  if (!(button instanceof HTMLElement) || !(menu instanceof HTMLElement)) return;

  const rect = button.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const margin = 16;
  const gap = 8;
  const desiredHeight = Math.min(Math.max(menu.scrollHeight || 0, 96), 260);
  const spaceBelow = viewportHeight - rect.bottom - margin - gap;
  const spaceAbove = rect.top - margin - gap;
  const openAbove = spaceBelow < Math.min(desiredHeight, 180) && spaceAbove > spaceBelow;
  const availableHeight = Math.max(96, openAbove ? spaceAbove : spaceBelow);
  const menuHeight = Math.min(desiredHeight, availableHeight);
  const left = Math.min(
    Math.max(margin, rect.left),
    Math.max(margin, viewportWidth - rect.width - margin),
  );
  const top = openAbove
    ? Math.max(margin, rect.top - gap - menuHeight)
    : Math.max(margin, rect.bottom + gap);

  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
  menu.style.width = `${Math.round(rect.width)}px`;
  menu.style.maxHeight = `${Math.round(menuHeight)}px`;
  menu.dataset.placement = openAbove ? "top" : "bottom";
}

function syncOpenCustomSelectMenus() {
  document.querySelectorAll(".select-shell.open").forEach((shell) => {
    positionCustomSelectMenu(shell);
  });
}

function closeCustomSelects(exceptShell = null) {
  document.querySelectorAll(".select-shell.open").forEach((shell) => {
    if (exceptShell && shell === exceptShell) return;
    shell.classList.remove("open");
    resetCustomSelectMenu(shell);
  });
}

function buildCustomSelect(select) {
  if (!(select instanceof HTMLSelectElement) || select.closest(".select-shell")) return;
  const parent = select.parentNode;
  if (!parent) return;
  const shell = document.createElement("div");
  shell.className = `select-shell${select.disabled ? " is-disabled" : ""}`;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "select-button";
  button.dataset.selectToggle = "1";
  button.disabled = select.disabled;
  const value = document.createElement("span");
  value.className = "select-value";
  const caret = document.createElement("span");
  caret.className = "select-caret";
  const menu = document.createElement("div");
  menu.className = "select-menu";
  menu.dataset.selectMenu = "1";

  const sync = () => {
    const selectedOption = select.options[select.selectedIndex] || select.options[0];
    value.textContent = selectedOption?.textContent?.trim() || "Chọn giá trị";
    menu.innerHTML = "";
    [...select.options].forEach((option) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `select-option${option.value === select.value ? " active" : ""}`;
      item.dataset.selectOption = option.value;
      item.textContent = option.textContent || option.value;
      item.disabled = option.disabled;
      menu.appendChild(item);
    });
  };

  sync();
  select.addEventListener("change", sync);

  parent.insertBefore(shell, select);
  shell.append(select, button, caret, menu);
  button.appendChild(value);
}

function hydrateCustomControls(scope = document) {
  scope.querySelectorAll("select").forEach(buildCustomSelect);
}

function dialogFieldMarkup(field) {
  if (field.type === "note") {
    return `<div class="dialog-note">${escapeHtml(field.value || "")}</div>`;
  }
  const fieldClass = ["dialog-field", field.className || ""].filter(Boolean).join(" ");
  const header = (field.label || field.description)
    ? `<div class="dialog-field-head">${field.label ? `<label for="dialog-field-${escapeHtml(field.name)}">${escapeHtml(field.label)}</label>` : ""}${field.description ? `<span class="dialog-field-help">${escapeHtml(field.description)}</span>` : ""}</div>`
    : "";
  if (field.type === "textarea") {
    return `<div class="${fieldClass}">${header}<textarea id="dialog-field-${escapeHtml(field.name)}" data-dialog-field="${escapeHtml(field.name)}" placeholder="${escapeHtml(field.placeholder || "")}">${escapeHtml(field.value || "")}</textarea></div>`;
  }
  if (field.type === "select") {
    const options = (field.options || []).map((option) => `<option value="${escapeHtml(option.value)}"${String(option.value) === String(field.value ?? "") ? " selected" : ""}${option.disabled ? " disabled" : ""}>${escapeHtml(option.label)}</option>`).join("");
    return `<div class="${fieldClass}">${header}<select id="dialog-field-${escapeHtml(field.name)}" data-dialog-field="${escapeHtml(field.name)}"${field.disabled ? " disabled" : ""}>${options}</select></div>`;
  }
  if (field.type === "group-table") {
    const selected = new Set(normalizeIdList(field.value));
    const typeOptions = [
      { value: "all", label: "Tất cả loại nhóm" },
      ...Array.from(new Map(
        (field.options || [])
          .map((option) => [String(option.groupTypeId || ""), option.groupTypeLabel || "Chưa phân loại"]),
      ).entries())
        .filter(([value]) => value)
        .map(([value, label]) => ({ value, label })),
    ];
    const rows = (field.options || []).map((option, index) => {
      const checked = selected.has(String(option.value));
      const groupTypeId = String(option.groupTypeId || "");
      const groupTypeText = option.groupTypeLabel || "Chưa phân loại";
      return `<div class="dialog-group-row" data-group-name="${escapeHtml(option.label || option.value)}" data-group-url="${escapeHtml(option.url || "")}" data-group-type-id="${escapeHtml(groupTypeId)}" data-group-type-label="${escapeHtml(groupTypeText)}">
        <span><input id="dialog-field-${escapeHtml(field.name)}-${index}" type="checkbox" data-dialog-field="${escapeHtml(field.name)}" value="${escapeHtml(option.value)}"${checked ? " checked" : ""}></span>
        <span class="dialog-group-name">${option.url ? `<a class="dialog-group-link" href="${escapeHtml(option.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(option.label || option.value)}</a>` : escapeHtml(option.label || option.value)}</span>
        <span class="dialog-group-type">${escapeHtml(groupTypeText)}</span>
        <span class="dialog-group-workers" title="${escapeHtml(option.workersTitle || option.workersText || "Chưa có worker")}">${escapeHtml(option.workersText || "Chưa có worker")}</span>
      </div>`;
    }).join("");
    const emptyDefault = field.emptyText || "Chưa có dữ liệu.";
    return `<div class="${fieldClass} dialog-field-group-table" data-dialog-group-table="${escapeHtml(field.name)}">
      <div class="dialog-group-head">
        ${field.label ? `<div class="dialog-field-title">${escapeHtml(field.label)}</div>` : "<div></div>"}
        <div class="dialog-group-filter">
          <select data-dialog-group-type-filter="${escapeHtml(field.name)}">
          ${typeOptions.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="dialog-group-table">
        <div class="dialog-group-table-head"><span><label class="table-check-label" for="dialog-group-select-all-${escapeHtml(field.name)}"><input id="dialog-group-select-all-${escapeHtml(field.name)}" type="checkbox" data-dialog-group-select-all="${escapeHtml(field.name)}"><span></span></label></span><span>Tên nhóm</span><span>Loại nhóm</span><span>Workers</span></div>
        <div class="dialog-group-table-body">
          ${rows}
          <div class="dialog-checklist-empty dialog-group-table-empty-state"${rows ? " hidden" : ""} data-empty-default="${escapeHtml(emptyDefault)}" data-empty-filtered="Không có nhóm phù hợp bộ lọc.">${escapeHtml(emptyDefault)}</div>
        </div>
      </div>
    </div>`;
  }
  if (field.type === "checklist") {
    const options = (field.options || []).map((option, index) => {
      const checked = normalizeIdList(field.value).includes(String(option.value));
      return `<label class="dialog-check-option" for="dialog-field-${escapeHtml(field.name)}-${index}">
        <input id="dialog-field-${escapeHtml(field.name)}-${index}" type="checkbox" data-dialog-field="${escapeHtml(field.name)}" value="${escapeHtml(option.value)}"${checked ? " checked" : ""}>
        <span><b>${escapeHtml(option.label || option.value)}</b><small>${escapeHtml(option.description || "")}</small></span>
      </label>`;
    }).join("");
    return `<div class="dialog-field dialog-field-checklist">${field.label ? `<div class="dialog-field-title">${escapeHtml(field.label)}</div>` : ""}<div class="dialog-checklist">${options || `<div class="dialog-checklist-empty">${escapeHtml(field.emptyText || "Chưa có dữ liệu.")}</div>`}</div></div>`;
  }
  return `<div class="${fieldClass}">${header}<input id="dialog-field-${escapeHtml(field.name)}" type="${escapeHtml(field.type || "text")}" data-dialog-field="${escapeHtml(field.name)}" placeholder="${escapeHtml(field.placeholder || "")}" value="${escapeHtml(field.value || "")}"${field.readonly ? " readonly" : ""}${field.disabled ? " disabled" : ""}></div>`;
}

function applyDialogGroupTableFilters(tableRoot) {
  if (!(tableRoot instanceof HTMLElement)) return;
  const rows = [...tableRoot.querySelectorAll(".dialog-group-row")];
  const typeSelect = tableRoot.querySelector("[data-dialog-group-type-filter]");
  const emptyState = tableRoot.querySelector(".dialog-group-table-empty-state");
  const typeFilter = String(typeSelect?.value || "all").trim();
  const typeFilterLabel = typeSelect instanceof HTMLSelectElement
    ? String(typeSelect.options[typeSelect.selectedIndex]?.textContent || "").trim()
    : "";
  const normalizedFilterValue = foldSearchText(typeFilter);
  const normalizedFilterLabel = foldSearchText(typeFilterLabel);
  let visibleCount = 0;
  rows.forEach((row) => {
    const rowTypeId = String(row.dataset.groupTypeId || "").trim();
    const rowTypeLabel = String(row.dataset.groupTypeLabel || "").trim();
    const matchesType = typeFilter === "all"
      || rowTypeId === typeFilter
      || (normalizedFilterValue && foldSearchText(rowTypeId) === normalizedFilterValue)
      || (normalizedFilterValue && foldSearchText(rowTypeLabel) === normalizedFilterValue)
      || (normalizedFilterLabel && foldSearchText(rowTypeLabel) === normalizedFilterLabel);
    const visible = matchesType;
    row.hidden = !visible;
    row.style.display = visible ? "" : "none";
    if (visible) visibleCount += 1;
  });
  if (emptyState instanceof HTMLElement) {
    const defaultMessage = emptyState.dataset.emptyDefault || "Chưa có dữ liệu.";
    const filteredMessage = emptyState.dataset.emptyFiltered || "Không có dữ liệu phù hợp.";
    emptyState.hidden = rows.length > 0 && visibleCount > 0;
    emptyState.textContent = rows.length ? filteredMessage : defaultMessage;
  }
  syncDialogGroupSelectAll(tableRoot);
}

function syncDialogGroupSelectAll(tableRoot) {
  if (!(tableRoot instanceof HTMLElement)) return;
  const selectAll = tableRoot.querySelector("[data-dialog-group-select-all]");
  if (!(selectAll instanceof HTMLInputElement)) return;
  const visibleCheckboxes = [...tableRoot.querySelectorAll('.dialog-group-row:not([hidden]) input[data-dialog-field][type="checkbox"]')]
    .filter((field) => field instanceof HTMLInputElement);
  if (!visibleCheckboxes.length) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
    selectAll.disabled = true;
    return;
  }
  const checkedCount = visibleCheckboxes.filter((field) => field.checked).length;
  selectAll.disabled = false;
  selectAll.checked = checkedCount > 0 && checkedCount === visibleCheckboxes.length;
  selectAll.indeterminate = checkedCount > 0 && checkedCount < visibleCheckboxes.length;
}

function hydrateDialogGroupTables(scope = document) {
  scope.querySelectorAll("[data-dialog-group-table]").forEach((tableRoot) => {
    if (!(tableRoot instanceof HTMLElement) || tableRoot.dataset.groupTableHydrated === "1") return;
    tableRoot.querySelector("[data-dialog-group-type-filter]")?.addEventListener("change", () => applyDialogGroupTableFilters(tableRoot));
    tableRoot.querySelector("[data-dialog-group-select-all]")?.addEventListener("change", (event) => {
      const target = event.currentTarget;
      if (!(target instanceof HTMLInputElement)) return;
      [...tableRoot.querySelectorAll('.dialog-group-row:not([hidden]) input[data-dialog-field][type="checkbox"]')].forEach((field) => {
        if (field instanceof HTMLInputElement) field.checked = target.checked;
      });
      syncDialogGroupSelectAll(tableRoot);
    });
    tableRoot.querySelectorAll('.dialog-group-row input[data-dialog-field][type="checkbox"]').forEach((field) => {
      field.addEventListener("change", () => syncDialogGroupSelectAll(tableRoot));
    });
    tableRoot.dataset.groupTableHydrated = "1";
    applyDialogGroupTableFilters(tableRoot);
  });
}

function readDialogValues(rootElement) {
  const values = {};
  const checkboxBuckets = new Map();
  rootElement.querySelectorAll('[data-dialog-field][type="checkbox"]').forEach((field) => {
    const name = field.dataset.dialogField;
    if (!checkboxBuckets.has(name)) checkboxBuckets.set(name, []);
    if (field.checked) checkboxBuckets.get(name).push(field.value);
  });
  checkboxBuckets.forEach((rows, name) => {
    values[name] = rows;
  });
  rootElement.querySelectorAll("[data-dialog-field]").forEach((field) => {
    if (field.type === "checkbox") return;
    let value = field.value;
    if (field.type === "number") value = Number(value || 0);
    values[field.dataset.dialogField] = value;
  });
  return values;
}

function openDialog(config = {}) {
  const rootElement = ensureDialogRoot();
  const fields = Array.isArray(config.fields) ? config.fields : [];
  const title = config.title || "Thông báo";
  const message = config.message || "";
  const confirmLabel = config.confirmLabel || "Xác nhận";
  const cancelLabel = config.cancelLabel || "Hủy";
  const confirmClass = config.confirmClass || "primary";
  return new Promise((resolve) => {
    const close = (payload) => {
      document.removeEventListener("keydown", handleKeydown);
      rootElement.classList.remove("active");
      rootElement.innerHTML = "";
      resolve(payload);
    };

    const handleKeydown = (event) => {
      if (event.key === "Escape" && !config.hideCancel) {
        event.preventDefault();
        close(null);
      }
    };

    rootElement.classList.add("active");
    rootElement.innerHTML = `
      <div class="dialog-backdrop"></div>
      <div class="dialog-wrap">
        <div class="dialog-card ${escapeHtml(config.cardClass || "")}" role="dialog" aria-modal="true" aria-labelledby="dialogTitle">
          <div class="dialog-head">
            <span class="dialog-kicker">${escapeHtml(config.kicker || "Control Center")}</span>
            <h2 id="dialogTitle">${escapeHtml(title)}</h2>
            ${message ? `<p>${escapeHtml(message)}</p>` : ""}
          </div>
          <div class="dialog-body">
            ${fields.map(dialogFieldMarkup).join("")}
          </div>
          <div class="dialog-actions">
            ${config.hideCancel ? "" : `<button type="button" class="btn secondary" data-dialog-cancel>${escapeHtml(cancelLabel)}</button>`}
            <button type="button" class="btn ${escapeHtml(confirmClass)}" data-dialog-confirm>${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      </div>
    `;

    const card = rootElement.querySelector(".dialog-card");
    const confirmButton = rootElement.querySelector("[data-dialog-confirm]");
    const cancelButton = rootElement.querySelector("[data-dialog-cancel]");

    document.addEventListener("keydown", handleKeydown);
    hydrateCustomControls(rootElement);
    hydrateDialogGroupTables(rootElement);

    rootElement.querySelector(".dialog-backdrop").addEventListener("click", () => {
      if (!config.hideCancel) close(null);
    });
    cancelButton?.addEventListener("click", () => close(null));
    confirmButton?.addEventListener("click", () => close(readDialogValues(card)));

    const firstField = rootElement.querySelector("[data-dialog-field], [data-dialog-confirm]");
    if (firstField) {
      window.requestAnimationFrame(() => firstField.focus());
    }
  });
}

async function showPrompt(label, options = {}) {
  const result = await openDialog({
    kicker: options.kicker || "Nhập liệu",
    title: options.title || label,
    message: options.description || "",
    confirmLabel: options.confirmLabel || "Xác nhận",
    cancelLabel: options.cancelLabel || "Hủy",
    fields: [
      {
        name: "value",
        label: options.fieldLabel || label,
        type: options.multiline ? "textarea" : (options.type || "text"),
        value: options.value || "",
        placeholder: options.placeholder || "",
      },
    ],
  });
  if (!result) return "";
  return String(result.value || "").trim();
}

async function showAlert(message, options = {}) {
  await openDialog({
    kicker: options.kicker || "Thông báo",
    title: options.title || "Thông báo",
    message: options.description || "",
    confirmLabel: options.confirmLabel || "Đóng",
    hideCancel: true,
    confirmClass: options.confirmClass || "primary",
    fields: [
      {
        type: "note",
        value: message,
      },
    ],
  });
}

async function showConfirm(message, options = {}) {
  const result = await openDialog({
    kicker: options.kicker || "Xác nhận",
    title: options.title || "Xác nhận thao tác",
    message: options.description || "",
    confirmLabel: options.confirmLabel || "Xác nhận",
    cancelLabel: options.cancelLabel || "Hủy",
    confirmClass: options.confirmClass || "danger",
    fields: [
      {
        type: "note",
        value: message,
      },
    ],
  });
  return !!result;
}

const INSTANT_ACTIONS = new Set([
  "toggle-group-select",
  "set-groups-filter",
  "set-keywords-filter",
  "set-products-filter",
  "set-pending-filter",
  "set-history-filter",
  "set-runs-filter",
  "set-performance-filter",
  "show-data-path",
]);

function loadingLabelForAction(action, button) {
  const key = String(action || "").toLowerCase();
  if (key.includes("connect")) return "Đang kết nối...";
  if (key.includes("close") || key.includes("disconnect")) return "Đang ngắt...";
  if (key.includes("start")) return "Đang khởi chạy...";
  if (key.includes("pause")) return "Đang tạm dừng...";
  if (key.includes("resume")) return "Đang tiếp tục...";
  if (key.includes("stop")) return "Đang dừng...";
  if (key.includes("refresh")) return "Đang làm mới...";
  if (key.includes("save")) return "Đang lưu...";
  if (key.includes("edit") || key.includes("update")) return "Đang cập nhật...";
  if (key.includes("generate")) return "Đang lấy comment...";
  if (key.includes("export")) return "Đang xuất...";
  if (key.includes("import")) return "Đang nhập...";
  if (key.includes("delete") || key.includes("remove")) return "Đang xóa...";
  if (key.includes("check")) return "Đang kiểm tra...";
  if (key.includes("test")) return "Đang kiểm tra...";
  if (key.includes("process") || key.includes("promote")) return "Đang xử lý...";
  if (key.includes("add") || key.includes("create")) return "Đang thêm...";
  return button?.dataset.loadingLabel || "Đang xử lý...";
}

function setButtonLoading(button, action, busy) {
  if (!(button instanceof HTMLButtonElement)) return;
  if (busy) {
    if (button.classList.contains("is-loading")) return;
    const iconOnly = button.classList.contains("btn-icon-only");
    button.dataset.loadingHtml = button.innerHTML;
    button.dataset.loadingMinWidth = `${Math.ceil(button.getBoundingClientRect().width)}px`;
    button.style.minWidth = button.dataset.loadingMinWidth;
    button.disabled = true;
    button.classList.add("is-loading");
    button.setAttribute("aria-busy", "true");
    button.innerHTML = iconOnly
      ? `<span class="btn-spinner" aria-hidden="true"></span>`
      : `<span class="btn-spinner" aria-hidden="true"></span><span class="btn-label">${escapeHtml(loadingLabelForAction(action, button))}</span>`;
    return;
  }
  if (button.dataset.loadingHtml !== undefined) {
    button.innerHTML = button.dataset.loadingHtml;
  }
  button.disabled = false;
  button.classList.remove("is-loading");
  button.removeAttribute("aria-busy");
  button.style.minWidth = "";
  delete button.dataset.loadingHtml;
  delete button.dataset.loadingMinWidth;
}

const SETTINGS_TAB_TITLES = {
  operations: "vận hành",
  urls: "URL",
  ai: "AI",
  telegram: "Telegram",
  shortlink: "rút gọn link",
  appearance: "giao diện",
};

function showActionSuccessToast(action, target, extra = {}) {
  const key = String(action || "").trim().toLowerCase();
  let message = "";
  if (key === "create-worker") message = "Đã tạo worker mới.";
  else if (key === "worker-edit") message = "Đã cập nhật worker.";
  else if (key === "create-facebook-account") message = "Đã thêm tài khoản Facebook.";
  else if (key === "edit-facebook-account") message = "Đã cập nhật tài khoản Facebook.";
  else if (key === "add-group") message = "Đã thêm nhóm Facebook.";
  else if (key === "edit-group") message = "Đã cập nhật nhóm Facebook.";
  else if (key === "add-keyword") message = "Đã thêm từ khóa mua hàng.";
  else if (key === "edit-keyword") message = "Đã cập nhật từ khóa mua hàng.";
  else if (key === "add-product") message = "Đã thêm sản phẩm vào kho.";
  else if (key === "add-pending-product") message = "Đã thêm sản phẩm chờ xử lý.";
  else if (key === "edit-product") message = "Đã cập nhật sản phẩm.";
  else if (key === "save-settings-tab") {
    const tab = String(extra.tab || target?.dataset?.tab || appState.ui.settingsTab || "").trim().toLowerCase();
    const label = SETTINGS_TAB_TITLES[tab] || "cấu hình";
    message = `Đã lưu ${label}.`;
  }
  if (!message) return;
  showToast(message, {
    title: "Thao tác thành công",
    tone: "success",
    duration: 2600,
  });
}

async function runButtonAction(button, action, task) {
  if (!(button instanceof HTMLButtonElement) || INSTANT_ACTIONS.has(action)) {
    return task();
  }
  if (button.disabled || button.classList.contains("is-loading")) return undefined;
  setButtonLoading(button, action, true);
  try {
    return await task();
  } finally {
    setButtonLoading(button, action, false);
  }
}

async function handleAction(action, target) {
  try {
    if (action === "connect-browser") {
      const response = await api.call("connectBrowser");
      if (response.data?.sessionRestore?.accountExpired) {
        showToast(response.data.sessionRestore.message || "Cookie Facebook đã hết hạn và browser đã được ngắt.", {
          tone: "warning",
        });
      }
      return refreshCurrentPage();
    }
    if (action === "close-browser") {
      await api.call("closeDriver");
      return refreshCurrentPage();
    }
    if (action === "start-bot") {
      await api.call("startBot");
      return refreshCurrentPage();
    }
    if (action === "pause-bot") {
      await api.call("pauseBot");
      return refreshCurrentPage();
    }
    if (action === "resume-bot") {
      await api.call("resumeBot");
      return refreshCurrentPage();
    }
    if (action === "refresh-workers") {
      await loadWorkers();
      return renderWorkers();
    }
    if (action === "create-worker") {
      const payload = await showWorkerEditor();
      if (!payload?.name) return;
      await api.call("createWorker", {
        name: payload.name,
        browserType: payload.browserType || appState.configUi.browserType || "chrome",
        profileMode: "dedicated",
        edgePort: payload.edgePort,
        facebookAccountId: payload.facebookAccountId || "",
        groupIds: payload.groupIds || [],
      });
      showActionSuccessToast(action, target);
      return refreshCurrentPage();
    }
    if (action === "worker-edit") {
      const workerId = String(target.dataset.workerId || "");
      const worker = appState.workers.find((item) => item.id === workerId);
      if (!worker) return;
      const payload = await showWorkerEditor(worker);
      if (!payload?.name) return;
      await api.call("updateWorker", {
        id: workerId,
        name: payload.name,
        browserType: payload.browserType || worker.browserType || "chrome",
        edgePort: payload.edgePort,
        facebookAccountId: payload.facebookAccountId || "",
        groupIds: payload.groupIds || [],
      });
      showActionSuccessToast(action, target);
      return refreshCurrentPage();
    }
    if (action === "worker-delete") {
      const workerId = String(target.dataset.workerId || "");
      const worker = appState.workers.find((item) => item.id === workerId);
      if (!worker) return;
      const confirmed = await showConfirm(`Xóa worker "${worker.name}"?`, {
        title: "Xóa worker",
        description: "Worker sẽ bị dừng nếu đang chạy và cấu hình gán nhóm/tài khoản của worker này sẽ bị gỡ.",
        confirmLabel: "Xóa worker",
      });
      if (!confirmed) return;
      await api.call("deleteWorker", { id: workerId });
      return refreshCurrentPage();
    }
    if (action === "refresh-facebook-accounts") {
      await loadFacebookAccounts();
      return renderFacebookAccounts();
    }
    if (action === "create-facebook-account") {
      const payload = await showFacebookAccountEditor();
      if (!payload?.name) return;
      await api.call("createFacebookAccount", payload);
      showActionSuccessToast(action, target);
      return refreshCurrentPage();
    }
    if (action === "edit-facebook-account") {
      const accountId = String(target.dataset.facebookAccountId || "");
      const account = appState.facebookAccounts.find((item) => item.id === accountId);
      if (!account) return;
      const payload = await showFacebookAccountEditor(account);
      if (!payload?.name) return;
      await api.call("updateFacebookAccount", {
        id: accountId,
        ...payload,
      });
      showActionSuccessToast(action, target);
      return refreshCurrentPage();
    }
    if (action === "delete-facebook-account") {
      const accountId = String(target.dataset.facebookAccountId || "");
      const account = appState.facebookAccounts.find((item) => item.id === accountId);
      if (!account) return;
      const confirmed = await showConfirm(`Xóa tài khoản Facebook "${account.name}"?`, {
        title: "Xóa tài khoản Facebook",
        description: "Cookie của tài khoản này sẽ bị gỡ khỏi danh sách quản lý.",
        confirmLabel: "Xóa tài khoản",
      });
      if (!confirmed) return;
      await api.call("deleteFacebookAccount", { id: accountId });
      appState.ui.selectedFacebookAccounts.delete(accountId);
      return refreshCurrentPage();
    }
    if (action === "delete-selected-facebook-accounts") {
      const selectedIds = [...appState.ui.selectedFacebookAccounts];
      if (!selectedIds.length) return;
      const confirmed = await showConfirm(`Xóa ${selectedIds.length} tài khoản Facebook đã chọn?`, {
        title: "Xóa tài khoản Facebook",
        description: "Chỉ các tài khoản chưa gắn worker mới xóa được.",
        confirmLabel: "Xóa đã chọn",
      });
      if (!confirmed) return;
      for (const id of selectedIds) {
        await api.call("deleteFacebookAccount", { id });
      }
      appState.ui.selectedFacebookAccounts.clear();
      return refreshCurrentPage();
    }
    if (action === "worker-monitor") {
      const workerId = String(target.dataset.workerId || "");
      const worker = appState.workers.find((item) => item.id === workerId);
      if (!worker) return;
      openWorkerMonitorDialog(worker);
      return;
    }
    if (action === "worker-connect-browser") {
      const response = await api.call("connectWorkerBrowser", { id: target.dataset.workerId });
      if (response.data?.info?.sessionRestore?.accountExpired) {
        showToast(response.data.info.sessionRestore.message || "Cookie Facebook đã hết hạn và browser đã được ngắt.", {
          tone: "warning",
        });
      }
      return refreshCurrentPage();
    }
    if (action === "worker-close-browser") {
      await api.call("closeWorkerBrowser", { id: target.dataset.workerId });
      return refreshCurrentPage();
    }
    if (action === "worker-start") {
      await api.call("startWorkerBot", { id: target.dataset.workerId });
      return refreshCurrentPage();
    }
    if (action === "worker-pause") {
      await api.call("pauseWorkerBot", { id: target.dataset.workerId });
      return refreshCurrentPage();
    }
    if (action === "worker-resume") {
      await api.call("resumeWorkerBot", { id: target.dataset.workerId });
      return refreshCurrentPage();
    }
    if (action === "worker-stop") {
      await api.call("stopWorkerBot", { id: target.dataset.workerId });
      return refreshCurrentPage();
    }
    if (action === "export-groups") {
      const response = await api.call("exportGroupsTxt");
      downloadText("facebook-groups.txt", response.data?.text || "");
      return;
    }
    if (action === "import-groups") {
      const raw = await promptMultiline("Nhập danh sách group, mỗi dòng một URL");
      if (!raw.trim()) return;
      await api.call("bulkImportGroups", raw);
      return refreshCurrentPage();
    }
    if (action === "add-group") {
      const payload = await showGroupEditor();
      if (!payload?.url) return;
      await api.call("addGroup", payload);
      showActionSuccessToast(action, target);
      return refreshCurrentPage();
    }
    if (action === "manage-group-types") {
      openGroupTypesManagerDialog();
      return;
    }
    if (action === "edit-group") {
      const groupId = String(target.dataset.groupId || "");
      const group = appState.groups.find((item) => String(item.id) === groupId);
      if (!group) return;
      const payload = await showGroupEditor(group);
      if (!payload?.url) return;
      await api.call("updateGroup", {
        id: groupId,
        name: payload.name,
        url: payload.url,
        groupTypeId: payload.groupTypeId,
      });
      showActionSuccessToast(action, target);
      return refreshCurrentPage();
    }
    if (action === "toggle-group-paused") {
      const group = appState.groups.find((item) => String(item.id) === String(target.dataset.groupId || ""));
      if (!group?.url) throw new Error("Không tìm thấy nhóm để cập nhật trạng thái.");
      await api.call("toggleGroupPaused", { url: group.url, paused: !group.paused });
      return refreshCurrentPage();
    }
    if (action === "enable-selected-groups") {
      const selected = [...appState.ui.selectedGroups];
      if (!selected.length) return;
      const selectedSet = new Set(selected);
      const next = appState.groups.map((item) => (
        selectedSet.has(String(item.id)) ? { ...item, enabled: true, paused: false } : item
      ));
      await api.call("saveGroups", next);
      appState.ui.selectedGroups.clear();
      return refreshCurrentPage();
    }
    if (action === "pause-selected-groups") {
      for (const id of appState.ui.selectedGroups) {
        const group = appState.groups.find((item) => String(item.id) === String(id));
        if (!group?.url) continue;
        await api.call("toggleGroupPaused", { url: group.url, paused: true });
      }
      appState.ui.selectedGroups.clear();
      return refreshCurrentPage();
    }
    if (action === "set-selected-action") {
      const nextActionResult = await openDialog({
        kicker: "Cập nhật",
        title: "Đổi action cho nhóm",
        message: "Chọn action áp dụng cho các nhóm đang được chọn.",
        confirmLabel: "Áp dụng",
        fields: [
          {
            name: "value",
            label: "Action",
            type: "select",
            value: "comment",
            options: [
              { value: "comment", label: "Comment" },
              { value: "telegram", label: "Telegram" },
            ],
          },
        ],
      });
      const nextAction = nextActionResult?.value || "";
      if (!nextAction) return;
      for (const id of appState.ui.selectedGroups) {
        await api.call("setGroupAction", { id: Number(id), action: nextAction.trim().toLowerCase() });
      }
      return refreshCurrentPage();
    }
    if (action === "delete-selected-groups") {
      const confirmed = await showConfirm(`Xóa ${appState.ui.selectedGroups.size} nhóm đã chọn?`, {
        title: "Xóa nhóm Facebook",
        description: "Thao tác này sẽ gỡ các nhóm khỏi danh sách crawl hiện tại.",
        confirmLabel: "Xóa nhóm",
      });
      if (!confirmed) return;
      for (const id of appState.ui.selectedGroups) {
        const group = appState.groups.find((item) => String(item.id) === String(id));
        if (!group?.url) continue;
        await api.call("deleteGroup", { url: group.url });
      }
      appState.ui.selectedGroups.clear();
      return refreshCurrentPage();
    }
    if (action === "set-groups-filter") {
      appState.ui.groupsFilter = target.dataset.filter || "all";
      resetTablePage("groups");
      return renderGroups();
    }
    if (action === "import-keywords") {
      const raw = await promptMultiline("Nhập từ khóa, mỗi dòng một keyword");
      if (!raw.trim()) return;
      const merged = [...new Set([...appState.keywords, ...raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)])];
      await api.call("saveBuyerIntentKeywords", { keywords: merged });
      return refreshCurrentPage();
    }
    if (action === "add-keyword") {
      const keyword = await showPrompt("Nhập từ khóa", {
        title: "Thêm từ khóa mua hàng",
        description: "Từ khóa sẽ được đưa vào danh sách lọc hiện tại.",
        confirmLabel: "Thêm từ khóa",
      });
      if (!keyword) return;
      const merged = [...new Set([...appState.keywords, keyword.trim()])];
      await api.call("saveBuyerIntentKeywords", { keywords: merged });
      showActionSuccessToast(action, target);
      return refreshCurrentPage();
    }
    if (action === "edit-keyword") {
      const keyword = String(target.dataset.keyword || "").trim();
      if (!keyword) return;
      const nextKeyword = await showPrompt("Nhập từ khóa", {
        title: "Sửa từ khóa mua hàng",
        description: "Cập nhật nội dung từ khóa hiện tại.",
        confirmLabel: "Lưu từ khóa",
        value: keyword,
      });
      if (!nextKeyword) return;
      const normalizedKeyword = nextKeyword.trim();
      const next = appState.keywords.map((item) => (item === keyword ? normalizedKeyword : item));
      await api.call("saveBuyerIntentKeywords", { keywords: [...new Set(next)] });
      showActionSuccessToast(action, target);
      return refreshCurrentPage();
    }
    if (action === "remove-keyword") {
      const keyword = target.dataset.keyword || "";
      const next = appState.keywords.filter((item) => item !== keyword);
      await api.call("saveBuyerIntentKeywords", { keywords: next });
      return refreshCurrentPage();
    }
    if (action === "set-keywords-filter") {
      appState.ui.keywordsFilter = target.dataset.filter || "all";
      resetTablePage("keywords");
      return renderKeywords();
    }
    if (action === "process-backlog") {
      await api.call("processBacklog");
      return refreshCurrentPage();
    }
    if (action === "import-products") {
      const raw = await promptMultiline("Nhập keyword sản phẩm, mỗi dòng một keyword");
      if (!raw.trim()) return;
      await api.call("importProducts", raw);
      return refreshCurrentPage();
    }
    if (action === "import-products-prompt") {
      const raw = await promptMultiline("Nhập keyword sản phẩm để thêm vào /data/app-state.json");
      if (!raw.trim()) return;
      await api.call("importProducts", raw);
      return refreshCurrentPage();
    }
    if (action === "manage-product-types") {
      openProductTypesManagerDialog();
      return;
    }
    if (action === "add-product" || action === "add-pending-product") {
      const payload = await showProductEditor();
      if (!payload?.name) return;
      const response = await api.call("addProduct", {
        ...payload,
        comments: [],
        status: action === "add-product" ? "ready" : "pending",
      });
      const savedProductId = String(response.data?.product?.id || "");
      let autoCommentError = null;
      if (savedProductId && payload.affiliateLinks?.length) {
        try {
          await refreshProductCommentsAfterSave(savedProductId, payload.name);
        } catch (error) {
          autoCommentError = error;
        }
      }
      showActionSuccessToast(action, target);
      if (autoCommentError) {
        showToast(`Đã lưu sản phẩm nhưng chưa thể tự động lấy comment. ${autoCommentError.message}`, {
          title: "Kho sản phẩm",
          tone: "warning",
        });
      }
      return refreshCurrentPage();
    }
    if (action === "edit-product") {
      const productId = String(target.dataset.productId || "");
      const product = appState.products.map(normalizeProduct).find((item) => String(item.id) === productId);
      if (!product) return;
      const payload = await showProductEditor(product);
      if (!payload?.name) return;
      await api.call("updateProduct", {
        id: productId,
        ...payload,
        comments: [],
      });
      let autoCommentError = null;
      if (payload.affiliateLinks?.length) {
        try {
          await refreshProductCommentsAfterSave(productId, payload.name);
        } catch (error) {
          autoCommentError = error;
        }
      }
      showActionSuccessToast(action, target);
      if (autoCommentError) {
        showToast(`Đã cập nhật sản phẩm nhưng chưa thể tự động lấy comment. ${autoCommentError.message}`, {
          title: "Kho sản phẩm",
          tone: "warning",
        });
      }
      return refreshCurrentPage();
    }
    if (action === "generate-product-comments") {
      const productId = String(target.dataset.productId || "");
      const product = appState.products.map(normalizeProduct).find((item) => String(item.id) === productId);
      if (!product) return;
      const response = await api.call("generateProductComments", { id: productId });
      const comments = Array.isArray(response.data?.product?.comments) ? response.data.product.comments : [];
      showToast(
        comments.length
          ? `Đã sinh ${comments.length} comment cho ${product.name}.`
          : `Đã lấy comment tự động cho ${product.name}.`,
        {
          title: "Kho sản phẩm",
          tone: "success",
        },
      );
      return refreshCurrentPage();
    }
    if (action === "delete-product") {
      const productId = String(target.dataset.productId || "");
      const product = appState.products.map(normalizeProduct).find((item) => String(item.id) === productId);
      if (!product) return;
      const confirmed = await showConfirm(`Xóa sản phẩm "${product.name}"?`, {
        title: "Xóa sản phẩm",
        description: "Sản phẩm sẽ bị gỡ khỏi kho và không còn dùng cho bước match/comment.",
        confirmLabel: "Xóa sản phẩm",
      });
      if (!confirmed) return;
      await api.call("deleteProduct", { id: productId });
      appState.ui.selectedProducts.delete(productId);
      return refreshCurrentPage();
    }
    if (action === "delete-selected-products") {
      const selectedIds = [...appState.ui.selectedProducts];
      if (!selectedIds.length) return;
      const confirmed = await showConfirm(`Xóa ${selectedIds.length} sản phẩm đã chọn?`, {
        title: "Xóa sản phẩm",
        description: "Các sản phẩm được chọn sẽ bị gỡ khỏi kho sản phẩm hiện tại.",
        confirmLabel: "Xóa đã chọn",
      });
      if (!confirmed) return;
      await api.call("bulkDeleteProducts", { ids: selectedIds });
      appState.ui.selectedProducts.clear();
      return refreshCurrentPage();
    }
    if (action === "promote-product") {
      await api.call("promoteProductToReady", { id: Number(target.dataset.productId) });
      return refreshCurrentPage();
    }
    if (action === "set-products-filter") {
      appState.ui.productsFilter = target.dataset.filter || "all";
      resetTablePage("products");
      return renderProducts();
    }
    if (action === "set-pending-filter") {
      appState.ui.pendingFilter = target.dataset.filter || "pending";
      resetTablePage("pending");
      return renderPending();
    }
    if (action === "set-history-filter") {
      appState.ui.historyFilter = target.dataset.filter || "all";
      resetTablePage("history");
      return renderHistory();
    }
    if (action === "set-runs-filter") {
      appState.ui.runsFilter = target.dataset.filter || "all";
      resetTablePage("runs");
      return renderRuns();
    }
    if (action === "set-performance-filter") {
      appState.ui.performanceFilter = target.dataset.filter || "all";
      resetTablePage("groupPerformance");
      return renderGroupPerformance();
    }
    if (action === "save-settings-tab") {
      const tab = target.dataset.tab || appState.ui.settingsTab;
      const content = document.getElementById("settingsContent");
      const payload = {};
      content.querySelectorAll("[data-field]").forEach((field) => {
        let value = field.value;
        if (field.type === "number") value = Number(value || 0);
        if (value === "true") value = true;
        if (value === "false") value = false;
        payload[field.dataset.field] = value;
      });
      if (tab === "appearance" && payload.theme) setTheme(payload.theme);
      await api.call("saveConfigUi", payload);
      showActionSuccessToast(action, target, { tab });
      return refreshCurrentPage();
    }
    if (action === "test-ai") {
      const content = document.getElementById("settingsContent");
      const payload = {};
      content?.querySelectorAll("[data-field]").forEach((field) => {
        let value = field.value;
        if (field.type === "number") value = Number(value || 0);
        if (value === "true") value = true;
        if (value === "false") value = false;
        payload[field.dataset.field] = value;
      });
      const response = await api.call("testNineRouter", payload);
      const analysisPlan = response.data?.analysisPlan || null;
      showToast(
        analysisPlan
          ? `Kết nối 9Router thành công. IsBuy: ${analysisPlan.isBuy ? "true" : "false"}${analysisPlan.productName ? `, Product: ${analysisPlan.productName}` : ""}${analysisPlan.categoryName ? `, Category: ${analysisPlan.categoryName}` : ""}`
          : (response.data?.message || "Kết nối 9Router thành công."),
        {
          title: "Test 9Router",
          tone: "success",
        },
      );
      return;
    }
    if (action === "test-telegram") {
      const content = document.getElementById("settingsContent");
      const payload = {};
      content?.querySelectorAll("[data-field]").forEach((field) => {
        let value = field.value;
        if (field.type === "number") value = Number(value || 0);
        if (value === "true") value = true;
        if (value === "false") value = false;
        payload[field.dataset.field] = value;
      });
      const response = await api.call("testTelegram", payload);
      const botName = response.data?.data?.getMe?.botName || "";
      const username = response.data?.data?.getMe?.username || "";
      showToast(
        botName || username
          ? `Đã gửi tin test bằng bot ${botName || username}${username ? ` (@${username})` : ""}.`
          : (response.data?.message || "Đã gửi tin test Telegram thành công."),
        {
          title: "Telegram",
          tone: "success",
        },
      );
      return;
    }
    if (action === "export-app-data") {
      const response = await api.call("exportAppData");
      downloadText("fbcc-app-data.json", JSON.stringify(response.data?.data || {}, null, 2));
      return;
    }
    if (action === "export-products") {
      const response = await api.call("exportProducts");
      downloadText("fbcc-products.json", JSON.stringify(response.data?.products || [], null, 2));
      return;
    }
    if (action === "check-update") {
      await api.call("checkForUpdates");
      return;
    }
    if (action === "show-data-path") {
      await showAlert("/data", {
        title: "Đường dẫn dữ liệu",
        description: "Các file dữ liệu thật của ứng dụng hiện đang được lưu tại:",
        confirmLabel: "Đã hiểu",
      });
      return;
    }
  } catch (error) {
    console.error(`[fbcc] action failed: ${action}`, error);
    showToast(error.message || String(error), {
      title: "Thao tác chưa hoàn tất",
      tone: "error",
      duration: 4200,
    });
  }
}

function connectEvents() {
  if (appState.eventSource) appState.eventSource.close();
  try {
    const eventSource = new EventSource(`${appState.backendBase}/api/events`);
    eventSource.onopen = async () => {
      const wasConnected = appState.backendConnected;
      await refreshCore();
      if (!wasConnected && appState.backendConnected) {
        await renderPage(appState.page);
      }
    };
    eventSource.addEventListener("status", (event) => {
      const payload = JSON.parse(event.data || "{}");
      appState.bot.status = payload.state || appState.bot.status;
      appState.bot.scope = payload.scope ?? appState.bot.scope;
      appState.bot.text = payload.text || statusText(appState.bot.status);
      if (payload.workerId) {
        appState.workers = appState.workers.map((worker) => (
          String(worker?.id || "") === String(payload.workerId)
            ? {
              ...worker,
              runtime: {
                ...(worker.runtime || {}),
                botStatus: payload.state || worker.runtime?.botStatus || "idle",
              },
            }
            : worker
        ));
      }
      if (appState.page === "overview" || appState.page === "workers") renderPageData(appState.page);
      if (workerMonitorDialog) renderWorkerMonitorDialog();
      hydrateShell();
    });
    eventSource.addEventListener("runtime", (event) => {
      const payload = JSON.parse(event.data || "{}");
      appState.progress = {
        ...appState.progress,
        groups: Number(payload.current_group_index ?? appState.progress.groups ?? 0),
        totalGroups: Number(payload.total_groups ?? appState.progress.totalGroups ?? 0),
        scanned: Number(payload.scanned ?? appState.progress.scanned ?? 0),
        suitable: Number(payload.suitable ?? appState.progress.suitable ?? 0),
        direct: Number(payload.direct ?? appState.progress.direct ?? 0),
        telegram: Number(payload.telegram ?? appState.progress.telegram ?? 0),
        workflowMode: payload.workflow_mode || appState.progress.workflowMode || "full",
        currentGroupName: payload.current_group_name || "",
      };
      if (payload.workerId) {
        appState.workers = appState.workers.map((worker) => (
          String(worker?.id || "") === String(payload.workerId)
            ? {
              ...worker,
              runtime: {
                ...(worker.runtime || {}),
                ...payload,
              },
            }
            : worker
        ));
      }
      if (["overview", "workers", "processing"].includes(appState.page)) renderPageData(appState.page);
      if (workerMonitorDialog) renderWorkerMonitorDialog();
    });
    eventSource.addEventListener("log", (event) => {
      const payload = JSON.parse(event.data || "{}");
      const next = {
        ts: payload.ts || new Date().toISOString(),
        level: payload.level || "info",
        tag: payload.tag || "SYSTEM",
        kind: payload.tag || payload.level || "system",
        message: payload.message || "",
        workerId: payload.workerId || "",
      };
      appState.logs.push(next);
      if (appState.logs.length > 600) appState.logs = appState.logs.slice(-600);
      if (appState.page === "overview") renderPageData(appState.page);
      if (workerMonitorDialog?.workerId && String(workerMonitorDialog.workerId) === String(next.workerId || "")) {
        renderWorkerMonitorDialog();
      }
    });
    eventSource.addEventListener("data", async (event) => {
      const payload = JSON.parse(event.data || "{}");
      if (payload.type === "browser") {
        if (payload.workerId) {
          appState.workers = appState.workers.map((worker) => (
            String(worker?.id || "") === String(payload.workerId)
              ? {
                ...worker,
                runtime: {
                  ...(worker.runtime || {}),
                  browserConnected: !!payload.connected,
                  browser: payload.connected ? (payload.info || worker.runtime?.browser || null) : null,
                },
              }
              : worker
          ));
          if (String(primaryWorker()?.id || "") === String(payload.workerId)) {
            appState.browserConnected = !!payload.connected;
            appState.browserInfo = payload.connected ? (payload.info || appState.browserInfo || null) : null;
          }
        } else {
          appState.browserConnected = !!payload.connected;
          appState.browserInfo = payload.connected ? (payload.info || appState.browserInfo || null) : null;
        }
        if (appState.page === "overview" || appState.page === "workers") renderPageData(appState.page);
        if (workerMonitorDialog) renderWorkerMonitorDialog();
        hydrateShell();
      }
      if (["facebookAccounts", "groups", "group_name", "products", "productTypes", "history", "runs", "workers", "config", "backlog", "sync"].includes(payload.type)) {
        await ensurePageData(appState.page);
        renderPageData(appState.page);
        if (workerMonitorDialog) renderWorkerMonitorDialog();
      }
    });
    eventSource.onerror = () => {
      appState.backendConnected = false;
      hydrateShell();
    };
    appState.eventSource = eventSource;
  } catch (error) {
    console.error("[fbcc] event stream failed", error);
  }
}

function bindGlobalEvents() {
  navItems.forEach((item) => item.addEventListener("click", () => renderPage(item.dataset.page)));

  document.getElementById("themeToggle").addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    setTheme(next);
    renderPageData(appState.page);
  });

  window.addEventListener("resize", () => {
    layoutTablePanelKpis(pageRoot.querySelector(".page"));
  });

  function syncSidebarFooter() {
    const sidebar = document.getElementById("sidebar");
    const footer = document.getElementById("collapseFooter");
    const icon = footer?.querySelector(".collapse-footer-icon");
    if (!sidebar || !footer || !icon) return;
    const collapsed = sidebar.classList.contains("collapsed");
    icon.textContent = collapsed ? "→|" : "|←";
    footer.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
  }

  function toggleSidebar() {
    document.getElementById("sidebar").classList.toggle("collapsed");
    syncSidebarFooter();
  }

  document.getElementById("collapseFooter")?.addEventListener("click", toggleSidebar);
  syncSidebarFooter();

  document.getElementById("globalSearch").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const query = event.target.value.toLowerCase();
    const match = navItems.find((item) => item.innerText.toLowerCase().includes(query));
    if (match) renderPage(match.dataset.page);
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      document.getElementById("globalSearch").focus();
      return;
    }
    if (event.key === "Escape") {
      closeCustomSelects();
    }
  });

  document.addEventListener("click", (event) => {
    const option = event.target.closest("[data-select-option]");
    if (option) {
      if (option.disabled) return;
      const shell = option.closest(".select-shell");
      const select = shell?.querySelector("select");
      if (select) {
        select.value = option.dataset.selectOption || "";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      shell?.classList.remove("open");
      return;
    }

    const toggle = event.target.closest("[data-select-toggle]");
    if (toggle) {
      const shell = toggle.closest(".select-shell");
      if (!shell || shell.classList.contains("is-disabled")) return;
      const willOpen = !shell.classList.contains("open");
      closeCustomSelects(shell);
      shell.classList.toggle("open", willOpen);
      if (willOpen) {
        window.requestAnimationFrame(() => {
          positionCustomSelectMenu(shell);
        });
      } else {
        resetCustomSelectMenu(shell);
      }
      return;
    }

    if (!event.target.closest(".select-shell")) {
      closeCustomSelects();
    }
  });

  pageRoot.addEventListener("click", (event) => {
    const paginationButton = event.target.closest("[data-table-page-key]");
    if (paginationButton) {
      event.preventDefault();
      setTablePage(paginationButton.dataset.tablePageKey || "", paginationButton.dataset.tablePage || 1);
      renderPageData(appState.page);
      return;
    }
    const button = event.target.closest("[data-action],[data-jump],[data-settings]");
    if (!button) return;
    if (button.dataset.jump) {
      event.preventDefault();
      renderPage(button.dataset.jump);
      return;
    }
    if (button.dataset.settings) {
      event.preventDefault();
      appState.ui.settingsTab = button.dataset.settings;
      renderSettings();
      return;
    }
    if (button.dataset.action) {
      event.preventDefault();
      runButtonAction(button, button.dataset.action, () => handleAction(button.dataset.action, button));
    }
  });

  pageRoot.addEventListener("input", (event) => {
    const target = event.target;
    if (target.dataset.facebookAccountsSearch) {
      appState.ui.facebookAccountsQuery = target.value;
      resetTablePage("facebookAccounts");
      renderFacebookAccounts();
      return;
    }
    if (target.dataset.groupsSearch) {
      appState.ui.groupsQuery = target.value;
      resetTablePage("groups");
      renderGroups();
      return;
    }
    if (target.dataset.keywordsSearch) {
      appState.ui.keywordsQuery = target.value;
      resetTablePage("keywords");
      renderKeywords();
      return;
    }
    if (target.dataset.productsSearch) {
      appState.ui.productsQuery = target.value;
      resetTablePage(appState.page === "pending" ? "pending" : "products");
      if (appState.page === "pending") renderPending();
      else renderProducts();
      return;
    }
    if (target.dataset.historySearch) {
      appState.ui.historyQuery = target.value;
      resetTablePage("history");
      renderHistory();
      return;
    }
    if (target.dataset.runsSearch) {
      appState.ui.runsQuery = target.value;
      resetTablePage("runs");
      renderRuns();
      return;
    }
    if (target.dataset.performanceSearch) {
      appState.ui.performanceQuery = target.value;
      resetTablePage("groupPerformance");
      renderGroupPerformance();
    }
  });

  pageRoot.addEventListener("change", async (event) => {
    const target = event.target;
    if (target.dataset.facebookAccountsSelectAll) {
      const filteredAccountIds = paginateRows(filteredFacebookAccounts(), "facebookAccounts").items.map((account) => account.id);
      if (target.checked) filteredAccountIds.forEach((id) => appState.ui.selectedFacebookAccounts.add(id));
      else filteredAccountIds.forEach((id) => appState.ui.selectedFacebookAccounts.delete(id));
      renderFacebookAccounts();
      return;
    }
    if (target.dataset.facebookAccountSelect) {
      const accountId = String(target.dataset.facebookAccountId || "");
      if (target.checked) appState.ui.selectedFacebookAccounts.add(accountId);
      else appState.ui.selectedFacebookAccounts.delete(accountId);
      renderFacebookAccounts();
      return;
    }
    if (target.dataset.groupsTypeFilter) {
      appState.ui.groupsTypeFilter = target.value || "all";
      resetTablePage("groups");
      renderGroups();
      return;
    }
    if (target.dataset.groupsSelectAll) {
      const filteredGroupIds = paginateRows(filteredGroupsList(), "groups").items.map((group) => String(group.id));
      if (target.checked) filteredGroupIds.forEach((id) => appState.ui.selectedGroups.add(id));
      else filteredGroupIds.forEach((id) => appState.ui.selectedGroups.delete(id));
      renderGroups();
      return;
    }
    if (target.dataset.groupSelect) {
      const key = String(target.dataset.groupId || "");
      if (target.checked) appState.ui.selectedGroups.add(key);
      else appState.ui.selectedGroups.delete(key);
      renderGroups();
      return;
    }
    if (target.dataset.groupTypeSelect) {
      const groupId = String(target.dataset.groupId || "");
      const group = appState.groups.find((item) => String(item.id) === groupId);
      if (!group) return;
      await api.call("updateGroup", {
        id: groupId,
        name: group.name,
        url: group.url,
        groupTypeId: target.value,
      });
      await refreshCurrentPage();
      return;
    }
    if (target.dataset.productsSelectAll) {
      const filteredProductIds = paginateRows(appState.products.map(normalizeProduct).filter((item) => {
        const query = appState.ui.productsQuery.trim().toLowerCase();
        if (!query) return true;
        return `${item.keyword} ${item.name} ${productTypeLabel(item.productTypeId, item.category)} ${item.comments.join(" ")} ${item.affiliateLinks.join(" ")}`.toLowerCase().includes(query);
      }), "products").items.map((item) => String(item.id));
      if (target.checked) filteredProductIds.forEach((id) => appState.ui.selectedProducts.add(id));
      else filteredProductIds.forEach((id) => appState.ui.selectedProducts.delete(id));
      renderProducts();
      return;
    }
    if (target.dataset.productSelect) {
      const productId = String(target.dataset.productId || "");
      if (target.checked) appState.ui.selectedProducts.add(productId);
      else appState.ui.selectedProducts.delete(productId);
      renderProducts();
    }
  });

  window.addEventListener("resize", syncOpenCustomSelectMenus);
  document.addEventListener("scroll", syncOpenCustomSelectMenus, true);
}

async function bootstrap() {
  setTheme(getCurrentTheme());
  bindGlobalEvents();
  await refreshCore();
  connectEvents();
  await renderPage(appState.page);
}

bootstrap().catch((error) => {
  console.error("[fbcc] bootstrap failed", error);
});

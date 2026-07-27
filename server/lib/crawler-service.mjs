import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { defaultBrowserChoices, defaultConfigUi, defaultGroupTypes, defaultProductTypes } from './defaults.mjs';

const MONEY_DIVISOR = 100000;
const DAY_MS = 86400000;
const COMMENT_RETRY_DELAY_MS = 10000;
const MAX_GROUP_MODERATION_HITS = 2;
const MAX_COMMENT_ATTEMPTS_PER_POST = 2;
const DEFAULT_BUYER_INTENT_KEYWORDS = [
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
];

function nowIso() {
  return new Date().toISOString();
}

function todayParts() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const sec = String(d.getSeconds()).padStart(2, '0');
  return {
    date: `${yyyy}-${mm}-${dd}`,
    time: `${hh}:${min}:${sec}`,
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function parseMaybeJson(raw, fallback = {}) {
  if (typeof raw !== 'string') return raw ?? fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function linesToList(value) {
  return String(value || '')
    .split('\n')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function inferProductName(postText, keyword) {
  const head = String(postText || '').split('\n')[0].trim();
  return head || keyword;
}

function normalizedText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function coerceBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = normalizedText(value).toLowerCase();
  if (!text) return null;
  if (['true', '1', 'yes', 'y', 'ok'].includes(text)) return true;
  if (['false', '0', 'no', 'n'].includes(text)) return false;
  return null;
}

function normalizeCookieStatus(value) {
  const normalized = normalizedText(value).toLowerCase();
  if (['valid', 'healthy', 'ok'].includes(normalized)) return 'valid';
  if (['expired', 'invalid', 'login_required', 'login-required'].includes(normalized)) return 'expired';
  return 'unchecked';
}

function validateFacebookCookieJsonPayload(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  let parsed = null;
  try {
    parsed = JSON.parse(value);
  } catch (_) {
    throw new Error('Cookie Facebook phải là JSON hợp lệ.');
  }
  const cookies = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.cookies)
      ? parsed.cookies
      : (parsed && typeof parsed === 'object' && parsed.name && Object.prototype.hasOwnProperty.call(parsed, 'value'))
        ? [parsed]
        : null;
  if (!Array.isArray(cookies) || !cookies.length) {
    throw new Error('Cookie Facebook phải là mảng cookie hoặc object có trường cookies.');
  }
  return value;
}

function foldSearchText(value) {
  return normalizedText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function normalizeKeywordList(list, fallback = []) {
  const source = Array.isArray(list) ? list : fallback;
  const seen = new Set();
  const rows = [];
  source.forEach((item) => {
    const text = normalizedText(item);
    if (!text) return;
    const key = foldSearchText(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    rows.push(text);
  });
  return rows;
}

function slugifyId(value, fallback = 'item') {
  const normalized = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function extractCommentStrings(value, bucket = []) {
  if (typeof value === 'string') {
    const text = normalizedText(value);
    if (text) bucket.push(text);
    return bucket;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => extractCommentStrings(item, bucket));
    return bucket;
  }
  if (!value || typeof value !== 'object') return bucket;

  const directKeys = ['comment', 'text', 'content', 'message', 'value'];
  directKeys.forEach((key) => {
    if (typeof value[key] === 'string') {
      const text = normalizedText(value[key]);
      if (text) bucket.push(text);
    }
  });

  const nestedKeys = [
    'comments',
    'commentCandidates',
    'comment_candidates',
    'commentOptions',
    'comment_options',
    'suggestedComments',
    'suggested_comments',
    'items',
    'data',
    'results',
  ];
  nestedKeys.forEach((key) => {
    if (key in value) extractCommentStrings(value[key], bucket);
  });
  return bucket;
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function toMoney(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? Math.round(numeric / MONEY_DIVISOR) : 0;
}

function fromUnixSeconds(value) {
  const numeric = Number(value || 0);
  return numeric > 0 ? new Date(numeric * 1000) : new Date(0);
}

function parseRangeDate(value, endOfDay = false) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const suffix = text.includes('T') ? '' : (endOfDay ? 'T23:59:59.999' : 'T00:00:00');
  const stamp = new Date(text + suffix);
  return Number.isNaN(stamp.getTime()) ? null : stamp;
}

function rangeBounds(filter = {}) {
  let from = parseRangeDate(filter.from || filter.dateFrom, false);
  let to = parseRangeDate(filter.to || filter.dateTo, true);
  if (from && to && from > to) {
    from = parseRangeDate(filter.to || filter.dateTo, false);
    to = parseRangeDate(filter.from || filter.dateFrom, true);
  }
  return { from, to };
}

function inRangeDate(date, bounds) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  if (bounds.from && date < bounds.from) return false;
  if (bounds.to && date > bounds.to) return false;
  return true;
}

function parseSubId(value) {
  const parts = String(value || '').split('-').filter(Boolean);
  const sub1 = parts[0] || '';
  const sub2 = parts[1] || '';
  const sub3 = parts[2] || '';
  const sub4 = parts[3] || '';
  const sub5 = parts.slice(4).join('-');
  return {
    full: [sub1, sub2, sub3, sub4, sub5].join('-'),
    sub1,
    sub2,
    sub3,
    sub4,
    sub5,
    groupId: Number((String(value || '').match(/group(\d+)/i) || [])[1] || 0),
  };
}

function fullSubIdOf(record, fallbackKey = '') {
  const parsed = parseSubId(
    record?.sub_id || record?.utm_content || record?.subId || record?.utmContent || fallbackKey
  );
  return [parsed.sub1, parsed.sub2, parsed.sub3, parsed.sub4, parsed.sub5].join('-');
}

function firstNonEmpty(...values) {
  return values.find((value) => String(value || '').trim()) || '';
}

function flattenOrderItems(order) {
  const rows = [];
  for (const subOrder of order?.orders || []) {
    for (const item of subOrder?.items || []) {
      rows.push({ order, subOrder, item });
    }
  }
  return rows;
}

function firstOrderItem(order) {
  return flattenOrderItems(order)[0]?.item || {};
}

function statusFromOrder(order) {
  const subStatuses = (order?.orders || [])
    .map((row) => String(row.order_status || '').toUpperCase())
    .filter(Boolean);
  if (subStatuses.length) {
    if (subStatuses.some((status) => status.includes('CANCEL'))) return 'Đã hủy';
    if (subStatuses.some((status) => status.includes('COMPLETE'))) return 'Hoàn thành';
    return 'Chờ xử lý';
  }
  const conversion = Number(order?.conversion_status || 0);
  if (conversion === 3) return 'Đã hủy';
  if (conversion === 2) return 'Hoàn thành';
  if (conversion === 1) return 'Chờ xử lý';
  const checkoutStatus = String(order?.checkout_status || '').toLowerCase();
  if (checkoutStatus.includes('cancel') || checkoutStatus.includes('invalid')) return 'Đã hủy';
  if (checkoutStatus.includes('pending') || checkoutStatus.includes('waiting')) return 'Chờ xử lý';
  return 'Hoàn thành';
}

function csvCell(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function openExternalUrl(url) {
  const target = String(url || '').trim();
  if (!target) return false;
  if (process.platform === 'darwin') {
    spawn('open', [target], { detached: true, stdio: 'ignore' }).unref();
    return true;
  }
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', target], { detached: true, stdio: 'ignore' }).unref();
    return true;
  }
  spawn('xdg-open', [target], { detached: true, stdio: 'ignore' }).unref();
  return true;
}

function normalizeFacebookGroupUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(candidate);
    if (!/^(www\.)?facebook\.com$/i.test(parsed.hostname)) return raw;
    const match = parsed.pathname.match(/^\/groups\/([^/?#]+)\/?$/i);
    if (!match) return raw;
    const base = `https://www.facebook.com/groups/${match[1]}/`;
    const query = new URLSearchParams({ sorting_setting: 'CHRONOLOGICAL' }).toString();
    return query ? `${base}?${query}` : base;
  } catch (error) {
    return raw;
  }
}

function isFacebookGroupUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return false;
  try {
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(candidate);
    if (!/^(www\.)?facebook\.com$/i.test(parsed.hostname)) return false;
    return /^\/groups\/([^/?#]+)\/?$/i.test(parsed.pathname);
  } catch (error) {
    return false;
  }
}

export class CrawlerService {
  constructor({
    store,
    events,
    browserManager,
    stateDir,
    groupsFile,
    groupTypesFile,
    facebookAccountsFile,
    crawlerConfigFile,
    buyerIntentKeywordsFile,
    hooks = {},
    workerProvider = null,
    storeWritesEnabled = true,
  }) {
    this.store = store;
    this.events = events;
    this.browserManager = browserManager;
    this.stateDir = stateDir;
    this.groupsFile = groupsFile;
    this.groupTypesFile = groupTypesFile;
    this.facebookAccountsFile = facebookAccountsFile;
    this.crawlerConfigFile = crawlerConfigFile;
    this.buyerIntentKeywordsFile = buyerIntentKeywordsFile;
    this.hooks = hooks;
    this.workerProvider = typeof workerProvider === 'function' ? workerProvider : null;
    this.storeWritesEnabled = storeWritesEnabled !== false;
    this.workerManager = null;
    this.botState = {
      status: 'idle',
      text: 'Sẵn sàng',
      scope: null,
      currentRunId: null,
    };
    this.runtime = {
      current_group_index: 0,
      total_groups: 0,
      current_group_name: '',
      current_group_url: '',
      scanned: 0,
      suitable: 0,
      direct: 0,
      telegram: 0,
      workflow_mode: 'full',
    };
    this.loopControl = {
      stop: false,
      pause: false,
    };
    this.botTask = null;
  }

  async init() {
    await fs.mkdir(this.stateDir, { recursive: true });
    await this.loadCrawlerConfigData();
    await this.refreshBrowserChoices();
    await this.loadGroupTypesData();
    await this.loadGroupsData();
    await this.loadFacebookAccountsData();
    await this.loadBuyerIntentKeywords();
  }

  attachWorkerManager(workerManager) {
    this.workerManager = workerManager;
  }

  facebookAccountAssignments(workers = null) {
    const rows = Array.isArray(workers) ? workers : (this.workerManager?.snapshot?.() || []);
    const assignments = new Map();
    rows.forEach((worker) => {
      const facebookAccountId = String(worker?.facebookAccountId || '').trim();
      if (!facebookAccountId || assignments.has(facebookAccountId)) return;
      assignments.set(facebookAccountId, {
        workerId: worker.id,
        workerName: worker.name || worker.id,
      });
    });
    return assignments;
  }

  decorateFacebookAccounts(accounts, workers = null) {
    const assignments = this.facebookAccountAssignments(workers);
    const workerRows = Array.isArray(workers) ? workers : (this.workerManager?.snapshot?.() || []);
    const workerAccountMap = new Map(
      workerRows
        .map((worker) => [String(worker?.id || '').trim(), String(worker?.facebookAccountId || '').trim()])
        .filter(([workerId, accountId]) => workerId && accountId)
    );
    const historyEntries = Array.isArray(this.store.data.history) ? this.store.data.history : [];
    const commentStats = new Map();
    historyEntries.forEach((entry) => {
      const mode = String(entry?.mode || '').trim().toLowerCase();
      if (!['pending', 'rejected'].includes(mode)) return;
      const accountId = String(
        entry?.facebook_account_id
        || entry?.facebookAccountId
        || entry?.account_id
        || workerAccountMap.get(String(entry?.worker_id || entry?.workerId || '').trim())
        || ''
      ).trim();
      if (!accountId) return;
      const current = commentStats.get(accountId) || { pendingComments: 0, rejectedComments: 0 };
      if (mode === 'pending') current.pendingComments += 1;
      if (mode === 'rejected') current.rejectedComments += 1;
      commentStats.set(accountId, current);
    });
    return (Array.isArray(accounts) ? accounts : []).map((account) => {
      const assigned = assignments.get(String(account?.id || '').trim()) || null;
      const stats = commentStats.get(String(account?.id || '').trim()) || { pendingComments: 0, rejectedComments: 0 };
      return {
        ...account,
        assignedWorkerId: assigned?.workerId || '',
        assignedWorkerName: assigned?.workerName || '',
        pendingComments: Number(stats.pendingComments || 0),
        rejectedComments: Number(stats.rejectedComments || 0),
      };
    });
  }

  normalizeFacebookAccount(account, index = 0) {
    const createdAt = account?.createdAt || nowIso();
    return {
      id: String(account?.id || `facebook-account-${index + 1}`).trim() || `facebook-account-${index + 1}`,
      name: normalizedText(account?.name) || `Facebook ${index + 1}`,
      cookieJson: String(account?.cookieJson ?? account?.facebookCookieJson ?? '').trim(),
      cookieStatus: normalizeCookieStatus(account?.cookieStatus),
      cookieCheckedAt: String(account?.cookieCheckedAt || '').trim(),
      cookieStatusMessage: normalizedText(account?.cookieStatusMessage || ''),
      createdAt,
      updatedAt: account?.updatedAt || createdAt,
    };
  }

  normalizeFacebookAccounts(accounts) {
    return (Array.isArray(accounts) ? accounts : []).map((account, index) => this.normalizeFacebookAccount(account, index));
  }

  async persistFacebookAccountsFile(accounts) {
    const next = this.normalizeFacebookAccounts(accounts);
    await fs.mkdir(path.dirname(this.facebookAccountsFile), { recursive: true });
    await fs.writeFile(this.facebookAccountsFile, JSON.stringify(next, null, 2), 'utf8');
    return next;
  }

  async loadFacebookAccountsData() {
    const fallback = this.normalizeFacebookAccounts(this.store.data.facebookAccounts || []);
    if (!this.facebookAccountsFile) {
      await this.store.set({ facebookAccounts: fallback });
      return fallback;
    }
    try {
      const raw = await fs.readFile(this.facebookAccountsFile, 'utf8');
      const parsed = JSON.parse(raw);
      const next = this.normalizeFacebookAccounts(parsed);
      if (JSON.stringify(parsed) !== JSON.stringify(next)) {
        await this.persistFacebookAccountsFile(next);
      }
      await this.store.set({ facebookAccounts: next });
      return next;
    } catch (error) {
      await this.persistFacebookAccountsFile(fallback);
      await this.store.set({ facebookAccounts: fallback });
      return fallback;
    }
  }

  async writeFacebookAccountsData(accounts) {
    const next = await this.persistFacebookAccountsFile(accounts);
    await this.store.set({ facebookAccounts: next });
    return next;
  }

  async setFacebookAccountCookieStatus(accountId, {
    cookieStatus = 'unchecked',
    cookieStatusMessage = '',
    cookieCheckedAt = nowIso(),
  } = {}) {
    if (!this.facebookAccountsFile) return null;
    const id = String(accountId || '').trim();
    if (!id) return null;
    const accounts = await this.loadFacebookAccountsData();
    const current = this.findFacebookAccount(id, accounts);
    if (!current) return null;
    const updated = this.normalizeFacebookAccount({
      ...current,
      cookieStatus,
      cookieStatusMessage,
      cookieCheckedAt: cookieCheckedAt || '',
      updatedAt: nowIso(),
      createdAt: current.createdAt,
    }, accounts.findIndex((account) => account.id === id));
    const next = await this.writeFacebookAccountsData(accounts.map((account) => (
      account.id === id ? updated : account
    )));
    this.events.data({ type: 'facebookAccounts', status: 'updated', accountId: updated.id });
    return this.decorateFacebookAccounts(next).find((account) => account.id === updated.id) || updated;
  }

  findFacebookAccount(accountId, accounts = []) {
    const id = String(accountId || '').trim();
    if (!id) return null;
    return (Array.isArray(accounts) ? accounts : []).find((account) => String(account?.id || '').trim() === id) || null;
  }

  async resolveFacebookAccountBinding(accountId, currentWorker = null) {
    const facebookAccountId = String(accountId || '').trim();
    if (!facebookAccountId) {
      return {
        facebookAccountId: '',
        accountLabel: '',
        facebookCookieJson: '',
      };
    }
    const accounts = await this.loadFacebookAccountsData();
    const account = this.findFacebookAccount(facebookAccountId, accounts);
    if (!account) throw new Error('Không tìm thấy tài khoản Facebook đã chọn.');
    const duplicateWorker = this.workerManager?.snapshot?.().find((worker) => (
      worker.id !== currentWorker?.id
      && String(worker?.facebookAccountId || '').trim() === facebookAccountId
    ));
    if (duplicateWorker) {
      throw new Error(`Tài khoản Facebook này đang được gắn cho worker ${duplicateWorker.name || duplicateWorker.id}.`);
    }
    return {
      facebookAccountId: account.id,
      accountLabel: account.name,
      facebookCookieJson: account.cookieJson,
    };
  }

  async syncAssignedWorkerFacebookAccount(account) {
    if (!this.workerManager) return;
    const assignedWorker = this.workerManager.snapshot().find((worker) => (
      String(worker?.facebookAccountId || '').trim() === String(account?.id || '').trim()
    ));
    if (!assignedWorker) return;
    await this.workerManager.updateWorker(assignedWorker.id, {
      facebookAccountId: account.id,
      accountLabel: account.name,
      facebookCookieJson: account.cookieJson,
    });
  }

  currentWorker() {
    if (!this.workerProvider) return null;
    try {
      return this.workerProvider() || null;
    } catch (_) {
      return null;
    }
  }

  async restoreWorkerFacebookSession(crawler) {
    const worker = this.currentWorker();
    const cookieJson = String(worker?.facebookCookieJson || '').trim();
    if (!cookieJson) {
      return {
        attempted: false,
        restored: false,
        reason: 'no-cookie',
      };
    }
    try {
      const result = await crawler.restoreFacebookSession(cookieJson);
      if (result.restored) {
        this.log('success', 'BROWSER', `Đã khôi phục phiên Facebook cho worker ${worker?.name || worker?.id || 'unknown-worker'}.`);
      } else {
        this.log('warning', 'BROWSER', `Đã import cookie Facebook cho worker ${worker?.name || worker?.id || 'unknown-worker'} nhưng chưa xác nhận được phiên đăng nhập.`);
      }
      return result;
    } catch (error) {
      const message = error?.message || String(error);
      this.log('warning', 'BROWSER', `Không thể khôi phục phiên Facebook cho worker ${worker?.name || worker?.id || 'unknown-worker'}: ${message}`);
      return {
        attempted: true,
        restored: false,
        error: message,
      };
    }
  }

  async finalizeWorkerBrowserSession(worker, info) {
    const sessionRestore = info?.sessionRestore;
    const facebookAccountId = String(worker?.facebookAccountId || '').trim();
    if (!facebookAccountId || !sessionRestore?.attempted) return info;

    if (sessionRestore.loginRequired || sessionRestore.fatalErrorPage) {
      const expiredReason = sessionRestore.loginRequired
        ? 'Facebook yêu cầu đăng nhập lại. Cookie đã được đánh dấu hết hạn.'
        : 'Facebook trả về trang lỗi phiên đăng nhập. Cookie đã được đánh dấu không còn dùng được.';
      const disconnectMessage = sessionRestore.loginRequired
        ? 'Cookie Facebook đã hết hạn. Browser đã được ngắt để tránh chạy sai phiên đăng nhập.'
        : 'Facebook trả về trang lỗi "something went wrong". Browser đã được ngắt và cookie được chuyển sang trạng thái không hợp lệ.';
      await this.setFacebookAccountCookieStatus(facebookAccountId, {
        cookieStatus: 'expired',
        cookieStatusMessage: expiredReason,
      });
      await this.workerManager?.closeDriver?.(worker.id).catch(() => {});
      this.log(
        'warning',
        'BROWSER',
        `${sessionRestore.loginRequired ? 'Cookie' : 'Phiên Facebook'} của tài khoản ${worker.accountLabel || facebookAccountId} không còn hợp lệ, browser worker ${worker.name || worker.id} đã bị ngắt.`,
      );
      return {
        ...info,
        sessionRestore: {
          ...sessionRestore,
          accountExpired: true,
          disconnected: true,
          message: disconnectMessage,
        },
      };
    }

    if (sessionRestore.restored) {
      await this.setFacebookAccountCookieStatus(facebookAccountId, {
        cookieStatus: 'valid',
        cookieStatusMessage: 'Cookie hợp lệ, phiên Facebook đã được khôi phục.',
      });
      return {
        ...info,
        sessionRestore: {
          ...sessionRestore,
          accountExpired: false,
        },
      };
    }

    await this.setFacebookAccountCookieStatus(facebookAccountId, {
      cookieStatus: 'unchecked',
      cookieStatusMessage: sessionRestore.error
        ? `Không thể xác minh phiên Facebook: ${sessionRestore.error}`
        : 'Đã import cookie nhưng chưa xác nhận được trạng thái đăng nhập.',
    });
    return {
      ...info,
      sessionRestore: {
        ...sessionRestore,
        accountExpired: false,
      },
    };
  }

  async ensurePrimaryWorker() {
    if (!this.workerManager) return null;
    const workers = this.workerManager.snapshot();
    if (workers.length) return workers[0];
    await this.workerManager.ensureDefaultWorker();
    return this.workerManager.snapshot()[0] || null;
  }

  workerConfigUi(worker, overrides = null) {
    const base = this.normalizeConfigUi(this.store.data.configUi || {});
    const incoming = overrides && typeof overrides === 'object' ? overrides : {};
    if (!worker) return this.normalizeConfigUi({ ...base, ...incoming });
    return this.normalizeConfigUi({
      ...base,
      ...incoming,
      browserType: worker.browserType || incoming.browserType || base.browserType,
      browserProfileId: worker.browserProfileId || incoming.browserProfileId || base.browserProfileId,
      browserHeadless: worker.browserHeadless ?? incoming.browserHeadless ?? base.browserHeadless,
      useSeparateProfile: worker.profileMode === 'dedicated',
      edgePort: Number(worker.edgePort || incoming.edgePort || base.edgePort || 9222),
    });
  }

  workerGroupIds(worker) {
    const rows = Array.isArray(worker?.groupIds) ? worker.groupIds : [];
    return Array.from(new Set(
      rows
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ));
  }

  filterGroupsForWorker(worker, groups) {
    const rows = Array.isArray(groups) ? groups : [];
    const groupIds = this.workerGroupIds(worker);
    if (!groupIds.length) return rows;
    const allowed = new Set(groupIds);
    return rows.filter((group) => allowed.has(String(group?.id || '').trim()));
  }

  handleWorkerEvent(event = {}) {
    const workerId = event.workerId || '';
    const primaryWorker = this.workerManager?.snapshot?.()[0] || null;
    const isPrimary = !!primaryWorker && primaryWorker.id === workerId;
    if (event.type === 'log-event' && event.data) {
      this.events.log({
        ...event.data,
        workerId,
      });
      return;
    }
    if (event.type === 'status-event' && event.data) {
      if (isPrimary) {
        this.botState.status = event.data.state || this.botState.status;
        this.botState.text = event.data.text || this.botState.text;
        this.botState.scope = event.data.scope ?? this.botState.scope;
      }
      this.events.status({
        ...event.data,
        workerId,
      });
      return;
    }
    if (event.type === 'runtime-event' && event.data) {
      if (isPrimary) {
        this.runtime = {
          ...this.runtime,
          ...event.data,
        };
      }
      this.events.runtime({
        ...event.data,
        workerId,
      });
      return;
    }
    if (event.type === 'data-event' && event.data) {
      this.events.data({
        ...event.data,
        workerId,
      });
      return;
    }
    if (event.type === 'browser-event' && event.data) {
      this.events.data({
        ...event.data,
        workerId,
      });
      return;
    }
    if (event.type === 'group-complete' && event.data) {
      const payload = event.data;
      this.applyGroupResults({
        group: payload.group,
        posts: payload.posts || [],
        matchedPosts: payload.matchedPosts || [],
        runConfig: payload.runConfig || this.buildCrawlerRunConfig(),
        now: payload.now || new Date(),
        workerId,
      }).catch((error) => {
        this.events.log({
          ts: nowIso(),
          level: 'error',
          tag: 'WORKER',
          message: `Không apply được group result từ worker ${workerId}: ${error.message || error}`,
          workerId,
        });
      });
      return;
    }
    if (event.type === 'run-complete' && event.data) {
      const payload = event.data;
      this.applyRunSummary({
        runId: payload.runId,
        runRows: payload.runRows || [],
        stopped: !!payload.stopped,
        workerId,
      }).catch((error) => {
        this.events.log({
          ts: nowIso(),
          level: 'error',
          tag: 'WORKER',
          message: `Không apply được run summary từ worker ${workerId}: ${error.message || error}`,
          workerId,
        });
      });
      return;
    }
  }

  log(level, tag, message) {
    this.events.log({
      ts: nowIso(),
      level,
      tag,
      message,
    });
  }

  async refreshBrowserChoices() {
    const browsers = await this.browserManager.scanBrowsers();
    const nextChoices = browsers.length ? browsers.map((browser) => ({
      type: browser.type,
      label: browser.label,
      path: browser.path,
      paths: browser.paths,
    })) : defaultBrowserChoices();
    const nextPaths = {};
    for (const item of nextChoices) {
      nextPaths[item.type] = item.paths || (item.path ? [item.path] : []);
    }
    await this.store.mutate((state) => {
      state.configUi = {
        ...defaultConfigUi(),
        ...state.configUi,
        browserChoices: nextChoices,
        browserPaths: nextPaths,
        chromePaths: nextPaths.chrome || state.configUi.chromePaths || [],
        edgePaths: nextPaths.edge || state.configUi.edgePaths || [],
        bravePaths: nextPaths.brave || state.configUi.bravePaths || [],
        firefoxPaths: nextPaths.firefox || state.configUi.firefoxPaths || [],
      };
      return state;
    });
    await this.saveCrawlerConfigData(this.store.data.configUi);
    return browsers;
  }

  normalizeConfigUi(config = {}, baseConfig = this.store.data?.configUi || defaultConfigUi()) {
    const defaults = defaultConfigUi();
    const base = baseConfig && typeof baseConfig === 'object' ? baseConfig : {};
    const incoming = config && typeof config === 'object' ? config : {};
    const next = {
      ...defaults,
      ...base,
      ...incoming,
    };
    next.browserChoices = Array.isArray(next.browserChoices) && next.browserChoices.length
      ? next.browserChoices
      : (Array.isArray(base.browserChoices) && base.browserChoices.length ? base.browserChoices : defaults.browserChoices);
    next.browserProfiles = Array.isArray(next.browserProfiles)
      ? next.browserProfiles
      : (Array.isArray(base.browserProfiles) ? base.browserProfiles : defaults.browserProfiles);
    next.browserPaths = next.browserPaths && typeof next.browserPaths === 'object'
      ? next.browserPaths
      : (base.browserPaths && typeof base.browserPaths === 'object' ? base.browserPaths : defaults.browserPaths);
    next.edgePaths = Array.isArray(next.edgePaths) ? next.edgePaths : (Array.isArray(base.edgePaths) ? base.edgePaths : defaults.edgePaths);
    next.chromePaths = Array.isArray(next.chromePaths) ? next.chromePaths : (Array.isArray(base.chromePaths) ? base.chromePaths : defaults.chromePaths);
    next.bravePaths = Array.isArray(next.bravePaths) ? next.bravePaths : (Array.isArray(base.bravePaths) ? base.bravePaths : defaults.bravePaths);
    next.firefoxPaths = Array.isArray(next.firefoxPaths) ? next.firefoxPaths : (Array.isArray(base.firefoxPaths) ? base.firefoxPaths : defaults.firefoxPaths);
    next.tinyRows = Array.isArray(next.tinyRows) ? next.tinyRows : (Array.isArray(base.tinyRows) ? base.tinyRows : defaults.tinyRows);
    next.muahangreStatus = next.muahangreStatus && typeof next.muahangreStatus === 'object'
      ? next.muahangreStatus
      : (base.muahangreStatus && typeof base.muahangreStatus === 'object' ? base.muahangreStatus : defaults.muahangreStatus);
    return next;
  }

  async saveCrawlerConfigData(configUi) {
    if (!this.crawlerConfigFile) return this.normalizeConfigUi(configUi);
    const normalized = this.normalizeConfigUi(configUi);
    await fs.mkdir(path.dirname(this.crawlerConfigFile), { recursive: true });
    await fs.writeFile(this.crawlerConfigFile, JSON.stringify(normalized, null, 2), 'utf8');
    return normalized;
  }

  async loadCrawlerConfigData() {
    const fallback = this.normalizeConfigUi({});
    if (!this.crawlerConfigFile) {
      await this.store.set({ configUi: fallback });
      return fallback;
    }
    try {
      const raw = await fs.readFile(this.crawlerConfigFile, 'utf8');
      const parsed = JSON.parse(raw);
      const normalized = this.normalizeConfigUi(parsed);
      await this.store.set({ configUi: normalized });
      return normalized;
    } catch (error) {
      await this.store.set({ configUi: fallback });
      await this.saveCrawlerConfigData(fallback);
      return fallback;
    }
  }

  async syncCrawlerConfig(configUi) {
    const normalized = this.normalizeConfigUi(configUi);
    await this.store.set({ configUi: normalized });
    await this.saveCrawlerConfigData(normalized);
    return normalized;
  }

  buildCrawlerRunConfig(configUi = {}) {
    const normalized = this.normalizeConfigUi(configUi);
    return {
      raw: normalized,
      workflow: normalized.workflow || 'full',
      browserType: normalized.browserType || 'chrome',
      perGroup: clampNumber(normalized.perGroup, 1, 50, 20),
      delaySeconds: clampNumber(normalized.delay, 1, 120, 10),
      runMode: normalized.runMode || 'once',
      cycleWaitMinutes: clampNumber(normalized.cycleWait, 1, 720, 15),
      skipProcessed: normalized.skipProcessed !== false,
      deleteUnapproved: normalized.deleteUnapproved !== false,
      buyKeywords: linesToList(normalized.buyKeywords),
    };
  }

  normalizeGroupType(item, index = 0) {
    const label = normalizedText(item?.label || item?.name || '');
    return {
      id: String(item?.id || slugifyId(label, `group-type-${index + 1}`)).trim(),
      label: label || `Loai nhom ${index + 1}`,
    };
  }

  normalizeGroupTypes(list) {
    const seen = new Set();
    const rows = [];
    (Array.isArray(list) ? list : defaultGroupTypes()).forEach((item, index) => {
      const normalized = this.normalizeGroupType(item, index);
      if (!normalized.id || seen.has(normalized.id)) return;
      seen.add(normalized.id);
      rows.push(normalized);
    });
    return rows.length ? rows : defaultGroupTypes();
  }

  assertUniqueGroupTypes(list) {
    const seenIds = new Set();
    const seenLabels = new Set();
    (Array.isArray(list) ? list : []).forEach((item, index) => {
      const normalized = this.normalizeGroupType(item, index);
      const idKey = String(normalized.id || '').trim();
      const labelKey = foldSearchText(normalized.label || '');
      if (idKey && seenIds.has(idKey)) throw new Error('ID loại nhóm đã tồn tại.');
      if (labelKey && seenLabels.has(labelKey)) throw new Error('Tên loại nhóm đã tồn tại.');
      if (idKey) seenIds.add(idKey);
      if (labelKey) seenLabels.add(labelKey);
    });
  }

  defaultGroupTypeId() {
    return this.normalizeGroupTypes(this.store.data.groupTypes || defaultGroupTypes())[0]?.id || defaultGroupTypes()[0].id;
  }

  async persistGroupTypesFile(groupTypes) {
    const next = this.normalizeGroupTypes(groupTypes);
    if (!this.groupTypesFile) return next;
    await fs.mkdir(path.dirname(this.groupTypesFile), { recursive: true });
    await fs.writeFile(this.groupTypesFile, JSON.stringify(next, null, 2), 'utf8');
    return next;
  }

  async loadGroupTypesData() {
    const fallback = this.normalizeGroupTypes(this.store.data.groupTypes || defaultGroupTypes());
    if (!this.groupTypesFile) {
      await this.store.set({ groupTypes: fallback });
      return fallback;
    }
    try {
      const raw = await fs.readFile(this.groupTypesFile, 'utf8');
      const parsed = JSON.parse(raw);
      const next = this.normalizeGroupTypes(parsed);
      if (JSON.stringify(parsed) !== JSON.stringify(next)) {
        await this.persistGroupTypesFile(next);
      }
      await this.store.set({ groupTypes: next });
      return next;
    } catch (error) {
      await this.persistGroupTypesFile(fallback);
      await this.store.set({ groupTypes: fallback });
      return fallback;
    }
  }

  async writeGroupTypesData(groupTypes) {
    this.assertUniqueGroupTypes(groupTypes);
    const next = await this.persistGroupTypesFile(groupTypes);
    await this.store.set({ groupTypes: next });
    return next;
  }

  normalizeProductType(item, index = 0) {
    const label = normalizedText(item?.label || item?.name || '');
    return {
      id: String(item?.id || slugifyId(label, `product-type-${index + 1}`)).trim(),
      label: label || `Loai san pham ${index + 1}`,
    };
  }

  normalizeProductTypes(list) {
    const seen = new Set();
    const rows = [];
    (Array.isArray(list) ? list : defaultProductTypes()).forEach((item, index) => {
      const normalized = this.normalizeProductType(item, index);
      if (!normalized.id || seen.has(normalized.id)) return;
      seen.add(normalized.id);
      rows.push(normalized);
    });
    return rows;
  }

  assertUniqueProductTypes(list) {
    const seenIds = new Set();
    const seenLabels = new Set();
    (Array.isArray(list) ? list : []).forEach((item, index) => {
      const normalized = this.normalizeProductType(item, index);
      const idKey = String(normalized.id || '').trim();
      const labelKey = foldSearchText(normalized.label || '');
      if (idKey && seenIds.has(idKey)) throw new Error('ID loại sản phẩm đã tồn tại.');
      if (labelKey && seenLabels.has(labelKey)) throw new Error('Tên loại sản phẩm đã tồn tại.');
      if (idKey) seenIds.add(idKey);
      if (labelKey) seenLabels.add(labelKey);
    });
  }

  async loadProductTypesData() {
    const next = this.normalizeProductTypes(this.store.data.productTypes || defaultProductTypes());
    await this.store.set({ productTypes: next });
    return next;
  }

  async writeProductTypesData(productTypes) {
    this.assertUniqueProductTypes(productTypes);
    const next = this.normalizeProductTypes(productTypes);
    await this.store.set({ productTypes: next });
    return next;
  }

  normalizeProductComments(value) {
    if (typeof value === 'string') {
      return Array.from(new Set(
        value
          .split(/\r?\n/)
          .map((item) => normalizedText(item))
          .filter(Boolean),
      ));
    }
    const rows = [];
    extractCommentStrings(value, rows);
    return Array.from(new Set(rows.map((item) => normalizedText(item)).filter(Boolean)));
  }

  normalizeAffiliateLinks(value) {
    if (typeof value === 'string') {
      return Array.from(new Set(
        value
          .split(/\r?\n/)
          .map((item) => normalizedText(item))
          .filter(Boolean),
      ));
    }
    return Array.from(new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => normalizedText(item))
        .filter(Boolean),
    ));
  }

  normalizeProduct(item, index = 0) {
    const name = normalizedText(item?.name || item?.product_name || item?.keyword || '') || `San pham ${index + 1}`;
    const keyword = normalizedText(item?.keyword || item?.name || item?.product_name || '')
      || slugifyId(name, `product-${index + 1}`);
    const createdAt = item?.createdAt || nowIso();
    return {
      id: String(item?.id || `product-${index + 1}`).trim() || `product-${index + 1}`,
      keyword,
      product_name: name,
      name,
      url: normalizedText(item?.url || ''),
      original_url: normalizedText(item?.original_url || item?.url || ''),
      status: normalizedText(item?.status || (item?.url ? 'ready' : 'pending')).toLowerCase() || 'pending',
      category: normalizedText(item?.category || ''),
      productTypeId: String(item?.productTypeId || item?.categoryId || '').trim(),
      comments: this.normalizeProductComments(item?.comments),
      affiliateLinks: this.normalizeAffiliateLinks(item?.affiliateLinks || item?.links || []),
      demand_count: Number(item?.demand_count ?? item?.demand ?? 0) || 0,
      worker_id: String(item?.worker_id || item?.workerId || '').trim(),
      createdAt,
      updatedAt: item?.updatedAt || createdAt,
    };
  }

  normalizeProducts(products) {
    return (Array.isArray(products) ? products : []).map((item, index) => this.normalizeProduct(item, index));
  }

  productSearchText(product) {
    return foldSearchText(product?.name || product?.product_name || product?.keyword || '');
  }

  productMatchesName(product, productName) {
    const left = this.productSearchText(product);
    const right = foldSearchText(productName);
    if (!left || !right) return false;
    return left.includes(right) || right.includes(left);
  }

  findProductTypeMatch(categoryName, productTypes = []) {
    const target = foldSearchText(categoryName);
    if (!target) return null;
    return (Array.isArray(productTypes) ? productTypes : []).find((item) => {
      const label = foldSearchText(item?.label || '');
      return label && (label.includes(target) || target.includes(label));
    }) || null;
  }

  resolveProductForPlan(plan, products = [], productTypes = []) {
    const productName = normalizedText(plan?.productName || '');
    const categoryName = normalizedText(plan?.categoryName || '');
    const rows = Array.isArray(products) ? products : [];
    const matchedByName = productName
      ? rows.find((item) => this.productMatchesName(item, productName))
      : null;
    if (matchedByName) {
      return {
        ...plan,
        productId: matchedByName.id,
        productName: matchedByName.name || matchedByName.product_name || productName,
        productTypeId: matchedByName.productTypeId || '',
        comments: Array.isArray(matchedByName.comments) ? matchedByName.comments : [],
        matchedBy: 'product-name',
      };
    }

    const matchedType = categoryName ? this.findProductTypeMatch(categoryName, productTypes) : null;
    if (matchedType) {
      const matchedByType = rows.find((item) => String(item?.productTypeId || '').trim() === matchedType.id);
      if (matchedByType) {
        return {
          ...plan,
          productId: matchedByType.id,
          productName: matchedByType.name || matchedByType.product_name || productName || categoryName,
          productTypeId: matchedByType.productTypeId || matchedType.id,
          comments: Array.isArray(matchedByType.comments) ? matchedByType.comments : [],
          matchedBy: 'product-type',
        };
      }
    }

    if (!productName && !categoryName) return null;
    return {
      ...plan,
      productId: '',
      productTypeId: '',
      comments: [],
      matchedBy: 'unmatched',
    };
  }

  normalizeGroup(group, index = 0) {
    const cleanUrl = normalizeFacebookGroupUrl(group?.url || '');
    const fallbackName = cleanUrl
      .replace(/^https?:\/\/(www\.)?facebook\.com\/groups\//i, '')
      .replace(/[/?#].*$/, '')
      || `Group ${index + 1}`;
    return {
      id: group?.id ?? index + 1,
      name: group?.name || fallbackName,
      url: cleanUrl,
      groupTypeId: String(group?.groupTypeId || group?.typeId || this.defaultGroupTypeId()).trim() || this.defaultGroupTypeId(),
      enabled: group?.enabled !== false,
      action: group?.action || 'comment',
      lastScan: group?.lastScan || '—',
      scanned: Number(group?.scanned || 0),
      matched: Number(group?.matched || 0),
      comments: Number(group?.comments || 0),
      pending: Number(group?.pending || 0),
      rejected: Number(group?.rejected || 0),
      fail: Number(group?.fail || 0),
      clicks: Number(group?.clicks || 0),
      orders: Number(group?.orders || 0),
      commission: Number(group?.commission || 0),
      rating: group?.rating || 'monitor',
      paused: !!group?.paused,
      pausedAt: group?.pausedAt ? String(group.pausedAt) : '',
    };
  }

  normalizeGroups(groups) {
    return (Array.isArray(groups) ? groups : []).map((group, index) => this.normalizeGroup(group, index));
  }

  async persistGroupsFile(groups) {
    const next = this.normalizeGroups(groups);
    await fs.mkdir(path.dirname(this.groupsFile), { recursive: true });
    await fs.writeFile(this.groupsFile, JSON.stringify(next, null, 2), 'utf8');
    return next;
  }

  async loadGroupsData() {
    await this.loadGroupTypesData();
    await fs.mkdir(path.dirname(this.groupsFile), { recursive: true });
    try {
      const raw = await fs.readFile(this.groupsFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === 0 && Array.isArray(this.store.data.groups) && this.store.data.groups.length > 0) {
        const seeded = this.normalizeGroups(this.store.data.groups);
        await this.persistGroupsFile(seeded);
        await this.store.set({ groups: seeded });
        return seeded;
      }
      const next = this.normalizeGroups(parsed);
      if (JSON.stringify(parsed) !== JSON.stringify(next)) {
        await this.persistGroupsFile(next);
      }
      await this.store.set({ groups: next });
      return next;
    } catch (error) {
      const seeded = this.normalizeGroups(this.store.data.groups || []);
      await this.persistGroupsFile(seeded);
      await this.store.set({ groups: seeded });
      return seeded;
    }
  }

  async writeGroupsData(groups) {
    const next = await this.persistGroupsFile(groups);
    await this.store.set({ groups: next });
    return next;
  }

  async mutateGroups(mutator) {
    const current = await this.loadGroupsData();
    const draft = clone(current);
    const result = await mutator(draft);
    const next = Array.isArray(result) ? result : draft;
    return this.writeGroupsData(next);
  }

  defaultBuyerIntentKeywords() {
    return normalizeKeywordList(DEFAULT_BUYER_INTENT_KEYWORDS);
  }

  normalizeBuyerIntentKeywordsPayload(raw) {
    const payload = parseMaybeJson(raw, raw);
    const keywords = normalizeKeywordList(payload?.keywords, this.defaultBuyerIntentKeywords());
    return {
      keywords,
      updatedAt: payload?.updatedAt || nowIso(),
    };
  }

  async persistBuyerIntentKeywords(payload) {
    if (!this.buyerIntentKeywordsFile) {
      return this.normalizeBuyerIntentKeywordsPayload(payload);
    }
    const normalized = this.normalizeBuyerIntentKeywordsPayload(payload);
    await fs.mkdir(path.dirname(this.buyerIntentKeywordsFile), { recursive: true });
    await fs.writeFile(this.buyerIntentKeywordsFile, JSON.stringify(normalized, null, 2), 'utf8');
    return normalized;
  }

  async loadBuyerIntentKeywords() {
    const fallback = this.normalizeBuyerIntentKeywordsPayload({});
    if (!this.buyerIntentKeywordsFile) return fallback;
    try {
      const raw = await fs.readFile(this.buyerIntentKeywordsFile, 'utf8');
      const parsed = JSON.parse(raw);
      const normalized = this.normalizeBuyerIntentKeywordsPayload(parsed);
      if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
        await this.persistBuyerIntentKeywords(normalized);
      }
      return normalized;
    } catch (error) {
      await this.persistBuyerIntentKeywords(fallback);
      return fallback;
    }
  }

  async saveBuyerIntentKeywords(raw) {
    return this.persistBuyerIntentKeywords(raw);
  }

  findMatchingBuyerIntentKeyword(postText, keywords = []) {
    const haystack = foldSearchText(postText);
    if (!haystack) return '';
    return keywords.find((keyword) => haystack.includes(foldSearchText(keyword))) || '';
  }

  sanitizeCpcConfig(config = {}) {
    const averageCpc = Number(config.average_cpc || 0);
    const perSubid = config.per_subid && typeof config.per_subid === 'object'
      ? Object.fromEntries(
        Object.entries(config.per_subid)
          .map(([key, value]) => [String(key || '').trim(), Number(value || 0)])
          .filter(([key, value]) => key && Number.isFinite(value))
      )
      : {};
    return {
      average_cpc: Number.isFinite(averageCpc) ? averageCpc : 0,
      per_subid: perSubid,
    };
  }

  revenueSnapshot(raw = {}) {
    const filter = parseMaybeJson(raw, {});
    const bounds = rangeBounds(filter);
    const orders = Array.isArray(this.store.data.orders) ? this.store.data.orders : [];
    const clicks = Array.isArray(this.store.data.clicks) ? this.store.data.clicks : [];
    const cpcConfig = this.sanitizeCpcConfig(this.store.data.cpcConfig || {});

    const filteredOrders = orders.filter((order) => inRangeDate(fromUnixSeconds(order.purchase_time || order.click_time), bounds));
    const filteredClicks = clicks.filter((click) => inRangeDate(fromUnixSeconds(click.click_time), bounds));
    const orderRows = filteredOrders.map((order) => {
      const item = firstOrderItem(order);
      const parsed = parseSubId(order.utm_content);
      const gmv = flattenOrderItems(order).reduce((sum, row) => sum + toMoney(row.item.actual_amount), 0);
      const comm = toMoney(order.estimated_total_commission);
      const xtraComm = toMoney(order.total_brand_commission);
      const sourceText = `${order.direct_source || ''} ${order.last_external_source || ''}`.toLowerCase();
      const orderType = sourceText.includes('video')
        ? 'video'
        : sourceText.includes('live')
          ? 'live'
          : 'social';
      return {
        order_id: (order.orders || [])[0]?.order_sn || order.order_id || '',
        time: fromUnixSeconds(order.purchase_time || order.click_time),
        product: item.item_name || order.utm_content || '-',
        shop: item.shop_name || '-',
        category: item.global_category_lv1_name || 'Khác',
        gmv,
        comm,
        xtraComm,
        shopeeComm: Math.max(0, comm - xtraComm),
        channel: firstNonEmpty(order.direct_source, order.last_external_source, 'Không rõ'),
        sourceType: orderType,
        subId: parsed.full,
        sub1: parsed.sub1 || '-',
        sub2: parsed.sub2 || '-',
        sub3: parsed.sub3 || '-',
        sub4: parsed.sub4 || (parsed.groupId ? `group${parsed.groupId}` : '-'),
        sub5: parsed.sub5 || '-',
        status: statusFromOrder(order),
      };
    }).sort((a, b) => b.time - a.time);

    const clickRows = filteredClicks.map((click) => {
      const parsed = parseSubId(click.sub_id);
      return {
        click_id: click.click_id || '',
        click_time: click.click_time,
        time: fromUnixSeconds(click.click_time),
        source: firstNonEmpty(click.direct_source, click.last_external_source, click.first_external_source, click.referrer, '-'),
        subids: fullSubIdOf(click),
        sub1: parsed.sub1 || '-',
        sub2: parsed.sub2 || '-',
        sub3: parsed.sub3 || '-',
        sub4: parsed.sub4 || (parsed.groupId ? `group${parsed.groupId}` : '-'),
        sub5: parsed.sub5 || '-',
      };
    }).sort((a, b) => b.time - a.time);

    const overview = {
      gmv: orderRows.reduce((sum, row) => sum + row.gmv, 0),
      commission: orderRows.reduce((sum, row) => sum + row.comm, 0),
      xtraComm: orderRows.reduce((sum, row) => sum + row.xtraComm, 0),
      shopeeComm: orderRows.reduce((sum, row) => sum + row.shopeeComm, 0),
      orders: filteredOrders.length,
      clicks: filteredClicks.length,
    };
    overview.epc = overview.clicks ? Math.round(overview.commission / overview.clicks) : 0;
    overview.cvr = overview.clicks ? (overview.orders / overview.clicks) * 100 : 0;
    overview.commRate = overview.gmv ? (overview.commission / overview.gmv) * 100 : 0;
    overview.avgOrder = overview.orders ? Math.round(overview.gmv / overview.orders) : 0;
    overview.byType = {
      video: { orders: 0, gmv: 0, comm: 0 },
      live: { orders: 0, gmv: 0, comm: 0 },
      social: { orders: 0, gmv: 0, comm: 0 },
      zero: { orders: 0, gmv: 0, comm: 0 },
      cancelled: { orders: 0, gmv: 0, comm: 0 },
    };
    for (const row of orderRows) {
      const bucket = overview.byType[row.sourceType] || overview.byType.social;
      bucket.orders += 1;
      bucket.gmv += row.gmv;
      bucket.comm += row.comm;
      if (!row.gmv) {
        overview.byType.zero.orders += 1;
        overview.byType.zero.comm += row.comm;
      }
      if (row.status === 'Đã hủy') {
        overview.byType.cancelled.orders += 1;
        overview.byType.cancelled.gmv += row.gmv;
        overview.byType.cancelled.comm += row.comm;
      }
    }

    const bySub = {};
    for (const click of clickRows) {
      const key = click.subids || '----';
      const row = bySub[key] ||= {
        ...parseSubId(key),
        full: key,
        type: String(click.sub1 || '').toLowerCase() === 'seeding' ? 'Auto' : 'Manual',
        clicks: 0,
        orders: 0,
        comm: 0,
      };
      row.clicks += 1;
    }
    for (const order of filteredOrders) {
      const key = fullSubIdOf(order) || '----';
      const row = bySub[key] ||= {
        ...parseSubId(key),
        full: key,
        type: String(parseSubId(key).sub1 || '').toLowerCase() === 'seeding' ? 'Auto' : 'Manual',
        clicks: 0,
        orders: 0,
        comm: 0,
      };
      row.orders += 1;
      row.comm += toMoney(order.estimated_total_commission);
    }
    const subRows = Object.values(bySub).map((row) => {
      const cpc = Number(
        cpcConfig.per_subid[row.full]
        ?? cpcConfig.per_subid[row.sub3]
        ?? cpcConfig.per_subid[row.sub4]
        ?? cpcConfig.average_cpc
        ?? 0
      ) || 0;
      const profit = row.comm - row.clicks * cpc;
      return {
        ...row,
        sub1: row.sub1 || '-',
        sub2: row.sub2 || '-',
        sub3: row.sub3 || '-',
        sub4: row.sub4 || (row.groupId ? `group${row.groupId}` : '-'),
        sub5: row.sub5 || '-',
        epc: row.clicks ? row.comm / row.clicks : 0,
        cvr: row.clicks ? (row.orders / row.clicks) * 100 : 0,
        cpc,
        profit,
        rating: profit > 50000 ? 'Tốt' : profit > 0 ? 'Khá' : 'Lỗ',
      };
    }).sort((a, b) => b.comm - a.comm || b.clicks - a.clicks);

    const productMap = {};
    const shopMap = {};
    const categoryMap = {};
    for (const order of filteredOrders) {
      for (const row of flattenOrderItems(order)) {
        const productName = row.item.item_name || 'Không rõ sản phẩm';
        const shopName = row.item.shop_name || 'Không rõ shop';
        const category = row.item.global_category_lv1_name || 'Khác';
        const gmv = toMoney(row.item.actual_amount);
        const comm = toMoney(row.item.item_commission);
        const qty = Number(row.item.qty || 1) || 1;
        const product = productMap[productName] ||= { name: productName, shop: shopName, category, orders: 0, sold: 0, clicks: 0, gmv: 0, comm: 0, epc: 0 };
        product.orders += qty;
        product.sold += qty;
        product.gmv += gmv;
        product.comm += comm;
        const shop = shopMap[shopName] ||= { name: shopName, orders: 0, gmv: 0, comm: 0, rate: 0 };
        shop.orders += qty;
        shop.gmv += gmv;
        shop.comm += comm;
        shop.rate = shop.gmv ? (shop.comm / shop.gmv) * 100 : 0;
        const categoryRow = categoryMap[category] ||= { name: category, gmv: 0 };
        categoryRow.gmv += gmv;
      }
    }
    const topProducts = Object.values(productMap).sort((a, b) => b.comm - a.comm).slice(0, 20);
    const topShops = Object.values(shopMap).sort((a, b) => b.comm - a.comm).slice(0, 20);
    const topCategories = Object.values(categoryMap).sort((a, b) => b.gmv - a.gmv).slice(0, 8);

    const hourlyRows = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, clicks: 0 }));
    for (const row of orderRows) hourlyRows[row.time.getHours()].orders += 1;
    for (const row of clickRows) hourlyRows[row.time.getHours()].clicks += 1;

    const dailyMap = {};
    for (const row of orderRows) {
      const day = new Date(row.time.getFullYear(), row.time.getMonth(), row.time.getDate());
      const key = day.toISOString().slice(0, 10);
      const bucket = dailyMap[key] ||= { date: day, gmv: 0, comm: 0, orders: 0, clicks: 0, clicksSeedingComment: 0, clicksOther: 0 };
      bucket.gmv += row.gmv;
      bucket.comm += row.comm;
      bucket.orders += 1;
    }
    for (const row of clickRows) {
      const day = new Date(row.time.getFullYear(), row.time.getMonth(), row.time.getDate());
      const key = day.toISOString().slice(0, 10);
      const bucket = dailyMap[key] ||= { date: day, gmv: 0, comm: 0, orders: 0, clicks: 0, clicksSeedingComment: 0, clicksOther: 0 };
      bucket.clicks += 1;
      if (String(row.sub1 || '').toLowerCase() === 'seeding' && String(row.sub2 || '').toLowerCase() === 'comment') {
        bucket.clicksSeedingComment += 1;
      } else {
        bucket.clicksOther += 1;
      }
    }

    const compareWindow = (from, to) => orderRows.reduce((acc, row) => {
      if (row.time >= from && row.time < to) {
        acc.gmv += row.gmv;
        acc.comm += row.comm;
        acc.ord += 1;
      }
      return acc;
    }, { gmv: 0, comm: 0, ord: 0 });
    const allDays = orderRows.map((row) => new Date(row.time.getFullYear(), row.time.getMonth(), row.time.getDate()).getTime());
    const latestDay = allDays.length ? new Date(Math.max(...allDays)) : new Date();
    const previousDay = new Date(latestDay.getTime() - DAY_MS);
    const periodFrom = bounds.from ? new Date(bounds.from.getFullYear(), bounds.from.getMonth(), bounds.from.getDate()) : previousDay;
    const periodToStart = bounds.to ? new Date(bounds.to.getFullYear(), bounds.to.getMonth(), bounds.to.getDate()) : latestDay;
    const periodTo = new Date(periodToStart.getTime() + DAY_MS);
    const periodDays = Math.max(1, Math.round((periodTo - periodFrom) / DAY_MS));
    const prevPeriodFrom = new Date(periodFrom.getTime() - periodDays * DAY_MS);
    overview.compare = {
      lastDay: compareWindow(latestDay, new Date(latestDay.getTime() + DAY_MS)),
      prevDay: compareWindow(previousDay, latestDay),
      lastDayLabel: `${String(latestDay.getDate()).padStart(2, '0')}/${String(latestDay.getMonth() + 1).padStart(2, '0')}`,
      prevDayLabel: `${String(previousDay.getDate()).padStart(2, '0')}/${String(previousDay.getMonth() + 1).padStart(2, '0')}`,
      currPeriod: compareWindow(periodFrom, periodTo),
      prevPeriod: compareWindow(prevPeriodFrom, periodFrom),
      periodDays,
    };

    return {
      filter,
      bounds,
      filteredOrders,
      filteredClicks,
      orderRows,
      clickRows,
      overview,
      subRows,
      topProducts,
      topShops,
      topCategories,
      hourlyRows,
      dailyRows: Object.values(dailyMap).sort((a, b) => a.date - b.date),
      cpcConfig,
    };
  }

  emitSyncState(mode, status, message, extra = {}) {
    this.events.data({
      type: 'sync',
      mode,
      status,
      message,
      ...extra,
    });
  }

  buildNineRouterHeaders(configUi = {}) {
    const headers = {
      Accept: 'application/json',
    };
    const token = normalizedText(configUi.routerToken || '');
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  normalizeNineRouterBaseUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
  }

  buildAnalysisSystemPrompt(configUi = {}) {
    const prompt = String(configUi.analyzePrompt || '').trim();
    if (prompt) return prompt;
    return [
      'Nhiệm vụ: phân tích bài viết sau để xác định người đăng có nhu cầu mua sản phẩm cụ thể hay không, và nếu có thì xác định tên sản phẩm cùng loại sản phẩm phù hợp.',
      '',
      'Quy tắc xác định IsBuy:',
      '- Nếu người đăng đang cần tìm, muốn mua, hỏi mua một sản phẩm cụ thể thì IsBuy=true.',
      '- Nếu người đăng hỏi người khác có ai bán, pass, thanh lý, nhượng lại sản phẩm cho mình không thì IsBuy=true.',
      '- Nếu người đăng là người đang bán, pass, thanh lý, quảng cáo sản phẩm của họ thì IsBuy=false.',
      '- Nếu là bài thu mua, nhận mua gom đồ cũ để kinh doanh thì IsBuy=false.',
      '- Nếu không rõ nhu cầu mua thì IsBuy=false.',
      '',
      'Quy tắc chọn ProductName:',
      '- ProductName là tên sản phẩm cốt lõi, rõ ràng, thông dụng, dễ dùng để match trong kho sản phẩm.',
      '- Chỉ lấy tên sản phẩm chính, không thêm giá, tình trạng, khu vực, số lượng hoặc tính từ quảng cáo.',
      '- Nếu không xác định được sản phẩm cụ thể thì ProductName = "".',
      '',
      'Quy tắc chọn CategoryName:',
      '- CategoryName là tên loại sản phẩm tổng quát hơn ProductName.',
      '- Nếu không suy ra được loại sản phẩm thì CategoryName = "".',
      '',
      'Chỉ trả về JSON hợp lệ, không markdown, không giải thích.',
      '{"IsBuy": boolean, "ProductName": "string", "CategoryName": "string"}',
    ].join('\n');
  }

  buildAnalysisUserPrompt(content, context = {}) {
    const text = String(content || '').trim();
    const groupName = normalizedText(context.groupName || '');
    return [
      groupName ? `Nhóm: ${groupName}` : '',
      'Nội dung post:',
      `"${text}"`,
    ].filter(Boolean).join('\n');
  }

  buildCommentSystemPrompt(configUi = {}) {
    const prompt = String(configUi.commentPrompt || '').trim();
    if (prompt) return prompt;
    return [
      'Nhiệm vụ: tạo comment seeding bán hàng tương ứng với từng link affiliate của sản phẩm.',
      'Mỗi link phải tạo đúng 1 comment riêng.',
      'Số lượng comment trả về phải đúng bằng số lượng link được cung cấp.',
      'Thứ tự comment phải khớp chính xác với thứ tự link đầu vào.',
      'Comment phải tự nhiên, ngắn gọn, giống người thật, không spam, không dùng markdown.',
      'Comment có thể gắn link trực tiếp vào nội dung nếu phù hợp.',
      'Chỉ trả về JSON hợp lệ là một mảng string.',
      'Ví dụ: ["comment 1", "comment 2"]',
    ].join('\n');
  }

  buildCommentUserPrompt(productName, affiliateLinks = []) {
    return [
      `Tên sản phẩm: ${String(productName || '').trim()}`,
      'Danh sách link affiliate:',
      ...affiliateLinks.map((link, index) => `${index + 1}. ${link}`),
      '',
      'Hãy trả về mảng comment theo đúng thứ tự link ở trên.',
    ].join('\n');
  }

  buildNineRouterChatPayload(content, context = {}, configUi = {}) {
    const text = String(content || '').trim();
    const model = normalizedText(configUi.combo || '');
    if (!text) return null;
    if (!model) {
      throw new Error('Chưa nhập 9Router Model.');
    }
    return {
      model,
      messages: [
        {
          role: 'system',
          content: this.buildAnalysisSystemPrompt(configUi),
        },
        {
          role: 'user',
          content: this.buildAnalysisUserPrompt(text, context),
        },
      ],
      stream: false,
      temperature: 0,
      max_tokens: 300,
    };
  }

  buildNineRouterCommentPayload(productName, affiliateLinks = [], configUi = {}) {
    const model = normalizedText(configUi.combo || '');
    if (!model) {
      throw new Error('Chưa nhập 9Router Model.');
    }
    const links = this.normalizeAffiliateLinks(affiliateLinks);
    if (!links.length) {
      throw new Error('Sản phẩm chưa có link affiliate để sinh comment.');
    }
    return {
      model,
      messages: [
        {
          role: 'system',
          content: this.buildCommentSystemPrompt(configUi),
        },
        {
          role: 'user',
          content: this.buildCommentUserPrompt(productName, links),
        },
      ],
      stream: false,
      temperature: 0,
      max_tokens: 600,
    };
  }

  parseChatCompletionContent(data) {
    const content = firstNonEmpty(
      data?.choices?.[0]?.message?.content,
      data?.choices?.[0]?.text,
      data?.message?.content,
      data?.content,
      '',
    );
    if (!content) return null;
    try {
      return JSON.parse(content);
    } catch (_) {
      const text = String(content).trim();
      const arrayMatch = text.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          return JSON.parse(arrayMatch[0]);
        } catch (_) {
          // Fall through and try object payload next.
        }
      }
      const objectMatch = text.match(/\{[\s\S]*\}/);
      if (!objectMatch) return null;
      try {
        return JSON.parse(objectMatch[0]);
      } catch (_) {
        return null;
      }
    }
  }

  parseCommentArrayResponse(data) {
    const parsed = this.parseChatCompletionContent(data);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => normalizedText(item)).filter(Boolean);
    }
    if (Array.isArray(parsed?.comments)) {
      return parsed.comments.map((item) => {
        if (typeof item === 'string') return normalizedText(item);
        return normalizedText(item?.comment || item?.text || item?.content || '');
      }).filter(Boolean);
    }
    return [];
  }

  parseNineRouterResponseData(data) {
    if (!data || typeof data !== 'object') return [];
    const direct = [data];
    const nestedKeys = ['data', 'result', 'output', 'response'];
    nestedKeys.forEach((key) => {
      const value = data[key];
      if (value && typeof value === 'object') direct.push(value);
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          if (parsed && typeof parsed === 'object') direct.push(parsed);
        } catch (_) {
          // Ignore non-JSON string payloads.
        }
      }
    });
    return direct;
  }

  async analyzePostContent(content, context = {}, configOverride = null) {
    const configUi = this.normalizeConfigUi(configOverride || {}, this.store.data.configUi || {});
    const payload = this.buildNineRouterChatPayload(content, context, configUi);
    if (!payload) return null;
    if (!configUi.routerUrl) {
      throw new Error('Chưa nhập URL 9Router trong phần Cấu hình.');
    }
    const baseUrl = this.normalizeNineRouterBaseUrl(configUi.routerUrl);
    const requestUrl = `${baseUrl}/v1/chat/completions`;
    this.log(
      'info',
      'ANALYZE',
      `Gọi 9Router phân tích buyer intent${context.groupName ? ` ở nhóm ${context.groupName}` : ''}: ${requestUrl}`
    );
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        ...this.buildNineRouterHeaders(configUi),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const raw = await response.text();
    const preview = raw.replace(/\s+/g, ' ').trim().slice(0, 220) || '(empty)';
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch (_) {
      if (!response.ok) {
        const hint = response.status === 405
          ? ' Endpoint hiện tại không cho phép method POST. Hãy kiểm tra lại bạn đang nhập đúng API endpoint của 9Router hay chỉ là base URL/dashboard URL.'
          : '';
        this.log(
          'error',
          'ANALYZE',
          `9Router lỗi HTTP ${response.status} tại ${requestUrl}. Preview: ${preview}`
        );
        throw new Error(`9Router trả lỗi HTTP ${response.status} tại ${requestUrl}.${hint} Preview: ${preview}`);
      }
      this.log(
        'error',
        'ANALYZE',
        `9Router không trả JSON hợp lệ tại ${requestUrl} (status ${response.status}). Preview: ${preview}`
      );
      throw new Error(`9Router không trả JSON hợp lệ (status ${response.status}) tại ${requestUrl}. Preview: ${preview}`);
    }
    this.log(
      response.ok && data?.success !== false ? 'success' : 'warn',
      'ANALYZE',
      `Response 9Router: ${JSON.stringify(data)}`
    );
    if (!response.ok) {
      const detail = normalizedText(
        data?.message
        || data?.error
        || data?.detail
        || data?.errors?.[0]?.message
        || ''
      );
      const hint = response.status === 405
        ? ' Endpoint hiện tại không cho phép method POST. Hãy kiểm tra lại bạn đang nhập đúng API endpoint của 9Router hay chỉ là base URL/dashboard URL.'
        : '';
      this.log(
        'error',
        'ANALYZE',
        `9Router lỗi HTTP ${response.status} tại ${requestUrl}.${detail ? ` Chi tiết: ${detail}.` : ''} Preview: ${preview}`
      );
      throw new Error(`9Router trả lỗi HTTP ${response.status} tại ${requestUrl}.${hint}${detail ? ` Chi tiết: ${detail}.` : ''} Preview: ${preview}`);
    }
    const parsedContent = this.parseChatCompletionContent(data);
    if (!parsedContent) {
      this.log(
        'error',
        'ANALYZE',
        `9Router chat completions không trả JSON parse được tại ${requestUrl}. Preview: ${preview}`
      );
      throw new Error(`9Router trả về chat completion nhưng content không parse được thành JSON tại ${requestUrl}. Preview: ${preview}`);
    }
    return {
      success: true,
      raw: data,
      data: parsedContent,
    };
  }

  extractAnalysisPlan(analysis, postText = '') {
    if (!analysis || typeof analysis !== 'object') return null;
    if (analysis.success === false) return null;

    const nested = this.parseNineRouterResponseData(analysis);

    const isBuyValue = firstNonEmpty(
      ...nested.map((item) => firstNonEmpty(
        item.IsBuy,
        item.isBuy,
        item.is_buy,
        item.buyerIntent,
        item.buyer_intent,
      )),
    );
    const isBuy = coerceBoolean(isBuyValue);
    if (isBuy === false) return null;

    const productName = firstNonEmpty(
      ...nested.map((item) => firstNonEmpty(
        item.ProductName,
        item.productName,
        item.product_name,
        item.product,
        item.itemName,
        item.item_name,
        item.keyword,
      )),
    ).trim();

    const categoryName = firstNonEmpty(
      ...nested.map((item) => firstNonEmpty(
        item.CategoryName,
        item.categoryName,
        item.category_name,
        item.category,
        item.productCategory,
        item.product_category,
        item.categoryLabel,
        item.category_label,
      )),
    ).trim();
    if (!productName && !categoryName) return null;

    return {
      productName,
      categoryName,
      isBuy: isBuy !== false,
      comments: [],
    };
  }

  async executeCommentPlanForGroup({
    crawler,
    group,
    actionablePosts,
    runConfig,
    runRecord,
  }) {
    const commentResults = [];
    let moderationHits = 0;
    let skipGroup = false;

    for (let postIndex = 0; postIndex < actionablePosts.length; postIndex += 1) {
      if (this.loopControl.stop || skipGroup) break;
      while (this.loopControl.pause && !this.loopControl.stop) {
        await delay(300);
      }

        const post = actionablePosts[postIndex];
        const candidates = Array.isArray(post.analysisPlan?.comments)
          ? post.analysisPlan.comments.slice(0, MAX_COMMENT_ATTEMPTS_PER_POST)
          : [];
      if (!candidates.length) continue;

      let postHandled = false;
      for (let attemptIndex = 0; attemptIndex < candidates.length; attemptIndex += 1) {
        const commentText = normalizedText(candidates[attemptIndex]);
        if (!commentText) continue;

        this.log(
          'info',
          'COMMENT',
          `[${group.name || group.url}] Thử comment lần ${attemptIndex + 1}/${candidates.length} cho sản phẩm ${post.analysisPlan.productName}.`,
        );

        const result = await crawler.commentOnPost({
          groupUrl: group.url,
          post,
          commentText,
          deleteUnapproved: runConfig.deleteUnapproved,
        });
        const status = String(result?.status || 'fail').toLowerCase();
        const permalink = /\/groups\/[^/]+\/posts\/\d+/i.test(String(result?.finalUrl || ''))
          || /permalink/i.test(String(result?.finalUrl || ''))
          ? result.finalUrl
          : (post.url || result?.finalUrl || '');
        const record = {
          status,
          commentText,
          productName: post.analysisPlan.productName,
          productId: post.analysisPlan.productId || '',
          permalink,
          groupUrl: group.url,
          postText: post.text || '',
          deleted: !!result?.deleted,
          commentPosition: attemptIndex + 1,
        };
        commentResults.push(record);

        if (status === 'posted') {
          runRecord.direct += 1;
          this.runtime.direct += 1;
          this.emitRuntime();
          postHandled = true;
          break;
        }

        if (status === 'blocked') {
          runRecord.fail += 1;
          this.loopControl.stop = true;
          this.log('error', 'COMMENT', 'Facebook đang chặn tính năng comment của tài khoản hiện tại, dừng bot.');
          postHandled = true;
          break;
        }

        if (status === 'pending' || status === 'rejected') {
          moderationHits += 1;
          if (status === 'pending') {
            runRecord.pending += 1;
          } else {
            runRecord.rejected += 1;
          }

          if (moderationHits >= MAX_GROUP_MODERATION_HITS) {
            skipGroup = true;
            postHandled = true;
            this.log(
              'warning',
              'COMMENT',
              `[${group.name || group.url}] Dính moderation ${moderationHits} lần, bỏ qua phần còn lại của group.`,
            );
            break;
          }

          if (attemptIndex < candidates.length - 1) {
            this.log(
              'warning',
              'COMMENT',
              `[${group.name || group.url}] Comment bị ${status === 'pending' ? 'chờ duyệt' : 'từ chối'}, đợi 10 giây trước khi thử comment tiếp theo.`,
            );
            const keepGoing = await this.waitWithLoopControl(COMMENT_RETRY_DELAY_MS);
            if (!keepGoing) break;
            continue;
          }
        } else {
          runRecord.fail += 1;
        }

        postHandled = true;
        break;
      }

      if (!postHandled) {
        this.log('warning', 'COMMENT', `[${group.name || group.url}] Không comment được cho bài ${post.url || post.id || '(unknown post)'}.`);
      }
    }

    return { commentResults, skipGroup };
  }

  summarySnapshot() {
    const state = this.store.data;
    const enabledGroups = state.groups.filter((group) => group.enabled !== false);
    return {
      groups: state.groups.length,
      enabledGroups: enabledGroups.length,
      products: state.products.length,
      comments: state.history.length,
      orders: Array.isArray(state.orders) ? state.orders.length : 0,
      clicks: Array.isArray(state.clicks) ? state.clicks.length : 0,
    };
  }

  progressSnapshot() {
    return {
      groups: this.runtime.current_group_index || 0,
      totalGroups: this.runtime.total_groups || 0,
      scanned: this.runtime.scanned || 0,
      suitable: this.runtime.suitable || 0,
      direct: this.runtime.direct || 0,
      telegram: this.runtime.telegram || 0,
      workflowMode: this.runtime.workflow_mode || this.store.data.configUi.workflow || 'full',
    };
  }

  async getState() {
    await this.loadCrawlerConfigData();
    const browsers = await this.refreshBrowserChoices();
    const groupTypes = await this.loadGroupTypesData();
    const facebookAccounts = await this.loadFacebookAccountsData();
    const productTypes = await this.loadProductTypesData();
    const configUi = {
      ...this.store.data.configUi,
      browserChoices: this.store.data.configUi.browserChoices?.length ? this.store.data.configUi.browserChoices : browsers,
    };
    return {
      bot: {
        status: this.botState.status,
        scope: this.botState.scope,
      },
      configUi,
      groupTypes,
      productTypes,
      facebookAccounts: this.decorateFacebookAccounts(facebookAccounts),
      progress: this.progressSnapshot(),
      summary: this.summarySnapshot(),
      workers: this.workerManager ? this.workerManager.snapshot() : [],
      update: null,
      whatsnew: null,
    };
  }

  async applyGroupResults({
    group,
    posts = [],
    matchedPosts = [],
    commentResults = [],
    runConfig,
    now = new Date(),
    workerId = null,
  }) {
    if (!group) return null;
    const stamp = now instanceof Date ? now : new Date(now);
    const activeWorker = workerId
      ? this.workerManager?.findWorker?.(workerId)
      : this.currentWorker();
    const activeFacebookAccountId = String(activeWorker?.facebookAccountId || '').trim();
    const activeFacebookAccountName = activeWorker?.accountLabel || runConfig.browserType;
    const successfulComments = commentResults.filter((item) => item?.status === 'posted').length;
    const pendingComments = commentResults.filter((item) => item?.status === 'pending').length;
    const rejectedComments = commentResults.filter((item) => item?.status === 'rejected').length;
    const failedComments = commentResults.filter((item) => !['posted', 'pending', 'rejected'].includes(String(item?.status || ''))).length;

    if (matchedPosts.length || commentResults.length) {
      await this.store.mutate((state) => {
        state.groups = state.groups.map((item) => (
          item.id === group.id
            ? {
                ...item,
                lastScan: stamp.toLocaleString('vi-VN', { hour12: false }),
                scanned: Number(item.scanned || 0) + posts.length,
                matched: Number(item.matched || 0) + matchedPosts.length,
                comments: Number(item.comments || 0) + successfulComments,
                pending: Number(item.pending || 0) + pendingComments,
                rejected: Number(item.rejected || 0) + rejectedComments,
                fail: Number(item.fail || 0) + failedComments,
              }
            : item
        ));
        matchedPosts.forEach((post, matchedIndex) => {
          const plan = post.analysisPlan || {};
          const normalizedProducts = this.normalizeProducts(state.products || []);
          let resolvedProduct = normalizedProducts.find((item) => String(item.id) === String(plan.productId || ''));
          if (!resolvedProduct && plan.productName) {
            resolvedProduct = normalizedProducts.find((item) => this.productMatchesName(item, plan.productName));
          }

          if (!resolvedProduct && plan.productName) {
            const created = this.normalizeProduct({
              id: `${Date.now()}-${matchedIndex}`,
              keyword: slugifyId(plan.productName, `product-${matchedIndex + 1}`),
              product_name: plan.productName,
              name: plan.productName,
              url: '',
              original_url: '',
              status: 'pending',
              category: '',
              productTypeId: '',
              comments: [],
              demand_count: 0,
              worker_id: workerId || '',
              createdAt: nowIso(),
              updatedAt: nowIso(),
            }, state.products.length);
            state.products.unshift(created);
            resolvedProduct = created;
          }

          if (resolvedProduct) {
            state.products = state.products.map((item) => (
              String(item?.id || '') === String(resolvedProduct.id)
                ? this.normalizeProduct({
                    ...item,
                    demand_count: Number(item?.demand_count || 0) + 1,
                    updatedAt: nowIso(),
                  }, matchedIndex)
                : item
            ));
          }
        });

        commentResults.forEach((result, index) => {
          const status = String(result?.status || '').toLowerCase();
          if (!['posted', 'pending', 'rejected'].includes(status)) return;
          const parts = todayParts();
          state.history.unshift({
            id: `${Date.now()}-${matchedPosts.length}-${index}`,
            date: parts.date,
            time: parts.time,
            mode: status === 'posted' ? 'comment' : status,
            group: group.name || group.url,
            product: result.productName || '-',
            comment: String(result.commentText || '').slice(0, 800),
            permalink: result.permalink || '',
            account_name: activeFacebookAccountName,
            facebook_account_id: activeFacebookAccountId,
            worker_id: workerId || '',
            product_id: result.productId || '',
            comment_position: Number(result.commentPosition || 0) || 0,
          });
        });
        return state;
      });
      await this.persistGroupsFile(this.store.data.groups);
      this.events.data({ type: 'products', status: 'imported', workerId });
      this.events.data({ type: 'history', status: 'updated', workerId });
    } else {
      await this.store.mutate((state) => {
        state.groups = state.groups.map((item) => (
          item.id === group.id
            ? {
                ...item,
                lastScan: stamp.toLocaleString('vi-VN', { hour12: false }),
                scanned: Number(item.scanned || 0) + posts.length,
              }
            : item
        ));
        return state;
      });
      await this.persistGroupsFile(this.store.data.groups);
    }
    return true;
  }

  async applyRunSummary({ runId, runRows = [], stopped = false, workerId = null }) {
    await this.store.mutate((state) => {
      state.runs.unshift({
        id: runId,
        label: `Run ${new Date().toLocaleString('vi-VN', { hour12: false })}`,
        startedAt: nowIso(),
        status: stopped ? 'stopped' : 'done',
        runs: runRows.reduce((sum, row) => sum + Number(row.runs || 0), 0),
        scanned: runRows.reduce((sum, row) => sum + Number(row.scanned || 0), 0),
        suitable: runRows.reduce((sum, row) => sum + Number(row.suitable || 0), 0),
        children: runRows,
        worker_id: workerId || '',
      });
      return state;
    });
    this.events.data({ type: 'runs', status: stopped ? 'stopped' : 'done', workerId });
    return true;
  }

  emitStatus(extra = {}) {
    this.events.status({
      state: this.botState.status,
      text: extra.text || this.botState.text,
      scope: this.botState.scope,
      ...extra,
    });
  }

  emitRuntime(extra = {}) {
    this.events.runtime({
      ...this.runtime,
      ...extra,
    });
  }

  async waitWithLoopControl(ms) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < ms) {
      if (this.loopControl.stop) return false;
      while (this.loopControl.pause && !this.loopControl.stop) {
        await delay(300);
      }
      if (this.loopControl.stop) return false;
      await delay(Math.min(300, Math.max(100, ms - (Date.now() - startedAt))));
    }
    return !this.loopControl.stop;
  }

  async saveConfigUi(raw) {
    const incoming = parseMaybeJson(raw, {});
    const merged = this.normalizeConfigUi({
      ...this.store.data.configUi,
      ...incoming,
    });
    await this.syncCrawlerConfig(merged);
    this.events.data({ type: 'config', status: 'saved' });
    return { configUi: this.store.data.configUi };
  }

  async scanBrowsers() {
    const browsers = await this.refreshBrowserChoices();
    return { browsers };
  }

  async detectInstalledBrowsers() {
    const browsers = await this.browserManager.scanBrowsers({ includeUnsupported: true });
    return { browsers };
  }

  async detectBrowserPath(browserType = 'chrome') {
    const browsers = await this.browserManager.scanBrowsers();
    const found = browsers.find((browser) => browser.type === browserType);
    return { paths: found?.paths || [] };
  }

  async scanBrowserProfiles(browserType = 'chrome') {
    const profiles = await this.browserManager.scanProfiles(browserType);
    await this.store.mutate((state) => {
      state.configUi.browserProfiles = profiles;
      return state;
    });
    return { profiles };
  }

  async connectBrowser(configUiOverride = null) {
    if (this.workerManager) {
      const primaryWorker = await this.ensurePrimaryWorker();
      if (!primaryWorker) throw new Error('Chưa có worker mặc định.');
      const groups = await this.loadGroupsData();
      const workerGroups = this.filterGroupsForWorker(primaryWorker, groups);
      const configUi = this.workerConfigUi(primaryWorker, configUiOverride || null);
      const info = await this.workerManager.connectBrowser(primaryWorker.id, configUi, workerGroups);
      return this.finalizeWorkerBrowserSession(primaryWorker, info);
    }
    const configUi = this.normalizeConfigUi(configUiOverride || this.store.data.configUi);
    const { info } = await this.browserManager.connect(configUi);
    const crawler = this.browserManager.activeCrawler(configUi.browserType);
    const sessionRestore = crawler
      ? await this.restoreWorkerFacebookSession(crawler)
      : { attempted: false, restored: false, reason: 'crawler-unavailable' };
    const browserInfo = {
      ...info,
      sessionRestore,
    };
    const restoreMessage = sessionRestore.attempted
      ? sessionRestore.restored
        ? ' Phiên Facebook đã được khôi phục từ cookie.'
        : (sessionRestore.error
          ? ` Không thể khôi phục cookie Facebook: ${sessionRestore.error}.`
          : ' Cookie Facebook đã được import, cần kiểm tra lại trạng thái đăng nhập.')
      : '';
    this.events.data({
      type: 'browser',
      connected: true,
      status: 'connected',
      info: browserInfo,
      message: `${info.label} ${info.mode === 'attached' ? 'đã attach vào browser đang mở' : 'đã được mở với remote debugging'}.${restoreMessage}`,
    });
    this.log('success', 'BROWSER', `${info.label} connected (${info.mode})`);
    return browserInfo;
  }

  async closeDriver() {
    if (this.workerManager) {
      const primaryWorker = await this.ensurePrimaryWorker();
      if (!primaryWorker) return { disconnected: false };
      return this.workerManager.closeDriver(primaryWorker.id);
    }
    await this.browserManager.disconnect();
    this.events.data({
      type: 'browser',
      connected: false,
      status: 'idle',
      message: 'Đã ngắt kết nối browser.',
    });
    this.log('info', 'BROWSER', 'Browser disconnected');
    return { disconnected: true };
  }

  async getBotStatus() {
    if (this.workerManager) {
      const primaryWorker = await this.ensurePrimaryWorker();
      if (!primaryWorker) return { status: this.botState.status, runtime: this.runtime };
      return this.workerManager.getBotStatus(primaryWorker.id);
    }
    return {
      status: this.botState.status,
      runtime: this.runtime,
    };
  }

  async listWorkers() {
    if (!this.workerManager) return { workers: [] };
    await this.ensurePrimaryWorker();
    return { workers: this.workerManager.snapshot() };
  }

  async createWorker(raw = '{}') {
    if (!this.workerManager) throw new Error('Worker manager chưa sẵn sàng.');
    const payload = parseMaybeJson(raw, {});
    const hasFacebookAccountField = Object.prototype.hasOwnProperty.call(payload, 'facebookAccountId');
    const accountBinding = hasFacebookAccountField
      ? await this.resolveFacebookAccountBinding(payload.facebookAccountId)
      : {};
    const worker = await this.workerManager.createWorker({ ...payload, ...accountBinding });
    this.events.data({ type: 'workers', status: 'created', workerId: worker.id });
    return { worker, workers: this.workerManager.snapshot() };
  }

  async updateWorker(raw = '{}') {
    if (!this.workerManager) throw new Error('Worker manager chưa sẵn sàng.');
    const payload = parseMaybeJson(raw, {});
    const workerId = String(payload.id || '').trim();
    if (!workerId) throw new Error('Thiếu worker id.');
    const currentWorker = this.workerManager.findWorker(workerId);
    if (!currentWorker) throw new Error('Không tìm thấy worker.');
    const hasFacebookAccountField = Object.prototype.hasOwnProperty.call(payload, 'facebookAccountId');
    const accountBinding = hasFacebookAccountField
      ? await this.resolveFacebookAccountBinding(payload.facebookAccountId, currentWorker)
      : {};
    const worker = await this.workerManager.updateWorker(workerId, {
      ...payload,
      ...accountBinding,
    });
    this.events.data({ type: 'workers', status: 'updated', workerId: worker.id });
    return { worker, workers: this.workerManager.snapshot() };
  }

  async deleteWorker(raw = '{}') {
    if (!this.workerManager) throw new Error('Worker manager chưa sẵn sàng.');
    const payload = parseMaybeJson(raw, {});
    const workerId = String(payload.id || '').trim();
    if (!workerId) throw new Error('Thiếu worker id.');
    const result = await this.workerManager.deleteWorker(workerId);
    this.events.data({ type: 'workers', status: 'deleted', workerId });
    return { ...result, workers: this.workerManager.snapshot() };
  }

  async connectWorkerBrowser(raw = '{}') {
    if (!this.workerManager) throw new Error('Worker manager chưa sẵn sàng.');
    const payload = parseMaybeJson(raw, {});
    const workerId = String(payload.id || '').trim();
    const worker = this.workerManager.findWorker(workerId);
    if (!worker) throw new Error('Không tìm thấy worker.');
    const groups = await this.loadGroupsData();
    const workerGroups = this.filterGroupsForWorker(worker, groups);
    const configUi = this.workerConfigUi(worker, payload.configUi || null);
    const info = await this.workerManager.connectBrowser(workerId, configUi, workerGroups);
    const nextInfo = await this.finalizeWorkerBrowserSession(worker, info);
    return { info: nextInfo, workers: this.workerManager.snapshot() };
  }

  async closeWorkerBrowser(raw = '{}') {
    if (!this.workerManager) throw new Error('Worker manager chưa sẵn sàng.');
    const payload = parseMaybeJson(raw, {});
    const workerId = String(payload.id || '').trim();
    const result = await this.workerManager.closeDriver(workerId);
    return { ...result, workers: this.workerManager.snapshot() };
  }

  async startWorkerBot(raw = '{}') {
    if (!this.workerManager) throw new Error('Worker manager chưa sẵn sàng.');
    const payload = parseMaybeJson(raw, {});
    const workerId = String(payload.id || '').trim();
    const worker = this.workerManager.findWorker(workerId);
    if (!worker) throw new Error('Không tìm thấy worker.');
    const groups = await this.loadGroupsData();
    const workerGroups = this.filterGroupsForWorker(worker, groups);
    const enabledGroups = workerGroups.filter((group) => group.enabled !== false && !group.paused && group.url);
    if (!enabledGroups.length) throw new Error('Worker này chưa có group hợp lệ để chạy.');
    const configUi = this.workerConfigUi(worker, payload.configUi || null);
    return this.workerManager.startBot(workerId, configUi, workerGroups);
  }

  async pauseWorkerBot(raw = '{}') {
    if (!this.workerManager) throw new Error('Worker manager chưa sẵn sàng.');
    const payload = parseMaybeJson(raw, {});
    return this.workerManager.pauseBot(String(payload.id || '').trim());
  }

  async resumeWorkerBot(raw = '{}') {
    if (!this.workerManager) throw new Error('Worker manager chưa sẵn sàng.');
    const payload = parseMaybeJson(raw, {});
    return this.workerManager.resumeBot(String(payload.id || '').trim());
  }

  async stopWorkerBot(raw = '{}') {
    if (!this.workerManager) throw new Error('Worker manager chưa sẵn sàng.');
    const payload = parseMaybeJson(raw, {});
    return this.workerManager.stopBot(String(payload.id || '').trim());
  }

  async loadFacebookAccounts() {
    const accounts = await this.loadFacebookAccountsData();
    return { accounts: this.decorateFacebookAccounts(accounts) };
  }

  async createFacebookAccount(raw = '{}') {
    const payload = parseMaybeJson(raw, {});
    const name = normalizedText(payload.name);
    if (!name) throw new Error('Tên Facebook không được để trống.');
    const cookieJson = validateFacebookCookieJsonPayload(payload.cookieJson ?? payload.facebookCookieJson ?? '');
    const accounts = await this.loadFacebookAccountsData();
    const baseId = slugifyId(payload.id || payload.name || `facebook-account-${accounts.length + 1}`, 'facebook-account');
    let accountId = baseId;
    let suffix = 2;
    while (this.findFacebookAccount(accountId, accounts)) {
      accountId = `${baseId}-${suffix}`;
      suffix += 1;
    }
    const account = this.normalizeFacebookAccount({
      ...payload,
      id: accountId,
      name,
      cookieJson,
      cookieStatus: 'unchecked',
      cookieCheckedAt: '',
      cookieStatusMessage: '',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }, accounts.length);
    const next = await this.writeFacebookAccountsData([...accounts, account]);
    this.events.data({ type: 'facebookAccounts', status: 'created', accountId: account.id });
    return {
      account: this.decorateFacebookAccounts([account])[0] || account,
      accounts: this.decorateFacebookAccounts(next),
    };
  }

  async updateFacebookAccount(raw = '{}') {
    const payload = parseMaybeJson(raw, {});
    const accountId = String(payload.id || '').trim();
    if (!accountId) throw new Error('Thiếu tài khoản Facebook id.');
    const accounts = await this.loadFacebookAccountsData();
    const current = this.findFacebookAccount(accountId, accounts);
    if (!current) throw new Error('Không tìm thấy tài khoản Facebook.');
    const updated = this.normalizeFacebookAccount({
      ...current,
      ...payload,
      id: current.id,
      name: normalizedText(payload.name || current.name) || current.name,
      cookieJson: payload.cookieJson != null || payload.facebookCookieJson != null
        ? validateFacebookCookieJsonPayload(payload.cookieJson ?? payload.facebookCookieJson ?? '')
        : current.cookieJson,
      cookieStatus: payload.cookieJson != null || payload.facebookCookieJson != null
        ? 'unchecked'
        : current.cookieStatus,
      cookieCheckedAt: payload.cookieJson != null || payload.facebookCookieJson != null
        ? ''
        : current.cookieCheckedAt,
      cookieStatusMessage: payload.cookieJson != null || payload.facebookCookieJson != null
        ? ''
        : current.cookieStatusMessage,
      createdAt: current.createdAt,
      updatedAt: nowIso(),
    }, accounts.findIndex((account) => account.id === accountId));
    const next = await this.writeFacebookAccountsData(accounts.map((account) => (
      account.id === accountId ? updated : account
    )));
    await this.syncAssignedWorkerFacebookAccount(updated);
    this.events.data({ type: 'facebookAccounts', status: 'updated', accountId: updated.id });
    return {
      account: this.decorateFacebookAccounts([updated])[0] || updated,
      accounts: this.decorateFacebookAccounts(next),
    };
  }

  async deleteFacebookAccount(raw = '{}') {
    const payload = parseMaybeJson(raw, {});
    const accountId = String(payload.id || '').trim();
    if (!accountId) throw new Error('Thiếu tài khoản Facebook id.');
    const assignedWorker = this.workerManager?.snapshot?.().find((worker) => (
      String(worker?.facebookAccountId || '').trim() === accountId
    ));
    if (assignedWorker) {
      throw new Error(`Tài khoản Facebook này đang được gắn cho worker ${assignedWorker.name || assignedWorker.id}.`);
    }
    const accounts = await this.loadFacebookAccountsData();
    const next = accounts.filter((account) => account.id !== accountId);
    if (next.length === accounts.length) throw new Error('Không tìm thấy tài khoản Facebook.');
    const written = await this.writeFacebookAccountsData(next);
    this.events.data({ type: 'facebookAccounts', status: 'deleted', accountId });
    return { deleted: true, accounts: this.decorateFacebookAccounts(written) };
  }

  async loadGroups() {
    return {
      groups: await this.loadGroupsData(),
      groupTypes: await this.loadGroupTypesData(),
    };
  }

  async loadGroupTypes() {
    return { groupTypes: await this.loadGroupTypesData() };
  }

  async saveGroupTypes(raw = '[]') {
    const payload = Array.isArray(raw) ? raw : parseMaybeJson(raw, []);
    const groupTypes = await this.writeGroupTypesData(payload);
    this.events.data({ type: 'groupTypes', status: 'saved' });
    return { groupTypes };
  }

  async saveGroups(raw) {
    const incoming = Array.isArray(raw) ? raw : parseMaybeJson(raw, []);
    const next = await this.writeGroupsData(incoming);
    this.events.data({ type: 'groups', status: 'saved' });
    return { groups: next };
  }

  async addGroup(raw) {
    const payload = typeof raw === 'string' ? { url: raw } : parseMaybeJson(raw, {});
    const clean = normalizeFacebookGroupUrl(payload.url || '');
    if (!clean || !isFacebookGroupUrl(clean)) throw new Error('URL group Facebook không hợp lệ.');
    const groups = await this.loadGroupsData();
    const exists = groups.find((group) => normalizeFacebookGroupUrl(group.url || '') === clean);
    if (exists) throw new Error('URL group đã tồn tại.');
    const nextGroup = {
      id: Date.now(),
      name: normalizedText(payload.name) || clean.replace(/^https?:\/\/(www\.)?facebook\.com\/groups\//i, '').replace(/[/?#].*$/, '') || `Group ${groups.length + 1}`,
      url: clean,
      groupTypeId: String(payload.groupTypeId || this.defaultGroupTypeId()).trim() || this.defaultGroupTypeId(),
      enabled: true,
      action: 'comment',
      lastScan: '—',
      scanned: 0,
      matched: 0,
      clicks: 0,
      orders: 0,
      commission: 0,
      rating: 'monitor',
      paused: false,
    };
    const next = await this.writeGroupsData([...groups, nextGroup]);
    this.events.data({ type: 'groups', status: 'added' });
    return { group: nextGroup, groups: next };
  }

  async updateGroup(raw = '{}') {
    const payload = parseMaybeJson(raw, {});
    const groupId = payload.id;
    if (groupId == null) throw new Error('Thiếu group id.');
    const nextUrl = normalizeFacebookGroupUrl(payload.url || '');
    if (!nextUrl || !isFacebookGroupUrl(nextUrl)) throw new Error('URL group Facebook không hợp lệ.');
    const next = await this.mutateGroups((groups) => {
      const duplicated = groups.find((group) => (
        String(group.id) !== String(groupId)
        && normalizeFacebookGroupUrl(group.url || '') === nextUrl
      ));
      if (duplicated) throw new Error('URL group đã tồn tại.');
      return groups.map((group) => (
        String(group.id) === String(groupId)
          ? {
              ...group,
              name: normalizedText(payload.name) || group.name,
              url: nextUrl,
              groupTypeId: String(payload.groupTypeId || group.groupTypeId || this.defaultGroupTypeId()).trim() || this.defaultGroupTypeId(),
            }
          : group
      ));
    });
    this.events.data({ type: 'groups', status: 'updated' });
    return { groups: next };
  }

  async deleteGroup(raw) {
    const payload = parseMaybeJson(raw, {});
    const url = normalizeFacebookGroupUrl(payload.url || '');
    const next = await this.mutateGroups((groups) => (
      groups.filter((group) => normalizeFacebookGroupUrl(group.url || '') !== url)
    ));
    this.events.data({ type: 'groups', status: 'deleted' });
    return { groups: next };
  }

  async bulkImportGroups(text) {
    const rawLines = String(text || '')
      .split(/\r?\n/)
      .map((line) => String(line || '').trim())
      .filter(Boolean);
    const groups = await this.loadGroupsData();
    const existingUrls = new Set(groups.map((group) => normalizeFacebookGroupUrl(group.url || '')));
    const next = [...groups];
    const invalidUrls = [];
    let added = 0;
    let duplicates = 0;
    for (const rawLine of rawLines) {
      const line = normalizeFacebookGroupUrl(rawLine);
      if (!line || !isFacebookGroupUrl(line)) {
        invalidUrls.push(rawLine);
        continue;
      }
      if (existingUrls.has(line)) {
        duplicates += 1;
        continue;
      }
      existingUrls.add(line);
      next.push(this.normalizeGroup({
        id: Date.now() + next.length,
        name: line.replace(/^https?:\/\/(www\.)?facebook\.com\/groups\//i, '').replace(/[/?#].*$/, '') || `Group ${next.length + 1}`,
        url: line,
        groupTypeId: this.defaultGroupTypeId(),
        enabled: true,
        action: 'comment',
        lastScan: '—',
        scanned: 0,
        matched: 0,
        clicks: 0,
        orders: 0,
        commission: 0,
        rating: 'monitor',
        paused: false,
      }, next.length));
      added += 1;
    }
    const written = await this.writeGroupsData(next);
    this.events.data({ type: 'groups', status: 'saved' });
    return {
      imported: rawLines.length,
      added,
      duplicates,
      invalid: invalidUrls.length,
      invalid_urls: invalidUrls,
      groups: written,
    };
  }

  async bulkDeleteGroups(text) {
    const rawLines = String(text || '')
      .split(/\r?\n/)
      .map((line) => String(line || '').trim())
      .filter(Boolean);
    const invalidUrls = [];
    const urls = new Set();
    for (const rawLine of rawLines) {
      const normalized = normalizeFacebookGroupUrl(rawLine);
      if (!normalized || !isFacebookGroupUrl(normalized)) {
        invalidUrls.push(rawLine);
        continue;
      }
      urls.add(normalized);
    }
    const current = await this.loadGroupsData();
    const removedUrls = current
      .map((group) => normalizeFacebookGroupUrl(group.url || ''))
      .filter((url) => urls.has(url));
    const missingUrls = Array.from(urls).filter((url) => !removedUrls.includes(url));
    const next = await this.mutateGroups((groups) => (
      groups.filter((group) => !urls.has(normalizeFacebookGroupUrl(group.url || '')))
    ));
    this.events.data({ type: 'groups', status: 'deleted' });
    return {
      deleted: removedUrls.length,
      removed_urls: removedUrls,
      missing: missingUrls.length,
      missing_urls: missingUrls,
      invalid: invalidUrls.length,
      invalid_urls: invalidUrls,
      groups: next,
    };
  }

  async exportGroupsTxt() {
    const groups = await this.loadGroupsData();
    return {
      text: groups.map((group) => group.url).filter(Boolean).join('\n'),
      filename: `groups-${Date.now()}.txt`,
    };
  }

  async toggleGroupPaused(raw) {
    const payload = parseMaybeJson(raw, {});
    const url = normalizeFacebookGroupUrl(payload.url || '');
    const paused = !!payload.paused;
    const next = await this.mutateGroups((groups) => (
      groups.map((group) => (
        normalizeFacebookGroupUrl(group.url || '') === url ? { ...group, paused } : group
      ))
    ));
    this.events.data({ type: 'groups', status: 'updated' });
    return { groups: next };
  }

  async setAllGroupsEnabled(enabled) {
    const next = await this.mutateGroups((groups) => (
      groups.map((group) => ({ ...group, enabled: !!enabled }))
    ));
    this.events.data({ type: 'groups', status: 'updated' });
    return { groups: next };
  }

  async loadGroupCollections() {
    return { collections: this.store.snapshot().groupCollections || [] };
  }

  async createGroupCollection(raw) {
    const payload = parseMaybeJson(raw, {});
    const item = {
      id: Date.now(),
      name: payload.name || `Collection ${this.store.data.groupCollections.length + 1}`,
      members: payload.members || [],
    };
    await this.store.mutate((state) => {
      state.groupCollections.push(item);
      return state;
    });
    return { collection: item, collections: this.store.snapshot().groupCollections };
  }

  async updateGroupCollection(raw) {
    const payload = parseMaybeJson(raw, {});
    await this.store.mutate((state) => {
      state.groupCollections = state.groupCollections.map((item) => (
        item.id === payload.id ? { ...item, ...payload } : item
      ));
      return state;
    });
    return { collections: this.store.snapshot().groupCollections };
  }

  async deleteGroupCollection(raw) {
    const payload = parseMaybeJson(raw, {});
    await this.store.mutate((state) => {
      state.groupCollections = state.groupCollections.filter((item) => item.id !== payload.id);
      return state;
    });
    return { collections: this.store.snapshot().groupCollections };
  }

  async saveGroupCollectionMembers(raw) {
    const payload = parseMaybeJson(raw, {});
    await this.store.mutate((state) => {
      state.groupCollections = state.groupCollections.map((item) => (
        item.id === payload.id ? { ...item, members: payload.members || [] } : item
      ));
      return state;
    });
    return { collections: this.store.snapshot().groupCollections };
  }

  async runGroupCollection(raw) {
    const payload = parseMaybeJson(raw, {});
    this.botState.scope = { type: 'collection', id: payload.id, name: 'Collection run' };
    return this.startBot();
  }

  async setGroupAction(raw) {
    const payload = parseMaybeJson(raw, {});
    const next = await this.mutateGroups((groups) => (
      groups.map((group) => (
        group.id === payload.id ? { ...group, action: payload.action || group.action } : group
      ))
    ));
    return { groups: next };
  }

  async refreshGroupPerformance() {
    const groups = await this.loadGroupsData();
    const rows = groups.map((group) => ({
      id: group.id,
      name: group.name,
      url: group.url,
      scanned: Number(group.scanned || 0),
      suitable: Number(group.matched || 0),
      handled: Number(group.comments || 0) + Number(group.pending || 0) + Number(group.rejected || 0),
      comments: Number(group.comments || 0),
      comment_success: Number(group.comments || 0),
      pending: Number(group.pending || 0),
      rejected: Number(group.rejected || 0),
      fail: Number(group.fail || 0),
      commission: Number(group.commission || 0),
      revenue: Number(group.commission || 0),
      clicks: Number(group.clicks || 0),
      orders: Number(group.orders || 0),
      rating: group.rating || 'none',
    }));
    return {
      rows,
      summary: {
        total: rows.length,
      },
    };
  }

  async getProducts() {
    const productTypes = await this.loadProductTypesData();
    const products = this.normalizeProducts(this.store.snapshot().products || []);
    if (JSON.stringify(products) !== JSON.stringify(this.store.snapshot().products || [])) {
      await this.store.set({ products });
    }
    return { products, productTypes, count: products.length };
  }

  async getProductsFiltered() {
    return this.getProducts();
  }

  async saveProducts(raw) {
    const incoming = Array.isArray(raw) ? raw : parseMaybeJson(raw, []);
    const next = this.normalizeProducts(incoming);
    await this.store.set({ products: next });
    this.events.data({ type: 'products', status: 'saved' });
    return { products: this.store.snapshot().products, productTypes: await this.loadProductTypesData(), count: next.length };
  }

  async addProduct(raw) {
    const payload = parseMaybeJson(raw, {});
    const next = this.normalizeProduct({
      ...payload,
      id: payload.id || `product-${Date.now()}`,
      updatedAt: nowIso(),
      createdAt: payload.createdAt || nowIso(),
    }, this.store.snapshot().products?.length || 0);
    await this.store.mutate((state) => {
      state.products.push(next);
      return state;
    });
    this.events.data({ type: 'products', status: 'added' });
    return { product: next, products: this.store.snapshot().products };
  }

  async updateProduct(raw) {
    const payload = parseMaybeJson(raw, {});
    const productId = String(payload.id || '').trim();
    if (!productId) throw new Error('Thiếu sản phẩm id.');
    await this.store.mutate((state) => {
      state.products = this.normalizeProducts(state.products).map((item, index) => (
        String(item.id) === productId
          ? this.normalizeProduct({
              ...item,
              ...payload,
              id: item.id,
              createdAt: item.createdAt,
              updatedAt: nowIso(),
            }, index)
          : item
      ));
      return state;
    });
    this.events.data({ type: 'products', status: 'updated' });
    return { products: this.store.snapshot().products };
  }

  async deleteProduct(raw) {
    const payload = parseMaybeJson(raw, {});
    const productId = String(payload?.id || raw || '').trim();
    const keyword = String(payload?.keyword || '').trim();
    await this.store.mutate((state) => {
      state.products = this.normalizeProducts(state.products).filter((item) => (
        String(item.id) !== productId && String(item.keyword || '').trim() !== keyword
      ));
      return state;
    });
    this.events.data({ type: 'products', status: 'deleted' });
    return { products: this.store.snapshot().products };
  }

  async updateProductStatus(keyword, status) {
    const clean = String(keyword || '').trim();
    await this.store.mutate((state) => {
      state.products = state.products.map((item) => (
        String(item.keyword || '').trim() === clean ? { ...item, status } : item
      ));
      return state;
    });
    this.events.data({ type: 'products', status: 'updated' });
    return { products: this.store.snapshot().products };
  }

  async bulkDeleteProducts(raw) {
    const payload = parseMaybeJson(raw, {});
    const ids = new Set((payload.ids || []).map((item) => String(item).trim()).filter(Boolean));
    const keywords = new Set((payload.keywords || []).map((item) => String(item).trim()).filter(Boolean));
    await this.store.mutate((state) => {
      state.products = this.normalizeProducts(state.products).filter((item) => (
        !ids.has(String(item.id || '').trim()) && !keywords.has(String(item.keyword || '').trim())
      ));
      return state;
    });
    this.events.data({ type: 'products', status: 'deleted' });
    return { products: this.store.snapshot().products };
  }

  async saveProductTypes(raw = '[]') {
    const payload = Array.isArray(raw) ? raw : parseMaybeJson(raw, []);
    const productTypes = await this.writeProductTypesData(payload);
    this.events.data({ type: 'productTypes', status: 'saved' });
    return { productTypes };
  }

  async promoteProductToReady(raw) {
    const payload = parseMaybeJson(raw, {});
    return this.updateProduct({
      ...payload,
      status: 'ready',
    });
  }

  async classifyProduct(raw) {
    const payload = parseMaybeJson(raw, {});
    const keyword = String(payload.keyword || '').toLowerCase();
    let category = 'general';
    if (/(laptop|chuột|bàn phím|tai nghe|sạc|camera)/i.test(keyword)) category = 'tech';
    else if (/(sữa|bỉm|mẹ bỉm|bé|trẻ em)/i.test(keyword)) category = 'mom-baby';
    else if (/(serum|retinol|kem|chống nắng|skincare)/i.test(keyword)) category = 'beauty';
    else if (/(nồi|bếp|máy xay|ly|chảo)/i.test(keyword)) category = 'home';
    return { category };
  }

  async loadProductFavorites() {
    return { favorites: this.store.snapshot().favorites || [] };
  }

  async toggleProductFavorite(raw) {
    const payload = parseMaybeJson(raw, {});
    const key = String(payload.keyword || '').trim();
    await this.store.mutate((state) => {
      const next = new Set(state.favorites || []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      state.favorites = Array.from(next);
      return state;
    });
    return { favorites: this.store.snapshot().favorites };
  }

  async getHistory() {
    return this.loadHistory();
  }

  async loadHistory() {
    return { entries: this.store.snapshot().history };
  }

  async getHistoryFiltered(raw) {
    const payload = parseMaybeJson(raw, {});
    const query = String(payload.query || '').trim().toLowerCase();
    const mode = String(payload.mode || '').trim().toLowerCase();
    const from = payload.dateFrom ? new Date(`${payload.dateFrom}T00:00:00`) : null;
    const to = payload.dateTo ? new Date(`${payload.dateTo}T23:59:59`) : null;
    const entries = this.store.data.history.filter((entry) => {
      const stamp = entry.date && entry.time ? new Date(`${entry.date}T${entry.time}`) : null;
      if (mode && String(entry.mode || '').toLowerCase() !== mode) return false;
      if (from && stamp && stamp < from) return false;
      if (to && stamp && stamp > to) return false;
      if (query) {
        const hay = `${entry.group || ''} ${entry.product || ''} ${entry.comment || ''} ${entry.permalink || ''} ${entry.account_name || ''}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
    return { entries };
  }

  async deleteComment(id) {
    await this.store.mutate((state) => {
      state.history = state.history.filter((item) => String(item.id) !== String(id));
      return state;
    });
    this.events.data({ type: 'history', status: 'deleted' });
    return { entries: this.store.snapshot().history };
  }

  async loadRunHistory() {
    return { runs: this.store.snapshot().runs };
  }

  async processBacklog() {
    const pending = this.store.data.products.filter((item) => String(item.status || '').toLowerCase() !== 'ready');
    this.events.data({ type: 'backlog', status: 'running', done: 0, total: pending.length, message: 'Đang xử lý keyword tồn kho...' });
    for (let index = 0; index < pending.length; index += 1) {
      const item = pending[index];
      await delay(250);
      await this.store.mutate((state) => {
        state.products = state.products.map((row) => (
          row.id === item.id ? {
            ...row,
            status: 'ready',
            url: row.url || `https://shopee.vn/search?keyword=${encodeURIComponent(row.keyword || row.name || '')}`,
            original_url: row.original_url || row.url || `https://shopee.vn/search?keyword=${encodeURIComponent(row.keyword || row.name || '')}`,
          } : row
        ));
        return state;
      });
      this.events.data({
        type: 'backlog',
        status: 'running',
        done: index + 1,
        total: pending.length,
        message: `Đã tạo link cho ${item.keyword || item.name || 'keyword'}`,
      });
    }
    this.events.data({ type: 'backlog', status: 'done', done: pending.length, total: pending.length, message: 'Đã xử lý xong keyword tồn kho.' });
    return { done: pending.length, total: pending.length };
  }

  async pauseBacklog() {
    this.events.data({ type: 'backlog', status: 'paused', message: 'Tạm dừng xử lý tồn kho.' });
    return { paused: true };
  }

  async resumeBacklog() {
    this.events.data({ type: 'backlog', status: 'running', message: 'Tiếp tục xử lý tồn kho.' });
    return { resumed: true };
  }

  async stopBacklog() {
    this.events.data({ type: 'backlog', status: 'stopped', message: 'Đã dừng xử lý tồn kho.' });
    return { stopped: true };
  }

  async testNineRouter(raw = '{}') {
    const overrides = parseMaybeJson(raw, {});
    const cfg = this.normalizeConfigUi(overrides, this.store.data.configUi || {});
    if (!cfg.routerUrl) throw new Error('Chưa nhập URL 9Router.');
    if (!cfg.routerToken) throw new Error('Chưa nhập 9Router Token.');
    if (!cfg.combo) throw new Error('Chưa nhập 9Router Model.');
    const baseUrl = this.normalizeNineRouterBaseUrl(cfg.routerUrl);
    const healthUrl = `${baseUrl}/api/health`;
    const healthRes = await fetch(healthUrl, {
      method: 'GET',
      headers: this.buildNineRouterHeaders(cfg),
    });
    const healthRaw = await healthRes.text();
    let healthData = null;
    try {
      healthData = healthRaw ? JSON.parse(healthRaw) : null;
    } catch (_) {
      healthData = healthRaw || null;
    }
    if (!healthRes.ok) {
      throw new Error(`9Router health check lỗi HTTP ${healthRes.status} tại ${healthUrl}.`);
    }

    const sampleContent = 'Em cần mua máy xay sinh tố cho gia đình, loại nào ổn trong tầm giá tốt?';
    const response = await this.analyzePostContent(sampleContent, {
      groupName: 'Test 9Router',
    }, cfg);
    const analysisPlan = this.extractAnalysisPlan(response, sampleContent);
    return {
      message: 'Đã gọi 9Router thành công.',
      health: {
        ok: true,
        url: healthUrl,
        data: healthData,
      },
      response,
      analysisPlan,
    };
  }

  async generateProductComments(raw = '{}') {
    const payload = parseMaybeJson(raw, {});
    const productId = String(payload.id || '').trim();
    if (!productId) throw new Error('Thiếu sản phẩm id.');
    const products = this.normalizeProducts(this.store.snapshot().products || []);
    const product = products.find((item) => String(item.id) === productId);
    if (!product) throw new Error('Không tìm thấy sản phẩm.');
    if (!product.affiliateLinks.length) {
      throw new Error('Sản phẩm chưa có link affiliate.');
    }
    const configUi = this.normalizeConfigUi(this.store.data.configUi || {});
    if (!configUi.routerUrl) throw new Error('Chưa nhập URL 9Router.');
    if (!configUi.routerToken) throw new Error('Chưa nhập 9Router Token.');
    if (!configUi.combo) throw new Error('Chưa nhập 9Router Model.');

    const requestUrl = `${this.normalizeNineRouterBaseUrl(configUi.routerUrl)}/v1/chat/completions`;
    const commentPayload = this.buildNineRouterCommentPayload(product.name, product.affiliateLinks, configUi);
    this.log('info', 'COMMENT_AI', `Gọi 9Router sinh comment cho sản phẩm ${product.name}: ${requestUrl}`);
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        ...this.buildNineRouterHeaders(configUi),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commentPayload),
    });
    const rawText = await response.text();
    const preview = rawText.replace(/\s+/g, ' ').trim().slice(0, 220) || '(empty)';
    let data = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch (_) {
      throw new Error(`9Router không trả JSON hợp lệ khi sinh comment. Preview: ${preview}`);
    }
    if (!response.ok) {
      const detail = normalizedText(data?.message || data?.error || data?.detail || '');
      throw new Error(`9Router sinh comment lỗi HTTP ${response.status}.${detail ? ` Chi tiết: ${detail}.` : ''} Preview: ${preview}`);
    }
    const comments = this.parseCommentArrayResponse(data);
    if (!comments.length) {
      throw new Error('9Router chưa trả về mảng comment hợp lệ.');
    }
    if (comments.length !== product.affiliateLinks.length) {
      throw new Error(`9Router trả về ${comments.length} comment nhưng sản phẩm có ${product.affiliateLinks.length} link affiliate.`);
    }

    let updatedProduct = null;
    await this.store.mutate((state) => {
      state.products = this.normalizeProducts(state.products).map((item, index) => {
        if (String(item.id) !== productId) return item;
        updatedProduct = this.normalizeProduct({
          ...item,
          comments,
          updatedAt: nowIso(),
        }, index);
        return updatedProduct;
      });
      return state;
    });
    this.events.data({ type: 'products', status: 'updated', productId });
    return {
      product: updatedProduct,
      comments,
      count: comments.length,
    };
  }

  async testTelegram(raw = '{}') {
    const overrides = parseMaybeJson(raw, {});
    const cfg = this.normalizeConfigUi(overrides, this.store.data.configUi || {});
    const botToken = String(cfg.tgToken || '').trim();
    const chatId = String(cfg.tgChatId || '').trim();
    if (!botToken || !chatId) throw new Error('Thiếu Telegram token hoặc chat ID.');

    const maskedBotToken = botToken.length > 10
      ? `${botToken.slice(0, 6)}...${botToken.slice(-4)}`
      : botToken;
    const result = {
      botToken: maskedBotToken,
      chatId,
      getMe: null,
      sendMessage: null,
    };

    try {
      const getMeRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });
      const getMeData = await getMeRes.json();
      if (!getMeRes.ok || getMeData?.ok === false) {
        throw new Error(getMeData?.description || `HTTP ${getMeRes.status}`);
      }
      result.getMe = {
        ok: true,
        botName: getMeData?.result?.first_name || '',
        username: getMeData?.result?.username || '',
      };
    } catch (error) {
      result.getMe = {
        ok: false,
        error: error?.message || String(error),
      };
      throw new Error(result.getMe.error);
    }

    try {
      const sendMessageRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: '✅ Telegram health check - kết nối thành công!',
        }),
      });
      const sendMessageData = await sendMessageRes.json();
      if (!sendMessageRes.ok || sendMessageData?.ok === false) {
        throw new Error(sendMessageData?.description || `HTTP ${sendMessageRes.status}`);
      }
      result.sendMessage = { ok: true };
    } catch (error) {
      result.sendMessage = {
        ok: false,
        error: error?.message || String(error),
      };
      throw new Error(result.sendMessage.error);
    }

    return {
      success: true,
      data: result,
      message: 'Đã gửi tin nhắn test Telegram thành công.',
    };
  }

  async openLink(linkType, url) {
    if (!openExternalUrl(url)) throw new Error(`Không mở được link ${linkType || ''}.`);
    return { opened: true };
  }

  async getLicenseInfo() {
    return { mode: 'local-dev', valid: true };
  }

  async updateLicense() {
    return { ok: true };
  }

  async checkForUpdates() {
    return { available: false };
  }

  async dismissUpdate() {
    return { ok: true };
  }

  async installUpdate() {
    throw new Error('Local server scaffold chưa hỗ trợ auto update.');
  }

  async acknowledgeWhatsNew() {
    return { ok: true };
  }

  async openReleasePage(url) {
    return this.openLink('release', url);
  }

  async loadTinyUrlTokens() {
    return { rows: this.store.snapshot().tinyTokens || [] };
  }

  async addTinyUrlToken(token) {
    const item = { id: Date.now(), token: String(token || '').trim() };
    await this.store.mutate((state) => {
      state.tinyTokens.push(item);
      return state;
    });
    return { rows: this.store.snapshot().tinyTokens };
  }

  async deleteTinyUrlTokens(raw) {
    const payload = parseMaybeJson(raw, {});
    const ids = new Set((payload.ids || []).map((item) => String(item)));
    await this.store.mutate((state) => {
      state.tinyTokens = state.tinyTokens.filter((item) => !ids.has(String(item.id)));
      return state;
    });
    return { rows: this.store.snapshot().tinyTokens };
  }

  async loadGroupSurveys() {
    return { surveys: this.store.snapshot().groupSurveys || [] };
  }

  async loadGroupSurveyDetail(raw) {
    const payload = parseMaybeJson(raw, {});
    const survey = (this.store.data.groupSurveys || []).find((item) => item.id === payload.surveyId) || null;
    return { survey };
  }

  async createGroupSurvey(raw) {
    const payload = parseMaybeJson(raw, {});
    const next = {
      id: Date.now(),
      name: payload.name || `Survey ${this.store.data.groupSurveys.length + 1}`,
      createdAt: nowIso(),
      rows: [],
      status: 'idle',
    };
    await this.store.mutate((state) => {
      state.groupSurveys.push(next);
      return state;
    });
    return { survey: next, surveys: this.store.snapshot().groupSurveys };
  }

  async startGroupSurvey(raw) {
    const payload = parseMaybeJson(raw, {});
    this.botState.scope = { type: 'survey', id: payload.surveyId, name: 'Group survey' };
    return this.startBot();
  }

  async stopGroupSurvey() {
    return this.stopBot();
  }

  async deleteGroupSurvey(raw) {
    const payload = parseMaybeJson(raw, {});
    await this.store.mutate((state) => {
      state.groupSurveys = state.groupSurveys.filter((item) => item.id !== payload.surveyId);
      return state;
    });
    return { surveys: this.store.snapshot().groupSurveys };
  }

  async deleteSurveyGroup() {
    return { ok: true };
  }

  async addSurveyGroupToGroups() {
    return { ok: true };
  }

  async bulkAddSurveyGroupsToGroups() {
    return { ok: true };
  }

  async bulkDeleteSurveyGroupsToBlacklist() {
    return { ok: true };
  }

  async exportAppData() {
    return { data: this.store.snapshot() };
  }

  async importAppData() {
    throw new Error('Local server scaffold chưa hỗ trợ import file trực tiếp.');
  }

  async exportProducts() {
    return { products: this.store.snapshot().products };
  }

  async exportProductsFiltered() {
    return { products: this.store.snapshot().products };
  }

  async importProducts(text) {
    const rows = String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => ({ id: Date.now() + index, keyword: line, name: line, status: 'pending', url: '' }));
    await this.store.mutate((state) => {
      state.products.push(...rows);
      return state;
    });
    this.events.data({ type: 'products', status: 'imported' });
    return { products: this.store.snapshot().products };
  }

  async syncStats() {
    const snapshot = this.revenueSnapshot({});
    this.emitSyncState('stats', 'running', 'Đang đồng bộ đơn và click từ dữ liệu local...');
    this.emitSyncState('stats', 'done', `Đã nạp ${snapshot.filteredOrders.length} đơn và ${snapshot.filteredClicks.length} click từ data/app-state.json.`);
    return {
      synced: true,
      orders: snapshot.filteredOrders.length,
      clicks: snapshot.filteredClicks.length,
    };
  }

  async syncOrders() {
    const snapshot = this.revenueSnapshot({});
    this.emitSyncState('orders', 'running', 'Đang đồng bộ đơn từ dữ liệu local...');
    this.emitSyncState('orders', 'done', `Đã nạp ${snapshot.filteredOrders.length} đơn từ data/app-state.json.`);
    return {
      synced: true,
      orders: snapshot.filteredOrders.length,
    };
  }

  async syncClicks() {
    const snapshot = this.revenueSnapshot({});
    this.emitSyncState('clicks', 'running', 'Đang đồng bộ click từ dữ liệu local...');
    this.emitSyncState('clicks', 'done', `Đã nạp ${snapshot.filteredClicks.length} click từ data/app-state.json.`);
    return {
      synced: true,
      clicks: snapshot.filteredClicks.length,
    };
  }

  async exportOrders(raw) {
    const snapshot = this.revenueSnapshot(raw);
    const header = ['time', 'order_id', 'product', 'shop', 'gmv', 'commission', 'channel', 'sub_id', 'status'];
    const lines = [
      header.join(','),
      ...snapshot.orderRows.map((row) => ([
        row.time.toISOString(),
        row.order_id,
        row.product,
        row.shop,
        row.gmv,
        row.comm,
        row.channel,
        row.subId,
        row.status,
      ].map(csvCell).join(','))),
    ];
    return {
      rows: snapshot.orderRows,
      csv: lines.join('\n'),
    };
  }

  async getRevenueSnapshot(raw) {
    const snapshot = this.revenueSnapshot(raw);
    return {
      ...snapshot.overview,
      clicks: snapshot.filteredClicks.length,
    };
  }

  async getStats(raw) {
    const snapshot = this.revenueSnapshot(raw);
    return {
      overview: snapshot.overview,
      summary: {
        orders: snapshot.filteredOrders.length,
        clicks: snapshot.filteredClicks.length,
        products: snapshot.topProducts.length,
        shops: snapshot.topShops.length,
      },
    };
  }

  async getStatsOverview(raw) {
    return this.getStats(raw);
  }

  async getStatsCharts(raw) {
    const snapshot = this.revenueSnapshot(raw);
    return {
      daily: snapshot.dailyRows,
      hourly: snapshot.hourlyRows,
    };
  }

  async getTopProducts(raw) {
    const snapshot = this.revenueSnapshot(raw);
    return { rows: snapshot.topProducts };
  }

  async getTopShops(raw) {
    const snapshot = this.revenueSnapshot(raw);
    return { rows: snapshot.topShops };
  }

  async getTopSubids(raw) {
    const snapshot = this.revenueSnapshot(raw);
    return { rows: snapshot.subRows };
  }

  async getOrders(raw) {
    const snapshot = this.revenueSnapshot(raw);
    return { rows: snapshot.filteredOrders };
  }

  async getClickOverview(raw) {
    const snapshot = this.revenueSnapshot(raw);
    return { rows: snapshot.filteredClicks };
  }

  async getStatsCompare(raw) {
    const snapshot = this.revenueSnapshot(raw);
    return { compare: snapshot.overview.compare };
  }

  async getSubidDetail(raw) {
    const payload = parseMaybeJson(raw, {});
    const snapshot = this.revenueSnapshot(payload);
    const fieldKey = String(payload.field || 'sub_id').trim().toLowerCase();
    const expected = String(payload.value || '').trim().toLowerCase();
    const matchesField = (row) => {
      if (!expected) return true;
      if (fieldKey === 'sub_id3') return String(row.sub3 || '').trim().toLowerCase() === expected;
      if (fieldKey === 'sub_id4') return String(row.sub4 || '').trim().toLowerCase() === expected;
      return String(row.subids || row.subId || '').trim().toLowerCase() === expected;
    };
    return {
      clicks: snapshot.clickRows.filter(matchesField),
      orders: snapshot.orderRows.filter(matchesField).map((row) => ({
        order_id: row.order_id,
        subids: row.subId,
        time: row.time.toISOString().replace('T', ' ').slice(0, 19),
        product: row.product,
        gmv: row.gmv,
        commission: row.comm,
      })),
    };
  }

  async loadCpcConfig() {
    return this.sanitizeCpcConfig(this.store.data.cpcConfig || {});
  }

  async saveCpcConfig(raw) {
    const payload = this.sanitizeCpcConfig(parseMaybeJson(raw, {}));
    await this.store.set({ cpcConfig: payload });
    this.events.data({ type: 'cpc', status: 'saved' });
    return payload;
  }

  async getProductAnalytics(raw) {
    const snapshot = this.revenueSnapshot(raw);
    return {
      products: snapshot.topProducts,
      shops: snapshot.topShops,
      categories: snapshot.topCategories,
    };
  }

  async repostRejectedComments() {
    throw new Error('Scaffold server chưa hỗ trợ repost comment.');
  }

  async repostComment() {
    throw new Error('Scaffold server chưa hỗ trợ repost comment.');
  }

  async pauseRepostComments() {
    return { paused: false };
  }

  async resumeRepostComments() {
    return { resumed: false };
  }

  async stopRepostComments() {
    return { stopped: false };
  }

  async resolveFailedPost() {
    return { ok: true };
  }

  async startBot(rawConfig = null) {
    if (this.workerManager) {
      const primaryWorker = await this.ensurePrimaryWorker();
      if (!primaryWorker) throw new Error('Chưa có worker mặc định.');
      const incomingConfig = rawConfig == null ? null : parseMaybeJson(rawConfig, {});
      const configUi = this.workerConfigUi(primaryWorker, incomingConfig || null);
      const groups = await this.loadGroupsData();
      const workerGroups = this.filterGroupsForWorker(primaryWorker, groups);
      const enabledGroups = workerGroups.filter((group) => group.enabled !== false && !group.paused && group.url);
      if (!enabledGroups.length) throw new Error('Chưa có group bật để chạy crawler.');
      return this.workerManager.startBot(primaryWorker.id, configUi, workerGroups);
    }
    if (this.botTask) return { status: this.botState.status, message: 'Crawler đang chạy.' };
    const incomingConfig = rawConfig == null ? null : parseMaybeJson(rawConfig, {});
    const configUi = incomingConfig && typeof incomingConfig === 'object'
      ? await this.syncCrawlerConfig({
        ...this.store.data.configUi,
        ...incomingConfig,
      })
      : await this.loadCrawlerConfigData();
    const runConfig = this.buildCrawlerRunConfig(configUi);
    const groups = await this.loadGroupsData();
    const enabledGroups = groups.filter((group) => group.enabled !== false && !group.paused && group.url);
    if (!enabledGroups.length) throw new Error('Chưa có group bật để chạy crawler.');
    const browserInfo = await this.connectBrowser(configUi);
    this.loopControl = { stop: false, pause: false };
    this.botState = {
      status: 'running',
      text: 'Crawler đang chạy',
      scope: this.botState.scope || { type: 'groups', name: 'Facebook groups' },
      currentRunId: `run-${Date.now()}`,
    };
    this.runtime = {
      current_group_index: 0,
      total_groups: enabledGroups.length,
      current_group_name: '',
      current_group_url: '',
      scanned: 0,
      suitable: 0,
      direct: 0,
      telegram: 0,
      workflow_mode: runConfig.workflow,
    };
    this.emitStatus({ state: 'running', text: 'Đang chạy crawler.' });
    this.emitRuntime();
    this.log(
      'info',
      'BOT',
      `Start crawl ${enabledGroups.length} group(s) bằng ${runConfig.browserType}. perGroup=${runConfig.perGroup}, delay=${runConfig.delaySeconds}s, runMode=${runConfig.runMode}.`
    );
    this.botTask = this.runBotLoop(enabledGroups, runConfig)
      .finally(() => {
        this.botTask = null;
      });
    return { status: 'running', browserInfo };
  }

  async runBotLoop(groups, runConfig) {
    const crawler = this.browserManager.activeCrawler(runConfig.browserType);
    const perGroup = runConfig.perGroup;
    const buyerIntentKeywords = (await this.loadBuyerIntentKeywords()).keywords || [];
    const runRows = [];
    try {
      this.emitStatus({ state: this.botState.status, text: 'Đang mô phỏng người dùng ở Facebook home trước khi vào group.' });
      this.log('info', 'FB', 'Warm up Facebook home trong 30 giây trước khi vào từng group.');
      await crawler.warmUpOnHomePage({ durationMs: 30000 });
      if (this.loopControl.stop) return;

      for (let index = 0; index < groups.length; index += 1) {
        if (this.loopControl.stop) break;
        while (this.loopControl.pause && !this.loopControl.stop) {
          await delay(300);
        }
        const group = groups[index];
        this.runtime.current_group_index = index + 1;
        this.runtime.current_group_name = group.name || group.url;
        this.runtime.current_group_url = group.url || '';
        this.emitStatus({ state: this.botState.status, text: `Đang quét ${group.name || group.url}` });
        this.emitRuntime();
        this.log('info', 'FB', `Đang mở group ${group.name || group.url}`);
        let posts = [];
        try {
          posts = await crawler.collectPosts({
            groupUrl: group.url,
            maxPosts: perGroup,
            delayBetweenPostsMs: 5000,
            runConfig: runConfig.raw,
            onPost: async (post, collectedIndex) => {
              const compactText = String(post.text || '')
                .replace(/\s+/g, ' ')
                .trim();
              this.log(
                'info',
                'POST',
                `[${group.name || group.url}] Feed item ${collectedIndex + 1}: ${compactText || '(empty)'}`
              );
              if (!compactText) {
                post.analysis = null;
                return;
              }
              const matchedBuyerKeyword = this.findMatchingBuyerIntentKeyword(compactText, buyerIntentKeywords);
              if (!matchedBuyerKeyword) {
                post.analysis = null;
                post.prefilter = {
                  matched: false,
                  reason: 'buyer-intent',
                  keyword: '',
                };
                return;
              }
              post.prefilter = {
                matched: true,
                reason: 'buyer-intent',
                keyword: matchedBuyerKeyword,
              };
              try {
                post.analysis = await this.analyzePostContent(compactText, {
                  groupName: group.name || group.url,
                });
              } catch (error) {
                post.analysis = null;
                this.log('error', 'ANALYZE', `Gọi API phân tích thất bại: ${error.message || error}`);
              }
            },
          });
        } catch (error) {
          this.log('error', 'FB', `Không quét được group ${group.name || group.url}: ${error.message || error}`);
        }
        const matchedPosts = [];
        for (let postIndex = 0; postIndex < posts.length; postIndex += 1) {
          if (this.loopControl.stop) break;
          while (this.loopControl.pause && !this.loopControl.stop) {
            await delay(300);
          }
          const post = posts[postIndex];
          const postText = String(post.text || '').trim();
          const analysis = post.analysis ?? null;
          if (post.prefilter?.matched === false) continue;
          const extractedPlan = this.extractAnalysisPlan(analysis, postText);
          if (!extractedPlan) continue;
          const analysisPlan = this.resolveProductForPlan(
            extractedPlan,
            this.normalizeProducts(this.store.data.products || []),
            this.normalizeProductTypes(this.store.data.productTypes || []),
          );
          if (!analysisPlan) continue;
          matchedPosts.push({ ...post, analysis, analysisPlan });
        }
        const now = new Date();
        this.runtime.scanned += posts.length;
        this.runtime.suitable += matchedPosts.length;
        this.emitRuntime();
        const runRecord = {
          id: `${this.botState.currentRunId}-${group.id || index + 1}`,
          label: group.name || group.url,
          group: group.name || group.url,
          groupUrl: group.url,
          runs: posts.length,
          scanned: posts.length,
          suitable: matchedPosts.length,
          direct: 0,
          telegram: 0,
          pending: 0,
          rejected: 0,
          fail: 0,
          revenue: 0,
          lastAt: now.toISOString(),
          account: runConfig.browserType,
        };
        const { commentResults, skipGroup } = await this.executeCommentPlanForGroup({
          crawler,
          group,
          actionablePosts: matchedPosts,
          runConfig,
          runRecord,
        });
        runRows.push(runRecord);
        if (this.storeWritesEnabled) {
          await this.applyGroupResults({
            group,
            posts,
            matchedPosts,
            commentResults,
            runConfig,
            now,
          });
        }
        if (typeof this.hooks.onGroupComplete === 'function') {
          await this.hooks.onGroupComplete({
            group,
            posts,
            matchedPosts,
            commentResults,
            runRecord,
            runConfig,
            now: now.toISOString(),
          });
        }
        this.log(
          'success',
          'SCAN',
          `${group.name || group.url}: ${posts.length} bài, ${matchedPosts.length} match, ${runRecord.direct} comment thành công, ${runRecord.pending} chờ duyệt, ${runRecord.rejected} bị từ chối.`,
        );
        if (skipGroup) {
          this.log('warning', 'SCAN', `${group.name || group.url}: bỏ qua phần còn lại của group sau 2 lần dính moderation.`);
        }
        if (index < groups.length - 1) {
          const groupDelayMs = runConfig.delaySeconds * 1000;
          const keepGoing = await this.waitWithLoopControl(groupDelayMs);
          if (!keepGoing) break;
        }
      }
      if (this.storeWritesEnabled) {
        await this.applyRunSummary({
          runId: this.botState.currentRunId,
          runRows,
          stopped: this.loopControl.stop,
        });
      }
      if (typeof this.hooks.onRunComplete === 'function') {
        await this.hooks.onRunComplete({
          runId: this.botState.currentRunId,
          runRows,
          stopped: this.loopControl.stop,
        });
      }
      this.botState.status = this.loopControl.stop ? 'stopped' : 'done';
      this.botState.text = this.loopControl.stop ? 'Đã dừng crawler.' : 'Đã hoàn tất lượt quét.';
      this.emitStatus({ state: this.botState.status, text: this.botState.text, scope: this.botState.scope });
      this.log('success', 'BOT', this.botState.text);
    } catch (error) {
      this.botState.status = 'error';
      this.botState.text = error.message || String(error);
      this.emitStatus({ state: 'error', text: this.botState.text, scope: this.botState.scope });
      this.log('error', 'BOT', this.botState.text);
      throw error;
    } finally {
      this.botState.status = 'idle';
      this.botState.text = 'Sẵn sàng';
      this.emitStatus({ state: 'idle', text: 'Sẵn sàng', scope: this.botState.scope });
      this.botState.scope = null;
    }
  }

  async pauseBot() {
    if (this.workerManager) {
      const primaryWorker = await this.ensurePrimaryWorker();
      if (!primaryWorker) return { paused: false };
      return this.workerManager.pauseBot(primaryWorker.id);
    }
    if (!this.botTask) return { paused: false };
    this.loopControl.pause = true;
    this.botState.status = 'paused';
    this.botState.text = 'Tạm dừng crawler.';
    this.emitStatus({ state: 'paused', text: 'Tạm dừng crawler.', scope: this.botState.scope });
    this.log('warn', 'BOT', 'Crawler paused');
    return { paused: true };
  }

  async resumeBot() {
    if (this.workerManager) {
      const primaryWorker = await this.ensurePrimaryWorker();
      if (!primaryWorker) return { resumed: false };
      return this.workerManager.resumeBot(primaryWorker.id);
    }
    if (!this.botTask) return { resumed: false };
    this.loopControl.pause = false;
    this.botState.status = 'running';
    this.botState.text = 'Tiếp tục crawler.';
    this.emitStatus({ state: 'running', text: 'Tiếp tục crawler.', scope: this.botState.scope });
    this.log('info', 'BOT', 'Crawler resumed');
    return { resumed: true };
  }

  async stopBot() {
    if (this.workerManager) {
      const primaryWorker = await this.ensurePrimaryWorker();
      if (!primaryWorker) return { stopped: false };
      return this.workerManager.stopBot(primaryWorker.id);
    }
    if (!this.botTask) return { stopped: false };
    this.loopControl.stop = true;
    this.loopControl.pause = false;
    this.botState.status = 'stopping';
    this.botState.text = 'Đang dừng crawler...';
    this.emitStatus({ state: 'stopping', text: 'Đang dừng crawler...', scope: this.botState.scope });
    this.log('warn', 'BOT', 'Stopping crawler...');
    return { stopped: true };
  }

  async health() {
    const crawler = this.browserManager.activeCrawler();
    return {
      ok: true,
      status: 'ok',
      platform: os.platform(),
      browser: crawler?.connectionInfo || null,
      bot: {
        status: this.botState.status,
        scope: this.botState.scope,
      },
      summary: this.summarySnapshot(),
      workers: this.workerManager ? this.workerManager.snapshot() : [],
      groupTypes: this.store.data.groupTypes || defaultGroupTypes(),
    };
  }
}

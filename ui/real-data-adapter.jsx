/* real-data-adapter.jsx - map dữ liệu thật của app web/server sang UI preview React */

(function () {
  const MONEY_DIVISOR = 100000;
  const DAY_MS = 86400000;

  function isLegacyApiPath(path) {
    return /^\/api\//i.test(String(path || ''));
  }

  function readConfigFallback() {
    const current = window.APP_CURRENT || {};
    return current.config || {};
  }

  function readJson(path, fallback) {
    if (isLegacyApiPath(path)) return fallback;
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', path + '?_=' + Date.now(), false);
      xhr.overrideMimeType('application/json; charset=utf-8');
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 400) return JSON.parse(xhr.responseText || 'null');
      throw new Error(path + ' trả HTTP ' + xhr.status);
    } catch (err) {
      console.warn('[real-data-adapter] Không đọc được ' + path, err);
      return fallback;
    }
  }

  function readJsonAsync(path, fallback) {
    if (isLegacyApiPath(path)) return Promise.resolve(fallback);
    return new Promise((resolve) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.timeout = 15000;
        xhr.open('GET', path + (path.includes('?') ? '&' : '?') + '_=' + Date.now(), true);
        xhr.overrideMimeType('application/json; charset=utf-8');
        xhr.onload = () => {
          try {
            if (xhr.status >= 200 && xhr.status < 400) {
              resolve(JSON.parse(xhr.responseText || 'null'));
              return;
            }
          } catch (err) {
            console.warn('[real-data-adapter] Không parse được ' + path, err);
          }
          resolve(fallback);
        };
        xhr.onerror = () => resolve(fallback);
        xhr.ontimeout = () => resolve(fallback);
        xhr.send(null);
      } catch (err) {
        console.warn('[real-data-adapter] Không đọc được ' + path, err);
        resolve(fallback);
      }
    });
  }

  async function readBackendSnapshot(base = {}) {
    const api = window.backendApi;
    if (!api?.connected) return null;
    try {
      const [stateRes, groupsRes, productsRes, historyRes, groupPerfRes, runHistoryRes, groupCollectionsRes, ordersRes, clickOverviewRes, statsRes, cpcRes] = await Promise.all([
        api.getState?.(),
        api.loadGroups?.(),
        api.getProducts?.(),
        api.loadHistory?.(),
        api.refreshGroupPerformance?.({}),
        api.loadRunHistory?.({}),
        api.loadGroupCollections?.(),
        api.getOrders?.({}),
        api.getClickOverview?.({}),
        api.getStats?.(),
        api.loadCpcConfig?.(),
      ]);

      const configUi = stateRes?.ok ? (stateRes.data?.configUi || {}) : {};
      const cpcConfig = cpcRes?.ok ? (cpcRes.data || {}) : (base.cpcConfig || {});
      const config = {
        ...readConfigFallback(),
        cpc_config: {
          ...(readConfigFallback().cpc_config || {}),
          ...(cpcConfig || {}),
        },
        ui: {
          ...(readConfigFallback().ui || {}),
          theme: configUi.theme || readConfigFallback().ui?.theme || 'system',
        },
        edge: {
          ...(readConfigFallback().edge || {}),
          browser: configUi.browserType || readConfigFallback().edge?.browser || 'chrome',
          debugging_port: Number(configUi.edgePort || readConfigFallback().edge?.debugging_port || 9222),
          use_separate_profile: !!configUi.useSeparateProfile,
          headless: !!configUi.browserHeadless,
          profile_id: configUi.browserProfileId || '',
          paths: configUi.browserPaths || readConfigFallback().edge?.paths || {},
        },
        tabs: {
          ...(readConfigFallback().tabs || {}),
          chatgpt: configUi.chatgptUrl || readConfigFallback().tabs?.chatgpt || 'https://chatgpt.com',
          shopee: configUi.shopeeUrl || readConfigFallback().tabs?.shopee || 'https://shopee.vn',
          shopee_affiliate: configUi.affUrl || readConfigFallback().tabs?.shopee_affiliate || 'https://affiliate.shopee.vn/dashboard',
        },
        workflow: {
          ...(readConfigFallback().workflow || {}),
          mode: configUi.workflow || readConfigFallback().workflow?.mode || 'full',
          skip_processed: configUi.skipProcessed !== false,
          delete_unapproved_comment: configUi.deleteUnapproved !== false,
        },
        timing: {
          ...(readConfigFallback().timing || {}),
          delay_after_comment: Number(configUi.delay || readConfigFallback().timing?.delay_after_comment || 10),
          run_mode: configUi.runMode || readConfigFallback().timing?.run_mode || 'once',
          cycle_interval: Number(configUi.cycleWait || 15) * 60,
        },
        buy_keywords: String(configUi.buyKeywords || '')
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
        blacklist_keywords: String(configUi.blacklistKeywords || '')
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
      };

      const products = productsRes?.ok ? (productsRes.data?.products || []) : (base.products || []);
      const apiGroups = groupsRes?.ok ? (groupsRes.data?.groups || null) : (base.apiGroups || null);
      const groupPerfRows = groupPerfRes?.ok ? (groupPerfRes.data?.rows || []) : [];
      const historyEntries = historyRes?.ok ? (historyRes.data?.entries || []) : [];
      const runs = runHistoryRes?.ok ? (runHistoryRes.data?.runs || []) : (base.runs || []);
      const groupCollections = groupCollectionsRes?.ok ? (groupCollectionsRes.data?.collections || []) : (base.groupCollections || []);
      const orders = ordersRes?.ok ? (ordersRes.data?.rows || ordersRes.data?.orders || []) : (base.orders || []);
      const clicks = clickOverviewRes?.ok ? (clickOverviewRes.data?.rows || clickOverviewRes.data?.clicks || []) : (base.clicks || []);
      const groupPerf = {
        days: {
          snapshot: {
            groups: Object.fromEntries(groupPerfRows.map((row, index) => [`row-${index}`, {
              group_url: row.url || '',
              scanned_posts: Number(row.scanned || 0),
              suitable_posts: Number(row.suitable || 0),
              handled_posts: Number((row.comment_success ?? row.comments ?? row.handled) || 0),
            }])),
          },
        },
      };
      const history = historyEntries.reduce((acc, row) => {
        const day = String(row.date || '').trim() || 'snapshot';
        const bucket = acc[day] ||= { comments: [] };
        bucket.comments.push({
          time: row.time || '00:00:00',
          mode: row.mode || 'comment',
          group: row.group || row.groupUrl || '',
          permalink: row.permalink || '',
          product: row.product || '',
          comment: row.comment || '',
          account_name: row.account_name || row.account || '',
        });
        return acc;
      }, {});

      return {
        config,
        products,
        history,
        groupPerf,
        apiGroups,
        orders,
        clicks,
        runs,
        groupCollections,
        cpcConfig,
        progress: stateRes?.ok ? (stateRes.data?.progress || null) : null,
        summary: stateRes?.ok ? (stateRes.data?.summary || null) : null,
        stats: statsRes?.ok ? statsRes.data : null,
      };
    } catch (error) {
      console.warn('[real-data-adapter] Không đọc được snapshot từ backendApi', error);
      return null;
    }
  }

  let lastLoadedData = null;
  let revenueRefreshPromise = null;
  let revenueRefreshKey = '';
  let revenueRefreshRequestId = 0;

  function queryString(payload) {
    const params = new URLSearchParams();
    Object.entries(payload || {}).forEach(([key, value]) => {
      const text = String(value ?? '').trim();
      if (text) params.set(key, text);
    });
    const qs = params.toString();
    return qs ? '?' + qs : '';
  }

  function toMoney(v) {
    const n = Number(v || 0);
    return Number.isFinite(n) ? Math.round(n / MONEY_DIVISOR) : 0;
  }

  function fromTs(ts) {
    const n = Number(ts || 0);
    return n > 0 ? new Date(n * 1000) : new Date(0);
  }

  function dateKey(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function emptyDailyRevenue(date) {
    return { date, gmv: 0, comm: 0, orders: 0, clicks: 0, clicksSeedingComment: 0, clicksOther: 0 };
  }

  function groupBy(arr, keyFn) {
    return arr.reduce((acc, item) => {
      const key = keyFn(item) || 'Khác';
      (acc[key] ||= []).push(item);
      return acc;
    }, {});
  }

  function normalizeGroupUrl(url) {
    return String(url || '')
      .replace(/^https?:\/\/(www\.)?facebook\.com\//i, '')
      .replace(/[?#].*$/, '')
      .replace(/\/$/, '')
      .toLowerCase();
  }

  function facebookGroupToken(url) {
    const match = String(url || '').match(/facebook\.com\/groups\/([^/?#]+)/i);
    return match ? match[1].trim().toLowerCase() : '';
  }

  function fallbackGroupName(url) {
    const key = normalizeGroupUrl(url);
    const slug = key.split('/').filter(Boolean).pop() || '';
    if (!slug) return url || '-';
    if (/^\d+$/.test(slug)) return 'Nhóm Facebook #' + slug;
    return slug
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function parseSubId(subId) {
    const parts = String(subId || '').split('-').filter(Boolean);
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
      groupId: Number((String(subId || '').match(/group(\d+)/i) || [])[1] || 0),
    };
  }

  function fullSubIdOf(record, fallbackKey) {
    const parsed = parseSubId(
      record?.sub_id || record?.utm_content || record?.subId || record?.utmContent || fallbackKey || ''
    );
    return [parsed.sub1, parsed.sub2, parsed.sub3, parsed.sub4, parsed.sub5].join('-');
  }

  function isSeedingCommentClick(click) {
    const parsed = parseSubId(click?.sub_id || click?.subId || click?.utm_content || click?.utmContent || '');
    const sub1 = String(click?.sub_id1 || click?.subId1 || parsed.sub1 || '').trim().toLowerCase();
    const sub2 = String(click?.sub_id2 || click?.subId2 || parsed.sub2 || '').trim().toLowerCase();
    return sub1 === 'seeding' && sub2 === 'comment';
  }

  function statusFromOrder(order) {
    // Trạng thái hoàn thành THỰC SỰ của đơn nằm trong order con: order.orders[].order_status
    // ("COMPLETED") / display_order_status (2 = hoàn thành) — đây là trạng thái mà dashboard web
    // hiển thị. Field top-level checkout_status ("Waiting for payment") chỉ là trạng thái chi trả
    // hoa hồng affiliate, KHÔNG phải trạng thái đơn hàng.
    const subStatuses = (order.orders || [])
      .map((o) => String(o.order_status || '').toUpperCase())
      .filter(Boolean);
    if (subStatuses.length) {
      if (subStatuses.some((s) => s.includes('CANCEL'))) return 'Đã hủy';
      if (subStatuses.some((s) => s.includes('COMPLETE'))) return 'Hoàn thành';
      return 'Chờ xử lý';
    }
    // Fallback đơn cũ thiếu order con: conversion_status (1=chờ, 2=hợp lệ/hoàn thành, 3=hủy/invalid)
    const conversion = Number(order.conversion_status || 0);
    if (conversion === 3) return 'Đã hủy';
    if (conversion === 2) return 'Hoàn thành';
    if (conversion === 1) return 'Chờ xử lý';
    // Fallback cuối: text checkout_status
    const raw = String(order.checkout_status || '').toLowerCase();
    if (raw.includes('cancel') || raw.includes('invalid')) return 'Đã hủy';
    if (raw.includes('pending')) return 'Chờ xử lý';
    return 'Hoàn thành';
  }

  function firstItem(order) {
    const nestedOrder = (order.orders || [])[0] || {};
    return (nestedOrder.items || [])[0] || {};
  }

  function flattenItems(order) {
    const rows = [];
    (order.orders || []).forEach((subOrder) => {
      (subOrder.items || []).forEach((item) => rows.push({ order, subOrder, item }));
    });
    return rows;
  }

  function firstNonEmpty(...values) {
    return values.find((value) => String(value || '').trim()) || '';
  }

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

  function loadRealData(payload = null) {
  const mockBootstrap = window.__FB_CRAWLER_MOCK_BOOTSTRAP__ || {};
  const current = window.APP_CURRENT || {};
  const source = payload || {};
  const allowLegacyFiles = !!window.__FB_CRAWLER_ALLOW_LEGACY_FILES__;
  const config = source.config
    || mockBootstrap.config
    || current.config
    || (allowLegacyFiles ? readJson('config.json', readConfigFallback()) : readConfigFallback());
  const products = source.products
    || mockBootstrap.products
    || current.products
    || (allowLegacyFiles ? readJson('/api/products', []) : []);
  const history = source.history
    || mockBootstrap.history
    || current.history
    || (allowLegacyFiles ? readJson('/api/comments', {}) : {});
  const groupPerf = source.groupPerf
    || mockBootstrap.groupPerf
    || current.groupPerf
    || (allowLegacyFiles ? readJson('/api/group_perf', { days: {} }) : { days: {} });
  const apiGroups = Array.isArray(source.apiGroups)
    ? source.apiGroups
    : (allowLegacyFiles ? readJson('/api/groups', null) : null);
  const orders = source.orders
    || mockBootstrap.orders
    || current.orders
    || (allowLegacyFiles ? readJson('/api/orders', []) : []);
  const clicks = source.clicks
    || mockBootstrap.clicks
    || current.clicks
    || (allowLegacyFiles ? readJson('/api/clicks', []) : []);
  const runHistory = source.runs || mockBootstrap.runs || current.runs || [];
  const groupCollections = source.groupCollections || mockBootstrap.groupCollections || current.groupCollections || [];
  const cpcConfig = source.cpcConfig || config.cpc_config || current.cpcConfig || mockBootstrap.cpcConfig || { average_cpc: 0, per_subid: {} };
  const cpcBySubid = cpcConfig.per_subid || {};
  const rawBrowserPaths = config.edge?.paths || {};
  const browserLabels = {
    edge: 'Microsoft Edge',
    chrome: 'Google Chrome',
    brave: 'Brave',
    coccoc: 'Cốc Cốc',
    chromium: 'Chromium',
  };
  const browserPaths = Array.isArray(rawBrowserPaths)
    ? { edge: rawBrowserPaths, chrome: [], brave: [], coccoc: [], chromium: [] }
    : Object.fromEntries(Object.keys(browserLabels).map((key) => [key, rawBrowserPaths[key] || []]));
  const browserChoices = Object.keys(browserLabels)
    .filter((key) => key === (config.edge?.browser || 'edge') || (browserPaths[key] || []).length)
    .map((key) => ({
      type: key,
      label: browserLabels[key],
      path: (browserPaths[key] || [])[0] || '',
      paths: browserPaths[key] || [],
    }));

  const groupSettings = config.group_settings || {};
  const groupPerfRows = [];
  Object.entries((groupPerf && groupPerf.days) || {}).forEach(([day, dayData]) => {
    Object.entries((dayData && dayData.groups) || {}).forEach(([subid, row]) => {
      groupPerfRows.push({ day, subid, ...row });
    });
  });

  const perfByUrl = {};
  groupPerfRows.forEach((row) => {
    const url = row.group_url || '';
    if (!url) return;
    const target = perfByUrl[url] ||= {
      scanned: 0,
      matched: 0,
      handled: 0,
      latest: '',
    };
    target.scanned += Number(row.scanned_posts || 0);
    target.matched += Number(row.suitable_posts || row.keyword_posts || 0);
    target.handled += Number(row.handled_posts || 0);
    if (row.day >= target.latest) target.latest = row.day;
  });

  const clicksByGroup = {};
  clicks.forEach((click) => {
    const parsed = parseSubId(click.sub_id);
    if (!parsed.groupId) return;
    clicksByGroup[parsed.groupId] = (clicksByGroup[parsed.groupId] || 0) + 1;
  });

  const ordersByGroup = {};
  orders.forEach((order) => {
    const parsed = parseSubId(order.utm_content);
    if (!parsed.groupId) return;
    const target = ordersByGroup[parsed.groupId] ||= { orders: 0, commission: 0 };
    target.orders += 1;
    target.commission += toMoney(order.estimated_total_commission);
  });

  function evaluateGroup(scanned, matched, handled, clicksCount, orderCount, commission) {
    if (window.evaluateGroupPerformance) {
      return window.evaluateGroupPerformance({
        scanned,
        suitable: matched,
        handled,
        clicks: clicksCount,
        orders: orderCount,
        commission,
      }).rating;
    }
    if (commission > 500000 || orderCount >= 5) return 'recommend';
    if (matched >= 20 || clicksCount >= 30) return 'monitor';
    if (scanned > 0 && matched === 0) return 'remove';
    return 'low';
  }

  const sourceGroups = Array.isArray(apiGroups) && apiGroups.length
    ? apiGroups.map((g) => ({
        id: Number(g.id || 0),
        url: g.url || '',
        name: g.name || '',
        enabled: g.enabled !== false && g.enabled !== 0,
        action_mode: g.action_mode || g.action || 'comment',
        last_scan_text: g.last_scan_text || g.lastScan || '',
        paused: !!g.paused,
        pausedAt: g.pausedAt || '',
      }))
    : [];

  const realGroups = sourceGroups.map((source, i) => {
    const url = source.url || '';
    const setting = groupSettings[url] || {};
    const id = Number(source.id || setting.id || i + 1);
    const perf = perfByUrl[url] || {};
    const fbToken = facebookGroupToken(url);
    const orderInfo = ordersByGroup[id] || ordersByGroup[fbToken] || {};
    const clickCount = clicksByGroup[id] || clicksByGroup[fbToken] || 0;
    const scanned = Number(perf.scanned || 0);
    const matched = Number(perf.matched || 0);
    const handled = Number(perf.handled || 0);
    const rating = evaluateGroup(scanned, matched, handled, clickCount, orderInfo.orders || 0, orderInfo.commission || 0);
    return {
      id,
      name: source.name || setting.name || ('Nhóm Facebook #' + id),
      url,
      enabled: source.enabled !== false,
      action: source.action_mode === 'telegram' ? 'telegram' : 'comment',
      lastScan: source.last_scan_text || setting.last_scan_text || (perf.latest ? perf.latest : 'Chưa quét'),
      paused: !!source.paused,
      pausedAt: source.pausedAt || '',
      scanned,
      matched,
      comments: handled,
      clicks: clickCount,
      orders: orderInfo.orders || 0,
      commission: orderInfo.commission || 0,
      rating,
    };
  });

  const groupNameByUrl = {};
  Object.entries(groupSettings).forEach(([url, setting]) => {
    if (setting && setting.name) groupNameByUrl[normalizeGroupUrl(url)] = setting.name;
  });
  realGroups.forEach((group) => {
    if (group.url && group.name) groupNameByUrl[normalizeGroupUrl(group.url)] = group.name;
  });

  function resolveGroupName(groupUrl, permalink) {
    const raw = groupUrl || permalink || '';
    const key = normalizeGroupUrl(raw);
    if (groupNameByUrl[key]) return groupNameByUrl[key];
    const groupMatch = String(raw).match(/facebook\.com\/groups\/([^/?#]+)/i);
    if (groupMatch) {
      const groupKey = normalizeGroupUrl('groups/' + groupMatch[1]);
      if (groupNameByUrl[groupKey]) return groupNameByUrl[groupKey];
      return fallbackGroupName('groups/' + groupMatch[1]);
    }
    return fallbackGroupName(raw);
  }

  const realProducts = products.map((entry, i) => {
    const rawStatus = String(entry.status || '').toLowerCase();
    const status = rawStatus === 'skipped' || rawStatus === 'ignored'
      ? 'skipped'
      : rawStatus === 'pending' || rawStatus === 'pending_link'
        ? 'pending'
        : (entry.url ? 'ready' : 'pending');
    const keyword = entry.keyword || entry.product_name || '';
    const storedName = String(entry.product_name || entry.name || '').trim();
    const urlName = productNameFromShopeeUrl(entry.original_url || entry.url);
    return {
      id: i + 1,
      status,
      keyword,
      name: storedName && storedName !== String(keyword).trim() ? storedName : (urlName || storedName || keyword),
      url: entry.url || '',
      category: entry.category || null,
      demand: Number(entry.demand_count || entry.use_count || 0),
    };
  });

  const historyRows = [];
  Object.entries(history || {}).forEach(([day, dayData]) => {
    (dayData.comments || []).forEach((row) => {
      const d = new Date(day + 'T' + (row.time || '00:00:00'));
      historyRows.push({
        time: Number.isNaN(d.getTime()) ? new Date(day) : d,
        mode: String(row.mode || 'comment').toLowerCase(),  // raw: comment/pending/rejected/telegram
        group: resolveGroupName(row.group, row.permalink),
        groupUrl: row.group || row.permalink || '',
        product: row.product || '-',
        comment: row.comment || '',
        account: row.account_name || row.account || '',
      });
    });
  });
  historyRows.sort((a, b) => b.time - a.time);

  const allItems = orders.flatMap(flattenItems);
  const revenueRows = orders.map((order) => {
    const item = firstItem(order);
    const parsed = parseSubId(order.utm_content);
    const gmv = flattenItems(order).reduce((sum, row) => sum + toMoney(row.item.actual_amount), 0);
    const comm = toMoney(order.estimated_total_commission);
    return {
      time: fromTs(order.purchase_time || order.click_time),
      product: item.item_name || order.utm_content || '-',
      shop: item.shop_name || '-',
      gmv,
      comm,
      channel: order.direct_source || order.last_external_source || 'Không rõ',
      subId: parsed.full,
      sub1: parsed.sub1 || '-',
      sub2: parsed.sub2 || '-',
      sub3: parsed.sub3 || '-',
      sub4: parsed.sub4 || (parsed.groupId ? 'group' + parsed.groupId : '-'),
      sub5: parsed.sub5 || '-',
      status: statusFromOrder(order),
    };
  }).sort((a, b) => b.time - a.time);

  function parseRangeDate(value, endOfDay = false) {
    if (!value) return null;
    const d = new Date(String(value) + (String(value).includes('T') ? '' : (endOfDay ? 'T23:59:59.999' : 'T00:00:00')));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function rangeBounds(filter = {}) {
    let from = parseRangeDate(filter.from, false);
    let to = parseRangeDate(filter.to, true);
    if (from && to && from > to) {
      from = parseRangeDate(filter.to, false);
      to = parseRangeDate(filter.from, true);
    }
    return { from, to };
  }

  function inRangeDate(date, bounds) {
    if (!date || Number.isNaN(date.getTime())) return false;
    if (bounds.from && date < bounds.from) return false;
    if (bounds.to && date > bounds.to) return false;
    return true;
  }

  function orderDate(order) {
    return fromTs(order.purchase_time || order.click_time);
  }

  function filteredRawOrders(filter = {}) {
    const bounds = rangeBounds(filter);
    if (!bounds.from && !bounds.to) return orders;
    return orders.filter((order) => inRangeDate(orderDate(order), bounds));
  }

  function filteredRevenueRows(filter = {}) {
    const bounds = rangeBounds(filter);
    if (!bounds.from && !bounds.to) return revenueRows;
    return revenueRows.filter((row) => inRangeDate(row.time, bounds));
  }

  function filteredClicks(filter = {}) {
    const bounds = rangeBounds(filter);
    if (!bounds.from && !bounds.to) return clicks;
    return clicks.filter((click) => inRangeDate(fromTs(click.click_time), bounds));
  }

  const gmvTotal = allItems.reduce((sum, row) => sum + toMoney(row.item.actual_amount), 0);
  const commissionTotal = orders.reduce((sum, order) => sum + toMoney(order.estimated_total_commission), 0);
  const brandCommission = orders.reduce((sum, order) => sum + toMoney(order.total_brand_commission), 0);
  const orderCount = orders.length;
  const clickCount = clicks.length;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);
  const weekStart = new Date(todayStart.getTime() - 6 * DAY_MS);
  const lastWeekStart = new Date(todayStart.getTime() - 13 * DAY_MS);

  function sumWindow(from, to) {
    return revenueRows.reduce((acc, row) => {
      if (row.time >= from && row.time < to) {
        acc.gmv += row.gmv;
        acc.ord += 1;
      }
      return acc;
    }, { gmv: 0, ord: 0 });
  }

  const revenueKpi = {
    gmv: gmvTotal,
    commission: commissionTotal,
    xtraComm: brandCommission,
    shopeeComm: Math.max(0, commissionTotal - brandCommission),
    orders: orderCount,
    clicks: clickCount,
    epc: clickCount ? Math.round(commissionTotal / clickCount) : 0,
    cvr: clickCount ? (orderCount / clickCount) * 100 : 0,
    commRate: gmvTotal ? (commissionTotal / gmvTotal) * 100 : 0,
    avgOrder: orderCount ? Math.round(gmvTotal / orderCount) : 0,
    byType: {
      video: { orders: 0, gmv: 0, comm: 0 },
      live: { orders: 0, gmv: 0, comm: 0 },
      social: { orders: orderCount, gmv: gmvTotal, comm: commissionTotal },
      zero: {
        orders: revenueRows.filter((r) => !r.gmv).length,
        gmv: 0,
        comm: revenueRows.filter((r) => !r.gmv).reduce((sum, r) => sum + r.comm, 0),
      },
      cancelled: {
        orders: revenueRows.filter((r) => r.status === 'Đã hủy').length,
        gmv: revenueRows.filter((r) => r.status === 'Đã hủy').reduce((sum, r) => sum + r.gmv, 0),
        comm: revenueRows.filter((r) => r.status === 'Đã hủy').reduce((sum, r) => sum + r.comm, 0),
      },
    },
    compare: {
      today: sumWindow(todayStart, new Date(todayStart.getTime() + DAY_MS)),
      yesterday: sumWindow(yesterdayStart, todayStart),
      thisWeek: sumWindow(weekStart, new Date(todayStart.getTime() + DAY_MS)),
      lastWeek: sumWindow(lastWeekStart, weekStart),
    },
  };

  function aggregateTopItems(sourceOrders = orders) {
    const byProduct = {};
    const byShop = {};
    const byCat = {};
    sourceOrders.flatMap(flattenItems).forEach(({ item }) => {
      const productName = item.item_name || 'Không rõ sản phẩm';
      const shopName = item.shop_name || 'Không rõ shop';
      const category = item.global_category_lv1_name || 'Khác';
      const gmv = toMoney(item.actual_amount);
      const comm = toMoney(item.item_commission);
      const qty = Number(item.qty || 1);
      const p = byProduct[productName] ||= { name: productName, shop: shopName, category, orders: 0, sold: 0, clicks: 0, gmv: 0, comm: 0, epc: 0 };
      p.orders += qty; p.gmv += gmv; p.comm += comm;
      const s = byShop[shopName] ||= { name: shopName, orders: 0, gmv: 0, comm: 0, rate: 0 };
      s.orders += qty; s.gmv += gmv; s.comm += comm; s.rate = s.gmv ? (s.comm / s.gmv) * 100 : 0;
      const c = byCat[category] ||= { name: category, gmv: 0 };
      c.gmv += gmv;
    });
    Object.values(byProduct).forEach((p) => {
      p.sold = p.orders;
      p.epc = p.clicks ? p.comm / p.clicks : 0;
    });
    return {
      products: Object.values(byProduct).sort((a, b) => b.comm - a.comm).slice(0, 20),
      shops: Object.values(byShop).sort((a, b) => b.comm - a.comm).slice(0, 20),
      categories: Object.values(byCat).sort((a, b) => b.gmv - a.gmv).slice(0, 8),
    };
  }

  const top = aggregateTopItems();
  const subRows = (() => {
    const bySub = {};
    clicks.forEach((click) => {
      const parsed = parseSubId(click.sub_id);
      const key = click.sub_id || '----';
      const row = bySub[key] ||= { ...parsed, type: parsed.sub1 === 'seeding' ? 'Auto' : 'Manual', clicks: 0, orders: 0, comm: 0 };
      row.clicks += 1;
    });
    orders.forEach((order) => {
      const parsed = parseSubId(order.utm_content);
      const key = order.utm_content || '----';
      const row = bySub[key] ||= { ...parsed, type: parsed.sub1 === 'seeding' ? 'Auto' : 'Manual', clicks: 0, orders: 0, comm: 0 };
      row.orders += 1;
      row.comm += toMoney(order.estimated_total_commission);
    });
    return Object.values(bySub).map((row) => {
      const full = [row.sub1, row.sub2, row.sub3, row.sub4, row.sub5].join('-');
      const cpc = Number(
        cpcBySubid[full] ?? cpcBySubid[row.sub3] ?? cpcBySubid[row.sub4] ?? cpcConfig.average_cpc ?? 0
      ) || 0;
      const profit = row.comm - row.clicks * cpc;
      return {
        ...row,
        full,
        sub1: row.sub1 || '-',
        sub2: row.sub2 || '-',
        sub3: row.sub3 || '-',
        sub4: row.sub4 || (row.groupId ? 'group' + row.groupId : '-'),
        sub5: row.sub5 || '-',
        epc: row.clicks ? row.comm / row.clicks : 0,
        cvr: row.clicks ? (row.orders / row.clicks) * 100 : 0,
        cpc,
        profit,
        rating: profit > 50000 ? 'Tốt' : profit > 0 ? 'Khá' : 'Lỗ',
      };
    }).sort((a, b) => b.comm - a.comm || b.clicks - a.clicks);
  })();

  function buildSubIdDetail(row, filter = {}) {
    const full = row?.full || [row?.sub1, row?.sub2, row?.sub3, row?.sub4, row?.sub5].join('-');
    const bounds = rangeBounds(filter);
    const clickRows = clicks
      .filter((click) => fullSubIdOf(click) === full && inRangeDate(fromTs(click.click_time), bounds))
      .sort((a, b) => Number(b.click_time || 0) - Number(a.click_time || 0))
      .map((click) => ({
        click_id: click.click_id || '',
        subids: fullSubIdOf(click),
        time: fromTs(click.click_time),
        source: firstNonEmpty(click.direct_source, click.last_external_source, click.first_external_source, click.referrer, '-'),
      }));
    const orderRows = orders
      .filter((order) => fullSubIdOf(order) === full && inRangeDate(orderDate(order), bounds))
      .sort((a, b) => Number(b.purchase_time || b.click_time || 0) - Number(a.purchase_time || a.click_time || 0))
      .map((order) => {
        const item = firstItem(order);
        return {
          order_id: (order.orders || [])[0]?.order_sn || (order.orders || [])[0]?.order_id || order.order_id || order.checkout_id || '',
          subids: fullSubIdOf(order),
          time: fromTs(order.purchase_time || order.click_time),
          product: item.item_name || '-',
          gmv: flattenItems(order).reduce((sum, row) => sum + toMoney(row.item.actual_amount), 0),
          commission: toMoney(order.estimated_total_commission),
        };
      });
    return { clicks: clickRows, orders: orderRows };
  }

  const dailyRows = (() => {
    const base = new Date(todayStart);
    const byDay = {};
    revenueRows.forEach((row) => {
      const key = dateKey(row.time);
      const day = byDay[key] ||= emptyDailyRevenue(new Date(row.time.getFullYear(), row.time.getMonth(), row.time.getDate()));
      day.gmv += row.gmv;
      day.comm += row.comm;
      day.orders += 1;
    });
    clicks.forEach((click) => {
      const d = fromTs(click.click_time);
      const key = dateKey(d);
      const day = byDay[key] ||= emptyDailyRevenue(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
      day.clicks += 1;
      if (isSeedingCommentClick(click)) day.clicksSeedingComment += 1;
      else day.clicksOther += 1;
    });
    const out = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(base.getTime() - i * DAY_MS);
      const key = dateKey(d);
      out.push(byDay[key] || emptyDailyRevenue(d));
    }
    return out;
  })();

  const hourlyRows = (() => {
    const rows = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, clicks: 0 }));
    revenueRows.forEach((row) => { rows[row.time.getHours()].orders += 1; });
    clicks.forEach((click) => { rows[fromTs(click.click_time).getHours()].clicks += 1; });
    return rows;
  })();

  function sumWindowFromRows(rows, from, to) {
    return rows.reduce((acc, row) => {
      if (row.time >= from && row.time < to) {
        acc.gmv += row.gmv;
        acc.comm += row.comm;
        acc.ord += 1;
      }
      return acc;
    }, { gmv: 0, comm: 0, ord: 0 });
  }

  function buildRevenueKpiFor(filter = {}) {
    const orderList = filteredRawOrders(filter);
    const rowList = filteredRevenueRows(filter);
    const clickList = filteredClicks(filter);
    const gmv = rowList.reduce((sum, row) => sum + row.gmv, 0);
    const comm = orderList.reduce((sum, order) => sum + toMoney(order.estimated_total_commission), 0);
    const brand = orderList.reduce((sum, order) => sum + toMoney(order.total_brand_commission), 0);
    const zeroRows = rowList.filter((row) => !row.gmv);
    const cancelledRows = rowList.filter((row) => row.status === 'Đã hủy');
    return {
      gmv,
      commission: comm,
      xtraComm: brand,
      shopeeComm: Math.max(0, comm - brand),
      orders: orderList.length,
      clicks: clickList.length,
      epc: clickList.length ? Math.round(comm / clickList.length) : 0,
      cvr: clickList.length ? (orderList.length / clickList.length) * 100 : 0,
      commRate: gmv ? (comm / gmv) * 100 : 0,
      avgOrder: orderList.length ? Math.round(gmv / orderList.length) : 0,
      byType: {
        video: { orders: 0, gmv: 0, comm: 0 },
        live: { orders: 0, gmv: 0, comm: 0 },
        social: { orders: orderList.length, gmv, comm },
        zero: {
          orders: zeroRows.length,
          gmv: 0,
          comm: zeroRows.reduce((sum, row) => sum + row.comm, 0),
        },
        cancelled: {
          orders: cancelledRows.length,
          gmv: cancelledRows.reduce((sum, row) => sum + row.gmv, 0),
          comm: cancelledRows.reduce((sum, row) => sum + row.comm, 0),
        },
      },
      compare: (() => {
        // Ngày gần nhất có data — dùng toàn bộ revenueRows (không theo filter)
        const dayTimes = revenueRows
          .filter(r => r.time instanceof Date && !isNaN(r.time))
          .map(r => new Date(r.time.getFullYear(), r.time.getMonth(), r.time.getDate()).getTime());
        const uniqueDays = [...new Set(dayTimes)].sort((a, b) => b - a);
        const lastDayStart = uniqueDays.length > 0 ? new Date(uniqueDays[0]) : yesterdayStart;
        const prevDayStart = new Date(lastDayStart.getTime() - DAY_MS);
        const fmtDay = (d) => d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

        // Kỳ hiện tại theo filter — so với kỳ trước cùng độ dài
        const bounds = rangeBounds(filter);
        const pFrom = bounds.from
          ? new Date(bounds.from.getFullYear(), bounds.from.getMonth(), bounds.from.getDate())
          : weekStart;
        const pToDay = bounds.to
          ? new Date(bounds.to.getFullYear(), bounds.to.getMonth(), bounds.to.getDate())
          : todayStart;
        const pTo = new Date(pToDay.getTime() + DAY_MS);
        const pDays = Math.max(1, Math.round((pTo - pFrom) / DAY_MS));
        const prevPTo = pFrom;
        const prevPFrom = new Date(pFrom.getTime() - pDays * DAY_MS);

        return {
          lastDay: sumWindowFromRows(revenueRows, lastDayStart, new Date(lastDayStart.getTime() + DAY_MS)),
          prevDay: sumWindowFromRows(revenueRows, prevDayStart, lastDayStart),
          lastDayLabel: fmtDay(lastDayStart),
          prevDayLabel: fmtDay(prevDayStart),
          currPeriod: sumWindowFromRows(revenueRows, pFrom, pTo),
          prevPeriod: sumWindowFromRows(revenueRows, prevPFrom, prevPTo),
          periodDays: pDays,
        };
      })(),
    };
  }

  function buildDailyRevenueFor(filter = {}) {
    const bounds = rangeBounds(filter);
    const end = bounds.to
      ? new Date(bounds.to.getFullYear(), bounds.to.getMonth(), bounds.to.getDate())
      : new Date(todayStart);
    const start = bounds.from
      ? new Date(bounds.from.getFullYear(), bounds.from.getMonth(), bounds.from.getDate())
      : new Date(end.getTime() - 29 * DAY_MS);
    const byDay = {};
    filteredRevenueRows({ from: dateKey(start), to: dateKey(end) }).forEach((row) => {
      const key = dateKey(row.time);
      const day = byDay[key] ||= emptyDailyRevenue(new Date(row.time.getFullYear(), row.time.getMonth(), row.time.getDate()));
      day.gmv += row.gmv;
      day.comm += row.comm;
      day.orders += 1;
    });
    filteredClicks({ from: dateKey(start), to: dateKey(end) }).forEach((click) => {
      const d = fromTs(click.click_time);
      const key = dateKey(d);
      const day = byDay[key] ||= emptyDailyRevenue(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
      day.clicks += 1;
      if (isSeedingCommentClick(click)) day.clicksSeedingComment += 1;
      else day.clicksOther += 1;
    });
    const out = [];
    const totalDays = Math.max(0, Math.round((end - start) / DAY_MS));
    for (let i = 0; i <= totalDays; i++) {
      const d = new Date(start.getTime() + i * DAY_MS);
      const key = dateKey(d);
      out.push(byDay[key] || emptyDailyRevenue(d));
    }
    return out;
  }

  function buildHourlyFor(filter = {}) {
    const rows = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, clicks: 0 }));
    filteredRevenueRows(filter).forEach((row) => { rows[row.time.getHours()].orders += 1; });
    filteredClicks(filter).forEach((click) => { rows[fromTs(click.click_time).getHours()].clicks += 1; });
    return rows;
  }

  function buildSubRowsFor(filter = {}) {
    const bySub = {};
    filteredClicks(filter).forEach((click) => {
      const parsed = parseSubId(click.sub_id);
      const key = click.sub_id || '----';
      const row = bySub[key] ||= { ...parsed, type: parsed.sub1 === 'seeding' ? 'Auto' : 'Manual', clicks: 0, orders: 0, comm: 0 };
      row.clicks += 1;
    });
    filteredRawOrders(filter).forEach((order) => {
      const parsed = parseSubId(order.utm_content);
      const key = order.utm_content || '----';
      const row = bySub[key] ||= { ...parsed, type: parsed.sub1 === 'seeding' ? 'Auto' : 'Manual', clicks: 0, orders: 0, comm: 0 };
      row.orders += 1;
      row.comm += toMoney(order.estimated_total_commission);
    });
    return Object.values(bySub).map((row) => {
      const full = [row.sub1, row.sub2, row.sub3, row.sub4, row.sub5].join('-');
      const cpc = Number(
        cpcBySubid[full] ?? cpcBySubid[row.sub3] ?? cpcBySubid[row.sub4] ?? cpcConfig.average_cpc ?? 0
      ) || 0;
      const profit = row.comm - row.clicks * cpc;
      return {
        ...row,
        full,
        sub1: row.sub1 || '-',
        sub2: row.sub2 || '-',
        sub3: row.sub3 || '-',
        sub4: row.sub4 || (row.groupId ? 'group' + row.groupId : '-'),
        sub5: row.sub5 || '-',
        epc: row.clicks ? row.comm / row.clicks : 0,
        cvr: row.clicks ? (row.orders / row.clicks) * 100 : 0,
        cpc,
        profit,
        rating: profit > 50000 ? 'Tốt' : profit > 0 ? 'Khá' : 'Lỗ',
      };
    }).sort((a, b) => b.comm - a.comm || b.clicks - a.clicks);
  }

  function buildTopFor(filter = {}) {
    return aggregateTopItems(filteredRawOrders(filter));
  }

  window.staticDataApi = {
    connected: true,
    loadRunHistory(payload = {}) {
      const current = window.APP_CURRENT || {};
      return Promise.resolve({
        ok: true,
        data: { runs: current.runs || [] },
      });
    },
    loadGroupCollections() {
      const current = window.APP_CURRENT || {};
      return Promise.resolve({
        ok: true,
        data: { collections: current.groupCollections || [] },
      });
    },
    refreshGroupPerformance(payload = {}) {
      const bounds = rangeBounds(payload);
      const filteredGroups = realGroups.map((group) => ({
        id: group.id,
        name: group.name,
        url: group.url,
        scanned: group.scanned || 0,
        suitable: group.matched || 0,
        handled: group.comments || 0,
        comments: group.comments || 0,
        comment_success: group.comments || 0,
        commission: group.commission || 0,
        revenue: group.commission || 0,
        clicks: group.clicks || 0,
        orders: group.orders || 0,
        rating: group.rating || 'none',
      }));
      return Promise.resolve({
        ok: true,
        data: {
          rows: filteredGroups,
          summary: {
            total: filteredGroups.length,
            from: bounds.from ? dateKey(bounds.from) : '',
            to: bounds.to ? dateKey(bounds.to) : '',
          },
        },
      });
    },
  };

  const hasAnyData =
    realGroups.length
    || realProducts.length
    || historyRows.length
    || orders.length
    || clicks.length
    || runHistory.length
    || groupCollections.length;
  const realLogs = hasAnyData ? [
    { t: 0, k: 'info', tag: 'SNAPSHOT', msg: `Dữ liệu hiện có: ${realGroups.length} nhóm, ${products.length} sản phẩm, ${config.buy_keywords?.length || 0} keyword mua hàng` },
    { t: 0, k: 'success', tag: 'GROUP', msg: `${realGroups.filter((g) => g.enabled).length}/${realGroups.length} nhóm đang bật trong config.json` },
    { t: 0, k: 'info', tag: 'AI', msg: `Cấu hình AI: ${config.ai?.provider || 'auto'} • Combo: ${config.ai?.['9router']?.combo || '-'}` },
    { t: 0, k: 'shopee', tag: 'AFF', msg: `File Shopee Affiliate hiện có ${orders.length} đơn và ${clicks.length} click` },
    { t: 0, k: 'comment', tag: 'HISTORY', msg: `comment_history.json hiện có ${historyRows.length} comment` },
    { t: 0, k: 'product', tag: 'PRODUCT', msg: `${realProducts.filter((p) => p.status === 'ready').length} sản phẩm sẵn sàng, ${realProducts.filter((p) => p.status === 'pending').length} keyword chờ link` },
  ] : [];

  function maskToken(token) {
    const s = String(token || '');
    if (!s) return '';
    if (s.length <= 8) return '••••••••';
    return s.slice(0, 4) + '...' + s.slice(-4);
  }

  function maskSecretInput(token) {
    const s = String(token || '');
    return s ? '•'.repeat(Math.min(s.length, 64)) : '';
  }

  const routerCfg = config.ai?.['9router'] || {};
  const normalizeAiProvider = (value) => {
    const provider = String(value || '').trim().toLowerCase();
    if (['chatgpt', 'web', 'gpt'].includes(provider)) return 'gpt';
    if (['9router', 'ninerouter', 'auto'].includes(provider)) return '9router';
    return 'gpt';
  };
  const aiProvider = normalizeAiProvider(config.ai?.provider || 'gpt');
  const normalizeConvertProvider = (value) => {
    const provider = String(value || '').trim();
    if (provider === 'tinyurl_browser' || provider === 'shorturl_browser') return 'tinycc_browser';
    if (['tinyurl', 'muahangre', 'tinycc_browser'].includes(provider)) return provider;
    return config.tinyurl?.enabled ? 'tinyurl' : 'off';
  };
  const tinyccWaitRaw = Number(config.tinyurl?.browser_confirm_wait_seconds || 8);
  const tinyccWaitSeconds = Number.isFinite(tinyccWaitRaw)
    ? Math.max(1, Math.min(30, tinyccWaitRaw))
    : 8;
  const tinyRows = (config.tinyurl?.api_tokens || []).map((row) => ({
    use: row.active !== false,
    token: maskToken(row.token),
    last: row.last_error || '—',
    updated: row.updated_at || '—',
    limitedUntil: row.limited_until || '',
  }));
  const computedConfigUi = {
    chatgptUrl: config.tabs?.chatgpt || 'https://chatgpt.com',
    shopeeUrl: config.tabs?.shopee || 'https://shopee.vn',
    affUrl: config.tabs?.shopee_affiliate || 'https://affiliate.shopee.vn/dashboard',
    aiProvider,
    aiFallback: aiProvider === '9router',
    aiRouter9: aiProvider === '9router' || routerCfg.enabled !== false,
    routerUrl: routerCfg.url || '',
    routerToken: maskSecretInput(routerCfg.token),
    combo: routerCfg.combo || '',
    analyzePrompt: config.ai?.analysis_prompt || '',
    commentPrompt: config.ai?.comment_prompt || '',
    analysisPromptRule: config.ai?.analysis_prompt || '',
    commentPromptRule: config.ai?.comment_prompt || '',
    telemetryEnabled: !!config.telemetry?.enabled,
    telemetryEndpoint: config.telemetry?.endpoint || '',
    telemetryApiKey: maskSecretInput(config.telemetry?.api_key),
    telemetryTraceback: config.telemetry?.include_traceback !== false,
    telemetryWarnings: config.telemetry?.send_warning !== false,
    telemetryRecentLogs: Number(config.telemetry?.recent_log_limit || 20),
    tgEnabled: !!config.telegram?.enabled,
    tgToken: maskSecretInput(config.telegram?.bot_token),
    tgChatId: String(config.telegram?.chat_id || ''),
    tgPreview: config.telegram?.link_preview !== false,
    tgNotifyCommentErrors: !!config.telegram?.notify_comment_errors,
    tgControl: !!config.telegram?.control_enabled,
    affMethod: config.affiliate_api?.method === 'web_ui' ? 'web_ui' : 'api',
    cvProvider: normalizeConvertProvider(config.link_converter?.provider),
    tinyccWaitSeconds,
    affiliateId: String(config.link_converter?.affiliate_id || '').replace(/\D/g, ''),
    tinyApiKey: maskSecretInput((config.tinyurl?.api_tokens || []).find(t => t.active !== false)?.token),
    muahangreApiKey: maskSecretInput(config.link_converter?.muahangre?.api_key),
    muahangreStatus: {
      status: config.link_converter?.muahangre?.status || '',
      lastErrorCode: config.link_converter?.muahangre?.last_error_code || '',
      lastError: config.link_converter?.muahangre?.last_error || '',
      updatedAt: config.link_converter?.muahangre?.updated_at || '',
      lastSuccessAt: config.link_converter?.muahangre?.last_success_at || '',
    },
    tinyRows,
    perGroup: Number(config.posts_per_group || 20),
    delay: Number(config.timing?.delay_after_comment || 10),
    workflow: config.workflow?.mode || 'full',
    skipProcessed: config.workflow?.skip_processed !== false,
    deleteUnapproved: config.workflow?.delete_unapproved_comment !== false,
    runMode: config.timing?.run_mode || 'once',
    cycleWait: Math.round(Number(config.timing?.cycle_interval || 900) / 60),
    browserType: config.edge?.browser || 'edge',
    browserHeadless: !!config.edge?.headless,
    browserProfileId: config.edge?.profile_id || '',
    browserProfiles: [],
    edgePort: Number(config.edge?.debugging_port || 9222),
    useSeparateProfile: !!config.edge?.use_separate_profile,
    browserChoices,
    browserPaths,
    edgePaths: browserPaths.edge,
    chromePaths: browserPaths.chrome,
    theme: config.ui?.theme || 'system',
    buyKeywords: (config.buy_keywords || []).join('\n'),
    blacklistKeywords: (config.blacklist_keywords || []).join('\n'),
  };
  const effectiveTinyRows = Array.isArray(source.tinyRows)
    ? source.tinyRows
    : Array.isArray(mockBootstrap.tinyRows)
      ? mockBootstrap.tinyRows
      : tinyRows;
  const configUi = {
    ...computedConfigUi,
    ...(mockBootstrap.configUi || {}),
    ...(source.configUi || {}),
    tinyRows: effectiveTinyRows,
  };

  GROUPS.splice(0, GROUPS.length, ...realGroups);
  GROUPS_NAMES.splice(0, GROUPS_NAMES.length, ...realGroups.map((g) => g.name).filter(Boolean));
  KW_LIST.splice(0, KW_LIST.length, ...(config.buy_keywords || []).slice(0, 50));
  PRODS.splice(0, PRODS.length, ...top.products.map((p) => p.name).slice(0, 30));
  INITIAL_LOGS.splice(0, INITIAL_LOGS.length, ...realLogs);
  TOP_PRODUCTS.splice(0, TOP_PRODUCTS.length, ...top.products);
  TOP_SHOPS.splice(0, TOP_SHOPS.length, ...top.shops);
  CATEGORIES.splice(0, CATEGORIES.length, ...top.categories);
  INDUSTRIES.splice(0, INDUSTRIES.length, ...Array.from(new Set([
    ...realProducts.map((p) => p.category).filter(Boolean),
    ...top.categories.map((c) => c.name).filter(Boolean),
  ])).sort((a, b) => a.localeCompare(b, 'vi')));
  Object.assign(REVENUE_KPI, revenueKpi);

  buildHistory = function () { return historyRows; };
  buildProducts = function () { return realProducts; };
  window.buildRevenueKpi = function (filter) { return buildRevenueKpiFor(filter); };
  buildDailyRevenue = function (filter) { return filter?.from || filter?.to ? buildDailyRevenueFor(filter) : dailyRows; };
  buildHourly = function (filter) { return filter?.from || filter?.to ? buildHourlyFor(filter) : hourlyRows; };
  buildSubIds = function (filter) { return filter?.from || filter?.to ? buildSubRowsFor(filter) : subRows; };
  buildOrders = function (filter) { return filter?.from || filter?.to ? filteredRevenueRows(filter) : revenueRows; };
  window.buildTopProducts = function (filter) { return buildTopFor(filter).products; };
  window.buildTopShops = function (filter) { return buildTopFor(filter).shops; };
  window.buildCategories = function (filter) { return buildTopFor(filter).categories; };
  let logCursor = 0;
  nextLog = function () {
    if (!hasAnyData) return null;
    const options = [
      { k: 'info', tag: 'CONFIG', msg: `${realGroups.filter((g) => g.enabled).length}/${realGroups.length} nhóm đang bật` },
      { k: 'shopee', tag: 'AFF', msg: `${orders.length} đơn • ${clicks.length} click • HH ${fmt.vnd(commissionTotal)}đ` },
      { k: 'comment', tag: 'HISTORY', msg: `${historyRows.length} comment đã lưu trong comment_history.json` },
      { k: 'product', tag: 'PRODUCT', msg: `${realProducts.length} sản phẩm trong kho` },
    ];
    const item = options[logCursor % options.length];
    logCursor += 1;
    return item;
  };

  window.APP_CURRENT = {
    config,
    configUi,
    tinyRows: effectiveTinyRows,
    groups: realGroups,
    products: realProducts,
    cpcConfig,
    history: historyRows,
    orders: revenueRows,
    clicks,
    runs: runHistory,
    groupCollections,
    groupPerf,
    apiGroups,
    revenueKpi,
    progress: {
      groups: source.progress?.groups ?? realGroups.filter((g) => g.enabled).length,
      totalGroups: source.progress?.totalGroups ?? realGroups.length,
      scanned: source.progress?.scanned ?? groupPerfRows.reduce((sum, row) => sum + Number(row.scanned_posts || 0), 0),
      suitable: source.progress?.suitable ?? groupPerfRows.reduce((sum, row) => sum + Number(row.suitable_posts || row.keyword_posts || 0), 0),
      direct: source.progress?.direct ?? historyRows.filter((row) => row.mode === 'comment').length,
      telegram: source.progress?.telegram ?? historyRows.filter((row) => row.mode === 'telegram').length,
      currentGroupName:
        source.progress?.currentGroupName
        || mockBootstrap.appCurrent?.progress?.currentGroupName
        || realGroups.find((g) => g.enabled)?.name
        || '',
    },
    modeText: config.workflow?.mode === 'collect_keywords'
      ? 'Chỉ thu thập keyword • ' + (config.timing?.run_mode === 'cycle' ? 'Lặp chu kỳ' : 'Chạy 1 lần')
      : 'Chạy đầy đủ • ' + (config.timing?.run_mode === 'cycle' ? 'Lặp chu kỳ' : 'Chạy 1 lần'),
    summary: {
      groups: source.summary?.groups ?? realGroups.length,
      enabledGroups: source.summary?.enabledGroups ?? realGroups.filter((g) => g.enabled).length,
      products: source.summary?.products ?? realProducts.length,
      comments: source.summary?.comments ?? historyRows.length,
      orders: source.summary?.orders ?? orderCount,
      clicks: source.summary?.clicks ?? clickCount,
    },
  };

  Object.assign(window, {
    INITIAL_LOGS,
    nextLog,
    GROUPS,
    GROUPS_NAMES,
    KW_LIST,
    PRODS,
    buildHistory,
    REVENUE_KPI,
    buildRevenueKpi: window.buildRevenueKpi,
    buildDailyRevenue,
    buildHourly,
    TOP_PRODUCTS,
    TOP_SHOPS,
    CATEGORIES,
    buildTopProducts: window.buildTopProducts,
    buildTopShops: window.buildTopShops,
    buildCategories: window.buildCategories,
    buildSubIds,
    buildOrders,
    INDUSTRIES,
    buildProducts,
    buildSubIdDetail,
  });

  lastLoadedData = {
    config,
    products,
    history,
    groupPerf,
    apiGroups,
    orders,
    clicks,
    runs: runHistory,
    groupCollections,
    cpcConfig,
    progress: source.progress || null,
    summary: source.summary || null,
  };

  return window.APP_CURRENT;
  }

  let refreshPromise = null;
  window.refreshRealData = function () {
    if (refreshPromise) return refreshPromise;
    const base = lastLoadedData || {};
    const mockBootstrap = window.__FB_CRAWLER_MOCK_BOOTSTRAP__ || {};
    refreshPromise = readBackendSnapshot(base).then((snapshot) => {
      if (snapshot) {
        const data = loadRealData(snapshot);
        window.dispatchEvent(new CustomEvent('app:data-refreshed', { detail: data }));
        return data;
      }
      return Promise.all([
        // Giữ snapshot hiện tại nếu một endpoint lỗi tạm thời; không biến
        // doanh thu đang có thành 0 chỉ vì refresh gặp lỗi mạng/bridge.
        Promise.resolve(base.config || mockBootstrap.config || readConfigFallback()),
        readJsonAsync('/api/products', base.products || []),
        readJsonAsync('/api/comments', base.history || {}),
        readJsonAsync('/api/group_perf', base.groupPerf || { days: {} }),
        readJsonAsync('/api/groups', base.apiGroups ?? null),
        readJsonAsync('/api/orders', base.orders || []),
        readJsonAsync('/api/clicks', base.clicks || []),
      ]).then(([config, products, history, groupPerf, apiGroups, orders, clicks]) => {
        const data = loadRealData({ config, products, history, groupPerf, apiGroups, orders, clicks });
        window.dispatchEvent(new CustomEvent('app:data-refreshed', { detail: data }));
        return data;
      });
    }).finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  };

  // Revenue sync only changes orders and clicks. Avoid reloading the large
  // comments/products/performance payloads, which can block the whole UI.
  window.refreshRevenueData = function (filter) {
    const suffix = queryString(filter);
    if (revenueRefreshPromise && revenueRefreshKey === suffix) return revenueRefreshPromise;
    const requestId = ++revenueRefreshRequestId;
    const base = lastLoadedData || {};
    revenueRefreshKey = suffix;
    const request = readBackendSnapshot(base).then((snapshot) => {
      if (requestId !== revenueRefreshRequestId) return lastLoadedData;
      if (snapshot) {
        const data = loadRealData({
          config: snapshot.config || base.config || readConfigFallback(),
          products: base.products || [],
          history: base.history || {},
          groupPerf: base.groupPerf || { days: {} },
          apiGroups: base.apiGroups || null,
          orders: snapshot.orders || [],
          clicks: snapshot.clicks || [],
          runs: snapshot.runs || base.runs || [],
          groupCollections: snapshot.groupCollections || base.groupCollections || [],
          cpcConfig: snapshot.cpcConfig || base.cpcConfig || {},
          progress: snapshot.progress || base.progress || null,
          summary: snapshot.summary || base.summary || null,
        });
        window.dispatchEvent(new CustomEvent('app:data-refreshed', { detail: data }));
        return data;
      }
      return Promise.all([
        readJsonAsync('/api/orders' + suffix, base.orders || []),
        readJsonAsync('/api/clicks' + suffix, base.clicks || []),
      ]).then(([orders, clicks]) => {
        if (requestId !== revenueRefreshRequestId) return lastLoadedData;
        const data = loadRealData({
          config: base.config || readConfigFallback(),
          products: base.products || [],
          history: base.history || {},
          groupPerf: base.groupPerf || { days: {} },
          apiGroups: base.apiGroups || null,
          orders,
          clicks,
          runs: base.runs || [],
          groupCollections: base.groupCollections || [],
          cpcConfig: base.cpcConfig || {},
          progress: base.progress || null,
          summary: base.summary || null,
        });
        window.dispatchEvent(new CustomEvent('app:data-refreshed', { detail: data }));
        return data;
      });
    }).finally(() => {
      if (requestId === revenueRefreshRequestId) {
        revenueRefreshPromise = null;
        revenueRefreshKey = '';
      }
    });
    revenueRefreshPromise = request;
    return request;
  };

  loadRealData();
})();

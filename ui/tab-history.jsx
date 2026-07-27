/* tab-history.jsx — comment history log */

const HISTORY_PAGE_SIZE = 50;

// Giữ subtab đang xem khi đổi tab (component bị unmount/remount).
const _historyState = { sub: 'analytics' };
const HISTORY_ANALYTICS_MIN_SAMPLE = 10;

function parseHistoryTime(date, time) {
  const day = String(date || '').trim();
  const clock = String(time || '').trim();
  let value = null;
  if (day && clock) value = new Date(`${day}T${clock}`);
  else if (day) value = new Date(day);
  else value = new Date(0);
  return Number.isNaN(value.getTime()) ? new Date(0) : value;
}

function historyTimeValue(row) {
  const t = row?.time;
  return t instanceof Date && !Number.isNaN(t.getTime()) ? t.getTime() : 0;
}

function sortHistoryRows(rows, dir = 'desc') {
  const sign = dir === 'asc' ? 1 : -1;
  return [...(rows || [])].sort((a, b) => {
    const diff = historyTimeValue(a) - historyTimeValue(b);
    if (diff) return diff * sign;
    const idA = Number(a?.id ?? 0);
    const idB = Number(b?.id ?? 0);
    if (Number.isFinite(idA) && Number.isFinite(idB) && idA !== idB) {
      return (idA - idB) * sign;
    }
    return String(a.id ?? '').localeCompare(String(b.id ?? '')) * sign;
  });
}

function normalizeHistoryMode(mode) {
  return String(mode || 'comment').toLowerCase();
}

function normalizeHistoryRow(row) {
  return {
    ...row,
    mode: normalizeHistoryMode(row?.mode),
    account: row?.account || row?.account_name || row?.accountName || '',
  };
}

function historyMatchesDay(row, day) {
  const t = row?.time;
  if (!(t instanceof Date) || Number.isNaN(t.getTime())) return day === 'all';
  const now = new Date();
  const today = new Date(now.toDateString());
  if (day === 'today') return t >= today;
  if (day === 'yesterday') {
    const yest = new Date(today.getTime() - 86400000);
    return t >= yest && t < today;
  }
  if (day === '7days') return t >= new Date(now.getTime() - 7 * 86400000);
  return true;
}

function historyDateInputValue(date) {
  const d = date instanceof Date ? date : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function historyDaysAgoValue(days) {
  const d = new Date();
  d.setDate(d.getDate() - Number(days || 0));
  return historyDateInputValue(d);
}

function historyParseRangeDate(value, endOfDay = false) {
  if (!value) return null;
  const suffix = endOfDay ? 'T23:59:59.999' : 'T00:00:00';
  const d = new Date(String(value).includes('T') ? value : String(value) + suffix);
  return Number.isNaN(d.getTime()) ? null : d;
}

function historyInDateRange(row, from, to) {
  const t = row?.time;
  if (!(t instanceof Date) || Number.isNaN(t.getTime())) return false;
  const start = historyParseRangeDate(from, false);
  const end = historyParseRangeDate(to, true);
  if (start && t < start) return false;
  if (end && t > end) return false;
  return true;
}

function parseRunDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return new Date(0);
  const d = new Date(raw.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

function historyEntityKey(value, fallback) {
  const s = String(value || '').trim();
  return s || fallback;
}

function historyMetricGroupKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?facebook\.com\//i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '');
}

function emptyAnalysisBucket(id, label, extra = {}) {
  return {
    id,
    label,
    group: extra.group || '',
    groupUrl: extra.groupUrl || '',
    account: extra.account || '',
    collectionId: extra.collectionId || 0,
    collectionName: extra.collectionName || '',
    runs: 0,
    scanned: 0,
    suitable: 0,
    direct: 0,
    telegram: 0,
    pending: 0,
    pendingLink: 0,
    pendingFb: 0,
    rejected: 0,
    fail: 0,
    reposted: 0,
    revenue: 0,
    lastAt: null,
    children: new Map(),
  };
}

function updateAnalysisBucket(bucket, record) {
  bucket.runs += Number(record.runs || 0);
  bucket.scanned += Number(record.scanned || 0);
  bucket.suitable += Number(record.suitable || 0);
  bucket.direct += Number(record.direct || 0);
  bucket.telegram += Number(record.telegram || 0);
  bucket.pending += Number(record.pending || 0);
  bucket.pendingLink += Number(record.pendingLink || 0);
  bucket.pendingFb += Number(record.pendingFb || 0);
  bucket.rejected += Number(record.rejected || 0);
  bucket.fail += Number(record.fail || 0);
  bucket.reposted += Number(record.reposted || 0);
  bucket.revenue += Number(record.revenue || 0);
  if (record.group && !bucket.group) bucket.group = record.group;
  if (record.groupUrl && !bucket.groupUrl) bucket.groupUrl = record.groupUrl;
  if (record.account && !bucket.account) bucket.account = record.account;
  if (record.collectionId && !bucket.collectionId) bucket.collectionId = record.collectionId;
  if (record.collectionName && !bucket.collectionName) bucket.collectionName = record.collectionName;
  const t = record.lastAt instanceof Date ? record.lastAt : null;
  if (t && !Number.isNaN(t.getTime()) && (!bucket.lastAt || t > bucket.lastAt)) bucket.lastAt = t;
}

function finalizeAnalysisBucket(bucket) {
  const success = bucket.direct + bucket.telegram;
  const issues = bucket.pending + bucket.rejected + bucket.fail;
  const outcomes = success + issues;
  const successRate = outcomes ? (success / outcomes) * 100 : 0;
  const issueRate = outcomes ? (issues / outcomes) * 100 : 0;
  const directRate = outcomes ? (bucket.direct / outcomes) * 100 : 0;
  const pendingRate = outcomes ? (bucket.pending / outcomes) * 100 : 0;
  const rejectedRate = outcomes ? (bucket.rejected / outcomes) * 100 : 0;
  const failRate = outcomes ? (bucket.fail / outcomes) * 100 : 0;
  const fitPerRun = bucket.runs ? bucket.suitable / bucket.runs : 0;
  const processRate = bucket.suitable ? Math.min(100, (outcomes / bucket.suitable) * 100) : 0;
  const revenuePerRun = bucket.runs ? bucket.revenue / bucket.runs : 0;
  const commentCount = outcomes + bucket.reposted;
  return {
    ...bucket,
    children: Array.from(bucket.children.values()).map(finalizeAnalysisBucket)
      .sort((a, b) => historyIssueWeight(b) - historyIssueWeight(a) || b.outcomes - a.outcomes || b.successRate - a.successRate || a.label.localeCompare(b.label, 'vi')),
    success,
    issues,
    outcomes,
    commentCount,
    successRate,
    issueRate,
    directRate,
    pendingRate,
    rejectedRate,
    failRate,
    fitPerRun,
    processRate,
    revenuePerRun,
    score: Math.round(successRate - Math.min(30, issueRate * 0.4)),
    status: 'neutral',
    statusLabel: 'Chưa đủ dữ liệu',
    statusKind: '',
    statusMeaning: 'Mẫu còn ít hoặc chưa có đủ tín hiệu để kết luận.',
    warnings: [],
    problemLevel: 0,
  };
}

function historyIssueWeight(row) {
  return Number(row?.fail || 0) * 100
    + Number(row?.rejected || 0) * 45
    + Number(row?.pending || 0) * 18
    + Number(row?.issueRate || 0);
}

function historyBestRows(rows) {
  return [...(rows || [])]
    .filter((row) => row.outcomes > 0 && row.problemLevel < 2 && row.status !== 'neutral')
    .sort((a, b) => b.score - a.score || b.successRate - a.successRate || b.outcomes - a.outcomes || a.label.localeCompare(b.label, 'vi'));
}

function historyProblemRows(rows) {
  return [...(rows || [])]
    .filter((row) => row.problemLevel >= 2 || row.status === 'bad')
    .sort((a, b) => b.problemLevel - a.problemLevel || historyIssueWeight(b) - historyIssueWeight(a) || a.score - b.score || b.outcomes - a.outcomes || a.label.localeCompare(b.label, 'vi'));
}

function historySearchText(row) {
  return [
    row?.label,
    historyGroupDisplayId(row),
    row?.groupUrl,
    row?.statusLabel,
    row?.statusMeaning,
    row?.warningText,
    Number(row?.pending || 0) > 0 ? 'pending' : '',
    Number(row?.rejected || 0) > 0 ? 'rejected' : '',
    Number(row?.fail || 0) > 0 ? 'fail' : '',
  ].join(' ').toLowerCase();
}

function historyGroupDisplayId(row) {
  const listId = historyGroupListId(row);
  if (listId != null && listId !== '') return String(listId);
  const raw = String(row?.groupUrl || row?.id || '').trim();
  const match = raw.match(/facebook\.com\/groups\/([^/?#]+)/i) || raw.match(/groups\/([^/?#]+)/i);
  if (match?.[1]) return match[1];
  const tail = raw.split('/').filter(Boolean).pop() || '';
  if (/^\d+$/.test(tail)) return tail;
  return /^\d+$/.test(raw) ? raw : '—';
}

function historyGroupListId(row) {
  const groups = Array.isArray(window.APP_CURRENT?.groups)
    ? window.APP_CURRENT.groups
    : (Array.isArray(window.GROUPS)
      ? window.GROUPS
      : (typeof GROUPS !== 'undefined' && Array.isArray(GROUPS) ? GROUPS : []));
  if (!groups.length) return null;

  const urlKeys = new Set([
    row?.groupUrl,
    row?.id,
    row?.group,
  ].map(historyMetricGroupKey).filter(Boolean));
  const nameKeys = new Set([
    row?.label,
    row?.group,
  ].map(historyMetricGroupKey).filter(Boolean));

  for (const group of groups) {
    const id = group?.id;
    if (id == null || id === '') continue;
    const groupUrlKey = historyMetricGroupKey(group.url);
    const groupNameKey = historyMetricGroupKey(group.name);
    if ((groupUrlKey && urlKeys.has(groupUrlKey)) || (groupNameKey && nameKeys.has(groupNameKey))) {
      return id;
    }
  }
  return null;
}

function historyMoney(value) {
  const amount = Number(value || 0);
  return amount ? `${fmt.vnd(amount)} đ` : '—';
}

function historySortValue(row, key) {
  if (key === 'id') {
    const id = historyGroupDisplayId(row);
    const numeric = Number(id);
    return Number.isFinite(numeric) ? numeric : id;
  }
  if (key === 'label') return row.label || '';
  if (key === 'successRate') return Number(row.successRate || 0);
  if (key === 'commentCount') return Number(row.commentCount ?? row.outcomes ?? 0);
  if (key === 'success') return Number(row.success || 0);
  if (key === 'issues') return historyIssueWeight(row);
  if (key === 'revenue') return Number(row.revenue || 0);
  if (key === 'status') return row.statusLabel || '';
  if (key === 'scanCount') return Number(row.runs || 0);
  if (key === 'children') return Number(row.children?.length || 0);
  return Number(row?.[key] || 0);
}

function historySortRows(rows, sort) {
  const key = sort?.key || 'score';
  const dir = sort?.dir === 'asc' ? 1 : -1;
  return [...(rows || [])].sort((a, b) => {
    const av = historySortValue(a, key);
    const bv = historySortValue(b, key);
    if (typeof av === 'string' || typeof bv === 'string') {
      return dir * String(av).localeCompare(String(bv), 'vi');
    }
    return dir * ((av || 0) - (bv || 0));
  });
}

function mergeHistoryDetailRows(rows) {
  const buckets = new Map();
  (rows || []).forEach((row) => {
    const key = historyMetricGroupKey(row.groupUrl || row.label || row.id) || row.id || row.label;
    if (!buckets.has(key)) {
      buckets.set(key, emptyAnalysisBucket(row.id || key, row.label || key, {
        group: row.group || row.label || '',
        groupUrl: row.groupUrl || '',
        account: row.account || '',
      }));
    }
    const bucket = buckets.get(key);
    updateAnalysisBucket(bucket, row);
    (row.children || []).forEach((child) => {
      const childKey = child.id || child.label;
      if (!bucket.children.has(childKey)) {
        bucket.children.set(childKey, emptyAnalysisBucket(childKey, child.label || childKey, {
          account: child.account || child.label || '',
          group: child.group || '',
          groupUrl: child.groupUrl || '',
        }));
      }
      updateAnalysisBucket(bucket.children.get(childKey), child);
    });
  });
  return Array.from(buckets.values()).map(finalizeAnalysisBucket);
}

function patchHistoryRunVolume(rows, runRows) {
  const runByKey = new Map();
  (runRows || []).forEach((row) => {
    [row.id, row.label, row.groupUrl].map(historyMetricGroupKey).filter(Boolean).forEach((key) => {
      if (!runByKey.has(key)) runByKey.set(key, row);
    });
  });
  return (rows || []).map((row) => {
    const base = runByKey.get(historyMetricGroupKey(row.id))
      || runByKey.get(historyMetricGroupKey(row.label))
      || runByKey.get(historyMetricGroupKey(row.groupUrl));
    if (!base) return row;
    const patchedChildren = patchHistoryRunVolume(row.children || [], base.children || []);
    return {
      ...row,
      runs: Number(base.runs || 0) || row.runs,
      scanned: Number(base.scanned || 0) || row.scanned,
      suitable: Number(base.suitable || 0) || row.suitable,
      children: patchedChildren.length ? patchedChildren : row.children,
    };
  });
}

function attachHistoryAccountComments(rows, comments) {
  const byAccount = new Map();
  (comments || []).forEach((comment, index) => {
    const key = historyEntityKey(comment.account, 'Chưa rõ tài khoản');
    if (!byAccount.has(key)) byAccount.set(key, []);
    byAccount.get(key).push({ ...comment, _historyKey: comment.id ?? `${comment.time?.getTime?.() || 0}-${index}` });
  });
  byAccount.forEach((items, key) => {
    byAccount.set(key, sortHistoryRows(items, 'desc'));
  });
  return (rows || []).map((row) => ({
    ...row,
    commentRows: byAccount.get(historyEntityKey(row.label || row.account, 'Chưa rõ tài khoản')) || [],
  }));
}

function historyClamp(value, min = 0, max = 100) {
  const n = Number(value || 0);
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : 0));
}

function historyPercentile(values, p) {
  const nums = (values || []).map(Number).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!nums.length) return 0;
  const idx = Math.max(0, Math.min(nums.length - 1, Math.ceil(nums.length * p) - 1));
  return nums[idx];
}

function historyScoreByThreshold(value, thresholds) {
  for (const [min, score] of thresholds) {
    if (value >= min) return score;
  }
  return thresholds[thresholds.length - 1]?.[1] || 0;
}

function historyEvaluation(row, patch) {
  return {
    ...row,
    ...patch,
    warningText: (patch.warnings || []).map((item) => item.label).join(' · '),
  };
}

function historyWarning(label, kind = 'warn') {
  return { label, kind };
}

function historyRevenueStats(rows) {
  const values = (rows || []).map((row) => row.revenuePerRun).filter((v) => v > 0);
  return {
    p50: historyPercentile(values, 0.5),
    p75: historyPercentile(values, 0.75),
    p90: historyPercentile(values, 0.9),
  };
}

function historyEvaluateGroup(row, stats = {}) {
  const handled = row.outcomes || 0;
  const success = row.successRate / 100;
  const processRate = row.processRate / 100;
  const fitPerRun = row.fitPerRun || 0;
  const revenue = Number(row.revenue || 0);
  const revenuePerRun = row.revenuePerRun || 0;
  const pendingRate = row.pendingRate / 100;
  const failRate = row.failRate / 100;
  const rejectedRate = row.rejectedRate / 100;
  const issueRate = handled ? ((row.pending * 0.3 + row.fail * 0.5 + row.rejected) / handled) : 0;

  let revenueScore = 0;
  if (revenue > 0) {
    if (revenuePerRun >= (stats.p90 || Infinity)) revenueScore = 100;
    else if (revenuePerRun >= (stats.p75 || Infinity)) revenueScore = 85;
    else if (revenuePerRun >= (stats.p50 || Infinity)) revenueScore = 70;
    else revenueScore = 55;
  }
  const demandScore = historyScoreByThreshold(fitPerRun, [[3, 100], [1.5, 80], [0.5, 60], [0.2, 40], [0, 20]]);
  const processScore = historyScoreByThreshold(processRate, [[0.8, 100], [0.6, 80], [0.4, 60], [0.2, 40], [0, 20]]);
  const successScore = historyScoreByThreshold(success, [[0.85, 100], [0.8, 90], [0.75, 80], [0.65, 60], [0, 40]]);
  const issuePenalty = issueRate >= 0.35 ? 15 : issueRate >= 0.2 ? 10 : issueRate >= 0.1 ? 5 : 0;
  const score = Math.round(historyClamp(revenueScore * 0.4 + demandScore * 0.25 + processScore * 0.15 + successScore * 0.15 - issuePenalty));

  let label = 'Chưa đủ dữ liệu';
  let status = 'neutral';
  let statusKind = '';
  let statusMeaning = 'Group có quá ít lượt xử lý hoặc chưa có doanh thu nên chưa đủ cơ sở kết luận.';
  if (handled < 10 && revenue === 0) {
    label = 'Chưa đủ dữ liệu';
  } else if (revenue > 0) {
    if (success < 0.55) {
      label = 'Cần cải thiện';
      status = 'watch';
      statusKind = 'warn';
      statusMeaning = 'Group đã có doanh thu nên không xếp rủi ro cao, nhưng success dưới 55% cần cải thiện trước khi tăng volume.';
    } else if (success >= 0.75 && score >= 80) {
      label = 'Rất hiệu quả';
      status = 'good';
      statusKind = 'ok';
      statusMeaning = 'Có doanh thu tốt, mật độ bài phù hợp khá và tỷ lệ thành công đủ cao để ưu tiên chạy tiếp.';
    } else if (success >= 0.75 && score >= 60) {
      label = 'Hiệu quả';
      status = 'good';
      statusKind = 'ok';
      statusMeaning = 'Có doanh thu và tỷ lệ thành công chạy được; lỗi nhỏ chỉ nên xem như cảnh báo phụ.';
    } else {
      label = 'Tiềm năng';
      status = 'good';
      statusKind = 'accent';
      statusMeaning = 'Group có doanh thu và success trên 55%, nhưng chưa đủ ngưỡng hiệu quả cao.';
    }
  } else if (handled >= 10 && success < 0.4) {
    label = 'Rủi ro cao';
    status = 'bad';
    statusKind = 'danger';
    statusMeaning = 'Group không có doanh thu và success dưới 40%, nên giảm ưu tiên và kiểm tra lại nội dung, tài khoản hoặc rule group.';
  } else if (handled >= 10 && success < 0.55) {
    label = 'Cần tối ưu';
    status = 'watch';
    statusKind = 'warn';
    statusMeaning = 'Group chưa có doanh thu và success dưới 55%, cần tối ưu trước khi ưu tiên chạy tiếp.';
  } else if (handled >= 10 && fitPerRun >= 0.5 && success > 0.55) {
    label = 'Tiềm năng';
    status = 'good';
    statusKind = 'accent';
    statusMeaning = 'Chưa có doanh thu nhưng success trên 55% và có tín hiệu bài phù hợp; nên tiếp tục theo dõi.';
  } else if (handled >= 10 && fitPerRun >= 0.5) {
    label = 'Theo dõi';
    status = 'watch';
    statusKind = 'warn';
    statusMeaning = 'Có tín hiệu bài phù hợp nhưng chưa đủ mạnh để ưu tiên cao.';
  } else if (handled >= 10) {
    label = 'Kém hiệu quả';
    status = 'bad';
    statusKind = 'danger';
    statusMeaning = 'Ít bài phù hợp, chưa có doanh thu và đã có đủ lượt xử lý để thấy hiệu quả thấp.';
  }

  const sharedRating = window.evaluateGroupPerformance
    ? window.evaluateGroupPerformance({ ...row, score }, stats)
    : null;
  if (sharedRating) {
    label = sharedRating.statusLabel;
    status = sharedRating.status;
    statusKind = sharedRating.statusKind;
    statusMeaning = sharedRating.statusMeaning;
  }

  const warnings = [];
  if (row.pending > 0) warnings.push(historyWarning(`pending ${fmt.pct(row.pendingRate, 1)}`));
  if (row.fail > 0) warnings.push(historyWarning(`${failRate >= 0.1 ? 'fail cao' : 'fail nhẹ'} ${fmt.pct(row.failRate, 1)}`, failRate >= 0.1 ? 'danger' : 'warn'));
  if (row.rejected > 0) warnings.push(historyWarning(`rejected ${fmt.pct(row.rejectedRate, 1)}`, rejectedRate >= 0.1 ? 'danger' : 'warn'));
  if (processRate < 0.6 && row.suitable >= 10) warnings.push(historyWarning('xử lý thấp'));
  if (revenue === 0 && fitPerRun >= 1.5 && handled >= 10) warnings.push(historyWarning('chưa ra doanh thu', 'info'));
  const problemLevel = sharedRating?.problemLevel ?? (label === 'Rủi ro cao' || label === 'Kém hiệu quả' ? 3 : issueRate >= 0.35 || success < 0.55 ? 2 : warnings.some((w) => w.kind === 'danger') ? 2 : warnings.length ? 1 : 0);
  return historyEvaluation(row, { score, status, statusKind, statusLabel: label, statusMeaning, warnings, problemLevel });
}

function historyEvaluateCollection(row) {
  const handled = row.outcomes || 0;
  const success = row.successRate / 100;
  const fitPerRun = row.fitPerRun || 0;
  const processRate = row.processRate / 100;
  const revenue = Number(row.revenue || 0);
  const groupCount = row.children?.length || 0;
  const pendingRate = row.pendingRate / 100;
  const rejectedRate = row.rejectedRate / 100;
  const failRate = row.failRate / 100;
  const riskRate = handled ? ((row.pending * 0.2 + row.fail * 0.6 + row.rejected) / handled) : 0;

  let label = 'Theo dõi';
  let status = 'watch';
  let statusKind = 'warn';
  let statusMeaning = 'Cụm có dữ liệu nhưng tín hiệu chưa đủ mạnh để ưu tiên cao.';
  const isUnassigned = String(row.label || '').toLowerCase().includes('chưa gán');
  if (isUnassigned) {
    label = 'Chưa phân loại';
    status = 'neutral';
    statusKind = 'info';
    statusMeaning = 'Đây là nhóm dữ liệu chưa được gán vào chiến lược cụm thật, không nên đánh giá như một cụm vận hành.';
  } else if (handled < 30 || groupCount < 5) {
    label = 'Chưa đủ dữ liệu';
    status = 'neutral';
    statusKind = '';
    statusMeaning = 'Cụm còn ít lượt xử lý hoặc quá ít group nên chưa đủ cơ sở kết luận.';
  } else if (revenue > 0) {
    if (success < 0.55) {
      label = 'Cần cải thiện';
      status = 'watch';
      statusKind = 'warn';
      statusMeaning = 'Cụm đã có doanh thu nên không xếp rủi ro cao, nhưng success dưới 55% cần cải thiện trước khi mở rộng.';
    } else if (success >= 0.75 && riskRate < 0.3 && fitPerRun >= 1) {
      label = 'Nên mở rộng';
      status = 'good';
      statusKind = 'ok';
      statusMeaning = 'Cụm có doanh thu, nhiều bài phù hợp, success tốt và lỗi không cao; nên thêm group tương tự.';
    } else if (success >= 0.75) {
      label = 'Đáng ưu tiên';
      status = 'good';
      statusKind = 'ok';
      statusMeaning = 'Cụm có doanh thu và chạy được, nên tiếp tục ưu tiên dù còn cảnh báo phụ.';
    } else {
      label = 'Có tiềm năng';
      status = 'good';
      statusKind = 'accent';
      statusMeaning = 'Cụm có doanh thu và success trên 55%, nhưng chưa đủ ngưỡng mở rộng.';
    }
  } else if (handled >= 50 && success < 0.4) {
    label = 'Rủi ro cao';
    status = 'bad';
    statusKind = 'danger';
    statusMeaning = 'Cụm không có doanh thu và success dưới 40%, nên giảm ưu tiên và kiểm tra lại cụm.';
  } else if (handled >= 50 && success < 0.55) {
    label = 'Cần tối ưu';
    status = 'bad';
    statusKind = 'danger';
    statusMeaning = 'Cụm chưa có doanh thu và success dưới 55%, cần tối ưu nội dung, tài khoản hoặc rule group.';
  } else if (handled >= 50 && fitPerRun >= 1 && success >= 0.8 && riskRate < 0.3) {
    label = 'Đáng ưu tiên';
    status = 'good';
    statusKind = 'ok';
    statusMeaning = 'Chưa có doanh thu nhưng volume bài phù hợp và success đủ tốt để ưu tiên chạy tiếp.';
  } else if (handled >= 50 && fitPerRun >= 0.5 && success > 0.55) {
    label = 'Có tiềm năng';
    status = 'good';
    statusKind = 'accent';
    statusMeaning = 'Success trên 55% và có tín hiệu bài phù hợp, nhưng chưa ra doanh thu.';
  } else if (handled >= 50 && fitPerRun >= 0.5) {
    label = 'Theo dõi';
    status = 'watch';
    statusKind = 'warn';
    statusMeaning = 'Có tín hiệu nhưng chưa đủ mạnh hoặc chưa có doanh thu.';
  } else if (handled >= 50 && fitPerRun < 0.5) {
    label = 'Kém hiệu quả';
    status = 'bad';
    statusKind = 'danger';
    statusMeaning = 'Chạy nhiều nhưng ít bài phù hợp và chưa có doanh thu.';
  }

  const warnings = [];
  if (isUnassigned) warnings.push(historyWarning('cần gán cụm', 'info'));
  if (handled < 50 && !isUnassigned) warnings.push(historyWarning('ít dữ liệu'));
  if (revenue === 0 && fitPerRun >= 1 && handled >= 50) warnings.push(historyWarning('chưa ra doanh thu', 'info'));
  if (pendingRate >= 0.3) warnings.push(historyWarning('pending cao', 'danger'));
  else if (row.pending > 0) warnings.push(historyWarning(`pending ${fmt.pct(row.pendingRate, 1)}`));
  if (rejectedRate >= 0.1) warnings.push(historyWarning('rejected cao', 'danger'));
  else if (row.rejected > 0) warnings.push(historyWarning(`rejected ${fmt.pct(row.rejectedRate, 1)}`));
  if (failRate >= 0.1) warnings.push(historyWarning('fail cao', 'danger'));
  else if (row.fail > 0) warnings.push(historyWarning(`fail nhẹ ${fmt.pct(row.failRate, 1)}`));
  if (processRate < 0.6 && row.suitable >= 50) warnings.push(historyWarning('xử lý thấp'));
  if (success < 0.55 && handled >= 50) warnings.push(historyWarning('success thấp', 'danger'));

  const score = Math.round(historyClamp((success * 45) + (Math.min(fitPerRun / 1.5, 1) * 25) + (processRate * 15) + (revenue > 0 ? 15 : 0) - Math.min(20, riskRate * 30)));
  const problemLevel = ['Rủi ro cao', 'Cần tối ưu', 'Kém hiệu quả'].includes(label) ? 3 : warnings.some((w) => w.kind === 'danger') ? 2 : warnings.length ? 1 : 0;
  return historyEvaluation(row, { score, status, statusKind, statusLabel: label, statusMeaning, warnings, problemLevel });
}

function historyEvaluateAccount(row) {
  const handled = row.outcomes || 0;
  const success = row.successRate / 100;
  const processRate = row.processRate / 100;
  const pendingRate = row.pendingRate / 100;
  const failRate = row.failRate / 100;
  const rejectedRate = row.rejectedRate / 100;
  const groupCount = row.children?.length || 0;
  const riskRate = handled ? ((row.pending * 0.2 + row.fail + row.rejected * 1.2) / handled) : 0;

  let label = 'Chưa đủ dữ liệu';
  let status = 'neutral';
  let statusKind = '';
  let statusMeaning = 'Tài khoản xử lý quá ít bài, chưa đủ cơ sở để kết luận.';
  if (handled >= 10) {
    if (success >= 0.85 && riskRate < 0.2) {
      label = 'Rất khỏe';
      status = 'good';
      statusKind = 'ok';
      statusMeaning = 'Success cao, lỗi thấp và xử lý ổn định; có thể tiếp tục dùng.';
    } else if (success >= 0.8 && riskRate < 0.25) {
      label = 'Ổn định';
      status = 'good';
      statusKind = 'ok';
      statusMeaning = 'Tài khoản chạy tốt, lỗi chưa vượt ngưỡng nguy hiểm.';
    } else if (success >= 0.75 && riskRate < 0.35) {
      label = 'Chạy được';
      status = 'good';
      statusKind = 'accent';
      statusMeaning = 'Success từ 75% trở lên, có thể tiếp tục dùng nhưng cần theo dõi cảnh báo phụ.';
    } else if (success >= 0.65) {
      label = 'Theo dõi';
      status = 'watch';
      statusKind = 'warn';
      statusMeaning = 'Tài khoản có tín hiệu yếu, chưa nên loại nhưng cần theo dõi.';
    } else if (success >= 0.5) {
      label = 'Cần tối ưu';
      status = 'watch';
      statusKind = 'warn';
      statusMeaning = 'Success thấp hoặc lỗi khá nhiều, nên tối ưu nội dung, tải chạy hoặc phiên đăng nhập.';
    } else {
      label = 'Rủi ro cao';
      status = 'bad';
      statusKind = 'danger';
      statusMeaning = 'Success thấp, rejected/fail cao; nên giảm tải hoặc nghỉ tài khoản.';
    }
    if (rejectedRate >= 0.2 || failRate >= 0.2) {
      label = 'Rủi ro cao';
      status = 'bad';
      statusKind = 'danger';
      statusMeaning = 'Rejected hoặc fail đang ở ngưỡng nguy hiểm cho tài khoản.';
    } else if ((rejectedRate >= 0.1 || failRate >= 0.1) && ['Rất khỏe', 'Ổn định', 'Chạy được'].includes(label)) {
      if (label === 'Rất khỏe') label = 'Ổn định';
      else if (label === 'Ổn định') label = 'Chạy được';
      else label = 'Theo dõi';
      status = label === 'Theo dõi' ? 'watch' : status;
      statusKind = label === 'Theo dõi' ? 'warn' : statusKind;
    }
  }

  const warnings = [];
  if (handled < 20) warnings.push(historyWarning('ít dữ liệu'));
  if (pendingRate >= 0.5) warnings.push(historyWarning('pending rất cao', 'danger'));
  else if (pendingRate >= 0.3) warnings.push(historyWarning('pending cao', 'danger'));
  else if (row.pending > 0) warnings.push(historyWarning(`pending ${fmt.pct(row.pendingRate, 1)}`));
  if (failRate >= 0.2) warnings.push(historyWarning('fail rất cao', 'danger'));
  else if (failRate >= 0.1) warnings.push(historyWarning('fail cao', 'danger'));
  else if (row.fail > 0) warnings.push(historyWarning(`fail nhẹ ${fmt.pct(row.failRate, 1)}`));
  if (rejectedRate >= 0.2) warnings.push(historyWarning('rejected rất cao', 'danger'));
  else if (rejectedRate >= 0.1) warnings.push(historyWarning('rejected cao', 'danger'));
  else if (row.rejected > 0) warnings.push(historyWarning(`rejected ${fmt.pct(row.rejectedRate, 1)}`));
  if (processRate < 0.6 && row.suitable >= 20) warnings.push(historyWarning('xử lý thấp'));
  if (groupCount > 80 && success < 0.75) warnings.push(historyWarning('tải cao'));

  const successScore = historyScoreByThreshold(success, [[0.85, 100], [0.8, 90], [0.75, 80], [0.65, 60], [0.5, 40], [0, 20]]);
  const processScore = historyScoreByThreshold(processRate, [[0.8, 100], [0.6, 80], [0.4, 60], [0, 40]]);
  const safetyScore = riskRate < 0.1 ? 100 : riskRate < 0.2 ? 80 : riskRate < 0.35 ? 60 : riskRate < 0.5 ? 40 : 20;
  const workloadScore = groupCount <= 30 ? 100 : groupCount <= 60 ? 80 : groupCount <= 90 ? 60 : 40;
  const score = Math.round(historyClamp(successScore * 0.45 + processScore * 0.2 + safetyScore * 0.2 + workloadScore * 0.15));
  const problemLevel = label === 'Rủi ro cao' ? 3 : label === 'Cần tối ưu' || warnings.some((w) => w.kind === 'danger') ? 2 : warnings.length ? 1 : 0;
  return historyEvaluation(row, { score, status, statusKind, statusLabel: label, statusMeaning, warnings, problemLevel });
}

function historyEvaluateRows(rows, mode, stats = {}) {
  const evaluator = mode === 'collections'
    ? historyEvaluateCollection
    : mode === 'accounts'
      ? historyEvaluateAccount
      : (row) => historyEvaluateGroup(row, stats);
  return (rows || []).map((row) => {
    const childMode = mode === 'groups' ? 'accounts' : 'groups';
    const children = row.children?.length ? historyEvaluateRows(row.children, childMode, stats) : [];
    return evaluator({ ...row, children });
  }).sort((a, b) => b.score - a.score || b.outcomes - a.outcomes || a.label.localeCompare(b.label, 'vi'));
}

function buildAnalysisFromRecords(records) {
  const groups = new Map();
  const accounts = new Map();
  records.forEach((record) => {
    const groupId = historyEntityKey(record.groupUrl || record.group, 'Chưa rõ group');
    const groupLabel = historyEntityKey(record.group, 'Chưa rõ group');
    const accountId = historyEntityKey(record.account, 'Chưa rõ tài khoản');
    const accountLabel = accountId;

    if (!groups.has(groupId)) groups.set(groupId, emptyAnalysisBucket(groupId, groupLabel, { group: groupLabel, groupUrl: record.groupUrl }));
    if (!accounts.has(accountId)) accounts.set(accountId, emptyAnalysisBucket(accountId, accountLabel, { account: accountLabel }));
    const groupBucket = groups.get(groupId);
    const accountBucket = accounts.get(accountId);
    updateAnalysisBucket(groupBucket, record);
    updateAnalysisBucket(accountBucket, record);

    if (!groupBucket.children.has(accountId)) {
      groupBucket.children.set(accountId, emptyAnalysisBucket(accountId, accountLabel, { account: accountLabel }));
    }
    updateAnalysisBucket(groupBucket.children.get(accountId), record);

    if (!accountBucket.children.has(groupId)) {
      accountBucket.children.set(groupId, emptyAnalysisBucket(groupId, groupLabel, { group: groupLabel, groupUrl: record.groupUrl }));
    }
    updateAnalysisBucket(accountBucket.children.get(groupId), record);
  });

  const groupRows = Array.from(groups.values()).map(finalizeAnalysisBucket)
    .sort((a, b) => b.score - a.score || b.outcomes - a.outcomes || a.label.localeCompare(b.label, 'vi'));
  const accountRows = Array.from(accounts.values()).map(finalizeAnalysisBucket)
    .sort((a, b) => b.score - a.score || b.outcomes - a.outcomes || a.label.localeCompare(b.label, 'vi'));
  const totals = finalizeAnalysisBucket(records.reduce((acc, record) => {
    updateAnalysisBucket(acc, record);
    return acc;
  }, emptyAnalysisBucket('total', 'Tổng')));
  return { groupRows, accountRows, totals };
}

function buildCollectionLookup(collections) {
  const byGroupKey = new Map();
  const normalizedCollections = (collections || []).map((collection) => {
    const item = {
      id: Number(collection?.id || 0),
      label: historyEntityKey(collection?.name, 'Chưa đặt tên cụm'),
      members: [],
    };
    (collection?.members || []).forEach((member) => {
      const groupUrl = String(member?.url || '').trim();
      const groupName = historyEntityKey(member?.name || groupUrl, '');
      const groupKey = historyMetricGroupKey(groupUrl || groupName);
      if (!groupKey) return;
      item.members.push({
        key: groupKey,
        url: groupUrl,
        name: groupName,
      });
      if (!byGroupKey.has(groupKey)) byGroupKey.set(groupKey, []);
      byGroupKey.get(groupKey).push(item);
    });
    return item;
  });
  return { collections: normalizedCollections, byGroupKey };
}

function buildCollectionAnalysis(groupRows, collections) {
  const { collections: normalizedCollections, byGroupKey } = buildCollectionLookup(collections);
  const buckets = new Map();
  const unassigned = emptyAnalysisBucket('__unassigned__', 'Chưa gán cụm');
  const seenUnassigned = new Set();

  normalizedCollections.forEach((collection) => {
    buckets.set(collection.id || collection.label, emptyAnalysisBucket(
      collection.id || collection.label,
      collection.label
    ));
  });

  (groupRows || []).forEach((groupRow) => {
    const groupKey = historyMetricGroupKey(groupRow.groupUrl || groupRow.label);
    const collectionList = byGroupKey.get(groupKey) || [];
    if (!collectionList.length) {
      if (!seenUnassigned.has(groupRow.id)) {
        seenUnassigned.add(groupRow.id);
        unassigned.children.set(groupRow.id, groupRow);
        updateAnalysisBucket(unassigned, groupRow);
      }
      return;
    }
    collectionList.forEach((collection) => {
      const bucket = buckets.get(collection.id || collection.label);
      if (!bucket || bucket.children.has(groupRow.id)) return;
      bucket.children.set(groupRow.id, groupRow);
      updateAnalysisBucket(bucket, groupRow);
    });
  });

  const rows = Array.from(buckets.values())
    .map(finalizeAnalysisBucket)
    .filter((row) => row.outcomes || row.children.length)
    .sort((a, b) => b.score - a.score || b.outcomes - a.outcomes || a.label.localeCompare(b.label, 'vi'));

  if (unassigned.outcomes || unassigned.children.size) {
    rows.push(finalizeAnalysisBucket(unassigned));
  }
  return rows;
}

function buildCollectionAnalysisFromRecords(records, collections) {
  const { collections: normalizedCollections, byGroupKey } = buildCollectionLookup(collections);
  const buckets = new Map();
  const unassigned = emptyAnalysisBucket('__unassigned__', 'Chưa gán cụm');

  normalizedCollections.forEach((collection) => {
    buckets.set(String(collection.id || collection.label), emptyAnalysisBucket(
      collection.id || collection.label,
      collection.label,
      { collectionId: collection.id, collectionName: collection.label }
    ));
  });

  const ensureBucket = (collection) => {
    const key = String(collection.id || collection.label);
    if (!buckets.has(key)) {
      buckets.set(key, emptyAnalysisBucket(collection.id || collection.label, collection.label, {
        collectionId: collection.id || 0,
        collectionName: collection.label,
      }));
    }
    return buckets.get(key);
  };

  (records || []).forEach((record) => {
    const groupId = historyEntityKey(record.groupUrl || record.group, 'Chưa rõ group');
    const groupLabel = historyEntityKey(record.group, 'Chưa rõ group');
    const accountId = historyEntityKey(record.account, 'Chưa rõ tài khoản');
    const accountLabel = accountId;
    let targets = [];
    if (record.collectionName || record.collectionId) {
      targets = [{
        id: record.collectionId || record.collectionName,
        label: historyEntityKey(record.collectionName, 'Chưa rõ cụm'),
      }];
    } else {
      const groupKey = historyMetricGroupKey(record.groupUrl || record.group);
      targets = byGroupKey.get(groupKey) || [];
    }
    if (!targets.length) targets = [{ id: unassigned.id, label: unassigned.label, unassigned: true }];

    targets.forEach((collection) => {
      const bucket = collection.unassigned ? unassigned : ensureBucket(collection);
      updateAnalysisBucket(bucket, record);
      if (!bucket.children.has(groupId)) {
        bucket.children.set(groupId, emptyAnalysisBucket(groupId, groupLabel, {
          group: groupLabel,
          groupUrl: record.groupUrl,
        }));
      }
      const groupBucket = bucket.children.get(groupId);
      updateAnalysisBucket(groupBucket, record);
      if (!groupBucket.children.has(accountId)) {
        groupBucket.children.set(accountId, emptyAnalysisBucket(accountId, accountLabel, { account: accountLabel }));
      }
      updateAnalysisBucket(groupBucket.children.get(accountId), record);
    });
  });

  const rows = Array.from(buckets.values())
    .map(finalizeAnalysisBucket)
    .filter((row) => row.outcomes || row.children.length)
    .sort((a, b) => b.score - a.score || historyIssueWeight(b) - historyIssueWeight(a) || b.outcomes - a.outcomes || a.label.localeCompare(b.label, 'vi'));

  if (unassigned.outcomes || unassigned.children.size) {
    rows.push(finalizeAnalysisBucket(unassigned));
  }
  return rows;
}

function analysisRecordsFromRuns(runs) {
  const records = [];
  (runs || []).forEach((run) => {
    const account = historyEntityKey(run.account_name, 'Chưa rõ tài khoản');
    const collectionId = run.scope_type === 'collection' ? Number(run.scope_id || 0) : 0;
    const collectionName = run.scope_type === 'collection' ? historyEntityKey(run.scope_name, 'Chưa rõ cụm') : '';
    (run.groups || []).forEach((group) => {
      const groupName = historyEntityKey(group.group_name || group.group_url, 'Chưa rõ group');
      const groupUrl = String(group.group_url || '').trim();
      const pendingLink = Number(group.pending || 0);
      const pendingFb = Number(group.pending_fb || 0);
      records.push({
        account,
        collectionId,
        collectionName,
        group: groupName,
        groupUrl,
        runs: 1,
        scanned: Number(group.scanned || 0),
        suitable: Number(group.suitable || 0),
        direct: Number(group.direct || 0),
        telegram: Number(group.telegram || 0),
        pending: pendingLink + pendingFb,
        pendingLink,
        pendingFb,
        rejected: Number(group.rejected || 0),
        fail: Number(group.fail || 0),
        lastAt: parseRunDateTime(group.finished_at || group.started_at || run.finished_at || run.started_at),
      });
    });
  });
  return records;
}

function analysisRecordsFromHistory(rows) {
  return (rows || []).map((row) => {
    const mode = normalizeHistoryMode(row.mode);
    const pendingLink = mode === 'pending_link' ? 1 : 0;
    const pendingFb = mode === 'pending' ? 1 : 0;
    return {
      account: historyEntityKey(row.account, 'Chưa rõ tài khoản'),
      group: historyEntityKey(row.group, 'Chưa rõ group'),
      groupUrl: String(row.groupUrl || row.group || '').trim(),
      runs: 0,
      scanned: 0,
      suitable: 0,
      direct: mode === 'comment' ? 1 : 0,
      telegram: mode === 'telegram' ? 1 : 0,
      pending: pendingLink + pendingFb,
      pendingLink,
      pendingFb,
      rejected: mode === 'rejected' ? 1 : 0,
      fail: 0,
      reposted: mode === 'reposted' ? 1 : 0,
      lastAt: row.time,
    };
  });
}

function TabHistory({ active = false, dataVersion = 0, runsVersion = 0, forcedSub = '' }) {
  const [sub, _setSub] = React.useState(_historyState.sub);
  const setSub = React.useCallback((v) => { _historyState.sub = v; _setSub(v); }, []);
  const [rows, setRows] = React.useState(() => sortHistoryRows((buildHistory() || []).map(normalizeHistoryRow)));
  const [day, setDay] = React.useState('today');
  const [showMode, setShowMode] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState(() => new Set());
  const [colWidths, setColWidths] = React.useState({ link: 170, comment: 680 });
  const [page, setPage] = React.useState(0);
  const [timeSort, setTimeSort] = React.useState('desc');
  const [repostDialogOpen, setRepostDialogOpen] = React.useState(false);
  const [repostLimit, setRepostLimit] = React.useState('20');
  const [repostRange, setRepostRange] = React.useState('today');
  const [repostFrom, setRepostFrom] = React.useState(historyDateInputValue(new Date()));
  const [repostTo, setRepostTo] = React.useState(historyDateInputValue(new Date()));
  const appDialog = useAppDialog();

  React.useEffect(() => {
    if (forcedSub && forcedSub !== sub) setSub(forcedSub);
  }, [forcedSub, sub, setSub]);
  const commentsActiveRef = React.useRef(false);
  const historyFiltersReadyRef = React.useRef(false);

  const historyFilterPayload = () => {
    const today = historyDateInputValue(new Date());
    let dateFrom = '';
    let dateTo = '';
    if (day === 'today') {
      dateFrom = today;
      dateTo = today;
    } else if (day === 'yesterday') {
      const yesterday = historyDaysAgoValue(1);
      dateFrom = yesterday;
      dateTo = yesterday;
    } else if (day === '7days') {
      dateFrom = historyDaysAgoValue(7);
      dateTo = today;
    }
    return { dateFrom, dateTo, mode: showMode === 'all' ? '' : showMode, query: search.trim() };
  };

  const reloadHistory = (sortDir = timeSort) => {
    if (!window.backendApi?.getHistoryFiltered) {
      setRows(sortHistoryRows((buildHistory() || []).map(normalizeHistoryRow), sortDir));
      return Promise.resolve(false);
    }
    return window.backendApi.getHistoryFiltered(historyFilterPayload()).then((res) => {
      const entries = res?.data?.entries;
      if (!res?.ok || !Array.isArray(entries)) return false;
      const nextRows = entries.map((r) => ({
        id: r.id ?? null,
        time: parseHistoryTime(r.date, r.time),
        mode: String(r.mode || 'comment').toLowerCase(),  // raw: comment/pending/rejected/telegram
        group: r.group || '',
        product: r.product || '',
        comment: r.comment || '',
        link: r.permalink || '',
        account: r.account_name || r.account || '',
      })).map(normalizeHistoryRow);
      setRows(sortHistoryRows(nextRows, sortDir));
      return true;
    });
  };

  React.useEffect(() => {
    const commentsActive = active && sub === 'comments';
    if (commentsActive && !commentsActiveRef.current) reloadHistory('desc');
    commentsActiveRef.current = commentsActive;
  }, [active, sub]);
  React.useEffect(() => {
    if (!active || sub !== 'comments' || !dataVersion) return;
    reloadHistory(timeSort);
    setSelected(new Set());
    setPage(0);
  }, [dataVersion]);
  React.useEffect(() => {
    const commentsActive = active && sub === 'comments';
    if (!commentsActive) {
      historyFiltersReadyRef.current = false;
      return undefined;
    }
    if (!historyFiltersReadyRef.current) {
      historyFiltersReadyRef.current = true;
      return undefined;
    }
    const timer = setTimeout(() => {
      reloadHistory(timeSort);
      setSelected(new Set());
      setPage(0);
    }, 280);
    return () => clearTimeout(timer);
  }, [active, sub, day, showMode, search, timeSort]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter((r) => {
      const mode = normalizeHistoryMode(r.mode);
      if (showMode !== 'all' && mode !== showMode) return false;
      if (q) {
        const hay = `${r.comment || ''} ${r.link || ''} ${r.group || ''} ${r.product || ''} ${r.account || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return historyMatchesDay(r, day);
    });
    return sortHistoryRows(out, timeSort);
  }, [rows, day, showMode, search, timeSort]);

  const dayRows = React.useMemo(() => rows.filter((r) => historyMatchesDay(r, day)), [rows, day]);
  const historyStats = React.useMemo(() => dayRows.reduce((acc, r) => {
    const mode = normalizeHistoryMode(r.mode);
    acc.total += 1;
    if (mode === 'comment') acc.success += 1;
    if (mode === 'reposted') acc.reposted += 1;
    else if (mode === 'telegram') acc.telegram += 1;
    else if (mode === 'pending') acc.pending += 1;
    else if (mode === 'rejected') acc.rejected += 1;
    return acc;
  }, { total: 0, success: 0, reposted: 0, telegram: 0, pending: 0, rejected: 0 }), [dayRows]);
  // Reset trang khi filter thay đổi
  React.useEffect(() => { setPage(0); }, [day, showMode, search, timeSort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / HISTORY_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * HISTORY_PAGE_SIZE, (safePage + 1) * HISTORY_PAGE_SIZE);

  const filteredKeys = React.useMemo(() => filtered.map((r, i) => `${r.time.getTime()}-${i}`), [filtered]);
  const pageKeys = filteredKeys.slice(safePage * HISTORY_PAGE_SIZE, (safePage + 1) * HISTORY_PAGE_SIZE);
  const selectedFilteredCount = filteredKeys.filter((key) => selected.has(key)).length;
  const allFilteredSelected = filteredKeys.length > 0 && selectedFilteredCount === filteredKeys.length;

  const toggleAllFiltered = (checked) => {
    setSelected((prev) => {
      const next = new Set(prev);
      filteredKeys.forEach((key) => {
        if (checked) next.add(key);
        else next.delete(key);
      });
      return next;
    });
  };

  const toggleRow = (key, checked) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const deleteRow = async (key, id) => {
    if (id != null) {
      const res = await window.backendApi?.deleteComment?.(id);
      if (res && !res.ok) return;
    }
    setSelected((prev) => { const next = new Set(prev); next.delete(key); return next; });
    await reloadHistory();
  };

  const repostDateRange = React.useMemo(() => {
    const today = historyDateInputValue(new Date());
    if (repostRange === 'today') return { dateFrom: today, dateTo: today };
    if (repostRange === 'yesterday') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const value = historyDateInputValue(d);
      return { dateFrom: value, dateTo: value };
    }
    if (repostRange === '7days') return { dateFrom: historyDaysAgoValue(6), dateTo: today };
    return { dateFrom: repostFrom, dateTo: repostTo };
  }, [repostRange, repostFrom, repostTo]);

  const startRepostRejected = async () => {
    const limit = Number.parseInt(String(repostLimit).trim(), 10);
    if (!Number.isFinite(limit) || limit <= 0) {
      await appDialog.alert({
        title: 'Limit không hợp lệ',
        message: 'Vui lòng nhập số lượng comment thành công tối đa lớn hơn 0.',
        icon: 'alert',
      });
      return;
    }
    const { dateFrom, dateTo } = repostDateRange;
    if (dateFrom && dateTo && dateFrom > dateTo) {
      await appDialog.alert({
        title: 'Khoảng ngày không hợp lệ',
        message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.',
        icon: 'alert',
      });
      return;
    }
    const res = await window.backendApi?.repostRejectedComments?.({ limit, dateFrom, dateTo });
    if (!res?.ok) {
      await appDialog.alert({
        title: 'Không bắt đầu được',
        message: res?.error || 'Hãy kết nối browser trước.',
        icon: 'alert',
      });
      return;
    }
    setRepostDialogOpen(false);
    await appDialog.alert({
      title: 'Đã bắt đầu',
      message: `Bot sẽ dừng khi đăng lại thành công ${limit} bài hoặc hết bài cần đăng lại trong khoảng ngày đã chọn.`,
      icon: 'post',
    });
  };

  const commentAgain = async (row) => {
    const res = await window.backendApi?.repostComment?.({ id: row.id });
    if (!res?.ok) {
      await appDialog.alert({
        title: 'Không comment lại được',
        message: res?.error || 'Hãy kết nối browser trước.',
        icon: 'alert',
      });
      return;
    }
    await appDialog.alert({
      title: 'Đã bắt đầu comment lại',
      message: 'Bot đang mở bài viết trong browser và dùng lại nội dung comment cũ.',
      icon: 'post',
    });
  };

  const startResize = (column) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = colWidths[column];
    const minWidth = column === 'link' ? 120 : 320;
    const maxWidth = column === 'link' ? 360 : 1200;
    const move = (ev) => {
      const width = Math.max(minWidth, Math.min(maxWidth, startWidth + ev.clientX - startX));
      setColWidths((prev) => ({ ...prev, [column]: width }));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const tableWidth = 36 + 118 + 84 + 92 + colWidths.link + colWidths.comment + 120;
  const RunHistoryComponent = window.RunHistory;

  return (
    <div className="tab-body">
      {!forcedSub && (
        <Subtabs
          tabs={[
            { value: 'analytics', label: 'Phân tích hiệu quả' },
            { value: 'comments', label: 'Lịch sử comment' },
            { value: 'runs', label: 'Lịch sử chạy nhóm FB' },
          ]}
          value={sub}
          onChange={setSub}
        />
      )}
      <div className="tab-content no-pad history-tab-content" style={{ padding: 16 }}>
        {sub === 'analytics' && (
          <HistoryAnalytics
            active={active && sub === 'analytics'}
            rows={rows}
            dataVersion={dataVersion}
            runsVersion={runsVersion}
          />
        )}

        {sub === 'comments' && <div className="section history-section">
          <div className="section-hd" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <QuickFilter value={day} onChange={setDay} options={[
              { value: 'today',     label: 'Hôm nay' },
              { value: '7days',     label: '7 ngày' },
              { value: 'yesterday', label: 'Hôm qua' },
              { value: 'all',       label: 'Tất cả' },
            ]} />
            <div className="divider" style={{ alignSelf: 'stretch' }} />
            <input type="text" className="input sm" placeholder="Tìm trong comment, link, nhóm..."
                   value={search} onChange={(e) => setSearch(e.target.value)}
                   style={{ width: 240 }} />
            <select className="select sm" value={showMode} onChange={(e) => setShowMode(e.target.value)}
                    style={{ width: 170 }}>
              <option value="all">Tất cả trạng thái</option>
              <option value="comment">Đã đăng</option>
              <option value="pending">Chờ duyệt</option>
              <option value="rejected">Bị từ chối</option>
              <option value="reposted">Đã đăng lại</option>
              <option value="telegram">Telegram</option>
              <option value="pending_link">Chờ điền link</option>
            </select>
            <button className="btn sm" onClick={() => setRepostDialogOpen(true)}>
              <Icon name="post" size={12}/> Đăng lại các comment thất bại
            </button>
            <button className="btn sm ghost" onClick={() => {
              reloadHistory();
            }}><Icon name="refresh" size={12}/> Refresh</button>
          </div>
          <div className="grid" style={{
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 10,
            padding: '0 14px 10px',
            margin: 0,
          }}>
            <HistoryStatCard label="Tổng comment" value={historyStats.total} />
            <HistoryStatCard
              label="Chờ/Từ chối"
              value={historyStats.pending + historyStats.rejected}
              sub={`${fmt.num(historyStats.pending)} chờ, ${fmt.num(historyStats.rejected)} từ chối`}
              kind="warn"
            />
            <HistoryStatCard
              label="Thành công"
              value={historyStats.success}
              kind="ok"
            />
            <HistoryStatCard label="Telegram" value={historyStats.telegram} kind="accent" />
          </div>
          <div className="tbl-wrap history-table-wrap">
            <table className="tbl history-table" style={{ minWidth: tableWidth, width: '100%', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 36 }} />
                <col style={{ width: 118 }} />
                <col style={{ width: 84 }} />
                <col style={{ width: 92 }} />
                <col style={{ width: colWidths.link }} />
                <col style={{ width: colWidths.comment }} />
                <col style={{ width: 120 }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="center">
                    <Checkbox checked={allFilteredSelected}
                              indeterminate={selectedFilteredCount > 0 && !allFilteredSelected}
                              onChange={toggleAllFiltered} />
                  </th>
                  <th className="sortable active"
                      aria-sort={timeSort === 'desc' ? 'descending' : 'ascending'}
                      title="Sắp xếp theo thời gian"
                      onClick={() => setTimeSort((dir) => dir === 'desc' ? 'asc' : 'desc')}
                      style={{ cursor: 'pointer' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      Thời gian
                      <HistorySortIndicator dir={timeSort} />
                    </span>
                  </th>
                  <th>Trạng thái</th>
                  <th>Tài khoản</th>
                  <th className="resizable-th">
                    Link bài viết
                    <span className="col-resizer" onMouseDown={startResize('link')} />
                  </th>
                  <th className="resizable-th">
                    Comment
                    <span className="col-resizer" onMouseDown={startResize('comment')} />
                  </th>
                  <th className="center">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => {
                  const key = pageKeys[i];
                  return (
                  <tr key={key}>
                    <td className="center">
                      <Checkbox checked={selected.has(key)} onChange={(checked) => toggleRow(key, checked)} />
                    </td>
                    <td className="mono dim">{fmt.dateTime(r.time)}</td>
                    <td>
                      {r.mode === 'pending'      ? <Badge kind="warn">Chờ duyệt</Badge> :
                       r.mode === 'rejected'     ? <Badge kind="danger">Bị từ chối</Badge> :
                       r.mode === 'reposted'     ? <Badge kind="info">Đã đăng lại</Badge> :
                       r.mode === 'telegram'     ? <Badge kind="accent">Telegram</Badge> :
                       r.mode === 'pending_link' ? <Badge kind="warn">Chờ điền link</Badge> :
                                                   <Badge kind="ok">Đã đăng</Badge>}
                    </td>
                    <td className="truncate" title={r.account || ''}>
                      {r.account || <span className="dim">—</span>}
                    </td>
                    <td className="truncate" title={r.link}>
                      {r.link
                        ? <a href={r.link} target="_blank" rel="noreferrer"
                             style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 'var(--font-xs)' }}
                             title={r.link}>{r.link}</a>
                        : <span className="dim">—</span>}
                    </td>
                    <td className="history-comment full">
                      {r.comment}
                    </td>
                    <td className="center history-actions-cell" style={{ whiteSpace: 'nowrap' }}>
                      <span className="row-actions history-row-actions">
                        {r.link && (
                          <button className="btn xs ghost icon-only" data-tooltip="Mở bài viết" aria-label="Mở bài viết"
                                  onClick={() => openBackendLink('post', r.link, appDialog)}>
                            <Icon name="external" size={13} />
                          </button>
                        )}
                        <button className="btn xs ghost icon-only" data-tooltip="Comment lại bài này" aria-label="Comment lại bài này"
                                disabled={!r.id || !r.link || !r.comment}
                                onClick={() => commentAgain(r)}>
                          <Icon name="reply" size={13} />
                        </button>
                        <button className="btn xs ghost icon-only" data-tooltip="Xóa" aria-label="Xóa"
                                style={{ color: 'var(--danger)' }}
                                onClick={() => deleteRow(key, r.id)}>
                          <Icon name="trash" size={13} />
                        </button>
                      </span>
                    </td>
                  </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <TableEmptyRow colSpan={7} padding={32} />
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              padding: '8px 14px', borderTop: '1px solid var(--border)',
              background: 'var(--bg-elev)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <button className="btn sm" disabled={safePage === 0} onClick={() => setPage(0)}>«</button>
              <button className="btn sm" disabled={safePage === 0} onClick={() => setPage((p) => p - 1)}>‹</button>
              <span style={{ fontSize: 'var(--font-xs)', color: 'var(--fg-muted)', padding: '0 6px' }}>
                Trang <b style={{ color: 'var(--fg)' }}>{safePage + 1}</b> / {totalPages}
                <span style={{ marginLeft: 10 }}>
                  ({safePage * HISTORY_PAGE_SIZE + 1}–{Math.min((safePage + 1) * HISTORY_PAGE_SIZE, filtered.length)} / {filtered.length})
                </span>
              </span>
              <button className="btn sm" disabled={safePage >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>›</button>
              <button className="btn sm" disabled={safePage >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</button>
            </div>
          )}
        </div>}

        {sub === 'runs' && (
          RunHistoryComponent
            ? <RunHistoryComponent active={active && sub === 'runs'} runsVersion={runsVersion} />
            : <div className="section">
                <div className="section-body center dim" style={{ padding: 32 }}>
                  Chưa tải được lịch sử chạy nhóm FB.
                </div>
              </div>
        )}
      </div>
      {repostDialogOpen && (
        <Dialog
          title="Đăng lại các comment thất bại"
          width={520}
          onClose={() => setRepostDialogOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setRepostDialogOpen(false)}>Hủy</button>
              <button className="btn primary" onClick={startRepostRejected}>
                <Icon name="post" size={12}/> Bắt đầu
              </button>
            </>
          }>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field-label">Số comment thành công tối đa</div>
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              value={repostLimit}
              onChange={(e) => setRepostLimit(e.target.value)}
              placeholder="Ví dụ: 20"
            />

            <div className="field-label">Khoảng thời gian lịch sử</div>
            <SegmentChoice
              value={repostRange}
              onChange={setRepostRange}
              options={[
                { value: 'today', label: 'Hôm nay' },
                { value: 'yesterday', label: 'Hôm qua' },
                { value: '7days', label: '7 ngày' },
                { value: 'custom', label: 'Tự chọn' },
              ]}
            />
            {repostRange === 'custom' && (
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <DateInput value={repostFrom} onChange={setRepostFrom} label="Từ" />
                <DateInput value={repostTo} onChange={setRepostTo} label="Đến" />
              </div>
            )}
            <div className="dim" style={{ fontSize: 'var(--font-xs)', lineHeight: 1.5 }}>
              Chỉ các comment chờ duyệt/bị từ chối có ngày nằm trong khoảng đã chọn mới được mở lại.
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function HistoryAnalytics({ active = false, rows = [], dataVersion = 0, runsVersion = 0 }) {
  const today = historyDateInputValue(new Date());
  const [runs, setRuns] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [from, setFrom] = React.useState(today);
  const [to, setTo] = React.useState(today);
  const [quick, setQuick] = React.useState('today');
  const [view, setView] = React.useState('overview');
  const [search, setSearch] = React.useState('');
  const [expandedGroup, setExpandedGroup] = React.useState(null);
  const [expandedAccount, setExpandedAccount] = React.useState(null);
  const [expandedCollection, setExpandedCollection] = React.useState(null);
  const [groupRevenue, setGroupRevenue] = React.useState(() => new Map());
  const [collections, setCollections] = React.useState([]);

  const loadRuns = React.useCallback(() => {
    const api = window.backendApi?.connected ? window.backendApi : window.staticDataApi;
    if (!api?.connected) {
      setRuns([]);
      setGroupRevenue(new Map());
      return Promise.resolve(false);
    }
    setLoading(true);
    const runPromise = api.loadRunHistory
      ? api.loadRunHistory({ from, to })
      : Promise.resolve({ ok: false });
    const revenuePromise = api.refreshGroupPerformance
      ? api.refreshGroupPerformance({ from, to })
      : Promise.resolve({ ok: false });
    const collectionsPromise = api.loadGroupCollections
      ? api.loadGroupCollections()
      : Promise.resolve({ ok: false });
    return Promise.all([runPromise, revenuePromise, collectionsPromise]).then(([runRes, revenueRes, collectionsRes]) => {
      if (runRes?.ok && Array.isArray(runRes.data?.runs)) setRuns(runRes.data.runs);
      const nextRevenue = new Map();
      if (revenueRes?.ok && Array.isArray(revenueRes.data?.rows)) {
        revenueRes.data.rows.forEach((row) => {
          const value = Number(row.commission || row.revenue || 0);
          const urlKey = historyMetricGroupKey(row.url);
          const nameKey = historyMetricGroupKey(row.name);
          if (urlKey) nextRevenue.set(urlKey, value);
          if (nameKey) nextRevenue.set(nameKey, value);
        });
      }
      setGroupRevenue(nextRevenue);
      if (collectionsRes?.ok && Array.isArray(collectionsRes.data?.collections)) {
        setCollections(collectionsRes.data.collections);
      }
      return !!runRes?.ok;
    }).finally(() => setLoading(false));
  }, [from, to]);

  React.useEffect(() => { if (active) loadRuns(); }, [active, loadRuns]);
  React.useEffect(() => {
    if (!active || !runsVersion) return;
    loadRuns();
  }, [active, runsVersion, loadRuns]);

  const setQuickAndDates = (value) => {
    setQuick(value);
    const t = historyDateInputValue(new Date());
    if (value === 'today') {
      setFrom(t);
      setTo(t);
      return;
    }
    if (value === 'yesterday') {
      const y = historyDaysAgoValue(1);
      setFrom(y);
      setTo(y);
      return;
    }
    if (value === '30days') {
      setFrom(historyDaysAgoValue(29));
      setTo(t);
      return;
    }
    setFrom(historyDaysAgoValue(6));
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

  const filteredHistoryRows = React.useMemo(
    () => rows.filter((row) => historyInDateRange(row, from, to)),
    [rows, from, to]
  );

  const historyRecords = React.useMemo(
    () => analysisRecordsFromHistory(filteredHistoryRows),
    [filteredHistoryRows]
  );
  const sourceRecords = React.useMemo(() => {
    const runRecords = analysisRecordsFromRuns(runs);
    return runRecords.length ? runRecords : historyRecords;
  }, [runs, historyRecords]);
  const accountSourceRecords = React.useMemo(
    () => historyRecords.length ? historyRecords : sourceRecords,
    [historyRecords, sourceRecords]
  );

  const analysis = React.useMemo(() => buildAnalysisFromRecords(sourceRecords), [sourceRecords]);
  const accountAnalysis = React.useMemo(() => buildAnalysisFromRecords(accountSourceRecords), [accountSourceRecords]);
  const query = search.trim().toLowerCase();
  const groupRowsWithRevenue = React.useMemo(() => analysis.groupRows.map((row) => {
    const revenue = groupRevenue.get(historyMetricGroupKey(row.groupUrl))
      ?? groupRevenue.get(historyMetricGroupKey(row.label))
      ?? row.revenue
      ?? 0;
    return { ...row, revenue, revenuePerRun: row.runs ? revenue / row.runs : 0 };
  }), [analysis.groupRows, groupRevenue]);
  const groupRevenueStats = React.useMemo(() => historyRevenueStats(groupRowsWithRevenue), [groupRowsWithRevenue]);
  const evaluatedGroupRows = React.useMemo(
    () => historyEvaluateRows(groupRowsWithRevenue, 'groups', groupRevenueStats),
    [groupRowsWithRevenue, groupRevenueStats]
  );
  const groupRows = React.useMemo(() => evaluatedGroupRows.filter((row) => {
    if (!query) return true;
    return historySearchText(row).includes(query);
  }), [evaluatedGroupRows, query]);
  const collectionRowsRaw = React.useMemo(
    () => buildCollectionAnalysisFromRecords(sourceRecords, collections),
    [sourceRecords, collections]
  );
  const collectionRowsWithRevenue = React.useMemo(() => collectionRowsRaw.map((row) => {
    const children = (row.children || []).map((child) => {
      const revenue = groupRevenue.get(historyMetricGroupKey(child.groupUrl))
        ?? groupRevenue.get(historyMetricGroupKey(child.label))
        ?? child.revenue
        ?? 0;
      return { ...child, revenue, revenuePerRun: child.runs ? revenue / child.runs : 0 };
    });
    const revenue = children.reduce((sum, child) => sum + Number(child.revenue || 0), 0);
    return { ...row, children, revenue, revenuePerRun: row.runs ? revenue / row.runs : 0 };
  }), [collectionRowsRaw, groupRevenue]);
  const collectionRowsBase = React.useMemo(
    () => historyEvaluateRows(collectionRowsWithRevenue, 'collections', groupRevenueStats),
    [collectionRowsWithRevenue, groupRevenueStats]
  );
  const collectionRows = React.useMemo(() => collectionRowsBase.filter((row) => {
    if (!query) return true;
    return historySearchText(row).includes(query);
  }), [collectionRowsBase, query]);
  const accountRowsWithRunVolume = React.useMemo(
    () => patchHistoryRunVolume(accountAnalysis.accountRows, analysis.accountRows),
    [accountAnalysis.accountRows, analysis.accountRows]
  );
  const accountRowsWithComments = React.useMemo(
    () => attachHistoryAccountComments(accountRowsWithRunVolume, filteredHistoryRows),
    [accountRowsWithRunVolume, filteredHistoryRows]
  );
  const evaluatedAccountRows = React.useMemo(
    () => historyEvaluateRows(accountRowsWithComments, 'accounts', groupRevenueStats),
    [accountRowsWithComments, groupRevenueStats]
  );
  const accountRows = React.useMemo(() => evaluatedAccountRows.filter((row) => {
    if (!query) return true;
    return historySearchText(row).includes(query);
  }), [evaluatedAccountRows, query]);
  const bestCollectionRows = React.useMemo(() => historyBestRows(collectionRowsBase), [collectionRowsBase]);
  const bestGroupRows = React.useMemo(() => historyBestRows(evaluatedGroupRows), [evaluatedGroupRows]);
  const bestAccountRows = React.useMemo(() => historyBestRows(evaluatedAccountRows), [evaluatedAccountRows]);
  const problemCollectionRows = React.useMemo(() => historyProblemRows(collectionRowsBase), [collectionRowsBase]);
  const problemGroupRows = React.useMemo(() => historyProblemRows(evaluatedGroupRows), [evaluatedGroupRows]);
  const problemAccountRows = React.useMemo(() => historyProblemRows(evaluatedAccountRows), [evaluatedAccountRows]);

  const sourceLabel = runs.length ? `${runs.length} phiên chạy` : `${filteredHistoryRows.length} comment`;

  const refresh = () => {
    loadRuns();
  };

  return (
    <div className="history-analysis">
      <div className="section-hd history-analysis-toolbar" style={{ marginBottom: 12 }}>
        <QuickFilter value={quick} onChange={setQuickAndDates} options={[
          { value: 'today', label: 'Hôm nay' },
          { value: 'yesterday', label: 'Hôm qua' },
          { value: '7days', label: '7 ngày' },
          { value: '30days', label: '30 ngày' },
        ]} />
        <div className="divider" style={{ alignSelf: 'stretch' }} />
        <DateInput value={from} onChange={setCustomFrom} label="Từ" />
        <DateInput value={to} onChange={setCustomTo} label="Đến" />
        <button className="btn sm ghost" onClick={refresh} disabled={loading} data-tooltip="Làm mới dữ liệu" aria-label="Làm mới dữ liệu">
          <Icon name="refresh" size={12} /> Refresh
        </button>
        <div className="spacer" />
        <SegmentChoice value={view} onChange={setView} options={[
          { value: 'overview', label: 'Tổng quan' },
          { value: 'collections', label: 'Theo cụm' },
          { value: 'groups', label: 'Theo group' },
          { value: 'accounts', label: 'Theo tài khoản' },
        ]} />
      </div>

      <div className="history-analysis-grid">
        <HistoryMetricCard label="Lượt xử lý" value={analysis.totals.outcomes} sub={sourceLabel} />
        <HistoryMetricCard label="Tỷ lệ thành công" value={fmt.pct(analysis.totals.successRate, 1)} kind="ok" />
        <HistoryMetricCard label="pending / rejected / fail" value={analysis.totals.issues} sub={`${fmt.num(analysis.totals.pending)} pending, ${fmt.num(analysis.totals.rejected)} rejected, ${fmt.num(analysis.totals.fail)} fail`} kind={analysis.totals.issues ? 'warn' : 'ok'} />
        <HistoryMetricCard label="Phạm vi dữ liệu" value={`${fmt.num(collectionRowsBase.length)} cụm`} sub={`${fmt.num(analysis.groupRows.length)} group • ${fmt.num(accountAnalysis.accountRows.length)} tài khoản`} />
      </div>

      {view === 'overview' && (
        <div className="history-rank-grid">
          <HistoryOverviewRankCard
            title="Cụm"
            label="Cụm"
            metricLabel="Bài đã quét"
            metricValue={(row) => row.scanned}
            bestRows={bestCollectionRows.slice(0, 6)}
            problemRows={problemCollectionRows.slice(0, 6)}
          />
          <HistoryOverviewRankCard
            title="Tài khoản"
            label="Tài khoản"
            metricLabel="Số comment"
            metricValue={(row) => row.outcomes}
            bestRows={bestAccountRows.slice(0, 6)}
            problemRows={problemAccountRows.slice(0, 6)}
          />
          <HistoryOverviewRankCard
            title="Group"
            label="Group"
            metricLabel="Bài đã quét"
            metricValue={(row) => row.scanned}
            bestRows={bestGroupRows.slice(0, 6)}
            problemRows={problemGroupRows.slice(0, 6)}
            wide
          />
        </div>
      )}

      {view !== 'overview' && (
        <div className="section history-analysis-table-section">
          <div className="section-hd" style={{ gap: 10, flexWrap: 'wrap' }}>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={view === 'groups' ? 'Tìm group...' : view === 'collections' ? 'Tìm cụm...' : 'Tìm tài khoản...'}
              style={{ width: 260 }}
            />
            <span className="spacer" />
            <span className="dim-2" style={{ fontSize: 'var(--font-xs)' }}>
              {view === 'groups'
                ? `${groupRows.length} group`
                : view === 'collections'
                  ? `${collectionRows.length} cụm`
                  : `${accountRows.length} tài khoản`}
            </span>
          </div>
          {view === 'collections' ? (
            <HistoryEntityTable
              mode="collections"
              rows={collectionRows}
              expandedId={expandedCollection}
              onToggle={(id) => setExpandedCollection((current) => current === id ? null : id)}
            />
          ) : view === 'groups' ? (
            <HistoryEntityTable
              mode="groups"
              rows={groupRows}
              expandedId={expandedGroup}
              onToggle={(id) => setExpandedGroup((current) => current === id ? null : id)}
            />
          ) : (
            <HistoryEntityTable
              mode="accounts"
              rows={accountRows}
              expandedId={expandedAccount}
              onToggle={(id) => setExpandedAccount((current) => current === id ? null : id)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function HistoryMetricCard({ label, value, sub, kind, text }) {
  const color = kind === 'ok' ? 'var(--ok)'
    : kind === 'warn' ? 'var(--warn)'
    : kind === 'danger' ? 'var(--danger)'
    : kind === 'accent' ? 'var(--accent)'
    : 'var(--fg)';
  return (
    <div className="stat-card history-metric-card">
      <div className="lbl">{label}</div>
      <div className={text ? 'history-metric-text' : 'val'} style={{ color }}>
        {value}
      </div>
      {sub && <div className="sub truncate" title={sub}>{sub}</div>}
    </div>
  );
}

function HistoryOverviewRankCard({ title, label, metricLabel, metricValue, bestRows, problemRows, wide = false }) {
  return (
    <div className={`section history-overview-rank-card${wide ? ' wide' : ''}`}>
      <div className="section-hd">
        <h3>{title}</h3>
      </div>
      <HistoryOverviewRankTable
        title="Hiệu quả"
        rows={bestRows}
        label={label}
        metricLabel={metricLabel}
        metricValue={metricValue}
      />
      <HistoryOverviewRankTable
        title="Có vấn đề"
        rows={problemRows}
        label={label}
        metricLabel={metricLabel}
        metricValue={metricValue}
      />
    </div>
  );
}

function HistoryOverviewRankTable({ title, rows, label, metricLabel, metricValue }) {
  return (
    <div className="history-overview-rank-block">
      <div className="history-overview-rank-title">{title}</div>
      <div className="tbl-wrap">
        <table className="tbl history-rank-table">
          <thead>
            <tr>
              <th>{label}</th>
              <th className="num">Tỷ lệ thành công</th>
              <th className="num">{metricLabel}</th>
              <th style={{ width: 108 }}>Đánh giá</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((row) => (
              <tr key={row.id}>
                <td className="truncate" title={row.label}>{row.label}</td>
                <td className="num mono">{row.outcomes ? fmt.pct(row.successRate, 1) : '—'}</td>
                <td className="num mono">{fmt.num(metricValue(row) || 0)}</td>
                <td><HistoryEvaluationCell row={row} /></td>
              </tr>
            ))}
            {(!rows || rows.length === 0) && (
              <TableEmptyRow colSpan={4} padding={18} />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HistoryStatusBadge({ row }) {
  const kind = row.statusKind || (row.status === 'good' ? 'ok'
    : row.status === 'watch' ? 'warn'
    : row.status === 'bad' ? 'danger'
    : '');
  return <Badge kind={kind} title={row.statusMeaning || row.statusLabel}>{row.statusLabel}</Badge>;
}

function HistoryEvaluationCell({ row }) {
  return (
    <div className="history-eval-cell">
      <HistoryStatusBadge row={row} />
    </div>
  );
}

function HistoryIssueChips({ row, compact = false }) {
  const items = [
    { key: 'pending', label: 'Pending', value: row.pendingRate, count: row.pending, className: 'pending' },
    { key: 'rejected', label: 'Rejected', value: row.rejectedRate, count: row.rejected, className: 'rejected' },
    { key: 'fail', label: 'Fail', value: row.failRate, count: row.fail, className: 'fail' },
  ];

  return (
    <div className={compact ? 'history-issue-chips compact' : 'history-issue-chips'}>
      {items.map((item) => (
        <span
          key={item.key}
          className={`history-issue-chip ${item.className}`}
          title={`${item.label}: ${fmt.pct(item.value || 0, 1)} (${fmt.num(item.count || 0)} lượt)`}
        >
          <b>{fmt.pct(item.value || 0, 1)}</b>
        </span>
      ))}
    </div>
  );
}

function HistoryTableSortIndicator({ active, dir }) {
  return (
    <span className="sort-ind">
      <svg viewBox="0 0 8 5" style={{ opacity: active && dir === 'asc' ? 1 : 0.35 }}>
        <path d="M0 5L4 0L8 5Z" fill="currentColor" />
      </svg>
      <svg viewBox="0 0 8 5" style={{ opacity: active && dir === 'desc' ? 1 : 0.35 }}>
        <path d="M0 0L4 5L8 0Z" fill="currentColor" />
      </svg>
    </span>
  );
}

function HistoryEntityTable({ mode, rows, expandedId, onToggle }) {
  const isGroupMode = mode === 'groups';
  const isCollectionMode = mode === 'collections';
  const isAccountMode = mode === 'accounts';
  const primaryLabel = isCollectionMode ? 'Cụm' : (isGroupMode ? 'Group' : 'Tài khoản');
  const detailLabel = isCollectionMode ? 'Group' : (isGroupMode ? 'Tài khoản' : 'Group');
  const showRevenue = isGroupMode || isCollectionMode;
  const showId = isGroupMode;
  const showCommentCount = isAccountMode;
  const showSuccessCount = isAccountMode;
  const showScanColumns = !isAccountMode;
  const showDetailCount = !(isGroupMode || isCollectionMode);
  const tableColSpan = (showId ? 1 : 0) + 1 + (showScanColumns ? 2 : 0) + (showCommentCount ? 1 : 0) + 1 + (showSuccessCount ? 1 : 0) + 1 + (showRevenue ? 1 : 0) + (showDetailCount ? 1 : 0) + 2;
  const [sort, setSort] = React.useState({ key: isGroupMode ? 'id' : 'score', dir: isGroupMode ? 'asc' : 'desc' });
  const [nameWidth, setNameWidth] = React.useState(isGroupMode ? 340 : 300);
  const sortedRows = React.useMemo(() => historySortRows(rows, sort), [rows, sort]);
  const clickSort = (key, defaultDir = 'desc') => {
    setSort((current) => current.key === key
      ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: defaultDir });
  };
  const startNameResize = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = nameWidth;
    const move = (ev) => setNameWidth(Math.max(220, Math.min(760, startWidth + ev.clientX - startX)));
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  const SortHeader = ({ k, children, className = '', style, defaultDir = 'desc', resizable = false }) => {
    const active = sort.key === k;
    return (
      <th
        className={`sortable${active ? ' active' : ''}${className ? ' ' + className : ''}${resizable ? ' resizable-th' : ''}`}
        style={style}
        onClick={() => clickSort(k, defaultDir)}
      >
        <span>{children}<HistoryTableSortIndicator active={active} dir={sort.dir} /></span>
        {resizable && <span className="col-resizer" onMouseDown={startNameResize} onClick={(e) => e.stopPropagation()} />}
      </th>
    );
  };
  const tableWidth = (showId ? 110 : 0) + nameWidth + (showScanColumns ? 200 : 0) + (showCommentCount ? 104 : 0) + 96 + (showSuccessCount ? 132 : 0) + 190 + (showRevenue ? 126 : 0) + (showDetailCount ? 74 : 0) + 118 + 96;
  return (
    <div className="tbl-wrap history-analysis-table-wrap">
      <table className="tbl history-analysis-table" style={{ minWidth: tableWidth, tableLayout: 'fixed' }}>
        <colgroup>
          {showId && <col style={{ width: 110 }} />}
          <col style={{ width: nameWidth }} />
          {showScanColumns && <col style={{ width: 104 }} />}
          {showScanColumns && <col style={{ width: 96 }} />}
          {showCommentCount && <col style={{ width: 104 }} />}
          <col style={{ width: 96 }} />
          {showSuccessCount && <col style={{ width: 132 }} />}
          <col style={{ width: 190 }} />
          {showRevenue && <col style={{ width: 126 }} />}
          {showDetailCount && <col style={{ width: 74 }} />}
          <col style={{ width: 118 }} />
          <col style={{ width: 96 }} />
        </colgroup>
        <thead>
          <tr>
            {showId && <SortHeader k="id" defaultDir="asc" className="center">ID</SortHeader>}
            <SortHeader k="label" defaultDir="asc" resizable>{primaryLabel}</SortHeader>
            {showScanColumns && <SortHeader k="scanned" className="num center">Số bài đã quét</SortHeader>}
            {showScanColumns && <SortHeader k="suitable" className="num center">Bài hợp lệ</SortHeader>}
            {showCommentCount && <SortHeader k="commentCount" className="num center">Số comment</SortHeader>}
            <SortHeader k="successRate" className="num center">% Thành công</SortHeader>
            {showSuccessCount && <SortHeader k="success" className="num center">Số comment thành công</SortHeader>}
            <SortHeader k="issues" className="center">Tỷ lệ pending / rejected / fail</SortHeader>
            {showRevenue && <SortHeader k="revenue" className="num center">Doanh thu</SortHeader>}
            {showDetailCount && <SortHeader k="children" className="num center">{detailLabel}</SortHeader>}
            <SortHeader k="status" defaultDir="asc">Đánh giá</SortHeader>
            <th className="center" style={{ width: 96 }}>Chi tiết</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const open = expandedId === row.id;
            return (
              <React.Fragment key={row.id}>
                <tr>
                  {showId && <td className="center mono">{historyGroupDisplayId(row)}</td>}
                  <td>
                    <div className="history-entity-main">
                      <span className="truncate" title={row.label}>{row.label}</span>
                      {isGroupMode && row.groupUrl && <span className="dim-2 truncate" title={row.groupUrl}>{row.groupUrl}</span>}
                    </div>
                  </td>
                  {showScanColumns && <td className="num mono">{row.scanned ? fmt.num(row.scanned) : '—'}</td>}
                  {showScanColumns && <td className="num mono">{row.suitable ? fmt.num(row.suitable) : '—'}</td>}
                  {showCommentCount && <td className="num mono" title={row.reposted ? `Bao gồm ${fmt.num(row.reposted)} comment đã đăng lại` : ''}>{fmt.num(row.commentCount ?? row.outcomes ?? 0)}</td>}
                  <td className="num mono">{row.outcomes ? fmt.pct(row.successRate, 1) : '—'}</td>
                  {showSuccessCount && <td className="num mono">{fmt.num(row.success || 0)}</td>}
                  <td><HistoryIssueChips row={row} /></td>
                  {showRevenue && <td className="num mono history-money"><b>{historyMoney(row.revenue)}</b></td>}
                  {showDetailCount && <td className="num mono">{fmt.num(row.children.length)}</td>}
                  <td><HistoryEvaluationCell row={row} /></td>
                  <td className="center">
                    <button className="btn xs ghost" data-tooltip={open ? 'Ẩn chi tiết' : 'Xem chi tiết'} aria-label={open ? 'Ẩn chi tiết' : 'Xem chi tiết'}
                            onClick={() => onToggle(row.id)}>
                      <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
                      Xem
                    </button>
                  </td>
                </tr>
                {open && (
                  <tr className="history-analysis-detail-row">
                    <td colSpan={tableColSpan}>
                      {isAccountMode
                        ? <HistoryAccountCommentList rows={row.commentRows || []} />
                        : <HistoryDetailTable rows={row.children} label={detailLabel} showUrl={isCollectionMode || !isGroupMode} mergeRows={isCollectionMode} />}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          {rows.length === 0 && (
            <TableEmptyRow colSpan={tableColSpan} padding={32} />
          )}
        </tbody>
      </table>
    </div>
  );
}

function HistoryCommentStatusBadge({ mode }) {
  const normalized = normalizeHistoryMode(mode);
  if (normalized === 'pending') return <Badge kind="warn">Chờ duyệt</Badge>;
  if (normalized === 'rejected') return <Badge kind="danger">Bị từ chối</Badge>;
  if (normalized === 'reposted') return <Badge kind="info">Đã đăng lại</Badge>;
  if (normalized === 'telegram') return <Badge kind="accent">Telegram</Badge>;
  if (normalized === 'pending_link') return <Badge kind="warn">Chờ điền link</Badge>;
  return <Badge kind="ok">Đã đăng</Badge>;
}

function HistoryAccountCommentList({ rows }) {
  return (
    <div className="history-detail-panel">
      <table className="tbl history-account-comment-table">
        <thead>
          <tr>
            <th style={{ width: 132 }}>Thời gian</th>
            <th style={{ width: 108 }}>Trạng thái</th>
            <th style={{ width: 220 }}>Group</th>
            <th style={{ width: 220 }}>Link bài viết</th>
            <th>Comment</th>
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((row) => (
            <tr key={row._historyKey || row.id || `${row.time?.getTime?.() || 0}-${row.link || row.comment}`}>
              <td className="mono dim">{row.time ? fmt.dateTime(row.time) : '—'}</td>
              <td><HistoryCommentStatusBadge mode={row.mode} /></td>
              <td className="truncate" title={row.group || ''}>{row.group || <span className="dim">—</span>}</td>
              <td className="truncate" title={row.link || ''}>
                {row.link
                  ? <a href={row.link} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 'var(--font-xs)' }}>{row.link}</a>
                  : <span className="dim">—</span>}
              </td>
              <td className="history-comment full">{row.comment || <span className="dim">—</span>}</td>
            </tr>
          ))}
          {(!rows || rows.length === 0) && (
            <TableEmptyRow colSpan={5} padding={18} />
          )}
        </tbody>
      </table>
    </div>
  );
}

function HistoryDetailTable({ rows, label, showUrl, mergeRows = false }) {
  const [sort, setSort] = React.useState({ key: 'scanned', dir: 'desc' });
  const [nameWidth, setNameWidth] = React.useState(360);
  const sourceRows = React.useMemo(() => mergeRows ? mergeHistoryDetailRows(rows) : rows, [rows, mergeRows]);
  const sortedRows = React.useMemo(() => historySortRows(sourceRows, sort), [sourceRows, sort]);
  const clickSort = (key, defaultDir = 'desc') => {
    setSort((current) => current.key === key
      ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: defaultDir });
  };
  const startNameResize = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = nameWidth;
    const move = (ev) => setNameWidth(Math.max(260, Math.min(820, startWidth + ev.clientX - startX)));
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  const SortHeader = ({ k, children, className = '', defaultDir = 'desc', resizable = false }) => {
    const active = sort.key === k;
    return (
      <th
        className={`sortable${active ? ' active' : ''}${className ? ' ' + className : ''}${resizable ? ' resizable-th' : ''}`}
        onClick={() => clickSort(k, defaultDir)}
      >
        <span>{children}<HistoryTableSortIndicator active={active} dir={sort.dir} /></span>
        {resizable && <span className="col-resizer" onMouseDown={startNameResize} onClick={(e) => e.stopPropagation()} />}
      </th>
    );
  };
  const tableWidth = nameWidth + 104 + 96 + 86 + 86 + 98 + 98 + 86 + 104 + 112;
  return (
    <div className="history-detail-panel">
      <table className="tbl history-detail-table" style={{ minWidth: tableWidth, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: nameWidth }} />
          <col style={{ width: 104 }} />
          <col style={{ width: 96 }} />
          <col style={{ width: 86 }} />
          <col style={{ width: 86 }} />
          <col style={{ width: 98 }} />
          <col style={{ width: 98 }} />
          <col style={{ width: 86 }} />
          <col style={{ width: 104 }} />
          <col style={{ width: 112 }} />
        </colgroup>
        <thead>
          <tr>
            <SortHeader k="label" defaultDir="asc" resizable>{label}</SortHeader>
            <SortHeader k="scanned" className="num center">Số bài đã quét</SortHeader>
            <SortHeader k="suitable" className="num center">Bài hợp lệ</SortHeader>
            <SortHeader k="direct" className="num center">Đã đăng</SortHeader>
            <SortHeader k="telegram" className="num center">Telegram</SortHeader>
            <SortHeader k="pendingRate" className="num center">% Pending</SortHeader>
            <SortHeader k="rejectedRate" className="num center">% Rejected</SortHeader>
            <SortHeader k="failRate" className="num center">% Fail</SortHeader>
            <SortHeader k="successRate" className="num center">% Thành công</SortHeader>
            <SortHeader k="scanCount" className="num center">Số lần quét</SortHeader>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr key={row.id}>
              <td>
                <div className="history-entity-main">
                  <span className="truncate" title={row.label}>{row.label}</span>
                  {showUrl && row.groupUrl && <span className="dim-2 truncate" title={row.groupUrl}>{row.groupUrl}</span>}
                </div>
              </td>
              <td className="num mono">{row.scanned ? fmt.num(row.scanned) : '—'}</td>
              <td className="num mono">{row.suitable ? fmt.num(row.suitable) : '—'}</td>
              <td className="num mono">{fmt.num(row.direct)}</td>
              <td className="num mono">{fmt.num(row.telegram)}</td>
              <td className={row.pending ? 'num mono history-issue-num pending' : 'num mono'} title={`${fmt.num(row.pending)} pending`}>{fmt.pct(row.pendingRate, 1)}</td>
              <td className={row.rejected ? 'num mono history-issue-num rejected' : 'num mono'} title={`${fmt.num(row.rejected)} rejected`}>{fmt.pct(row.rejectedRate, 1)}</td>
              <td className={row.fail ? 'num mono history-issue-num fail' : 'num mono'} title={`${fmt.num(row.fail)} fail`}>{fmt.pct(row.failRate, 1)}</td>
              <td className="num mono">{row.outcomes ? fmt.pct(row.successRate, 1) : '—'}</td>
              <td className="num mono">{fmt.num(row.runs || 0)}</td>
            </tr>
          ))}
          {sortedRows.length === 0 && (
            <TableEmptyRow colSpan={10} padding={18} />
          )}
        </tbody>
      </table>
    </div>
  );
}

function HistoryStatCard({ label, value, sub, kind }) {
  const color = kind === 'ok' ? 'var(--ok)'
    : kind === 'warn' ? 'var(--warn)'
    : kind === 'accent' ? 'var(--accent)'
    : 'var(--fg)';
  return (
    <div className="stat-card" style={{ minHeight: 58, padding: '10px 12px', gap: 4, borderRadius: 7 }}>
      <div className="lbl">{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
        <div className="val" style={{ color, fontSize: 20 }}>{fmt.num(value || 0)}</div>
        {sub && <div className="sub" style={{ whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
    </div>
  );
}

function HistorySortIndicator({ dir }) {
  const up = dir === 'asc';
  const down = dir === 'desc';
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

window.TabHistory = TabHistory;

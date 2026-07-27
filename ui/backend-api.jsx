/* backend-api.jsx — web-only HTTP/SSE backend adapter */

(function () {
  const SERVER_URL_STORAGE_KEY = 'fbCrawlerServerHealthUrl';
  const DEFAULT_SERVER_BASE = 'http://127.0.0.1:8787';

  function parseResponse(raw) {
    if (raw == null || raw === '') return { ok: true, data: null };
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch (err) {
      return { ok: false, error: String(err), raw };
    }
  }

  function emit(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function normalizeServerBase(value) {
    const raw = String(value || '').trim();
    if (!raw) return DEFAULT_SERVER_BASE;
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    return withProtocol
      .replace(/\/(health|api\/health)$/i, '')
      .replace(/\/+$/, '');
  }

  function currentBaseUrl() {
    try {
      const stored = window.localStorage?.getItem?.(SERVER_URL_STORAGE_KEY);
      return stored ? normalizeServerBase(stored) : '';
    } catch (err) {
      return '';
    }
  }

  function createApi() {
    let readyResolved = false;
    let resolveReady;
    let eventStream = null;
    let heartbeatTimer = null;
    let lastBaseUrl = '';

    const ready = new Promise((resolve) => {
      resolveReady = resolve;
    });

    const api = {
      connected: false,
      ready,
      baseUrl: currentBaseUrl(),
      probeNow(forceReadyEvent = true) {
        return probe(forceReadyEvent);
      },
      call(method, ...args) {
        if (!this.baseUrl) {
          return Promise.resolve({
            ok: false,
            error: 'Backend server chưa được cấu hình hoặc chưa chạy.',
          });
        }
        return fetch(`${this.baseUrl}/api/call`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method, args }),
        })
          .then(async (response) => parseResponse(await response.text()))
          .catch((error) => ({
            ok: false,
            error: `Không gọi được backend server: ${String(error?.message || error)}`,
          }));
      },
      getState() { return this.call('getState'); },
      saveConfigUi(configUi) { return this.call('saveConfigUi', JSON.stringify(configUi || {})); },
      loadBuyerIntentKeywords() { return this.call('loadBuyerIntentKeywords'); },
      saveBuyerIntentKeywords(payload) { return this.call('saveBuyerIntentKeywords', JSON.stringify(payload || {})); },
      exportAppData() { return this.call('exportAppData'); },
      importAppData() { return this.call('importAppData'); },
      saveGroups(groups) { return this.call('saveGroups', JSON.stringify(groups || [])); },
      saveProducts(products) { return this.call('saveProducts', JSON.stringify(products || [])); },
      startBot() { return this.call('startBot'); },
      pauseBot() { return this.call('pauseBot'); },
      resumeBot() { return this.call('resumeBot'); },
      stopBot() { return this.call('stopBot'); },
      connectBrowser() { return this.call('connectBrowser'); },
      detectBrowserPath(browserType) { return this.call('detectBrowserPath', browserType || 'chrome'); },
      scanBrowsers() { return this.call('scanBrowsers'); },
      detectInstalledBrowsers() { return this.call('detectInstalledBrowsers'); },
      scanBrowserProfiles(browserType) { return this.call('scanBrowserProfiles', browserType || 'chrome'); },
      testNineRouter() { return this.call('testNineRouter'); },
      testTelegram() { return this.call('testTelegram'); },
      getBotStatus() { return this.call('getBotStatus'); },
      closeDriver() { return this.call('closeDriver'); },
      listWorkers() { return this.call('listWorkers'); },
      createWorker(payload) { return this.call('createWorker', JSON.stringify(payload || {})); },
      updateWorker(payload) { return this.call('updateWorker', JSON.stringify(payload || {})); },
      deleteWorker(payload) { return this.call('deleteWorker', JSON.stringify(payload || {})); },
      connectWorkerBrowser(payload) { return this.call('connectWorkerBrowser', JSON.stringify(payload || {})); },
      closeWorkerBrowser(payload) { return this.call('closeWorkerBrowser', JSON.stringify(payload || {})); },
      startWorkerBot(payload) { return this.call('startWorkerBot', JSON.stringify(payload || {})); },
      pauseWorkerBot(payload) { return this.call('pauseWorkerBot', JSON.stringify(payload || {})); },
      resumeWorkerBot(payload) { return this.call('resumeWorkerBot', JSON.stringify(payload || {})); },
      stopWorkerBot(payload) { return this.call('stopWorkerBot', JSON.stringify(payload || {})); },

      loadGroups() { return this.call('loadGroups'); },
      loadGroupSurveys() { return this.call('loadGroupSurveys'); },
      loadGroupSurveyDetail(payload) { return this.call('loadGroupSurveyDetail', JSON.stringify(payload || {})); },
      createGroupSurvey(payload) { return this.call('createGroupSurvey', JSON.stringify(payload || {})); },
      startGroupSurvey(payload) { return this.call('startGroupSurvey', JSON.stringify(payload || {})); },
      stopGroupSurvey() { return this.call('stopGroupSurvey'); },
      deleteGroupSurvey(payload) { return this.call('deleteGroupSurvey', JSON.stringify(payload || {})); },
      deleteSurveyGroup(payload) { return this.call('deleteSurveyGroup', JSON.stringify(payload || {})); },
      addSurveyGroupToGroups(payload) { return this.call('addSurveyGroupToGroups', JSON.stringify(payload || {})); },
      bulkAddSurveyGroupsToGroups(payload) { return this.call('bulkAddSurveyGroupsToGroups', JSON.stringify(payload || {})); },
      bulkDeleteSurveyGroupsToBlacklist(payload) { return this.call('bulkDeleteSurveyGroupsToBlacklist', JSON.stringify(payload || {})); },
      loadGroupCollections() { return this.call('loadGroupCollections'); },
      createGroupCollection(payload) { return this.call('createGroupCollection', JSON.stringify(payload || {})); },
      updateGroupCollection(payload) { return this.call('updateGroupCollection', JSON.stringify(payload || {})); },
      deleteGroupCollection(payload) { return this.call('deleteGroupCollection', JSON.stringify(payload || {})); },
      saveGroupCollectionMembers(payload) { return this.call('saveGroupCollectionMembers', JSON.stringify(payload || {})); },
      runGroupCollection(payload) { return this.call('runGroupCollection', JSON.stringify(payload || {})); },
      setGroupAction(payload) { return this.call('setGroupAction', JSON.stringify(payload || {})); },
      addGroup(url) { return this.call('addGroup', url); },
      deleteGroup(payload) { return this.call('deleteGroup', JSON.stringify(payload || {})); },
      bulkImportGroups(text) { return this.call('bulkImportGroups', text || ''); },
      exportGroupsTxt(payload) { return this.call('exportGroupsTxt', JSON.stringify(payload || {})); },
      bulkDeleteGroups(text) { return this.call('bulkDeleteGroups', text || ''); },
      restoreBlacklistedGroups(payload) { return this.call('restoreBlacklistedGroups', JSON.stringify(payload || {})); },
      setAllGroupsEnabled(enabled) { return this.call('setAllGroupsEnabled', !!enabled); },
      refreshGroupPerformance(payload) { return this.call('refreshGroupPerformance', JSON.stringify(payload || {})); },
      disableGroupFromStats(payload) { return this.call('disableGroupFromStats', JSON.stringify(payload || {})); },
      deleteGroupFromStats(payload) { return this.call('deleteGroupFromStats', JSON.stringify(payload || {})); },

      getProducts() { return this.call('getProducts'); },
      getProductsFiltered(payload) { return this.call('getProductsFiltered', JSON.stringify(payload || {})); },
      addProduct(payload) { return this.call('addProduct', JSON.stringify(payload || {})); },
      updateProduct(payload) { return this.call('updateProduct', JSON.stringify(payload || {})); },
      deleteProduct(keyword) { return this.call('deleteProduct', keyword || ''); },
      updateProductStatus(keyword, status) { return this.call('updateProductStatus', keyword || '', status || ''); },
      bulkDeleteProducts(payload) { return this.call('bulkDeleteProducts', JSON.stringify(payload || {})); },
      promoteProductToReady(payload) { return this.call('promoteProductToReady', JSON.stringify(payload || {})); },
      exportProducts(format) { return this.call('exportProducts', format || 'json'); },
      exportProductsFiltered(payload) { return this.call('exportProductsFiltered', JSON.stringify(payload || {})); },
      importProducts(text) { return this.call('importProducts', text || ''); },
      processBacklog() { return this.call('processBacklog'); },
      pauseBacklog() { return this.call('pauseBacklog'); },
      resumeBacklog() { return this.call('resumeBacklog'); },
      stopBacklog() { return this.call('stopBacklog'); },
      classifyProduct(payload) { return this.call('classifyProduct', JSON.stringify(payload || {})); },
      bulkClassifyProducts(payload) { return this.call('bulkClassifyProducts', JSON.stringify(payload || {})); },
      loadProductFavorites() { return this.call('loadProductFavorites'); },
      toggleProductFavorite(payload) { return this.call('toggleProductFavorite', JSON.stringify(payload || {})); },

      getStats() { return this.call('getStats'); },
      getRevenueSnapshot(payload) { return this.call('getRevenueSnapshot', JSON.stringify(payload || {})); },
      getStatsOverview(payload) { return this.call('getStatsOverview', JSON.stringify(payload || {})); },
      getStatsCharts(payload) { return this.call('getStatsCharts', JSON.stringify(payload || {})); },
      getTopProducts(payload) { return this.call('getTopProducts', JSON.stringify(payload || {})); },
      getTopShops(payload) { return this.call('getTopShops', JSON.stringify(payload || {})); },
      getTopSubids(payload) { return this.call('getTopSubids', JSON.stringify(payload || {})); },
      getOrders(payload) { return this.call('getOrders', JSON.stringify(payload || {})); },
      getClickOverview(payload) { return this.call('getClickOverview', JSON.stringify(payload || {})); },
      getStatsCompare(payload) { return this.call('getStatsCompare', JSON.stringify(payload || {})); },
      syncStats(payload) { return this.call('syncStats', JSON.stringify(payload || {})); },
      syncOrders(days) { return this.call('syncOrders', String(days || 30)); },
      syncClicks(days, maxClicks) { return this.call('syncClicks', String(days || 30), String(maxClicks || 50000)); },
      exportOrders(payload) { return this.call('exportOrders', JSON.stringify(payload || {})); },
      getSubidDetail(payload) { return this.call('getSubidDetail', JSON.stringify(payload || {})); },
      loadCpcConfig() { return this.call('loadCpcConfig'); },
      saveCpcConfig(payload) { return this.call('saveCpcConfig', JSON.stringify(payload || {})); },
      getProductAnalytics(payload) { return this.call('getProductAnalytics', JSON.stringify(payload || {})); },

      getHistory() { return this.call('getHistory'); },
      loadHistory() { return this.call('loadHistory'); },
      getHistoryFiltered(payload) { return this.call('getHistoryFiltered', JSON.stringify(payload || {})); },
      deleteComment(id) { return this.call('deleteComment', id); },
      repostRejectedComments(payload) { return this.call('repostRejectedComments', JSON.stringify(payload || {})); },
      repostComment(payload) { return this.call('repostComment', JSON.stringify(payload || {})); },
      pauseRepostComments() { return this.call('pauseRepostComments'); },
      resumeRepostComments() { return this.call('resumeRepostComments'); },
      stopRepostComments() { return this.call('stopRepostComments'); },
      openLink(linkType, url) { return this.call('openLink', linkType || '', url || ''); },
      getLicenseInfo() { return this.call('getLicenseInfo'); },
      updateLicense(key) { return this.call('updateLicense', key || ''); },
      checkForUpdates(force) { return this.call('checkForUpdates', JSON.stringify({ force: !!force })); },
      dismissUpdate(version, doNotShowAgain) {
        return this.call('dismissUpdate', JSON.stringify({ version: version || '', doNotShowAgain: !!doNotShowAgain }));
      },
      installUpdate(updateInfo) { return this.call('installUpdate', JSON.stringify(updateInfo || {})); },
      acknowledgeWhatsNew() { return this.call('acknowledgeWhatsNew'); },
      openReleasePage(url) { return this.call('openReleasePage', url || ''); },

      loadTinyUrlTokens() { return this.call('loadTinyUrlTokens'); },
      addTinyUrlToken(token) { return this.call('addTinyUrlToken', token || ''); },
      deleteTinyUrlTokens(payload) { return this.call('deleteTinyUrlTokens', JSON.stringify(payload || {})); },

      toggleGroupPaused(payload) { return this.call('toggleGroupPaused', JSON.stringify(payload || {})); },

      loadRunHistory(payload) { return this.call('loadRunHistory', JSON.stringify(payload || {})); },
      resolveFailedPost(payload) { return this.call('resolveFailedPost', JSON.stringify(payload || {})); },
    };

    function setConnection(nextConnected, detail = {}) {
      const changed = api.connected !== !!nextConnected;
      api.connected = !!nextConnected;
      if (!readyResolved) {
        readyResolved = true;
        resolveReady(!!nextConnected);
      }
      if (changed || detail.force) {
        emit('backend:ready', { connected: api.connected, mode: 'http', baseUrl: api.baseUrl, ...detail });
      }
    }

    function attachEvents() {
      if (eventStream) eventStream.close();
      eventStream = new EventSource(`${api.baseUrl}/api/events`);
      eventStream.addEventListener('status', (event) => emit('backend:status', parseResponse(event.data)));
      eventStream.addEventListener('log', (event) => emit('backend:log', parseResponse(event.data)));
      eventStream.addEventListener('runtime', (event) => emit('backend:runtime', parseResponse(event.data)));
      eventStream.addEventListener('data', (event) => emit('backend:data-changed', parseResponse(event.data)));
      eventStream.addEventListener('update', (event) => emit('backend:update', parseResponse(event.data)));
      eventStream.onopen = () => setConnection(true);
      eventStream.onerror = () => {
        setConnection(false, { error: 'SSE disconnected' });
      };
    }

    async function probe(forceReadyEvent = false) {
      const nextBaseUrl = currentBaseUrl();
      const baseChanged = nextBaseUrl !== lastBaseUrl;
      api.baseUrl = nextBaseUrl;
      lastBaseUrl = nextBaseUrl;
      if (!api.baseUrl) {
        if (eventStream) { eventStream.close(); eventStream = null; }
        setConnection(false, { force: forceReadyEvent || baseChanged, reason: 'server-not-configured' });
        return;
      }
      try {
        const response = await fetch(`${api.baseUrl}/api/health`, { cache: 'no-store' });
        const payload = parseResponse(await response.text());
        if (response.ok) {
          if (!eventStream || baseChanged) attachEvents();
          setConnection(true, { health: payload, force: forceReadyEvent || baseChanged });
        } else {
          if (eventStream) { eventStream.close(); eventStream = null; }
          setConnection(false, { health: payload, force: forceReadyEvent || baseChanged });
        }
      } catch (error) {
        if (eventStream) { eventStream.close(); eventStream = null; }
        setConnection(false, { error: String(error?.message || error), force: forceReadyEvent || baseChanged });
      }
    }

    heartbeatTimer = window.setInterval(() => {
      probe(false);
    }, 5000);

    window.addEventListener('beforeunload', () => {
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      if (eventStream) eventStream.close();
    });

    probe(true);
    return api;
  }

  window.backendApi = createApi();
})();

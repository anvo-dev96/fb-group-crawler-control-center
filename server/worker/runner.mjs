import fs from 'node:fs/promises';
import path from 'node:path';

import { BrowserManager } from '../lib/browser/browser-manager.mjs';
import { CrawlerService } from '../lib/crawler-service.mjs';
import { defaultState } from '../lib/defaults.mjs';

class MemoryStore {
  constructor(seed = null) {
    this.data = seed ? JSON.parse(JSON.stringify(seed)) : defaultState();
  }

  async init() {
    return this.data;
  }

  async set(partial) {
    this.data = {
      ...this.data,
      ...partial,
      configUi: partial.configUi
        ? { ...this.data.configUi, ...partial.configUi }
        : this.data.configUi,
    };
    return this.data;
  }

  async mutate(mutator) {
    const next = await mutator(this.data);
    if (next && typeof next === 'object') this.data = next;
    return this.data;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const runtime = {
  worker: null,
  stateDir: '',
  profileDir: '',
  service: null,
  store: null,
};

function emit(type, data = {}) {
  if (typeof process.send === 'function') {
    process.send({ type, data });
  }
}

function emitRuntimeState(extra = {}) {
  emit('runtime-state', {
    workerId: runtime.worker?.id || '',
    state: extra.state || 'ready',
    browserConnected: !!runtime.service?.browserManager?.activeCrawler?.(),
    botStatus: runtime.service?.botState?.status || 'idle',
    ...extra,
  });
}

async function persistRuntimeConfig(configUi, groups) {
  if (!runtime.service) throw new Error('Worker chưa được khởi tạo.');
  if (configUi && typeof configUi === 'object') {
    await runtime.service.syncCrawlerConfig(configUi);
  }
  if (Array.isArray(groups)) {
    await runtime.service.writeGroupsData(groups);
  }
}

async function initWorker(payload = {}) {
  runtime.worker = payload.worker || null;
  runtime.stateDir = payload.stateDir || '';
  runtime.profileDir = payload.profileDir || '';
  await fs.mkdir(runtime.stateDir, { recursive: true });
  await fs.mkdir(runtime.profileDir, { recursive: true });

  const stateFile = path.join(runtime.stateDir, 'runtime-state.json');
  const groupsFile = path.join(runtime.stateDir, 'facebook-groups.json');
  const crawlerConfigFile = path.join(runtime.stateDir, 'crawler-config.json');
  runtime.store = new MemoryStore();
  await runtime.store.init();

  const events = {
    log(entry) {
      emit('log-event', {
        ...entry,
        workerId: runtime.worker?.id || '',
      });
    },
    status(payload) {
      emit('status-event', {
        ...payload,
        workerId: runtime.worker?.id || '',
      });
      emitRuntimeState({ state: payload.state || 'ready' });
    },
    runtime(payload) {
      emit('runtime-event', {
        ...payload,
        workerId: runtime.worker?.id || '',
      });
    },
    data(payload) {
      emit('data-event', {
        ...payload,
        workerId: runtime.worker?.id || '',
      });
      if (payload?.type === 'browser') {
        emit('browser-event', {
          ...payload,
          workerId: runtime.worker?.id || '',
        });
      }
    },
    update() {},
  };

  const browserManager = new BrowserManager({
    store: runtime.store,
    events,
    stateDir: runtime.stateDir,
  });

  runtime.service = new CrawlerService({
    store: runtime.store,
    events,
    browserManager,
    stateDir: runtime.stateDir,
    groupsFile,
    crawlerConfigFile,
    workerProvider: () => runtime.worker,
    storeWritesEnabled: false,
    hooks: {
      onGroupComplete: async (groupPayload) => {
        emit('group-complete', {
          ...clone(groupPayload),
          workerId: runtime.worker?.id || '',
        });
      },
      onRunComplete: async (runPayload) => {
        emit('run-complete', {
          ...clone(runPayload),
          workerId: runtime.worker?.id || '',
        });
      },
    },
  });

  await runtime.service.init();
  await runtime.store.set({
    ...defaultState(),
    configUi: runtime.store.data.configUi,
  });
  await fs.writeFile(stateFile, JSON.stringify({ initializedAt: nowIso(), workerId: runtime.worker?.id || '' }, null, 2), 'utf8');
  emitRuntimeState({ state: 'ready' });
  return {
    workerId: runtime.worker?.id || '',
    ready: true,
  };
}

async function executeCommand(command, payload = {}) {
  switch (command) {
    case 'init':
      return initWorker(payload);
    case 'syncWorker':
      runtime.worker = payload.worker || runtime.worker;
      emitRuntimeState({ state: 'ready' });
      return {
        workerId: runtime.worker?.id || '',
        synced: true,
      };
    case 'connectBrowser':
      runtime.worker = payload.worker || runtime.worker;
      await persistRuntimeConfig(payload.configUi, payload.groups);
      return runtime.service.connectBrowser(payload.configUi);
    case 'closeDriver':
      return runtime.service.closeDriver();
    case 'startBot':
      runtime.worker = payload.worker || runtime.worker;
      await persistRuntimeConfig(payload.configUi, payload.groups);
      return runtime.service.startBot(payload.configUi);
    case 'pauseBot':
      return runtime.service.pauseBot();
    case 'resumeBot':
      return runtime.service.resumeBot();
    case 'stopBot':
      return runtime.service.stopBot();
    case 'getBotStatus':
      return runtime.service.getBotStatus();
    case 'shutdown':
      try {
        await runtime.service?.closeDriver?.();
      } catch (_) {}
      emitRuntimeState({ state: 'shutdown' });
      return { ok: true };
    default:
      throw new Error(`Worker command "${command}" không được hỗ trợ.`);
  }
}

process.on('message', async (message = {}) => {
  if (message.type !== 'command' || !message.requestId) return;
  try {
    const data = await executeCommand(message.command, message.payload || {});
    if (typeof process.send === 'function') {
      process.send({
        type: 'response',
        requestId: message.requestId,
        ok: true,
        data,
      });
    }
  } catch (error) {
    if (typeof process.send === 'function') {
      process.send({
        type: 'response',
        requestId: message.requestId,
        ok: false,
        error: error?.message || String(error),
      });
    }
  }
});

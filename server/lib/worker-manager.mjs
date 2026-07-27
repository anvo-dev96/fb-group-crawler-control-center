import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fork } from 'node:child_process';

function nowIso() {
  return new Date().toISOString();
}

function slugify(value, fallback = 'worker') {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeIdList(values) {
  const seen = new Set();
  const rows = [];
  for (const value of Array.isArray(values) ? values : []) {
    const id = String(value || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push(id);
  }
  return rows;
}

function isPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ port, host }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
  return dirPath;
}

export class WorkerManager {
  constructor({ workersFile, stateDir, workerScript, onEvent = null, defaultConfigProvider = null }) {
    this.workersFile = workersFile;
    this.stateDir = stateDir;
    this.workerScript = workerScript;
    this.onEvent = typeof onEvent === 'function' ? onEvent : null;
    this.defaultConfigProvider = typeof defaultConfigProvider === 'function' ? defaultConfigProvider : (() => ({}));
    this.workers = [];
    this.processes = new Map();
    this.requests = new Map();
  }

  workerStateDir(workerId) {
    return path.join(this.stateDir, 'workers', workerId);
  }

  workerProfileDir(workerId) {
    return path.join(this.workerStateDir(workerId), 'profiles');
  }

  async init() {
    await ensureDir(path.dirname(this.workersFile));
    try {
      const raw = await fs.readFile(this.workersFile, 'utf8');
      const parsed = JSON.parse(raw);
      this.workers = Array.isArray(parsed) ? parsed.map((item, index) => this.normalizeWorker(item, index)) : [];
    } catch (_) {
      this.workers = [];
      await this.save();
    }
    await this.ensureDefaultWorker();
    return this.snapshot();
  }

  async save() {
    await ensureDir(path.dirname(this.workersFile));
    await fs.writeFile(this.workersFile, JSON.stringify(this.workers, null, 2), 'utf8');
  }

  normalizeWorker(raw = {}, index = 0) {
    const baseConfig = this.defaultConfigProvider() || {};
    const id = String(raw.id || `worker-${index + 1}`).trim();
    const createdAt = raw.createdAt || nowIso();
    const updatedAt = raw.updatedAt || createdAt;
    const browserType = raw.browserType || baseConfig.browserType || 'chrome';
    const profileMode = raw.profileMode || (raw.useSeparateProfile === false ? 'shared' : (baseConfig.useSeparateProfile === false ? 'shared' : 'dedicated'));
    const edgePort = Number(raw.edgePort || baseConfig.edgePort || 9222);
    return {
      id,
      name: raw.name || `Worker ${index + 1}`,
      browserType,
      browserPath: raw.browserPath || '',
      browserProfileId: raw.browserProfileId || baseConfig.browserProfileId || 'Default',
      browserHeadless: !!raw.browserHeadless,
      profileMode,
      useSeparateProfile: profileMode === 'dedicated',
      edgePort,
      accountLabel: raw.accountLabel || '',
      facebookAccountId: String(raw.facebookAccountId || '').trim(),
      facebookCookieJson: String(raw.facebookCookieJson || '').trim(),
      groupIds: normalizeIdList(raw.groupIds),
      createdAt,
      updatedAt,
    };
  }

  async ensureDefaultWorker() {
    if (this.workers.length) return this.workers[0];
    const created = await this.createWorker({
      id: 'default-worker',
      name: 'Default Worker',
      profileMode: (this.defaultConfigProvider()?.useSeparateProfile === false ? 'shared' : 'dedicated'),
    });
    return created;
  }

  snapshot() {
    return this.workers.map((worker) => {
      const runtime = this.processes.get(worker.id)?.runtime || {};
      return {
        ...clone(worker),
        runtime: clone(runtime),
      };
    });
  }

  findWorker(workerId) {
    return this.workers.find((worker) => worker.id === workerId) || null;
  }

  async allocatePort(preferredPort = null, excludeWorkerId = '') {
    const reserved = new Set(
      this.workers
        .filter((worker) => worker.id !== excludeWorkerId)
        .map((worker) => Number(worker.edgePort || 0))
        .filter((port) => Number.isInteger(port) && port > 0)
    );
    const start = Number(preferredPort || 9222);
    for (let offset = 0; offset < 400; offset += 1) {
      const candidate = start + offset;
      if (reserved.has(candidate)) continue;
      if (await isPortAvailable(candidate)) return candidate;
    }
    throw new Error('Không cấp phát được debug port trống cho worker.');
  }

  async ensureRequestedPort(port, excludeWorkerId = '') {
    const requestedPort = Number(port || 0);
    if (!Number.isInteger(requestedPort) || requestedPort < 1024 || requestedPort > 65535) {
      throw new Error('Debug port phải là số nguyên từ 1024 đến 65535.');
    }
    const duplicate = this.workers.find((worker) => (
      worker.id !== excludeWorkerId
      && Number(worker.edgePort || 0) === requestedPort
    ));
    if (duplicate) {
      throw new Error(`Debug port ${requestedPort} đã được worker ${duplicate.name || duplicate.id} sử dụng.`);
    }
    if (!await isPortAvailable(requestedPort)) {
      throw new Error(`Debug port ${requestedPort} đang được tiến trình khác sử dụng.`);
    }
    return requestedPort;
  }

  async createWorker(raw = {}) {
    const fallbackConfig = this.defaultConfigProvider() || {};
    const baseId = slugify(raw.id || raw.name || raw.accountLabel || `worker-${this.workers.length + 1}`);
    let workerId = baseId;
    let suffix = 2;
    while (this.findWorker(workerId)) {
      workerId = `${baseId}-${suffix}`;
      suffix += 1;
    }
    const edgePort = raw.edgePort != null
      ? await this.ensureRequestedPort(raw.edgePort)
      : await this.allocatePort(fallbackConfig.edgePort || 9222);
    const worker = this.normalizeWorker({
      ...raw,
      id: workerId,
      edgePort,
      updatedAt: nowIso(),
      createdAt: nowIso(),
    }, this.workers.length);
    this.workers.push(worker);
    await this.save();
    return clone(worker);
  }

  async updateWorker(workerId, updates = {}) {
    const current = this.findWorker(workerId);
    if (!current) throw new Error('Không tìm thấy worker.');
    const nextPort = updates.edgePort != null
      ? (
        Number(updates.edgePort) === Number(current.edgePort)
          ? current.edgePort
          : await this.ensureRequestedPort(updates.edgePort, workerId)
      )
      : current.edgePort;
    const normalized = this.normalizeWorker({
      ...current,
      ...updates,
      id: current.id,
      edgePort: nextPort,
      updatedAt: nowIso(),
      createdAt: current.createdAt,
    }, this.workers.findIndex((item) => item.id === workerId));
    this.workers = this.workers.map((item) => (item.id === workerId ? normalized : item));
    await this.save();
    const runtime = this.processes.get(workerId);
    if (runtime?.child && runtime.child.exitCode == null && runtime.child.signalCode == null) {
      await this.dispatch(workerId, 'syncWorker', { worker: normalized }).catch(() => {});
    }
    return clone(normalized);
  }

  async deleteWorker(workerId) {
    if (this.processes.has(workerId)) {
      await this.stopBot(workerId).catch(() => {});
      await this.shutdownWorker(workerId).catch(() => {});
    }
    const next = this.workers.filter((worker) => worker.id !== workerId);
    if (next.length === this.workers.length) throw new Error('Không tìm thấy worker.');
    this.workers = next;
    await this.save();
    if (!this.workers.length) {
      await this.ensureDefaultWorker();
    }
    return { deleted: true };
  }

  async ensureWorkerRuntime(workerId) {
    const existing = this.processes.get(workerId);
    if (existing?.child && existing.child.exitCode == null && existing.child.signalCode == null) {
      return existing;
    }
    const worker = this.findWorker(workerId);
    if (!worker) throw new Error('Không tìm thấy worker.');
    const child = fork(this.workerScript, [], {
      cwd: process.cwd(),
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    const runtime = {
      status: 'booting',
      child,
      requestSeq: 0,
      runtime: {
        workerId,
        state: 'booting',
        browserConnected: false,
        botStatus: 'idle',
      },
    };
    this.processes.set(workerId, runtime);
    child.on('message', (message) => {
      this.handleWorkerMessage(workerId, message);
    });
    child.on('exit', (code, signal) => {
      const proc = this.processes.get(workerId);
      if (proc) {
        proc.runtime = {
          ...proc.runtime,
          state: 'exited',
          exitCode: code,
          signal,
          browserConnected: false,
        };
      }
      if (this.onEvent) {
        this.onEvent({
          type: 'worker-exit',
          workerId,
          code,
          signal,
        });
      }
    });
    await this.dispatch(workerId, 'init', {
      worker,
      stateDir: this.workerStateDir(workerId),
      profileDir: this.workerProfileDir(workerId),
      defaultConfig: this.defaultConfigProvider(),
    });
    return runtime;
  }

  async shutdownWorker(workerId) {
    const runtime = this.processes.get(workerId);
    if (!runtime?.child) return { ok: true };
    try {
      await this.dispatch(workerId, 'shutdown', {});
    } catch (_) {}
    runtime.child.kill('SIGTERM');
    this.processes.delete(workerId);
    return { ok: true };
  }

  async dispatch(workerId, command, payload = {}) {
    const runtime = await this.ensureWorkerRuntime(workerId);
    const child = runtime.child;
    const requestId = `${workerId}:${Date.now()}:${runtime.requestSeq += 1}`;
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.requests.delete(requestId);
        reject(new Error(`Worker ${workerId} không phản hồi cho lệnh ${command}.`));
      }, 300000);
      this.requests.set(requestId, {
        resolve,
        reject,
        timeoutId,
      });
      child.send({
        type: 'command',
        requestId,
        command,
        payload,
      });
    });
  }

  handleWorkerMessage(workerId, message = {}) {
    if (message.type === 'response' && message.requestId) {
      const pending = this.requests.get(message.requestId);
      if (!pending) return;
      clearTimeout(pending.timeoutId);
      this.requests.delete(message.requestId);
      if (message.ok) pending.resolve(message.data ?? null);
      else pending.reject(new Error(message.error || 'Worker command failed.'));
      return;
    }

    const runtime = this.processes.get(workerId);
    if (runtime && message.type === 'runtime-state' && message.data) {
      runtime.runtime = {
        ...runtime.runtime,
        ...message.data,
      };
    }
    if (runtime && message.type === 'status-event' && message.data) {
      runtime.runtime = {
        ...runtime.runtime,
        botStatus: message.data.state || runtime.runtime.botStatus,
      };
    }
    if (runtime && message.type === 'browser-event' && message.data) {
      runtime.runtime = {
        ...runtime.runtime,
        browserConnected: !!message.data.connected,
        browser: message.data.connected ? (message.data.info || runtime.runtime.browser || null) : null,
      };
    }

    if (this.onEvent) {
      this.onEvent({
        workerId,
        ...message,
      });
    }
  }

  async connectBrowser(workerId, configUi, groups = []) {
    const worker = this.findWorker(workerId);
    if (!worker) throw new Error('Không tìm thấy worker.');
    return this.dispatch(workerId, 'connectBrowser', { worker, configUi, groups });
  }

  async closeDriver(workerId) {
    return this.dispatch(workerId, 'closeDriver', {});
  }

  async startBot(workerId, configUi, groups = []) {
    const worker = this.findWorker(workerId);
    if (!worker) throw new Error('Không tìm thấy worker.');
    return this.dispatch(workerId, 'startBot', { worker, configUi, groups });
  }

  async pauseBot(workerId) {
    return this.dispatch(workerId, 'pauseBot', {});
  }

  async resumeBot(workerId) {
    return this.dispatch(workerId, 'resumeBot', {});
  }

  async stopBot(workerId) {
    return this.dispatch(workerId, 'stopBot', {});
  }

  async getBotStatus(workerId) {
    return this.dispatch(workerId, 'getBotStatus', {});
  }
}

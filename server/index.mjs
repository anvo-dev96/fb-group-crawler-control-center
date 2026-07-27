import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BrowserManager } from './lib/browser/browser-manager.mjs';
import { CrawlerService } from './lib/crawler-service.mjs';
import { DEFAULT_SERVER_PORT } from './lib/defaults.mjs';
import { EventHub } from './lib/events.mjs';
import { JsonStore } from './lib/store.mjs';
import { WorkerManager } from './lib/worker-manager.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const stateDir = path.join(repoRoot, 'server', 'state');
const dataDir = path.join(repoRoot, 'data');
const storeFile = path.join(dataDir, 'app-state.json');
const legacyStoreFile = path.join(stateDir, 'app-state.json');
const groupsFile = path.join(dataDir, 'facebook-groups.json');
const groupTypesFile = path.join(dataDir, 'group-types.json');
const facebookAccountsFile = path.join(dataDir, 'facebook-accounts.json');
const crawlerConfigFile = path.join(dataDir, 'crawler-config.json');
const buyerIntentKeywordsFile = path.join(dataDir, 'buyer-intent-keywords.json');
const workersFile = path.join(dataDir, 'crawler-workers.json');
const workerScript = path.join(repoRoot, 'server', 'worker', 'runner.mjs');

async function ensureMigratedStoreFile() {
  try {
    await fs.access(storeFile);
    return;
  } catch (_) {
    // Fall through and try the legacy location.
  }
  try {
    const raw = await fs.readFile(legacyStoreFile, 'utf8');
    await fs.writeFile(storeFile, raw, 'utf8');
  } catch (_) {
    // No legacy file yet; JsonStore will create a fresh one.
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function parseRoute(url) {
  const requestUrl = new URL(url, 'http://127.0.0.1');
  return requestUrl;
}

async function main() {
  await fs.mkdir(stateDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });
  await ensureMigratedStoreFile();
  const events = new EventHub();
  const store = new JsonStore(storeFile);
  await store.init();
  const browserManager = new BrowserManager({ store, events, stateDir });
  const service = new CrawlerService({
    store,
    events,
    browserManager,
    stateDir,
    groupsFile,
    groupTypesFile,
    facebookAccountsFile,
    crawlerConfigFile,
    buyerIntentKeywordsFile,
  });
  await service.init();
  const workerManager = new WorkerManager({
    workersFile,
    stateDir,
    workerScript,
    defaultConfigProvider: () => service.store.data.configUi || {},
    onEvent: (event) => service.handleWorkerEvent(event),
  });
  await workerManager.init();
  service.attachWorkerManager(workerManager);

  const server = http.createServer(async (req, res) => {
    const requestUrl = parseRoute(req.url || '/');
    const pathname = requestUrl.pathname;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (req.method === 'GET' && (pathname === '/health' || pathname === '/api/health')) {
      const payload = await service.health();
      sendJson(res, 200, payload);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      events.addClient(res);
      req.on('close', () => events.removeClient(res));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/group_collections') {
      sendJson(res, 200, { ok: true, data: await service.loadGroupCollections() });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/runs') {
      sendJson(res, 200, { ok: true, data: await service.loadRunHistory() });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/call') {
      try {
        const body = await readJson(req);
        const method = String(body.method || '').trim();
        const args = Array.isArray(body.args) ? body.args : [];
        if (!method || typeof service[method] !== 'function') {
          sendJson(res, 404, { ok: false, error: `Method "${method}" không tồn tại trong server scaffold.` });
          return;
        }
        const data = await service[method](...args);
        sendJson(res, 200, { ok: true, data: data ?? null });
      } catch (error) {
        sendJson(res, 500, { ok: false, error: error?.message || String(error) });
      }
      return;
    }

    sendJson(res, 404, { ok: false, error: `No route for ${pathname}` });
  });

  server.listen(DEFAULT_SERVER_PORT, '0.0.0.0', () => {
    console.log(`FB crawler server listening on http://127.0.0.1:${DEFAULT_SERVER_PORT}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const host = '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const backendEntry = path.join(rootDir, 'server', 'index.mjs');
const defaultBackendPort = Number(process.env.FB_CRAWLER_SERVER_PORT || 8787);
const autoStartBackend = process.env.FB_CRAWLER_AUTO_START_BACKEND !== '0';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.jsx': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const manager = {
  child: null,
  port: defaultBackendPort,
  startedAt: null,
  stopping: false,
  lastExit: null,
  logs: [],
};

function pushLog(source, line) {
  const text = String(line || '').trim();
  if (!text) return;
  manager.logs.push({
    ts: new Date().toISOString(),
    source,
    line: text,
  });
  if (manager.logs.length > 120) {
    manager.logs.splice(0, manager.logs.length - 120);
  }
}

function resolvePaths(urlPathname) {
  const normalized = decodeURIComponent(urlPathname.split('?')[0] || '/');
  const candidates = [];

  if (normalized === '/') {
    candidates.push('/index.html');
    candidates.push('/ui/index.html');
  } else {
    candidates.push(normalized);
    if (normalized.startsWith('/ui/assets/')) {
      candidates.push(normalized.replace(/^\/ui/, ''));
    }
    if (!normalized.startsWith('/ui/')) {
      candidates.push('/ui' + normalized);
    }
  }

  return candidates
    .map((candidate) => path.resolve(rootDir, '.' + candidate))
    .filter((absPath) => absPath.startsWith(rootDir));
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
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function waitForExit(child, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(value);
    };

    child.once('exit', () => finish(true));

    timer = setTimeout(() => {
      finish(false);
    }, timeoutMs);
  });
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function isBackendHealthy(portToCheck) {
  try {
    const response = await fetch(`http://${host}:${portToCheck}/api/health`, {
      signal: AbortSignal.timeout(1200),
    });
    return response.ok;
  } catch (_) {
    return false;
  }
}

function latestBackendError() {
  for (let index = manager.logs.length - 1; index >= 0; index -= 1) {
    const entry = manager.logs[index];
    if (entry?.source === 'stderr' || entry?.source === 'manager') {
      return entry.line;
    }
  }
  return '';
}

async function waitForBackendReady(child, portToCheck, timeoutMs = 6000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isBackendHealthy(portToCheck)) return;
    if (!manager.child || child.exitCode !== null || child.signalCode !== null) break;
    await wait(250);
  }

  const extra = latestBackendError();
  throw new Error(
    extra
      ? `Backend không khởi động thành công ở port ${portToCheck}. ${extra}`
      : `Backend không phản hồi health check ở port ${portToCheck}.`,
  );
}

async function stopManagedServer() {
  const child = manager.child;
  if (!child) {
    manager.stopping = false;
    return { ok: true, running: false, message: 'Server chưa chạy.' };
  }

  manager.stopping = true;
  pushLog('manager', `Stopping backend server pid=${child.pid}`);

  try {
    child.kill('SIGTERM');
  } catch (error) {
    pushLog('manager', `SIGTERM failed: ${error?.message || String(error)}`);
  }

  const exitedGracefully = await waitForExit(child, 4000);

  if (!exitedGracefully && manager.child) {
    try {
      child.kill('SIGKILL');
      pushLog('manager', `SIGKILL sent to pid=${child.pid}`);
    } catch (error) {
      pushLog('manager', `SIGKILL failed: ${error?.message || String(error)}`);
    }
    await waitForExit(child, 1500);
  }

  manager.stopping = false;
  return { ok: true, running: !!manager.child, message: manager.child ? 'Đã gửi lệnh dừng server.' : 'Server đã dừng.' };
}

function managerSnapshot() {
  return {
    running: !!manager.child,
    stopping: manager.stopping,
    pid: manager.child?.pid || null,
    port: manager.port,
    url: `http://${host}:${manager.port}`,
    startedAt: manager.startedAt,
    uptimeMs: manager.startedAt ? Date.now() - new Date(manager.startedAt).getTime() : 0,
    managed: !!manager.child,
    lastExit: manager.lastExit,
    logs: manager.logs.slice(-24),
  };
}

async function startManagedServer(nextPort = defaultBackendPort) {
  const normalizedPort = Number(nextPort) || defaultBackendPort;
  if (manager.child) {
    return {
      ok: true,
      reused: true,
      message: `Server đã chạy ở port ${manager.port}.`,
      state: managerSnapshot(),
    };
  }

  manager.port = normalizedPort;
  manager.lastExit = null;
  pushLog('manager', `Starting backend server on port ${manager.port}`);

  const child = spawn(process.execPath, [backendEntry], {
    cwd: rootDir,
    env: {
      ...process.env,
      FB_CRAWLER_SERVER_PORT: String(manager.port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  manager.child = child;
  manager.startedAt = new Date().toISOString();
  manager.stopping = false;

  child.stdout?.on('data', (chunk) => {
    String(chunk || '')
      .split(/\r?\n/)
      .forEach((line) => pushLog('stdout', line));
  });

  child.stderr?.on('data', (chunk) => {
    String(chunk || '')
      .split(/\r?\n/)
      .forEach((line) => pushLog('stderr', line));
  });

  child.once('error', (error) => {
    pushLog('manager', `Spawn error: ${error?.message || String(error)}`);
    manager.lastExit = {
      code: null,
      signal: null,
      at: new Date().toISOString(),
      error: error?.message || String(error),
    };
    manager.child = null;
    manager.startedAt = null;
    manager.stopping = false;
  });

  child.once('exit', (code, signal) => {
    pushLog('manager', `Backend exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
    manager.lastExit = {
      code: code ?? null,
      signal: signal ?? null,
      at: new Date().toISOString(),
    };
    manager.child = null;
    manager.startedAt = null;
    manager.stopping = false;
  });

  await waitForBackendReady(child, manager.port);

  return {
    ok: true,
    reused: false,
    message: `Đã start backend server ở port ${manager.port}.`,
    state: managerSnapshot(),
  };
}

async function handleControlRoute(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/__control/server') {
    sendJson(res, 200, { ok: true, data: managerSnapshot() });
    return true;
  }

  if (req.method === 'POST' && pathname === '/__control/server/start') {
    try {
      const body = await readJson(req);
      const result = await startManagedServer(body.port);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error?.message || String(error) });
    }
    return true;
  }

  if (req.method === 'POST' && pathname === '/__control/server/stop') {
    try {
      const result = await stopManagedServer();
      sendJson(res, 200, { ...result, state: managerSnapshot() });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error?.message || String(error) });
    }
    return true;
  }

  if (req.method === 'POST' && pathname === '/__control/server/toggle') {
    try {
      const body = await readJson(req);
      const result = manager.child
        ? await stopManagedServer()
        : await startManagedServer(body.port);
      sendJson(res, 200, { ...result, state: managerSnapshot() });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error?.message || String(error) });
    }
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${host}:${port}`);

  if (await handleControlRoute(req, res, requestUrl.pathname)) return;

  const targetPaths = resolvePaths(req.url || '/');
  if (!targetPaths.length) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  for (const targetPath of targetPaths) {
    try {
      let stat = await fs.stat(targetPath);
      let filePath = targetPath;
      if (stat.isDirectory()) {
        filePath = path.join(targetPath, 'index.html');
        stat = await fs.stat(filePath);
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      const body = await fs.readFile(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'Content-Length': stat.size,
      });
      res.end(body);
      return;
    } catch (error) {
      // Try next candidate path.
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

process.on('SIGINT', async () => {
  await stopManagedServer();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await stopManagedServer();
  process.exit(0);
});

server.listen(port, host, async () => {
  console.log(`Static web app running at http://${host}:${port}`);
  if (!autoStartBackend) {
    console.log('Backend auto-start is disabled by FB_CRAWLER_AUTO_START_BACKEND=0');
    return;
  }
  try {
    const result = await startManagedServer(defaultBackendPort);
    console.log(result.message);
  } catch (error) {
    console.error(`Failed to auto-start backend server: ${error?.message || String(error)}`);
  }
});

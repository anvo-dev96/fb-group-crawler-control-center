import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const HOME = os.homedir();
const LOCAL_APPDATA = process.env.LOCALAPPDATA || '';
const APPDATA = process.env.APPDATA || '';
const PROGRAM_FILES = process.env.PROGRAMFILES || 'C:\\Program Files';
const PROGRAM_FILES_X86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';

function expandPath(input) {
  return String(input || '')
    .replace(/^~(?=\/|\\|$)/, HOME)
    .replace(/%LOCALAPPDATA%/gi, LOCAL_APPDATA)
    .replace(/%APPDATA%/gi, APPDATA)
    .replace(/%PROGRAMFILES%/gi, PROGRAM_FILES)
    .replace(/%PROGRAMFILES\(X86\)%/gi, PROGRAM_FILES_X86);
}

async function existingPaths(candidates) {
  const found = [];
  for (const candidate of candidates) {
    const target = expandPath(candidate);
    try {
      await fs.access(target);
      found.push(target);
    } catch (error) {}
  }
  return Array.from(new Set(found));
}

async function readDirNames(dirPath) {
  try {
    const rows = await fs.readdir(dirPath, { withFileTypes: true });
    return rows.filter((row) => row.isDirectory()).map((row) => row.name);
  } catch (error) {
    return [];
  }
}

function chromiumProfileLabel(name) {
  if (name === 'Default') return 'Default';
  if (name.startsWith('Profile ')) return name;
  return name;
}

async function scanChromiumProfiles(userDataDir) {
  const root = expandPath(userDataDir);
  const names = await readDirNames(root);
  return names
    .filter((name) => name === 'Default' || name.startsWith('Profile '))
    .map((name) => ({
      id: name,
      label: chromiumProfileLabel(name),
      path: path.join(root, name),
    }));
}

async function scanFirefoxProfiles(userDataDir) {
  const root = expandPath(userDataDir);
  const names = await readDirNames(root);
  return names.map((name) => ({
    id: name,
    label: name,
    path: path.join(root, name),
  }));
}

const PLATFORM = os.platform();

const DEFINITIONS = {
  chrome: {
    label: 'Google Chrome',
    engine: 'chromium',
    supported: true,
    executableCandidates: PLATFORM === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
        ]
      : PLATFORM === 'win32'
        ? [
            '%PROGRAMFILES%\\Google\\Chrome\\Application\\chrome.exe',
            '%PROGRAMFILES(X86)%\\Google\\Chrome\\Application\\chrome.exe',
            '%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe',
          ]
        : [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/snap/bin/chromium',
          ],
    userDataDir: PLATFORM === 'darwin'
      ? '~/Library/Application Support/Google/Chrome'
      : PLATFORM === 'win32'
        ? '%LOCALAPPDATA%\\Google\\Chrome\\User Data'
        : '~/.config/google-chrome',
    profileScanner: scanChromiumProfiles,
  },
  edge: {
    label: 'Microsoft Edge',
    engine: 'chromium',
    supported: true,
    executableCandidates: PLATFORM === 'darwin'
      ? ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
      : PLATFORM === 'win32'
        ? [
            '%PROGRAMFILES(X86)%\\Microsoft\\Edge\\Application\\msedge.exe',
            '%PROGRAMFILES%\\Microsoft\\Edge\\Application\\msedge.exe',
            '%LOCALAPPDATA%\\Microsoft\\Edge\\Application\\msedge.exe',
          ]
        : ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable'],
    userDataDir: PLATFORM === 'darwin'
      ? '~/Library/Application Support/Microsoft Edge'
      : PLATFORM === 'win32'
        ? '%LOCALAPPDATA%\\Microsoft\\Edge\\User Data'
        : '~/.config/microsoft-edge',
    profileScanner: scanChromiumProfiles,
  },
  brave: {
    label: 'Brave',
    engine: 'chromium',
    supported: true,
    executableCandidates: PLATFORM === 'darwin'
      ? ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser']
      : PLATFORM === 'win32'
        ? [
            '%PROGRAMFILES%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
            '%PROGRAMFILES(X86)%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
            '%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
          ]
        : ['/usr/bin/brave-browser', '/snap/bin/brave'],
    userDataDir: PLATFORM === 'darwin'
      ? '~/Library/Application Support/BraveSoftware/Brave-Browser'
      : PLATFORM === 'win32'
        ? '%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\User Data'
        : '~/.config/BraveSoftware/Brave-Browser',
    profileScanner: scanChromiumProfiles,
  },
  firefox: {
    label: 'Firefox',
    engine: 'firefox',
    supported: true,
    executableCandidates: PLATFORM === 'darwin'
      ? ['/Applications/Firefox.app/Contents/MacOS/firefox']
      : PLATFORM === 'win32'
        ? [
            '%PROGRAMFILES%\\Mozilla Firefox\\firefox.exe',
            '%PROGRAMFILES(X86)%\\Mozilla Firefox\\firefox.exe',
          ]
        : ['/usr/bin/firefox'],
    userDataDir: PLATFORM === 'darwin'
      ? '~/Library/Application Support/Firefox/Profiles'
      : PLATFORM === 'win32'
        ? '%APPDATA%\\Mozilla\\Firefox\\Profiles'
        : '~/.mozilla/firefox',
    profileScanner: scanFirefoxProfiles,
  },
  coccoc: {
    label: 'Coc Coc',
    engine: 'chromium',
    supported: false,
    executableCandidates: PLATFORM === 'darwin'
      ? ['/Applications/Coc Coc.app/Contents/MacOS/Coc Coc']
      : PLATFORM === 'win32'
        ? [
            '%PROGRAMFILES%\\CocCoc\\Browser\\Application\\browser.exe',
            '%PROGRAMFILES(X86)%\\CocCoc\\Browser\\Application\\browser.exe',
            '%LOCALAPPDATA%\\CocCoc\\Browser\\Application\\browser.exe',
          ]
        : ['/usr/bin/coccoc', '/opt/coccoc/coccoc'],
    userDataDir: PLATFORM === 'darwin'
      ? '~/Library/Application Support/CocCoc/Browser'
      : PLATFORM === 'win32'
        ? '%LOCALAPPDATA%\\CocCoc\\Browser\\User Data'
        : '~/.config/CocCoc/Browser',
    profileScanner: scanChromiumProfiles,
  },
  chromium: {
    label: 'Chromium',
    engine: 'chromium',
    supported: false,
    executableCandidates: PLATFORM === 'darwin'
      ? ['/Applications/Chromium.app/Contents/MacOS/Chromium']
      : PLATFORM === 'win32'
        ? [
            '%PROGRAMFILES%\\Chromium\\Application\\chrome.exe',
            '%PROGRAMFILES(X86)%\\Chromium\\Application\\chrome.exe',
            '%LOCALAPPDATA%\\Chromium\\Application\\chrome.exe',
          ]
        : ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'],
    userDataDir: PLATFORM === 'darwin'
      ? '~/Library/Application Support/Chromium'
      : PLATFORM === 'win32'
        ? '%LOCALAPPDATA%\\Chromium\\User Data'
        : '~/.config/chromium',
    profileScanner: scanChromiumProfiles,
  },
  opera: {
    label: 'Opera',
    engine: 'chromium',
    supported: false,
    executableCandidates: PLATFORM === 'darwin'
      ? ['/Applications/Opera.app/Contents/MacOS/Opera']
      : PLATFORM === 'win32'
        ? [
            '%LOCALAPPDATA%\\Programs\\Opera\\opera.exe',
            '%PROGRAMFILES%\\Opera\\opera.exe',
            '%PROGRAMFILES(X86)%\\Opera\\opera.exe',
          ]
        : ['/usr/bin/opera', '/snap/bin/opera'],
    userDataDir: PLATFORM === 'darwin'
      ? '~/Library/Application Support/com.operasoftware.Opera'
      : PLATFORM === 'win32'
        ? '%APPDATA%\\Opera Software\\Opera Stable'
        : '~/.config/opera',
    profileScanner: scanChromiumProfiles,
  },
  safari: {
    label: 'Safari',
    engine: 'webkit',
    supported: false,
    executableCandidates: PLATFORM === 'darwin'
      ? ['/Applications/Safari.app/Contents/MacOS/Safari']
      : [],
    userDataDir: PLATFORM === 'darwin'
      ? '~/Library/Safari'
      : '',
    profileScanner: scanFirefoxProfiles,
  },
};

export function detectPlatform() {
  if (PLATFORM === 'darwin') return 'macos';
  if (PLATFORM === 'win32') return 'windows';
  return PLATFORM;
}

export function browserDefinition(browserType) {
  return DEFINITIONS[browserType] || DEFINITIONS.chrome;
}

export async function detectInstallations(browserType) {
  const def = browserDefinition(browserType);
  return existingPaths(def.executableCandidates);
}

export async function detectAllInstallations() {
  const entries = [];
  for (const browserType of Object.keys(DEFINITIONS)) {
    const def = browserDefinition(browserType);
    if (def.supported === false) continue;
    const paths = await detectInstallations(browserType);
    if (!paths.length) continue;
    entries.push({
      type: browserType,
      label: def.label,
      path: paths[0],
      paths,
      engine: def.engine,
      supported: true,
    });
  }
  return entries;
}

export async function detectKnownBrowsers() {
  const entries = [];
  for (const browserType of Object.keys(DEFINITIONS)) {
    const def = browserDefinition(browserType);
    if (def.supported === false) continue;
    const paths = await detectInstallations(browserType);
    entries.push({
      type: browserType,
      label: def.label,
      path: paths[0] || '',
      paths,
      engine: def.engine,
      supported: true,
      installed: paths.length > 0,
    });
  }
  return entries;
}

export async function detectProfiles(browserType) {
  const def = browserDefinition(browserType);
  return def.profileScanner(def.userDataDir);
}

export function resolveUserDataRoot(browserType) {
  return expandPath(browserDefinition(browserType).userDataDir);
}

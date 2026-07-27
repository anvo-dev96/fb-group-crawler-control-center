import path from 'node:path';

import { browserDefinition, detectAllInstallations, detectKnownBrowsers, detectProfiles } from './platform-resolver.mjs';
import { ChromiumCrawler } from './chromium-crawler.mjs';
import { FirefoxCrawler } from './firefox-crawler.mjs';

class ChromeCrawler extends ChromiumCrawler {}
class EdgeCrawler extends ChromiumCrawler {}
class BraveCrawler extends ChromiumCrawler {}

export class BrowserManager {
  constructor({ store, events, stateDir }) {
    this.store = store;
    this.events = events;
    this.stateDir = stateDir;
    this.instances = new Map();
  }

  getCrawler(browserType = 'chrome') {
    if (this.instances.has(browserType)) return this.instances.get(browserType);
    const def = browserDefinition(browserType);
    const profileRoot = path.join(this.stateDir, 'profiles');
    let crawler;
    if (browserType === 'firefox') {
      crawler = new FirefoxCrawler({ browserType, label: def.label, store: this.store, events: this.events, profileRoot });
    } else if (browserType === 'edge') {
      crawler = new EdgeCrawler({ browserType, label: def.label, store: this.store, events: this.events, profileRoot });
    } else if (browserType === 'brave') {
      crawler = new BraveCrawler({ browserType, label: def.label, store: this.store, events: this.events, profileRoot });
    } else {
      crawler = new ChromeCrawler({ browserType, label: def.label, store: this.store, events: this.events, profileRoot });
    }
    this.instances.set(browserType, crawler);
    return crawler;
  }

  async scanBrowsers(options = {}) {
    if (options?.includeUnsupported) return detectKnownBrowsers();
    return detectAllInstallations();
  }

  async scanProfiles(browserType) {
    return detectProfiles(browserType);
  }

  async connect(configUi) {
    const browserType = configUi?.browserType || 'chrome';
    const crawler = this.getCrawler(browserType);
    const info = await crawler.connect(configUi);
    return { crawler, info };
  }

  async disconnect(browserType) {
    if (browserType) {
      const crawler = this.instances.get(browserType);
      if (crawler) await crawler.disconnect();
      return;
    }
    for (const crawler of this.instances.values()) {
      await crawler.disconnect();
    }
  }

  activeCrawler(browserType = '') {
    if (browserType && this.instances.has(browserType)) return this.instances.get(browserType);
    for (const crawler of this.instances.values()) {
      if (crawler.connectionInfo) return crawler;
    }
    return null;
  }
}

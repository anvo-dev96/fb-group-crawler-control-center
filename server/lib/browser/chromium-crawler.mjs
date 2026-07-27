import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { chromium } from 'playwright';

import { BrowserCrawler } from './browser-crawler.mjs';
import { browserDefinition, detectInstallations, detectProfiles } from './platform-resolver.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isPortOpen(port, host = '127.0.0.1', timeout = 600) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

export class ChromiumCrawler extends BrowserCrawler {
  constructor({ browserType, label, store, events, profileRoot }) {
    super({ browserType, label, store, events });
    this.profileRoot = profileRoot;
    this.browser = null;
    this.browserProcess = null;
    this.connectionInfo = null;
    this.disconnecting = false;
  }

  handleBrowserDisconnected() {
    const info = this.connectionInfo;
    this.browser = null;
    this.connectionInfo = null;
    if (this.disconnecting || !info) return;
    this.events?.data?.({
      type: 'browser',
      connected: false,
      status: 'idle',
      info: null,
      message: `${info.label} đã mất kết nối browser.`,
    });
    this.events?.log?.({
      ts: new Date().toISOString(),
      level: 'warning',
      tag: 'BROWSER',
      message: `${info.label} đã bị đóng hoặc mất debug connection.`,
    });
  }

  async detectInstallations() {
    return detectInstallations(this.browserType);
  }

  async detectProfiles() {
    return detectProfiles(this.browserType);
  }

  async ensureProfileDir(configUi = {}) {
    if (!configUi.useSeparateProfile) return null;
    const target = path.join(this.profileRoot, this.browserType);
    await fs.mkdir(target, { recursive: true });
    return target;
  }

  async ensureFallbackProfileDir() {
    const target = path.join(this.profileRoot, `${this.browserType}-launch`);
    await fs.mkdir(target, { recursive: true });
    return target;
  }

  async waitForPort(port) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (await isPortOpen(port)) return true;
      await sleep(300);
    }
    return false;
  }

  buildLaunchArgs(configUi, port, userDataDir = null) {
    const args = [
      `--remote-debugging-port=${port}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate,MediaRouter',
      '--new-window',
      'about:blank',
    ];
    if (configUi.browserProfileId && !configUi.useSeparateProfile && !userDataDir) {
      args.push(`--profile-directory=${configUi.browserProfileId}`);
    }
    if (userDataDir) args.push(`--user-data-dir=${userDataDir}`);
    return args;
  }

  async waitForLaunch(port, child, timeoutMs = 12000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (await isPortOpen(port)) return { ok: true };
      if (child.exitCode != null || child.signalCode != null) {
        return {
          ok: false,
          exited: true,
          exitCode: child.exitCode,
          signal: child.signalCode,
        };
      }
      await sleep(300);
    }
    return { ok: false, exited: false };
  }

  async launchDebugBrowser(configUi, executablePath) {
    const port = Number(configUi.edgePort || 9222);
    const preferredUserDataDir = await this.ensureProfileDir(configUi);
    const attempts = [
      {
        label: preferredUserDataDir
          ? 'configured-profile'
          : 'existing-browser-profile',
        userDataDir: preferredUserDataDir,
        fallback: false,
      },
    ];
    if (!preferredUserDataDir) {
      attempts.push({
        label: 'isolated-launch-profile',
        userDataDir: await this.ensureFallbackProfileDir(),
        fallback: true,
      });
    }

    let lastError = null;

    for (const attempt of attempts) {
      const args = this.buildLaunchArgs(configUi, port, attempt.userDataDir);
      const stderrLines = [];
      const stdoutLines = [];
      this.browserProcess = spawn(executablePath, args, {
        cwd: process.cwd(),
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.browserProcess.unref();
      this.browserProcess.stdout?.on('data', (chunk) => {
        String(chunk || '')
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .forEach((line) => stdoutLines.push(line));
      });
      this.browserProcess.stderr?.on('data', (chunk) => {
        String(chunk || '')
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .forEach((line) => stderrLines.push(line));
      });

      const outcome = await this.waitForLaunch(port, this.browserProcess);
      if (outcome.ok) {
        if (attempt.fallback && this.events?.log) {
          this.events.log({
            ts: new Date().toISOString(),
            level: 'warning',
            tag: 'BROWSER',
            message: `${this.label} phải mở bằng profile tách riêng để bật debug port ${port}.`,
          });
        }
        return port;
      }

      lastError = {
        attempt: attempt.label,
        stderr: stderrLines.slice(-6),
        stdout: stdoutLines.slice(-6),
        ...outcome,
      };
    }

    const extra = lastError?.stderr?.[lastError.stderr.length - 1]
      || lastError?.stdout?.[lastError.stdout.length - 1]
      || (lastError?.exited ? `process exited (${lastError.exitCode ?? 'null'} / ${lastError.signal ?? 'null'})` : 'port did not open');
    throw new Error(`Không mở được ${this.label} ở debug port ${port}. ${extra}`);
  }

  async connect(configUi = {}) {
    if (this.browser) return { ...this.connectionInfo, reused: true };
    const installations = await this.detectInstallations();
    const executablePath = installations[0];
    if (!executablePath) throw new Error(`Không tìm thấy ${this.label} trên máy.`);
    const port = Number(configUi.edgePort || 9222);
    let attachedToExisting = await isPortOpen(port);
    if (!attachedToExisting) {
      await this.launchDebugBrowser(configUi, executablePath);
    }
    this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    this.browser.once('disconnected', () => {
      this.handleBrowserDisconnected();
    });
    this.connectionInfo = {
      browserType: this.browserType,
      label: this.label,
      executablePath,
      port,
      mode: attachedToExisting ? 'attached' : 'launched',
    };
    await this.navigateToFacebookHome();
    return this.connectionInfo;
  }

  async disconnect() {
    this.disconnecting = true;
    try {
      await this.browser?.close?.();
    } catch (error) {}
    this.browser = null;
    this.connectionInfo = null;
    this.disconnecting = false;
  }

  async ensureReady() {
    if (!this.browser) throw new Error(`${this.label} chưa được kết nối.`);
    return this.browser;
  }

  async getContext() {
    await this.ensureReady();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const contexts = this.browser.contexts();
      if (contexts.length) return contexts[0];
      await sleep(250);
    }
    throw new Error(`${this.label} chưa tạo được default context để attach qua CDP.`);
  }

  async getPage() {
    const context = await this.getContext();
    const page = context.pages()[0] || await context.newPage();
    return page;
  }

  async warmUpOnHomePage({ durationMs = 30000 } = {}) {
    const page = await this.getPage();
    const currentUrl = page.url();
    if (!/facebook\.com/i.test(currentUrl || '')) {
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    await page.waitForTimeout(randomInt(1400, 2400));
    const startedAt = Date.now();
    while (Date.now() - startedAt < durationMs) {
      const viewport = await page.evaluate(() => ({
        width: window.innerWidth || 1440,
        height: window.innerHeight || 900,
        scrollHeight: document.body?.scrollHeight || document.documentElement?.scrollHeight || 2400,
      }));
      const targetX = randomInt(Math.round(viewport.width * 0.15), Math.round(viewport.width * 0.85));
      const targetY = randomInt(Math.round(viewport.height * 0.18), Math.round(viewport.height * 0.82));
      await page.mouse.move(targetX, targetY, { steps: randomInt(8, 20) });
      await page.waitForTimeout(randomInt(500, 1400));

      if (Math.random() > 0.3) {
        await page.mouse.wheel(0, randomInt(180, 900));
        await page.waitForTimeout(randomInt(900, 2200));
      }

      if (Math.random() > 0.55) {
        await page.mouse.wheel(0, randomInt(-260, -100));
        await page.waitForTimeout(randomInt(600, 1600));
      }

      if (Math.random() > 0.45) {
        const anchors = page.locator('a[href]');
        const count = await anchors.count().catch(() => 0);
        if (count > 0) {
          const index = randomInt(0, Math.min(count - 1, 12));
          const node = anchors.nth(index);
          await node.hover({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(randomInt(400, 1200));
        }
      }

      if (viewport.scrollHeight > viewport.height * 1.5 && Math.random() > 0.6) {
        await page.evaluate((amount) => window.scrollBy({ top: amount, behavior: 'smooth' }), randomInt(120, 520)).catch(() => {});
        await page.waitForTimeout(randomInt(900, 1800));
      }
    }
  }

  async openGroup(url) {
    const page = await this.getPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    return page;
  }

  async collectPosts({
    groupUrl,
    maxPosts = 20,
    maxScrolls = 60,
    maxNoNewPostRounds = 8,
    scrollDistance = 1200,
    scrollDelayMs = 1500,
    onPost = null,
    delayBetweenPostsMs = 0,
  }) {
    const page = await this.openGroup(groupUrl);
    await page.waitForTimeout(randomInt(2200, 3600));
    const rows = [];
    const seen = new Set();
    let idleRounds = 0;
    let scrollRounds = 0;
    const feedRoot = page.locator('div[role="feed"]').first();
    const hasFeedRoot = await feedRoot.count().catch(() => 0);

    while (
      rows.length < Number(maxPosts || 20)
      && idleRounds < Number(maxNoNewPostRounds || 8)
      && scrollRounds < Number(maxScrolls || 60)
    ) {
      const visibleFeedPosts = await page.evaluate(() => {
        const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const splitCleanLines = (value) => String(value || '')
          .split('\n')
          .map((line) => cleanText(line))
          .filter(Boolean);
        const getXPathNode = (contextNode, xpath) => {
          try {
            return document.evaluate(
              xpath,
              contextNode,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null,
            ).singleNodeValue;
          } catch {
            return null;
          }
        };
        const feed = document.querySelector('div[role="feed"]');
        const feedItems = feed
          ? Array.from(feed.children).slice(1)
          : Array.from(document.querySelectorAll('div[role="feed"] > *'));

        return feedItems.map((itemNode, rowIndex) => {
          const root = itemNode;
          const anchors = Array.from(root.querySelectorAll('a[href]'));
          const permalinkAnchor = anchors.find((anchor) => (
            /\/groups\/[^/]+\/posts\/\d+/i.test(anchor.href)
            || /permalink/i.test(anchor.href)
            || /story\.php/i.test(anchor.href)
            || /multi_permalinks=/i.test(anchor.href)
          ));
          const timePatterns = [
            /\d+\s*(phút|giờ|ngày|tuần|tháng|năm)/i,
            /^vừa xong$/i,
            /^hôm qua$/i,
            /^now$/i,
            /\d+\s*(m|min|h|d|w|mo|yr|y)/i,
          ];
          const timestampAnchor = anchors.find((anchor) => {
            const label = cleanText(
              anchor.getAttribute('aria-label')
              || anchor.textContent
              || anchor.getAttribute('title')
            );
            return timePatterns.some((pattern) => pattern.test(label))
              || /\/groups\/[^/]+\/posts\/\d+/i.test(anchor.href)
              || /permalink/i.test(anchor.href)
              || /story\.php/i.test(anchor.href);
          });
          const authorAnchor = root.querySelector('h2 a, h3 a, strong a, [aria-label] h2 a, [aria-label] h3 a');
          const author = cleanText(authorAnchor?.textContent || '');
          const authorProfileUrl = authorAnchor?.href || '';
          const actionLabels = ['Thích', 'Bình luận', 'Chia sẻ', 'Gửi', 'Viết câu trả lời...', 'Viết bình luận...'];
          const actionElements = Array.from(root.querySelectorAll('[role="button"], [role="link"], [role="textbox"], [contenteditable="true"]'));
          const firstForm = root.querySelector('form');
          const formTop = firstForm?.getBoundingClientRect?.().top ?? Number.POSITIVE_INFINITY;
          const actionTop = actionElements
            .map((element) => {
              const label = cleanText(
                element.getAttribute('aria-label')
                || element.getAttribute('aria-placeholder')
                || element.textContent
              );
              if (!actionLabels.some((item) => label.includes(item))) return null;
              return element.getBoundingClientRect().top || null;
            })
            .filter((value) => value != null)
            .sort((a, b) => a - b)[0] ?? Number.POSITIVE_INFINITY;
          const authorTop = authorAnchor?.getBoundingClientRect?.().top ?? Number.NEGATIVE_INFINITY;
          const contentBottom = Math.min(actionTop, formTop);
          const displayedTime = cleanText(
            timestampAnchor?.getAttribute('aria-label')
            || timestampAnchor?.textContent
            || timestampAnchor?.getAttribute('title')
            || ''
          );
          const reactionLikePatterns = [
            /(^| )(thích|like|bỏ thích|unlike)($| )/i,
            /(^| )(yêu thích|love|thương thương|care|haha|wow|buồn|sad|phẫn nộ|angry)($| )/i,
          ];
          const hasActionZone = actionElements.some((element) => {
            const label = cleanText(
              element.getAttribute('aria-label')
              || element.getAttribute('aria-placeholder')
              || element.textContent
            );
            return reactionLikePatterns.some((pattern) => pattern.test(label))
              || /Bình luận|Comment/i.test(label)
              || /Chia sẻ|Share/i.test(label)
              || /Viết câu trả lời|Viết bình luận|Write a comment|Write a reply/i.test(label);
          });

          const isMetaLine = (value) => {
            if (!value) return true;
            if (value === author) return true;
            if (value === displayedTime) return true;
            if (/^\d+\s*(phút|giờ|ngày|tuần|tháng|năm)$/i.test(value)) return true;
            if (/^\d+\s*(m|min|h|d|w|mo|yr|y)$/i.test(value)) return true;
            if (/^(Thích|Bình luận|Chia sẻ|Viết câu trả lời|Viết bình luận)/i.test(value)) return true;
            if (/^(Like|Comment|Share|Write a comment|Write a reply)/i.test(value)) return true;
            if (value === 'Facebook') return true;
            return false;
          };

          const isLikelyBrokenText = (value) => {
            const textValue = cleanText(value);
            if (!textValue) return true;
            const tokens = textValue.split(/\s+/).filter(Boolean);
            const longWeirdTokens = tokens.filter((token) => (
              token.length >= 24
              && /[A-Za-z]/.test(token)
              && /\d/.test(token)
            ));
            return longWeirdTokens.length >= 1;
          };

          const extractNodeText = (node) => {
            const candidates = Array.from(
              node.querySelectorAll('h1, h2, h3, h4, strong, span[dir="auto"], div[dir="auto"]'),
            );
            if (!candidates.length) {
              candidates.push(node);
            }
            const seenTexts = new Set();
            const lines = [];
            for (const element of candidates) {
              const value = cleanText(element.innerText || element.textContent || '');
              if (!value) continue;
              if (seenTexts.has(value)) continue;
              if (isMetaLine(value)) continue;
              if (/^(Xem thêm|Ẩn bớt|Tất cả cảm xúc|Bình luận công khai)$/i.test(value)) continue;
              if (isLikelyBrokenText(value)) continue;
              seenTexts.add(value);
              lines.push(value);
            }
            return lines.join('\n').trim();
          };

          const preferredContentNode = [
            './/*[@data-ad-rendering-role="story_message"]',
            './/*[@data-ad-comet-preview="message"]',
            './/*[@data-ad-preview="message"]',
            './/div/div/div/div/div/div/div/div/div/div[13]/div/div/div[3]',
            './/div/div/div/div/div/div/div/div/div/div[13]/div/div/div[3]/div[1]',
          ]
            .map((xpath) => getXPathNode(root, xpath))
            .find((node) => {
              if (!node) return false;
              return Boolean(extractNodeText(node));
            });

          if (!preferredContentNode) {
            return null;
          }

          const text = extractNodeText(preferredContentNode)
            || splitCleanLines(preferredContentNode.innerText || preferredContentNode.textContent || '')
              .filter((line) => !isMetaLine(line))
              .filter((line) => !/^(Xem thêm|Ẩn bớt|Tất cả cảm xúc|Bình luận công khai)$/i.test(line))
              .filter((line) => !isLikelyBrokenText(line))
              .join('\n')
              .trim();

          const hasContent = text.length >= 2;
          const hasPermalink = Boolean(permalinkAnchor || timestampAnchor);
          const hasAuthorSignal = Boolean(author || root.innerText?.includes('Ẩn danh') || root.innerText?.includes('Anonymous'));
          const looksLikePost = hasContent && (hasPermalink || hasAuthorSignal || hasActionZone);
          if (!looksLikePost) {
            return null;
          }

          const actionPayload = (matcher) => {
            const target = actionElements.find((element) => matcher(
              cleanText(
                element.getAttribute('aria-label')
                || element.getAttribute('aria-placeholder')
                || element.textContent
              )
            ));
            if (!target) return null;
            const rect = target.getBoundingClientRect();
            return {
              label: cleanText(
                target.getAttribute('aria-label')
                || target.getAttribute('aria-placeholder')
                || target.textContent
              ),
              rect: {
                x: Math.round(rect.x || 0),
                y: Math.round(rect.y || 0),
                width: Math.round(rect.width || 0),
                height: Math.round(rect.height || 0),
              },
            };
          };

          const postId = (
            permalinkAnchor?.href?.match(/\/posts\/(\d+)/i)?.[1]
            || permalinkAnchor?.href?.match(/[?&]story_fbid=(\d+)/i)?.[1]
            || permalinkAnchor?.href?.match(/[?&]fbid=(\d+)/i)?.[1]
            || ''
          );
          return {
            id: postId || permalinkAnchor?.href || `post-${rowIndex + 1}`,
            domIndex: rowIndex,
            uniqueKey: postId || permalinkAnchor?.href || `${author}|${displayedTime}|${text.slice(0, 80)}`,
            postId,
            url: permalinkAnchor?.href || timestampAnchor?.href || '',
            author,
            authorProfileUrl,
            text,
            displayedTime,
            actions: {
              like: actionPayload((label) => reactionLikePatterns.some((pattern) => pattern.test(label))),
              comment: actionPayload((label) => /^(Bình luận|Comment)(\b|$)/i.test(label) || /Bình luận về bài viết|Comment on this post/i.test(label)),
              share: actionPayload((label) => /Chia sẻ|Share/i.test(label)),
              commentBox: actionPayload((label) => /Viết câu trả lời|Viết bình luận|Write a comment|Write a reply/i.test(label)),
            },
          };
        }).filter(Boolean);
      }).catch(() => []);

      const count = visibleFeedPosts.length;
      if (count === 0 && this.events?.log) {
        this.events.log({
          ts: new Date().toISOString(),
          level: 'warning',
          tag: 'FB',
          message: 'Không tìm thấy article hợp lệ trong feed ở vòng quét hiện tại.',
        });
      }
      let newItemsThisRound = 0;

      for (let cardIndex = 0; cardIndex < visibleFeedPosts.length; cardIndex += 1) {
        if (rows.length >= Number(maxPosts || 20)) break;
        const item = visibleFeedPosts[cardIndex];
        if (!item?.text) continue;
        const key = item.uniqueKey || `${item.url || ''}::${item.text.slice(0, 120)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (Number.isInteger(item.domIndex) && item.domIndex >= 0) {
          await page.evaluate((domIndex) => {
            const feed = document.querySelector('div[role="feed"]');
            const feedItems = feed
              ? Array.from(feed.children).slice(1)
              : Array.from(document.querySelectorAll('div[role="feed"] > *'));
            const node = feedItems[domIndex];
            if (!node) return false;
            node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            return true;
          }, item.domIndex).catch(() => false);
          await page.waitForTimeout(randomInt(650, 1200));
        }
        rows.push(item);
        newItemsThisRound += 1;
        if (typeof onPost === 'function') {
          await onPost(item, rows.length - 1);
        }
        if (rows.length < Number(maxPosts || 20) && delayBetweenPostsMs > 0) {
          await page.waitForTimeout(delayBetweenPostsMs);
        } else {
          await page.waitForTimeout(randomInt(900, 1800));
        }
      }

      idleRounds = newItemsThisRound > 0 ? 0 : idleRounds + 1;
      if (rows.length >= Number(maxPosts || 20)) break;

      scrollRounds += 1;
      const previousLastKey = visibleFeedPosts[visibleFeedPosts.length - 1]?.uniqueKey || '';
      await page.mouse.move(randomInt(320, 980), randomInt(280, 820), { steps: randomInt(5, 12) }).catch(() => {});
      await page.mouse.wheel(
        0,
        randomInt(
          Math.max(600, Math.round(Number(scrollDistance || 1200) * 0.8)),
          Math.max(1100, Math.round(Number(scrollDistance || 1200) * 1.35)),
        ),
      );
      await page.waitForFunction(
        (lastKey) => {
          const feed = document.querySelector('div[role="feed"]');
          const feedItems = feed
            ? Array.from(feed.children).slice(1)
            : Array.from(document.querySelectorAll('div[role="feed"] > *'));
          const roots = feedItems.filter(Boolean);
          const anchors = roots.flatMap((root) => Array.from(root.querySelectorAll('a[href]')));
          const currentLast = anchors
            .map((anchor) => anchor.href || '')
            .filter((href) => /\/groups\/[^/]+\/posts\/\d+/i.test(href) || /permalink/i.test(href) || /story\.php/i.test(href))
            .at(-1)
            || '';
          return currentLast !== lastKey;
        },
        previousLastKey,
        { timeout: Math.max(1200, Number(scrollDelayMs || 1500)) },
      ).catch(() => {});
      await page.waitForTimeout(
        Math.max(900, Number(scrollDelayMs || 1500)) + randomInt(180, 720),
      );
    }

    return rows;
  }
}

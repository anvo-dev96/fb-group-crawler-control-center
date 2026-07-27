function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'no'].includes(normalized)) return false;
  return fallback;
}

function normalizeSameSite(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return null;
  if (normalized === 'strict') return 'Strict';
  if (normalized === 'lax') return 'Lax';
  if (['none', 'no_restriction', 'unspecified'].includes(normalized)) return 'None';
  return null;
}

function normalizeExpires(value, session = false) {
  if (parseBoolean(session, false)) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  if (numeric > 1_000_000_000_000) {
    return Math.round(numeric / 1000);
  }
  return Math.round(numeric);
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!/^https?:$/i.test(url.protocol)) return '';
    return url.toString();
  } catch (_) {
    return '';
  }
}

function cookieSourceList(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.cookies)) return parsed.cookies;
  if (parsed && typeof parsed === 'object' && parsed.name && Object.prototype.hasOwnProperty.call(parsed, 'value')) {
    return [parsed];
  }
  throw new Error('Cookie Facebook phải là mảng cookie hoặc object có trường cookies.');
}

function normalizeImportedCookie(rawCookie = {}) {
  const name = normalizeText(rawCookie.name);
  if (!name) return null;

  const url = normalizeUrl(rawCookie.url || rawCookie.origin || '');
  const domain = normalizeText(rawCookie.domain || '');
  const cookie = {
    name,
    value: rawCookie.value == null ? '' : String(rawCookie.value),
    path: normalizeText(rawCookie.path || '/') || '/',
    secure: parseBoolean(rawCookie.secure, true),
    httpOnly: parseBoolean(rawCookie.httpOnly ?? rawCookie.http_only, false),
  };

  if (domain) {
    cookie.domain = domain;
  } else if (url) {
    cookie.url = url;
  } else {
    cookie.domain = '.facebook.com';
  }

  const sameSite = normalizeSameSite(rawCookie.sameSite ?? rawCookie.same_site);
  if (sameSite) cookie.sameSite = sameSite;

  const expires = normalizeExpires(
    rawCookie.expires ?? rawCookie.expirationDate ?? rawCookie.expiry ?? rawCookie.expiration,
    rawCookie.session,
  );
  if (expires != null) cookie.expires = expires;

  return cookie;
}

function buildCommentMarker(commentText) {
  return normalizeText(String(commentText || '').split('http')[0]).slice(0, 30);
}

export class BrowserCrawler {
  constructor({ browserType, label, store, events }) {
    this.browserType = browserType;
    this.label = label;
    this.store = store;
    this.events = events;
  }

  async navigateToFacebookHome() {
    const page = await this.getPage();
    await page.goto('https://www.facebook.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    return page;
  }

  async inspectFacebookAuthState(page) {
    const currentPage = page || await this.getPage();
    const pageUrl = String(currentPage?.url?.() || '');
    const signal = await currentPage.evaluate(() => {
      const emailInput = document.querySelector('input[name="email"], input#email');
      const passwordInput = document.querySelector('input[name="pass"], input#pass');
      const loginButton = document.querySelector('button[name="login"], [data-testid="royal_login_button"]');
      const bodyText = String(document.body?.innerText || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      return {
        hasLoginForm: !!emailInput && (!!passwordInput || !!loginButton),
        hasFatalErrorPage: (
          bodyText.includes('sorry, something went wrong')
          || bodyText.includes("we're working on getting this fixed as soon as we can")
          || bodyText.includes('rất tiếc, đã xảy ra sự cố')
          || bodyText.includes('chúng tôi đang khắc phục sự cố này sớm nhất có thể')
        ),
      };
    }).catch(() => ({ hasLoginForm: false, hasFatalErrorPage: false }));

    const normalizedUrl = pageUrl.toLowerCase();
    const checkpointRequired = normalizedUrl.includes('/checkpoint/');
    const loginRequired = checkpointRequired
      || normalizedUrl.includes('facebook.com/login')
      || signal.hasLoginForm;
    const fatalErrorPage = signal.hasFatalErrorPage;

    return {
      pageUrl,
      loginRequired,
      checkpointRequired,
      fatalErrorPage,
    };
  }

  async detectInstallations() {
    throw new Error('detectInstallations() must be implemented');
  }

  async detectProfiles() {
    throw new Error('detectProfiles() must be implemented');
  }

  async connect() {
    throw new Error('connect() must be implemented');
  }

  async disconnect() {
    throw new Error('disconnect() must be implemented');
  }

  async ensureReady() {
    throw new Error('ensureReady() must be implemented');
  }

  async getContext() {
    throw new Error('getContext() must be implemented');
  }

  async openGroup() {
    throw new Error('openGroup() must be implemented');
  }

  async warmUpOnHomePage() {
    throw new Error('warmUpOnHomePage() must be implemented');
  }

  async collectPosts() {
    throw new Error('collectPosts() must be implemented');
  }

  log(level, message) {
    if (!this.events?.log) return;
    this.events.log({
      ts: new Date().toISOString(),
      level,
      tag: 'COMMENT',
      message,
    });
  }

  async restoreFacebookSession(cookieJson = '') {
    const raw = String(cookieJson || '').trim();
    if (!raw) {
      return {
        attempted: false,
        restored: false,
        reason: 'no-cookie',
      };
    }

    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      throw new Error('Cookie Facebook JSON không hợp lệ.');
    }

    const cookies = cookieSourceList(parsed)
      .map((item) => normalizeImportedCookie(item))
      .filter(Boolean);

    if (!cookies.length) {
      throw new Error('Cookie Facebook không có bản ghi hợp lệ để import.');
    }

    const context = await this.getContext();
    await context.addCookies(cookies);

    const page = await this.getPage();
    await page.goto('https://www.facebook.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(1200);

    const storedCookies = await context.cookies('https://www.facebook.com/').catch(() => []);
    const hasSessionCookie = storedCookies.some((item) => ['c_user', 'xs'].includes(String(item?.name || '')));
    const authState = await this.inspectFacebookAuthState(page);
    const restored = hasSessionCookie && !authState.loginRequired;

    return {
      attempted: true,
      restored,
      importedCount: cookies.length,
      sessionCookie: hasSessionCookie,
      loginRequired: authState.loginRequired,
      checkpointRequired: authState.checkpointRequired,
      fatalErrorPage: authState.fatalErrorPage,
      pageUrl: authState.pageUrl,
    };
  }

  async commentOnPost({
    groupUrl,
    post,
    commentText,
    deleteUnapproved = true,
  }) {
    const page = await this.openGroup(groupUrl);
    const normalizedComment = normalizeText(commentText);
    if (!normalizedComment) {
      return { status: 'fail', reason: 'empty-comment', finalUrl: page.url() };
    }

    await page.waitForTimeout(randomInt(1800, 2800));

    let composerKind = '';
    let commentBox = await this.openComposerFromFeed(page, post);
    if (commentBox) {
      composerKind = 'feed';
    }

    if (!commentBox && post?.url) {
      commentBox = await this.openComposerFromPermalink(page, post.url);
      if (commentBox) composerKind = 'permalink';
    }

    if (!commentBox) {
      return { status: 'fail', reason: 'composer-not-found', finalUrl: page.url() };
    }

    const typed = await this.typeCommentIntoBox(page, commentBox, normalizedComment);
    if (!typed) {
      return { status: 'fail', reason: 'type-failed', finalUrl: page.url(), composerKind };
    }

    await page.waitForTimeout(randomInt(300, 700));

    try {
      await page.keyboard.press('Enter');
    } catch (error) {
      return {
        status: 'fail',
        reason: `submit-failed: ${error.message || error}`,
        finalUrl: page.url(),
        composerKind,
      };
    }

    await page.waitForTimeout(randomInt(1500, 2400));

    let status = await this.checkSubmittedCommentStatus(page, normalizedComment);
    if (status === 'error_retry') {
      const retried = await this.clickCommentRetry(page);
      if (retried) {
        this.log('warning', 'Facebook báo lỗi tạm thời khi đăng comment, đang bấm thử lại.');
        await page.waitForTimeout(2200);
        status = await this.checkSubmittedCommentStatus(page, normalizedComment);
      }
    }

    let deleted = false;
    if (deleteUnapproved && ['pending', 'rejected'].includes(status)) {
      deleted = await this.deleteCommentByMarker(page, normalizedComment);
    }

    return {
      status,
      deleted,
      composerKind,
      finalUrl: page.url(),
    };
  }

  async openComposerFromFeed(page, post) {
    const found = await this.markPostInFeed(page, post, 6);
    if (!found) return null;

    let commentBox = await this.markCommentBox(page, {
      preferMarkedPost: true,
      preferDialog: true,
    });
    if (commentBox) return commentBox;

    const clicked = await this.clickCommentTrigger(page, { preferMarkedPost: true });
    if (!clicked) return null;

    await page.waitForTimeout(randomInt(900, 1500));
    commentBox = await this.markCommentBox(page, {
      preferMarkedPost: true,
      preferDialog: true,
    });
    return commentBox;
  }

  async openComposerFromPermalink(page, permalinkUrl) {
    if (!permalinkUrl) return null;
    await page.goto(permalinkUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(randomInt(1200, 2200));

    let commentBox = await this.markCommentBox(page, {
      preferMarkedPost: false,
      preferDialog: true,
    });
    if (commentBox) return commentBox;

    const clicked = await this.clickCommentTrigger(page, { preferMarkedPost: false });
    if (!clicked) return null;

    await page.waitForTimeout(randomInt(900, 1600));
    commentBox = await this.markCommentBox(page, {
      preferMarkedPost: false,
      preferDialog: true,
    });
    return commentBox;
  }

  async markPostInFeed(page, post, maxScrolls = 6) {
    const target = {
      domIndex: Number.isInteger(post?.domIndex) ? post.domIndex : -1,
      postId: String(post?.postId || '').trim(),
      url: String(post?.url || '').trim(),
      textMarker: normalizeText(String(post?.text || '')).slice(0, 120),
    };

    for (let round = 0; round <= maxScrolls; round += 1) {
      const found = await page.evaluate((payload) => {
        const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const matchesPost = (root) => {
          const anchors = Array.from(root.querySelectorAll('a[href]'));
          const hrefs = anchors.map((anchor) => anchor.href || '');
          if (payload.postId) {
            if (hrefs.some((href) => (
              href.includes(`/posts/${payload.postId}`)
              || href.includes(`story_fbid=${payload.postId}`)
              || href.includes(`fbid=${payload.postId}`)
            ))) {
              return true;
            }
          }
          if (payload.url && hrefs.some((href) => href === payload.url)) return true;
          if (payload.textMarker && clean(root.innerText || root.textContent || '').includes(payload.textMarker)) {
            return true;
          }
          return false;
        };

        document.querySelectorAll('[data-codex-post-target="1"]').forEach((node) => {
          node.removeAttribute('data-codex-post-target');
        });
        const feed = document.querySelector('div[role="feed"]');
        const items = feed
          ? Array.from(feed.children).slice(1)
          : Array.from(document.querySelectorAll('div[role="feed"] > *'));

        const preferred = payload.domIndex >= 0 ? items[payload.domIndex] : null;
        if (preferred && matchesPost(preferred)) {
          preferred.setAttribute('data-codex-post-target', '1');
          preferred.scrollIntoView({ block: 'center', behavior: 'instant' });
          return true;
        }

        for (const root of items) {
          if (!root) continue;
          if (!matchesPost(root)) continue;
          root.setAttribute('data-codex-post-target', '1');
          root.scrollIntoView({ block: 'center', behavior: 'instant' });
          return true;
        }
        return false;
      }, target).catch(() => false);

      if (found) {
        await page.waitForTimeout(randomInt(450, 900));
        return true;
      }

      if (round < maxScrolls) {
        await page.mouse.wheel(0, randomInt(700, 1100)).catch(() => {});
        await page.waitForTimeout(randomInt(900, 1600));
      }
    }

    return false;
  }

  async markCommentBox(page, { preferMarkedPost = true, preferDialog = true } = {}) {
    const found = await page.evaluate(({ preferMarkedPost, preferDialog }) => {
      const keywords = ['bình luận', 'trả lời', 'viết', 'comment', 'reply', 'write'];
      const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const isVisible = (element) => {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        if (!style || style.visibility === 'hidden' || style.display === 'none') return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const matches = (element) => {
        if (!element || !isVisible(element)) return false;
        const label = clean(
          element.getAttribute('aria-label')
          || element.getAttribute('aria-placeholder')
          || element.getAttribute('placeholder')
        ).toLowerCase();
        const editable = element.getAttribute('contenteditable');
        const role = element.getAttribute('role');
        if (role === 'textbox' && label && keywords.some((keyword) => label.includes(keyword))) {
          return true;
        }
        if (editable !== 'true') return false;
        if (label && keywords.some((keyword) => label.includes(keyword))) return true;
        const markedPost = document.querySelector('[data-codex-post-target="1"]');
        return !!element.closest('[role="dialog"]') || (!!markedPost && markedPost.contains(element));
      };
      const findInRoot = (root) => {
        if (!root) return null;
        const all = Array.from(root.querySelectorAll('[role="textbox"], [contenteditable="true"]'));
        return all.find(matches) || null;
      };

      document.querySelectorAll('[data-codex-comment-target="1"]').forEach((node) => {
        node.removeAttribute('data-codex-comment-target');
      });

      const roots = [];
      if (preferDialog) {
        roots.push(
          ...Array.from(document.querySelectorAll('[role="dialog"]')).filter(isVisible).reverse(),
        );
      }
      if (preferMarkedPost) {
        const markedPost = document.querySelector('[data-codex-post-target="1"]');
        if (markedPost) roots.push(markedPost);
      }
      roots.push(document);

      for (const root of roots) {
        const commentBox = findInRoot(root);
        if (!commentBox) continue;
        commentBox.setAttribute('data-codex-comment-target', '1');
        commentBox.scrollIntoView({ block: 'center', behavior: 'instant' });
        commentBox.focus();
        return true;
      }

      return false;
    }, { preferMarkedPost, preferDialog }).catch(() => false);

    if (!found) return null;
    const locator = page.locator('[data-codex-comment-target="1"]').first();
    return (await locator.count().catch(() => 0)) ? locator : null;
  }

  async clickCommentTrigger(page, { preferMarkedPost = true } = {}) {
    return page.evaluate(({ preferMarkedPost }) => {
      const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const isVisible = (element) => {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        if (!style || style.visibility === 'hidden' || style.display === 'none') return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const clickWithin = (root) => {
        if (!root) return false;
        const items = Array.from(root.querySelectorAll('[role="button"], button, a[role="link"], a'));
        for (const node of items) {
          if (!isVisible(node)) continue;
          const label = clean(
            node.getAttribute('aria-label')
            || node.getAttribute('aria-placeholder')
            || node.textContent
          );
          if (!/(^|\s)(Bình luận|Comment)(\s|$)/i.test(label) && !/Bình luận về bài viết|Comment on this post/i.test(label)) {
            continue;
          }
          node.scrollIntoView({ block: 'center', behavior: 'instant' });
          node.click();
          return true;
        }
        return false;
      };

      if (preferMarkedPost) {
        const markedPost = document.querySelector('[data-codex-post-target="1"]');
        if (clickWithin(markedPost)) return true;
      }
      return clickWithin(document);
    }, { preferMarkedPost }).catch(() => false);
  }

  async typeCommentIntoBox(page, commentBox, commentText) {
    const handle = await commentBox.elementHandle().catch(() => null);
    if (!handle) return false;

    const inserted = await handle.evaluate((element, text) => {
      const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      try {
        element.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('delete', false);
        document.execCommand('insertText', false, text);
        element.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          data: text,
          inputType: 'insertText',
        }));
        return clean(element.innerText || element.textContent || '') === clean(text);
      } catch (error) {
        return false;
      }
    }, commentText).catch(() => false);

    if (inserted) return true;

    await commentBox.click({ timeout: 2000 }).catch(() => {});
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${mod}+A`).catch(() => {});
    await page.keyboard.press('Backspace').catch(() => {});
    await page.keyboard.type(commentText, { delay: randomInt(15, 35) }).catch(() => {});
    await page.waitForTimeout(400);

    const current = await handle.evaluate((element) => (
      String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim()
    )).catch(() => '');
    return normalizeText(current) === normalizeText(commentText);
  }

  async checkSubmittedCommentStatus(page, commentText, timeoutMs = 20000) {
    const marker = buildCommentMarker(commentText);
    const deadline = Date.now() + timeoutMs;
    let lastStatus = 'unknown';

    while (Date.now() < deadline) {
      const status = await page.evaluate((textMarker) => {
        const marker = textMarker || '';
        const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const hasAny = (value, needles) => needles.some((needle) => value.includes(needle));
        const articles = Array.from(document.querySelectorAll('[role="article"]'));

        const findArticle = () => {
          if (marker) {
            let matched = null;
            for (const article of articles) {
              const text = clean(article.textContent || '');
              if (text.includes(marker)) matched = article;
            }
            if (matched) return matched;
          }
          const recent = articles.filter((article) => {
            const label = clean(article.getAttribute('aria-label') || '').toLowerCase();
            return label.includes('vài giây trước') || label.includes('just now');
          });
          return recent.at(-1) || null;
        };

        const article = findArticle();
        const bodyText = clean(document.body?.textContent || '');
        if (hasAny(bodyText, [
          'Để bảo vệ cộng đồng khỏi spam',
          'Giờ bạn chưa dùng được tính năng này',
          'Không thể đăng bình luận của bạn',
          "You Can't Use This Feature Right Now",
          "You're Temporarily Blocked",
        ])) {
          return 'blocked';
        }

        if (article) {
          let scope = article;
          let node = article;
          for (let up = 0; up < 5 && node.parentElement; up += 1) {
            node = node.parentElement;
            if (node.querySelectorAll('[role="article"]').length > 1) break;
            const text = clean(node.textContent || '');
            if (hasAny(text, ['Đang chờ', 'chờ phê duyệt', 'Bị từ chối', 'Không đăng được', 'Pending', 'Rejected'])) {
              scope = node;
              break;
            }
          }
          const text = clean(scope.textContent || '');
          if (hasAny(text, ['Đang viết', 'Đang đăng', 'Đang gửi', 'Posting', 'Sending'])) {
            return 'sending';
          }
          if (hasAny(text, ['Bị từ chối', 'Không đăng được', 'Removed', 'Rejected'])) {
            return 'rejected';
          }
          if (hasAny(text, ['Đang chờ', 'chờ phê duyệt', 'Pending', 'pending'])) {
            return 'pending';
          }
          if (scope.closest('[data-commentid]') || article.querySelector('a[href*="comment_id="]')) {
            return 'posted';
          }
          const actionText = clean((article.querySelector('ul.html-ul, ul[class*="html-ul"]') || article).textContent || '');
          if (hasAny(actionText, ['Thích', 'Trả lời', 'Like', 'Reply'])) {
            return 'posted';
          }
        }

        const alerts = Array.from(document.querySelectorAll('[role="alert"], [role="status"]'));
        const hasRetryError = alerts.some((node) => {
          const text = clean(node.textContent || '');
          return text.length < 160 && hasAny(text, [
            'Có lỗi xảy ra',
            'Đã xảy ra lỗi',
            'Hãy thử lại',
            'Không gửi được',
            'Something went wrong',
          ]);
        });
        if (hasRetryError) return 'error_retry';
        return marker ? 'unknown' : 'posted';
      }, marker).catch(() => 'unknown');

      if (['posted', 'pending', 'rejected', 'blocked', 'error_retry'].includes(status)) {
        return status;
      }
      lastStatus = status || lastStatus;
      await sleep(500);
    }

    return lastStatus === 'sending' ? 'unknown' : lastStatus;
  }

  async clickCommentRetry(page) {
    return page.evaluate(() => {
      const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const items = Array.from(document.querySelectorAll('[role="button"], button, a, span'));
      for (const node of items) {
        const text = clean(node.textContent || '');
        if (!text || text.length > 20) continue;
        if (!['Thử lại', 'Try again'].some((label) => text.includes(label))) continue;
        const target = node.closest('[role="button"], button, a') || node;
        target.click();
        return true;
      }
      return false;
    }).catch(() => false);
  }

  async deleteCommentByMarker(page, commentText) {
    const marker = buildCommentMarker(commentText);
    if (!marker) return false;

    const opened = await page.evaluate((textMarker) => {
      const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const isVisible = (element) => {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        if (!style || style.visibility === 'hidden' || style.display === 'none') return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const articles = Array.from(document.querySelectorAll('[role="article"]'));
      let article = null;
      for (const candidate of articles) {
        if (clean(candidate.textContent || '').includes(textMarker)) article = candidate;
      }
      if (!article) return false;

      let scope = article;
      for (let up = 0; up < 4 && scope; up += 1) {
        const button = Array.from(
          scope.querySelectorAll('[aria-haspopup="menu"][role="button"], button[aria-haspopup="menu"], [aria-label*="bình luận này"], [aria-label*="comment"]'),
        ).find(isVisible);
        if (button) {
          button.scrollIntoView({ block: 'center', behavior: 'instant' });
          button.click();
          return true;
        }
        scope = scope.parentElement;
      }
      return false;
    }, marker).catch(() => false);

    if (!opened) return false;
    await sleep(800);

    const clickedDelete = await page.evaluate(() => {
      const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const isVisible = (element) => {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        if (!style || style.visibility === 'hidden' || style.display === 'none') return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const candidates = Array.from(document.querySelectorAll('[role="menuitem"], [role="button"], button, div[role="button"]'));
      for (const node of candidates) {
        if (!isVisible(node)) continue;
        const text = clean(
          node.getAttribute('aria-label')
          || node.getAttribute('aria-description')
          || node.textContent
        ).toLowerCase();
        if (!text) continue;
        if (!text.includes('xóa') && !text.includes('delete')) continue;
        node.click();
        return true;
      }
      return false;
    }).catch(() => false);

    if (!clickedDelete) return false;
    await sleep(900);

    await page.evaluate(() => {
      const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const isVisible = (element) => {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        if (!style || style.visibility === 'hidden' || style.display === 'none') return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const buttons = Array.from(document.querySelectorAll('[role="button"], button'));
      for (const node of buttons) {
        if (!isVisible(node)) continue;
        const text = clean(
          node.getAttribute('aria-label')
          || node.getAttribute('aria-description')
          || node.textContent
        ).toLowerCase();
        if (!text) continue;
        if (
          text === 'xóa'
          || text === 'delete'
          || text.includes('xóa bình luận')
          || text.includes('delete comment')
        ) {
          node.click();
          return true;
        }
      }
      return false;
    }).catch(() => false);

    await sleep(900);
    return true;
  }
}

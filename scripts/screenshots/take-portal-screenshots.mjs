#!/usr/bin/env node
/**
 * FieldOps customer portal screenshots (Playwright + Chromium).
 *
 * Opens the company's public page and the customer's own pages (visits, visit tracking, invoices, profile)
 * and saves one PNG per page into ./screenshots, numbered after the admin shots (20_… to 30_…).
 * Nothing in the application is changed: animations are switched off and toasts hidden only inside the
 * automated browser.
 *
 * Sign-in: the portal signs in with a one-time code. The first run fills in the phone, then asks you to type
 * the code you received (WhatsApp/SMS) in this console. The session is saved to portal-session.json (git-ignored)
 * and reused on later runs until it expires (30 days), so you type the code only once.
 *
 * Settings: in capture.settings next to this script (same file as the admin script), or environment variables.
 *   FO_PORTAL_URL       portal URL                         default https://field-ops.duckdns.org
 *   FO_SLUG             company link name (required)       e.g. clean-co  →  https://field-ops.duckdns.org/clean-co
 *   FO_CUSTOMER_PHONE   customer's phone (required for the signed-in pages; use one with demo visits & invoices)
 *   FO_LANG             ar | en                            default ar
 *   FO_OUT              output directory                   default ./screenshots
 *   FO_FULL_PAGE        1 = capture the whole page height for long pages; default 0 = viewport-size frames
 *   FO_ONLY             comma-separated numbers, e.g. "26,28"
 *   FO_HEADED           1 = show the browser while it works
 *   FO_BROWSER          chrome | msedge = use the installed Chrome/Edge instead of Playwright's Chromium
 */
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

// Login and options from capture.settings (or .env) next to this script; real environment variables win.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = ['capture.settings', '.env'].map((f) => path.join(HERE, f)).find((f) => existsSync(f))
  || path.join(HERE, 'capture.settings');
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

// ------------------------------------------------------------------------------------------------ settings
const BASE = (process.env.FO_PORTAL_URL || 'https://field-ops.duckdns.org').replace(/\/+$/, '');
const SLUG = (process.env.FO_SLUG || '').trim();
const PHONE = (process.env.FO_CUSTOMER_PHONE || '').trim();
const LANG = process.env.FO_LANG === 'en' ? 'en' : 'ar';
const OUT = path.resolve(HERE, process.env.FO_OUT || 'screenshots');
const FULL_PAGE = process.env.FO_FULL_PAGE === '1';
const ONLY = (process.env.FO_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const HEADED = process.env.FO_HEADED === '1';
const CHANNEL = process.env.FO_BROWSER || undefined;
const SESSION_FILE = path.join(HERE, 'portal-session.json');
const SESSION_KEY = `pt.session.${SLUG.toLowerCase()}`;

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const PAGE_TIMEOUT = 45_000;
const RETRIES = 2;

if (!SLUG) {
  console.error(`Set FO_SLUG (the company's link name, the part after the portal address) in ${ENV_FILE}.`);
  process.exit(2);
}

/**
 * The shots, in video order. `url` is a path under /{slug} (or a function of the ids found after sign-in).
 * `signedIn`: needs the customer's session. `long`: full height is captured when FO_FULL_PAGE=1.
 */
const SHOTS = [
  { n: '20', file: '20_portal_company-page_desktop.png', url: '', long: true },
  { n: '21', file: '21_portal_company-page_mobile.png', url: '', mobile: true, long: true },
  { n: '22', file: '22_portal_services_mobile.png', url: '/services', mobile: true, long: true },
  { n: '23', file: '23_portal_book-service_mobile.png', url: '/book', mobile: true, long: true },
  { n: '24', file: '24_portal_login_mobile.png', url: '/login', mobile: true, ready: '#ph' },
  { n: '25', file: '25_portal_my-visits_mobile.png', url: '/bookings', mobile: true, signedIn: true, long: true },
  { n: '26', file: '26_portal_visit-tracking_mobile.png', url: (ids) => `/bookings/${ids.booking}`, needs: 'booking',
    mobile: true, signedIn: true, long: true },
  { n: '27', file: '27_portal_invoices_mobile.png', url: '/invoices', mobile: true, signedIn: true, long: true },
  { n: '28', file: '28_portal_invoice-details_mobile.png', url: (ids) => `/invoices/${ids.invoice}`, needs: 'invoice',
    mobile: true, signedIn: true, long: true },
  { n: '29', file: '29_portal_profile_mobile.png', url: '/profile', mobile: true, signedIn: true },
  { n: '30', file: '30_portal_book-service_desktop.png', url: '/book', long: true },
];

// Inside the automated browser only: no animations/transitions, no blinking caret, no toasts.
const FREEZE_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important; animation-delay: 0s !important; animation-iteration-count: 1 !important;
    transition-duration: 0s !important; transition-delay: 0s !important; scroll-behavior: auto !important;
    caret-color: transparent !important;
  }
  pt-toasts { display: none !important; }
`;

const LOADING_SELECTORS = ['.pi-spin', '.spinner', '.loading', '.p-skeleton', '[aria-busy="true"]'];
const ERROR_TEXTS = LANG === 'ar'
  ? ['حدث خطأ', 'الصفحة غير موجودة', 'غير متاحة']
  : ['Something went wrong', 'Page not found', 'not available'];

// ------------------------------------------------------------------------------------------------ helpers
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const portalUrl = (p) => (/^https?:\/\//.test(p) ? p : `${BASE}/${encodeURIComponent(SLUG)}${p}`);

async function newContext(browser, { mobile = false, session = null } = {}) {
  const context = await browser.newContext({
    viewport: mobile ? MOBILE : DESKTOP,
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    locale: LANG === 'ar' ? 'ar-SA' : 'en-US',
    timezoneId: 'Asia/Riyadh',
    reducedMotion: 'reduce',
    colorScheme: 'light',
    userAgent: mobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : undefined,
  });
  await context.addInitScript(({ lang, css }) => {
    try { localStorage.setItem('pt.lang', lang); } catch { /* ignore */ }
    const add = () => {
      if (document.getElementById('fo-shot-freeze')) return;
      const s = document.createElement('style');
      s.id = 'fo-shot-freeze';
      s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
    else add();
  }, { lang: LANG, css: FREEZE_CSS });
  if (session) {
    await context.addInitScript(({ key, value }) => { try { localStorage.setItem(key, value); } catch {} },
      { key: SESSION_KEY, value: session });
  }
  return context;
}

/** A saved session that is still valid for at least a day, or null. */
async function savedSession() {
  if (!existsSync(SESSION_FILE)) return null;
  try {
    const all = JSON.parse(await readFile(SESSION_FILE, 'utf8'));
    // Either the value copied from the browser ({"token": ...}) or the file this script writes ({slug: "..."}).
    const raw = all.token ? JSON.stringify(all) : all[SLUG.toLowerCase()];
    if (!raw) return null;
    const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!s.token || s.needsName || new Date(s.expiresAt).getTime() < Date.now() + 24 * 3600_000) return null;
    if (PHONE && s.phone && s.phone.replace(/\D/g, '').slice(-9) !== PHONE.replace(/\D/g, '').slice(-9)) return null;
    return raw;
  } catch {
    return null;
  }
}

async function saveSession(raw) {
  let all = {};
  try { all = JSON.parse(await readFile(SESSION_FILE, 'utf8')); } catch { /* new file */ }
  all[SLUG.toLowerCase()] = raw;
  await writeFile(SESSION_FILE, JSON.stringify(all, null, 2));
}

/** Signs the customer in with a one-time code typed in this console; returns the stored session JSON. */
async function signIn(browser) {
  if (!PHONE) {
    throw new Error('No saved session: set FO_CUSTOMER_PHONE, or paste the pt.session value from your browser into portal-session.json.');
  }
  const context = await newContext(browser, { mobile: true });
  const page = await context.newPage();
  try {
    log('Signing in to the portal as', PHONE);
    await page.goto(portalUrl('/login'), { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
    await page.locator('#ph').fill(PHONE);
    await page.locator('form button.btn-primary').click();
    const codeBox = page.locator('#cd');
    try {
      await codeBox.waitFor({ state: 'visible', timeout: PAGE_TIMEOUT });
    } catch {
      const err = await page.locator('.err').innerText().catch(() => '');
      throw new Error(`The code was not sent${err ? `: ${err}` : ''}. Is this phone a customer of the company?`);
    }

    // Local/dev servers show the code on the page; otherwise ask for it.
    let code = (await page.locator('.dev strong').innerText({ timeout: 1500 }).catch(() => '')).replace(/\D/g, '');
    if (code.length !== 6) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      code = (await rl.question(`\nEnter the 6-digit code sent to ${PHONE}: `)).replace(/\D/g, '');
      rl.close();
    }
    if (code.length !== 6) throw new Error('The code must be 6 digits.');
    await codeBox.fill(code); // 6 digits submit by themselves

    // Wait until the session is stored (verify done) or an error shows.
    const deadline = Date.now() + PAGE_TIMEOUT;
    for (;;) {
      const raw = await page.evaluate((k) => localStorage.getItem(k), SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.needsName) {
          throw new Error('This phone has no customer name yet. Use a customer that already exists (e.g. one from the demo data).');
        }
        await saveSession(raw);
        log('Signed in; session saved to portal-session.json');
        return raw;
      }
      const err = await page.locator('.err').innerText().catch(() => '');
      if (err) throw new Error(`Sign-in failed: ${err}`);
      if (Date.now() > deadline) throw new Error('Sign-in did not finish in time.');
      await page.waitForTimeout(300);
    }
  } finally {
    await context.close();
  }
}

/** Ids for the detail shots, read from the portal API inside a signed-in page (browser certificates apply). */
async function lookUpIds(context, session) {
  const page = await context.newPage();
  try {
    await page.goto(portalUrl(''), { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
    const token = JSON.parse(session).token;
    const api = (p) => page.evaluate(async ({ url, token }) => {
      try {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        return r.ok ? await r.json() : null;
      } catch { return null; }
    }, { url: `${BASE}/api/portal/${encodeURIComponent(SLUG)}${p}`, token });

    const ids = {};
    // Visit tracking looks best on a live visit: in progress, then on the way, then any upcoming, then the latest past.
    const upcoming = (await api('/bookings?scope=upcoming')) || [];
    const past = (await api('/bookings?scope=past')) || [];
    const rank = ['IN_PROGRESS', 'ON_THE_WAY', 'ASSIGNED', 'CONFIRMED'];
    const live = [...upcoming].sort((a, b) => {
      const ra = rank.indexOf(a.status), rb = rank.indexOf(b.status);
      return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
    })[0];
    ids.booking = (live || past[0])?.id;

    const invoices = (await api('/invoices')) || [];
    ids.invoice = (invoices.find((i) => i.status === 'PAID') || invoices[0])?.id;

    log('Found:', ids.booking ? `visit ${ids.booking}` : 'no visit', '|', ids.invoice ? `invoice ${ids.invoice}` : 'no invoice');
    return ids;
  } finally {
    await page.close();
  }
}

/** Scrolls to the bottom and back so lazy images load before a full-page capture. */
async function loadLazyContent(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
}

async function waitUntilSettled(page, shot) {
  await page.waitForLoadState('networkidle', { timeout: PAGE_TIMEOUT }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  const ready = shot.ready || '.main > *';
  await page.locator(`${ready}, .gone`).first().waitFor({ state: 'visible', timeout: PAGE_TIMEOUT }).catch(() => {
    throw new Error(`content "${ready}" did not appear`);
  });
  if (await page.locator('.gone').isVisible().catch(() => false)) {
    throw new Error(`company page not found: check FO_SLUG ("${SLUG}") and that the plan includes the customer portal`);
  }
  const deadline = Date.now() + PAGE_TIMEOUT;
  for (;;) {
    const busy = await page.evaluate((sels) => sels.some((s) =>
      [...document.querySelectorAll(s)].some((el) => {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
      })), LOADING_SELECTORS);
    if (!busy) break;
    if (Date.now() > deadline) throw new Error('still loading after timeout (spinner visible)');
    await page.waitForTimeout(250);
  }
  if (FULL_PAGE && shot.long) {
    await loadLazyContent(page);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  }
  await page.evaluate(async () => {
    await Promise.all([...document.images].filter((i) => !i.complete).map((i) =>
      new Promise((res) => { i.onload = i.onerror = res; })));
  }).catch(() => {});
  await page.waitForTimeout(600);

  const pathname = new URL(page.url()).pathname;
  if (shot.signedIn && pathname.endsWith('/login')) throw new Error('sent to the login page (session expired: delete portal-session.json)');
  const text = await page.locator('body').innerText().catch(() => '');
  const hit = ERROR_TEXTS.find((t) => text.includes(t));
  if (hit) throw new Error(`error text on the page: "${hit}"`);
}

async function capture(context, shot, ids) {
  if (shot.needs && !ids[shot.needs]) throw new Error(`skipped: this customer has no ${shot.needs} (run the demo data scripts)`);
  const page = await context.newPage();
  page.setDefaultTimeout(PAGE_TIMEOUT);
  try {
    const raw = typeof shot.url === 'function' ? shot.url(ids) : shot.url;
    await page.goto(portalUrl(raw), { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
    await waitUntilSettled(page, shot);
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: path.join(OUT, shot.file),
      type: 'png',
      fullPage: FULL_PAGE && !!shot.long,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    });
  } finally {
    await page.close();
  }
}

// ------------------------------------------------------------------------------------------------ main
async function main() {
  await mkdir(OUT, { recursive: true });
  // FO_ONLY numbers that belong to the admin script (01–19) are ignored here.
  const mine = ONLY.filter((n) => SHOTS.some((s) => s.n === n));
  if (ONLY.length && !mine.length) log(`FO_ONLY=${ONLY.join(',')} has no portal shots (20–30): taking all portal shots.`);
  const todo = SHOTS.filter((s) => !mine.length || mine.includes(s.n));
  const browser = await chromium.launch({ headless: !HEADED, channel: CHANNEL });
  const results = [];
  try {
    let session = null;
    let ids = {};
    if (todo.some((s) => s.signedIn)) {
      session = (await savedSession()) || (await signIn(browser));
    }

    // Public pages: no session, so they look like a first-time visitor's.
    const pubDesktop = await newContext(browser);
    const pubMobile = await newContext(browser, { mobile: true });
    const meMobile = session ? await newContext(browser, { mobile: true, session }) : null;
    if (meMobile) ids = await lookUpIds(meMobile, session);

    for (const shot of todo) {
      const ctx = shot.signedIn ? meMobile : shot.mobile ? pubMobile : pubDesktop;
      let lastError;
      for (let attempt = 1; attempt <= RETRIES + 1; attempt++) {
        try {
          await capture(ctx, shot, ids);
          log(`✔ ${shot.file}`);
          results.push({ shot, ok: true });
          lastError = null;
          break;
        } catch (e) {
          lastError = e;
          if (String(e.message).startsWith('skipped')) break;
          log(`… ${shot.file}: ${e.message.split('\n')[0]} (attempt ${attempt}/${RETRIES + 1})`);
        }
      }
      if (lastError) {
        log(`✘ ${shot.file}: ${lastError.message.split('\n')[0]}`);
        results.push({ shot, ok: false, error: lastError.message.split('\n')[0] });
      }
    }
    await pubDesktop.close();
    await pubMobile.close();
    if (meMobile) await meMobile.close();
  } finally {
    await browser.close();
  }

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} screenshots saved in ${OUT}`);
  for (const r of results.filter((x) => !x.ok)) console.log(`  missing ${r.shot.file}: ${r.error}`);
  process.exit(ok === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error('\n' + (e?.message || e));
  process.exit(1);
});

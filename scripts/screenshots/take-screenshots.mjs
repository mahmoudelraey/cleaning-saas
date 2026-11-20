#!/usr/bin/env node
/**
 * FieldOps admin screenshots (Playwright + Chromium).
 *
 * Signs in as the company owner, opens every admin page and saves one PNG per page into ./screenshots
 * with fixed file names (01_admin_dashboard_desktop.png … 19_admin_settings-public-page_desktop.png).
 * Nothing in the application is changed: animations are switched off and toasts hidden only inside the
 * automated browser.
 *
 * Usage (from the repository root):
 *   npm --prefix scripts/screenshots install
 *   npx --prefix scripts/screenshots playwright install chromium
 *   FO_PHONE=05XXXXXXXX FO_PASSWORD='...' node scripts/screenshots/take-screenshots.mjs
 *
 * Settings (environment variables):
 *   FO_BASE_URL   admin app URL                 default https://app.field-ops.duckdns.org
 *   FO_PHONE      owner's phone (required)
 *   FO_PASSWORD   owner's password (required)
 *   FO_LANG       ar | en                       default ar
 *   FO_OUT        output directory              default ./screenshots
 *   FO_FULL_PAGE  1 = capture the whole page height for long pages (lists, reports); default 0 = 1440×900 frames
 *   FO_ONLY       comma-separated numbers to capture only some shots, e.g. "04,10"
 *   FO_HEADED     1 = show the browser while it works
 *   FO_BROWSER    chrome | msedge = use the installed Chrome/Edge (no Playwright browser download needed)
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
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
const BASE = (process.env.FO_BASE_URL || 'https://app.field-ops.duckdns.org').replace(/\/+$/, '');
const PHONE = process.env.FO_PHONE;
const PASSWORD = process.env.FO_PASSWORD;
const LANG = process.env.FO_LANG === 'en' ? 'en' : 'ar';
const OUT = path.resolve(HERE, process.env.FO_OUT || 'screenshots');
const FULL_PAGE = process.env.FO_FULL_PAGE === '1';
const ONLY = (process.env.FO_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const HEADED = process.env.FO_HEADED === '1';
// chrome | msedge = use the browser already installed on this PC instead of Playwright's own Chromium.
const CHANNEL = process.env.FO_BROWSER || undefined;

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const PAGE_TIMEOUT = 45_000;
const RETRIES = 2;

if (!PHONE || !PASSWORD) {
  console.error(`Set FO_PHONE and FO_PASSWORD (the company owner's login) in ${ENV_FILE} or as environment variables.`);
  process.exit(2);
}

/**
 * The shots, in video order. `url` is a path or a function of the ids looked up after sign-in.
 * `long`: a list/report page whose full height is captured when FO_FULL_PAGE=1.
 * `scrollTo`: text of a section heading to bring to the top before capturing.
 */
const SHOTS = [
  { n: '01', file: '01_admin_dashboard_desktop.png', url: '/dashboard', ready: 'main.content .panel' },
  { n: '02', file: '02_admin_calendar-week_desktop.png', url: '/calendar' },
  { n: '03', file: '03_admin_bookings-list_desktop.png', url: '/bookings', long: true, ready: 'table tbody tr' },
  { n: '04', file: '04_admin_booking-details_desktop.png', url: (ids) => `/bookings/${ids.booking}`, needs: 'booking' },
  { n: '05', file: '05_admin_customers_desktop.png', url: '/customers', long: true, ready: 'table tbody tr' },
  { n: '06', file: '06_admin_services-options_desktop.png', url: '/services', long: true, ready: 'table tbody tr' },
  { n: '07', file: '07_admin_technicians_desktop.png', url: '/technicians', long: true, ready: 'table tbody tr' },
  { n: '08', file: '08_admin_quotes_desktop.png', url: '/quotes', long: true, ready: 'table tbody tr' },
  { n: '09', file: '09_admin_invoices_desktop.png', url: '/invoices', long: true, ready: 'table tbody tr' },
  { n: '10', file: '10_admin_invoice-zatca_mobile.png', url: (ids) => ids.invoiceLink, needs: 'invoiceLink', mobile: true, public: true, long: true },
  { n: '11', file: '11_admin_promos_desktop.png', url: '/promos', long: true, ready: 'table tbody tr' },
  { n: '12', file: '12_admin_reviews_desktop.png', url: '/reviews', long: true },
  { n: '13', file: '13_admin_contact-requests_desktop.png', url: '/contact-requests', long: true },
  { n: '14', file: '14_admin_messages-log_desktop.png', url: '/messages', long: true },
  { n: '15', file: '15_admin_reports_desktop.png', url: '/reports', long: true, ready: 'canvas' },
  { n: '16', file: '16_admin_sales_desktop.png', url: '/sales', long: true, ready: 'canvas' },
  { n: '17', file: '17_admin_finance_desktop.png', url: '/finance', long: true },
  { n: '18', file: '18_admin_payroll_desktop.png', url: '/payroll', long: true, ready: 'table tbody tr' },
  { n: '19', file: '19_admin_settings-public-page_desktop.png', url: '/settings',
    scrollTo: LANG === 'ar' ? 'الصفحة العامة' : 'Public page' },
];

// Inside the automated browser only: no animations/transitions, no blinking caret, no toasts.
const FREEZE_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important; animation-delay: 0s !important; animation-iteration-count: 1 !important;
    transition-duration: 0s !important; transition-delay: 0s !important; scroll-behavior: auto !important;
    caret-color: transparent !important;
  }
  .p-toast, .p-toast-message { display: none !important; }
`;

// Anything that means "not ready yet" or "something went wrong".
const LOADING_SELECTORS = ['.pi-spin', '.p-skeleton', '.p-progressspinner', '.p-datatable-loading-overlay',
  '.p-button-loading', '[aria-busy="true"]'];
const ERROR_TEXTS = LANG === 'ar'
  ? ['حدث خطأ', 'تعذر', 'غير موجود', 'الصفحة غير موجودة']
  : ['Something went wrong', 'could not', 'Not found', 'Page not found'];

// ------------------------------------------------------------------------------------------------ helpers
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function newContext(browser, { mobile = false, token = null } = {}) {
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
  // Language, week view in the calendar, and the frozen look, before any app script runs.
  await context.addInitScript(({ lang, css }) => {
    try {
      localStorage.setItem('fieldops.lang', lang);
      localStorage.setItem('fieldops.calendarView', 'week');
      localStorage.setItem('fieldops.lastActivity', String(Date.now())); // keep the idle timer happy
    } catch { /* storage blocked: ignore */ }
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
  if (token) await context.addInitScript((t) => { try { localStorage.setItem('fieldops.session', t); } catch {} }, token);
  return context;
}

async function signIn(page) {
  log('Signing in at', `${BASE}/login`);
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
  await page.locator('#identifier').fill(PHONE);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('p-button.submit button, button[type="submit"]').first().click();
  try {
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: PAGE_TIMEOUT });
  } catch {
    throw new Error('Sign-in failed: check FO_PHONE / FO_PASSWORD (still on the login page).');
  }
  if (new URL(page.url()).pathname.startsWith('/change-password')) {
    throw new Error('This account must change its password first: sign in once in a normal browser.');
  }
  const session = await page.evaluate(() => localStorage.getItem('fieldops.session'));
  if (!session) throw new Error('Signed in but no session was stored.');
  return session;
}

/**
 * Ids the detail shots need, read from the API with the owner's token.
 * The calls run inside the signed-in page, so they go through the browser's network stack and certificate store
 * (works behind company proxies that re-sign HTTPS, where Node's own requests fail).
 */
async function lookUpIds(page, session) {
  const token = JSON.parse(session).accessToken;
  const api = (p, method = 'GET') => page.evaluate(async ({ url, method, token }) => {
    try {
      const r = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: method === 'POST' ? '{}' : undefined,
      });
      return { ok: r.ok, status: r.status, body: r.ok ? await r.json().catch(() => null) : null };
    } catch (e) {
      return { ok: false, status: 0, body: null };
    }
  }, { url: `${BASE}${p}`, method, token });
  const ids = {};

  // Booking details: today's visit in progress, else on the way, else assigned, else the newest booking.
  for (const status of ['IN_PROGRESS', 'ON_THE_WAY', 'ASSIGNED', null]) {
    const q = new URLSearchParams({ page: '0', size: '1', order: 'desc' });
    if (status) q.append('status', status);
    const r = await api(`/api/v1/bookings?${q}`);
    const item = r.ok ? r.body?.items?.[0] : null;
    if (item?.id) { ids.booking = item.id; break; }
  }

  // Customer invoice page: a paid invoice (else any), opened through its public share link.
  for (const status of ['PAID', null]) {
    const q = new URLSearchParams({ page: '0', size: '1' });
    if (status) q.append('status', status);
    const r = await api(`/api/v1/invoices?${q}`);
    const inv = r.ok ? r.body?.items?.[0] : null;
    if (!inv?.id) continue;
    const link = await api(`/api/v1/invoices/${inv.id}/link`, 'POST');
    if (link.ok && link.body?.url) {
      const url = link.body.url;
      ids.invoiceLink = url.startsWith('http') ? url : `${BASE}${url}`;
      break;
    }
  }
  log('Found:', ids.booking ? `booking ${ids.booking}` : 'no booking', '|',
    ids.invoiceLink ? 'invoice link ok' : 'no invoice');
  return ids;
}

/** Waits until the page shows real content: network quiet, fonts loaded, no spinners/skeletons, no errors. */
async function waitUntilSettled(page, shot) {
  await page.waitForLoadState('networkidle', { timeout: PAGE_TIMEOUT }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  if (shot.ready) {
    await page.locator(shot.ready).first().waitFor({ state: 'visible', timeout: PAGE_TIMEOUT }).catch(() => {
      throw new Error(`content "${shot.ready}" did not appear`);
    });
  }
  // Spinners / skeletons gone (polls; Angular may render them after the first paint).
  const deadline = Date.now() + PAGE_TIMEOUT;
  for (;;) {
    const busy = await page.evaluate((sels) => sels.some((s) =>
      [...document.querySelectorAll(s)].some((el) => {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
      })), LOADING_SELECTORS);
    if (!busy) break;
    if (Date.now() > deadline) throw new Error('still loading after timeout (spinner or skeleton visible)');
    await page.waitForTimeout(250);
  }
  // Charts finish drawing and images decode.
  await page.evaluate(async () => {
    await Promise.all([...document.images].filter((i) => !i.complete).map((i) =>
      new Promise((res) => { i.onload = i.onerror = res; })));
  }).catch(() => {});
  await page.waitForTimeout(600);

  if (new URL(page.url()).pathname.startsWith('/login')) throw new Error('redirected to the login page');
  const text = await page.locator('body').innerText().catch(() => '');
  const hit = ERROR_TEXTS.find((t) => text.includes(t));
  if (hit && !shot.public) throw new Error(`error text on the page: "${hit}"`);
}

async function capture(context, shot, ids) {
  if (shot.needs && !ids[shot.needs]) throw new Error(`skipped: no ${shot.needs} found (run the demo data scripts)`);
  const page = await context.newPage();
  page.setDefaultTimeout(PAGE_TIMEOUT);
  try {
    const raw = typeof shot.url === 'function' ? shot.url(ids) : shot.url;
    const target = /^https?:\/\//.test(raw) ? raw : `${BASE}${raw}`;
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
    await waitUntilSettled(page, shot);
    if (shot.scrollTo) {
      const heading = page.getByRole('heading', { name: shot.scrollTo, exact: false }).first();
      await heading.waitFor({ state: 'visible', timeout: 10_000 });
      await heading.evaluate((el) => {
        const panel = el.closest('.panel') || el;
        window.scrollTo({ top: panel.getBoundingClientRect().top + window.scrollY - 16, behavior: 'instant' });
      });
      await page.waitForTimeout(300);
    }
    // Move the mouse out of the way so no hover states or tooltips show.
    await page.mouse.move(0, 0);
    const file = path.join(OUT, shot.file);
    await page.screenshot({
      path: file,
      type: 'png',
      fullPage: FULL_PAGE && !!shot.long && !shot.scrollTo,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    });
    return file;
  } finally {
    await page.close();
  }
}

// ------------------------------------------------------------------------------------------------ main
async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: !HEADED, channel: CHANNEL });
  const results = [];
  try {
    // Sign in once on a desktop context; reuse the session everywhere.
    const loginCtx = await newContext(browser);
    const loginPage = await loginCtx.newPage();
    const session = await signIn(loginPage);
    const ids = await lookUpIds(loginPage, session);
    await loginCtx.close();

    const desktop = await newContext(browser, { token: session });
    const mobile = await newContext(browser, { mobile: true }); // public invoice page: no sign-in needed

    const todo = SHOTS.filter((s) => !ONLY.length || ONLY.includes(s.n));
    for (const shot of todo) {
      const ctx = shot.mobile ? mobile : desktop;
      let lastError;
      for (let attempt = 1; attempt <= RETRIES + 1; attempt++) {
        try {
          const file = await capture(ctx, shot, ids);
          log(`✔ ${shot.file}`);
          results.push({ shot, ok: true, file });
          lastError = null;
          break;
        } catch (e) {
          lastError = e;
          if (String(e.message).startsWith('skipped')) break;
          log(`… ${shot.file}: ${e.message} (attempt ${attempt}/${RETRIES + 1})`);
        }
      }
      if (lastError) {
        log(`✘ ${shot.file}: ${lastError.message}`);
        results.push({ shot, ok: false, error: lastError.message });
      }
    }
    await desktop.close();
    await mobile.close();
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

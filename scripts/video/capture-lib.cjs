// Captura de clipes: screencast do Chromium (quadros com timestamp) + log de eventos (mouse, cliques, teclas).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const EXT = path.resolve(__dirname, '../..'); // a extensão é a raiz do repositório
const VW = 1200, VH = 720, DPR = 1.5;
const LANG = process.env.PN_LANG || 'pt-BR';
const DEMO = LANG === 'en' ? 'examples/demo.html' : 'examples/demo.pt-BR.html';

async function capture(name, script, setup) {
  const dir = path.join(__dirname, `clips-${LANG}`, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, 'profiles', name + '-' + Date.now()), {
    headless: true, channel: 'chromium', viewport: { width: VW, height: VH }, deviceScaleFactor: DPR,
    locale: LANG,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--lang=${LANG}`],
    env: { ...process.env, LANGUAGE: LANG.replace('-', '_'), LANG: `${LANG.replace('-', '_')}.UTF-8` },
  });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8765' });
  const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent('serviceworker'));
  const page = await ctx.newPage();
  await page.goto(`http://localhost:8765/${DEMO}`);
  await page.waitForTimeout(900);
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  let n = 0;
  cdp.on('Page.screencastFrame', async (f) => {
    const file = `f${String(n++).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(dir, file), Buffer.from(f.data, 'base64'));
    frames.push({ file, ts: f.metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  const events = [];
  let mx = VW * 0.75, my = VH * 0.8;
  const now = () => Date.now() / 1000;
  const log = (e) => events.push(Object.assign({ ts: now() }, e));
  const api = {
    page, log,
    async move(x, y, ms = 450) {
      const steps = Math.max(6, Math.round(ms / 16));
      const sx = mx, sy = my;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        mx = sx + (x - sx) * e; my = sy + (y - sy) * e;
        await page.mouse.move(mx, my);
        log({ type: 'mouse', x: mx, y: my });
        await page.waitForTimeout(ms / steps);
      }
    },
    async moveTo(sel, fx = .5, fy = .55, ms) {
      const b = await page.locator(sel).first().boundingBox();
      await api.move(b.x + b.width * fx, b.y + b.height * fy, ms);
    },
    async click(mods = []) {
      for (const m of mods) await page.keyboard.down(m);
      log({ type: 'click', x: mx, y: my, mods });
      await page.mouse.click(mx, my);
      for (const m of mods) await page.keyboard.up(m);
    },
    // Os atalhos da extensão são comandos do Chrome, que teclas simuladas não disparam:
    // dispara o mesmo caminho do comando (service worker → aba) e registra a tecla para o vídeo.
    async command(type, label) {
      if (label) log({ type: 'key', combo: label, label });
      await sw.evaluate(async (t) => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await sendToTab(tab, { type: t }); }, type);
    },
    async press(combo, label) { log({ type: 'key', combo, label: label || combo }); await page.keyboard.press(combo); },
    async down(key, label) { log({ type: 'keydown', key, label: label || key }); await page.keyboard.down(key); },
    async up(key) { log({ type: 'keyup', key }); await page.keyboard.up(key); },
    async type(text, delay = 45) {
      for (const ch of text) { log({ type: 'char', ch }); await page.keyboard.type(ch); await page.waitForTimeout(delay); }
    },
    wait: (ms) => page.waitForTimeout(ms),
    clipboard: () => page.evaluate(() => navigator.clipboard.readText()),
    extra: {},
    mark: (label) => log({ type: 'mark', label }),
    shadowRect: (sel) => page.evaluate((s) => { const el = document.querySelector('browser-annotation-root').shadowRoot.querySelector(s); return el ? el.getBoundingClientRect().toJSON() : null; }, sel),
  };
  await page.mouse.move(mx, my);
  if (setup) await setup(api);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, everyNthFrame: 1, maxWidth: VW * DPR, maxHeight: VH * DPR });
  await page.waitForTimeout(400);
  const t0 = now();
  log({ type: 'start' });
  await script(api);
  log({ type: 'end' });
  await page.waitForTimeout(300);
  await cdp.send('Page.stopScreencast');
  await ctx.close();
  fs.writeFileSync(path.join(dir, 'clip.json'), JSON.stringify({ t0, vw: VW, vh: VH, frames, events, extra: api.extra }, null, 0));
  const dur = events[events.length - 1].ts - t0;
  console.log(name, 'frames', frames.length, 'dur', dur.toFixed(2), 'fps≈', (frames.length / dur).toFixed(1));
}
module.exports = { capture, LANG };

// Teste de fumaça end-to-end: carrega a extensão num Chromium real e exercita o fluxo principal.
// Uso: npm install && npm test   (ou: node tests/smoke.mjs)
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demo = fs.readFileSync(path.join(ROOT, 'examples/demo.html'));
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(demo);
});
await new Promise((r) => server.listen(0, r));
const URL = `http://localhost:${server.address().port}/demo.html`;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-notes-'));
const ctx = await chromium.launchPersistentContext(profile, {
  headless: !process.env.HEADED,
  channel: 'chromium',
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
  viewport: { width: 1280, height: 800 },
});

let failed = false;
try {
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(URL).origin });
  if (!ctx.serviceWorkers().length) await ctx.waitForEvent('serviceworker');
  const page = await ctx.newPage();
  let dialogs = 0;
  page.on('dialog', (d) => (dialogs++, d.dismiss()));
  await page.goto(URL);
  await page.waitForTimeout(600);
  const count = (sel) =>
    page.evaluate((s) => document.querySelector('pixel-notes-root')?.shadowRoot.querySelectorAll(s).length ?? -1, sel);

  await page.keyboard.press("Control+'");
  assert.equal(await count('.toolbar'), 1, 'toolbar aparece ao ativar o modo');

  await page.click('[data-testid=cta-primary]');
  await page.waitForTimeout(200);
  assert.equal(dialogs, 0, 'o clique no modo anotação não chega à página');
  assert.equal(await count('.pop textarea'), 1, 'compositor abre');
  await page.keyboard.type('Aumentar o padding do botão');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(800);
  assert.equal(await count('.pin'), 1, 'pin criado');

  await page.reload();
  await page.waitForTimeout(1000);
  assert.equal(await count('.pin'), 1, 'pin persiste após recarregar');
  assert.equal(await count('.pin.orphan'), 0, 'pin reancorado no elemento');

  await page.keyboard.press("Control+Shift+'");
  await page.waitForTimeout(300);
  assert.equal(await count('.panel .card'), 1, 'painel lista o comentário');
  await page.evaluate(() => document.querySelector('pixel-notes-root').shadowRoot.querySelector('.panel-foot .btn.primary').click());
  await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(clip, /Aumentar o padding do botão/);
  assert.match(clip, /data-testid="cta-primary"/);

  await page.evaluate(() => document.querySelector('pixel-notes-root').shadowRoot.querySelector('.panel .card [title="Resolver"]').click());
  await page.waitForTimeout(600);
  assert.equal(await count('.pin'), 0, 'pin some ao resolver');
  console.log('✓ smoke test ok');
} catch (err) {
  failed = true;
  console.error('✗', err.message);
} finally {
  await ctx.close();
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);

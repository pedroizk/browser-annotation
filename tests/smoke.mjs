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
const demo = fs.readFileSync(path.join(ROOT, 'examples/demo.html'), 'utf8');
let html = demo; // trocado durante o teste para simular mudanças no código da página
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise((r) => server.listen(0, r));
const URL = `http://localhost:${server.address().port}/demo.html`;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-annotation-'));
const ctx = await chromium.launchPersistentContext(profile, {
  headless: !process.env.HEADED,
  channel: 'chromium',
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
  viewport: { width: 1280, height: 800 },
});

let failed = false;
try {
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(URL).origin });
  const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent('serviceworker'));
  const page = await ctx.newPage();
  // Os atalhos (Alt+Shift+E / Alt+Shift+L) são comandos do Chrome, que não chegam em modo
  // headless; o teste dispara o mesmo caminho que o comando usa: service worker → aba.
  const command = async (type) => {
    await sw.evaluate(async (t) => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      await sendToTab(tab, { type: t });
    }, type);
    await page.waitForTimeout(300);
  };
  const shortcuts = await sw.evaluate(() => chrome.commands.getAll());
  assert.equal(shortcuts.find((c) => c.name === 'toggle-annotation').shortcut, 'Alt+Shift+E', 'atalho do modo registrado');
  assert.equal(shortcuts.find((c) => c.name === 'toggle-panel').shortcut, 'Alt+Shift+L', 'atalho da lista registrado');
  let dialogs = 0;
  page.on('dialog', (d) => (dialogs++, d.dismiss()));
  await page.goto(URL);
  await page.waitForTimeout(600);
  const count = (sel) =>
    page.evaluate((s) => document.querySelector('browser-annotation-root')?.shadowRoot.querySelectorAll(s).length ?? -1, sel);

  await command('pn:toggle');
  assert.equal(await count('.tb-bar'), 1, 'barra de ações aparece ao ativar o modo');

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

  await command('pn:panel');
  await page.waitForTimeout(300);
  assert.equal(await count('.panel .card'), 1, 'painel lista o comentário');
  await page.evaluate(() => document.querySelector('browser-annotation-root').shadowRoot.querySelector('.panel-foot .btn.primary').click());
  await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(clip, /Aumentar o padding do botão/);
  assert.match(clip, /data-testid="cta-primary"/);

  await page.evaluate(() => document.querySelector('browser-annotation-root').shadowRoot.querySelector('.panel .card [title="Resolver"]').click());
  await page.waitForTimeout(600);
  assert.equal(await count('.pin'), 0, 'pin some ao resolver');

  // Segurar Alt: ativa só enquanto pressionado
  await page.keyboard.press('Escape'); // fecha o painel
  await page.keyboard.press('Escape'); // sai do modo anotação
  await page.waitForTimeout(300);
  const cursorStyle = () => page.evaluate(() => !!document.getElementById('browser-annotation-cursor-style'));
  assert.equal(await cursorStyle(), false, 'modo desligado');
  await page.keyboard.press('Alt'); // toque rápido não ativa
  await page.waitForTimeout(250);
  assert.equal(await cursorStyle(), false, 'toque rápido no Alt não ativa');
  await page.mouse.move(250, 250);
  await page.keyboard.down('Alt');
  await page.waitForTimeout(300);
  assert.equal(await cursorStyle(), true, 'segurar Alt ativa o modo');
  assert.equal(await count('.tb-bar'), 0, 'sem barra no modo momentâneo');
  await page.click('.subtitle');
  await page.waitForTimeout(250);
  await page.keyboard.up('Alt');
  await page.waitForTimeout(200);
  assert.equal(await count('.pop textarea'), 1, 'popover continua aberto depois de soltar o Alt');
  await page.keyboard.type('Comentário segurando Alt');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(700);
  assert.equal(await count('.pin'), 1, 'comentário salvo no modo momentâneo');
  assert.equal(await cursorStyle(), false, 'modo desliga depois de salvar');

  // Impressão digital viva: o componente muda entre um reload e outro
  await command('pn:toggle');
  await page.click('.grid .card:nth-child(2) h3');
  await page.waitForTimeout(250);
  await page.keyboard.type('Trocar o título do card');
  await page.keyboard.press('Control+Enter');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const pinsBefore = await count('.pin');

  html = demo.replace('<h3>Usuários</h3>', '<h3>Usuários ativos</h3>'); // 1ª mudança: texto
  await page.reload();
  await page.waitForTimeout(2000); // reancora e atualiza as pistas
  assert.equal(await count('.pin.orphan'), 0, 'reencontra após trocar o texto');

  html = demo.replace('<h3>Usuários</h3>', '<h3 class="card-title">Usuários ativos nos últimos 30 dias</h3>'); // 2ª mudança
  await page.reload();
  await page.waitForTimeout(1500);
  assert.equal(await count('.pin.orphan'), 0, 'reencontra após a segunda mudança');

  // Reancorar manualmente: o elemento some de vez
  html = demo.replace('<h3>Usuários</h3>', '<h4>Clientes</h4>');
  await page.reload();
  await page.waitForTimeout(1200);
  assert.equal(await count('.pin.orphan'), 1, 'elemento removido vira pin órfão');
  await page.evaluate(() => document.querySelector('browser-annotation-root').shadowRoot.querySelector('.pin.orphan').click());
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('browser-annotation-root').shadowRoot.querySelector('.pop .link-btn').click());
  await page.waitForTimeout(300);
  assert.equal(await count('.relink-banner'), 1, 'faixa de vincular aparece');
  await page.click('.grid .card:nth-child(2) h4');
  await page.waitForTimeout(800);
  assert.equal(await count('.relink-banner'), 0, 'faixa some depois de escolher');
  assert.equal(await count('.pin.orphan'), 0, 'pin volta a ficar ancorado');
  assert.equal(await count('.pin'), pinsBefore, 'nenhum pin a mais');
  await page.reload();
  await page.waitForTimeout(1200);
  assert.equal(await count('.pin.orphan'), 0, 'novo vínculo persiste após recarregar');

  // o texto copiado inclui o texto original
  await command('pn:panel');
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('browser-annotation-root').shadowRoot.querySelector('.panel-foot .btn.primary').click());
  await page.waitForTimeout(300);
  const clip2 = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(clip2, /Texto quando o comentário foi feito: "Usuários"/);
  assert.match(clip2, /Texto visível: "Clientes"/);

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

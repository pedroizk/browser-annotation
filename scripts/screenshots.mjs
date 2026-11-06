// Gera as imagens do README (docs/images/<idioma>/{toolbar,panel,modal}.png) com a extensão real.
// Uso: node scripts/screenshots.mjs            → inglês e português
//      node scripts/screenshots.mjs pt-BR      → só um idioma
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = process.argv.slice(2).length ? process.argv.slice(2) : ['en', 'pt-BR'];

// textos digitados nos comentários de exemplo
const TEXT = {
  en: {
    demo: 'examples/demo.html',
    button: 'Increase the padding and use the brand color',
    card: 'Show the change from last month',
    email: 'Validate the email format before saving',
  },
  'pt-BR': {
    demo: 'examples/demo.pt-BR.html',
    button: 'Aumentar o padding e usar a cor da marca',
    card: 'Mostrar a variação em relação ao mês anterior',
    email: 'Validar o formato do e-mail antes de salvar',
  },
};

// serve a raiz do repositório (a URL aparece no painel: localhost:8765/examples/…)
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(8765, r));

const root = (page) => page.locator('browser-annotation-root');
const sleep = (page, ms) => page.waitForTimeout(ms);

for (const lang of LANGS) {
  const t = TEXT[lang];
  const out = path.join(ROOT, 'docs/images', lang);
  fs.mkdirSync(out, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pn-shots-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: 'chromium',
    deviceScaleFactor: 2,
    viewport: { width: 1280, height: 800 },
    locale: lang,
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, `--lang=${lang}`],
    env: { ...process.env, LANGUAGE: lang.replace('-', '_'), LANG: `${lang.replace('-', '_')}.UTF-8` },
  });
  const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent('serviceworker'));
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.dismiss());
  await page.goto(`http://localhost:8765/${t.demo}`);
  await sleep(page, 800);

  const command = (type) =>
    sw.evaluate(async (type) => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      await sendToTab(tab, { type });
    }, type);
  const isActive = () => page.evaluate(() => !!document.getElementById('browser-annotation-cursor-style'));
  const ensureActive = async () => {
    if (!(await isActive())) await command('pn:toggle');
    await sleep(page, 300);
  };
  const comment = async (sel, text) => {
    await ensureActive();
    await page.click(sel);
    await sleep(page, 300);
    await page.keyboard.type(text);
    await page.keyboard.press('Control+Enter');
    await sleep(page, 600);
  };
  // segura Ctrl para usar a página (abrir/fechar o modal) sem criar comentário
  const ctrlClick = async (sel) => {
    await page.keyboard.down('Control');
    await page.click(sel);
    await page.keyboard.up('Control');
    await sleep(page, 500);
  };

  await comment('[data-testid=cta-primary]', t.button);
  await comment('.grid .card:nth-child(3) h3', t.card);

  // modal.png: comentando um campo dentro do modal aberto
  await ensureActive();
  await ctrlClick('#open-modal');
  const box = await page.locator('.modal-content').boundingBox();
  await page.click('#m-mail');
  await sleep(page, 300);
  await page.keyboard.type(t.email);
  await sleep(page, 400);
  await page.screenshot({ path: path.join(out, 'modal.png'), clip: { x: box.x - 30, y: box.y - 30, width: 528, height: 465 } });
  await page.keyboard.press('Control+Enter');
  await sleep(page, 600);
  await ensureActive();
  await ctrlClick('#m-cancel'); // fecha o modal: o comentário fica como "Modal fechado"
  await page.mouse.move(5, 5);
  await sleep(page, 5000); // espera o aviso de "comentário salvo" sumir

  // panel.png: lista de comentários
  await command('pn:panel');
  await sleep(page, 600);
  const panel = await root(page).locator('.panel').boundingBox();
  await page.screenshot({ path: path.join(out, 'panel.png'), clip: { x: panel.x - 4, y: panel.y - 12, width: 397, height: 537 } });
  await command('pn:panel');
  await sleep(page, 400);

  // toolbar.png: barra de ações com a dica do botão da lista
  await page.evaluate(() => {
    const dot = document.querySelector('browser-annotation-root').shadowRoot.querySelector('.tb-dot');
    if (dot) Object.assign(dot.style, { animation: 'none', opacity: '1' }); // o ponto pisca: congela aceso
  });
  const bar = await root(page).locator('.tb-bar').boundingBox();
  const btn = await root(page).locator('.tb-bar [data-act=panel]').boundingBox();
  await page.mouse.move(btn.x + btn.width / 2, btn.y + btn.height / 2);
  await sleep(page, 600);
  await page.screenshot({ path: path.join(out, 'toolbar.png'), clip: { x: bar.x - 24, y: bar.y - 56, width: bar.width + 48, height: bar.height + 74 } });

  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
  console.log(`✓ ${lang}: ${path.relative(ROOT, out)}/{toolbar,panel,modal}.png`);
}
server.close();

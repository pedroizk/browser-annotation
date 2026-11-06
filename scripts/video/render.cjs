// Renderiza o vídeo quadro a quadro a partir de director.html.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const FPS = 30;
const DIR = __dirname;
const LANG = process.env.PN_LANG || 'pt-BR';
(async () => {
  const clips = {};
  for (const name of ['comment', 'modal', 'panel', 'alt']) clips[name] = JSON.parse(fs.readFileSync(path.join(DIR, `clips-${LANG}`, name, 'clip.json'), 'utf8'));
  const markdown = clips.panel.extra.markdown || '';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  await page.addInitScript(([c, m]) => { window.__CLIPS__ = c; window.__MARKDOWN__ = m; }, [clips, markdown]);
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`http://localhost:8766/director.html?lang=${LANG}`);
  await page.evaluate(() => document.fonts.ready);
  const duration = await page.evaluate(() => window.DURATION);
  fs.writeFileSync(path.join(DIR, `audio-events-${LANG}.json`), JSON.stringify(await page.evaluate(() => ({ events: window.audioEvents(), scenes: window.SC, duration: window.DURATION }))));
  const mode = process.argv[2] || 'preview';
  const outDir = path.join(DIR, (mode === 'full' ? 'frames-' : 'preview-') + LANG);
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const times = mode === 'full'
    ? Array.from({ length: Math.round(duration * FPS) }, (_, i) => i / FPS)
    : (process.argv[3] || '1,2.5,5,6.6,8.5,13.4,15.5,19.5,24,27,30.5,32.5,35.5,39.5,42.8,45,48.5,51,55.5,59,62.5').split(',').map(Number);
  const t0 = Date.now();
  for (let i = 0; i < times.length; i++) {
    await page.evaluate((t) => window.render(t), times[i]);
    const name = mode === 'full' ? `f${String(i).padStart(5, '0')}.jpg` : `t${times[i].toFixed(2)}.jpg`;
    await page.screenshot({ path: path.join(outDir, name), type: 'jpeg', quality: 92 });
    if (mode === 'full' && i % 150 === 0) console.log(`${i}/${times.length}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  console.log('ok', times.length, 'quadros em', ((Date.now() - t0) / 1000).toFixed(1), 's');
  await browser.close();
})();

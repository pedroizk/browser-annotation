const { capture, LANG } = require('./capture-lib.cjs');
// textos digitados e rótulos das teclas; em inglês, com o mesmo tamanho dos de português
// para manter os tempos dos cortes em director.html
const S = {
  'pt-BR': {
    c1: 'Aumentar o padding e usar a cor da marca', c2: 'Mostrar a variação vs. mês anterior', c3: 'Validar o formato do e-mail',
    c4: 'Texto do botão: "Quero receber novidades"', c5: 'Trocar por "Quero receber novidades"', holdCtrl: 'Segure Ctrl', holdAlt: 'Segure Alt',
  },
  en: {
    c1: 'Increase padding and use the brand color', c2: 'Show the change vs. previous month', c3: 'Validate the email format',
    c4: 'Button text: "Get the newsletter"', c5: 'Change to "Get the newsletter"', holdCtrl: 'Hold Ctrl', holdAlt: 'Hold Alt',
  },
}[LANG];
(async () => {
  // 1. Comentar
  await capture('comment', async (a) => {
    await a.wait(700);
    await a.command('pn:toggle', '⌘/Alt + ⇧ + E');
    await a.wait(500);
    await a.moveTo('.hero h1', .4, .5, 600); await a.wait(350);
    await a.moveTo('.grid .card:nth-child(1)', .5, .5, 500); await a.wait(300);
    await a.moveTo('[data-testid=cta-primary]', .5, .55, 550); await a.wait(450);
    await a.click(); await a.wait(400);
    await a.type(S.c1, 42);
    await a.wait(350);
    await a.press('Control+Enter', 'Ctrl + Enter'); await a.wait(1400);
    await a.moveTo('.grid .card:nth-child(3) h3', .45, .55, 600); await a.wait(300);
    await a.click(); await a.wait(350);
    await a.type(S.c2, 40);
    await a.wait(250);
    await a.press('Control+Enter', 'Ctrl + Enter'); await a.wait(1300);
    await a.move(980, 640, 500); await a.wait(400);
  });
  // 2. Modal
  await capture('modal', async (a) => {
    await a.wait(500);
    await a.moveTo('#open-modal', .5, .55, 550); await a.wait(250);
    await a.down('Control', S.holdCtrl); await a.wait(250); await a.click(); await a.wait(150); await a.up('Control');
    await a.wait(700);
    await a.moveTo('#m-mail', .6, .55, 600); await a.wait(400);
    await a.click(); await a.wait(350);
    await a.type(S.c3, 42);
    await a.press('Control+Enter', 'Ctrl + Enter'); await a.wait(1200);
    await a.moveTo('#m-cancel', .5, .55, 550); await a.wait(200);
    await a.down('Control', S.holdCtrl); await a.wait(200); await a.click(); await a.wait(150); await a.up('Control');
    await a.wait(1100);
    await a.moveTo('#open-modal', .5, .55, 550);
    await a.down('Control', S.holdCtrl); await a.wait(200); await a.click(); await a.wait(150); await a.up('Control');
    await a.wait(1300);
  }, async (a) => {
    await a.command('pn:toggle'); await a.wait(400);
  });
  // 3. Painel + copiar
  await capture('panel', async (a) => {
    await a.wait(500);
    await a.command('pn:panel', '⌘/Alt + ⇧ + K'); await a.wait(900);
    const c1 = await a.shadowRect('.panel .card:nth-child(1)');
    await a.move(c1.x + c1.width * .5, c1.y + c1.height * .5, 600); await a.wait(500);
    const c3 = await a.shadowRect('.panel .card:nth-child(3)');
    await a.move(c3.x + c3.width * .5, c3.y + c3.height * .5, 500); await a.wait(600);
    const cp = await a.shadowRect('.panel-foot .btn.primary');
    await a.move(cp.x + cp.width * .5, cp.y + cp.height * .5, 650); await a.wait(400);
    await a.click(); await a.wait(1600);
    a.extra.markdown = await a.clipboard();
  }, async (a) => {
    const add = async (sel, text) => { await a.page.click(sel); await a.wait(250); await a.page.keyboard.type(text); await a.page.keyboard.press('Control+Enter'); await a.wait(700); };
    await a.command('pn:toggle'); await a.wait(300);
    await add('[data-testid=cta-primary]', S.c1);
    await add('.grid .card:nth-child(3) h3', S.c2);
    await add('form .btn', S.c4);
    await a.page.mouse.move(600, 250);
    await a.wait(2600);
  });
  // 4. Segurar Alt
  await capture('alt', async (a) => {
    await a.wait(500);
    await a.moveTo('.hero .subtitle', .3, .5, 500); await a.wait(200);
    await a.down('Alt', S.holdAlt); await a.wait(450);
    await a.moveTo('form .btn', .5, .55, 700); await a.wait(350);
    await a.click(); await a.wait(250); await a.up('Alt'); await a.wait(250);
    await a.type(S.c5, 40);
    await a.press('Control+Enter', 'Ctrl + Enter'); await a.wait(1200);
    await a.moveTo('.grid .card:nth-child(2) h3', .5, .5, 600); await a.wait(700);
  });
})();

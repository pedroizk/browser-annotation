/* Browser Annotation — service worker (MV3).
 * - Clique no ícone / atalho de comando → alterna o modo anotação na aba.
 * - Badge com a quantidade de comentários em aberto na página.
 * - Menu de contexto do ícone: histórico, painel e copiar. */
importScripts('../shared/constants.js', '../shared/url.js', '../shared/storage.js');

const PN = globalThis.BrowserAnnotation;
const HISTORY_URL = chrome.runtime.getURL('src/history/history.html');

const CONTENT_FILES = [
  'src/shared/constants.js',
  'src/shared/url.js',
  'src/shared/storage.js',
  'src/shared/export.js',
  'src/shared/icons.js',
  'src/content/locator.js',
  'src/content/styles.js',
  'src/content/ui.js',
  'src/content/main.js',
];

function isInjectable(url) {
  return /^(https?|file):/.test(url || '') && !/^https:\/\/chrome\.google\.com\/webstore|^https:\/\/chromewebstore\.google\.com/.test(url);
}

async function ensureInjected(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'pn:ping' });
    if (res && res.ok) return true;
  } catch (_) {
    /* sem content script: aba aberta antes da instalação */
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['src/content/page-bridge.js'], world: 'MAIN' });
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
    return true;
  } catch (err) {
    console.warn('[Browser Annotation] não foi possível injetar na aba', err);
    return false;
  }
}

async function sendToTab(tab, message) {
  if (!tab || tab.id == null) return;
  if (!isInjectable(tab.url)) {
    flashBadge(tab.id, '×');
    return;
  }
  if (!(await ensureInjected(tab.id))) {
    flashBadge(tab.id, '×');
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch (err) {
    console.warn('[Browser Annotation]', err);
  }
}

function flashBadge(tabId, text) {
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#73726C' });
  chrome.action.setBadgeText({ tabId, text });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }), 1500);
}

// Atalhos realmente configurados (o usuário pode trocar em chrome://extensions/shortcuts).
async function getShortcuts() {
  const out = { toggle: '', panel: '', fallback: { toggle: false, panel: false } };
  try {
    for (const c of await chrome.commands.getAll()) {
      if (c.name === 'toggle-annotation') out.toggle = c.shortcut || '';
      if (c.name === 'toggle-panel') out.panel = c.shortcut || '';
    }
    const saved = (await chrome.storage.local.get(PN.SHORTCUT_FALLBACK_KEY))[PN.SHORTCUT_FALLBACK_KEY];
    if (saved) out.fallback = { toggle: !!saved.toggle && !out.toggle, panel: !!saved.panel && !out.panel };
  } catch (_) {
    /* sem suporte */
  }
  return out;
}

/*
 * Na instalação/atualização, um atalho vazio significa que o Chrome não conseguiu registrá-lo
 * (combinação já usada por outra extensão, ou atualização que não aplica o novo padrão).
 * Guardamos isso para a página tratar o atalho padrão por conta própria. Se depois o usuário
 * apagar o atalho de propósito, nada é tratado: respeitamos a escolha dele.
 */
async function rememberShortcutFallback() {
  const sc = await getShortcuts();
  await chrome.storage.local.set({ [PN.SHORTCUT_FALLBACK_KEY]: { toggle: !sc.toggle, panel: !sc.panel } });
}

const withShortcut = (text, sc) => (sc ? `${text} (${sc})` : text);

function setBadge(tabId, count, active) {
  const text = count > 0 ? String(count) : active ? '•' : '';
  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color: active ? '#D97757' : '#5E5D59' });
  if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ tabId, color: '#FFFFFF' });
  getShortcuts().then((sc) => {
    chrome.action.setTitle({
      tabId,
      title: withShortcut(`Browser Annotation — ${active ? 'modo anotação ATIVO' : 'clique para anotar'}`, PN.shortcutLabel(sc, 'toggle')) + (count ? ` · ${count} em aberto nesta página` : ''),
    });
  });
}

/** Atualiza o badge de uma aba a partir do storage (abas sem content script, ex.: recém-abertas). */
async function refreshBadgeFromStorage(tab) {
  if (!tab || tab.id == null || !isInjectable(tab.url)) return;
  const [settings, all] = await Promise.all([PN.store.getSettings(), PN.store.all()]);
  const key = PN.pageKey(tab.url, settings);
  const count = all.filter((a) => a.status !== 'resolved' && PN.pageKey(a.page.url, settings) === key).length;
  const text = count > 0 ? String(count) : '';
  chrome.action.setBadgeText({ tabId: tab.id, text });
  chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#5E5D59' });
}

chrome.action.onClicked.addListener((tab) => sendToTab(tab, { type: 'pn:toggle' }));

chrome.commands.onCommand.addListener(async (command, tab) => {
  const type = { 'toggle-annotation': 'pn:toggle', 'toggle-panel': 'pn:panel' }[command];
  if (!type) return;
  if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  sendToTab(tab, { type });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return;
  const tabId = sender.tab && sender.tab.id;
  switch (msg.type) {
    case 'pn:badge':
      if (tabId != null) setBadge(tabId, msg.count || 0, !!msg.active);
      break;
    case 'pn:get-shortcuts':
      getShortcuts().then((sc) => {
        updateMenuTitles(sc); // o usuário pode ter trocado o atalho desde a criação do menu
        sendResponse(sc);
      });
      return true; // resposta assíncrona
    case 'pn:open-history':
      chrome.tabs.create({ url: HISTORY_URL, index: sender.tab ? sender.tab.index + 1 : undefined });
      break;
    default:
      return;
  }
  sendResponse({ ok: true });
});

const menuTitles = (sc) => ({
  'pn-toggle': withShortcut('Ativar/desativar modo anotação', PN.shortcutLabel(sc, 'toggle')),
  'pn-panel': withShortcut('Mostrar comentários desta página', PN.shortcutLabel(sc, 'panel')),
});

async function setupMenus() {
  const titles = menuTitles(await getShortcuts());
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'pn-toggle', title: titles['pn-toggle'], contexts: ['action'] });
    chrome.contextMenus.create({ id: 'pn-panel', title: titles['pn-panel'], contexts: ['action'] });
    chrome.contextMenus.create({ id: 'pn-copy', title: 'Copiar comentários em aberto desta página', contexts: ['action'] });
    chrome.contextMenus.create({ id: 'pn-history', title: 'Abrir histórico completo', contexts: ['action'] });
  });
}

function updateMenuTitles(sc) {
  for (const [id, title] of Object.entries(menuTitles(sc))) {
    chrome.contextMenus.update(id, { title }, () => void chrome.runtime.lastError); // menu ainda não criado: ignora
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case 'pn-toggle':
      sendToTab(tab, { type: 'pn:toggle' });
      break;
    case 'pn-panel':
      sendToTab(tab, { type: 'pn:panel' });
      break;
    case 'pn-copy':
      sendToTab(tab, { type: 'pn:copy-page' });
      break;
    case 'pn-history':
      chrome.tabs.create({ url: HISTORY_URL });
      break;
    default:
      break;
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await rememberShortcutFallback();
  setupMenus();
  // Injeta nas abas já abertas para que os comentários existentes apareçam sem recarregar.
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!isInjectable(tab.url) || tab.discarded) continue;
    ensureInjected(tab.id).then(() => {}, () => {});
  }
});

chrome.runtime.onStartup.addListener(setupMenus);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && changeInfo.url) refreshBadgeFromStorage(tab).catch(() => {});
});

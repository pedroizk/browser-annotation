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

function setBadge(tabId, count, active) {
  const text = count > 0 ? String(count) : active ? '•' : '';
  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color: active ? '#D97757' : '#5E5D59' });
  if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ tabId, color: '#FFFFFF' });
  chrome.action.setTitle({
    tabId,
    title: `Browser Annotation — ${active ? 'modo anotação ATIVO' : 'clique para anotar'} (⌘/Ctrl + ')` + (count ? ` · ${count} em aberto nesta página` : ''),
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
  if (command !== 'toggle-annotation') return;
  if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  sendToTab(tab, { type: 'pn:toggle' });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return;
  const tabId = sender.tab && sender.tab.id;
  switch (msg.type) {
    case 'pn:badge':
      if (tabId != null) setBadge(tabId, msg.count || 0, !!msg.active);
      break;
    case 'pn:open-history':
      chrome.tabs.create({ url: HISTORY_URL, index: sender.tab ? sender.tab.index + 1 : undefined });
      break;
    case 'pn:open-tab':
      if (msg.url) chrome.tabs.create({ url: msg.url });
      break;
    default:
      return;
  }
  sendResponse({ ok: true });
});

function setupMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'pn-toggle', title: "Ativar/desativar modo anotação (⌘/Ctrl + ')", contexts: ['action'] });
    chrome.contextMenus.create({ id: 'pn-panel', title: "Mostrar comentários desta página (⌘/Ctrl + ⇧ + ')", contexts: ['action'] });
    chrome.contextMenus.create({ id: 'pn-copy', title: 'Copiar comentários em aberto desta página', contexts: ['action'] });
    chrome.contextMenus.create({ id: 'pn-history', title: 'Abrir histórico completo', contexts: ['action'] });
  });
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

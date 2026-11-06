/* Browser Annotation — página de histórico completo. */
(function () {
  const PN = globalThis.BrowserAnnotation;
  const store = PN.store;
  const $ = (sel) => document.querySelector(sel);
  const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  const state = {
    all: [],
    settings: Object.assign({}, PN.DEFAULT_SETTINGS),
    status: 'open',
    site: 'all',
    search: '',
    sort: 'new',
    editing: null,
    shortcuts: { toggle: '', panel: '' },
  };

  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) node.append(c.nodeType ? c : document.createTextNode(String(c)));
    return node;
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    t.style.animation = 'none';
    void t.offsetWidth;
    t.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2400);
  }

  function confirmButton(btn, label, action) {
    let armed = false;
    let timer;
    const original = btn.innerHTML;
    btn.addEventListener('click', () => {
      if (armed) {
        clearTimeout(timer);
        action();
        return;
      }
      armed = true;
      btn.classList.add('confirm');
      if (label) btn.textContent = label;
      timer = setTimeout(() => {
        armed = false;
        btn.classList.remove('confirm');
        btn.innerHTML = original;
      }, 2500);
    });
    return btn;
  }

  // ------------------------------------------------------------------ filtros
  function bySite(list) {
    return state.site === 'all' ? list : list.filter((a) => PN.originOf(a.page.url) === state.site);
  }

  function byStatus(list) {
    if (state.status === 'all') return list;
    return list.filter((a) => (state.status === 'open' ? a.status !== 'resolved' : a.status === 'resolved'));
  }

  function bySearch(list) {
    const q = state.search.trim().toLowerCase();
    if (!q) return list;
    const words = q.split(/\s+/);
    return list.filter((a) => {
      const t = a.target || {};
      const fw = t.framework || {};
      const hay = [a.comment, t.label, t.text, t.selector, fw.component, fw.source, a.page.url, a.page.title].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }

  function filtered() {
    return bySearch(byStatus(bySite(state.all)));
  }

  // ------------------------------------------------------------------ render
  function renderSidebar() {
    const siteScoped = bySite(state.all);
    const open = siteScoped.filter((a) => a.status !== 'resolved').length;
    const statusNav = $('#status-filter');
    statusNav.innerHTML = '';
    for (const [id, label, n] of [
      ['open', 'Em aberto', open],
      ['resolved', 'Resolvidos', siteScoped.length - open],
      ['all', 'Todos', siteScoped.length],
    ]) {
      statusNav.append(
        el(
          'button',
          {
            type: 'button',
            class: state.status === id ? 'on' : '',
            onclick: () => {
              state.status = id;
              render();
            },
          },
          el('span', { class: 'name', text: label }),
          el('span', { class: 'n', text: n })
        )
      );
    }

    const sites = new Map();
    for (const a of state.all) {
      const o = PN.originOf(a.page.url);
      if (!sites.has(o)) sites.set(o, { total: 0, open: 0 });
      const s = sites.get(o);
      s.total++;
      if (a.status !== 'resolved') s.open++;
    }
    if (state.site !== 'all' && !sites.has(state.site)) state.site = 'all';
    const siteNav = $('#site-filter');
    siteNav.innerHTML = '';
    const allOpen = state.all.filter((a) => a.status !== 'resolved').length;
    siteNav.append(
      el(
        'button',
        { type: 'button', class: state.site === 'all' ? 'on' : '', onclick: () => ((state.site = 'all'), render()) },
        el('span', { class: 'name', text: 'Todos os sites' }),
        el('span', { class: 'n', text: allOpen, title: 'em aberto' })
      )
    );
    [...sites.entries()]
      .sort((a, b) => b[1].open - a[1].open || a[0].localeCompare(b[0]))
      .forEach(([origin, s]) => {
        const name = origin.replace(/^https?:\/\//, '');
        siteNav.append(
          el(
            'button',
            { type: 'button', class: state.site === origin ? 'on' : '', title: origin, onclick: () => ((state.site = origin), render()) },
            el('span', { class: 'name', text: name }),
            el('span', { class: 'n', text: s.open, title: `${s.open} em aberto de ${s.total}` })
          )
        );
      });

    const totalOpen = state.all.filter((a) => a.status !== 'resolved').length;
    $('#stats').innerHTML = `<b>${totalOpen}</b> em aberto · <b>${state.all.length - totalOpen}</b> resolvidos`;
  }

  function cardFor(a) {
    const t = a.target || {};
    const fw = t.framework || {};
    const resolved = a.status === 'resolved';
    const label = (t.label || t.tag || 'elemento') + (fw.component ? `  ·  <${fw.component}>` : '');

    const details = el('div', { class: 'details' });
    if (fw.source) details.append(el('span', { title: 'Arquivo de origem' }, el('code', { text: fw.source })));
    if (t.text) details.append(el('span', { title: t.text, text: `“${PN.truncate(t.text, 70)}”` }));
    if (t.selector) details.append(el('span', { title: t.selector }, el('code', { text: PN.truncate(t.selector, 80) })));

    const card = el('article', { class: 'card' + (resolved ? ' resolved' : '') });
    const head = el(
      'div',
      { class: 'card-head' },
      el('code', { text: label, title: t.domPath || label }),
      el('span', { class: 'status ' + (resolved ? 'resolved' : 'open'), text: resolved ? 'Resolvido' : 'Aberto' }),
      el('span', {
        class: 'date',
        title: `Criado em ${PN.formatDate(a.createdAt)}` + (a.resolvedAt ? ` · resolvido em ${PN.formatDate(a.resolvedAt)}` : ''),
        text: resolved && a.resolvedAt ? `resolvido ${PN.relativeTime(a.resolvedAt)}` : PN.relativeTime(a.createdAt),
      })
    );
    card.append(head);

    if (state.editing === a.id) {
      const ta = el('textarea', {});
      ta.value = a.comment;
      const save = async () => {
        const v = ta.value.trim();
        if (!v) return;
        state.editing = null;
        await store.update(a.id, { comment: v, editedAt: Date.now() });
      };
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
        if (e.key === 'Escape') {
          state.editing = null;
          render();
        }
      });
      card.append(
        ta,
        el(
          'div',
          { class: 'card-foot' },
          el('span', { class: 'spacer' }),
          el('button', { class: 'btn sm', type: 'button', text: 'Cancelar', onclick: () => ((state.editing = null), render()) }),
          el('button', { class: 'btn sm primary', type: 'button', text: 'Salvar', onclick: save })
        )
      );
      setTimeout(() => ta.focus(), 0);
      return card;
    }

    card.append(el('div', { class: 'comment', text: a.comment }), details);
    const del = confirmButton(el('button', { class: 'icon-btn danger', type: 'button', title: 'Excluir', html: PN.icons.trash }), null, async () => {
      await store.remove(a.id);
      toast('Comentário excluído');
    });
    card.append(
      el(
        'div',
        { class: 'card-foot' },
        el('button', { class: 'btn sm', type: 'button', html: `${PN.icons.target} Ver na página`, onclick: () => openOnPage(a) }),
        resolved
          ? el('button', { class: 'btn sm', type: 'button', html: `${PN.icons.undo} Reabrir`, onclick: () => store.setStatus(a.id, 'open') })
          : el('button', { class: 'btn sm', type: 'button', html: `${PN.icons.check} Resolver`, onclick: () => store.setStatus(a.id, 'resolved') }),
        el('span', { class: 'spacer' }),
        el('button', { class: 'icon-btn', type: 'button', title: 'Copiar para LLM', html: PN.icons.copy, onclick: () => copy([a]) }),
        el('button', { class: 'icon-btn', type: 'button', title: 'Editar', html: PN.icons.edit, onclick: () => ((state.editing = a.id), render()) }),
        del
      )
    );
    return card;
  }

  function renderContent() {
    const list = filtered();
    const content = $('#content');
    content.innerHTML = '';

    const openInView = list.filter((a) => a.status !== 'resolved');
    const copyBtn = $('#btn-copy');
    copyBtn.innerHTML = `${PN.icons.copy} Copiar ${openInView.length} em aberto`;
    copyBtn.disabled = !openInView.length;
    copyBtn.title = 'Copia em Markdown os comentários em aberto que estão visíveis com os filtros atuais';

    if (!list.length) {
      const msg = state.all.length
        ? 'Nenhum comentário corresponde aos filtros.'
        : `Ainda não há comentários. Abra qualquer página e pressione ${state.shortcuts.toggle || 'o atalho do modo anotação'} para começar a anotar.`;
      content.append(el('div', { class: 'empty', html: PN.icons.bubble(48) }, el('div', { text: msg })));
      return;
    }

    const groups = PN.groupByPage(list, state.settings);
    const newest = (g) => Math.max(...g.items.map((a) => a.updatedAt || a.createdAt));
    groups.sort((a, b) => (state.sort === 'new' ? newest(b) - newest(a) : newest(a) - newest(b)));
    for (const g of groups) {
      g.items.sort((a, b) => (state.sort === 'new' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt));
      const open = g.items.filter((a) => a.status !== 'resolved').length;
      const section = el(
        'section',
        { class: 'group' },
        el(
          'div',
          { class: 'group-head' },
          el('h3', { text: g.title || PN.prettyUrl(g.url), title: g.title || g.url }),
          el('a', { href: PN.isSafePageUrl(g.url) ? g.url : null, target: '_blank', rel: 'noopener noreferrer', text: PN.prettyUrl(g.url), title: g.url }),
          el('span', { class: 'count', text: `${open} em aberto · ${g.items.length} no total` })
        ),
        el('div', { class: 'cards' }, g.items.map(cardFor))
      );
      content.append(section);
    }
  }

  function render() {
    renderSidebar();
    renderContent();
  }

  // ------------------------------------------------------------------ ações
  async function copy(list) {
    if (!list.length) return;
    const md = PN.buildExportMarkdown(list, { settings: state.settings });
    try {
      await navigator.clipboard.writeText(md);
      toast(`${list.length} comentário${list.length === 1 ? '' : 's'} copiado${list.length === 1 ? '' : 's'} — cole no Claude`);
    } catch (err) {
      toast('Não foi possível copiar: ' + err.message);
    }
  }

  async function openOnPage(a) {
    if (!PN.isSafePageUrl(a.page.url)) return toast('Endereço da página inválido');
    const key = PN.pageKey(a.page.url, state.settings);
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find((t) => t.url && PN.pageKey(t.url, state.settings) === key);
    if (existing) {
      await chrome.tabs.update(existing.id, { active: true });
      await chrome.windows.update(existing.windowId, { focused: true });
      try {
        const res = await chrome.tabs.sendMessage(existing.id, { type: 'pn:focus', id: a.id });
        if (res && res.ok) return;
      } catch (_) {
        /* content script ainda não carregado: recarrega com foco pendente */
      }
      await store.setPendingFocus(a.id, a.page.url);
      await chrome.tabs.reload(existing.id);
      return;
    }
    await store.setPendingFocus(a.id, a.page.url);
    await chrome.tabs.create({ url: a.page.url });
  }

  function exportJson() {
    const list = filtered();
    const version = chrome.runtime.getManifest().version;
    const blob = new Blob([JSON.stringify({ app: 'browser-annotation', version, exportedAt: new Date().toISOString(), annotations: list }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `browser-annotation-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`${list.length} comentário(s) exportado(s)`);
  }

  async function importJson(file) {
    try {
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : data.annotations;
      if (!Array.isArray(list)) throw new Error('formato inválido');
      const valid = list.map(PN.sanitizeAnnotation).filter(Boolean);
      await store.putMany(valid);
      const skipped = list.length - valid.length;
      toast(`${valid.length} comentário(s) importado(s)` + (skipped ? ` · ${skipped} ignorado(s) por estarem inválidos` : ''));
    } catch (err) {
      toast('Falha ao importar: ' + err.message);
    }
  }

  // ------------------------------------------------------------------ init
  async function loadShortcuts() {
    const def = (k) => (IS_MAC ? PN.SHORTCUTS[k].mac : PN.SHORTCUTS[k].other);
    try {
      for (const c of await chrome.commands.getAll()) {
        if (c.name === 'toggle-annotation') state.shortcuts.toggle = c.shortcut || '';
        if (c.name === 'toggle-panel') state.shortcuts.panel = c.shortcut || '';
      }
    } catch (_) {
      /* ignora */
    }
    $('#sc-toggle').innerHTML = PN.shortcutHtml(state.shortcuts.toggle || def('toggle'));
    $('#sc-panel').innerHTML = PN.shortcutHtml(state.shortcuts.panel || def('panel'));
  }

  async function load() {
    state.settings = await store.getSettings();
    state.all = await store.all();
    $('#opt-pins').checked = !!state.settings.showPinsWhenInactive;
    $('#opt-query').checked = !!state.settings.matchQuery;
    $('#opt-hold').value = state.settings.holdKey || 'Alt';
    $('#opt-toolbar-size').value = state.settings.toolbarSize || 'small';
    render();
  }

  function init() {
    $('#logo').innerHTML = PN.icons.bubble(36);
    loadShortcuts();
    window.addEventListener('focus', loadShortcuts); // o usuário pode ter trocado em chrome://extensions/shortcuts

    $('#search').addEventListener('input', (e) => {
      state.search = e.target.value;
      renderContent();
    });
    $('#sort').addEventListener('change', (e) => {
      state.sort = e.target.value;
      renderContent();
    });
    $('#btn-copy').addEventListener('click', () => copy(filtered().filter((a) => a.status !== 'resolved')));
    $('#btn-export').addEventListener('click', exportJson);
    $('#btn-import').addEventListener('click', () => $('#file-import').click());
    $('#file-import').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importJson(f);
      e.target.value = '';
    });
    $('#opt-pins').addEventListener('change', (e) => store.setSettings({ showPinsWhenInactive: e.target.checked }));
    $('#opt-query').addEventListener('change', (e) => store.setSettings({ matchQuery: e.target.checked }));
    $('#opt-hold').addEventListener('change', (e) => store.setSettings({ holdKey: e.target.value }));
    $('#opt-toolbar-size').addEventListener('change', (e) => store.setSettings({ toolbarSize: e.target.value }));
    if (IS_MAC) $('#opt-hold-alt').textContent = '⌥ Option';
    $('#link-shortcuts').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });
    confirmButton($('#btn-clear-resolved'), 'Confirmar exclusão?', async () => {
      const ids = state.all.filter((a) => a.status === 'resolved').map((a) => a.id);
      await store.remove(ids);
      toast(`${ids.length} comentário(s) resolvido(s) excluído(s)`);
    });

    store.onChange(() => load());
    load();
  }

  init();
})();

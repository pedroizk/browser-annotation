/* Pixel Notes — controlador do content script.
 * Responsável pelo modo anotação, pins, popovers, painel de histórico e sincronização com o storage. */
(function () {
  const PN = globalThis.PixelNotes;
  if (!PN || window.top !== window) return;
  // Se houver uma instância anterior (ex.: extensão recarregada e script reinjetado), desmonta-a.
  if (window.__pixelNotesInstance) {
    try {
      window.__pixelNotesInstance.teardown();
    } catch (_) {
      /* ignora */
    }
  }

  const { h, svg, placeNear } = PN.ui;
  const L = PN.locator;
  const store = PN.store;
  const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const MOD = IS_MAC ? '⌘' : 'Ctrl';

  // ------------------------------------------------------------------ estado
  const S = {
    alive: true,
    active: false,
    settings: Object.assign({}, PN.DEFAULT_SETTINGS),
    all: [], // todos os comentários (todas as páginas)
    pageAnns: [], // comentários desta página (abertos e resolvidos)
    openAnns: [], // abertos desta página — viram pins
    index: new Map(), // id -> número do pin
    anchors: new Map(), // id -> Element | null
    pinEls: new Map(), // id -> <button.pin>
    hoverBase: null,
    hoverEl: null,
    hoverStack: [],
    composer: null, // { el, root, ta, escArmed }
    thread: null, // { id, root, editing }
    panel: null, // { root, list, ... }
    panelTab: 'open',
    panelScope: 'page',
    search: '',
    peekId: null,
    lastUrl: location.href,
    cleanups: [],
  };

  // ------------------------------------------------------------------ montagem do Shadow DOM
  // Remove instâncias órfãs (ex.: extensão recarregada).
  document.querySelectorAll('pixel-notes-root').forEach((n) => n.remove());
  const host = document.createElement('pixel-notes-root');
  host.setAttribute('aria-live', 'polite');
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(h('style', { text: PN.CSS }));
  const layer = h('div.layer');
  const pinsWrap = h('div');
  const hlBox = h('div.hl', null, h('div.hl-label'));
  const peekBox = h('div.hl.peek');
  const fxWrap = h('div');
  const popWrap = h('div');
  const toolbarWrap = h('div');
  const panelWrap = h('div');
  const toastWrap = h('div');
  layer.append(pinsWrap, peekBox, hlBox, fxWrap, toolbarWrap, panelWrap, popWrap, toastWrap);
  shadow.append(layer);
  document.documentElement.append(host);

  // Evita que atalhos da página reajam ao que é digitado dentro da nossa UI.
  for (const type of ['keydown', 'keyup', 'keypress']) {
    host.addEventListener(type, (e) => e.stopPropagation());
  }

  function isOwn(e) {
    return e.composedPath().includes(host);
  }

  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    S.cleanups.push(() => target.removeEventListener(type, fn, opts));
  }

  function alive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  function teardown() {
    if (!S.alive) return;
    S.alive = false;
    S.cleanups.forEach((fn) => {
      try {
        fn();
      } catch (_) {
        /* ignora */
      }
    });
    if (S.active) setCursorStyle(false);
    host.remove();
    if (window.__pixelNotesInstance && window.__pixelNotesInstance.teardown === teardown) window.__pixelNotesInstance = null;
  }
  window.__pixelNotesInstance = { teardown };

  function send(msg) {
    if (!alive()) return teardown();
    try {
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch (_) {
      teardown();
    }
  }

  function toast(html, ms) {
    PN.ui.toast(toastWrap, html, ms);
  }

  // ------------------------------------------------------------------ dados
  function currentKey() {
    return PN.pageKey(location.href, S.settings);
  }

  function isHere(ann) {
    return PN.pageKey(ann.page.url, S.settings) === currentKey();
  }

  async function reload() {
    if (!alive()) return teardown();
    try {
      S.settings = await store.getSettings();
      S.all = await store.all();
    } catch (err) {
      if (!alive()) return teardown();
      console.warn('[Pixel Notes]', err);
      return;
    }
    recompute();
  }

  function recompute() {
    const key = currentKey();
    S.pageAnns = S.all.filter((a) => PN.pageKey(a.page.url, S.settings) === key);
    S.openAnns = S.pageAnns.filter((a) => a.status !== 'resolved');
    S.index = new Map(S.openAnns.map((a, i) => [a.id, i + 1]));
    const ids = new Set(S.openAnns.map((a) => a.id));
    for (const id of [...S.anchors.keys()]) if (!ids.has(id)) S.anchors.delete(id);
    for (const a of S.openAnns) {
      const el = S.anchors.get(a.id);
      if (!el || !el.isConnected) S.anchors.set(a.id, L.resolve(a.target));
    }
    if (S.thread && !S.all.some((a) => a.id === S.thread.id)) closeThread();
    renderPins();
    layout();
    renderToolbar();
    renderPanel();
    if (S.thread && !S.thread.editing) renderThread();
    send({ type: 'pn:badge', count: S.openAnns.length, active: S.active });
  }

  function reanchorMissing() {
    let changed = false;
    for (const a of S.openAnns) {
      const el = S.anchors.get(a.id);
      if (!el || !el.isConnected) {
        const found = L.resolve(a.target);
        if (found !== el) {
          S.anchors.set(a.id, found);
          changed = true;
        }
      }
    }
    if (changed) {
      layout();
      renderPanel();
    }
  }

  // ------------------------------------------------------------------ pins
  function renderPins() {
    const show = S.active || S.settings.showPinsWhenInactive;
    const ids = new Set(show ? S.openAnns.map((a) => a.id) : []);
    for (const [id, pin] of S.pinEls) {
      if (!ids.has(id)) {
        pin.remove();
        S.pinEls.delete(id);
      }
    }
    for (const a of S.openAnns) {
      if (!ids.has(a.id)) continue;
      let pin = S.pinEls.get(a.id);
      if (!pin) {
        pin = h('button.pin', { type: 'button' }, svg(PN.icons.bubblePlain(32)), h('span.num'));
        const id = a.id;
        pin.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (S.thread && S.thread.id === id) closeThread();
          else openThread(id);
        });
        pin.addEventListener('mouseenter', () => setPeek(id));
        pin.addEventListener('mouseleave', () => setPeek(null));
        pinsWrap.append(pin);
        S.pinEls.set(a.id, pin);
      }
      pin.querySelector('.num').textContent = S.index.get(a.id);
      const label = `Comentário ${S.index.get(a.id)}: ${PN.firstLine(a.comment, 120)}`;
      pin.title = label;
      pin.setAttribute('aria-label', label);
      pin.classList.toggle('active', !!(S.thread && S.thread.id === a.id));
    }
  }

  function anchorRect(ann) {
    const el = S.anchors.get(ann.id);
    if (el && el.isConnected) {
      const r = el.getBoundingClientRect();
      if (r.width || r.height) return { rect: r, orphan: false, el };
      return null; // elemento existe mas está oculto
    }
    const t = ann.target && ann.target.rect;
    if (!t) return null;
    const left = t.x - window.scrollX;
    const top = t.y - window.scrollY;
    return {
      rect: { left, top, width: t.width, height: t.height, right: left + t.width, bottom: top + t.height },
      orphan: true,
      el: null,
    };
  }

  function layout() {
    if (!S.alive) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const stack = new Map();
    for (const a of S.openAnns) {
      const pin = S.pinEls.get(a.id);
      if (!pin) continue;
      const info = anchorRect(a);
      if (!info) {
        pin.classList.add('hidden');
        continue;
      }
      const r = info.rect;
      if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) {
        pin.classList.add('hidden');
        continue;
      }
      const k = info.el || a.id;
      const n = stack.get(k) || 0;
      stack.set(k, n + 1);
      const x = Math.min(Math.max(2, r.right - 6 + n * 22), vw - 36);
      const y = Math.min(Math.max(2, r.top - 28), vh - 36);
      pin.style.left = x + 'px';
      pin.style.top = y + 'px';
      pin.classList.remove('hidden');
      pin.classList.toggle('orphan', info.orphan);
    }
    paintHover();
    paintPeek();
    positionComposer();
    positionThread();
  }

  let rafPending = false;
  function scheduleLayout() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      layout();
    });
  }

  // ------------------------------------------------------------------ destaque (hover / peek)
  function placeBox(box, r) {
    box.style.left = r.left - 2 + 'px';
    box.style.top = r.top - 2 + 'px';
    box.style.width = r.width + 4 + 'px';
    box.style.height = r.height + 4 + 'px';
  }

  function hoverLabelHtml(el, r) {
    const fw = L.probeFramework(el);
    const esc = PN.escapeHtml;
    let html = `<span>${esc(L.shortLabel(el))}</span>`;
    if (fw && fw.component) html += `<span class="comp">&lt;${esc(fw.component)}&gt;</span>`;
    html += `<span class="dim">${Math.round(r.width)}×${Math.round(r.height)}</span>`;
    return html;
  }

  function paintHover() {
    const target = S.composer ? S.composer.el : S.active ? S.hoverEl : null;
    if (!target || !target.isConnected) {
      hlBox.classList.remove('show');
      return;
    }
    const r = target.getBoundingClientRect();
    placeBox(hlBox, r);
    hlBox.classList.add('show');
    hlBox.classList.toggle('selected', !!S.composer);
    const label = hlBox.firstChild;
    const sizeKey = Math.round(r.width) + 'x' + Math.round(r.height);
    if (label._el !== target || label._size !== sizeKey) {
      label.innerHTML = hoverLabelHtml(target, r);
      label._el = target;
      label._size = sizeKey;
    }
    label.classList.toggle('inside', r.top < 26);
  }

  function setPeek(id) {
    S.peekId = id;
    paintPeek();
  }

  function paintPeek() {
    const ann = S.peekId && S.all.find((a) => a.id === S.peekId);
    const info = ann && anchorRect(ann);
    if (!info || info.orphan) {
      peekBox.classList.remove('show');
      return;
    }
    placeBox(peekBox, info.rect);
    peekBox.classList.add('show');
  }

  function flashElement(el) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    PN.ui.ripple(fxWrap, r);
  }

  // ------------------------------------------------------------------ modo anotação
  function setCursorStyle(onOff) {
    const id = 'pixelnotes-cursor-style';
    const existing = document.getElementById(id);
    if (onOff && !existing) {
      const st = document.createElement('style');
      st.id = id;
      st.textContent = 'html, html * { cursor: crosshair !important; } pixel-notes-root { cursor: auto !important; }';
      (document.head || document.documentElement).append(st);
    } else if (!onOff && existing) {
      existing.remove();
    }
  }

  function activate() {
    if (S.active) return;
    S.active = true;
    setCursorStyle(true);
    renderPins();
    renderToolbar();
    layout();
    send({ type: 'pn:badge', count: S.openAnns.length, active: true });
  }

  function deactivate() {
    if (!S.active) return;
    S.active = false;
    S.hoverEl = S.hoverBase = null;
    S.hoverStack = [];
    closeComposer();
    setCursorStyle(false);
    renderPins();
    renderToolbar();
    layout();
    send({ type: 'pn:badge', count: S.openAnns.length, active: false });
  }

  function toggle() {
    S.active ? deactivate() : activate();
  }

  function eligible(el) {
    return el && el.nodeType === 1 && el !== document.documentElement && el !== host && !host.contains(el);
  }

  function onMouseMove(e) {
    if (!S.active) return;
    if (isOwn(e)) {
      if (S.hoverEl) {
        S.hoverEl = S.hoverBase = null;
        scheduleLayout();
      }
      return;
    }
    const t = e.target;
    if (t === S.hoverBase) return;
    S.hoverBase = eligible(t) ? t : null;
    S.hoverEl = S.hoverBase;
    S.hoverStack = [];
    scheduleLayout();
  }

  function blocker(e) {
    if (!S.active || isOwn(e)) return;
    if (e.type === 'contextmenu') return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (e.type === 'click' && e.button === 0) {
      const el = e.target === S.hoverBase && S.hoverEl ? S.hoverEl : e.target;
      if (eligible(el)) selectElement(el);
    }
  }

  function isEditable(el) {
    if (!el) return false;
    return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
  }

  function isToggleShortcut(e) {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
    const quoteKey = e.key === "'" || e.key === '"' || e.code === 'Quote' || (e.key === 'Dead' && (e.code === 'Quote' || e.code === 'Backquote'));
    if (!quoteKey) return null;
    return e.shiftKey || e.key === '"' ? 'panel' : 'mode';
  }

  function onKeyDown(e) {
    const shortcut = isToggleShortcut(e);
    if (shortcut) {
      e.preventDefault();
      e.stopPropagation();
      if (shortcut === 'panel') togglePanel();
      else toggle();
      return;
    }
    if (e.key === 'Escape') {
      if (S.composer) {
        e.preventDefault();
        e.stopPropagation();
        cancelComposer();
        return;
      }
      if (S.thread) {
        e.preventDefault();
        e.stopPropagation();
        closeThread();
        return;
      }
      if (S.active) {
        e.preventDefault();
        e.stopPropagation();
        deactivate();
        return;
      }
      if (S.panel) {
        e.preventDefault();
        closePanel();
        return;
      }
      return;
    }
    if (!S.active || S.composer) return;
    const path = e.composedPath();
    if (isEditable(path[0])) return;
    if (e.key === 'ArrowUp' && S.hoverEl) {
      const p = S.hoverEl.parentElement;
      if (p && p !== document.documentElement) {
        S.hoverStack.push(S.hoverEl);
        S.hoverEl = p;
        scheduleLayout();
      }
      e.preventDefault();
    } else if (e.key === 'ArrowDown' && S.hoverStack.length) {
      S.hoverEl = S.hoverStack.pop();
      scheduleLayout();
      e.preventDefault();
    } else if (e.key === 'Enter' && S.hoverEl) {
      e.preventDefault();
      selectElement(S.hoverEl);
    }
  }

  // ------------------------------------------------------------------ compositor (novo comentário)
  function targetHead(el, desc) {
    const fw = desc ? desc.framework : L.probeFramework(el);
    const label = desc ? desc.label : L.shortLabel(el);
    const t1 = label + (fw && fw.component ? `  ·  <${fw.component}>` : '');
    const t2 = (fw && fw.source) || (desc ? desc.domPath : L.domPath(el, 4));
    return h('div.target', null, h('div.t1', { text: t1, title: t1 }), h('div.t2', { text: t2, title: t2 }));
  }

  function selectElement(el) {
    if (S.composer) {
      if (S.composer.ta.value.trim()) {
        shake(S.composer.root);
        S.composer.ta.focus();
        return;
      }
      closeComposer();
    }
    closeThread();
    openComposer(el);
  }

  function shake(node) {
    node.classList.remove('shake');
    void node.offsetWidth;
    node.classList.add('shake');
  }

  function openComposer(el) {
    const ta = h('textarea', { placeholder: 'O que precisa mudar aqui?', rows: '4', 'aria-label': 'Comentário' });
    const save = h('button.btn.primary', { type: 'button', disabled: true, html: `${PN.icons.check} Comentar` });
    const HINT = `<kbd>${MOD}</kbd><kbd>↵</kbd> para salvar · <kbd>Esc</kbd> fecha`;
    const hint = h('div.hint', { html: HINT });
    const root = h(
      'div.pop',
      { role: 'dialog', 'aria-label': 'Novo comentário' },
      h(
        'div.pop-head',
        null,
        svg(PN.icons.bubble(20)),
        targetHead(el),
        h('button.icon-btn', { type: 'button', title: 'Fechar', html: PN.icons.close, onclick: () => cancelComposer(true) })
      ),
      h('div.pop-body', null, ta),
      h('div.pop-foot', null, hint, save)
    );
    ta.addEventListener('input', () => {
      save.disabled = !ta.value.trim();
      if (S.composer) S.composer.escArmed = false;
      hint.classList.remove('warn');
      hint.innerHTML = HINT;
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        saveComposer();
      }
    });
    save.addEventListener('click', saveComposer);
    popWrap.append(root);
    S.composer = { el, root, ta, hint, escArmed: false };
    positionComposer();
    layout();
    setTimeout(() => ta.focus({ preventScroll: true }), 20);
  }

  function panelReserve() {
    return S.panel ? S.panel.root.getBoundingClientRect().width + 24 : 0;
  }

  function positionComposer() {
    const c = S.composer;
    if (!c) return;
    const r = c.el.getBoundingClientRect();
    const box = c.root.getBoundingClientRect();
    const p = placeNear(r, box.width || 344, box.height || 200, { prefer: 'below', reserveRight: panelReserve() });
    c.root.style.left = p.x + 'px';
    c.root.style.top = p.y + 'px';
    c.root.style.setProperty('--pn-origin', p.origin);
  }

  function cancelComposer(force) {
    const c = S.composer;
    if (!c) return;
    if (!force && c.ta.value.trim() && !c.escArmed) {
      c.escArmed = true;
      c.hint.classList.add('warn');
      c.hint.innerHTML = 'Pressione <kbd>Esc</kbd> de novo para descartar';
      shake(c.root);
      return;
    }
    closeComposer();
  }

  function closeComposer() {
    if (!S.composer) return;
    S.composer.root.remove();
    S.composer = null;
    layout();
  }

  async function saveComposer() {
    const c = S.composer;
    if (!c) return;
    const text = c.ta.value.trim();
    if (!text) return;
    const el = c.el;
    let target;
    try {
      target = L.describe(el);
    } catch (err) {
      console.warn('[Pixel Notes] falha ao descrever elemento', err);
      target = { tag: el.tagName.toLowerCase(), classes: [], label: el.tagName.toLowerCase() };
    }
    const now = Date.now();
    const ann = {
      id: PN.uid(),
      status: 'open',
      comment: text,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      page: { url: location.href, title: document.title || '' },
      target,
    };
    closeComposer();
    S.anchors.set(ann.id, el);
    S.all.push(ann);
    recompute();

    // animação: onda no elemento + explosão de pixels + pin quicando
    const pin = S.pinEls.get(ann.id);
    flashElement(el);
    if (pin) {
      pin.classList.add('pop');
      setTimeout(() => pin.classList.remove('pop'), 700);
      const pr = pin.getBoundingClientRect();
      PN.ui.burst(fxWrap, pr.left + 12, pr.top + 14);
    }
    try {
      await store.put(ann);
      toast(`<span class="ok">●</span> Comentário salvo · ${S.openAnns.length} em aberto nesta página`);
    } catch (err) {
      toast('Não foi possível salvar o comentário: ' + PN.escapeHtml(err.message || err));
    }
  }

  // ------------------------------------------------------------------ thread (comentário existente)
  function openThread(id) {
    closeComposer();
    closeThread();
    const root = h('div.pop', { role: 'dialog', 'aria-label': 'Comentário' });
    popWrap.append(root);
    S.thread = { id, root, editing: false };
    renderThread();
    renderPins();
    positionThread();
  }

  function closeThread() {
    if (!S.thread) return;
    S.thread.root.remove();
    S.thread = null;
    renderPins();
  }

  function confirmButton(btn, label, action) {
    let armed = false;
    let timer;
    const original = btn.innerHTML;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
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

  function renderThread() {
    const t = S.thread;
    if (!t) return;
    const a = S.all.find((x) => x.id === t.id);
    if (!a) return closeThread();
    const resolved = a.status === 'resolved';
    const idx = S.index.get(a.id);
    const root = t.root;
    root.innerHTML = '';

    const head = h(
      'div.pop-head',
      null,
      idx ? h('span.badge-n', { text: idx }) : svg(PN.icons.bubble(20)),
      targetHead(null, a.target),
      h('span.status.' + (resolved ? 'resolved' : 'open'), { text: resolved ? 'Resolvido' : 'Aberto' }),
      h('button.icon-btn', { type: 'button', title: 'Fechar', html: PN.icons.close, onclick: closeThread })
    );
    root.append(head);

    if (t.editing) {
      const ta = h('textarea', { 'aria-label': 'Editar comentário' });
      ta.value = a.comment;
      const saveEdit = async () => {
        const v = ta.value.trim();
        if (!v) return;
        t.editing = false;
        a.comment = v;
        renderThread();
        renderPins();
        await store.update(a.id, { comment: v, editedAt: Date.now() });
      };
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          saveEdit();
        }
      });
      root.append(
        h('div.pop-body', null, ta),
        h(
          'div.pop-foot',
          null,
          h('div.hint', { html: `<kbd>${MOD}</kbd><kbd>↵</kbd> salvar` }),
          h('button.btn.ghost', { type: 'button', text: 'Cancelar', onclick: () => ((t.editing = false), renderThread()) }),
          h('button.btn.primary', { type: 'button', html: `${PN.icons.check} Salvar`, onclick: saveEdit })
        )
      );
      setTimeout(() => {
        ta.focus({ preventScroll: true });
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }, 10);
    } else {
      const meta = h('div.meta-row', null, h('span', { text: `Criado ${PN.relativeTime(a.createdAt)}`, title: PN.formatDate(a.createdAt) }));
      if (a.editedAt) meta.append(h('span', { text: '· editado' }));
      if (resolved && a.resolvedAt) meta.append(h('span', { text: `· resolvido ${PN.relativeTime(a.resolvedAt)}` }));
      const info = anchorRect(a);
      if (!resolved && info && info.orphan) meta.append(h('span', { text: '· elemento não encontrado', style: { color: '#B4690E' } }));
      root.append(h('div.pop-body', null, h('div.comment-text', { text: a.comment }), meta));

      const del = confirmButton(h('button.icon-btn.danger', { type: 'button', title: 'Excluir', html: PN.icons.trash }), null, () => removeAnnotation(a.id));
      const foot = h(
        'div.pop-foot',
        null,
        h('button.icon-btn', { type: 'button', title: 'Editar', html: PN.icons.edit, onclick: () => ((t.editing = true), renderThread()) }),
        del,
        h('button.icon-btn', { type: 'button', title: 'Copiar para LLM', html: PN.icons.copy, onclick: () => copyAnnotations([a], 'Comentário copiado') }),
        h('div', { style: { flex: '1' } }),
        resolved
          ? h('button.btn', { type: 'button', html: `${PN.icons.undo} Reabrir`, onclick: () => setStatus(a.id, 'open') })
          : h('button.btn.primary', { type: 'button', html: `${PN.icons.check} Resolver`, onclick: () => setStatus(a.id, 'resolved') })
      );
      root.append(foot);
    }
    positionThread();
  }

  function positionThread() {
    const t = S.thread;
    if (!t) return;
    const a = S.all.find((x) => x.id === t.id);
    if (!a) return;
    const pin = S.pinEls.get(a.id);
    let ref = null;
    if (pin && !pin.classList.contains('hidden')) ref = pin.getBoundingClientRect();
    else {
      const el = S.anchors.get(a.id) || t.el;
      if (el && el.isConnected) ref = el.getBoundingClientRect();
      else {
        const info = anchorRect(a);
        ref = info ? info.rect : { left: window.innerWidth / 2 - 170, right: window.innerWidth / 2, top: 80, bottom: 80, width: 0, height: 0 };
      }
    }
    const box = t.root.getBoundingClientRect();
    const p = placeNear(ref, box.width || 344, box.height || 180, { gap: 8, prefer: 'below', reserveRight: panelReserve() });
    t.root.style.left = p.x + 'px';
    t.root.style.top = p.y + 'px';
    t.root.style.setProperty('--pn-origin', p.origin);
  }

  // ------------------------------------------------------------------ ações
  async function setStatus(id, status) {
    const a = S.all.find((x) => x.id === id);
    if (!a) return;
    if (status === 'resolved') {
      const pin = S.pinEls.get(id);
      if (pin) {
        S.pinEls.delete(id);
        const pr = pin.getBoundingClientRect();
        PN.ui.burst(fxWrap, pr.left + 12, pr.top + 14, 12);
        pin.classList.add('vanish');
        setTimeout(() => pin.remove(), 480);
      }
    }
    if (S.thread && S.thread.id === id) closeThread();
    a.status = status;
    a.resolvedAt = status === 'resolved' ? Date.now() : null;
    recompute();
    await store.setStatus(id, status);
    if (status === 'resolved') toast('<span class="ok">✓</span> Comentário resolvido');
    else toast('Comentário reaberto');
  }

  async function removeAnnotation(id) {
    const pin = S.pinEls.get(id);
    if (pin) {
      S.pinEls.delete(id);
      pin.classList.add('vanish');
      setTimeout(() => pin.remove(), 480);
    }
    if (S.thread && S.thread.id === id) closeThread();
    S.all = S.all.filter((a) => a.id !== id);
    recompute();
    await store.remove(id);
    toast('Comentário excluído');
  }

  async function copyAnnotations(list, okMessage) {
    if (!list.length) {
      toast('Nenhum comentário em aberto para copiar');
      return;
    }
    const md = PN.buildExportMarkdown(list, { settings: S.settings });
    const ok = await PN.ui.copyText(md, shadow);
    if (ok) {
      toast(`<span class="ok">●</span> ${okMessage || `${list.length} comentário${list.length === 1 ? '' : 's'} copiado${list.length === 1 ? '' : 's'}`} — cole no Claude`);
    } else {
      showManualCopy(md);
    }
  }

  function showManualCopy(text) {
    const ta = h('textarea', { readonly: true });
    ta.value = text;
    const wrap = h(
      'div.manual',
      { onclick: (e) => e.target === wrap && wrap.remove() },
      h(
        'div.box',
        null,
        h('strong', { text: 'Copie o texto abaixo (Ctrl/⌘ + C)' }),
        ta,
        h('div', { style: { display: 'flex', justifyContent: 'flex-end' } }, h('button.btn', { type: 'button', text: 'Fechar', onclick: () => wrap.remove() }))
      )
    );
    toastWrap.append(wrap);
    ta.focus();
    ta.select();
  }

  async function focusAnnotation(a) {
    if (!isHere(a)) {
      await store.setPendingFocus(a.id, a.page.url);
      location.href = a.page.url;
      return;
    }
    let el = S.anchors.get(a.id);
    if (!el || !el.isConnected) el = L.resolve(a.target);
    if (el) {
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      setTimeout(() => {
        flashElement(el);
        if (S.thread) closeThread();
        openThread(a.id);
        S.thread.el = el;
        positionThread();
      }, 420);
    } else {
      if (a.target && a.target.rect) window.scrollTo({ top: Math.max(0, a.target.rect.y - window.innerHeight / 3), behavior: 'smooth' });
      toast('Elemento não encontrado — a página pode ter mudado. Mostrando a posição original.', 3200);
      setTimeout(() => openThread(a.id), 420);
    }
  }

  // ------------------------------------------------------------------ toolbar
  function siteOpen() {
    const origin = PN.originOf(location.href);
    return S.all.filter((a) => a.status !== 'resolved' && PN.originOf(a.page.url) === origin);
  }

  let toolbarEl = null;
  function renderToolbar() {
    if (!S.active) {
      if (toolbarEl) {
        const el = toolbarEl;
        toolbarEl = null;
        el.classList.add('out');
        setTimeout(() => el.remove(), 180);
      }
      return;
    }
    const open = siteOpen();
    const html = `
      <div class="brand">${PN.icons.bubble(20)}<span class="dot"></span><span>Anotando</span></div>
      <span class="hint">Clique em um elemento · <kbd class="dark">↑</kbd> seleciona o pai</span>
      <span class="sep"></span>
      <button type="button" data-act="panel" title="Comentários e histórico (${MOD} ⇧ ')">${PN.icons.list}<span>Comentários</span><span class="count">${S.openAnns.length}</span></button>
      <button type="button" class="primary" data-act="copy" title="Copia todos os comentários em aberto deste site (${PN.escapeHtml(PN.originOf(location.href))}) em Markdown">${PN.icons.copy}<span>Copiar abertos</span><span class="count">${open.length}</span></button>
      <span class="sep"></span>
      <button type="button" data-act="exit" title="Sair do modo anotação">${PN.icons.close}<span>Sair</span><kbd class="dark">Esc</kbd></button>`;
    if (!toolbarEl) {
      toolbarEl = h('div.toolbar', { role: 'toolbar', 'aria-label': 'Pixel Notes' });
      toolbarEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === 'panel') togglePanel();
        else if (act === 'copy') copyAnnotations(siteOpen());
        else if (act === 'exit') deactivate();
      });
      toolbarWrap.append(toolbarEl);
    }
    toolbarEl.innerHTML = html;
  }

  // ------------------------------------------------------------------ painel (histórico)
  function togglePanel() {
    S.panel ? closePanel() : openPanel();
  }

  function openPanel() {
    if (S.panel) return;
    const tabs = h('div.tabs', { role: 'tablist' });
    const seg = h('div.seg');
    const searchInput = h('input', { type: 'search', placeholder: 'Buscar comentários…', 'aria-label': 'Buscar' });
    searchInput.value = S.search;
    searchInput.addEventListener('input', () => {
      S.search = searchInput.value;
      renderPanel();
    });
    const list = h('div.list');
    const copyBtn = h('button.btn.primary', { type: 'button' });
    const modeBtn = h('button.btn.sm', { type: 'button' });
    modeBtn.addEventListener('click', toggle);
    copyBtn.addEventListener('click', () => copyAnnotations(scopeList().filter((a) => a.status !== 'resolved')));

    const root = h(
      'div.panel',
      { role: 'complementary', 'aria-label': 'Comentários Pixel Notes' },
      h(
        'div.panel-head',
        null,
        svg(PN.icons.bubble(26)),
        h('div.title', null, h('div.t1', { text: 'Pixel Notes' }), h('div.t2', { text: PN.prettyUrl(location.href) })),
        modeBtn,
        h('button.icon-btn', { type: 'button', title: 'Fechar painel', html: PN.icons.close, onclick: closePanel })
      ),
      tabs,
      h('div.filters', null, seg, h('div.search', null, svg(PN.icons.search), searchInput)),
      list,
      h(
        'div.panel-foot',
        null,
        copyBtn,
        h('button.btn', {
          type: 'button',
          title: 'Abrir o histórico completo em uma nova aba',
          html: `${PN.icons.external} Histórico`,
          onclick: () => send({ type: 'pn:open-history' }),
        })
      )
    );
    panelWrap.append(root);
    S.panel = { root, tabs, seg, list, copyBtn, modeBtn, t2: root.querySelector('.t2') };
    renderPanel();
  }

  function closePanel() {
    if (!S.panel) return;
    const el = S.panel.root;
    S.panel = null;
    el.classList.add('out');
    setTimeout(() => el.remove(), 170);
  }

  function scopeList() {
    const key = currentKey();
    const origin = PN.originOf(location.href);
    if (S.panelScope === 'page') return S.all.filter((a) => PN.pageKey(a.page.url, S.settings) === key);
    if (S.panelScope === 'site') return S.all.filter((a) => PN.originOf(a.page.url) === origin);
    return S.all.slice();
  }

  function matchesSearch(a, q) {
    if (!q) return true;
    const t = a.target || {};
    const fw = t.framework || {};
    const hay = [a.comment, t.label, t.text, fw.component, fw.source, a.page.url, a.page.title].join(' ').toLowerCase();
    return q
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((w) => hay.includes(w));
  }

  function renderPanel() {
    const P = S.panel;
    if (!P) return;
    const scoped = scopeList();
    const openCount = scoped.filter((a) => a.status !== 'resolved').length;
    const resolvedCount = scoped.length - openCount;

    P.t2.textContent = PN.prettyUrl(location.href);
    P.modeBtn.className = 'btn sm' + (S.active ? ' primary' : '');
    P.modeBtn.innerHTML = `${PN.icons.cursor} ${S.active ? 'Anotando' : 'Anotar'}`;
    P.modeBtn.title = `${S.active ? 'Desativar' : 'Ativar'} modo anotação (${MOD} ')`;

    const tabDefs = [
      ['open', 'Abertos', openCount],
      ['resolved', 'Resolvidos', resolvedCount],
      ['all', 'Todos', scoped.length],
    ];
    P.tabs.innerHTML = '';
    for (const [id, label, n] of tabDefs) {
      const b = h('button.tab' + (S.panelTab === id ? '.on' : ''), { type: 'button', role: 'tab', 'aria-selected': String(S.panelTab === id) }, label, h('span.c', { text: n }));
      b.addEventListener('click', () => {
        S.panelTab = id;
        renderPanel();
      });
      P.tabs.append(b);
    }

    P.seg.innerHTML = '';
    for (const [id, label] of [
      ['page', 'Esta página'],
      ['site', 'Este site'],
      ['all', 'Tudo'],
    ]) {
      const b = h('button' + (S.panelScope === id ? '.on' : ''), { type: 'button', text: label });
      b.addEventListener('click', () => {
        S.panelScope = id;
        renderPanel();
      });
      P.seg.append(b);
    }

    const scopeLabel = { page: 'desta página', site: 'deste site', all: 'de todos os sites' }[S.panelScope];
    P.copyBtn.innerHTML = `${PN.icons.copy} Copiar ${openCount} em aberto`;
    P.copyBtn.title = `Copia os comentários em aberto ${scopeLabel} em Markdown, prontos para colar no Claude`;
    P.copyBtn.disabled = openCount === 0;

    let items = scoped.filter((a) => (S.panelTab === 'all' ? true : S.panelTab === 'open' ? a.status !== 'resolved' : a.status === 'resolved'));
    items = items.filter((a) => matchesSearch(a, S.search));
    items.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'resolved' ? 1 : -1;
      if (a.status === 'resolved') return (b.resolvedAt || 0) - (a.resolvedAt || 0);
      return a.createdAt - b.createdAt;
    });

    const scrollTop = P.list.scrollTop;
    P.list.innerHTML = '';
    if (!items.length) {
      const msg = S.search
        ? 'Nada encontrado para essa busca.'
        : S.panelTab === 'resolved'
          ? 'Nenhum comentário resolvido ainda.'
          : `Nenhum comentário em aberto ${scopeLabel}.`;
      P.list.append(
        h(
          'div.empty',
          null,
          svg(PN.icons.bubble(40, 'big')),
          h('div', null, msg),
          S.panelTab !== 'resolved' && !S.search
            ? h('div', { html: `Ative o modo anotação com <kbd>${MOD}</kbd> <kbd>'</kbd> e clique em um elemento.` })
            : null
        )
      );
      return;
    }

    // agrupa por página quando o escopo é maior que a página atual
    const groups = S.panelScope === 'page' ? [{ key: currentKey(), url: location.href, items }] : PN.groupByPage(items, S.settings);
    if (S.panelScope !== 'page') {
      const ck = currentKey();
      groups.sort((a, b) => (a.key === ck ? -1 : b.key === ck ? 1 : 0));
    }
    for (const grp of groups) {
      if (S.panelScope !== 'page') {
        const here = grp.key === currentKey();
        P.list.append(h('div.group-title', { text: (here ? '● Esta página — ' : '') + PN.prettyUrl(grp.url), title: grp.url }));
      }
      for (const a of grp.items) P.list.append(card(a));
    }
    P.list.scrollTop = scrollTop;
  }

  function card(a) {
    const resolved = a.status === 'resolved';
    const here = isHere(a);
    const idx = here ? S.index.get(a.id) : null;
    const t = a.target || {};
    const fw = t.framework || {};
    const label = (t.label || t.tag || 'elemento') + (fw.component ? ` · <${fw.component}>` : '');

    let where = null;
    if (here && !resolved) {
      const info = anchorRect(a);
      if (!info || info.orphan) where = h('div.where.warn', { title: 'O elemento mudou ou foi removido. O comentário continua salvo e o ícone fica na posição original.', html: `${PN.icons.warn}<span>Elemento não encontrado na página</span>` });
    }
    if (!where && fw.source) where = h('div.where', { text: fw.source, title: fw.source });
    if (!where) where = h('div.where', { text: t.domPath || '', title: t.selector || '' });

    const resolveBtn = resolved
      ? h('button.icon-btn', { type: 'button', title: 'Reabrir', html: PN.icons.undo, onclick: (e) => (e.stopPropagation(), setStatus(a.id, 'open')) })
      : h('button.icon-btn', { type: 'button', title: 'Resolver', html: PN.icons.check, onclick: (e) => (e.stopPropagation(), setStatus(a.id, 'resolved')) });
    const copyBtn = h('button.icon-btn', {
      type: 'button',
      title: 'Copiar para LLM',
      html: PN.icons.copy,
      onclick: (e) => (e.stopPropagation(), copyAnnotations([a], 'Comentário copiado')),
    });
    const delBtn = confirmButton(h('button.icon-btn.danger', { type: 'button', title: 'Excluir (clique duas vezes)', html: PN.icons.trash }), null, () => removeAnnotation(a.id));

    const el = h(
      'div.card' + (resolved ? '.resolved' : ''),
      { tabindex: '0', title: here ? 'Mostrar na página' : 'Abrir a página deste comentário' },
      h(
        'div.card-head',
        null,
        idx ? h('span.badge-n', { text: idx }) : h('span.badge-n.muted', { html: resolved ? '✓' : '•' }),
        h('code', { text: label, title: t.selector || label }),
        h('span.time', { text: PN.relativeTime(resolved ? a.resolvedAt || a.updatedAt : a.createdAt), title: PN.formatDate(a.createdAt) })
      ),
      h('div.card-body', { text: a.comment }),
      h('div.card-foot', null, where, resolveBtn, copyBtn, delBtn)
    );
    el.addEventListener('click', () => focusAnnotation(a));
    el.addEventListener('keydown', (e) => e.key === 'Enter' && focusAnnotation(a));
    el.addEventListener('mouseenter', () => here && !resolved && setPeek(a.id));
    el.addEventListener('mouseleave', () => setPeek(null));
    return el;
  }

  // ------------------------------------------------------------------ navegação SPA / mudanças no DOM
  function onUrlMaybeChanged() {
    if (location.href === S.lastUrl) return;
    const prevKey = PN.pageKey(S.lastUrl, S.settings);
    S.lastUrl = location.href;
    if (prevKey === currentKey()) return;
    closeComposer();
    closeThread();
    S.anchors.clear();
    recompute();
    checkPendingFocus();
  }

  let mutTimer = null;
  const observer = new MutationObserver(() => {
    if (!S.openAnns.length) return;
    clearTimeout(mutTimer);
    mutTimer = setTimeout(reanchorMissing, 250);
  });

  async function checkPendingFocus() {
    let pf;
    try {
      pf = await store.takePendingFocus();
    } catch (_) {
      return;
    }
    if (!pf) return;
    if (PN.pageKey(pf.url, S.settings) !== currentKey()) {
      // não é desta página: devolve para que a página certa use
      await store.setPendingFocus(pf.id, pf.url);
      return;
    }
    // espera a página (SPA) renderizar o elemento
    const started = Date.now();
    const tryFocus = () => {
      const a = S.all.find((x) => x.id === pf.id);
      if (!a) return;
      const el = L.resolve(a.target);
      if (el || Date.now() - started > 3000) {
        if (!S.panel) openPanel();
        focusAnnotation(a);
      } else setTimeout(tryFocus, 300);
    };
    tryFocus();
  }

  // ------------------------------------------------------------------ mensagens do service worker
  function onMessage(msg, _sender, sendResponse) {
    if (!msg || typeof msg.type !== 'string') return;
    switch (msg.type) {
      case 'pn:ping':
        sendResponse({ ok: true, active: S.active });
        break;
      case 'pn:toggle':
        toggle();
        sendResponse({ ok: true, active: S.active });
        break;
      case 'pn:panel':
        togglePanel();
        sendResponse({ ok: true });
        break;
      case 'pn:focus': {
        const a = S.all.find((x) => x.id === msg.id);
        if (a) {
          if (!S.panel) openPanel();
          focusAnnotation(a);
        }
        sendResponse({ ok: !!a });
        break;
      }
      case 'pn:copy-page':
        copyAnnotations(S.openAnns);
        sendResponse({ ok: true });
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------ inicialização
  async function init() {
    on(window, 'keydown', onKeyDown, true);
    on(window, 'mousemove', onMouseMove, { capture: true, passive: true });
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu']) {
      on(window, type, blocker, true);
    }
    on(window, 'scroll', scheduleLayout, { capture: true, passive: true });
    on(window, 'resize', scheduleLayout, { passive: true });
    on(window, 'popstate', () => setTimeout(onUrlMaybeChanged, 0));
    on(window, 'hashchange', () => setTimeout(onUrlMaybeChanged, 0));
    on(document, 'mouseleave', () => {
      if (S.active && S.hoverEl) {
        S.hoverEl = S.hoverBase = null;
        scheduleLayout();
      }
    });

    try {
      chrome.runtime.onMessage.addListener(onMessage);
      S.cleanups.push(() => chrome.runtime.onMessage.removeListener(onMessage));
      const off = store.onChange(() => reload());
      S.cleanups.push(off);
    } catch (_) {
      return teardown();
    }

    observer.observe(document.documentElement, { childList: true, subtree: true });
    S.cleanups.push(() => observer.disconnect());

    const tick = setInterval(() => {
      if (!alive()) return teardown();
      if (!host.isConnected) document.documentElement.append(host);
      onUrlMaybeChanged();
      if (S.pinEls.size || S.composer || S.thread) layout();
    }, 500);
    S.cleanups.push(() => clearInterval(tick));

    await reload();
    checkPendingFocus();
  }

  init();
})();

/* Browser Annotation — ponte no "MAIN world".
 *
 * Content scripts rodam num mundo isolado e não enxergam as propriedades que os frameworks
 * penduram nos nós do DOM (__reactFiber$…, __vueParentComponent, __svelte_meta…).
 * Este script roda no contexto da página e responde, de forma síncrona, qual componente
 * renderizou um elemento — e, em builds de desenvolvimento, o arquivo/linha de origem.
 *
 * Protocolo: o content script dispara `browser-annotation:probe` NO PRÓPRIO ELEMENTO (o nó do DOM é
 * compartilhado entre os mundos) e escuta `browser-annotation:probe-result` com um JSON em `detail`.
 */
(function () {
  if (window.__browserAnnotationBridge) return;
  window.__browserAnnotationBridge = true;

  const MAX_DEPTH = 40;
  const MAX_PATH = 8;

  const REACT_IGNORE = new Set([
    'Fragment', 'Suspense', 'StrictMode', 'Profiler', 'Provider', 'Consumer', 'Context',
    'ErrorBoundary', 'Router', 'Routes', 'Route', 'RenderedRoute', 'Outlet', 'BrowserRouter',
    'DataRoutes', 'RouterProvider', 'Link', 'NavLink',
    // Next.js (app router) internals
    'InnerLayoutRouter', 'OuterLayoutRouter', 'RedirectBoundary', 'RedirectErrorBoundary',
    'NotFoundBoundary', 'NotFoundErrorBoundary', 'LoadingBoundary', 'ErrorBoundaryHandler',
    'ScrollAndFocusHandler', 'InnerScrollAndFocusHandler', 'RenderFromTemplateContext',
    'HotReload', 'ReactDevOverlay', 'AppRouter', 'ServerRoot', 'Root', 'AppContainer',
    'HTTPAccessFallbackBoundary', 'HTTPAccessFallbackErrorBoundary', 'DevRootHTTPAccessFallbackBoundary',
    'PathnameContextProviderAdapter', 'SegmentViewNode', 'SegmentStateProvider', 'ClientPageRoot',
    'ClientSegmentRoot', 'MetadataBoundary', 'ViewportBoundary', 'OuterLayoutRouterInner',
  ]);

  function isUsefulName(name) {
    if (!name || typeof name !== 'string') return false;
    if (REACT_IGNORE.has(name)) return false;
    if (/Provider$|Context$|^_|^\$/.test(name)) return false;
    // nomes minificados de builds de produção (e, t, Xe…)
    if (name.length <= 2) return false;
    return true;
  }

  function basename(file) {
    return String(file || '').split(/[\\/]/).pop();
  }

  function shortFile(file) {
    if (!file) return null;
    file = String(file).replace(/^webpack:\/\/\/?(_N_E\/)?/, '').replace(/^file:\/\//, '');
    const idx = file.search(/\/(src|app|pages|components|lib)\//);
    if (idx > 0) file = file.slice(idx + 1);
    file = file.replace(/^\.\//, '');
    return file;
  }

  function fmtSource(src) {
    if (!src || !src.fileName) return null;
    let s = shortFile(src.fileName);
    if (src.lineNumber) s += ':' + src.lineNumber;
    if (src.columnNumber) s += ':' + src.columnNumber;
    return s;
  }

  // ---------------------------------------------------------------- React
  function reactFiber(el) {
    for (let n = el, depth = 0; n && depth < MAX_DEPTH; n = n.parentElement, depth++) {
      for (const key in n) {
        if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) return n[key];
      }
    }
    return null;
  }

  function reactTypeName(t) {
    if (!t) return null;
    if (typeof t === 'string') return null;
    if (typeof t === 'function') return t.displayName || t.name || null;
    if (typeof t === 'object') {
      if (t.displayName) return t.displayName;
      if (t.render) return reactTypeName(t.render); // forwardRef
      if (t.type) return reactTypeName(t.type); // memo
    }
    return null;
  }

  function stackHint(fiber) {
    // React 19 removeu _debugSource; _debugStack traz a pilha (com URLs do bundle).
    const stack = fiber && fiber._debugStack && fiber._debugStack.stack;
    if (!stack) return null;
    const lines = String(stack).split('\n').slice(1);
    for (const line of lines) {
      if (/node_modules|react-dom|react_stack|react-server|jsx-dev-runtime|<anonymous>/.test(line)) continue;
      const m = line.match(/\(?((?:https?|file|webpack|rsc):\/\/[^)\s]+?:\d+:\d+)\)?\s*$/);
      if (m) {
        try {
          const u = new URL(m[1]);
          return decodeURIComponent(u.pathname + u.search).replace(/^\/(_next\/static\/chunks\/)?/, '');
        } catch (_) {
          return m[1];
        }
      }
    }
    return null;
  }

  function inspectReact(el) {
    const fiber = reactFiber(el);
    if (!fiber) return null;
    const path = [];
    let source = fmtSource(fiber._debugSource);
    let hint = null;
    let ownerSource = null;
    for (let f = fiber, i = 0; f && i < 200 && path.length < MAX_PATH; f = f.return, i++) {
      const name = reactTypeName(f.type);
      if (isUsefulName(name)) {
        if (!path.length) {
          // fonte da definição não é conhecida; usamos onde o host foi criado (_debugSource do host)
          ownerSource = fmtSource(f._debugSource);
          hint = stackHint(fiber) || stackHint(f);
        }
        path.push(name);
      }
    }
    if (!path.length && !source) return { framework: 'React', component: null, path: [] };
    return {
      framework: 'React',
      component: path[0] || null,
      path: path.reverse(),
      source: source || null,
      usedAt: ownerSource || null,
      stackHint: hint,
    };
  }

  // ---------------------------------------------------------------- Vue 3
  function inspectVue3(el) {
    let n = el;
    for (let d = 0; n && d < MAX_DEPTH && !n.__vueParentComponent; d++) n = n.parentElement;
    if (!n || !n.__vueParentComponent) return null;
    let inst = n.__vueParentComponent;
    const file = inst.type && inst.type.__file;
    const path = [];
    while (inst && path.length < MAX_PATH) {
      const t = inst.type || {};
      const name = t.name || t.__name || (t.__file && basename(t.__file).replace(/\.vue$/, ''));
      if (name) path.push(name);
      inst = inst.parent;
    }
    return {
      framework: 'Vue',
      component: path[0] || null,
      path: path.filter(Boolean).reverse(),
      source: shortFile(file),
    };
  }

  // ---------------------------------------------------------------- Vue 2
  function inspectVue2(el) {
    let n = el;
    for (let d = 0; n && d < MAX_DEPTH && !n.__vue__; d++) n = n.parentElement;
    if (!n || !n.__vue__) return null;
    let vm = n.__vue__;
    const file = vm.$options && vm.$options.__file;
    const path = [];
    while (vm && path.length < MAX_PATH) {
      const o = vm.$options || {};
      const name = o.name || o._componentTag || (o.__file && basename(o.__file).replace(/\.vue$/, ''));
      if (name) path.push(name);
      vm = vm.$parent;
    }
    return { framework: 'Vue 2', component: path[0] || null, path: path.reverse(), source: shortFile(file) };
  }

  // ---------------------------------------------------------------- Svelte
  function inspectSvelte(el) {
    let n = el;
    for (let d = 0; n && d < MAX_DEPTH && !n.__svelte_meta; d++) n = n.parentElement;
    if (!n || !n.__svelte_meta) return null;
    const loc = n.__svelte_meta.loc || {};
    const file = shortFile(loc.file);
    const name = loc.file ? basename(loc.file).replace(/\.svelte$/, '') : null;
    let source = file;
    if (source && loc.line != null) source += ':' + (loc.line + 1) + (loc.column != null ? ':' + (loc.column + 1) : '');
    return { framework: 'Svelte', component: name, path: name ? [name] : [], source };
  }

  // ---------------------------------------------------------------- Angular (modo dev expõe window.ng)
  function inspectAngular(el) {
    const ng = window.ng;
    if (!ng || typeof ng.getOwningComponent !== 'function') return null;
    let comp = null;
    try {
      comp = ng.getComponent(el) || ng.getOwningComponent(el);
    } catch (_) {
      return null;
    }
    if (!comp) return null;
    const path = [];
    let c = comp;
    for (let i = 0; c && i < MAX_PATH; i++) {
      const name = c.constructor && c.constructor.name;
      if (name) path.push(name.replace(/^_/, ''));
      try {
        const host = ng.getHostElement(c);
        c = host && host.parentElement ? ng.getOwningComponent(host.parentElement) : null;
      } catch (_) {
        c = null;
      }
    }
    return { framework: 'Angular', component: path[0] || null, path: path.reverse(), source: null };
  }

  function inspect(el) {
    const fns = [inspectReact, inspectVue3, inspectVue2, inspectSvelte, inspectAngular];
    for (const fn of fns) {
      try {
        const r = fn(el);
        if (r && (r.component || r.source)) return r;
      } catch (_) {
        /* segue para o próximo */
      }
    }
    return null;
  }

  window.addEventListener(
    'browser-annotation:probe',
    (e) => {
      const el = e.target;
      let info = null;
      try {
        info = el && el.nodeType === 1 ? inspect(el) : null;
      } catch (_) {
        info = null;
      }
      const token = typeof e.detail === 'string' ? e.detail : '';
      window.dispatchEvent(new CustomEvent('browser-annotation:probe-result', { detail: JSON.stringify({ token, info }) }));
    },
    true
  );
})();

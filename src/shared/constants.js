/* Browser Annotation — constantes compartilhadas (content script, service worker e página de histórico). */
(function (g) {
  const PN = (g.BrowserAnnotation = g.BrowserAnnotation || {});

  PN.KEY_PREFIX = 'ann:';
  PN.SETTINGS_KEY = 'settings';
  PN.PENDING_FOCUS_KEY = 'pendingFocus';

  PN.DEFAULT_SETTINGS = {
    // Considera a query string (?tab=x) ao decidir se um comentário pertence à página.
    matchQuery: false,
    // Mostra os ícones de comentário mesmo com o modo anotação desligado.
    showPinsWhenInactive: true,
    // Tecla para "segurar para comentar": 'Alt' (⌥ no Mac), 'Shift' ou 'off'.
    holdKey: 'Alt',
    // Tamanho da barra de ações: 'small' | 'medium' | 'large'.
    toolbarSize: 'small',
  };

  // Atalhos padrão (definidos em manifest.json → commands): a tecla ao lado da barra de espaço
  // (⌘ no Mac, Alt no Windows/Linux/ChromeOS) + Shift + letra. Letras em vez de pontuação,
  // porque a posição de ' ; . / muda entre layouts (ex.: ABNT2) e esbarra em atalhos do sistema.
  // Combinações com letra já usadas pelo Chrome ou pelo sistema:
  //   - Chrome no Mac, ⌘⇧: A, B, C, D, F, G, H, I, J, L, M, N, R, T, V, W, Z
  //   - macOS, ⌘⇧: Q (sair da sessão), Y (nota adesiva), além de 3/4/5 (capturas de tela)
  //   - Chrome no Windows/Linux, Alt+Shift: A, B, C, I, N, P, R, T, W, X, Z
  //   - ChromeOS, Alt+Shift: I, L, M, N, P, S, V
  // Livres em todos: E, K, O, U. Escolhemos E (ativar) e K (lista de comentários).
  PN.SHORTCUTS = {
    toggle: { key: 'E', mac: '⇧⌘E', other: 'Alt+Shift+E' },
    panel: { key: 'K', mac: '⇧⌘K', other: 'Alt+Shift+K' },
  };

  // { toggle, panel }: true quando o Chrome não conseguiu registrar o atalho na instalação
  // (ex.: outra extensão já usava a combinação). Nesse caso a própria página trata o padrão.
  PN.SHORTCUT_FALLBACK_KEY = 'shortcutFallback';

  PN.isMac = function () {
    const p = (g.navigator && (g.navigator.userAgentData?.platform || g.navigator.platform || g.navigator.userAgent)) || '';
    return /Mac|iPhone|iPad/i.test(p);
  };

  PN.defaultShortcut = function (kind) {
    return PN.isMac() ? PN.SHORTCUTS[kind].mac : PN.SHORTCUTS[kind].other;
  };

  /**
   * Atalho a mostrar na interface. `sc` = { toggle, panel, fallback } vindo de chrome.commands.
   * '' quando o usuário removeu o atalho em chrome://extensions/shortcuts.
   */
  PN.shortcutLabel = function (sc, kind) {
    if (!sc) return PN.defaultShortcut(kind); // ainda carregando
    if (sc[kind]) return sc[kind];
    return sc.fallback && sc.fallback[kind] ? PN.defaultShortcut(kind) : '';
  };

  /** O evento é o atalho padrão (⌘ no Mac / Alt nos outros + Shift + letra)? Usa a letra do layout; se a tecla virar símbolo, cai no e.code. */
  PN.isDefaultShortcut = function (e, kind, mac = PN.isMac()) {
    const mod = mac ? e.metaKey && !e.altKey : e.altKey && !e.metaKey;
    if (!mod || !e.shiftKey || e.ctrlKey) return false;
    const letter = /^[a-z]$/i.test(e.key) ? e.key.toUpperCase() : /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : '';
    return letter === PN.SHORTCUTS[kind].key;
  };

  /** "⇧⌘X" (formato do Chrome no Mac) → ['⇧','⌘','X'] | "Alt+Shift+X" → ['Alt','Shift','X'] */
  PN.shortcutKeys = function (label) {
    if (!label) return [];
    return label.includes('+') ? label.split('+') : Array.from(label);
  };

  PN.shortcutHtml = function (label) {
    return PN.shortcutKeys(label)
      .map((k) => `<kbd>${PN.escapeHtml(k)}</kbd>`)
      .join(label.includes('+') ? '+' : '');
  };

  PN.uid = function () {
    try {
      if (g.crypto && typeof g.crypto.randomUUID === 'function') return g.crypto.randomUUID();
    } catch (_) {
      /* contexto inseguro (http) */
    }
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  };

  PN.truncate = function (str, max) {
    if (!str) return '';
    str = String(str);
    return str.length > max ? str.slice(0, max - 1).trimEnd() + '…' : str;
  };

  PN.firstLine = function (str, max = 80) {
    return PN.truncate(String(str || '').trim().split(/\r?\n/)[0], max);
  };

  PN.relativeTime = function (ts) {
    if (!ts) return '';
    const diff = Math.round((Date.now() - ts) / 1000);
    if (diff < 45) return 'agora';
    if (diff < 3600) return `há ${Math.round(diff / 60)} min`;
    if (diff < 86400) return `há ${Math.round(diff / 3600)} h`;
    if (diff < 86400 * 7) {
      const d = Math.round(diff / 86400);
      return d === 1 ? 'ontem' : `há ${d} dias`;
    }
    return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  PN.formatDate = function (ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /** Só permitimos navegar/abrir páginas http(s) e file — nunca javascript:, data: etc. */
  PN.isSafePageUrl = function (url) {
    try {
      return ['http:', 'https:', 'file:'].includes(new URL(url).protocol);
    } catch (_) {
      return false;
    }
  };

  /**
   * Normaliza um comentário vindo de fora (importação de JSON): mantém só os campos
   * conhecidos, com os tipos esperados e tamanhos limitados. Retorna null se for inválido.
   */
  PN.sanitizeAnnotation = function (a) {
    if (!a || typeof a !== 'object') return null;
    const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const id = str(a.id, 100);
    const comment = str(a.comment, 20000).trim();
    if (!id || !comment || !a.page || !PN.isSafePageUrl(a.page.url)) return null;
    if (!a.target || typeof a.target !== 'object') return null;
    let target;
    try {
      const json = JSON.stringify(a.target);
      if (json.length > 100000) return null;
      target = JSON.parse(json);
    } catch (_) {
      return null;
    }
    const now = Date.now();
    const out = {
      id,
      status: a.status === 'resolved' ? 'resolved' : 'open',
      comment,
      createdAt: num(a.createdAt) || now,
      updatedAt: num(a.updatedAt) || now,
      resolvedAt: num(a.resolvedAt),
      page: { url: String(a.page.url), title: str(a.page.title, 300) },
      target,
    };
    if (num(a.editedAt)) out.editedAt = num(a.editedAt);
    if (a.originalTarget && typeof a.originalTarget === 'object') {
      try {
        const json = JSON.stringify(a.originalTarget);
        if (json.length <= 100000) out.originalTarget = JSON.parse(json);
      } catch (_) {
        /* ignora */
      }
    }
    return out;
  };

  PN.escapeHtml = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };
})(globalThis);

/* Pixel Notes — constantes compartilhadas (content script, service worker e página de histórico). */
(function (g) {
  const PN = (g.PixelNotes = g.PixelNotes || {});

  PN.VERSION = '0.1.0';
  PN.KEY_PREFIX = 'ann:';
  PN.SETTINGS_KEY = 'settings';
  PN.PENDING_FOCUS_KEY = 'pendingFocus';

  PN.DEFAULT_SETTINGS = {
    // Considera a query string (?tab=x) ao decidir se um comentário pertence à página.
    matchQuery: false,
    // Mostra os ícones de comentário mesmo com o modo anotação desligado.
    showPinsWhenInactive: true,
  };

  PN.COLORS = {
    orange: '#D97757',
    orangeDark: '#AE5630',
    orangeLight: '#F4D9CC',
    cream: '#FAF9F5',
    ink: '#1F1E1D',
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

  PN.escapeHtml = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };
})(globalThis);

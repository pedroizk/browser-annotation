/* Browser Annotation — normalização de URL para vincular comentários a uma página. */
(function (g) {
  const PN = (g.BrowserAnnotation = g.BrowserAnnotation || {});

  // Parâmetros que nunca identificam a "tela" (rastreamento, cache-busting…).
  const NOISE_PARAMS = /^(utm_.*|fbclid|gclid|mc_eid|ref|_|t|ts|v|cb|cache|hsCtaTracking)$/i;

  /**
   * Gera a chave da página: origem + caminho (+ rota em hash, + query opcional).
   * Ex.: http://localhost:3000/dashboard  |  https://app.com/#/users/12
   */
  PN.pageKey = function (href, settings) {
    const matchQuery = !!(settings && settings.matchQuery);
    let u;
    try {
      u = new URL(href);
    } catch (_) {
      return String(href || '');
    }
    let path = u.pathname.replace(/\/index\.html?$/i, '/').replace(/\/+$/, '') || '/';
    let key = (u.protocol === 'file:' ? 'file://' : u.origin) + path;

    // Rotas em hash (#/rota ou #!/rota) fazem parte da "tela"; âncoras simples (#secao) não.
    if (/^#!?\//.test(u.hash)) {
      const hashPath = u.hash.replace(/^#!?/, '').split('?')[0].replace(/\/+$/, '') || '/';
      key += '#' + hashPath;
    }

    if (matchQuery) {
      const params = [...u.searchParams.entries()]
        .filter(([k]) => !NOISE_PARAMS.test(k))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      if (params.length) key += '?' + new URLSearchParams(params).toString();
    }
    return key;
  };

  PN.originOf = function (href) {
    try {
      const u = new URL(href);
      return u.protocol === 'file:' ? 'file://' : u.origin;
    } catch (_) {
      return '';
    }
  };

  PN.prettyUrl = function (href) {
    try {
      const u = new URL(href);
      const host = u.protocol === 'file:' ? 'file://' : u.host;
      return host + (u.pathname === '/' ? '' : u.pathname) + (/^#!?\//.test(u.hash) ? u.hash : '');
    } catch (_) {
      return String(href || '');
    }
  };
})(globalThis);

/* Browser Annotation — ícones SVG (pixel-art) usados na interface. */
(function (g) {
  const PN = (g.BrowserAnnotation = g.BrowserAnnotation || {});

  // Mesmo bitmap de scripts/generate-icons.py
  const BUBBLE = [
    '................',
    '................',
    '...oooooooooo...',
    '..oooooooooooo..',
    '.oooooooooooooo.',
    '.oooooooooooooo.',
    '.ooowwowwowwooo.',
    '.ooowwowwowwooo.',
    '.oooooooooooooo.',
    '.ooooooooooooood',
    '..oooooooooooodd',
    '..ooodddddddddd.',
    '..ood...........',
    '..od............',
    '..d.............',
    '................',
  ];

  function bitmapToSvg(rows, colors, { size = 16, cls = '' } = {}) {
    let rects = '';
    rows.forEach((row, y) => {
      // agrupa pixels iguais consecutivos para reduzir o número de <rect>
      let x = 0;
      while (x < row.length) {
        const ch = row[x];
        let w = 1;
        while (x + w < row.length && row[x + w] === ch) w++;
        if (colors[ch]) rects += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${colors[ch]}"/>`;
        x += w;
      }
    });
    return `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  }

  const FULL = { o: 'var(--pn-orange, #D97757)', d: 'var(--pn-orange-dark, #AE5630)', w: '#FAF9F5' };
  // Sem os "pontinhos" — usado no pin, que recebe o número por cima.
  const PLAIN = { o: FULL.o, d: FULL.d, w: FULL.o };

  PN.icons = {
    bubble: (size = 16, cls = '') => bitmapToSvg(BUBBLE, FULL, { size, cls }),
    bubblePlain: (size = 16, cls = '') => bitmapToSvg(BUBBLE, PLAIN, { size, cls }),
    // Ícones de linha simples (estilo 16px)
    list: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5.5 4h8M5.5 8h8M5.5 12h8"/><circle cx="2.5" cy="4" r=".6" fill="currentColor"/><circle cx="2.5" cy="8" r=".6" fill="currentColor"/><circle cx="2.5" cy="12" r=".6" fill="currentColor"/></svg>',
    copy: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>',
    close: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    check: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3L13 4.5"/></svg>',
    undo: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3L2 6l3 3"/><path d="M2 6h7.5a4 4 0 0 1 0 8H6"/></svg>',
    trash: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4"/></svg>',
    edit: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M10.5 2.5l3 3-8 8H2.5v-3z"/></svg>',
    target: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="5"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2" stroke-linecap="round"/></svg>',
    external: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2.5h4.5V7M13.5 2.5L7 9M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3"/></svg>',
    search: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>',
    cursor: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M3 2l10 5-4.5 1.5L7 13z"/></svg>',
    arrowUp: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13.5v-11M3.5 7L8 2.5 12.5 7"/></svg>',
    hand: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8.5V2.8a1.1 1.1 0 0 1 2.2 0v4.7M8.2 7V5.9a1.1 1.1 0 0 1 2.2 0V7.6M10.4 7.2a1.1 1.1 0 0 1 2.2 0v2.6A4.7 4.7 0 0 1 7.9 14.5h-.6a4 4 0 0 1-3.2-1.6L2.4 10.6a1.1 1.1 0 0 1 1.7-1.4L6 11"/></svg>',
    hidden: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 6h12M5.5 9.5h5"/></svg>',
    link: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 9.5l3-3"/><path d="M7.2 4.6l1.1-1.1a2.8 2.8 0 0 1 4 4l-1.1 1.1"/><path d="M8.8 11.4l-1.1 1.1a2.8 2.8 0 0 1-4-4l1.1-1.1"/></svg>',
    warn: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2l6.5 11.5h-13z"/><path d="M8 6.5v3M8 11.6v.1"/></svg>',
  };
})(globalThis);

/* Pixel Notes — utilitários de interface: criação de elementos, posicionamento e efeitos. */
(function (g) {
  const PN = (g.PixelNotes = g.PixelNotes || {});

  /** h('div.cls', {attrs}, children) — mini hyperscript */
  function h(tagSpec, props, ...children) {
    const [tag, ...classes] = tagSpec.split('.');
    const el = document.createElement(tag || 'div');
    if (classes.length) el.className = classes.join(' ');
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'class') el.className += ' ' + v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  function svg(markup) {
    const t = document.createElement('template');
    t.innerHTML = markup.trim();
    return t.content.firstChild;
  }

  /** Posiciona um popover (w×h) junto de um retângulo de referência, dentro da viewport. */
  function placeNear(ref, w, hgt, { gap = 10, prefer = 'below', reserveRight = 0 } = {}) {
    // reserveRight: espaço ocupado à direita (painel lateral aberto), quando ainda sobra lugar
    const vw = window.innerWidth - (window.innerWidth - reserveRight >= w + 40 ? reserveRight : 0);
    const vh = window.innerHeight;
    const m = 12;
    let x;
    let y;
    let origin = 'top left';
    const spaceBelow = vh - ref.bottom - gap - m;
    const spaceAbove = ref.top - gap - m;
    if ((prefer === 'below' && spaceBelow >= hgt) || (spaceBelow >= hgt && spaceBelow >= spaceAbove)) {
      y = ref.bottom + gap;
    } else if (spaceAbove >= hgt) {
      y = ref.top - gap - hgt;
      origin = 'bottom left';
    } else {
      // não cabe acima nem abaixo: lado direito ou esquerdo
      y = Math.min(Math.max(m, ref.top), vh - hgt - m);
      if (vw - ref.right - gap - m >= w) {
        x = ref.right + gap;
      } else if (ref.left - gap - m >= w) {
        x = ref.left - gap - w;
      } else {
        x = vw - w - m;
        y = vh - hgt - m;
      }
    }
    if (x == null) x = ref.left;
    x = Math.min(Math.max(m, x), vw - w - m);
    y = Math.min(Math.max(m, y), Math.max(m, vh - hgt - m));
    return { x: Math.round(x), y: Math.round(y), origin };
  }

  // ---------------------------------------------------------------- efeitos
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Onda em volta do elemento recém-comentado. */
  function ripple(layer, rect) {
    if (!rect || reduceMotion()) return;
    for (let i = 0; i < 2; i++) {
      const el = h('div.fx.ripple', {
        style: { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' },
      });
      layer.append(el);
      const a = el.animate(
        [
          { opacity: 0.95, transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(217,119,87,.45)' },
          { opacity: 0, transform: `scale(${1 + 24 / Math.max(rect.width, 40)}, ${1 + 24 / Math.max(rect.height, 40)})`, boxShadow: '0 0 0 14px rgba(217,119,87,0)' },
        ],
        { duration: 700, delay: i * 160, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' }
      );
      a.onfinish = () => el.remove();
    }
  }

  /** Explosão de "pixels" laranja a partir de (x, y). */
  function burst(layer, x, y, count = 18) {
    if (reduceMotion()) return;
    const kinds = ['', '', '', 'd', 'w'];
    for (let i = 0; i < count; i++) {
      const kind = kinds[i % kinds.length];
      const size = [4, 6, 6, 8][i % 4];
      const el = h('div.fx.px' + (kind ? '.' + kind : ''), {
        style: { left: x - size / 2 + 'px', top: y - size / 2 + 'px', width: size + 'px', height: size + 'px' },
      });
      layer.append(el);
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
      const dist = 26 + Math.random() * 38;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist - 10;
      // movimento "quantizado" (steps) para dar a sensação de pixel-art
      const a = el.animate(
        [
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          { transform: `translate(${dx * 0.7}px, ${dy * 0.7}px) scale(1)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${dx}px, ${dy + 14}px) scale(.5)`, opacity: 0 },
        ],
        { duration: 620 + Math.random() * 260, easing: 'steps(9, end)', delay: 120 }
      );
      a.onfinish = () => el.remove();
    }
  }

  function toast(layer, html, ms = 2200) {
    layer.querySelectorAll('.toast').forEach((t) => t.remove());
    const el = h('div.toast', { html });
    layer.append(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 220);
    }, ms);
  }

  async function copyText(text, shadowRoot) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      /* tenta o método antigo */
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      (shadowRoot || document.body).append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (ok) return true;
    } catch (_) {
      /* sem acesso à área de transferência */
    }
    return false;
  }

  PN.ui = { h, svg, placeNear, ripple, burst, toast, copyText };
})(globalThis);

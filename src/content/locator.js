/* Browser Annotation — identificação de elementos.
 *  - describe(el): captura uma "impressão digital" do elemento (seletores, texto, componente…)
 *  - resolve(target): reencontra o elemento depois de recarregar/trocar de página
 */
(function (g) {
  const PN = (g.BrowserAnnotation = g.BrowserAnnotation || {});

  const TEST_ATTRS = ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa', 'data-pw', 'data-component', 'data-id'];
  const KEEP_ATTRS = ['name', 'type', 'role', 'aria-label', 'title', 'placeholder', 'alt', 'href', 'src', 'for', 'value'];

  // ------------------------------------------------------------------ heurísticas de estabilidade
  function isStableId(id) {
    if (!id || id.length > 64) return false;
    if (/[:«»]/.test(id)) return false; // React useId (:r1:, «r1»)
    if (/^(ember|radix-|headlessui-|mui-|react-|rc-|el-|v-|ng-|__)/i.test(id)) return false;
    if (/\d{4,}/.test(id)) return false;
    if (/^[a-f0-9-]{16,}$/i.test(id)) return false;
    return true;
  }

  function isStableClass(c) {
    if (!c || c.length > 48) return false;
    if (/^browser-annotation/.test(c)) return false;
    if (/[:[\]/@!%()]/.test(c)) return false; // variantes tailwind: hover:x, w-[10px], md:flex
    if (/^(css|sc|jsx|emotion|svelte|astro|tw|chakra|mantine|styles?)-[a-z0-9]{4,}$/i.test(c)) return false;
    if (/__[a-zA-Z0-9_-]{5}$/.test(c)) return false; // CSS Modules: Button_primary__x7Yz2
    if (/^_[a-zA-Z0-9]{5,}$/.test(c)) return false;
    if (/^[a-z]{1,3}[A-Z0-9][a-zA-Z0-9]{4,}$/.test(c) && /\d/.test(c)) return false; // hashes curtos
    if (/(^|-)(active|hover|focus|focused|open|selected|visible|hidden|show|disabled|loading)$/i.test(c)) return false;
    return true;
  }

  function classesOf(el) {
    const cls = el.getAttribute && el.getAttribute('class');
    if (!cls) return [];
    return cls
      .split(/\s+/)
      .filter(Boolean)
      .filter((c) => !/^browser-annotation/.test(c));
  }

  function testIdOf(el) {
    for (const attr of TEST_ATTRS) {
      const v = el.getAttribute && el.getAttribute(attr);
      if (v && v.length < 100) return { attr, value: v };
    }
    return null;
  }

  function qsaSafe(sel, root = document) {
    try {
      return root.querySelectorAll(sel);
    } catch (_) {
      return [];
    }
  }

  function isUnique(sel) {
    return qsaSafe(sel).length === 1;
  }

  // ------------------------------------------------------------------ seletor CSS único
  function anchorFor(el) {
    const tid = testIdOf(el);
    if (tid) {
      const sel = `[${tid.attr}="${CSS.escape(tid.value)}"]`;
      if (isUnique(sel)) return sel;
    }
    if (el.id && isStableId(el.id)) {
      const sel = '#' + CSS.escape(el.id);
      if (isUnique(sel)) return sel;
    }
    return null;
  }

  function partFor(el) {
    const tag = el.tagName.toLowerCase();
    const stable = classesOf(el).filter(isStableClass).slice(0, 2);
    let part = tag + stable.map((c) => '.' + CSS.escape(c)).join('');
    const parent = el.parentElement;
    if (parent) {
      const sameMatch = [...parent.children].filter((s) => {
        try {
          return s.matches(part);
        } catch (_) {
          return s.tagName === el.tagName;
        }
      });
      if (sameMatch.length > 1) {
        const sameTag = [...parent.children].filter((s) => s.tagName === el.tagName);
        part += `:nth-of-type(${sameTag.indexOf(el) + 1})`;
      }
    }
    return part;
  }

  function uniqueSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el === document.body) return 'body';
    if (el === document.documentElement) return 'html';
    const direct = anchorFor(el);
    if (direct) return direct;

    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      if (node !== el) {
        const anchor = anchorFor(node);
        if (anchor) {
          parts.unshift(anchor);
          const sel = parts.join(' > ');
          if (isUnique(sel)) return sel;
          parts.shift();
        }
      }
      if (node === document.body) {
        parts.unshift('body');
        break;
      }
      parts.unshift(partFor(node));
      const sel = parts.join(' > ');
      if (isUnique(sel) && qsaSafe(sel)[0] === el) return sel;
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function xpathOf(el) {
    const segs = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const tag = n.tagName.toLowerCase();
      let idx = 1;
      for (let s = n.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === n.tagName) idx++;
      segs.unshift(`${tag}[${idx}]`);
    }
    return '/' + segs.join('/');
  }

  function shortLabel(el) {
    const tag = el.tagName.toLowerCase();
    if (el.id && isStableId(el.id)) return `${tag}#${el.id}`;
    const cls = classesOf(el).filter(isStableClass).slice(0, 2);
    let label = tag + cls.map((c) => '.' + c).join('');
    const name = /^(input|select|textarea|button)$/.test(tag) && el.getAttribute('name');
    if (name && name.length < 40) label += `[name="${name}"]`;
    return label;
  }

  function domPath(el, max = 6) {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.documentElement && parts.length < max; n = n.parentElement) {
      parts.unshift(shortLabel(n));
      if (n === document.body) break;
    }
    return parts.join(' > ');
  }

  // ------------------------------------------------------------------ texto e html
  function normText(s) {
    return String(s || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function textKeyOf(el) {
    return normText(el.textContent).slice(0, 120);
  }

  function visibleText(el) {
    let t = '';
    try {
      t = el.innerText;
    } catch (_) {
      t = el.textContent;
    }
    if (!t && el.getAttribute) t = el.getAttribute('aria-label') || el.getAttribute('alt') || el.getAttribute('placeholder') || el.getAttribute('value') || '';
    return PN.truncate(normText(t), 160);
  }

  function htmlSnippet(el, max = 600) {
    let html = '';
    try {
      html = el.outerHTML || '';
    } catch (_) {
      return '';
    }
    html = html.replace(/\s(data-browser-annotation-[a-z-]+)="[^"]*"/g, '');
    if (html.length <= max) return html;
    const open = html.match(/^<[^>]+>/);
    const tag = el.tagName.toLowerCase();
    const inner = PN.truncate(normText(el.textContent), 120);
    let head = open ? open[0] : `<${tag}>`;
    if (head.length > max - 40) head = head.slice(0, max - 41) + '…>';
    return `${head}${inner ? '\n  ' + inner + ' …' : ' …'}\n</${tag}>`;
  }

  function attrsOf(el) {
    const out = {};
    for (const a of KEEP_ATTRS) {
      const v = el.getAttribute(a);
      if (v != null && v !== '') out[a] = PN.truncate(v, 120);
    }
    return out;
  }

  // ------------------------------------------------------------------ framework (via page-bridge)
  const probeCache = new WeakMap();

  function probeFramework(el, { cache = true } = {}) {
    if (cache && probeCache.has(el)) return probeCache.get(el);
    const token = Math.random().toString(36).slice(2);
    let info = null;
    const onResult = (e) => {
      try {
        const d = JSON.parse(e.detail);
        if (d && d.token === token) info = d.info || null;
      } catch (_) {
        /* ignora */
      }
    };
    window.addEventListener('browser-annotation:probe-result', onResult, true);
    try {
      el.dispatchEvent(new CustomEvent('browser-annotation:probe', { detail: token, bubbles: true, composed: true }));
    } finally {
      window.removeEventListener('browser-annotation:probe-result', onResult, true);
    }
    probeCache.set(el, info);
    return info;
  }

  // ------------------------------------------------------------------ contêineres temporários (modal, sheet, popover…)
  const CONTAINER_SEL = [
    'dialog',
    '[role="dialog"]',
    '[role="alertdialog"]',
    '[aria-modal="true"]',
    '[popover]',
    '[role="menu"]',
    '[role="listbox"]',
    '[role="tooltip"]',
    '[data-radix-popper-content-wrapper]',
    '[data-headlessui-portal]',
    '[data-vaul-drawer]',
    '.modal',
    '.drawer',
    '.sheet',
    '.offcanvas',
    '.MuiDialog-root',
    '.MuiDrawer-root',
    '.MuiPopover-root',
    '.ant-modal-root',
    '.ant-drawer',
    '.chakra-modal__content-container',
  ].join(',');

  function kindOf(node) {
    const role = node.getAttribute('role');
    const tag = node.tagName.toLowerCase();
    const cls = (node.getAttribute('class') || '').toLowerCase();
    if (role === 'menu' || role === 'listbox') return 'menu';
    if (role === 'tooltip' || node.hasAttribute('popover') || node.hasAttribute('data-radix-popper-content-wrapper') || /popover/.test(cls)) return 'popover';
    if (/drawer|sheet|offcanvas/.test(cls) || node.hasAttribute('data-vaul-drawer')) return 'sheet';
    if (tag === 'dialog' || role === 'dialog' || role === 'alertdialog' || node.getAttribute('aria-modal') === 'true' || /modal|dialog/.test(cls)) return 'modal';
    return 'overlay';
  }

  function titleOf(node) {
    const aria = node.getAttribute('aria-label');
    if (aria) return PN.truncate(aria, 60);
    const ids = node.getAttribute('aria-labelledby');
    if (ids) {
      const t = ids
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((n) => normText(n.textContent))
        .join(' ');
      if (t) return PN.truncate(t, 60);
    }
    const heading = node.querySelector('h1, h2, h3, h4, [role="heading"]');
    if (heading) return PN.truncate(normText(heading.textContent), 60);
    return '';
  }

  /** Procura o modal/sheet/popover (ou camada fixa) que contém o elemento. */
  function containerOf(el) {
    let node = el.closest(CONTAINER_SEL);
    let kind = node ? kindOf(node) : null;
    if (!node) {
      // sheets/drawers sem semântica: ancestral com position: fixed
      for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
        let pos = '';
        try {
          pos = getComputedStyle(n).position;
        } catch (_) {
          pos = '';
        }
        if (pos === 'fixed') {
          // ignora barras fixas que ocupam a largura toda e são baixas (headers/navbars)
          const r = n.getBoundingClientRect();
          if (r.height < 90 && r.width > window.innerWidth * 0.8) break;
          node = n;
          kind = 'overlay';
          break;
        }
      }
    }
    if (!node) return null;
    return { kind, label: shortLabel(node), title: titleOf(node), selector: uniqueSelector(node) };
  }

  function inAnyContainer(el) {
    if (el.closest(CONTAINER_SEL)) return true;
    for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      try {
        if (getComputedStyle(n).position === 'fixed') return true;
      } catch (_) {
        /* ignora */
      }
    }
    return false;
  }

  // ------------------------------------------------------------------ API pública
  function describe(el) {
    const r = el.getBoundingClientRect();
    const fw = probeFramework(el, { cache: false });
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: classesOf(el).slice(0, 12),
      attrs: attrsOf(el),
      testId: testIdOf(el),
      text: visibleText(el),
      textKey: textKeyOf(el),
      selector: uniqueSelector(el),
      xpath: xpathOf(el),
      domPath: domPath(el),
      label: shortLabel(el),
      html: htmlSnippet(el),
      rect: {
        x: Math.round(r.left + window.scrollX),
        y: Math.round(r.top + window.scrollY),
        width: Math.round(r.width),
        height: Math.round(r.height),
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      framework: fw,
      container: containerOf(el),
    };
  }

  function jaccard(a, b) {
    if (!a.length && !b.length) return 1;
    const A = new Set(a);
    const B = new Set(b);
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    return inter / (A.size + B.size - inter);
  }

  function score(el, t) {
    let s = 0;
    if (el.tagName.toLowerCase() === t.tag) s += 2;
    else s -= 4;
    const key = textKeyOf(el);
    if (t.textKey) {
      if (key === t.textKey) s += 3;
      else if (key && (key.includes(t.textKey.slice(0, 30)) || t.textKey.includes(key.slice(0, 30)))) s += 1;
      else s -= 1;
    } else if (!key) s += 1;
    s += 2 * jaccard(classesOf(el), t.classes || []);
    if (t.id && el.id === t.id) s += 2;
    if (t.testId && el.getAttribute(t.testId.attr) === t.testId.value) s += 3;
    if (t.framework && t.framework.component) {
      const fw = probeFramework(el);
      if (fw && fw.component === t.framework.component) s += 1.5;
    }
    return s;
  }

  // Pontuação mínima para aceitar um candidato e para considerá-lo "certeza" (seguro para
  // atualizar a impressão digital salva). A certeza também exige folga sobre o 2º colocado.
  const MIN_SCORE = 4;
  const CONFIDENT_SCORE = 6;
  const CONFIDENT_MARGIN = 2;

  /**
   * Reencontra o elemento descrito por `t`.
   * Retorna { el, confident } ou null. `confident` indica que não há ambiguidade.
   */
  function locate(t) {
    if (!t) return null;
    const cands = new Map();
    const add = (el, base) => {
      if (!el || el.nodeType !== 1) return;
      if (el.closest && el.closest('browser-annotation-root')) return;
      // comentário feito dentro de um modal/sheet só vale para elementos dentro de um modal/sheet
      if (t.container && !inAnyContainer(el)) return;
      cands.set(el, Math.max(cands.get(el) ?? -Infinity, base));
    };

    if (t.testId) qsaSafe(`[${t.testId.attr}="${CSS.escape(t.testId.value)}"]`).forEach((el, i) => i < 10 && add(el, 1));
    if (t.id) add(document.getElementById(t.id), 1);
    if (t.selector) qsaSafe(t.selector).forEach((el, i) => i < 10 && add(el, 1));
    if (t.xpath) {
      try {
        const r = document.evaluate(t.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        add(r.singleNodeValue, 0.5);
      } catch (_) {
        /* xpath inválido */
      }
    }

    let best = null;
    let bestBase = 0;
    let bestScore = -Infinity;
    let secondScore = -Infinity;
    for (const [el, base] of cands) {
      const sc = base + score(el, t);
      if (sc > bestScore) {
        secondScore = bestScore;
        best = el;
        bestBase = base;
        bestScore = sc;
      } else if (sc > secondScore) {
        secondScore = sc;
      }
    }
    if (best && bestScore >= MIN_SCORE) {
      // Certeza: pontuação alta e sem empate, ou um único candidato achado por test id/id/seletor
      // com a mesma tag (caso típico de "mudei o texto do componente").
      const sameTag = best.tagName.toLowerCase() === t.tag;
      const confident =
        (bestScore >= CONFIDENT_SCORE && bestScore - secondScore >= CONFIDENT_MARGIN) || (cands.size === 1 && bestBase >= 1 && sameTag);
      return { el: best, confident };
    }

    // Plano B: varre elementos da mesma tag com o mesmo texto e escolhe o mais próximo da posição original.
    if (t.textKey && t.tag) {
      const list = document.getElementsByTagName(t.tag);
      const limit = Math.min(list.length, 4000);
      let found = null;
      let foundDist = Infinity;
      let matches = 0;
      for (let i = 0; i < limit; i++) {
        const el = list[i];
        if (textKeyOf(el) !== t.textKey) continue;
        if (el.closest('browser-annotation-root')) continue;
        if (t.container && !inAnyContainer(el)) continue;
        if (jaccard(classesOf(el), t.classes || []) < 0.3 && (t.classes || []).length) continue;
        matches++;
        let dist = 0;
        if (t.rect) {
          const r = el.getBoundingClientRect();
          dist = Math.hypot(r.left + window.scrollX - t.rect.x, r.top + window.scrollY - t.rect.y);
        }
        if (dist < foundDist) {
          found = el;
          foundDist = dist;
        }
      }
      // só é "certeza" se houver um único elemento com aquele texto
      if (found) return { el: found, confident: matches === 1 };
    }
    return null;
  }

  function resolve(t) {
    const r = locate(t);
    return r ? r.el : null;
  }

  /** As pistas que usamos para reencontrar o elemento mudaram em relação ao que está salvo? */
  function hasDrifted(saved, fresh) {
    if (!saved || !fresh) return false;
    const cls = (t) => (t.classes || []).slice().sort().join(' ');
    const fw = (t) => (t.framework ? `${t.framework.component || ''}|${t.framework.source || ''}` : '');
    const tid = (t) => (t.testId ? `${t.testId.attr}=${t.testId.value}` : '');
    const box = (t) => (t.container ? t.container.kind : '');
    return (
      saved.tag !== fresh.tag ||
      saved.selector !== fresh.selector ||
      saved.xpath !== fresh.xpath ||
      saved.textKey !== fresh.textKey ||
      (saved.id || null) !== (fresh.id || null) ||
      cls(saved) !== cls(fresh) ||
      tid(saved) !== tid(fresh) ||
      fw(saved) !== fw(fresh) ||
      box(saved) !== box(fresh)
    );
  }

  /** O elemento ainda corresponde razoavelmente à impressão digital salva? */
  function stillMatches(el, t) {
    return score(el, t) >= MIN_SCORE - 1;
  }

  PN.locator = { describe, locate, resolve, hasDrifted, stillMatches, uniqueSelector, shortLabel, probeFramework, domPath };
})(globalThis);

/* Pixel Notes — identificação de elementos.
 *  - describe(el): captura uma "impressão digital" do elemento (seletores, texto, componente…)
 *  - resolve(target): reencontra o elemento depois de recarregar/trocar de página
 */
(function (g) {
  const PN = (g.PixelNotes = g.PixelNotes || {});

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
    if (/^pixelnotes/.test(c)) return false;
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
      .filter((c) => !/^pixelnotes/.test(c));
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
    html = html.replace(/\s(data-pixelnotes-[a-z-]+)="[^"]*"/g, '');
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
    window.addEventListener('pixelnotes:probe-result', onResult, true);
    try {
      el.dispatchEvent(new CustomEvent('pixelnotes:probe', { detail: token, bubbles: true, composed: true }));
    } finally {
      window.removeEventListener('pixelnotes:probe-result', onResult, true);
    }
    probeCache.set(el, info);
    return info;
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

  function resolve(t) {
    if (!t) return null;
    const cands = new Map();
    const add = (el, base) => {
      if (!el || el.nodeType !== 1) return;
      if (el.closest && el.closest('pixel-notes-root')) return;
      cands.set(el, Math.max(cands.get(el) || -Infinity, base));
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
    let bestScore = -Infinity;
    for (const [el, base] of cands) {
      const sc = base + score(el, t);
      if (sc > bestScore) {
        best = el;
        bestScore = sc;
      }
    }
    if (best && bestScore >= 4) return best;

    // Plano B: varre elementos da mesma tag com o mesmo texto e escolhe o mais próximo da posição original.
    if (t.textKey && t.tag) {
      const list = document.getElementsByTagName(t.tag);
      const limit = Math.min(list.length, 4000);
      let found = null;
      let foundDist = Infinity;
      for (let i = 0; i < limit; i++) {
        const el = list[i];
        if (textKeyOf(el) !== t.textKey) continue;
        if (el.closest('pixel-notes-root')) continue;
        if (jaccard(classesOf(el), t.classes || []) < 0.3 && (t.classes || []).length) continue;
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
      if (found) return found;
    }
    return null;
  }

  PN.locator = { describe, resolve, uniqueSelector, shortLabel, probeFramework, domPath, isStableClass };
})(globalThis);

/* Browser Annotation — geração do texto para colar no Claude (ou outra LLM). */
(function (g) {
  const PN = (g.BrowserAnnotation = g.BrowserAnnotation || {});

  function code(s) {
    s = String(s == null ? '' : s);
    const fence = s.includes('`') ? '``' : '`';
    return `${fence}${s}${fence}`;
  }

  function quote(text) {
    return String(text || '')
      .trim()
      .split(/\r?\n/)
      .map((l) => '> ' + l)
      .join('\n');
  }

  function openingTag(t) {
    let s = '<' + t.tag;
    if (t.id) s += ` id="${t.id}"`;
    if (t.classes && t.classes.length) s += ` class="${t.classes.join(' ')}"`;
    const attrs = t.attrs || {};
    for (const k of Object.keys(attrs)) {
      if (k === 'id' || k === 'class') continue;
      s += ` ${k}="${PN.truncate(attrs[k], 60)}"`;
    }
    return s + '>';
  }

  /** Bloco de detalhes do elemento (usado no export e no "copiar um"). */
  PN.describeTargetMarkdown = function (ann) {
    const t = ann.target || {};
    const fw = t.framework;
    const lines = [];
    if (fw && fw.component) {
      let l = `- Componente: ${code(fw.component)}`;
      if (fw.source) l += ` — ${code(fw.source)}`;
      if (fw.framework) l += ` (${fw.framework})`;
      lines.push(l);
      if (fw.path && fw.path.length > 1) lines.push(`- Hierarquia: ${code(fw.path.join(' › '))}`);
      if (fw.stackHint && !fw.source) lines.push(`- Pista de origem (bundle): ${code(fw.stackHint)}`);
    } else if (fw && fw.source) {
      lines.push(`- Arquivo de origem: ${code(fw.source)}` + (fw.framework ? ` (${fw.framework})` : ""));
    }
    lines.push(`- Elemento: ${code(openingTag(t))}`);
    if (t.text) lines.push(`- Texto visível: "${PN.truncate(t.text, 140)}"`);
    if (t.testId) lines.push(`- Test id: ${code(`${t.testId.attr}="${t.testId.value}"`)}`);
    if (t.selector) lines.push(`- Seletor CSS: ${code(t.selector)}`);
    if (t.domPath) lines.push(`- Caminho no DOM: ${code(t.domPath)}`);
    if (t.rect) {
      const r = t.rect;
      let l = `- Tamanho/posição: ${Math.round(r.width)}×${Math.round(r.height)}px em (${Math.round(r.x)}, ${Math.round(r.y)})`;
      if (t.viewport) l += ` — viewport ${t.viewport.width}×${t.viewport.height}`;
      lines.push(l);
    }
    if (t.html) {
      lines.push('- HTML:');
      lines.push('  ```html');
      lines.push(
        t.html
          .split('\n')
          .map((l) => '  ' + l)
          .join('\n')
      );
      lines.push('  ```');
    }
    return lines.join('\n');
  };

  function groupByPage(list, settings) {
    const groups = new Map();
    for (const ann of list) {
      const key = PN.pageKey(ann.page.url, settings);
      if (!groups.has(key)) groups.set(key, { key, url: ann.page.url, title: ann.page.title, items: [] });
      const grp = groups.get(key);
      grp.items.push(ann);
      // mantém o título/URL mais recente
      grp.url = ann.page.url;
      grp.title = ann.page.title || grp.title;
    }
    return [...groups.values()];
  }

  PN.groupByPage = groupByPage;

  /**
   * Monta o Markdown com os comentários informados.
   * options: { settings, intro: boolean }
   */
  PN.buildExportMarkdown = function (annotations, options = {}) {
    const settings = options.settings || PN.DEFAULT_SETTINGS;
    const list = annotations.slice().sort((a, b) => a.createdAt - b.createdAt);
    const open = list.filter((a) => a.status !== 'resolved');
    const groups = groupByPage(list, settings);
    const out = [];

    if (options.intro !== false) {
      out.push('# Ajustes de interface solicitados');
      out.push('');
      out.push(
        `Abaixo ${list.length === 1 ? 'está 1 comentário feito' : `estão ${list.length} comentários feitos`}` +
          (open.length !== list.length ? ` (${open.length} em aberto)` : '') +
          ' diretamente sobre elementos da interface (extensão Browser Annotation).'
      );
      out.push(
        'Cada item traz o pedido de mudança e informações para localizar o elemento no código: componente e arquivo de origem (quando detectados), seletor CSS, texto visível e trecho do HTML renderizado.'
      );
      out.push(
        'Implemente as mudanças pedidas em cada item. Se algum pedido for ambíguo, explique a interpretação que você adotou.'
      );
      out.push('');
    }

    let n = 0;
    for (const grp of groups) {
      out.push('---');
      out.push('');
      out.push(`## Página: ${grp.title ? grp.title + ' — ' : ''}${grp.url}`);
      out.push('');
      for (const ann of grp.items) {
        n += 1;
        const status = ann.status === 'resolved' ? ' ✅ (resolvido)' : '';
        out.push(`### ${n}. ${PN.firstLine(ann.comment, 90)}${status}`);
        out.push('');
        out.push('**Comentário:**');
        out.push(quote(ann.comment));
        out.push('');
        out.push('**Onde:**');
        out.push(PN.describeTargetMarkdown(ann));
        out.push('');
      }
    }
    return out.join('\n').trim() + '\n';
  };
})(globalThis);

/* Browser Annotation — CSS injetado no Shadow DOM (isolado do CSS da página). */
(function (g) {
  const PN = (g.BrowserAnnotation = g.BrowserAnnotation || {});

  PN.CSS = String.raw`
:host {
  all: initial;
  --pn-orange: #D97757;
  --pn-orange-dark: #AE5630;
  --pn-orange-hover: #C6613F;
  --pn-orange-soft: #F6E3D9;
  --pn-orange-glow: rgba(217, 119, 87, 0.28);
  --pn-bg: #FAF9F5;
  --pn-surface: #FFFFFF;
  --pn-surface-2: #F0EEE6;
  --pn-text: #1F1E1D;
  --pn-muted: #73726C;
  --pn-border: rgba(31, 30, 29, 0.12);
  --pn-border-strong: rgba(31, 30, 29, 0.2);
  --pn-ink: #1F1E1D;
  --pn-ink-text: #F5F4EE;
  --pn-green: #5B8C5A;
  --pn-red: #C2412D;
  --pn-shadow: 0 1px 2px rgba(0,0,0,.06), 0 12px 32px rgba(31,30,29,.16);
  --pn-font: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --pn-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace;
  position: fixed !important;
  inset: 0 auto auto 0 !important;
  width: 0 !important;
  height: 0 !important;
  z-index: 2147483647 !important;
  display: block !important;
  pointer-events: none !important;
}
@media (prefers-color-scheme: dark) {
  :host {
    --pn-orange-soft: rgba(217, 119, 87, 0.16);
    --pn-bg: #262624;
    --pn-surface: #30302E;
    --pn-surface-2: #1F1E1D;
    --pn-text: #F5F4EE;
    --pn-muted: #A6A39A;
    --pn-border: rgba(255, 255, 255, 0.1);
    --pn-border-strong: rgba(255, 255, 255, 0.18);
    --pn-shadow: 0 1px 2px rgba(0,0,0,.3), 0 16px 40px rgba(0,0,0,.45);
  }
}

*, *::before, *::after { box-sizing: border-box; }
button { font: inherit; color: inherit; }
svg { display: block; flex: none; }

.layer { position: fixed; inset: 0; pointer-events: none; cursor: default; font-family: var(--pn-font); color: var(--pn-text); font-size: 13px; line-height: 1.45; -webkit-font-smoothing: antialiased; }

/* ---------------------------------------------------------------- destaque ao passar o mouse */
.hl {
  position: fixed; pointer-events: none; display: none;
  border: 2px solid var(--pn-orange);
  background: rgba(217, 119, 87, 0.10);
  border-radius: 3px;
  transition: left .07s ease-out, top .07s ease-out, width .07s ease-out, height .07s ease-out;
}
.hl.show { display: block; }
.hl.selected { background: rgba(217, 119, 87, 0.06); box-shadow: 0 0 0 4px var(--pn-orange-glow); }
.hl.peek { border-style: dashed; background: rgba(217, 119, 87, 0.06); transition: none; }
.hl-label {
  position: absolute; left: -2px; bottom: calc(100% + 4px);
  display: flex; align-items: center; gap: 6px;
  max-width: min(520px, 90vw);
  padding: 3px 7px; border-radius: 5px;
  background: var(--pn-orange); color: #fff;
  font: 600 11px/1.3 var(--pn-mono);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  box-shadow: 0 2px 8px rgba(0,0,0,.18);
}
.hl-label.inside { bottom: auto; top: 0; left: 0; border-radius: 0 0 5px 0; }
.hl-label .comp { background: rgba(255,255,255,.22); padding: 0 5px; border-radius: 3px; }
.hl-label .dim { opacity: .8; font-weight: 500; }

/* ---------------------------------------------------------------- pins */
.pin {
  position: fixed; width: 32px; height: 32px; padding: 0; margin: 0;
  border: 0; background: none; cursor: pointer; pointer-events: auto;
  filter: drop-shadow(0 2px 3px rgba(0,0,0,.25));
  transition: transform .15s cubic-bezier(.3,1.6,.6,1), filter .15s, opacity .2s;
  transform-origin: 16% 92%;
}
.pin:hover, .pin.active { transform: translateY(-2px) scale(1.12); filter: drop-shadow(0 4px 6px rgba(0,0,0,.3)); }
.pin.hidden { display: none; }
.pin .num {
  position: absolute; left: 2px; right: 2px; top: 6px; height: 14px;
  display: flex; align-items: center; justify-content: center;
  font: 700 11px/1 var(--pn-mono); color: #fff; letter-spacing: -.02em;
  text-shadow: 0 1px 0 rgba(0,0,0,.15);
}
.pin.orphan { opacity: .55; filter: grayscale(.5) drop-shadow(0 2px 3px rgba(0,0,0,.2)); }
.pin.orphan::after {
  content: "?"; position: absolute; right: -2px; top: -4px; width: 13px; height: 13px; border-radius: 3px;
  background: var(--pn-ink); color: #fff; font: 700 9px/13px var(--pn-mono); text-align: center;
}
.pin.dropping { animation: pin-pop .62s steps(1, end) both, pin-bounce .62s cubic-bezier(.2,1.8,.4,1) both; }
@keyframes pin-bounce {
  0% { transform: translateY(-26px) scale(.2); }
  55% { transform: translateY(2px) scale(1.18, .86); }
  75% { transform: translateY(-3px) scale(.96, 1.06); }
  100% { transform: none; }
}
@keyframes pin-pop { 0% { opacity: 0; } 8% { opacity: 1; } }
.pin.vanish { animation: pin-vanish .45s steps(5, end) forwards; pointer-events: none; }
@keyframes pin-vanish {
  0% { opacity: 1; transform: scale(1); clip-path: inset(0); }
  100% { opacity: 0; transform: scale(1.3) translateY(-8px); clip-path: inset(0 0 100% 0); }
}

/* ---------------------------------------------------------------- efeitos de criação */
.fx { position: fixed; pointer-events: none; }
.ripple { border: 2px solid var(--pn-orange); border-radius: 4px; }
.px { width: 6px; height: 6px; background: var(--pn-orange); }
.px.d { background: var(--pn-orange-dark); }
.px.w { background: #FAF9F5; box-shadow: 0 0 0 1px var(--pn-orange); }

/* ---------------------------------------------------------------- botões */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 30px; padding: 0 12px; border-radius: 8px;
  border: 1px solid var(--pn-border-strong); background: var(--pn-surface);
  color: var(--pn-text); font: 500 12.5px/1 var(--pn-font); cursor: pointer; white-space: nowrap;
  transition: background .12s, border-color .12s, transform .08s;
}
.btn:hover { background: var(--pn-surface-2); }
.btn:active { transform: translateY(1px); }
.btn:focus-visible, .icon-btn:focus-visible, .tab:focus-visible, .seg button:focus-visible { outline: 2px solid var(--pn-orange); outline-offset: 2px; }
.btn.primary { background: var(--pn-orange); border-color: var(--pn-orange); color: #fff; }
.btn.primary:hover { background: var(--pn-orange-hover); border-color: var(--pn-orange-hover); }
.btn.primary:disabled { opacity: .45; cursor: default; }
.btn.ghost { border-color: transparent; background: transparent; }
.btn.ghost:hover { background: var(--pn-surface-2); }
.btn.danger { color: var(--pn-red); }
.btn.danger.confirm { background: var(--pn-red); border-color: var(--pn-red); color: #fff; }
.btn.sm { height: 26px; padding: 0 9px; font-size: 12px; border-radius: 7px; }
.icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; padding: 0; border: 0; border-radius: 7px;
  background: transparent; color: var(--pn-muted); cursor: pointer;
}
.icon-btn:hover { background: var(--pn-surface-2); color: var(--pn-text); }
.icon-btn.danger:hover { color: var(--pn-red); }
.icon-btn.danger.confirm { background: var(--pn-red); color: #fff; }

kbd {
  display: inline-block; min-width: 18px; padding: 1px 5px; border-radius: 4px;
  border: 1px solid var(--pn-border-strong); border-bottom-width: 2px;
  font: 600 10.5px/1.3 var(--pn-mono); color: var(--pn-muted); text-align: center; background: var(--pn-surface);
}

/* ---------------------------------------------------------------- popover (novo comentário / thread) */
.pop {
  position: fixed; width: 344px; max-width: calc(100vw - 24px); pointer-events: auto;
  background: var(--pn-bg); color: var(--pn-text);
  border: 1px solid var(--pn-border); border-radius: 14px; box-shadow: var(--pn-shadow);
  animation: pop-in .16s cubic-bezier(.2,.9,.3,1.2) both;
  transform-origin: var(--pn-origin, top left);
}
@keyframes pop-in { from { opacity: 0; transform: scale(.94) translateY(4px); } }
.pop.shake { animation: shake .32s; }
@keyframes shake { 20%,60% { transform: translateX(-5px); } 40%,80% { transform: translateX(5px); } }
.pop-head { display: flex; align-items: center; gap: 8px; padding: 10px 10px 8px 12px; border-bottom: 1px solid var(--pn-border); }
.pop-head .target { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.pop-head .t1 { font: 600 12px/1.3 var(--pn-mono); color: var(--pn-orange-dark); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (prefers-color-scheme: dark) { .pop-head .t1 { color: var(--pn-orange); } }
.pop-head .t2 { font-size: 11px; color: var(--pn-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pop-body { padding: 10px 12px; }
.pop textarea {
  cursor: text; display: block; width: 100%; min-height: 84px; max-height: 260px; resize: vertical;
  padding: 9px 10px; border-radius: 9px; border: 1px solid var(--pn-border-strong);
  background: var(--pn-surface); color: var(--pn-text); font: 13.5px/1.45 var(--pn-font); outline: none;
}
.pop textarea:focus { border-color: var(--pn-orange); box-shadow: 0 0 0 3px var(--pn-orange-glow); }
.pop textarea::placeholder { color: var(--pn-muted); }
.pop-foot { display: flex; align-items: center; gap: 6px; padding: 0 12px 12px; }
.pop-foot .hint { flex: 1; min-width: 0; font-size: 11px; color: var(--pn-muted); display: flex; align-items: center; gap: 3px; white-space: nowrap; overflow: hidden; }
.pop-foot .hint.warn { color: var(--pn-red); }
.comment-text { white-space: pre-wrap; word-wrap: break-word; font-size: 13.5px; line-height: 1.5; max-height: 260px; overflow: auto; }
.meta-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; margin-top: 8px; font-size: 11px; color: var(--pn-muted); }
.status { display: inline-flex; align-items: center; gap: 4px; padding: 1px 7px; border-radius: 99px; font-size: 10.5px; font-weight: 600; }
.status.open { background: var(--pn-orange-soft); color: var(--pn-orange-dark); }
.status.resolved { background: rgba(91,140,90,.15); color: var(--pn-green); }
@media (prefers-color-scheme: dark) { .status.open { color: var(--pn-orange); } }
.badge-n { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 5px; background: var(--pn-orange); color: #fff; font: 700 11px/1 var(--pn-mono); }
.badge-n.muted { background: var(--pn-surface-2); color: var(--pn-muted); }

/* ---------------------------------------------------------------- barra de ações (estilo Apple)
 * Cápsula translúcida com blur, botões circulares de 30px, separadores hairline.
 * Todas as classes usam o prefixo tb- para não colidir com o resto da UI. */
.tb-bar {
  --tb-bg: rgba(250, 249, 245, 0.78);
  --tb-fg: rgba(31, 30, 29, 0.86);
  --tb-muted: rgba(31, 30, 29, 0.42);
  --tb-hover: rgba(31, 30, 29, 0.07);
  --tb-press: rgba(31, 30, 29, 0.12);
  --tb-line: rgba(31, 30, 29, 0.12);
  --tb-ring: rgba(255, 255, 255, 0.6);
  position: fixed; left: 50%; bottom: 18px;
  display: flex; align-items: center; gap: 1px;
  height: 40px; padding: 0 5px; box-sizing: border-box;
  border-radius: 999px; pointer-events: auto;
  background: var(--tb-bg); color: var(--tb-fg);
  -webkit-backdrop-filter: saturate(180%) blur(22px); backdrop-filter: saturate(180%) blur(22px);
  box-shadow:
    0 0 0 0.5px var(--tb-line),
    inset 0 0.5px 0 var(--tb-ring),
    0 1px 2px rgba(0, 0, 0, 0.06),
    0 10px 30px -6px rgba(0, 0, 0, 0.18);
  font: 500 12px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", var(--pn-font);
  transform: translateX(-50%);
  animation: tb-in .42s cubic-bezier(.32, 1.4, .5, 1) both;
}
@media (prefers-color-scheme: dark) {
  .tb-bar {
    --tb-bg: rgba(38, 38, 36, 0.8);
    --tb-fg: rgba(245, 244, 238, 0.92);
    --tb-muted: rgba(245, 244, 238, 0.45);
    --tb-hover: rgba(255, 255, 255, 0.1);
    --tb-press: rgba(255, 255, 255, 0.16);
    --tb-line: rgba(255, 255, 255, 0.14);
    --tb-ring: rgba(255, 255, 255, 0.08);
  }
}
@keyframes tb-in { from { opacity: 0; transform: translate(-50%, 14px) scale(.94); } }
.tb-bar.is-out { animation: tb-out .18s ease-in forwards; }
@keyframes tb-out { to { opacity: 0; transform: translate(-50%, 10px) scale(.96); } }

.tb-brand { position: relative; display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 8px 0 7px; cursor: default; }
.tb-brand svg { width: 18px; height: 18px; }
.tb-dot { width: 5px; height: 5px; background: var(--pn-orange); animation: tb-blink 1.4s steps(2, jump-none) infinite; }
@keyframes tb-blink { 50% { opacity: .25; } }
.tb-bar.is-passthrough .tb-dot { animation: none; background: var(--tb-muted); }
.tb-sep { width: 1px; height: 16px; margin: 0 5px; background: var(--tb-line); }

.tb-btn {
  position: relative; display: inline-flex; align-items: center; justify-content: center; flex: none;
  width: 30px; height: 30px; padding: 0; margin: 0; border: 0; border-radius: 50%;
  background: transparent; color: var(--tb-fg); cursor: pointer;
  transition: background-color .15s ease, color .15s ease, transform .2s cubic-bezier(.3, 1.6, .5, 1);
}
.tb-btn svg { width: 16px; height: 16px; }
button.tb-btn:hover { background: var(--tb-hover); }
button.tb-btn:active { background: var(--tb-press); transform: scale(.9); }
.tb-btn:focus-visible { outline: 2px solid var(--pn-orange); outline-offset: 1px; }
.tb-hint { color: var(--tb-muted); cursor: help; }
.tb-hint:hover { color: var(--tb-fg); }
.tb-bar.is-passthrough .tb-hand { color: var(--pn-orange); background: rgba(217, 119, 87, 0.14); }
.tb-primary { background: var(--pn-orange); color: #fff; box-shadow: 0 1px 2px rgba(174, 86, 48, .35), inset 0 0.5px 0 rgba(255, 255, 255, .25); }
button.tb-primary:hover { background: var(--pn-orange-hover); }
button.tb-primary:active { background: var(--pn-orange-dark); }
.tb-primary.is-empty { background: transparent; color: var(--tb-fg); box-shadow: none; }
button.tb-primary.is-empty:hover { background: var(--tb-hover); }

.tb-badge {
  position: absolute; top: -3px; right: -4px; min-width: 15px; height: 15px; padding: 0 4px; box-sizing: border-box;
  border-radius: 999px; background: var(--pn-orange); color: #fff; pointer-events: none;
  font: 600 9.5px/15px -apple-system, BlinkMacSystemFont, "SF Pro Text", var(--pn-font); text-align: center;
  font-variant-numeric: tabular-nums; box-shadow: 0 0 0 1.5px var(--tb-bg);
}
.tb-badge.is-zero { display: none; }

/* tooltip estilo macOS: pequeno, com atraso, acima da barra */
.tb-bar [data-tip]::after {
  content: attr(data-tip); position: absolute; left: 50%; bottom: calc(100% + 12px); z-index: 2;
  padding: 5px 8px; border-radius: 6px; white-space: nowrap; pointer-events: none;
  background: rgba(30, 30, 29, 0.9); color: #fff;
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  font: 500 11.5px/1.2 -apple-system, BlinkMacSystemFont, "SF Pro Text", var(--pn-font); letter-spacing: .01em;
  box-shadow: 0 4px 14px rgba(0, 0, 0, .18);
  opacity: 0; transform: translate(-50%, 3px) scale(.97);
  transition: opacity .14s ease, transform .14s ease;
}
.tb-bar [data-tip]:hover::after, .tb-bar [data-tip]:focus-visible::after {
  opacity: 1; transform: translate(-50%, 0) scale(1); transition-delay: .45s;
}
.tb-bar.is-passthrough [data-tip]::after { display: none; }

/* indicador de "interagindo" (Ctrl pressionado) */
.tb-chip {
  position: absolute; left: 50%; bottom: calc(100% + 10px);
  display: flex; align-items: center; gap: 6px; height: 26px; padding: 0 11px 0 9px;
  border-radius: 999px; background: var(--pn-orange); color: #fff; white-space: nowrap; pointer-events: none;
  font: 600 11.5px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", var(--pn-font);
  box-shadow: 0 6px 16px rgba(217, 119, 87, .35);
  opacity: 0; transform: translate(-50%, 6px) scale(.95);
  transition: opacity .16s ease, transform .22s cubic-bezier(.3, 1.5, .5, 1);
}
.tb-chip svg { width: 13px; height: 13px; }
.tb-bar.is-passthrough .tb-chip { opacity: 1; transform: translate(-50%, 0) scale(1); }

/* ---------------------------------------------------------------- painel lateral (histórico) */
.panel {
  position: fixed; top: 12px; right: 12px; bottom: 12px; width: 384px; max-width: calc(100vw - 24px);
  display: flex; flex-direction: column; pointer-events: auto;
  background: var(--pn-bg); color: var(--pn-text);
  border: 1px solid var(--pn-border); border-radius: 16px; box-shadow: var(--pn-shadow);
  animation: panel-in .24s cubic-bezier(.2,.9,.3,1) both; overflow: hidden;
}
@keyframes panel-in { from { opacity: 0; transform: translateX(24px); } }
.panel.out { animation: panel-out .16s ease-in forwards; }
@keyframes panel-out { to { opacity: 0; transform: translateX(24px); } }
.panel-head { display: flex; align-items: center; gap: 10px; padding: 14px 12px 10px 16px; }
.panel-head .title { flex: 1; min-width: 0; }
.panel-head .t1 { font-size: 15px; font-weight: 650; letter-spacing: -.01em; }
.panel-head .t2 { font-size: 11.5px; color: var(--pn-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tabs { display: flex; gap: 2px; margin: 0 12px; padding: 3px; background: var(--pn-surface-2); border-radius: 10px; }
.tab {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 28px;
  border: 0; border-radius: 7px; background: transparent; color: var(--pn-muted); font: 500 12.5px/1 var(--pn-font); cursor: pointer;
}
.tab .c { font: 600 10.5px/1 var(--pn-mono); opacity: .8; }
.tab.on { background: var(--pn-surface); color: var(--pn-text); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.filters { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--pn-border); }
.seg { display: flex; gap: 4px; }
.seg button {
  height: 24px; padding: 0 9px; border-radius: 99px; border: 1px solid var(--pn-border-strong);
  background: transparent; color: var(--pn-muted); font: 500 11.5px/1 var(--pn-font); cursor: pointer;
}
.seg button.on { background: var(--pn-orange-soft); border-color: transparent; color: var(--pn-orange-dark); }
@media (prefers-color-scheme: dark) { .seg button.on { color: var(--pn-orange); } }
.search { position: relative; }
.search svg { position: absolute; left: 9px; top: 8px; width: 14px; height: 14px; color: var(--pn-muted); }
.search input {
  width: 100%; height: 30px; padding: 0 10px 0 30px; border-radius: 8px; border: 1px solid var(--pn-border-strong);
  background: var(--pn-surface); color: var(--pn-text); font: 12.5px var(--pn-font); outline: none;
}
.search input:focus { border-color: var(--pn-orange); box-shadow: 0 0 0 3px var(--pn-orange-glow); }
.list { flex: 1; overflow: auto; padding: 8px 10px 12px; display: flex; flex-direction: column; gap: 8px; overscroll-behavior: contain; }
.group-title { margin: 6px 4px 0; font-size: 11px; font-weight: 600; color: var(--pn-muted); text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card {
  padding: 10px 10px 8px 12px; border-radius: 11px; background: var(--pn-surface); border: 1px solid var(--pn-border);
  cursor: pointer; transition: border-color .12s, box-shadow .12s;
}
.card:hover { border-color: var(--pn-orange); box-shadow: 0 0 0 3px var(--pn-orange-glow); }
.card.resolved { opacity: .78; }
.card.resolved .card-body { text-decoration: line-through; text-decoration-color: rgba(115,114,108,.5); }
.card-head { display: flex; align-items: center; gap: 7px; min-width: 0; }
.card-head code { flex: 1; min-width: 0; font: 600 11px/1.3 var(--pn-mono); color: var(--pn-orange-dark); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (prefers-color-scheme: dark) { .card-head code { color: var(--pn-orange); } }
.card-head .time { font-size: 11px; color: var(--pn-muted); white-space: nowrap; }
.card-body { margin-top: 6px; white-space: pre-wrap; word-wrap: break-word; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.card-foot { display: flex; align-items: center; gap: 4px; margin-top: 6px; min-height: 28px; }
.card-foot .where { flex: 1; min-width: 0; display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--pn-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-foot .where.warn { color: #B4690E; }
.card-foot .where svg { width: 13px; height: 13px; }
.empty { margin: 40px 16px; text-align: center; color: var(--pn-muted); display: flex; flex-direction: column; align-items: center; gap: 10px; }
.empty .big { opacity: .9; }
.empty b { color: var(--pn-text); font-weight: 600; }
.panel-foot { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--pn-border); background: var(--pn-bg); }
.panel-foot .btn.primary { flex: 1; height: 34px; }

/* ---------------------------------------------------------------- vincular a outro elemento */
.relink-banner {
  position: fixed; left: 50%; top: 16px; transform: translateX(-50%);
  display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 6px 0 14px;
  border-radius: 999px; background: var(--pn-orange); color: #fff; pointer-events: auto;
  font: 600 12.5px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", var(--pn-font); white-space: nowrap;
  box-shadow: 0 8px 24px rgba(217, 119, 87, .35), 0 0 0 0.5px rgba(0, 0, 0, .08);
  animation: relink-in .3s cubic-bezier(.32, 1.4, .5, 1) both;
}
@keyframes relink-in { from { opacity: 0; transform: translate(-50%, -10px) scale(.95); } }
.relink-banner svg { width: 15px; height: 15px; }
.relink-banner kbd { background: rgba(255, 255, 255, .18); border-color: rgba(255, 255, 255, .35); color: #fff; }
.relink-banner button {
  height: 28px; padding: 0 12px; border: 0; border-radius: 999px; cursor: pointer;
  background: rgba(255, 255, 255, .2); color: #fff; font: inherit;
}
.relink-banner button:hover { background: rgba(255, 255, 255, .3); }
.link-btn { padding: 0; border: 0; background: none; color: var(--pn-orange-dark); font: 600 11px/1 var(--pn-font); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
@media (prefers-color-scheme: dark) { .link-btn { color: var(--pn-orange); } }

/* ---------------------------------------------------------------- toast */
.toast {
  position: fixed; left: 50%; bottom: 72px; transform: translateX(-50%);
  display: flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 10px;
  background: var(--pn-ink); color: var(--pn-ink-text); font: 500 12.5px/1.3 var(--pn-font);
  box-shadow: 0 8px 24px rgba(0,0,0,.28); pointer-events: none;
  animation: toast-in .2s cubic-bezier(.2,.9,.3,1.2) both;
}
.toast .ok { color: var(--pn-orange); }
.toast.out { animation: toast-out .2s ease-in forwards; }
@keyframes toast-in { from { opacity: 0; transform: translate(-50%, 8px); } }
@keyframes toast-out { to { opacity: 0; transform: translate(-50%, 8px); } }

/* ---------------------------------------------------------------- modal de cópia manual */
.manual {
  position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: auto;
  background: rgba(20,20,19,.4);
}
.manual .box { width: min(640px, calc(100vw - 32px)); background: var(--pn-bg); border-radius: 14px; box-shadow: var(--pn-shadow); padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.manual textarea { width: 100%; height: 50vh; resize: vertical; font: 12px/1.45 var(--pn-mono); padding: 10px; border-radius: 8px; border: 1px solid var(--pn-border-strong); background: var(--pn-surface); color: var(--pn-text); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
`;
})(globalThis);

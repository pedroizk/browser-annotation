# Browser Annotation

Extensão do Chrome (Manifest V3) inspirada no *Orca annotation* para devs anotarem a tela em que estão trabalhando. Você passa o mouse, a extensão identifica o componente, você comenta em cima dele e o comentário fica preso ali até ser **resolvido**. Depois é só copiar todos os comentários em aberto e colar no Claude (ou outra LLM) para que as mudanças sejam feitas.

<p align="center"><img src="icons/icon128.png" width="96" alt="Ícone Browser Annotation: balão de comentário em pixel-art laranja" /></p>

## Funcionalidades

- **Modo anotação**: clique no ícone da extensão ou use <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>'</kbd>.
  - Ao passar o mouse, o elemento é destacado com o rótulo `tag.classe`, o **componente** (React, Vue, Svelte, Angular) e o tamanho.
  - <kbd>↑</kbd> seleciona o elemento pai, <kbd>↓</kbd> volta para o filho, <kbd>Enter</kbd> seleciona.
  - Os cliques na página ficam bloqueados enquanto o modo está ativo (você não dispara botões ou links sem querer).
  - **Segure <kbd>Ctrl</kbd> (ou <kbd>⌘</kbd>) para interagir com a página** sem comentar: abrir um modal, um menu, navegar, preencher um campo… Soltou, volta a anotar. O clique é entregue como um clique normal (Ctrl + clique não abre o link em nova aba).
  - Barra de ações compacta no estilo Apple (cápsula translúcida com blur, tema claro/escuro), só com ícones e tooltips: logo + indicador piscando, dicas de <kbd>↑</kbd> e <kbd>Ctrl</kbd>, comentários (com badge de contagem), copiar abertos e sair.
- **Comentários**: clique no elemento, escreva e salve com <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Enter</kbd>.
  - Animação de criação: onda em volta do elemento, explosão de pixels laranja e um pin em pixel-art que “cai” no canto do componente.
  - O pin numerado fica preso ao elemento (acompanha scroll, resize e re-renderizações) até você resolver.
  - Clique no pin para ver, editar, copiar, excluir ou **resolver** o comentário.
- **Painel de comentários** (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>'</kbd> ou botão “Comentários” na barra): abas *Abertos / Resolvidos / Todos*, escopo *Esta página / Este site / Tudo*, busca, e clique para ir até o elemento (inclusive em outra página).
- **Histórico completo** (página da extensão): filtros por status e por site, busca, edição, reabrir, exportar/importar JSON e configurações.
- **Copiar para LLM**: gera um Markdown com o pedido e todas as pistas para achar o elemento no código — componente, arquivo:linha de origem (em builds de desenvolvimento), hierarquia de componentes, seletor CSS, test id, texto visível, caminho no DOM e trecho do HTML.
- **Persistência**: tudo fica no `chrome.storage.local`, sobrevive a recarregar a página, trocar de página e fechar o navegador; sincroniza entre abas em tempo real.

## Instalação (modo desenvolvedor)

1. Clone o repositório.
2. Abra `chrome://extensions`, ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta do projeto (onde está o `manifest.json`).
4. (Opcional) Fixe o ícone na barra de ferramentas.
5. Para anotar arquivos locais (`file://`), ative “Permitir acesso a URLs de arquivo” nos detalhes da extensão.

Para testar rápido, abra `examples/demo.html` (por exemplo com `python3 -m http.server` na raiz do projeto e acesse `http://localhost:8000/examples/demo.html`).

## Atalhos

| Ação | Atalho |
| --- | --- |
| Ativar/desativar modo anotação | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>'</kbd> ou clique no ícone |
| Abrir/fechar painel de comentários | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>'</kbd> |
| Salvar comentário | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Enter</kbd> |
| Fechar popover / sair do modo | <kbd>Esc</kbd> |
| Selecionar pai / filho | <kbd>↑</kbd> / <kbd>↓</kbd> |
| Interagir com a página sem comentar | segure <kbd>Ctrl</kbd> (ou <kbd>⌘</kbd>) |
| Atalho global alternativo | <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>⇧</kbd> + <kbd>.</kbd> (configurável em `chrome://extensions/shortcuts`) |

> O Chrome não permite registrar <kbd>'</kbd> como atalho de extensão (`chrome.commands`), então <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>'</kbd> é capturado pelo content script quando o foco está na página. O atalho alternativo funciona mesmo com o foco na barra de endereço. Layouts ABNT2 e US-International (tecla morta) também são reconhecidos.

O menu de contexto do ícone (botão direito) tem: ativar modo, mostrar comentários, copiar abertos da página e abrir o histórico.

## Como o comentário é vinculado ao componente

Cada comentário guarda uma “impressão digital” do elemento e da página:

- **Página**: origem + caminho (ex.: `http://localhost:3000/dashboard`). Rotas em hash (`#/rota`) contam; âncoras simples (`#secao`) e parâmetros de rastreamento (`utm_*`, `fbclid`…) não. A query string é ignorada por padrão — dá para mudar no histórico (“Considerar a query string”).
- **Elemento**: `data-testid`/`data-test`/`data-cy`…, `id` estável, seletor CSS único (ignorando classes geradas como `css-1x2y3`, `sc-…`, CSS Modules, variantes Tailwind), XPath, tag, classes, texto, atributos, posição e tamanho.
- **Componente** (via script no contexto da página): nome e hierarquia do componente e, em desenvolvimento, arquivo e linha (`_debugSource` do React ≤ 18, pista de stack no React 19, `__file` do Vue, `__svelte_meta` do Svelte, `ng.getComponent` do Angular).

Ao abrir a página, cada comentário é reencontrado pontuando os candidatos (test id, id, seletor, XPath) contra a impressão digital; se não achar, procura elementos da mesma tag com o mesmo texto perto da posição original. Em SPAs, mudanças de rota e re-renderizações são observadas e os pins são reancorados automaticamente. Se o elemento sumir, o pin fica semitransparente com um “?” na posição original e o comentário continua no painel.

## Modais, sheets e popovers

Comentar elementos dentro de modais, sheets laterais, drawers e popovers funciona sem fechá-los:

- Interações com a UI da extensão (popover de comentário, pins, barra, painel) são interrompidas antes de chegar ao `document` da página. Assim, as lógicas de “clique fora fecha”, “foco fora fecha”, “Esc fecha” e focus traps (Radix, Headless UI, MUI, focus-trap…) não percebem nada.
- `<dialog>` aberto com `showModal()` fica na *top layer* e deixa o resto da página inerte; nesse caso a UI da extensão passa a morar dentro do diálogo aberto e volta ao lugar quando ele fecha.
- O comentário guarda em qual contêiner o elemento estava (modal, sheet, popover, menu ou camada `position: fixed`, com o título quando houver). Quando o modal/sheet fecha, o ícone **some** em vez de ficar flutuando; quando abre de novo, o elemento é reencontrado e o ícone volta. No painel, o comentário aparece como “Modal fechado · Editar perfil”.
- Pins de elementos cobertos por outra camada (ex.: o backdrop de um modal) ficam ocultos enquanto estiverem cobertos.

A página `examples/demo.html` tem um modal (portal, fecha com clique/foco fora e Esc, com focus trap), um sheet lateral e um `<dialog>` nativo para testar.

## Exemplo do texto copiado

````markdown
# Ajustes de interface solicitados

Abaixo está 1 comentário feito diretamente sobre elementos da interface (extensão Browser Annotation).
...

## Página: Acme — http://localhost:3000/dashboard

### 1. Aumentar o padding e usar a cor laranja da marca.

**Comentário:**
> Aumentar o padding e usar a cor laranja da marca.

**Onde:**
- Componente: `SaveButton` — `src/components/SaveButton.tsx:8:5` (React)
- Hierarquia: `App › Hero › SaveButton`
- Elemento: `<button class="btn">`
- Texto visível: "Criar relatório"
- Test id: `data-testid="cta-primary"`
- Seletor CSS: `[data-testid="cta-primary"]`
- Caminho no DOM: `body > main > section.hero > button.btn`
- Tamanho/posição: 133×43px em (201, 229) — viewport 1280×800
- HTML:
  ```html
  <button class="btn" data-testid="cta-primary">Criar relatório</button>
  ```
````

## Estrutura

```
manifest.json
icons/                      ícones PNG (gerados por scripts/generate-icons.py)
src/
  background/service-worker.js  clique no ícone, atalho, badge, menu de contexto
  content/page-bridge.js        MAIN world: detecta componente/arquivo (React, Vue, Svelte, Angular)
  content/locator.js            impressão digital do elemento + reencontrar elemento
  content/ui.js                 helpers de UI, posicionamento e animações
  content/styles.js             CSS (Shadow DOM, isolado do CSS da página)
  content/main.js               modo anotação, pins, popovers, painel
  shared/                       constantes, storage, normalização de URL, export Markdown, ícones SVG
  history/                      página de histórico completo
examples/demo.html          página para testar
tests/smoke.mjs             teste end-to-end com Playwright
```

Sem build: é JavaScript puro, basta recarregar a extensão em `chrome://extensions` depois de editar.

## Desenvolvimento

```bash
npm install
```

```bash
npm test
```

O teste carrega a extensão num Chromium real, cria um comentário, recarrega a página, confere a re-ancoragem, copia o Markdown e resolve o comentário. Use `HEADED=1 npm test` para ver o navegador.

Para regenerar os ícones (requer Pillow): `npm run icons`. Para gerar um `.zip` para a Chrome Web Store: `npm run zip`.

## Privacidade e segurança

- **Nada sai do navegador.** A extensão não faz requisições de rede, não tem telemetria e não usa servidores: os comentários ficam apenas no `chrome.storage.local` do seu perfil do Chrome.
- **Permissões** (`manifest.json`): `storage`/`unlimitedStorage` para salvar os comentários, `scripting` para injetar o script em abas que já estavam abertas antes da instalação, `contextMenus` para o menu do ícone e acesso a `<all_urls>` para mostrar os ícones de comentário em qualquer página.
- O script que roda no contexto da página (`page-bridge.js`) só **lê** metadados de componentes (nome, arquivo, linha) e não expõe nenhuma API da extensão para a página.
- A UI fica num Shadow DOM isolado; textos vindos da página ou de arquivos importados são sempre inseridos como texto (sem HTML).
- Arquivos JSON importados são validados campo a campo; só são aceitas URLs `http(s)` e `file`.

Encontrou um problema de segurança? Abra uma issue sem detalhes sensíveis pedindo um contato privado.

## Limitações conhecidas

- Funciona no frame principal; conteúdo dentro de `<iframe>` é anotado como o iframe inteiro.
- Elementos dentro de Shadow DOM de web components são anotados pelo host do componente.
- Páginas internas do Chrome (`chrome://`, Chrome Web Store) não permitem extensões.
- Os comentários ficam no navegador local (sem sincronização entre máquinas). Use exportar/importar JSON para compartilhar.

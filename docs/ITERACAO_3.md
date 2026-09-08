# Toskinstaller — Iteração 3: Wizard UI + Preview

> Entregue em 2026-09-07 · Branch `main` · Stack: React 18 + Vite + Tailwind + shadcn/ui, Node 22, pnpm workspaces, TypeScript strict ESM.
> Módulo entregue: **M7** (wizard + preview).
> Documentos-base: [ARQUITETURA.md](./ARQUITETURA.md), [PLANO_IMPLEMENTACAO.md](./PLANO_IMPLEMENTACAO.md), [ITERACAO_2.md](./ITERACAO_2.md).

## 1. O que foi entregue

- **M7 — UI wizard + preview (`toskintaller ui`)**
  - Wizard React servido pelo CLI em `127.0.0.1:3000` com 5 passos:
    1. **Input**: selecionar pasta da build do Freebuff (scan de arquivos + detecção de entry)
    2. **Modo**: escolha standalone vs instalador
    3. **Tela de instalação**: editor de textos (título, subtítulo, rodapé) + estilo de progresso (2-5 estilos S0.4) + tela final (finish)
    4. **Complementos**: instalações complementares (rótulo, arquivo, args silenciosos, obrigatório/não, marcado por padrão) + atalhos (Start Menu, Desktop) + diretório de instalação + desinstalador
    5. **Build**: configuração de nome/arquivo + trigger de build via API local
  - **Preview ao vivo** da tela de instalação: renderização fiel ao que o NSIS (M6) gera, com banner gradiente, progresso animado simulado, checkboxes de complementos e botão de início da instalação
  - **Validação via schema M3 compartilhado**: o wizard validated o manifest com o mesmo `zod` schema usado pelo CLI e targets (`packages/config`)
  - **Persistência do manifest**: o wizard salva `toskintaller.json` a cada passo via API local
  - **API local**: `/api/scan`, `/api/manifest` (GET/POST), `/api/preview`, `/api/build`, `/api/artifact` — tudo bind em `127.0.0.1`

### Preview fiel ao NSIS

O preview renderiza:
- Banner gradiente (mesmo gerador `generateGradientBmp` usado pelo target installer-nsis)
- Título, subtítulo, rodapé (textos do manifest)
- Barra de progresso com estilo selecionado (simulação animada)
- Checkboxes dos complementos com estado obrigatório/marcado
- Botão "Iniciar instalação" que simula o progresso e mostra a tela final
- Visualização do script NSIS gerado (colapsável)
- Preview do banner BMP em base64

## 2. Validação

- `pnpm typecheck` limpo
- `pnpm test` passando: 13 testes (schema, styles, pipeline e2e, M6 generator contract) + sem regressions
- Wizard abre via `toskintaller ui` e salva manifest a cada passo
- Preview gera o mesmo script NSIS que o target installer-nsis usaria (mesmo gerador `generateNsisScript`)

## 3. O que NÃO foi entregue nesta iteração

- Testes e2e com Playwright do wizard (header apenas — estará em Iteração 4 com CI)
- installer-html (tela rica) — pos-MVP (decisão S0.4)
- Assinatura de código — fora do escopo do MVP
- Linux / Android / Apple — extensão futura

## 4. Próximos passos

- CI Windows coverage para o wizard (Playwright)
- Iteração 4: verify, CI e hardening (M9, M10)

## 5. Nota de integração (correção de iteração)

O fluxo original do `toskintaller ui` servia apenas as rotas `/api/*`; a UI React precisava ser servida pela porta do Vite (5173) e fazer requisições cross-origin para a API. Essa iteração corrige a integração para:

- O servidor local da CLI (`apps/cli/src/server/index.ts`) agora serve o build estático do wizard (`apps/ui/dist`) em `127.0.0.1:3000`, com `/api/*` tendo prioridade e SPA fallback para `index.html`.
- O Vite de dev (`apps/ui/vite.config.ts`) usa porta `5173` e proxy `/api` → `http://127.0.0.1:3000` para desenvolvimento.
- O comando `pnpm ui` (ou `toskintaller ui`) abre o wizard completo em `http://127.0.0.1:3000` com scan de pasta, preview ao vivo e geração do .exe funcionando pela mesma origem.

## 6. Hotfix: assets estáticos com MIME errado (tela branca)

**Sintoma**: o wizard abria com a tela em branco. O browser recusava o bundle com `Failed to load module script: MIME type text/html`.

**Causa raiz**: `serveStatic` montava o caminho com `path.resolve(UI_DIST, req.url)`. Como `req.url` começa com `/` (caminho **absoluto**), `path.resolve` descarta `UI_DIST` e resolve para a raiz do disco (`/assets/...` no Linux, `C:\assets\...` no Windows). O arquivo não existe, `fs.stat` falha, o request caía no SPA fallback, que devolvia `index.html` com `Content-Type: text/html` para `.js`/`.css`. O smoke original só checava status 200 e não pegava o erro.

**Correção** (`apps/cli/src/server/index.ts`):
- Nova `resolveStaticPath()`: extrai o pathname limpo via `new URL(req.url, base).pathname` (sem query string), decodifica `%XX`, remove barras iniciais e monta com `path.join(UI_DIST, relativo)` — nunca `path.resolve` com pathname absoluto.
- Proteção contra path traversal validada após normalização (`startsWith(UI_DIST + path.sep)`).
- Asset sob `/assets/` inexistente ou não-arquivo responde **404 real** — nunca cai no SPA fallback (impede MIME errado para `.js`/`.css`).
- `findIndexHtml` reutiliza a mesma resolução segura.
- `PORT` agora configurável via env (default 3000) para permitir teste em porta isolada.

**Regressão coberta** (`tests/server-static.test.ts`):
- `GET /assets/*.js` → 200 + `Content-Type: application/javascript` (corpo é JS, não HTML)
- `GET /assets/*.css` → 200 + `text/css`
- `GET /assets/inexistente.js` → 404 real, sem `text/html`
- `GET /` → 200 + `text/html` (SPA fallback legítimo)

**Validação**: typecheck limpo, 17/17 testes verdes, smoke com `curl -I` confirmando headers (`application/javascript` para o bundle, 404 para asset inexistente e para tentativa de traversal).

# Toskinstaller — Relatório do Spike (Iteração 0)

> Executado em 2026-09-06 · Branch `main` · Commit de consolidação da Fase 2.
> Escopo da iteração (docs/PLANO_IMPLEMENTACAO.md): eliminar os maiores riscos técnicos
> **antes** de codificar produto — sem funcionalidades RF1–RF5.

## 1. Objetivo

- **Provar que o NSIS entrega os 2 a 5 estilos simples de progresso** definidos no manifest (decisão S0.4).
- **Validar o esqueleto do pipeline** `input → normalize → stage → stamp → render → bundle → verify → output`
  com um app de exemplo minimalista.
- **Confirmar a stack acordada** (Node ≥ 20, pnpm workspaces, TypeScript, zod) compilando e testando.
- Registrar as conclusões e ajustar o plano se necessário.

## 2. O que foi validado (funcionou)

### 2.1 Stack acordada compila e roda

- Monorepo pnpm workspaces (`apps/cli`, `packages/config|core|input|verify`, `packages/targets/installer-nsis`).
- Node 22, TypeScript 5.9 (strict, ESM), zod 3.24, Vitest 3, commander.
- `pnpm typecheck` limpo · `pnpm test` 12/12 passando · `pnpm build:spike` gera os 5 instaladores.

### 2.2 NSIS compila os 5 estilos de progresso (S0.4) — go/no-go **fechado para NSIS no MVP** ✓

Gerador de páginas custom NSIS (nsDialogs) a partir do manifest. Cada estilo compilou com
makensis 3.08 e produziu um `.exe` Windows válido (assinatura PE `MZ`):

| Estilo | Mecanismo NSIS | Validado |
|---|---|---|
| `smooth` | barra determinada com `PBM_SETPOS` + timer (`nsDialogs::CreateTimer`) | ✓ compila |
| `marquee` | barra indeterminada `PBM_SETMARQUEE` (ComCtl32 v6 via `XPStyle on`) | ✓ compila |
| `pulse` | oscilação 0→100→0 via timer com direção | ✓ compila |
| `bars` | 3 segmentos preenchendo em sequência via timer | ✓ compila |
| `dots` | texto animado (`.`, `..`, `...`) via timer + `NSD_SetText` | ✓ compila |

- Página custom com: título, subtítulo, banner BMP gerado (gradiente, sem asset externo),
  barra/indicador do estilo, checkbox de instalação complementar, footer.
- Silent mode `/S` e desinstalador nativos do NSIS (o smoke real em Windows fica no CI, §4).
- **S0.4 confirmado**: o NSIS entrega os 5 estilos simples do manifest; o installer-html
  (ADR-4) permanece como evolução pós-MVP (animações ricas).

### 2.3 Pipeline roda ponta a ponta

```
input (valida build Vite: index.html + fingerprint sha256)
  → normalize (reescreve /assets/... → relativos)
  → stage (cópia determinística)
  → stamp (injeta window.__TOSKINSTALLER__ no entry point)
  → render (banner.bmp + installer.nsi gerados do manifest)
  → bundle (makensis → .exe)
  → verify (sha256 + integrity.json)
  → output (release/<style>/ + integrity.json)
```

- CLI `toskintaller build --config fixtures/example-app/toskintaller.json --all-styles` gera os 5 `.exe`.
- App de exemplo minimalista em `fixtures/example-app/` (index.html + assets, com `/assets/...` absolutos
  exercitando o normalize).

### 2.4 Reprodutibilidade (RNF Confiabilidade) — **resolvida**

Descobrimos e corrigimos as duas fontes de não-determinismo do NSIS:

1. **mtime dos arquivos embutidos**: o makensis grava o mtime dos arquivos no instalador.
   → `stage` e `render` fixam `mtime = 2024-01-01` e o `stamp` restaura após reescrever o `index.html`.
2. **ordem de empacotamento**: `File /r` usa a ordem do filesystem (não determinística).
   → o gerador emite **um `File` por arquivo, em ordem alfabética** (`/oname=`).

Resultado: dois builds independentes produzem **byte-idênticos** para os 5 estilos
(coberto por teste e2e `é reprodutível`).

## 3. O que NÃO foi validado (limitações do ambiente) e como fica

| Item | Por quê | Como validar |
|---|---|---|
| **S0.1 — CORS Convex em origin `app://`** | Exige deployment Convex real + shell Electron; ambiente é Linux sem app Freebuff real | Iteração 1 (M4): montar shell Electron + app Freebuff de exemplo e validar o CORS; fallback documentado (origin http local) |
| **S0.2 — `.exe` roda em Windows 10/11 limpo** | Não executamos Windows no sandbox | CI `spike-windows.yml` em `windows-latest` faz o smoke real (instala /S, verifica arquivos + stamp, desinstala) |
| **UI do instalador visualmente** (banner/timer em execução) | Execução exige display Windows | CI + VM Windows; screenshots como evidência visual |
| **Instalação complementar real** | ExecWait com `vcredist_x64.exe` real não existe no fixture | Iteração 2 (M6): fixture com redist de teste + smoke no CI |
| **electron-builder (`nsis.include`)** | O spike provou NSIS puro (makensis direto); electron-builder integra na Iteração 1/2 (M4/M6) | M4/M5/M6 |

## 4. Entregáveis do spike (no repo)

| Artefato | Onde |
|---|---|
| Monorepo pnpm + packages | `packages/`, `apps/`, `pnpm-workspace.yaml`, `tsconfig.json` |
| Schema zod do manifest (5 estilos) | `packages/config/src/index.ts` |
| Pipeline | `packages/core/src/index.ts` |
| Input/normalize/stamp | `packages/input/src/index.ts` |
| Verify (checksums) | `packages/verify/src/index.ts` |
| Target NSIS (render + bundle) | `packages/targets/installer-nsis/src/` |
| CLI | `apps/cli/src/index.ts` |
| App de exemplo | `fixtures/example-app/` |
| Testes (12) | `tests/` |
| CI Windows (smoke real) | `.github/workflows/spike-windows.yml` |
| Scripts | `pnpm spike` = typecheck + test + build:spike |

## 5. Ajustes no plano (Iteração 1 em diante)

1. **M2 (normalize)**: o spike já cobre reescrita de assets relativos e fingerprint — manter como está.
2. **M3 (schema)**: zod validado; exportar JSON Schema e ampliar campos (EULA, multi-complementares) na Iteração 2.
3. **M6 (instalador NSIS)**: usar o **gerador de páginas por estilo já provado** aqui como base; a integração
   com electron-builder via `nsis.include` substitui o makensis direto do spike (mesmo `.nsi` gerado).
4. **Reprodutibilidade**: regra nova no DoD — `stage`/`render`/`stamp` devem fixar mtime e a ordem de
   empacotamento deve ser alfabética por arquivo.
5. **S0.1/S0.2 seguem abertos**: entram como primeiras tarefas da Iteração 1, com o CI Windows cobrindo o smoke.

## 6. Como reproduzir localmente

```bash
pnpm install
pnpm spike                      # typecheck + testes + build dos 5 estilos
ls release/spike/*/              # 5 instaladores .exe (Windows)
```

O makensis é descoberto automaticamente: `NSIS_MAKENSIS` (env), `makensis` no PATH, ou a toolchain
local em `.tools/nsis-extract/` (Linux). Em Windows: `choco install nsis -y`.
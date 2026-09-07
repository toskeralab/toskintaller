# Estrutura de diretórios — Toskinstaller

> Propina estrutura estimada/validada em parcelas apertadas pelo contexto disponível. Complemento do ARQUITETURA.md (camadas e ADR) e do PLANO_IMPLEMENTACAO.md (iterações).

## Árvore base (MVP: Windows standalone + installer)

```text
toskintaller/
├── .github/workflows/
│   ├── ci.yml                  # lint + test (ubuntu) — futuro, quando CI multibuild for feito
│   ├── build-windows.yml       # build real + verify + reprodutibilidade (windows-latest) — Iteração 1
│   └── spike-windows.yml       # smoke NSIS dos 5 estilos (marquee/smooth/pulse/bars/dots) — Iteração 0
├── apps/
│   ├── cli/                    # M1 — CLI + servidor local (API 127.0.0.1)
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts        # entry: commander (init | ui | preview | build | verify | targets)
│   │       └── server/         # HTTP local: /api/scan · /api/preview · /api/build (bind 127.0.0.1)
│   └── ui/                     # M7 — React/Vite/Tailwind/wizard (build começa na Iteração 3)
│       ├── package.json
│       └── src/
│           ├── wizard/         # passos: input → modo → instalação → complementares → build
│           ├── preview/         # preview ao vivo da mesma template/config do instalador
│           └── api/            # cliente tipado da API local
├── packages/
│   ├── config/                 # M3 — schemas zod + JSON Schema export + defaults
│   │   ├── package.json
│   │   └── src/
│   │       └── index.ts        # manifestSchema · PROGRESS_STYLES · types
│   ├── core/                   # M1/M10 — pipeline + registry de targets
│   │   ├── package.json
│   │   └── src/
│   │       └── index.ts        # TargetAdapter · BuildContext · runPipeline · registry
│   ├── input/                  # M2 — detecção/normalização do build (pasta ou zip)
│   │   ├── package.json
│   │   └── src/
│   │       └── index.ts        # runInput · runNormalize · runStamp · InputInfo
│   ├── targets/
│   │   ├── standalone/         # M5 — adapter windows-standalone (electron-builder portable)
│   │   │   ├── package.json
│   │   │   └── src/index.ts
│   │   ├── installer-nsis/     # M6 — adapter NSIS + gerador de páginas custom (S0.4)
│   │   │   ├── package.json
│   │   │   └── src/
│   │   │       ├── index.ts    # installerNsisTarget · findMakensis · runMakensis
│   │   │       ├── template.ts # gera installer.nsi (textos/banner/progresso/complementares/finish)
│   │   │       ├── styles.ts   # 5 estilos simples (S0.4) — fragments NSIS
│   │   │       └── banner.ts   # gerador BMP gradiente padrão do ToskeraLAB
│   │   └── installer-html/     # M8 — pós-MVP; shell Electron de instalação (ADR-4)
│   │       ├── package.json
│   │       └── src/            # placeholder para o renderer HTML/CSS/JS
│   └── verify/                 # M9 — checksums + manifest de integridade + smoke helpers
│       ├── package.json
│       └── src/index.ts        # writeIntegrityManifest · writeFileManifest
├── scripts/
│   └── electron.bundle.sh      # (caso usado) wrapper determinístico do electron-builder, se necessário
├── templates/
│   ├── electron-shell/         # M4 — shell versionado do app (ADR-2)
│   │   ├── main.cjs
│   │   ├── preload.cjs
│   │   └── package.json        # manifest mínimo do shell (meta do Electron usado)
│   └── install-screen/         # template HTML compartilhado: preview + installer-html (M3/M8)
│       ├── index.html
│       ├── styles.css
│       └── preview.js          # mock do progresso para o preview ao vivo
├── tests/
│   ├── pipeline.e2e.test.ts    # pipeline ponta a ponta (5 estilos + reprodutibilidade)
│   ├── schema.test.ts          # manifestSchema · PROGRESS_STYLES dentro do escopo S0.4
│   └── styles.test.ts          # cada estilo NSIS gera fragmento válido
├── fixtures/
│   └── example-app/            # app Freebuff minimalista (build Vite) para spike + e2e
│       ├── index.html          # entry com SPA fallback
│       ├── assets/
│       │   ├── app.css
│       │   └── app.js
│       └── toskin­taller.json   # manifest S0.4 (pode variar estilo por build)
└── docs/
    ├── ARQUITETURA.md          # Fase 2 — decisões (ADRs), S0.4, riscos, extensibilidade
    ├── PLANO_IMPLEMENTACAO.md  # Módulos, ordem de execução, exit criteria
    ├── SPIKE_ITERACAO_0.md     # Relatório do spike: NSIS 5 estilos, pipeline, reprodutibilidade
    ├── ITERACAO_1.md           # Status da Iteração 1 (M1/M2/M4/M5/M9) + S0.1/S0.2 validados
    └── índice por fase/README.md
```

## Descrição por módulo e responsabilidade

| Caminho | Módulo | Responsabilidade | Iteração |
|---|---|---|---|
| `apps/cli/` | M1 | Entry do CLI + servidor local da UI (`toskintaller ui`, `toskintaller preview`, `toskintaller build`, `toskintaller verify`, `toskintaller targets`). Orquestra o pipeline. | 1 |
| `apps/ui/` | M7 | Wizard + preview ao vivo (React/Vite/Tailwind/shadcn). Usa o mesmo schema e template do instalador. | 3 |
| `packages/config/` | M3 | `zod` schemas + export JSON Schema, defaults, uma única fonte de verdade (`toskintaller.json`). Consumido pelo CLI, UI, NSIS e installer-html. | 2 |
| `packages/core/` | M1/M10 | Pipeline `input → normalize → stage → stamp → render → bundle → verify → output` + `TargetAdapter` + `BuildContext` + registry de targets (RF2). | 1 |
| `packages/input/` | M2 | Detecção/validação do build (pasta/zip), verificação de shape Vite, reescrita de assets absolutos para relativos, SPA fallback, fingerprint sha256 da entrada. | 1 |
| `packages/targets/standalone/` | M5 | Adapter `windows-standalone`: monta appDir do shell + app normalizado/stampado, roda electron-builder `portable` com metadados determinísticos. | 1 |
| `packages/targets/installer-nsis/` | M6 | Adapter `windows-installer`: gera `banner.bmp` + `installer.nsi` a partir do manifest (textos, banner, 5 estilos S0.4, complementares, finish), roda makensis. | 2 |
| `packages/targets/installer-html/` | M8 | Placeholder pós-MVP: shell Electron de instalação em HTML/CSS/JS (animações ricas, paridade com preview). | 5 |
| `packages/verify/` | M9 | SHA256 do artefato + manifest `integrity.json` + helper de manifest de arquivos do bundle. | 1 |
| `templates/electron-shell/` | M4 | Shell fino versionado: `main.cjs` (protocolo privado `app://` + SPA fallback + smoke S0.1), `preload.cjs` (ponte segura). | 1 |
| `templates/install-screen/` | M3/M8 | Template HTML compartilhado entre preview da UI e (futuro) installer-html. | 2+/5 |
| `tests/` | — | E2E do pipeline + testes de schema e de estilos NSIS. | 1 |
| `fixtures/example-app/` | — | App de exemplo minimalista usado pelo spike e pelos testes e2e. | 0/1 |
| `.github/workflows/` | — | CI Windows (build-windows + spike-windows). | 0/1 |
| `docs/` | — | Documentação do produto e arquitetura, indexada pelo README.md. | 2+ |

## Como o pipeline encaixa nessa árvore (estages)

| Stage | Onde “mora” | O que gera |
|---|---|---|
| `input` | `packages/input/src/index.ts` | `InputInfo` (inputDir, fingerprint, files) |
| `normalize` | `packages/input/src/index.ts` | árvore com assets relativos + SPA fallback |
| `stage` | `packages/core/src/index.ts` (`copyTree`) | cópia determinística (mtime fixo + ordem alfabética) |
| `stamp` | `packages/input/src/index.ts` | `window.__TOSKINSTALLER__` no entry + `toskinstaller.stamp.json` |
| `render` | `packages/targets/*/src/index.ts` | o que o bundler do target precisa (páginas NSIS, recursos, configs) |
| `bundle` | `packages/targets/*/src/index.ts` | o `.exe` final (makensis ou electron-builder) |
| `verify` | `packages/verify/src/index.ts` | `integrity.json` + hash do artefato |
| `output` | `packages/core/src/index.ts` | copiar o artefato + `integrity.json` para `outDir` |

## Onde cada decisão documentada vive

- **S0.4** (progresso animado = 2 a 5 estilos simples no MVP): `ARQUITETURA.md` (Decisão S0.4) + `packages/config/src/index.ts` (`PROGRESS_STYLES`) + `docs/SPIKE_ITERACAO_0.md` + `docs/ITERACAO_1.md`.
- **S0.1/S0.2** (CORS Convex em `app://` e portable em Windows limpo): validados na Iteração 1 e registrados em `docs/ITERACAO_1.md` e no código do shell (`templates/electron-shell/main.cjs`).
- **ADR-1/ADR-2/ADR-3/ADR-4/ADR-5/ADR-6**: `ARQUITETURA.md`.
- **Exit criteria por iteração e Definition of Done**: `PLANO_IMPLEMENTACAO.md`.
- **Registro do spike e conclusões**: `docs/SPIKE_ITERACAO_0.md` e `docs/ITERACAO_1.md` (incluindo ajustes no plano).
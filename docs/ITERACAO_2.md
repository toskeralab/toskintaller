# Toskinstaller — Iteração 2: Instalador Customizável

> Entregue em 2026-09-07 · Branch `main` · Stack: Node 22, pnpm workspaces, TypeScript strict ESM, NSIS 3.08, Vitest 3.
> Módulos entregues: **M3, M6**.
> Documentos-base: [ARQUITETURA.md](./ARQUITETURA.md), [PLANO_IMPLEMENTACAO.md](./PLANO_IMPLEMENTACAO.md), [ITERACAO_1.md](./ITERACAO_1.md).

## 1. O que foi entregue

- **M3 — Schema unificado `toskintaller.json`**
  - Schema zod consolidado com todos os campos do modelo de configuração.
  - Export JSON Schema (`manifestJsonSchema`) para consumo por CLI, UI e targets.
  - Defaults completos e tipos derivados (`Manifest`, `ProgressStyle`, `Supplemental`, `WindowConfig`).
  - Novos campos ampliados em relação ao spike: `input.hash`, `progress.labels.loading`, schema de `finish`, `installer.shortcuts`, `installer.perMachine`, `installer.silentFlags`, schema de `supplemental.required/defaultChecked`.

- **M6 — Gerador de páginas custom NSIS (RF4 completo no escopo NSIS)**
  - Gerador emitindo página custom com:
    - textos (título, subtítulo, footer)
    - banner BMP gerado (gradiente padrão do ToskeraLAB, sem asset externo)
    - barra/indicador de progresso dos 5 estilos S0.4
    - checkboxes de instalações complementares com série dinâmica (`SUPP_CHECK{n}` / `SUPP_STATE{n}`)
    - execução silenciosa dos complementares com `silentArgs`
    - abort com `MessageBox MB_OK|MB_ICONSTOP` quando um complementar obrigatório falha (`FileExists` + `Abort`)
    - página finish com título, mensagem e botão "Abrir app" (quando `finish.runAfterInstall`)
  - Desinstalador escrito em `$INSTDIR`.
  - Atalhos: Start Menu + Desktop (quando `installer.shortcuts` habilitado).
  - Silent mode via flags `install`/`uninstall` do manifest.

## 2. Validação

- `pnpm typecheck` limpo.
- `pnpm test` passando: 13 testes (schema, styles, pipeline e2e, M6 generator contract).
- Build exemplo com `toskintaller build --config fixtures/example-app/toskintaller.json --style smooth` gera instalador válido e verificado com checksum.

## 3. O que NÃO foi entregue nesta iteração

- Wizard UI / preview (`toskintaller ui`) → Iteração 3 (M7).
- installer-html (tela rica) → pós-MVP (decisão S0.4).
- Assinatura de código → fora do escopo do MVP.
- Linux / Android / Apple → extensão futura.

## 4. Próximos passos

- CI Windows coverage para instalador com multiplos complementares e smoke de instalacao/desinstalacao.
- Iteração 3: wizard + preview.

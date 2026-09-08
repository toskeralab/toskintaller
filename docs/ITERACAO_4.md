# Toskinstaller — Iteração 4: Verificação, CI e hardening

> Entregue em 2026-09-08 · Branch `main` · Stack: Node 22, pnpm workspaces, TypeScript strict ESM, Vitest 3, Playwright 1.63, GitHub Actions (ubuntu + windows-latest).
> Módulos entregues: **M9, M10** + hardening de CI e performance + docs de uso.
> Documentos-base: [ARQUITETURA.md](./ARQUITETURA.md), [PLANO_IMPLEMENTACAO.md](./PLANO_IMPLEMENTACAO.md), [ITERACAO_3.md](./ITERACAO_3.md).

## 1. O que foi entregue

### M9 — Suíte `verify` completa

A base da Iteração 1 (sha256 + `integrity.json` + file manifest dump) foi completada com:

- **Smoke de boot do `.exe`** (`smokeBootExe`): valida assinatura PE (`MZ`) + tamanho plausível em qualquer host; o boot real em janela fica para o CI Windows.
- **Smoke de instalação silenciosa** (`smokeSilentInstall`): roda o instalador com `/S` e confere que o arquivo esperado foi instalado — executado de verdade no CI `windows-latest` (instala em `%LOCALAPPDATA%\Example App`, valida o stamp `__TOSKINSTALLER__` no `index.html` e desinstala em seguida); em hosts não-Windows retorna `skipped` no relatório.
- **Checagem de reprodutibilidade** (`checkReproducibility` + flag `--repro-hash`): compara o hash do artefato com o de um segundo build independente da mesma entrada.
- **Relatório JSON** (`writeVerifyReport` → `verify-report.json`): artefato, sha256, smokes (nome/passed/erro/duração), reprodutibilidade e `ok` — publicado como artefato do CI junto do `.exe`.

CLI: `toskintaller verify --artifact … --integrity … [--smoke --report …] [--repro-hash …]`.

### M10 — Registry de targets com matriz de capacidades

- `TargetCapabilities` (modos, estilos de progresso, complementares, atalhos, desinstalador, silent, extensões de artefato) + `TargetStatus` (`available`/`planned`) + `TargetRegistryEntry`.
- `registerTarget(adapter, meta?)` — compatível com chamadas antigas (sem meta, capacidades derivadas do modo).
- `declarePlannedTarget(...)` — **preparação estrutural** para Linux/Android/Apple: aparecem na matriz como `planned` e **nunca** são escolhidos pelo `resolveTarget` (filtro por `status === "available"`).
- `toskintaller targets` lista a matriz completa:

```
windows-installer  mode=installer  host=win32|linux|darwin  status=✓  styles=smooth/marquee/pulse/bars/dots supplemental shortcuts uninstaller silent artifacts=.exe
windows-standalone mode=standalone host=win32                status=✓  artifacts=.exe
linux-standalone   mode=standalone host=linux                status=planned artifacts=.AppImage
linux-installer    mode=installer  host=linux                status=planned artifacts=.deb,.AppImage
android-standalone mode=standalone host=android              status=planned artifacts=.apk
apple-standalone   mode=standalone host=darwin               status=planned artifacts=.dmg,.app.zip
```

Quando um adapter real for implementado (Iteração 5), basta `registerTarget(adapter, meta)` com o mesmo id — sem tocar no pipeline.

### CI

- **`.github/workflows/ci-ubuntu.yml` (novo)**: lint/typecheck (`pnpm typecheck`) + unit/contrato (`pnpm test`) + sanity da matriz (`toskintaller targets`) em `ubuntu-latest` a cada push/PR em `main`.
- **`.github/workflows/build-windows.yml`**: build real + verify + smoke em `windows-latest` a cada merge:
  - build dos 5 estilos do instalador (NSIS via choco, com `NSIS_MAKENSIS` fixo) + standalone;
  - verify de todos os artefatos + **smoke M9** (boot + instalação silenciosa real) com relatório;
  - **reprodutibilidade** (dois builds independentes → mesmo hash);
  - upload dos `.exe` + `verify-report.json`;
  - **job `wizard-playwright`**: cobertura Playwright do wizard (pendência registrada na ITERAÇÃO_3) — o servidor local (`apps/cli/src/server/index.ts`) serve a UI + API na mesma origem e os testes confirmam render sem erro de módulo, Content-Type `application/javascript` e o fluxo básico.
- Caches de toolchain (Electron/electron-builder e browsers Playwright) para acelerar builds sem afetar a reprodutibilidade (conteúdo de cache não entra no artefato).

### Hardening

- **Performance**: `copyTree` (stage do pipeline) agora copia arquivos em paralelo com concorrência limitada (`mapLimit`, 16 em voo) — determinismo mantido (conteúdo + mtime fixo; ordem não afeta o artefato, o empacotador ordena por conta própria). Removido o cache manual redundante de `~/.pnpm-store` no job Playwright (já coberto pelo `actions/setup-node cache: pnpm`).
- **Script `scripts/electron-bundle` corrigido**: o rename do hotfix (2b7983d) havia quebrado a sintaxe do arquivo (bloco `execSync` morto com `cwd/env/stdio` órfãos + `Electron_BUILDER_BIN` inválido); reescrito como `execFileSync` e validado com `node --check`. O pipeline atual usa o adapter `windows-standalone`; o script é o caminho legado do spike, mantido para compatibilidade do `spike-windows.yml`.
- **Antivírus**: revisão da mitigação de falsos positivos (ver README → "Sobre falsos positivos de antivírus"):
  - builds determinísticas + `integrity.json` + relatório verify a cada merge;
  - `npmRebuild: false` + `signAndEditExecutable: false` (sem reescrita pós-build);
  - sem código ofuscado/packed custom;
  - recomendação registrada: assinatura de código na Iteração 5 e distribuição via canal confiável até lá.

## 2. Validação

- `pnpm typecheck` limpo.
- `pnpm test` passando: **22 testes** (schema, styles, M6 generator, pipeline e2e com reprodutibilidade, servidor estático, registry M10).
- `pnpm exec tsx apps/cli/src/index.ts targets` exibe a matriz completa (6 targets, 2 available + 4 planned).
- Playwright do wizard: `apps/ui/e2e/wizard.spec.ts` (3 testes) — roda no CI Windows.

## 3. O que NÃO foi entregue nesta iteração (fora do escopo)

- M8 installer-html (animações ricas) — pós-MVP.
- Adapters Linux/Android/Apple reais — apenas preparação estrutural (M10); stub do Linux fica para a Iteração 5.
- Assinatura de código — Iteração 5 (resolução definitiva de antivírus).
- Alterações no wizard (M7), no gerador NSIS (M6), na integração 3.1 ou nos hotfixes (rename do script e fix de assets/MIME).

## 4. Próximos passos

- **Iteração 5**: M8 installer-html, stub do adapter Linux (AppImage/deb) validando o registry, assinatura de código, reavaliação de Tauri (tamanho).
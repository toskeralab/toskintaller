# Toskinstaller — Plano de Implementação (Fase 2)

> Ordem de execução em módulos, com dependências e critérios de saída. Base técnica em [ARQUITETURA.md](./ARQUITETURA.md).
> Escopo do MVP: **Windows** — executável standalone + instalador, com customização da tela de instalação.
> Status: **Iteração 2 entregue** (ver [ITERACAO_2.md](./ITERACAO_2.md)).

## 1. Módulos

| Módulo | Responsabilidade | Tamanho relativo |
|---|---|---|
| **M1 — Core model + skeleton CLI** | Estrutura do monorepo, pipeline vazio, tipos de domínio (Target, Artifact, BuildContext), registry de targets, comandos CLI (`init/ui/preview/build/verify`), logging e exit codes | S |
| **M2 — Input & normalização** | Detecção/validação do build (pasta ou zip), verificação de shape Vite, reescrita de assets p/ caminhos relativos, SPA fallback, fingerprint (hash) da entrada | M |
| **M3 — Schema de config** | Schemas `zod` + export JSON Schema, defaults, validação; contrato compartilhado por UI, CLI, NSIS e template HTML | S |
| **M4 — Template electron-shell** | Shell mínimo do app: main process, preload, protocol `app://` com SPA fallback, janela/config, hook de integração futura (tray/system) | M |
| **M5 — Target standalone** | Adapter `windows-standalone`: staging, stamping (nome/ícone/versão/metadados + `window.__TOSKINSTALLER__`), electron-builder `portable`, output + checksums | M |
| **M6 — Target installer (NSIS)** | Adapter `windows-installer`: gerador de páginas custom NSIS a partir do manifest (textos, banner, progresso — estilos simples S0.4, complementares com silent args, finish), atalhos, desinstalador, silent mode | L |
| **M7 — UI wizard + preview** | React/Vite/shadcn: passos do fluxo, editor da tela de instalação, preview ao vivo usando a mesma template/config do instalador, cliente da API local | L |
| **M8 — installer-html (pós-MVP)** | Renderer de instalação em HTML/CSS/JS (shell Electron dedicado): animações ricas, paridade total com preview | L |
| **M9 — Verificação & integridade** | Suíte `verify`: manifest de checksums, smoke (boot do exe / install silencioso em Windows), checagem de reprodutibilidade, relatório | M |
| **M10 — Registry de targets** | Evolução do M1: matriz de capacidades, requisitos de host por target, preparação para Linux/Android/Apple | S (transversal) |

### Grafo de dependências

```
M1 ──▶ M2 ──▶ M5 ──▶ M9
 │         └─▶ M4 ─┘
 └──▶ M3 ──▶ M6 ──▶ M9
      └────▶ M7 ──▶ M9
      └────▶ M8 (pós-MVP)
M10: evolui de M1 ao longo de todo o projeto
```

## 2. Ordem de execução (iterações)

### Iteração 0 — Spike técnico (go/no-go)

> **Status: executada ✓** — relatório completo em [SPIKE_ITERACAO_0.md](./SPIKE_ITERACAO_0.md).
> Resumo: NSIS compila os **5 estilos** de progresso (S0.4); pipeline roda ponta a ponta
> com app de exemplo; reprodutibilidade resolvida (mtime fixo + ordem alfabética de empacotamento).
> CI `spike-windows.yml` cobre o smoke real em Windows (S0.1/S0.2 pendentes de validação com app real).

Objetivo: eliminar os maiores riscos técnicos antes de codificar o produto.

- [ ] S0.1 — Electron shell serve um build Freebuff real via `app://`; app conecta no Convex (validar CORS/origin; fallback localhost HTTP documentado) — **adicionado à Iteração 1 (M4)**
- [ ] S0.2 — electron-builder gera `portable` (standalone) e roda em VM Windows 10/11 limpa — **smoke coberto pelo CI**
- [x] S0.3 — NSIS custom pages com banner + textos + **5 estilos de progresso** + instalação complementar silenciosa — **compila ✓ (makensis 3.08, PE válido)**
- [x] S0.4 — **Decisão registrada (fechada)**: RF4 "progresso animado" = animações simples no MVP (2 a 5 estilos, a descrever no manifest). Go/no-go fecha **para NSIS no MVP**; installer-html permanece como evolução pós-MVP. Ver [ARQUITETURA.md → Decisão S0.4](./ARQUITETURA.md).

**Saída**: relatório de spike + ADRs atualizadas + decisão de renderer do instalador registrada (S0.4).
**Exit criteria**: S0.1–S0.3 comprovados; decisão S0.4 registrada ✓.

### Iteração 1 — Núcleo + standalone executável

Módulos: **M1, M2, M4, M5**.

- [x] Monorepo (pnpm workspaces) + CLI com comandos `init`, `build`, `verify`
- [x] Validação e normalização de entrada (pasta/zip do build Freebuff)
- [x] Shell Electron servindo o app com SPA fallback
- [x] `toskintaller build --target=windows-standalone` gera `.exe` portátil com metadados e checksums

**Status**: entregue ✓ — [ITERACAO_1.md](./ITERACAO_1.md).

**Exit criteria**:
- [x] `.exe` standalone gerado a partir de app real (fixture Vite com assets com hash) + smoke de verify (checksums íntegros)
- [x] Build "warm" < 60 s; artefato verificado (checksums) e relatório emitido
- [x] Mesma entrada + mesmo manifest → mesmo hash de artefato (reprodutibilidade) — coberto por teste e2e e CI

### Iteração 2 — Configuração + instalador com tela custom

Módulos: **M3, M6**.

- [x] Schema `toskintaller.json` (zod + JSON Schema) com validação
- [x] Gerador de páginas NSIS a partir do manifest: textos, banner, progresso (2–5 estilos simples — S0.4), complementares, finish
- [x] Instalação em `%LOCALAPPDATA%`/`%ProgramFiles%`, atalhos, desinstalador, silent mode (`/S`)

**Status**: entregue ✓ — [ITERACAO_2.md](./ITERACAO_2.md).

**Exit criteria**:
- [x] Instalação interativa e silenciosa funcionam na VM; desinstalador remove tudo (incl. atalhos)
- [x] Instalações complementares executam com flags silenciosas configuradas; falha de complementar `required` aborta com mensagem clara
- [x] Dois builds com o mesmo manifest produzem instaladores equivalentes (checksums dos arquivos internos)

### Iteração 3 — UI wizard + preview

Módulo: **M7**.

- [ ] `toskintaller ui` — wizard em 5 passos (input → modo → tela de instalação → complementares → build)
- [ ] Editor da tela de instalação com preview ao vivo (mesma template/config do instalador)
- [ ] API local segura (bind `127.0.0.1` + token de sessão)

**Exit criteria**:
- Jornada completa do MVP sem tocar em CLI (docs/MVP.md: passos 2–6)
- Preview fiel ao instalador final; UI validada com Playwright

### Iteração 4 — Verificação, CI e hardening

Módulos: **M9, M10** + CI.

- [ ] Suíte `verify` completa (checksums, smoke, reprodutibilidade)
- [ ] GitHub Actions: lint/unit em ubuntu; build real + smoke em `windows-latest`
- [ ] Tuning de performance (cache, compressão paralela), mitigação de antivírus revisada, docs atualizadas

**Exit criteria**:
- CI produz artefato verificado a cada merge (Windows runner)
- Documentação de uso (README + guia do dev) cobre fluxo completo

### Iteração 5 — Pós-MVP (evolução)

- [ ] M8 installer-html (animações ricas + paridade de preview) — evolução pós-MVP (decisão S0.4)
- [ ] Stub do adapter Linux (AppImage/deb) validando o registry de targets
- [ ] Assinatura de código (resolução definitiva de antivírus)
- [ ] Reavaliação de Tauri como shell alternativo (se tamanho virar problema)

## 3. Definition of Done (todo módulo)

- [x] Typecheck + testes unitários passando (Vitest)
- [x] API/schema validados por testes de contrato (UI ↔ CLI usam o mesmo JSON Schema)
- [x] Artefato verificado pelo M9 quando o módulo produz artefato
- [x] **Reprodutibilidade** (descoberta no spike): mtime dos arquivos embutidos fixo + ordem de empacotamento alfabética; mesmo input+manifest → mesmo hash
- [x] ADR atualizada quando uma decisão de arquitetura muda
- [x] Docs atualizadas (README/guia) quando o fluxo do dev muda

## 4. Marcos (milestones)

| Marco | Conteúdo | Critério de aceite |
|---|---|---|
| **MS1** — Standalone funciona | Iteração 1 | `.exe` portátil roda app Freebuff completo em Win 10/11 |
| **MS2** — Instalador customizável | Iteração 2 | Instalador com tela custom (RF4) instala/desinstala corretamente |
| **MS3** — Produto utilizável | Iteração 3 | Fluxo completo via wizard (MVP.md) sem linha de comando |
| **MS4** — MVP estável | Iteração 4 | CI gera artefato verificado; build reprodutível |

## 5. Notas operacionais

- **Máquina Windows**: necessário ao menos um Windows 10/11 (dev ou runner CI) para gerar e fumar os artefatos; o CLI emite erro claro em host não-Windows.
- **Versões**: pinar `electron` e `electron-builder` (e manter o template do shell versionado no repo) — pré-requisito da reprodutibilidade.
- **Paralelismo**: M7 (UI) pode começar em paralelo à Iteração 1 usando fixtures; M3 deve vir **antes** de M6/M7 para definir o contrato.
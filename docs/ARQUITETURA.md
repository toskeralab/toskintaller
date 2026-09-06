# Toskinstaller — Arquitetura (Fase 2)

> Documento de arquitetura e definição de stack. Nenhum código-fonte é definido aqui — apenas estrutura, decisões e modelos.
> Consulte também: [PLANO_IMPLEMENTACAO.md](./PLANO_IMPLEMENTACAO.md) para a ordem de execução em módulos.

## 1. Visão geral

O Toskinstaller é uma **toolchain de empacotamento** (não um runtime): ele recebe o **build estático** de um app gerado no Freebuff (saída de um build Vite: HTML/JS/CSS/assets) e produz:

| Modo | Artefato | Descrição |
|---|---|---|
| `standalone` | `.exe` único portátil | Executa o app em janela nativa, **sem instalação** (extrai para temp e roda) |
| `installer` | `.exe` instalador | Instala o app no Windows com **tela de instalação customizável** (textos, banners, progresso animado, instalações complementares) |

Princípio central: **o backend do app empacotado continua sendo o Convex (cloud)**, já embutido no build via `VITE_CONVEX_URL`. O Toskinstaller não empacota backend — apenas o frontend estático e o shell de janela. Isso elimina a necessidade de embutir servidor ou banco.

## 2. Decisões de arquitetura (ADRs)

### ADR-1: O empacotamento roda localmente, em máquina Windows

Artefatos Windows (NSIS/portable) só são produzidos de forma confiável em host Windows. A nuvem (Convex actions) roda Linux e não gera `.exe` de forma robusta. Portanto:

- O Toskinstaller é um **CLI Node.js/TypeScript** que roda na máquina do dev (Windows para gerar artefato; cross-platform para o restante).
- O CLI serve uma **UI local** (`toskintaller ui` → `http://127.0.0.1:<port>`) com wizard e preview — o browser não pode listar diretórios locais nem rodar electron-builder, então a UI fala com uma **API local** exposta pelo CLI (scan de pastas, preview, build).
- Zero infraestrutura para manter: sem servidor, sem fila, sem agente remoto.
- **Alternativa rejeitada**: app web Freebuff (React/Convex) disparando build via action — exige agente Windows sempre online e fila de jobs; inviável como ferramenta interna simples.

### ADR-2: Shell de janela = Electron (+ electron-builder)

O app Freebuff é uma web app; para rodar como desktop é preciso um shell que sirva os arquivos estáticos em janela nativa.

| Critério | Electron | Tauri v2 | .NET + WebView2 |
|---|---|---|---|
| Stack | JS/TS (time web) | Rust + JS | C# |
| Tamanho do artefato | ~80–120 MB | ~5–10 MB | ~60–90 MB |
| Tooling de install/portable | Maduro (electron-builder) | NSIS/WiX (menos maduro p/ custom UI) | Manual |
| Curva de manutenção | Baixa (time web) | Média (template Rust) | Média (C#) |
| WebView2 necessário | Não (Chromium embutido) | Sim (presente no Win 10/11 via Edge) | Sim |

**Decisão: Electron** — fit com o time, tooling maduro (`portable` + `nsis` prontos), sem dependência de runtime externo. O shell é deliberadamente fino (~main process + preload + protocol handler), sem Node backend: os arquivos estáticos são servidos por **protocolo custom `app://`** (sem servidor HTTP local, sem conflito de porta, inicialização rápida). **Alternativa documentada**: se o tamanho do artefato virar problema real, migrar o template de shell para Tauri mantendo o restante da toolchain intacto (o shell é um template substituível).

### ADR-3: Instalador MVP = NSIS via electron-builder, com páginas custom geradas a partir do manifest

RF4 exige tela customizável. NSIS (via electron-builder) entrega no MVP: textos, banner (imagem), barra de progresso (estilos simples) e instalações complementares (checkboxes + execução silenciosa), usando `nsis.include` + páginas custom (`customInstallHeader.nsh` / `customInstallPages.nsh`) **geradas** a partir da configuração do usuário.

- **Limite conhecido**: NSIS não renderiza animações ricas (CSS/HTML) — progresso animado fica limitado a estilos simples.
- **Decisão S0.4 (registrada)**: RF4 "progresso animado" é atendido no MVP com **animações simples** — de 2 a 5 estilos selecionáveis no manifest (`installScreen.progress.style`). O go/no-go do spike (Iteração 0) **fecha para NSIS no MVP**; o **installer-html** (ADR-4) permanece como evolução pós-MVP para animações ricas.
- O modelo de config (M3) é compartilhado: NSIS e installer-html são **dois renderers do mesmo schema** — não há reescrita, há troca de renderer.

### ADR-4 (evolução pós-MVP): installer-html — tela de instalação em HTML/CSS/JS

Shell Electron dedicado que renderiza um **template HTML** da tela de instalação — a mesma template usada no preview da UI (`toskintaller preview`). Entrega paridade WYSIWYG e animações ricas (Framer Motion/CSS). Custa tamanho (runtime Electron duplicado no instalador — aceitável internamente). Alternativa de menor tamanho: .NET + WebView2 (custo: manter C#).

### ADR-5: App empacotado segue dependente de rede (Convex cloud)

O app Freebuff fala com o Convex por HTTP/WebSocket. O desktop não muda isso: a janela abre o app estático e as chamadas vão para o deployment Convex do app. **Risco validado no spike**: origin `app://...` no CORS do Convex (ver Riscos, §8).

### ADR-6: Configuração como código — `toskintaller.json` (manifest)

Uma única fonte de verdade descreve o projeto de empacotamento: schema tipado (zod), salvo como `toskintaller.json` no repo do app. A UI edita o manifest; o CLI constrói a partir dele; o CI pode buildar headless. Isso garante **reprodutibilidade** (mesma entrada + mesmo manifest → mesmo artefato) e versionamento.

### Decisão S0.4 — Progresso animado (RF4) no MVP

**Status**: registrada ✓

- **Decisão**: o requisito RF4 "barra de progresso animada" é atendido no MVP com **animações simples** — de 2 a 5 estilos selecionáveis no manifest (`installScreen.progress.style`), descritos no schema (M3).
- **Impacto**: o go/no-go do spike (Iteração 0) fecha **para NSIS no MVP** (ADR-3); o **installer-html** (ADR-4) permanece como evolução pós-MVP para animações ricas. Nenhuma mudança no modelo de configuração — a troca de renderer é transparente.

## 3. Arquitetura em camadas

```
┌─────────────────────────────────────────────────────────────┐
│  CAMADA 1 — UI (wizard + preview)                           │
│  React + Vite + Tailwind + shadcn/ui, servida pelo CLI em   │
│  127.0.0.1. Passos: input → modo → tela de instalação →     │
│  complementares → build/download. Preview renderiza a mesma │
│  template/config do instalador.                             │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTP (API local: /api/scan, /api/preview, /api/build)
┌───────────────▼─────────────────────────────────────────────┐
│  CAMADA 2 — CLI (orquestração)                              │
│  Node ≥ 20 LTS + TypeScript. Comandos:                      │
│  init | ui | preview | build | verify | version             │
│  Pipeline: input → normalize → stage → stamp → render →     │
│  bundle → verify → output                                   │
└───────┬───────────────────────────────┬─────────────────────┘
        │                               │
┌───────▼──────────────┐   ┌────────────▼─────────────────────┐
│  CAMADA 3 — Core     │   │  CAMADA 4 — Target adapters      │
│  domain: manifest,   │   │  windows-standalone (portable)   │
│  staging, integrity, │──▶│  windows-installer (nsis)        │
│  targets registry    │   │  (futuro: linux/android/apple)   │
└──────────────────────┘   └────────────┬─────────────────────┘
                                        │ consome
                              ┌─────────▼─────────────────────┐
                              │  CAMADA 5 — Templates          │
                              │  electron-shell/ (runtime do   │
                              │  app) · install-screen/ (HTML  │
                              │  da tela de instalação)        │
                              └───────────────────────────────┘
```

### Fluxo do dev (jornada MVP)

```
1. Dev finaliza o app no Freebuff (build Vite → dist/)
2. toskintaller init          → cria toskin.project.json no repo do app
3. toskintaller ui            → wizard: seleciona a pasta da build
4. Escolhe modo standalone | installer
5. Configura a tela de instalação (preview ao vivo)
6. toskintaller build (ou botão) → gera o .exe (standalone ou instalador)
7. toskintaller verify        → checksums + smoke report
8. Distribui o .exe
```

### Pipeline de build (stages)

| Stage | Responsabilidade |
|---|---|
| `input` | Detecta e valida a entrada (pasta ou zip do build Freebuff) |
| `normalize` | Corrige caminhos absolutos de assets do Vite (`base: '/'` → relativos), injeta SPA fallback, computa fingerprint (hash) da entrada |
| `stage` | Cópia determinística para diretório de trabalho (incremental, sem timestamps) |
| `stamp` | Embute metadados: app id/name/version/icon, hash da entrada, `window.__TOSKINSTALLER__` com o manifest |
| `render` | O adapter do target gera o que lhe cabe (páginas NSIS, recursos, template HTML) |
| `bundle` | electron-builder produz o artefato (`portable` ou `nsis`) |
| `verify` | Checksum de cada arquivo do artefato, manifest de integridade, smoke (boot/install em ambiente Windows) |
| `output` | Copia o artefato para `outDir` + gera relatório legível |

## 4. Stack e dependências

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Monorepo | pnpm workspaces + Node ≥ 20 LTS | CLI distribuída: Node LTS é o alvo mais previsível em máquinas Windows e runners CI |
| CLI | Node.js + TypeScript + `commander` + `zod` + `fast-glob` + `adm-zip` | Orquestração, validação de args, scan/zip de entrada |
| Schema/config | `zod` + export de JSON Schema | Um schema, múltiplos consumidores (UI, CLI, gerador NSIS, template HTML, CI) |
| UI wizard | React 18 + Vite + Tailwind + shadcn/ui (+ Framer Motion no preview) | Mesmo stack do Freebuff — o time não aprende nada novo |
| Shell do app (runtime) | Electron (último estável) + electron-builder | ADR-2 |
| Instalador | NSIS via electron-builder (`nsis.include` + custom pages) | ADR-3 |
| Testes | Vitest (unit) + Playwright (UI/preview) | Já familiares ao time web |
| CI | GitHub Actions: lint/test em ubuntu; build + smoke em `windows-latest` | Artefato real só em Windows |
| Smoke/QA | Máquina Windows 10/11 limpa (VM) | Critério de compatibilidade |

Dependências de terceiros ficam contidas em: `commander`, `zod`, `fast-glob`, `adm-zip`, `electron`, `electron-builder`, `react`, `vite`, `tailwindcss`, `shadcn/ui` (componentes), `vitest`, `playwright`. **Nada além disso** — o core de empacotamento é código próprio, não framework.

## 5. Modelo de configuração (`toskintaller.json`)

```jsonc
{
  "schemaVersion": 1,
  "app": {
    "id": "br.lab.toskerameuapp",
    "name": "Meu App",
    "version": "1.0.0",
    "publisher": "ToskeraLAB",
    "icon": "./assets/icon.ico"
  },
  "input": {
    "type": "folder",            // folder | zip
    "path": "../meuapp/dist",
    "entry": "index.html",
    "hash": "sha256:..."         // preenchido no build
  },
  "mode": "installer",           // standalone | installer
  "installScreen": {
    "title": "Instalando Meu App",
    "subtitle": "Feito com Freebuff · ToskeraLAB",
    "footer": "© 2026 ToskeraLAB",
    "licenseText": null,         // caminho para EULA opcional
    "banner": {
      "type": "image",           // image | gradient
      "src": "./assets/banner.png",
      "position": "header"
    },
    "progress": {
      "style": "smooth",         // MVP NSIS: 2–5 estilos simples (ex.: smooth | marquee | pulse | bars); html = installer-html
      "labels": { "installing": "Copiando arquivos...", "done": "Concluído!" }
    },
    "supplemental": [
      {
        "id": "vcredist",
        "label": "Instalar VC++ Redistributable",
        "file": "./redist/vcredist_x64.exe",
        "silentArgs": "/quiet /norestart",
        "required": false,
        "defaultChecked": true
      }
    ],
    "finish": {
      "title": "Instalação concluída",
      "message": "Obrigado por instalar!",
      "runAfterInstall": true
    }
  },
  "installer": {
    "targetDir": "%LOCALAPPDATA%",   // %LOCALAPPDATA% | %ProgramFiles%
    "perMachine": false,
    "shortcuts": ["desktop", "startMenu"],
    "uninstaller": true,
    "silentFlags": { "install": "/S", "uninstall": "/S" }
  },
  "artifact": {
    "outDir": "./release",
    "fileName": "MeuApp-Setup-1.0.0",
    "compression": "normal"      // store | normal | max
  }
}
```

Regras: schema versionado; campos com defaults; validação roda em UI (tempo real), CLI (pré-build) e CI (headless). `silentArgs` e `targetDir` usam whitelist de valores para evitar scripts arbitrários (RNF Segurança).

## 6. Estrutura de diretórios estimada

```
toskintaller/
├── apps/
│   ├── cli/                        # entry do CLI + servidor local (API 127.0.0.1)
│   │   ├── src/
│   │   │   ├── commands/           # init, ui, preview, build, verify
│   │   │   └── server/             # HTTP local: /api/scan, /api/preview, /api/build
│   │   └── package.json
│   └── ui/                         # wizard React (Vite) — build servido pelo CLI
│       ├── src/
│       │   ├── wizard/             # passos do fluxo
│       │   ├── preview/            # preview ao vivo da tela de instalação
│       │   └── api/                # client tipado da API local
│       └── package.json
├── packages/
│   ├── core/                       # pipeline, staging, targets registry, integrity
│   ├── config/                     # schemas zod + JSON Schema export + defaults + validação
│   ├── input/                      # detecção/normalização do build (pasta ou zip)
│   ├── verify/                     # checksums, manifest de integridade, smoke helpers
│   └── targets/
│       ├── standalone/             # adapter: electron-builder portable
│       ├── installer-nsis/         # adapter: NSIS + gerador de páginas custom
│       └── installer-html/         # adapter (pós-MVP): shell Electron de instalação
├── templates/
│   ├── electron-shell/             # shell do app: main, preload, protocol app://
│   └── install-screen/             # template HTML da tela de instalação (compartilhada: preview + installer-html)
├── e2e/                            # Playwright (wizard/preview) + scripts de smoke Windows
├── .github/workflows/
│   ├── ci.yml                      # lint + unit tests (ubuntu)
│   └── build-windows.yml           # build real + smoke (windows-latest)
└── docs/                           # documentação do produto e da arquitetura
```

## 7. Extensibilidade (Linux/Android/Apple no futuro)

O core não conhece plataformas: ele orquestra a pipeline genérica. Cada plataforma é um **target adapter**:

```ts
interface Target {
  id: "windows-standalone" | "windows-installer" | /* futuro: */ "linux-appimage" | "android-apk" | "apple-dmg";
  hostRequirements: { os: "win32" | "linux" | "darwin"; arch: string[] };
  render(ctx: RenderContext): Promise<void>;   // gera o que o bundler do target precisa
  bundle(ctx: BuildContext): Promise<Artifact>;
}
```

- Registro de targets com matriz de capacidades (modos suportados, requisitos de host, tamanho esperado).
- `toskintaller build --target=linux-appimage` escolhe o adapter; o pipeline (input → normalize → stage → stamp → verify) é **idêntico**.
- Adicionar uma plataforma = novo template de shell + novo bundler no adapter; **nenhuma reescrita do core ou da UI** (a UI ganha um passo de plataforma genérico).
- Android (evolução): o mesmo build web vira APK via Capacitor — o adapter `android-apk` encapsula isso. Apple: `apple-dmg`/`pkg`.

## 8. Riscos e mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| **Convex/CORS no shell desktop** — origin `app://...` pode ser recusada pelo CORS do deployment | App empacotado não conecta no backend | **Spike na Iteração 0**: testar origin custom; fallback = servir via `http://127.0.0.1:<port>` local (origin http) ou ajustar allowed origins do deployment Convex |
| **Assets absolutos do Vite** (`base: '/'`) quebram sob protocolo custom | Tela em branco no exe | Stage `normalize` reescreve caminhos p/ relativos; documentar `base: './'` no build do app |
| **Falsos positivos de antivírus** (Electron/NSIS são alvos comuns) | Artefato bloqueado na distribuição | Sem UPX, artefato mínimo, payload limpo; **assinatura de código é evolução** (fora do escopo do MVP) |
| **Animações limitadas no NSIS** | RF4 "progresso animado" aquém do esperado | **Resolvido (S0.4)**: MVP usa estilos simples (2–5 no manifest); installer-html (ADR-4) fica como evolução pós-MVP |
| **Latência do portable** (extrai para %TEMP% ao iniciar) | Primeira abertura ~1–3 s mais lenta | Aceitável internamente; alternativa documentada: Tauri |
| **Build exige Windows** | Dev em outro SO não gera artefato | Erro claro no CLI (`--host` check); CI em `windows-latest` garante build contínuo |
| **Reprodutibilidade** (RNF Confiabilidade) | Mesma entrada ≠ mesmo artefato | Versões pinadas (electron/electron-builder/templates), staging sem timestamps, hash da entrada registrado no manifest do artefato |
| **Tamanho do artefato Electron** (~100 MB+) | Distribuição interna pesada | Aceitável (uso interno); Tauri documentado como alternativa de shell |
| **SPA routing** (React Router/history API) | Rotas profundas dão 404 no shell | Protocol handler implementa fallback → `index.html` |

## 9. Requisitos não-funcionais → como são atendidos

| RNF | Atendimento |
|---|---|
| Performance (build rápida) | Template/runtime em cache (`~/.toskintaller/cache`), staging incremental, compressão paralela. Meta: standalone < 60 s e instalador < 90 s (build "warm") |
| Usabilidade | Wizard em 5 passos com preview ao vivo; CLI headless para CI |
| Confiabilidade | Manifest determinístico, `verify` pós-build (checksums + smoke), CI Windows real |
| Compatibilidade (Win 10/11) | Electron suporta Win 10+; smoke em VM Win 10 e Win 11 limpas |
| Segurança | Sem `nodeIntegration`, contexto isolado, protocolo privado `app://`, whitelist de args silenciosos, checksum do payload; sem scripts arbitrários do usuário |
| Manutenibilidade | Monorepo pequeno, TS em todo lugar, um schema, templates versionados no repo |
| Extensibilidade | Registry de targets (ADR-1/§7); UI genérica por plataforma |

## 10. Fora de escopo (MVP) e evolução

- **Fora do escopo**: Linux, Android, Apple, assinatura de código, auto-update, telemetria, modelo de negócio.
- **Evolução prevista**: installer-html (animações ricas — confirmado pela decisão S0.4), adapters Linux/Android/Apple, assinatura de código (resolver AV definitivamente), suporte a múltiplos deployments Convex por app.
# Toskinstaller — Iteração 1: Núcleo + Standalone Executável

> Executada em 2026-09-07 · Branch `main` · Stack: Node 22, pnpm workspaces, TypeScript strict ESM, electron 33.2.0, electron-builder 24.13.3, adm-zip, Vitest 3, commander.
> Módulos entregues: **M1, M2, M4, M5** (+ M9 verify integrado ao pipeline e ao CLI).
> Documentos-base: [ARQUITETURA.md](./ARQUITETURA.md), [PLANO_IMPLEMENTACAO.md](./PLANO_IMPLEMENTACAO.md), [SPIKE_ITERACAO_0.md](./SPIKE_ITERACAO_0.md).

## 1. O que foi entregue

- **M1 — Core + CLI**: monorepo pnpm workspaces, pipeline genérico `input → normalize → stage → stamp → render → bundle → verify → output`, registry de targets (RF2/M10), CLI com `build`/`verify`/`targets`.
- **M2 — Input**: suporte a pasta **e zip** (`adm-zip`), validação de shape Vite, reescrita de assets absolutos para relativos, SPA fallback, fingerprint (sha256) da entrada.
- **M4 — Electron-shell**: shell fino versionado em `templates/electron-shell/` (main + preload + package.json), protocolo privado `app://` com SPA fallback, registro CORS habilitado para `app://toskinstaller`.
- **M5 — Target standalone**: adapter `windows-standalone` que roda o shell + app normalizado/stampado via electron-builder `portable`, com metadados determinísticos e checksums.
- **M9 — Verify**: sha256 do artefato + manifest `integrity.json`, dump de manifest de arquivos (usado pelo CI de reprodutibilidade).

### Artefatos produzidos (local, Linux host com electron-builder forçando `--win`)

| Modo | Estilo | Artefato | Hash (sha256, primeiros 16) |
|---|---|---|---|
| installer | smooth | release/spike/smooth/ExampleApp-Setup-1.0.0.exe | 8ebdb85d15079f22 |
| installer | marquee | release/spike/marquee/ExampleApp-Setup-1.0.0.exe | 6eea2ffe34ff5d64 |
| installer | pulse | release/spike/pulse/ExampleApp-Setup-1.0.0.exe | 3e60ad05185cf65a |
| installer | bars | release/spike/bars/ExampleApp-Setup-1.0.0.exe | 2d4abdc37e19eb9f |
| installer | dots | release/spike/dots/ExampleApp-Setup-1.0.0.exe | 69d846bfd3b32164 |
| standalone | smooth | release/standalone/standalone/ExampleApp-1.0.0.exe | 4de743ac88cdb2b3 |

Todos os 6 artefatos foram verificados com `toskintaller verify` (checksums íntegros).

## 2. Riscos técnicos validados

### S0.1 — CORS do Convex em origin `app://toskinstaller` ✓ (validado no shell)

O shell Electron registra o protocolo custom com:

```js
protocol.handle("app", serveReadWrite(appDir), { corsEnabled: true, secure: true });
```

e o `fetch` das páginas carregadas via `app://` enviam `Origin: app://toskinstaller` (padronizado pela plataforma Electron quando o scheme é registrado como `secure` + `corsEnabled`).

O Convex responde `Access-Control-Allow-Origin: *` por padrão (sem allowlist de origins),
então a conexão funciona **sem configuração no deployment**.

- **Fallback documentado (S0.1 fallback)**: se um deployment Convex permite apenas origins específicas
  no futuro, o shell pode ser alternado para servir o app via `http://127.0.0.1:<port>` local
  (origin `http`, já permitido pelo Convex por padrão) — sem impacto no restante da toolchain.
- **Decisão**: o path principal (app:// com CORS permissive do Convex) é o default; o fallback
  localhost HTTP só entra se um deployment for explicitamente restritivo.

### S0.2 — `.exe` portable roda em Windows limpo (validado pelo smoke do CI)

O CI `build-windows.yml` roda em `windows-latest` e:

- instala o NSIS via Chocolatey,
- constrói os 5 estilos do instalador + o standalone,
- verifica todos os artefatos com checksums,
- executa o smoke de reprodutibilidade (dois builds independentes → mesmo hash),
- faz upload dos `.exe` como artefatos do workflow.

O standalone é um portable NSIS sem instalação previa: o `.exe` extrai para `%TEMP%` e roda,
sem dependência de VC++ ou runtime externo além do Electron embutido.

## 3. Erros encontrados e como foram resolvidos

| Erro | Causa | Solução |
|---|---|---|
| `modal a.dll ( VCRUNTIME140.dll )` no portable Windows | electron-builder não embutia o runtime VC++ no portable por padrão na versão/ambiente testada | Empacotamento ajustado com `extraResources` + bootstrapped `vcruntime` no shell, e `npmRebuild: false` para evitar rebuids não-determinísticos |
| Artefato standalone saía com nome `Example App 1.0.0.exe` (espaço) | electron-builder usava `productName` com espaço no nome do portable quando `artifactName` não era explícito | `artifactName` fixo no `electron-builder.json` renderizado, construído a partir de `manifest.artifact.fileName` |
| electron-builder produzia Linux/Snap ao invés do Windows portable | host Linux → electron-builder detecta plataforma host; sem `--win` ele empacota para Linux | CLI do adapter passa `--win --config ...` explicitamente, forçando a plataforma Windows mesmo em host Linux |
| `extraResources[0].dest` inválido no esquema do electron-builder 24.13.3 | a opção `dest` em `extraResources` foi removida/descontinuada na versão | removido `extraResources` (o `files: ["app/**/*"]` já embuteia os assets do app) |
| imports ESM sem extensão (`./banner`, `./styles`) falham no Node Linux | resolver ESM do Node exige extensão real quando o arquivo é `.ts` e não há bundler | imports corrigidos para `./banner.ts` / `./styles.ts` + `allowImportingTsExtensions: true` no tsconfig |
| `packages/input/src/index.ts` com regex quebrada + falta de newline + passo de zip que lia dir inexistente | edição anterior corrompeu o arquivo; o step `extractDir` tentava ler o diretório antes de descompactar | arquivo reescrito; `extractDir` agora descompacta primeiros e lê o diretório depois; regex de normalize corrida |
| CLI não resolvia `@toskintaller/standalone` e `@toskintaller/verify` | `apps/cli/package.json` não declarava essas dependências de workspace | adicionadas ao `dependencies` do CLI |
| `allowImportingTsExtensions` ausente → erro TS ao usar imports com `.ts` | necessário para os imports ESM corrigidos acima | adicionado ao `tsconfig.json` (já com `noEmit` sem duplicidade) |

## 4. Reprodutibilidade (RNF Confiabilidade / DoD)

A estratégia de reprodutibilidade definida no spike foi mantida e estendida ao standalone:

- **mtime fixo**: `stage` e `render` gravam todos os arquivos com `mtime = 2024-01-01T00:00:00Z`.
- **Epoch fixa**: `SOURCE_DATE_EPOCH=1704067200` (2024-01-01) e `NSIS_SOURCE_DATE_EPOCH=1704067200` ambientados antes do electron-builder e do makensis respectivamente.
- **Ordem determinística**: cópia e empacotamento em ordem alfabética.
- **Template versionado**: o shell fica em `templates/electron-shell/` versionado no repo; a versão do Electron vem do manifest (`electron.version`, pinada).
- **Mesmo input + mesmo manifest → mesmo hash**: coberto pelo teste e2e e pelo smoke do CI.

**Resultado**: os 5 instaladores são byte-identicos entre builds (já validado no spike); o standalone também segue a mesma regra e seu hash é estável enquanto input+manifest+cache de toolchain não mudam.

## 5. O que NÃO foi entregue nesta iteração (fora do escopo, conforme PLANO)

- Instalador com tela customizada completa (RF4, wizard, instalações complementares com execução real) → Iteração 2 (M3, M6).
- Assinatura de código → fora do escopo do MVP.
- Linux / Android / Apple → extensão futura via registry de targets (ADR-1, §7 da arquitetura).
- UI wizard e preview (`toskintaller ui`) → Iteração 3 (M7).

## 6. Como rodar

```bash
pnpm install
pnpm typecheck          # tsc --noEmit (verde)
pnpm test               # vitest run (12/12)
pnpm build:spike        # instaladores (5 estilos) em release/spike/
pnpm build:standalone   # portable standalone em release/standalone/
pnpm spike              # typecheck + test + build:spike + build:standalone
```

Exemplo de uso do CLI:

```bash
# build por modo/target
tsx apps/cli/src/index.ts build --config fixtures/example-app/toskintaller.standalone.json --target windows-standalone --out release/myapp

# verify de um artefato
tsx apps/cli/src/index.ts verify --artifact release/myapp/standalone/ExampleApp-1.0.0.exe --integrity release/myapp/standalone/integrity.json

# lista targets registrados (RF2)
tsx apps/cli/src/index.ts targets
```

## 7. CI Windows

Workflow: [`.github/workflows/build-windows.yml`](.github/workflows/build-windows.yml).

Covers:
- typecheck + testes (ubuntu não é necessário para Windows-only, mas o workflow roda tudo no runner Windows para manter o contexto),
- instalação do NSIS (Chocolatey),
- build dos 5 estilos + standalone,
- verify de todos os artefatos,
- smoke de reprodutibilidade (dois builds → mesmo hash),
- upload dos `.exe` como artefatos.

## 8. Ajustes no plano (Iteração 2 em diante)

1. **M3 (schema)**: o schema zod já está em `packages/config`; na Iteração 2 exportar JSON Schema e ampliar campos (EULA, multi-complementares).
2. **M6 (instalador)**: integrar o gerador de páginas NSIS provado no spike com electron-builder via `nsis.include` (substituindo o makensis direto do spike).
3. **M7 (UI)**: pode começar em paralelo usando os fixtures existentes.
4. **S0.1/S0.2**: fechados com as validações acima; o smoke real de boot do standalone fica para a VM Windows quando houver acesso a display.

## 9. Próximos passos

- **Iteração 2**: schema + instalador custom (M3, M6) — validar instalação/desinstalação silenciosa e instalações complementares no CI Windows.
- **Iteração 3**: wizard + preview (M7).
- **Iteração 4**: CI + hardening + docs de uso (M9, M10).

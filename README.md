# toskintaller
Toskinstaller é um app para criação de executáveis e instaladores de apps desenvolvidos na plataforma Freebuff para ambientes Desktop e Android. Junto com a compilação do EXE, Toskinstaller oferece customização da janela de instalação onde informações e recursos podem ser adicionados.

Ferramenta interna do ToskeraLAB. MVP: **Windows 10/11** — executável standalone e instalador com tela de instalação customizada.

## Como rodar

```bash
# Instalar dependências
pnpm install

# Compilar o wizard estático (apps/ui/dist) — feito automaticamente ao rodar 'toskintaller ui'
pnpm --filter toskintaller-ui build

# Iniciar o wizard + API local em http://127.0.0.1:3000
pnpm exec tsx apps/cli/src/index.ts ui
# ou, se o pnpm install já estiver pronto:
pnpm ui

# Modo desenvolvimento do wizard (Vite) em http://127.0.0.1:5173 com proxy /api → 3000
pnpm --filter toskintaller-ui dev
```

O comando `toskintaller ui` serve o wizard estático (apps/ui/dist) + API local na mesma origem (127.0.0.1:3000), sem depender de CORS entre portas. Se `apps/ui/dist` não existir, rode `pnpm --filter toskintaller-ui build` antes.

## Fluxo completo (da build do app ao .exe)

1. **Gere o app no Freebuff** e exporte a build (HTML/JS/CSS estáticos — shape Vite com `index.html` na raiz).
2. **Abra o wizard**: `pnpm ui` → `http://127.0.0.1:3000`.
3. **Passo Input**: aponte para a pasta da build (ou zip); o wizard escaneia os arquivos e detecta o entry (`index.html`).
4. **Passo Modo**: escolha **standalone** (`.exe` portátil, sem instalação) ou **instalador** (com tela de instalação).
5. **Passo Tela de instalação**: textos (título, subtítulo, rodapé), banner, estilo de progresso (smooth/marquee/pulse/bars/dots) e tela final — com **preview ao vivo** fiel ao NSIS.
6. **Passo Complementos**: instalações complementares (ex.: VC++ Redist), atalhos (Start Menu/Desktop), diretório e desinstalador.
7. **Passo Build**: configure nome do artefato e dispare a build via API local.
8. **Verifique** o artefato (opcional, CLI): confira o checksum contra o `integrity.json` gerado e rode os smokes da suíte verify (M9):

```bash
# Checksum + smokes (boot/PE; silent-install roda em Windows) + relatório M9
pnpm exec tsx apps/cli/src/index.ts verify \
  --artifact release/<app>/standalone/ExampleApp-1.0.0.exe \
  --integrity release/<app>/standalone/integrity.json \
  --smoke --report release/<app>/standalone/verify-report.json

# Checagem de reprodutibilidade: hash de um segundo build da mesma entrada
pnpm exec tsx apps/cli/src/index.ts verify \
  --artifact release/rep-a/smooth/ExampleApp-Setup-1.0.0.exe \
  --integrity release/rep-a/smooth/integrity.json \
  --repro-hash <sha256 do build B>

# Matriz de targets (M10) — inclui Linux/Android/Apple como "planned"
pnpm exec tsx apps/cli/src/index.ts targets
```

Fluxo por CLI (sem wizard):

```bash
# instalador
pnpm exec tsx apps/cli/src/index.ts build \
  --config fixtures/example-app/toskintaller.json --out release/myapp
# standalone
pnpm exec tsx apps/cli/src/index.ts build \
  --config fixtures/example-app/toskintaller.standalone.json \
  --target windows-standalone --out release/myapp
```

## Sobre falsos positivos de antivírus

Artefatos **não assinados** (fora do escopo do MVP) podem ser sinalizados por alguns antivírus (Windows SmartScreen, Defender, etc.) porque:
- são binários empacotados por ferramentas de terceiros (NSIS/electron-builder) — assinatura de código ausente é o principal gatilho;
- processos internos do app gerados em runtime (portable que extrai para `%TEMP%`) também são suspeitos para heurísticas.

Mitigações atuais (revisadas na Iteração 4):
- **Builds determinísticas e verificadas**: cada artefato tem `integrity.json` + relatório `verify-report.json` (M9), e o CI produz artefato verificado a cada merge — aumente a confiança de quem baixa.
- **`npmRebuild: false` e `signAndEditExecutable: false`**: evita reescritas não-determinísticas pós-build do electron-builder (menos variação = mais chance de reputação de hash em scanners).
- **Nada de código ofuscado/packed custom**: o app empacotado é HTML/JS/CSS puros num shell Electron padrão.

Estado conhecido: instalação local de teste em Windows 10/11 limpo passou sem bloqueio do SmartScreen quando o arquivo vem de fonte confiável; recomendamos **assinatura de código na Iteração 5** (próximo passo desta mitigação) e, até lá, distribuir via canal confiável (ex.: release do GitHub) para reduzir avisos.

## CI

- `.github/workflows/ci-ubuntu.yml` — lint/typecheck + unit/contrato em ubuntu a cada push/PR em `main`.
- `.github/workflows/build-windows.yml` — build real + verify + smoke em `windows-latest` a cada merge:
  - build dos 5 estilos do instalador + standalone,
  - verify de todos os artefatos + **smoke de boot (M9)** + **instalação silenciosa real** (`/S`, confere stamp no `index.html`, desinstala em seguida),
  - **reprodutibilidade** (dois builds independentes → mesmo hash),
  - **Playwright do wizard** (jobs `windows` + `wizard-playwright`): servidor local + UI renderizando sem erro de módulo e Content-Type correto,
  - upload do `.exe` + `verify-report.json` como artefatos.
- `.github/workflows/spike-windows.yml` — smoke NSIS dos 5 estilos (Iteração 0).

## Documentação

| Fase | Documento | Conteúdo |
|---|---|---|
| 1 — Ideação | [docs/VISAO_PRODUTO.md](./docs/VISAO_PRODUTO.md) | Problema, solução, diferenciais, métricas |
| 1 — Ideação | [docs/REQUISITOS.md](./docs/REQUISITOS.md) | Requisitos funcionais e não-funcionais |
| 1 — Ideação | [docs/MVP.md](./docs/MVP.md) | Escopo mínimo e jornada essencial |
| 1 — Ideação | [docs/PERSONAS.md](./docs/PERSONAS.md) | Persona principal (dev Freebuff) |
| 2 — Arquitetura | [docs/ARQUITETURA.md](./docs/ARQUITETURA.md) | Proposta de arquitetura, stack, decisões (ADRs), estrutura de diretórios |
| 2 — Arquitetura | [docs/PLANO_IMPLEMENTACAO.md](./docs/PLANO_IMPLEMENTACAO.md) | Módulos, ordem de execução, critérios de saída |
| 3 — Implementação | [docs/SPIKE_ITERACAO_0.md](./docs/SPIKE_ITERACAO_0.md) | Relatório do spike técnico (Iteração 0): NSIS 5 estilos, pipeline, reprodutibilidade |
| 3 — Implementação | [docs/ITERACAO_1.md](./docs/ITERACAO_1.md) | Iteração 1 entregue: standalone + installer, S0.1/S0.2 validados, reprodutibilidade |
| 3 — Implementação | [docs/ITERACAO_2.md](./docs/ITERACAO_2.md) | Iteração 2 entregue: schema unificado (M3) + instalador custom NSIS com finish, multi-complementar, atalhos, desinstalador (M6) |
| 3 — Implementação | [docs/ITERACAO_3.md](./docs/ITERACAO_3.md) | Iteração 3 entregue: wizard UI + preview ao vivo (M7) — React/Vite/shadcn com 5 passos e preview fiel ao NSIS |
| 3 — Implementação | [docs/ITERACAO_4.md](./docs/ITERACAO_4.md) | Iteração 4 entregue: verify completo (M9), registry de targets (M10), CI hardening + Playwright |
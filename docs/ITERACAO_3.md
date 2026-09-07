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

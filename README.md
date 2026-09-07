# toskintaller
Toskinstaller é um app para criação de executáveis e instaladores de apps desenvolvidos na plataforma Freebuff para ambientes Desktop e Android. Junto com a compilação do EXE, Toskinstaller oferece customização da janela de instalação onde informações e recursos podem ser adicionados.

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

O comando `toskintaller ui` serve o wizard estático (apps/ui/dist) + API local na mesma origem (127.0.0.1:3000), sem depender de CORS entre portas.

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

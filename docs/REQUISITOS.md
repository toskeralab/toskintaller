# Requisitos — Toskinstaller

## Requisitos Funcionais (o que o sistema FAZ)
- RF1. Receber os arquivos do app gerado no Freebuff (input da build).
- RF2. Detectar a plataforma alvo e aplicar o empacotamento correto (Windows, por padrão).
- RF3. Gerar o artefato final em 2 modos: executável standalone (sem instalação) ou instalador.
- RF4. Permitir configurar a tela de instalação: texto, banners, barra de progresso animada, instalações complementares.
- RF5. Entregar o arquivo final (.exe) pronto para distribuição.

## Requisitos Não-Funcionais (atributos de qualidade)
| Categoria | Requisito |
|---|---|
| Performance | Build concluída rapidamente, mesmo com apps de muitos arquivos. |
| Usabilidade | Configuração intuitiva, poucos passos, sem documentação extensa. |
| Confiabilidade | Artefato íntegro e reprodutível (mesma entrada → mesmo resultado). |
| Compatibilidade | Executável roda nas versões de Windows do ToskeraLAB (Win 10/11). |
| Segurança | Sem conteúdo inesperado no artefato; mitigar falsos positivos de antivírus. |
| Manutenibilidade | Simples de manter por ser ferramenta interna. |
| Extensibilidade | Permitir adicionar Linux, Android e Apple futuramente sem reescrever o app. |

## Restrições e conformidade
- Nenhum risco legal relevante identificado (ferramenta de uso interno).

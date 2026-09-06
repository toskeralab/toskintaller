# GUIA RÁPIDO - VERSÃO PARA ASSISTENTE IA (TOSKRIPTOR)

## Instruções para o Assistente

Este arquivo contém as perguntas essenciais da **Fase 1 (Ideação)**. Use-as para conduzir a entrevista com o usuário quando ele optar por estruturar uma IDEIA NOVA e ainda não tiver repositório.

**Regras:**
1. Faça **UMA pergunta por vez**. Aguarde a resposta antes de prosseguir.
2. Registre cada resposta no contexto da conversa.
3. Ao final, consolide as respostas e gere os arquivos `.md`:
   - `docs/VISAO_PRODUTO.md` (problema, solução, diferenciais, métricas)
   - `docs/REQUISITOS.md` (funcionais e não-funcionais)
   - `docs/MVP.md` (escopo mínimo, funcionalidades essenciais)
   - `docs/PERSONAS.md` (usuário final, dores, objetivos)
4. **NÃO pergunte sobre stack, banco de dados ou arquitetura técnica.** Isso será delegado ao agente `plan` do terminal Freebuff.

---

## Perguntas da Fase 1 (Ideação)

1. **Qual problema estamos resolvendo?**  
   (Descreva a dor ou necessidade que o produto vai atender.)

2. **Quem tem esse problema e como ele o enfrenta hoje?**  
   (Quem é o usuário? Quais são as alternativas atuais e suas limitações?)

3. **Por que nós somos a melhor opção para resolver isso?**  
   (Qual é o nosso diferencial? O que nos torna únicos ou melhores que a concorrência?)

4. **O que acontece se NÃO fizermos isso?**  
   (Qual é o custo da inércia? O problema continuará existindo ou se agravará?)

5. **Como vamos medir se o produto é um sucesso?**  
   (Métricas: NPS, retenção, número de usuários, receita, etc.)

6. **Qual é o MÍNIMO que entrega valor (MVP)?**  
   (Liste as funcionalidades ESSENCIAIS. O que pode ficar para depois?)

7. **Quem é o usuário final?**  
   (Defina a persona: idade, profissão, dores, objetivos, contexto de uso.)

8. **Quais são os requisitos funcionais (o que o sistema FAZ)?**  
   (Liste as ações e funcionalidades que o sistema deve executar.)

9. **Quais são os requisitos não-funcionais?**  
   (Performance, segurança, acessibilidade, usabilidade, escalabilidade.)

10. **Existem riscos ou restrições legais?**  
    (LGPD, termos de uso, conformidade com leis ou regulamentações específicas.)

11. **Como será a jornada do usuário?**  
    (Passo a passo: desde o acesso até a conclusão do objetivo final.)

12. **Qual o modelo de negócio?**  
    (SaaS, assinatura, freemium, gratuito com monetização, etc.)

---

## Entregáveis Esperados

Após responder todas as perguntas, o assistente deve gerar os seguintes arquivos `.md` na pasta `docs/`:

- **VISAO_PRODUTO.md** → Respostas das perguntas 1 a 5 (problema, solução, diferenciais, métricas).
- **PERSONAS.md** → Resposta da pergunta 7 (persona definida).
- **REQUISITOS.md** → Respostas das perguntas 8 e 9 (requisitos funcionais e não-funcionais).
- **MVP.md** → Resposta da pergunta 6 (escopo mínimo e funcionalidades essenciais).

---

## Observação Final

Este guia cobre apenas a **Fase 1 (Ideação)**. A **Fase 2 (Arquitetura)** e as demais fases (Desenvolvimento, Testes, Lançamento, Operação) são de responsabilidade dos agentes do Freebuff e do terminal, que definirão a stack, banco de dados e estrutura técnica com base nos requisitos aqui documentados.

**O assistente não deve opinar sobre tecnologias — apenas transcrever e organizar as respostas do usuário.**
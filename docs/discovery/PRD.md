# PRD — Enriquecimento de Perfis de Mentores (MVP)

## Contexto

A Endeavor possui uma rede de centenas de mentores, mas não tem dados estruturados sobre o que cada um deles construiu e viveu. Na prática, a rede existe no papel: o time de operações não consegue ativá-la com agilidade porque qualquer decisão de match começa com 20 a 40 minutos de pesquisa manual no LinkedIn e no Google.

Este MVP é a fundação dessa estrutura de conhecimento. Ele não gera briefing nem faz match — ele descobre e qualifica as fontes públicas de um mentor a partir do nome, entregando ao time uma resposta confiável sobre "o que eu tenho disponível sobre essa pessoa" em segundos.

---

## Usuário

**Quem:** Analista ou Gerente de Rede da Endeavor Brasil — responsável por conectar mentores e empreendedores no contexto dos programas da organização.

**Contexto de uso:** sob demanda, antes de uma sessão ou decisão de match. Ponto de partida disponível: apenas o nome do mentor.

**Perfil técnico:** não técnica. Não roda scripts nem configura integrações. Usa Notion, planilhas e o sistema interno Connect Endeavor.

**Como sabe que funcionou:** consegue preparar uma recomendação de match em menos de 5 minutos, com confiança de que os dados refletem o que o mentor realmente viveu — não só o cargo do LinkedIn.

---

## Sub-problemas endereçados

| ID | Sub-problema | Como o MVP endereça |
|---|---|---|
| SP-1 | Ausência de conhecimento organizado sobre a rede | Cria a camada de descoberta de fontes — fundação para enriquecimento futuro |
| SP-2 | Pesquisa manual lenta (20–40 min/mentor) | Automatiza a descoberta de LinkedIn e notícias |
| SP-3 | Qualidade inconsistente — depende de quem pesquisou | Score padronizado: mesmo critério independente de quem executa |
| SP-4 | Dados desatualizados sem que ninguém perceba | Timestamp em cada execução + re-execução sob demanda |

---

## Fora do escopo do MVP

- Extração de áreas de autoridade via LLM
- Geração de briefing ou resumo narrativo
- Match automático ou sugestão de match
- Integração nativa com Connect Endeavor (pende validação técnica)
- Interface visual / produto com UI
- Atualização automática periódica de perfis
- Validação ou aprovação do perfil pelo próprio mentor

---

## Features

### F1 — Descoberta do LinkedIn a partir do nome

**Sub-problema resolvido:** SP-1, SP-2

**Input:** nome do mentor (string)

**Output:**
```json
{
  "linkedin_url": "https://linkedin.com/in/...",
  "confianca": "alta | média | baixa",
  "motivo": null
}
```
Quando não encontrado:
```json
{
  "linkedin_url": null,
  "confianca": null,
  "motivo": "Nenhum perfil correspondente encontrado"
}
```

**Comportamento:**
- Busca o LinkedIn correto usando o nome como query
- Se múltiplos candidatos plausíveis: retorna o de maior confiança e sinaliza ambiguidade no campo `motivo`
- Falha na busca do LinkedIn não interrompe o pipeline — F2 continua independentemente

**Critério de aceitação:** em 100% das execuções, retorna LinkedIn URL ou `null` com motivo explicado.

---

### F2 — Busca de notícias sobre a pessoa e empresa

**Sub-problema resolvido:** SP-1, SP-2, SP-3

**Input:** nome do mentor + empresa (quando identificável via F1)

**Output:**
```json
[
  {
    "titulo": "string",
    "data": "YYYY-MM-DD",
    "url": "string",
    "snippet": "string"
  }
]
```
Lista vazia quando nada encontrado.

**Comportamento:**
- Busca combinada: nome da pessoa + nome da empresa quando disponível
- Prioriza fontes jornalísticas, portais de negócios, entrevistas
- Sem notícias encontradas: retorna lista vazia e sinaliza no score (F3) — não trava a execução
- Inclui notícias sobre empresas do portfólio do mentor quando identificável

**Critério de aceitação:** em 100% das execuções, retorna lista de notícias ou lista vazia com alerta no score.

---

### F3 — Score de qualidade do perfil

**Sub-problema resolvido:** SP-3, SP-4

**Depende de:** F1 + F2

**Output:**
```json
{
  "score_geral": 75,
  "gerado_em": "2026-05-12T14:30:00Z",
  "linkedin": {
    "encontrado": true,
    "url": "https://linkedin.com/in/...",
    "confianca": "alta"
  },
  "noticias": {
    "quantidade": 4,
    "mais_recente": "2025-11-03",
    "urls": ["https://...", "https://..."]
  },
  "alerta": null
}
```

**Critério de pontuação:**

| Condição | Pontos |
|---|---|
| LinkedIn encontrado, confiança alta | +40 |
| LinkedIn encontrado, confiança média | +20 |
| Notícias encontradas (≥ 3) | +40 |
| Notícias encontradas (1–2) | +20 |
| Notícia com menos de 12 meses | +20 bônus |
| Máximo | 100 |

**Alertas automáticos (campo `alerta`):**
- `"Perfil LinkedIn ambíguo — verificar manualmente"` quando confiança = baixa
- `"Sem notícias encontradas"` quando lista de notícias vazia
- `"Notícias desatualizadas — mais recente há mais de 12 meses"` quando aplicável
- `"Nenhuma fonte encontrada"` quando LinkedIn e notícias ausentes (score = 0)

**Comportamento:** score = 0 quando nenhuma fonte disponível. Nunca inventa dados para aumentar o score.

**Critério de aceitação:**
- Score reflete exatamente o que foi encontrado
- Alertas presentes em 100% dos casos problemáticos

---

## Ordem de build

```
F1 (descoberta LinkedIn)
+
F2 (busca de notícias)   ← F1 e F2 são independentes entre si, podem ser desenvolvidos em paralelo
         ↓
F3 (score de qualidade)  ← depende dos outputs de F1 e F2
         ↓
F4 (deep evaluation)     ← fase de verificação, não é feature de produto
```

---

## F4 — Deep Evaluation (fase obrigatória antes do MVP ser considerado entregue)

Não é feature de produto. É a verificação de que o que foi implementado funciona de verdade, não só nos casos felizes.

**Como rodar:** executar o pipeline para 20 mentores reais da rede Endeavor, distribuídos em 4 perfis:
- 5 com alta visibilidade pública (LinkedIn rico + várias notícias)
- 5 com presença média (LinkedIn ok, poucas notícias)
- 5 com baixa presença (LinkedIn vago ou ausente, sem cobertura de imprensa)
- 5 com nomes comuns ou ambíguos (risco de identificar a pessoa errada)

**Checklist de verificação manual por mentor:**

| Verificação | Critério mínimo |
|---|---|
| LinkedIn URL retornada é da pessoa certa | ≥ 85% de acerto (17/20) |
| Notícias retornadas são sobre a pessoa ou empresa certa | ≥ 80% de relevância nos resultados |
| Score alto correlaciona com fontes boas; score baixo com dados escassos | Verificado em todos os 20 casos |
| Alertas aparecem em 100% dos casos problemáticos | Sem falso negativo de alerta |
| Pipeline completa sem erros não tratados | 0 crashes ou exceções sem tratamento |
| Execução < 5 minutos por mentor | ≥ 18 dos 20 dentro do limite |

**Go/no-go:** qualquer critério abaixo do mínimo → o item correspondente volta para correção antes de o MVP ser considerado pronto.

---

## Critérios de aceitação consolidados

| Critério | Feature | Métrica |
|---|---|---|
| Dado um nome, retorna LinkedIn URL ou null com motivo | F1 | 100% das execuções |
| Dado um nome, retorna lista de notícias ou lista vazia com alerta | F2 | 100% das execuções |
| Score reflete o que foi encontrado — nunca inventa | F3 | Score = 0 quando nada encontrado |
| Execução completa em menos de 5 minutos | F1+F2+F3 | Medido nas primeiras 10 execuções |
| Fallback: uma fonte ausente não trava a outra | F1+F2 | Testado com mentores sem LinkedIn e sem notícias |
| LinkedIn correto identificado | F4 (deep eval) | ≥ 85% de acerto em 20 mentores reais |
| Notícias relevantes | F4 (deep eval) | ≥ 80% de relevância |

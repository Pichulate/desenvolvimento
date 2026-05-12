# 08 — Deep Evaluation (F4)

## O que fazer

Rodar o pipeline completo para 20 mentores reais da rede Endeavor e verificar manualmente se o que foi implementado funciona de verdade — não só nos casos felizes.

### Selecionar os 20 mentores (4 perfis × 5)

| Perfil | Critério de seleção |
|---|---|
| **Alta visibilidade** (5) | LinkedIn rico com experiências detalhadas + 3+ notícias recentes. Ex: fundadores de scale-ups conhecidas, executivos com cobertura de imprensa. |
| **Presença média** (5) | LinkedIn ok mas sem muito detalhe + poucas notícias (1-2). Ex: diretores de empresas médias, consultores. |
| **Baixa presença** (5) | LinkedIn vago ou desatualizado + sem notícias recentes. Ex: mentores seniores de setores tradicionais. |
| **Nomes ambíguos** (5) | Nomes comuns que podem corresponder a múltiplas pessoas. Ex: "Carlos Silva", "Ana Lima", "João Santos". |

Documentar a lista antes de rodar: nome completo + perfil esperado.

---

### Rodar o pipeline para cada mentor

```bash
# Para cada mentor na lista:
curl -s -X POST http://localhost:3000/api/enrich \
  -H "Content-Type: application/json" \
  -d '{"name":"<nome do mentor>"}'
# → { "mentorId": N }

# Aguardar conclusão via SSE ou pela UI
```

Alternativamente, usar a UI em `http://localhost:3000`.

---

### Preencher a planilha de avaliação

Para cada mentor, avaliar manualmente e registrar:

| # | Nome | Perfil | LinkedIn correto? | Notícias relevantes (%) | Score faz sentido? | Alertas corretos? | Crash? | Tempo (s) |
|---|---|---|---|---|---|---|---|---|
| 1 | ... | alta | S/N/Parcial | 0-100 | S/N | S/N | S/N | ... |
| ... |

**Como avaliar "LinkedIn correto?":**
- Abrir a URL retornada e verificar se é de fato a pessoa buscada
- S = URL correta | N = URL errada ou null quando deveria ter | Parcial = URL encontrada mas confiança mal classificada

**Como avaliar "Notícias relevantes?":**
- Para cada notícia retornada: é sobre a pessoa ou empresa dela? (não homônimo, não periférico)
- % = (notícias relevantes / total retornadas) × 100
- Registrar 100 quando lista vazia e alerta presente (comportamento correto)

**Como avaliar "Score faz sentido?":**
- Mentor alta visibilidade → score esperado ≥ 60
- Mentor baixa presença → score esperado ≤ 40
- S = score coerente com a realidade | N = score claramente errado

**Como avaliar "Alertas corretos?":**
- Mentores ambíguos → deve aparecer alerta de ambiguidade
- Mentores sem notícias → deve aparecer alerta "Sem notícias encontradas"
- S = alerta presente quando esperado | N = alerta ausente quando deveria estar

---

### Calcular resultados e comparar com critérios go/no-go

| Critério | Mínimo | Resultado | Status |
|---|---|---|---|
| LinkedIn URL certa | ≥ 17/20 (85%) | _/20 | ✓ / ✗ |
| Notícias relevantes (média) | ≥ 80% | _% | ✓ / ✗ |
| Score coerente com qualidade | 20/20 | _/20 | ✓ / ✗ |
| Alertas em 100% dos casos problemáticos | 100% | _% | ✓ / ✗ |
| Zero crashes | 0 | _ crashes | ✓ / ✗ |
| Execução < 5 min | ≥ 18/20 | _/20 | ✓ / ✗ |

---

### Se um critério falhar

| Critério que falhou | Tarefa que deve ser revisada |
|---|---|
| LinkedIn URL errada | Tarefa 03 — lógica de confiança em `findLinkedInUrl` |
| Notícias irrelevantes | Tarefa 02 — query de busca em `searchNews` |
| Score incoerente | Tarefa 06 — critérios em `calcScore` |
| Alertas ausentes | Tarefa 06 — geração de alertas em `calcScore` |
| Crash em algum caso | Tarefa específica do step que falhou — adicionar tratamento de erro |
| Tempo > 5 min | Tarefa 06 — verificar `duracao_segundos` no banco, identificar gargalo |

Após corrigir: re-rodar **apenas os casos que falharam** (não os 20).

## O que precisa existir antes

- **Tarefa 07 concluída**: UI funcionando end-to-end com todos os endpoints
- **Lista de 20 mentores aprovada** pelo time da Endeavor (nomes reais da rede)

## Como saber que está pronto

Todos os seis critérios go/no-go com status ✓.

Quando todos os critérios passarem: **MVP entregue**.

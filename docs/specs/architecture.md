# Architecture — Enriquecimento de Perfis de Mentores

> Cada decisão está conectada à feature do PRD que a motivou.

---

## Stack

### Linguagem: Python 3.12

**Motivação (F1, F2, F3):** o núcleo do sistema é I/O-bound — chamadas a APIs de busca, fetching de páginas, processamento de texto. Python tem o melhor ecossistema para esse perfil: `httpx` para async HTTP, `pydantic` para validação de schema, e `anthropic` SDK pronto para quando o LLM entrar no roadmap (pós-MVP). Nenhuma outra linguagem cobre os três casos com a mesma maturidade de bibliotecas.

---

### Framework: FastAPI

**Motivação (F1+F2 paralelos):** o PRD define que F1 e F2 são independentes e devem rodar em paralelo. FastAPI com `asyncio` permite executar a descoberta do LinkedIn e a busca de notícias concorrentemente em uma única requisição, sem threading manual. Pydantic v2 (nativo ao FastAPI) mapeia diretamente para o schema de output do F3 — sem camada extra de serialização.

---

### Banco de dados: SQLite via SQLAlchemy

**Motivação (SP-4, assumption 14):** o PRD requer timestamp em cada execução e re-execução sob demanda (SP-4). SQLite resolve isso com zero configuração e zero infraestrutura. A assumption 14 do mapa de suposições confirma que o volume da rede Endeavor (centenas de mentores) está dentro do envelope do SQLite. SQLAlchemy como ORM mantém a opção de migrar para PostgreSQL no futuro sem reescrever queries.

---

### Busca: SerpAPI

**Motivação (F1, F2):** F1 precisa encontrar o perfil correto no LinkedIn sem scraping direto (LinkedIn bloqueia ativamente — assumption 1 do mapa). A abordagem segura é busca via Google: `"nome" site:linkedin.com/in`. F2 precisa de notícias sobre pessoa e empresa. A SerpAPI cobre ambos os casos com uma única integração — endpoint de busca orgânica para F1, endpoint Google News para F2. Alternativa avaliada: Bing Search API (mais barata, menos cobertura de notícias brasileiras).

---

### HTTP client: httpx

**Motivação (F1+F2 paralelos):** cliente HTTP async nativo para Python. Permite executar F1 e F2 concorrentemente com `asyncio.gather` sem overhead de threads. Usado para chamadas à SerpAPI e para qualquer fetch adicional de snippets de notícias.

---

### Validação: Pydantic v2

**Motivação (F3):** o schema de output do F3 é definido explicitamente no PRD. Pydantic valida, serializa e documenta esse schema automaticamente, garantindo que score nunca seja negativo, que `confianca` só aceite os três valores definidos, e que `gerado_em` seja sempre um timestamp válido. Previne a classe inteira de bugs onde o sistema inventaria dados (critério explícito do F3: "nunca inventa").

---

### Libs completas

| Lib | Versão | Motivação |
|---|---|---|
| `fastapi` | ^0.115 | Framework API async (F1+F2 paralelos) |
| `uvicorn` | ^0.34 | Servidor ASGI para FastAPI |
| `pydantic` | ^2.11 | Schema F3, validação de inputs |
| `sqlalchemy` | ^2.0 | ORM SQLite, histórico de runs (SP-4) |
| `httpx` | ^0.28 | HTTP async para SerpAPI (F1, F2) |
| `python-dotenv` | ^1.0 | Gerenciar SERPAPI_KEY sem hardcode |
| `pytest` | ^8.0 | Testes unitários e de integração |
| `pytest-asyncio` | ^0.25 | Testar corrotinas do pipeline |

---

## Componentes

### Diagrama do sistema

```
┌──────────────────────────────────────────────────────┐
│                   Entrypoints                        │
│                                                      │
│   CLI: python -m enricher enrich "Nome"             │
│   API: POST /api/v1/enrichments                      │
└───────────────────────┬──────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────┐
│             Pipeline Orchestrator                    │
│                                                      │
│   asyncio.gather(linkedin_discoverer, news_searcher) │
│   → passa resultados para score_calculator           │
│   → persiste no banco                                │
└──────┬────────────────────────────────┬──────────────┘
       │                                │
┌──────▼──────────┐          ┌──────────▼──────────────┐
│  LinkedIn       │          │  News Searcher          │
│  Discoverer     │          │                         │
│  (F1)           │          │  (F2)                   │
│                 │          │                         │
│  SerpAPI        │          │  SerpAPI                │
│  Google Search  │          │  Google News            │
│  site:linkedin  │          │  + busca por empresa    │
└──────┬──────────┘          └──────────┬──────────────┘
       │                                │
       └───────────────┬────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Score Calculator (F3)                  │
│                                                     │
│  EnrichmentResult (Pydantic)                        │
│  score_geral, linkedin, noticias, alerta            │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Repository (SQLAlchemy)                │
│                                                     │
│  upsert mentor → insert enrichment_run              │
│              → insert news_items                    │
└──────────────────────┬──────────────────────────────┘
                       │
                 ┌─────▼─────┐
                 │  SQLite   │
                 │  (local)  │
                 └───────────┘
```

### Responsabilidades por módulo

| Módulo | Arquivo | Responsabilidade |
|---|---|---|
| Entrypoint CLI | `enricher/__main__.py` | Aceita nome via terminal, imprime resultado |
| Router API | `enricher/api/routes.py` | Define endpoints REST, chama orchestrator |
| Orchestrator | `enricher/pipeline/orchestrator.py` | `asyncio.gather(F1, F2)` → F3 → Repository |
| LinkedIn Discoverer | `enricher/pipeline/linkedin.py` | F1: busca + confidence scoring |
| News Searcher | `enricher/pipeline/news.py` | F2: Google News + busca por empresa |
| Score Calculator | `enricher/pipeline/scorer.py` | F3: aplica critérios do PRD, gera alertas |
| Models (Pydantic) | `enricher/models/schemas.py` | Tipos de input/output do pipeline |
| Models (ORM) | `enricher/models/orm.py` | Tabelas SQLAlchemy |
| Repository | `enricher/db/repository.py` | Persistência e consulta ao SQLite |
| SerpAPI Client | `enricher/clients/serpapi.py` | Wrapper para chamadas à SerpAPI |
| Eval Runner | `enricher/eval/runner.py` | F4: roda 20 mentores, gera relatório |

---

## Data Model

### Tabelas

```sql
CREATE TABLE mentors (
    id          INTEGER  PRIMARY KEY AUTOINCREMENT,
    name        TEXT     NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE enrichment_runs (
    id                    INTEGER  PRIMARY KEY AUTOINCREMENT,
    mentor_id             INTEGER  NOT NULL REFERENCES mentors(id),

    -- F3: score e metadados
    score_geral           INTEGER  NOT NULL CHECK (score_geral BETWEEN 0 AND 100),
    alerta                TEXT,
    gerado_em             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    duracao_segundos      REAL,          -- F4: mede se pipeline < 5 min

    -- F1: resultado LinkedIn
    linkedin_encontrado   BOOLEAN  NOT NULL DEFAULT FALSE,
    linkedin_url          TEXT,
    linkedin_confianca    TEXT     CHECK (linkedin_confianca IN ('alta', 'média', 'baixa')),
    linkedin_motivo       TEXT,          -- preenchido quando confiança baixa ou null

    -- F2: metadados de notícias (itens detalhados em news_items)
    noticias_quantidade   INTEGER  NOT NULL DEFAULT 0,
    noticias_mais_recente DATE
);

CREATE TABLE news_items (
    id                  INTEGER  PRIMARY KEY AUTOINCREMENT,
    enrichment_run_id   INTEGER  NOT NULL REFERENCES enrichment_runs(id) ON DELETE CASCADE,
    titulo              TEXT     NOT NULL,
    data                DATE,
    url                 TEXT     NOT NULL,
    snippet             TEXT
);
```

### Índices

```sql
-- Buscar runs de um mentor (GET /mentors/{id}/enrichments)
CREATE INDEX idx_runs_mentor_id
    ON enrichment_runs(mentor_id);

-- Ordenar runs por data (run mais recente primeiro)
CREATE INDEX idx_runs_gerado_em
    ON enrichment_runs(gerado_em DESC);

-- Buscar notícias de um run (F4: avaliação por run)
CREATE INDEX idx_news_run_id
    ON news_items(enrichment_run_id);
```

### Relacionamentos

```
mentors (1) ──< enrichment_runs (1) ──< news_items
```

- Um mentor pode ter múltiplos runs (re-execução sob demanda — SP-4)
- Cada run tem seus `news_items` próprios (isolamento histórico)
- `ON DELETE CASCADE` em `news_items`: deletar um run limpa suas notícias

### Mapeamento PRD → Schema

| Campo PRD (F3 output) | Tabela.coluna |
|---|---|
| `score_geral` | `enrichment_runs.score_geral` |
| `gerado_em` | `enrichment_runs.gerado_em` |
| `linkedin.encontrado` | `enrichment_runs.linkedin_encontrado` |
| `linkedin.url` | `enrichment_runs.linkedin_url` |
| `linkedin.confianca` | `enrichment_runs.linkedin_confianca` |
| `noticias.quantidade` | `enrichment_runs.noticias_quantidade` |
| `noticias.mais_recente` | `enrichment_runs.noticias_mais_recente` |
| `noticias.urls[]` | `news_items.url` (1 row por item) |
| `alerta` | `enrichment_runs.alerta` |
| Performance (F4) | `enrichment_runs.duracao_segundos` |

---

## API Endpoints

### `POST /api/v1/enrichments`

Dispara o pipeline completo para um nome. Executa F1+F2 em paralelo, calcula F3, persiste e retorna.

**Motivação:** entrypoint principal do MVP (F1, F2, F3).

**Request body:**
```json
{ "nome": "Ana Lima" }
```

**Response `201 Created`:**
```json
{
  "id": 42,
  "mentor_id": 7,
  "nome": "Ana Lima",
  "score_geral": 75,
  "gerado_em": "2026-05-12T14:30:00Z",
  "duracao_segundos": 12.4,
  "linkedin": {
    "encontrado": true,
    "url": "https://linkedin.com/in/ana-lima-xyz",
    "confianca": "alta",
    "motivo": null
  },
  "noticias": {
    "quantidade": 4,
    "mais_recente": "2025-11-03",
    "items": [
      {
        "titulo": "Ana Lima assume direção da Startup XYZ",
        "data": "2025-11-03",
        "url": "https://...",
        "snippet": "..."
      }
    ]
  },
  "alerta": null
}
```

**Erros:**

| Status | Quando |
|---|---|
| `422 Unprocessable Entity` | `nome` ausente ou vazio |
| `503 Service Unavailable` | SerpAPI indisponível ou chave inválida |

---

### `GET /api/v1/enrichments/{id}`

Retorna um run específico pelo ID.

**Motivação:** permite consultar resultado de execução anterior sem re-rodar o pipeline (SP-4).

**Response `200 OK`:** mesmo schema do `POST`.

**Erros:**

| Status | Quando |
|---|---|
| `404 Not Found` | ID inexistente |

---

### `GET /api/v1/mentors/{mentor_id}/enrichments`

Lista todos os runs de um mentor, ordenados do mais recente para o mais antigo.

**Motivação:** histórico de enriquecimentos por mentor — permite comparar scores ao longo do tempo (SP-4).

**Response `200 OK`:**
```json
{
  "mentor_id": 7,
  "nome": "Ana Lima",
  "total": 3,
  "enrichments": [
    { "id": 42, "score_geral": 75, "gerado_em": "2026-05-12T14:30:00Z", "alerta": null },
    { "id": 31, "score_geral": 60, "gerado_em": "2026-02-01T09:00:00Z", "alerta": "Sem notícias recentes" }
  ]
}
```

**Erros:**

| Status | Quando |
|---|---|
| `404 Not Found` | `mentor_id` inexistente |

---

### `POST /api/v1/eval`

Roda o pipeline para uma lista de nomes e retorna o relatório de avaliação. Usado na F4 (deep evaluation).

**Motivação:** F4 exige rodar 20 mentores com perfis variados e medir acertos. Este endpoint automatiza a coleta de resultados para avaliação manual posterior.

**Request body:**
```json
{
  "nomes": ["Ana Lima", "Carlos Silva", "..."],
  "label": "deep-eval-rodada-1"
}
```

**Response `200 OK`:**
```json
{
  "label": "deep-eval-rodada-1",
  "total": 20,
  "resumo": {
    "score_medio": 58,
    "linkedin_encontrado_pct": 85,
    "com_noticias_pct": 70,
    "alertas_gerados": 6,
    "duracao_media_segundos": 18.3,
    "acima_de_5min": 2
  },
  "resultados": [ ... ]
}
```

**Erros:**

| Status | Quando |
|---|---|
| `422 Unprocessable Entity` | Lista vazia ou mais de 100 nomes |
| `503 Service Unavailable` | SerpAPI indisponível |

---

## Frontend

### Estado no MVP

UI está fora do escopo do MVP (definido explicitamente no PRD). A interface do MVP é:

**CLI (entregue no MVP):**
```bash
python -m enricher enrich "Ana Lima"
# → imprime JSON formatado no terminal
# → salva no banco local

python -m enricher eval --file mentors.txt
# → roda F4 para lista de nomes em arquivo
# → gera relatório em eval_results.json
```

**Motivação do CLI:** a usuária é não-técnica, mas o MVP é usado por quem faz o setup (desenvolvedor ou time de produto). O CLI permite rodar o pipeline, validar os primeiros 20 casos da F4, e iterar antes de expor para o time de operações.

---

### Pós-MVP: Web UI (quando Connect Endeavor não suportar integração nativa)

Se a validação da suposição crítica 4 confirmar que integração nativa com Connect Endeavor não é viável, o fallback é uma web UI mínima para a usuária acionar o pipeline sem sair do browser.

**Stack:** FastAPI + Jinja2 (server-rendered). Sem JavaScript framework — a operação é simples o suficiente para HTML com HTMX.

**Rotas (todas server-rendered):**

| Método | Path | Página | Responsabilidade |
|---|---|---|---|
| `GET` | `/` | `index.html` | Campo de busca: input nome + botão |
| `POST` | `/search` | redirect → `/results/{id}` | Dispara pipeline, redireciona |
| `GET` | `/results/{id}` | `results.html` | Exibe score, LinkedIn, notícias, alerta |
| `GET` | `/history` | `history.html` | Lista todos os runs (para o time) |

**Split server / client:**

| Camada | Tecnologia | O que roda lá |
|---|---|---|
| Server | FastAPI + Jinja2 | Renderiza HTML com dados do banco |
| Client | HTML + HTMX | Polling de status se pipeline for async |

**Por que não Next.js / React:** a usuária não precisa de reatividade — ela submete um nome e vê um resultado. Server-rendering com Jinja2 elimina build pipeline, deploy separado e complexidade desnecessária para o problema.

**Por que HTMX e não JavaScript puro:** se o pipeline demorar (até 5 min por F4), um polling simples de status evita tela em branco sem exigir SPA. HTMX faz isso com dois atributos HTML.

---

## Fluxo de dados end-to-end

```
Usuária digita "Ana Lima"
        │
        ▼
POST /api/v1/enrichments  { "nome": "Ana Lima" }
        │
        ▼
Orchestrator: asyncio.gather(
    linkedin_discoverer("Ana Lima"),    ← SerpAPI: site:linkedin.com/in
    news_searcher("Ana Lima")           ← SerpAPI: Google News
)
        │
        ▼
score_calculator(linkedin_result, news_results)
→ EnrichmentResult (Pydantic validates schema)
        │
        ▼
repository.save(result)
→ INSERT INTO enrichment_runs (...)
→ INSERT INTO news_items (...) × n
        │
        ▼
Response 201: { score_geral: 75, linkedin: {...}, noticias: {...}, alerta: null }
        │
        ▼
Usuária vê: score 75/100, LinkedIn encontrado (alta confiança), 4 notícias recentes
```

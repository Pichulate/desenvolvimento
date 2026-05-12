# Architecture — Enriquecimento de Perfis de Mentores (MVP Local)

> MVP para rodar na máquina do desenvolvedor. Sem servidor, sem deploy, sem infra.
> Cada decisão está conectada à feature do PRD que a motivou.

---

## Stack

### Linguagem: Python 3.12

**Motivação (F1, F2, F3):** F1 usa Playwright (binding Python), F2 usa httpx para buscar notícias, F3 é lógica pura de score. Um único processo Python cobre os três sem depender de outros runtimes.

---

### Banco: SQLite via stdlib `sqlite3`

**Motivação (SP-4):** arquivo `.db` local, zero configuração, zero servidor. Persiste o histórico de runs para re-execução e comparação (SP-4). Sem ORM — queries diretas com `sqlite3` da stdlib são suficientes para o volume de um MVP. O arquivo fica em `data/enricher.db`.

---

### LinkedIn: Playwright (headed)

**Motivação (F1):** LinkedIn bloqueia requests HTTP simples e headless browsers com frequência. Com Playwright headed, o browser abre visivelmente na máquina do desenvolvedor — resolve CAPTCHAs manualmente quando necessário, mantém cookies de sessão entre execuções. A estratégia é buscar no Google `"Nome Mentor" site:linkedin.com/in` e capturar a URL do primeiro resultado relevante, sem entrar no LinkedIn diretamente.

**Por que headed e não headless:** para MVP local, headed é mais confiável. Headless fica para quando o pipeline precisar rodar desassistido.

---

### Notícias: httpx + DuckDuckGo HTML

**Motivação (F2):** DuckDuckGo não exige API key, não tem limite de requisições para uso pessoal, e retorna resultados de notícias via parâmetro `ia=news`. httpx faz a request, BeautifulSoup4 parseia o HTML. Sem cadastro, sem billing, sem variável de ambiente obrigatória para o primeiro teste.

---

### Interface: CLI via `__main__.py`

**Motivação:** usuária final é não-técnica, mas o MVP é operado pelo desenvolvedor durante F4 (deep evaluation). CLI é suficiente — imprime JSON formatado no terminal e salva no banco local.

---

### Libs completas

| Lib | Versão | Motivação |
|---|---|---|
| `playwright` | ^1.50 | F1: browser headed para encontrar LinkedIn |
| `httpx` | ^0.28 | F2: buscar notícias no DuckDuckGo |
| `beautifulsoup4` | ^4.13 | F2: parsear HTML dos resultados de busca |
| `python-dotenv` | ^1.0 | Carregar config opcional (ex: delay entre requests) |
| `pytest` | ^8.0 | Testes unitários do scorer e parser |
| `pytest-asyncio` | ^0.25 | Testar funções async do pipeline |

Sem FastAPI. Sem SQLAlchemy. Sem SerpAPI. Sem nenhuma API key obrigatória para rodar.

---

## Componentes

### Estrutura de arquivos

```
enricher/
├── __main__.py        # CLI: python -m enricher "Nome"
├── pipeline.py        # Orquestra F1 → F2 → F3 sequencialmente
├── linkedin.py        # F1: Playwright headed, busca URL no Google
├── news.py            # F2: httpx + BS4, busca notícias no DuckDuckGo
├── scorer.py          # F3: calcula score e alertas a partir dos resultados
├── db.py              # SQLite: save/query de enrichment_runs e news_items
└── models.py          # dataclasses: LinkedInResult, NewsItem, EnrichmentResult

data/
└── enricher.db        # arquivo SQLite local (criado automaticamente)

eval/
└── run_eval.py        # F4: roda pipeline para lista de nomes, gera relatório

tests/
├── test_scorer.py     # testa lógica de score e alertas
└── test_parser.py     # testa parsing de HTML de busca
```

### Diagrama do sistema

```
Terminal: python -m enricher "Ana Lima"
           │
           ▼
     __main__.py
           │
           ▼
     pipeline.py          ← orquestra sequencialmente
      │         │
      ▼         ▼
 linkedin.py  news.py
      │         │
      │  Playwright       httpx
      │  headed           + BS4
      │         │
      │  Google search    DuckDuckGo
      │  site:linkedin    ?q="Ana Lima"&ia=news
      │         │
      └────┬────┘
           │
           ▼
       scorer.py          ← F3: score 0-100 + alertas
           │
           ▼
         db.py             ← INSERT no SQLite local
           │
           ▼
     data/enricher.db
           │
           ▼
     __main__.py           ← imprime JSON no terminal
```

**Por que sequencial e não paralelo:** para MVP local headed, rodar Playwright e httpx em paralelo não traz ganho perceptível e complica o debug. Sequencial é mais fácil de acompanhar na tela.

---

## Data Model

### Tabelas (SQLite)

```sql
CREATE TABLE IF NOT EXISTS mentors (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS enrichment_runs (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    mentor_id             INTEGER NOT NULL REFERENCES mentors(id),
    score_geral           INTEGER NOT NULL,
    alerta                TEXT,
    gerado_em             TEXT    NOT NULL DEFAULT (datetime('now')),
    duracao_segundos      REAL,

    -- F1
    linkedin_encontrado   INTEGER NOT NULL DEFAULT 0,   -- 0/1 (bool)
    linkedin_url          TEXT,
    linkedin_confianca    TEXT,    -- 'alta' | 'média' | 'baixa' | NULL
    linkedin_motivo       TEXT,

    -- F2 (resumo; itens detalhados em news_items)
    noticias_quantidade   INTEGER NOT NULL DEFAULT 0,
    noticias_mais_recente TEXT    -- 'YYYY-MM-DD'
);

CREATE TABLE IF NOT EXISTS news_items (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    enrichment_run_id INTEGER NOT NULL REFERENCES enrichment_runs(id),
    titulo            TEXT    NOT NULL,
    data              TEXT,   -- 'YYYY-MM-DD'
    url               TEXT    NOT NULL,
    snippet           TEXT
);
```

### Índices

```sql
CREATE INDEX IF NOT EXISTS idx_runs_mentor   ON enrichment_runs(mentor_id);
CREATE INDEX IF NOT EXISTS idx_runs_data     ON enrichment_runs(gerado_em DESC);
CREATE INDEX IF NOT EXISTS idx_news_run      ON news_items(enrichment_run_id);
```

### Relacionamentos

```
mentors (1) ──< enrichment_runs (1) ──< news_items
```

- Um mentor pode ter N runs (re-execução a qualquer momento — SP-4)
- `mentors.name` é UNIQUE: re-execução do mesmo nome reutiliza o mentor existente

---

## API Endpoints

Não há API REST no MVP local. A interface é exclusivamente CLI.

### Comandos CLI

**Enriquecer um mentor:**
```bash
python -m enricher "Ana Lima"
```
Saída (JSON no terminal):
```json
{
  "id": 42,
  "nome": "Ana Lima",
  "score_geral": 75,
  "gerado_em": "2026-05-12T14:30:00",
  "duracao_segundos": 18.4,
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

**Consultar runs anteriores de um mentor:**
```bash
python -m enricher history "Ana Lima"
```

**Rodar F4 (deep evaluation) para lista de nomes:**
```bash
python eval/run_eval.py mentors.txt
# gera eval_results.json com resumo e resultados individuais
```

**`mentors.txt` — formato simples, um nome por linha:**
```
Ana Lima
Carlos Silva
João Souza
```

---

## Frontend

Não há frontend no MVP. Interface é o terminal.

### Pós-MVP

Se a integração com Connect Endeavor não for viável (assumption 4), a opção mais simples é uma página estática com FastAPI + Jinja2:

- `GET /` — formulário com campo nome + botão
- `POST /search` → redireciona para `/results/{id}`
- `GET /results/{id}` — exibe score, LinkedIn, notícias, alerta

Stack: FastAPI + Jinja2 (server-rendered, sem JavaScript framework).

---

## Fluxo de dados end-to-end

```
$ python -m enricher "Ana Lima"
       │
       ▼
pipeline.py: inicia timer
       │
       ├─ linkedin.py:
       │    Playwright headed abre browser
       │    Navega para google.com
       │    Busca: "Ana Lima" site:linkedin.com/in
       │    Captura primeiro resultado relevante
       │    Avalia confiança (1 resultado claro → alta; múltiplos → média/baixa)
       │    Retorna LinkedInResult
       │
       ├─ news.py:
       │    httpx GET duckduckgo.com?q="Ana Lima"&ia=news
       │    BS4 parseia cards de notícias
       │    Extrai título, data, url, snippet
       │    Retorna List[NewsItem]
       │
       ├─ scorer.py:
       │    Aplica critérios do PRD (F3)
       │    score = 0 se nenhuma fonte encontrada
       │    Gera alerta quando necessário
       │    Retorna EnrichmentResult
       │
       ├─ db.py:
       │    upsert mentors (name UNIQUE)
       │    INSERT enrichment_runs
       │    INSERT news_items × n
       │
       └─ __main__.py:
            Imprime JSON formatado
            Exibe tempo de execução
```

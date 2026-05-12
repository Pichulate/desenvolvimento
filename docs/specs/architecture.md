# Architecture — Enriquecimento de Perfis de Mentores

> Cada decisão está conectada à feature do PRD que a motivou.

---

## Stack

### Linguagem: Node.js (ESM)

**Motivação (F1, F2, F3):** Playwright tem binding nativo e maduro para Node — a mesma linguagem roda o scraper (F1, F2), o servidor Express (API), e a síntese AI (F3). Sem overhead de cruzar processos ou bridges entre runtimes.

---

### Framework: Express

**Motivação:** pipeline de enriquecimento pode levar até 5 minutos (critério F4). Express + SSE entrega progresso em tempo real para o browser sem WebSocket — simples de implementar e sem dependência extra no cliente (EventSource é API nativa do browser).

---

### Banco: SQLite via `better-sqlite3`

**Motivação (SP-4):** arquivo `.db` local, zero servidor, zero configuração. `better-sqlite3` é síncrono — sem callbacks, sem Promises, sem pool de conexões. Para um pipeline sequencial com um usuário por vez, síncrono é mais simples e igualmente performático. Persiste histórico de runs para re-execução sob demanda (SP-4).

---

### LinkedIn: Playwright headed

**Motivação (F1):** LinkedIn bloqueia headless browsers e requests HTTP simples. Com Playwright headed, o browser abre visivelmente — o desenvolvedor resolve login manual e CAPTCHAs na primeira sessão. O `storageState` é salvo em `enricher/data/linkedin-session.json` e reutilizado nas execuções seguintes. Se a sessão expira (redirect para `/login` ou `/authwall`), o arquivo é deletado e o pipeline tenta uma vez mais.

**URL discovery sem LinkedIn URL fornecida:** busca Bing `site:linkedin.com/in "Nome"` e extrai o primeiro perfil relevante dos resultados.

---

### Notícias: Playwright headless + Google News RSS fallback

**Motivação (F2):** Bing News via Playwright headless é a fonte primária — sem API key, sem limite de requisições para uso pessoal. Google News RSS é o fallback quando Bing não retorna resultados suficientes. Ambas as fontes usam o mesmo Playwright já instalado para o LinkedIn.

---

### AI Synthesis: Anthropic `claude-sonnet-4-6`

**Motivação (F3 expandido):** o PRD define score de qualidade como output do F3. A síntese AI vai além — produz `tldr`, `bio`, `topics`, `timeline`, `publicVoice`, e `dataQuality` a partir dos dados coletados nas etapas anteriores. Usa `claude-sonnet-4-6` via `ANTHROPIC_API_KEY`. Fallback: spawn do `claude --print` via Claude Code CLI local, se a variável de ambiente não estiver configurada.

---

### UI: SPA em arquivo único (`ui.html`)

**Motivação:** usuária final é não-técnica (PRD: "não roda scripts"). Uma página servida pelo próprio Express elimina frontend separado, build pipeline e deploy. Design system Ops Center Dark — consistência visual com outras ferramentas internas.

---

### Dependências completas

| Package | Motivação |
|---|---|
| `express` | Servidor HTTP + SSE streaming |
| `better-sqlite3` | SQLite síncrono local (SP-4) |
| `playwright` | LinkedIn headed (F1) + Bing News headless (F2) |
| `@anthropic-ai/sdk` | AI synthesis (F3) |
| `dotenv` | Carregar `ANTHROPIC_API_KEY` de `enricher/data/.env` |

---

## Componentes

### Estrutura de arquivos

```
enricher/
├── server.js                     # Express: endpoints + SSE streaming
├── db.js                         # better-sqlite3: CRUD síncrono
├── ui.html                       # SPA single-file, design Ops Center Dark
├── scrapers/
│   ├── linkedin.js               # F1: Playwright headed, session management
│   └── news.js                   # F2: Bing News headless + Google RSS fallback
├── synthesizers/
│   └── profile.js                # F3: Anthropic claude-sonnet-4-6, JSON profile
├── data/
│   ├── mentors.db                # SQLite (auto-criado)
│   ├── linkedin-session.json     # Playwright storageState (gerado no 1º login)
│   ├── .env                      # ANTHROPIC_API_KEY (fallback para envvar)
│   └── diag/                     # Screenshots diagnósticos dos scrapers
└── package.json
```

### Diagrama do sistema

```
Browser (ui.html)
   │  GET /
   │  POST /api/enrich          → inicia pipeline
   │  GET  /api/enrich/:id/stream  ← SSE: progress, screenshot, done, error
   │
   ▼
server.js (Express)
   │
   ├─ db.js (better-sqlite3)    ← leitura/escrita síncrona
   │
   └─ runFullPipeline()
        │
        ├── [paralelo]
        │    ├─ scrapers/news.js
        │    │    Playwright headless
        │    │    Bing News → Google RSS fallback
        │    │    emite SSE: progress "news_done"
        │    │
        │    └─ scrapers/linkedin.js → findLinkedInUrl()
        │         Bing search site:linkedin.com/in
        │         emite SSE: progress "url_found"
        │
        ├── scrapers/linkedin.js → scrapeProfile()
        │    Playwright headed
        │    session: data/linkedin-session.json
        │    emite SSE: screenshot (diag), progress "linkedin_done"
        │
        └── synthesizers/profile.js
             Anthropic claude-sonnet-4-6
             input: news + linkedin_data do banco
             output: { tldr, bio, topics, timeline, publicVoice, dataQuality }
             emite SSE: synthesis_done, done
```

### Pipeline completo — `runFullPipeline`

| Step | Módulo | Paralelo? | SSE emitido |
|---|---|---|---|
| 1. News scraping + LinkedIn URL discovery | `news.js` + `linkedin.js` | Sim | `progress` `news_done`, `progress` `url_found` |
| 2. LinkedIn profile scraping | `linkedin.js` | Não (depende da URL do step 1) | `screenshot`, `progress` `linkedin_done` |
| 3. AI synthesis | `profile.js` | Não (depende de news + linkedin) | `synthesis_done` |
| 4. Persistência final | `db.js` | — | `done` |

### Gerenciamento de sessão LinkedIn

```
Primeira execução (sem linkedin-session.json):
  Playwright headed → abre linkedin.com/login
  Aguarda URL chegar em /feed/ (login manual do usuário)
  Salva storageState → linkedin-session.json

Execuções seguintes:
  Carrega linkedin-session.json → Playwright headed com contexto autenticado

Sessão expirada (redirect para /login ou /authwall):
  Deleta linkedin-session.json
  Retry uma vez → fluxo de primeira execução
```

---

## Data Model

### Tabelas

```sql
CREATE TABLE IF NOT EXISTS mentors (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    linkedin_url  TEXT,
    linkedin_data TEXT,   -- JSON: dados brutos extraídos pelo scraper
    ai_profile    TEXT,   -- JSON: { tldr, bio, topics, timeline, publicVoice, dataQuality }
    score         INTEGER,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS news_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    mentor_id   INTEGER NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
    title       TEXT    NOT NULL,
    date        TEXT,   -- 'YYYY-MM-DD'
    url         TEXT    NOT NULL,
    snippet     TEXT,
    source      TEXT,   -- 'bing' | 'google_rss'
    scraped_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

### Índices

```sql
CREATE INDEX IF NOT EXISTS idx_news_mentor   ON news_items(mentor_id);
CREATE INDEX IF NOT EXISTS idx_news_date     ON news_items(date DESC);
CREATE INDEX IF NOT EXISTS idx_mentor_score  ON mentors(score DESC);
```

### Relacionamentos

```
mentors (1) ──< news_items
```

- `linkedin_data` e `ai_profile` são armazenados como TEXT JSON — sem tabela separada para evitar joins desnecessários no MVP.
- `ON DELETE CASCADE` em `news_items`: deletar mentor limpa todas as notícias associadas.

---

## API Endpoints

### `GET /`

Serve `ui.html`. Entrypoint da aplicação para a usuária.

---

### `GET /api/mentors`

Lista todos os mentores com contagem de notícias.

**Response `200`:**
```json
[
  {
    "id": 7,
    "name": "Ana Lima",
    "linkedin_url": "https://linkedin.com/in/ana-lima-xyz",
    "score": 75,
    "news_count": 4,
    "updated_at": "2026-05-12T14:30:00"
  }
]
```

---

### `GET /api/mentors/:id`

Detalhe completo: dados do mentor + notícias + `linkedin_data` + `ai_profile`.

**Response `200`:**
```json
{
  "id": 7,
  "name": "Ana Lima",
  "linkedin_url": "https://linkedin.com/in/ana-lima-xyz",
  "linkedin_data": { ... },
  "ai_profile": {
    "tldr": "...",
    "bio": "...",
    "topics": ["fintech", "growth"],
    "timeline": [ ... ],
    "publicVoice": "...",
    "dataQuality": "alta"
  },
  "score": 75,
  "news": [ { "title": "...", "date": "...", "url": "...", "snippet": "..." } ]
}
```

**Erros:** `404` quando mentor não existe.

---

### `DELETE /api/mentors/:id`

Remove mentor e notícias em cascade.

**Response `204`** sem body.

**Erros:** `404` quando mentor não existe.

---

### `POST /api/enrich`

Cria ou atualiza mentor e dispara o pipeline completo.

**Request body:**
```json
{ "name": "Ana Lima", "linkedinUrl": "https://linkedin.com/in/..." }
```
`linkedinUrl` é opcional — se ausente, o pipeline faz discovery via Bing.

**Response `200`:**
```json
{ "mentorId": 7 }
```

Após retornar o `mentorId`, o cliente abre SSE em `GET /api/enrich/7/stream` para acompanhar o progresso.

**Erros:** `400` quando `name` está ausente.

---

### `POST /api/enrich/:id/refresh`

Re-executa o pipeline completo para um mentor existente. Preserva dados anteriores até o novo pipeline completar.

**Request body (opcional):**
```json
{ "linkedinUrl": "https://linkedin.com/in/..." }
```

**Response `200`:**
```json
{ "mentorId": 7 }
```

---

### `GET /api/enrich/:mentorId/stream`

SSE stream de progresso para o job ativo do mentor.

**Motivação:** pipeline pode levar até 5 minutos (critério F4). SSE mantém a usuária informada sobre cada etapa sem polling.

**Content-Type:** `text/event-stream`

**Eventos:**

```
event: progress
data: { "step": "news_done", "message": "4 notícias encontradas" }

event: progress
data: { "step": "url_found", "message": "LinkedIn encontrado: alta confiança" }

event: screenshot
data: { "url": "/data/diag/mentor-7-linkedin.png" }

event: progress
data: { "step": "linkedin_done", "message": "Perfil LinkedIn extraído" }

event: synthesis_done
data: { "profile": { "tldr": "...", "topics": [...], "dataQuality": "alta" } }

event: done
data: { "score": 75 }
```

```
event: error
data: { "message": "LinkedIn session expired — reopen browser to log in" }
```

---

### `POST /api/enrich/:id/linkedin`

Executa apenas o scraping do LinkedIn para um mentor existente (sem re-rodar notícias ou síntese).

**Response `200`:**
```json
{ "mentorId": 7 }
```

---

### `POST /api/enrich/:id/synthesize`

Executa apenas a síntese AI usando dados já presentes no banco. Útil para re-gerar o `ai_profile` sem re-scraper.

**Response `200`:**
```json
{ "mentorId": 7 }
```

---

## Frontend

### Arquitetura

SPA em arquivo único (`ui.html`) — todo HTML, CSS e JavaScript em um arquivo. Sem bundler, sem framework, sem backend separado. Servido diretamente pelo Express.

**Design system:** Ops Center Dark — consistência com outras ferramentas internas.

**Layout:** três painéis

```
┌─────────────────┬───────────────────────────┬──────────────────┐
│   Lista de      │    Detalhe do mentor       │   Ações /        │
│   mentores      │    (score, LinkedIn,       │   Controles      │
│                 │     notícias, ai_profile)  │                  │
└─────────────────┴───────────────────────────┴──────────────────┘
```

**Rotas (client-side, hash-based):**

| Hash | Tela |
|---|---|
| `#/` | Lista de mentores com scores |
| `#/mentor/:id` | Detalhe: score breakdown, LinkedIn, notícias, ai_profile |
| `#/enrich` | Formulário novo mentor + log de progresso via SSE |

**Estado global (três variáveis):**

| Variável | Tipo | Responsabilidade |
|---|---|---|
| `activeMentor` | objeto | Mentor selecionado atualmente |
| `activeStream` | `EventSource \| null` | SSE connection para job em andamento |
| `progressLog` | `string[]` | Linhas do log de progresso exibidas na tela |

**Split server / client:**

| Camada | O que roda lá |
|---|---|
| Server (`server.js`) | Queries SQLite, orquestração do pipeline, SSE |
| Client (`ui.html`) | Renderização de UI, EventSource, navegação hash |

**Nenhum dado é computado no cliente** — toda lógica de score e síntese vive no servidor.

---

## Fluxo de dados end-to-end

```
Usuária digita "Ana Lima" no formulário
       │
       ▼
POST /api/enrich  { name: "Ana Lima" }
       │
       ▼
server.js: cria/atualiza mentor no banco → retorna { mentorId: 7 }
       │
       ▼
Browser abre EventSource: GET /api/enrich/7/stream
       │
       ▼
runFullPipeline(mentorId=7):
       │
       ├── Promise.all([
       │     news.js: Playwright headless → Bing News → Google RSS fallback
       │     linkedin.js: findLinkedInUrl() → Bing "site:linkedin.com/in"
       │   ])
       │   → SSE: progress "news_done", progress "url_found"
       │
       ├── linkedin.js: scrapeProfile(url)
       │   Playwright headed, carrega linkedin-session.json
       │   → SSE: screenshot (diag), progress "linkedin_done"
       │
       ├── profile.js: synthesize(news, linkedinData)
       │   Anthropic claude-sonnet-4-6
       │   → SSE: synthesis_done { tldr, topics, dataQuality, ... }
       │
       └── db.js: UPDATE mentors SET ai_profile, score, linkedin_data
           → SSE: done { score: 75 }
       │
       ▼
Browser navega para #/mentor/7
Exibe score 75/100, LinkedIn (alta confiança), 4 notícias, ai_profile
```

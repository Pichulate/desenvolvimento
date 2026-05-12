# 01 — Scaffolding

## O que fazer

- Criar `enricher/package.json` com `"type": "module"` e deps: `express`, `better-sqlite3`, `playwright`, `@anthropic-ai/sdk`, `dotenv`
- Criar `enricher/db.js`: função `initDb()` que cria as tabelas abaixo se não existirem; exporta a instância `db`

```sql
CREATE TABLE IF NOT EXISTS mentors (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  linkedin_url TEXT,
  linkedin_data TEXT,  -- JSON bruto do scraper
  ai_profile   TEXT,  -- JSON: { tldr, bio, topics, timeline, publicVoice, dataQuality }
  score        INTEGER,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS news_items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  mentor_id         INTEGER NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
  title             TEXT    NOT NULL,
  date              TEXT,   -- 'YYYY-MM-DD'
  url               TEXT    NOT NULL,
  snippet           TEXT,
  source            TEXT,   -- 'bing' | 'google_rss'
  scraped_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_news_mentor  ON news_items(mentor_id);
CREATE INDEX IF NOT EXISTS idx_news_date    ON news_items(date DESC);
CREATE INDEX IF NOT EXISTS idx_mentor_score ON mentors(score DESC);
```

- Criar `enricher/server.js`:
  - Express na porta 3000
  - Chama `initDb()` no startup
  - `GET /` serve `enricher/ui.html`
  - `GET /data/diag/*` serve arquivos estáticos de `enricher/data/diag/`
  - Imprime `"Enricher online at http://localhost:3000"` no startup

- Criar `enricher/ui.html`: página mínima Ops Center Dark com texto "Enricher online" e `<div id="app">`

- Criar diretórios:
  - `enricher/data/diag/` (screenshots diagnósticos)
  - `enricher/scrapers/`
  - `enricher/synthesizers/`

- Criar `enricher/data/.gitignore`:
  ```
  mentors.db
  linkedin-session.json
  .env
  diag/
  ```

## O que precisa existir antes

Nada. Tarefa sem dependências.

## Como saber que está pronto

```bash
cd enricher && npm install
node server.js
# → "Enricher online at http://localhost:3000"

curl http://localhost:3000/
# → HTML com "Enricher online"

ls enricher/data/mentors.db
# → arquivo existe (criado automaticamente pelo initDb)
```

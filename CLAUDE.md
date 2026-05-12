# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é este repositório

Pipeline de enriquecimento de perfis de mentores da rede Endeavor. A partir de um nome, descobre automaticamente o LinkedIn da pessoa, busca notícias públicas, scrapa o perfil LinkedIn, sintetiza um perfil estruturado com AI, e retorna um score de qualidade. Tudo acessível por uma UI web local ou via API.

## Stack

- **Runtime:** Node.js ESM (`"type": "module"` em todos os `package.json`)
- **Servidor:** Express + SSE para streaming de progresso do pipeline
- **Banco:** SQLite via `better-sqlite3` (síncrono — sem Promises, sem pool)
- **Scraping:** Playwright — headless para notícias e descoberta de URL, headed para LinkedIn (requer sessão)
- **AI:** Anthropic `claude-sonnet-4-6` via `@anthropic-ai/sdk`
- **Frontend:** SPA single-file `ui.html` (sem bundler, sem framework)

## Estrutura do projeto

```
enricher/           ← aplicação principal (criada na tarefa 01)
  server.js         ← Express + todos os endpoints + runFullPipeline
  db.js             ← único arquivo que toca o SQLite
  scorer.js         ← função pura: calcScore(linkedinDiscovery, newsItems)
  ui.html           ← SPA Ops Center Dark, hash routing, SSE client
  scrapers/
    news.js         ← searchNews(name): Bing News headless + Google RSS fallback
    linkedin.js     ← findLinkedInUrl(name) + scrapeProfile(url) + ensureSession
  synthesizers/
    profile.js      ← synthesize(mentor, newsItems): chama claude-sonnet-4-6
  data/
    mentors.db      ← SQLite local (auto-criado, não comitar)
    linkedin-session.json  ← storageState Playwright (não comitar)
    .env            ← ANTHROPIC_API_KEY (não comitar)
    diag/           ← screenshots diagnósticos do scraper LinkedIn

docs/
  discovery/        ← PRD, assumption map, user study, problem framing
  specs/            ← architecture.md com decisões técnicas justificadas

tarefas/            ← spec de implementação dividida em 8 tarefas verticais
```

## Como rodar

```bash
cd enricher
npm install
npx playwright install chromium
node server.js
# → http://localhost:3000
```

## Comandos úteis

```bash
# Testar scraper de notícias isolado
node -e "import('./scrapers/news.js').then(m => m.searchNews('Nome Mentor').then(console.log))"

# Testar descoberta de LinkedIn isolado
node -e "import('./scrapers/linkedin.js').then(m => m.findLinkedInUrl('Nome Mentor').then(console.log))"

# Testar síntese AI com dados hardcoded
node -e "import('./synthesizers/profile.js').then(m => m.synthesize({name:'X', linkedin_data:'{}'}, []).then(console.log))"

# Inspecionar banco
sqlite3 enricher/data/mentors.db "SELECT id, name, score FROM mentors;"
sqlite3 enricher/data/mentors.db "SELECT COUNT(*) FROM news_items WHERE mentor_id=1;"

# Disparar pipeline via curl
curl -s -X POST http://localhost:3000/api/enrich \
  -H "Content-Type: application/json" -d '{"name":"Nome Mentor"}'

# Acompanhar SSE no terminal
curl -N http://localhost:3000/api/enrich/1/stream
```

## Decisões arquiteturais importantes

**`db.js` é a única camada que toca SQLite.** Não fazer queries diretas em `server.js` ou scrapers.

**Scrapers retornam `{ data, error }` ou array vazio — nunca lançam exceção não tratada.** O pipeline continua mesmo se LinkedIn ou notícias falharem (fallback explícito do PRD).

**LinkedIn usa Playwright headed** porque LinkedIn bloqueia headless ativamente. A sessão é salva em `data/linkedin-session.json` e reutilizada. Se a sessão expirar (redirect para `/login` ou `/authwall`), o arquivo é deletado e o login é refeito automaticamente (retry único).

**SSE mantém o cliente informado durante o pipeline** (pode levar até 5 minutos). O `server.js` mantém um `Map<mentorId, sseEmit>` para que `GET /api/enrich/:id/stream` encontre o emitter do job ativo.

**`calcScore` em `scorer.js` é função pura** — sem efeitos colaterais, testável com `node --test`. Score nunca inventa dados: retorna 0 quando nenhuma fonte é encontrada.

**`ai_profile` e `linkedin_data` são armazenados como TEXT JSON** na tabela `mentors` — sem tabela separada, para evitar joins no caso de uso mais comum.

**ANTHROPIC_API_KEY:** lida em ordem — `process.env`, depois `data/.env`, depois fallback para `claude --print` via CLI local.

## Plano de implementação

Ver `tarefas/` — 8 tarefas verticais (banco + lógica + interface cada uma):

| Tarefa | Depende de |
|---|---|
| 01-scaffolding | — |
| 02-busca-noticias | 01 |
| 03-linkedin-discovery | 01 |
| 04-linkedin-perfil | 01 |
| 05-sintese-ai | 01 |
| 06-pipeline-sse | 01, 02, 03, 04, 05 |
| 07-ui-completa | 06 |
| 08-avaliacao | 07 |

Cada arquivo de tarefa especifica: o que fazer, o que precisa existir antes, e como verificar que está pronto.

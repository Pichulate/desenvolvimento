# 02 — Busca de notícias

## O que fazer

### `enricher/scrapers/news.js`

```js
// export: async function searchNews(name) => NewsItem[]
// NewsItem: { title, date, url, snippet, source }
// source: 'bing' | 'google_rss'
```

Lógica:
1. Playwright **headless** — navega para `https://www.bing.com/news/search?q="<name>"` (nome com aspas para match exato)
2. Extrai cards de notícia: título, data, URL, snippet
3. Normaliza datas para `YYYY-MM-DD`; ordena por data desc
4. Se quantidade retornada < 3: fallback para Google News RSS
   - URL: `https://news.google.com/rss/search?q=<name>&hl=pt-BR&gl=BR&ceid=BR:pt-419`
   - Parseia XML manualmente (`DOMParser` não está disponível em Node — usar regex ou `node:xml`)
   - Extrai `<item>`: `<title>`, `<pubDate>`, `<link>`, `<description>`
5. Retorna array (vazio = ok, nunca lança exceção não tratada)
6. Campo `source`: `"bing"` para resultados do Bing, `"google_rss"` para resultados do RSS

### `enricher/db.js` — adicionar

```js
// insertNewsItems(mentorId, items[]) — bulk insert em news_items
// upsertMentor(name) — INSERT OR IGNORE + SELECT; retorna mentor row
```

### `enricher/server.js` — adicionar

```js
// GET /api/mentors
// → todos os mentors com news_count (LEFT JOIN COUNT)
// Response: [{ id, name, linkedin_url, score, news_count, updated_at }]

// POST /api/enrich (stub para esta tarefa)
// Body: { name }
// Chama: searchNews(name) → upsertMentor → insertNewsItems
// Response: { mentorId }
```

### `enricher/ui.html` — adicionar

Seção de busca de notícias:
- Input de texto com placeholder "Nome do mentor"
- Botão "Buscar notícias"
- Ao clicar: `POST /api/enrich` com o nome → lista resultados
- Cada item exibe: título (link clicável para URL), data, fonte (`bing` / `google_rss`)

## O que precisa existir antes

- **Tarefa 01 concluída**: `enricher/package.json`, `enricher/db.js` com schema, `enricher/server.js` base, Playwright instalado via `npm install`

## Como saber que está pronto

```bash
cd enricher && node server.js &

node -e "
  import('./scrapers/news.js')
    .then(m => m.searchNews('Guilherme Benchimol'))
    .then(r => {
      console.log(r.length, 'notícias');
      console.log(JSON.stringify(r[0], null, 2));
    })
"
# → pelo menos 3 itens
# → cada item tem title, url, date (YYYY-MM-DD), snippet, source preenchidos

curl http://localhost:3000/api/mentors
# → array (pode estar vazio inicialmente)
```

Abrindo `http://localhost:3000`: digitar "Guilherme Benchimol", clicar "Buscar notícias" → lista aparece com títulos clicáveis e datas.

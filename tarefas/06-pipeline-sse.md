# 06 — Pipeline completo + SSE

## O que fazer

### `enricher/scorer.js`

```js
// export: function calcScore(linkedinDiscovery, newsItems) => ScoreResult
// ScoreResult: { score_geral, alerta }
```

Lógica exata do PRD:

| Condição | Pontos |
|---|---|
| LinkedIn confiança `alta` | +40 |
| LinkedIn confiança `média` | +20 |
| `newsItems.length >= 3` | +40 |
| `newsItems.length` entre 1 e 2 | +20 |
| Notícia mais recente < 12 meses atrás | +20 bônus |
| Máximo | 100 |

Alertas (string separada por `"; "` quando múltiplos):
- LinkedIn `baixa`: `"Perfil LinkedIn ambíguo — verificar manualmente"`
- `newsItems` vazio: `"Sem notícias encontradas"`
- Notícia mais recente > 12 meses: `"Notícias desatualizadas — mais recente há mais de 12 meses"`
- LinkedIn null E news vazio: `"Nenhuma fonte encontrada"` (substitui os demais)

`score_geral = 0` quando nenhuma fonte disponível. Nunca retorna negativo.

### `enricher/server.js` — `runFullPipeline`

```js
async function runFullPipeline(mentorId, linkedinUrlOverride, sseEmit) {
  const mentor = db.getMentor(mentorId);
  const start = Date.now();

  try {
    // Step 1 — paralelo
    sseEmit('progress', { step: 'start', message: `Iniciando enriquecimento de ${mentor.name}` });
    const [newsItems, linkedinDiscovery] = await Promise.all([
      searchNews(mentor.name),
      linkedinUrlOverride
        ? Promise.resolve({ url: linkedinUrlOverride, confianca: 'alta', motivo: null })
        : findLinkedInUrl(mentor.name)
    ]);
    sseEmit('progress', { step: 'news_done', message: `${newsItems.length} notícias encontradas` });
    sseEmit('progress', { step: 'url_found',
      message: linkedinDiscovery.url
        ? `LinkedIn encontrado (confiança: ${linkedinDiscovery.confianca})`
        : 'LinkedIn não encontrado' });

    // Step 2 — série (depende da URL do step 1)
    let linkedinData = null;
    if (linkedinDiscovery.url) {
      linkedinData = await scrapeProfile(linkedinDiscovery.url);
      sseEmit('screenshot', { url: `/data/diag/${mentorId}-latest.png` });
      sseEmit('progress', { step: 'linkedin_done', message: 'Perfil LinkedIn extraído' });
    }

    // Step 3 — score
    const { score_geral, alerta } = calcScore(linkedinDiscovery, newsItems);

    // Step 4 — síntese
    const aiProfile = await synthesize(
      { ...mentor, linkedin_data: JSON.stringify(linkedinData) },
      newsItems
    );
    sseEmit('synthesis_done', { profile: aiProfile });

    // Step 5 — persistir
    db.insertNewsItems(mentorId, newsItems);
    db.updateLinkedinData(mentorId, {
      linkedin_url: linkedinDiscovery.url,
      linkedin_data: JSON.stringify(linkedinData),
    });
    db.updateAiProfile(mentorId, { ai_profile: JSON.stringify(aiProfile), score: score_geral });

    const duracao = (Date.now() - start) / 1000;
    sseEmit('done', { score: score_geral, alerta, duracao_segundos: duracao });

  } catch (err) {
    sseEmit('error', { message: err.message });
  }
}
```

### Todos os endpoints finais em `server.js`

```
GET  /api/mentors                   → lista com news_count
GET  /api/mentors/:id               → mentor completo + news[]
DELETE /api/mentors/:id             → 204, cascade
POST /api/enrich                    → { name, linkedinUrl? } → { mentorId }; dispara pipeline
POST /api/enrich/:id/refresh        → { linkedinUrl? } → { mentorId }; re-roda pipeline
GET  /api/enrich/:mentorId/stream   → SSE do job ativo
POST /api/enrich/:id/linkedin       → só scraping LinkedIn
POST /api/enrich/:id/synthesize     → só síntese AI
```

**SSE — implementação correta:**
```js
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');
res.flushHeaders();

function sseEmit(event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
// Fechar após 'done' ou 'error':
sseEmit('done', { score });
res.end();
```

**Job registry**: manter `Map<mentorId, sseEmit>` para que `GET /stream` encontre o emitter do job ativo.

### `enricher/db.js` — adicionar

```js
// deleteMentor(id) → DELETE (cascade cuida dos news_items)
// listMentors()    → SELECT com LEFT JOIN COUNT(news_items)
```

## O que precisa existir antes

- **Tarefas 01, 02, 03, 04 e 05 concluídas**:
  - `enricher/scrapers/news.js` com `searchNews`
  - `enricher/scrapers/linkedin.js` com `findLinkedInUrl` e `scrapeProfile`
  - `enricher/synthesizers/profile.js` com `synthesize`
  - `enricher/db.js` com todas as funções CRUD das tarefas anteriores

## Como saber que está pronto

```bash
cd enricher && node server.js &

# Dispara pipeline completo
curl -s -X POST http://localhost:3000/api/enrich \
  -H "Content-Type: application/json" \
  -d '{"name":"Guilherme Benchimol"}'
# → {"mentorId":1}

# Acompanha SSE
curl -N http://localhost:3000/api/enrich/1/stream
# → event: progress  data: {"step":"start",...}
# → event: progress  data: {"step":"news_done","message":"N notícias"}
# → event: progress  data: {"step":"url_found",...}
# → event: screenshot data: {"url":"/data/diag/..."}
# → event: progress  data: {"step":"linkedin_done",...}
# → event: synthesis_done data: {"profile":{...}}
# → event: done  data: {"score":N,"duracao_segundos":X}
# (stream fecha automaticamente)

# Verifica persistência
curl http://localhost:3000/api/mentors/1 | node -e "
  const chunks = [];
  process.stdin.on('data', c => chunks.push(c));
  process.stdin.on('end', () => {
    const r = JSON.parse(Buffer.concat(chunks));
    console.log('score:', r.score);
    console.log('news count:', r.news.length);
    console.log('ai_profile topics:', JSON.parse(r.ai_profile).topics);
  });
"
# → score: N, news count: M, topics: [...]

# Verifica duracao
sqlite3 enricher/data/mentors.db "SELECT name, score FROM mentors;"
# → Guilherme Benchimol|N
```

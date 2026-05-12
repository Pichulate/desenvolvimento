# 03 — LinkedIn URL discovery

## O que fazer

### `enricher/scrapers/linkedin.js`

Criar o arquivo com apenas a função `findLinkedInUrl` (o scraping do perfil vem na tarefa 04).

```js
// export: async function findLinkedInUrl(name) => LinkedInDiscovery
// LinkedInDiscovery: { url, confianca, motivo }
// confianca: 'alta' | 'média' | 'baixa' | null
// motivo: string | null (preenchido quando confiança baixa ou sem resultado)
```

Lógica:
1. Playwright **headless** — navega para `https://www.bing.com/search?q=site:linkedin.com/in+"<name>"`
2. Coleta os primeiros 3 resultados cuja URL contenha `linkedin.com/in/`
3. Regra de confiança:
   - `alta`: exatamente 1 resultado E o texto do link contém o nome buscado (case-insensitive)
   - `média`: 2–3 resultados plausíveis → retorna o primeiro
   - `baixa`: resultados existem mas nenhum bate claramente com o nome (nomes comuns)
   - `null` (sem resultado): `{ url: null, confianca: null, motivo: "Nenhum perfil encontrado" }`
4. Quando `baixa`: preenche `motivo: "Perfil LinkedIn ambíguo — verificar manualmente"`
5. Nunca lança exceção não tratada — em caso de erro de rede: retorna `{ url: null, confianca: null, motivo: "Erro na busca: <message>" }`

### `enricher/db.js` — adicionar

```js
// getMentor(id) — retorna mentor row com news_items[]
// updateLinkedinUrl(mentorId, { linkedin_url, linkedin_confianca })
```

### `enricher/server.js` — adicionar

```js
// GET /api/mentors/:id
// → mentor completo: { id, name, linkedin_url, linkedin_confianca,
//     linkedin_data, ai_profile, score, news: [] }
// Erro 404 quando mentor não existe
```

### `enricher/ui.html` — adicionar

Na seção de detalhe do mentor (acessível via `GET /api/mentors/:id`):
- Badge LinkedIn com a URL como link clicável
- Cor do badge por nível de confiança:
  - `alta` → verde
  - `média` → amarelo
  - `baixa` → laranja + texto do `motivo`
  - `null` → cinza "LinkedIn não encontrado"

## O que precisa existir antes

- **Tarefa 01 concluída**: `enricher/package.json`, `enricher/db.js`, `enricher/server.js`, Playwright instalado

## Como saber que está pronto

```bash
cd enricher && node server.js &

# Nome único — deve retornar 'alta'
node -e "
  import('./scrapers/linkedin.js')
    .then(m => m.findLinkedInUrl('Guilherme Benchimol'))
    .then(r => console.log(JSON.stringify(r, null, 2)))
"
# → { url: 'https://www.linkedin.com/in/...', confianca: 'alta', motivo: null }

# Nome ambíguo — deve retornar 'baixa' ou 'média'
node -e "
  import('./scrapers/linkedin.js')
    .then(m => m.findLinkedInUrl('Carlos Silva'))
    .then(r => console.log(r.confianca, r.motivo))
"
# → 'baixa' | 'média'   (não 'alta')

# Nome sem LinkedIn — deve retornar null sem crash
node -e "
  import('./scrapers/linkedin.js')
    .then(m => m.findLinkedInUrl('Zxqwerty Nomeinexistente123'))
    .then(r => console.log(r))
"
# → { url: null, confianca: null, motivo: 'Nenhum perfil encontrado' }
```

Na UI: criar um mentor manualmente via `POST /api/enrich` com `linkedinUrl` null → detalhe exibe badge com confiança correta.

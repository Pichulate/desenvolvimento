# 05 — Síntese AI

## O que fazer

### `enricher/synthesizers/profile.js`

```js
// export: async function synthesize(mentor, newsItems) => AiProfile
// AiProfile: { tldr, bio, topics, timeline, publicVoice, dataQuality }
// dataQuality: 'alta' | 'média' | 'baixa'
```

**Setup da API key — em ordem de prioridade:**
1. `process.env.ANTHROPIC_API_KEY`
2. Lê `enricher/data/.env` com `dotenv` (`ANTHROPIC_API_KEY=sk-...`)
3. Fallback: `child_process.spawn('claude', ['--print', systemPrompt + '\n\n' + userPrompt])`; parseia stdout como JSON

**Construção do prompt:**

System:
```
Você é um assistente que gera perfis estruturados de mentores de negócios.
Baseie-se EXCLUSIVAMENTE nos dados fornecidos abaixo.
NÃO invente informações que não estejam presentes nas fontes.
Se um campo não tiver evidência suficiente, retorne null para esse campo.
Retorne SOMENTE JSON válido, sem texto adicional, sem markdown code blocks.
```

User (construído dinamicamente):
```
DADOS DO LINKEDIN:
<linkedin_data parseado como JSON formatado, ou "Não disponível">

NOTÍCIAS E ARTIGOS:
<para cada NewsItem: "Título: X\nData: Y\nURL: Z\nResumo: W\n---">

Retorne o seguinte JSON:
{
  "tldr": "<1 frase: quem é e qual é o superpoder principal>",
  "bio": "<2-3 parágrafos: trajetória, o que construiu, onde tem autoridade real>",
  "topics": ["<topic1>", "<topic2>", "<topic3>"],
  "timeline": [
    { "year": "YYYY", "event": "<descrição do evento>", "source": "<url da fonte>" }
  ],
  "publicVoice": "<padrão de comunicação pública observado nas fontes, ou null>",
  "dataQuality": "<alta | média | baixa — baseado na riqueza e recência dos dados>"
}
```

**Regra para `dataQuality`:**
- `alta`: LinkedIn com experiência detalhada + ≥ 3 notícias recentes (< 2 anos)
- `média`: LinkedIn ok OU notícias, mas não ambos com qualidade
- `baixa`: dados escassos, desatualizados ou ausentes em ambas as fontes

**Tratamento de erros:** se API falhar ou JSON inválido retornar → `{ tldr: null, bio: null, topics: [], timeline: [], publicVoice: null, dataQuality: 'baixa' }`

### `enricher/db.js` — adicionar

```js
// updateAiProfile(mentorId, { ai_profile, score })
// ai_profile: string (JSON.stringify do AiProfile)
// score: integer
```

### `enricher/server.js` — adicionar

```js
// POST /api/enrich/:id/synthesize
// Lê mentor + news_items do banco
// Chama synthesize(mentor, newsItems)
// Salva ai_profile e score
// Response: { mentorId }
// Erro 404 se mentor não existe
// Erro 400 se mentor não tem dados (linkedin_data e news_items vazios)
```

### `enricher/ui.html` — adicionar

Seção "Perfil AI" no painel central (visível em `#/mentor/:id`):
- `tldr` em destaque (fonte maior, cor de destaque)
- `topics` como badges coloridos
- `timeline` como lista vertical: ano + evento + link clicável para `source` (obrigatório — sem link = não exibir a entrada)
- `publicVoice` em itálico (quando não null)
- Badge `dataQuality`:
  - `alta` → verde
  - `média` → amarelo
  - `baixa` → laranja com texto "Dados insuficientes — verificar manualmente"

No painel de ações: botão "Re-sintetizar" que chama `POST /api/enrich/:id/synthesize`.

## O que precisa existir antes

- **Tarefa 01 concluída**: scaffold base
- `ANTHROPIC_API_KEY` configurada em `enricher/data/.env` ou como variável de ambiente (ou Claude Code CLI instalado como fallback)

## Como saber que está pronto

```bash
cd enricher

# Testar com dados hardcoded (não depende de scrapers)
node -e "
  import('./synthesizers/profile.js').then(m =>
    m.synthesize(
      {
        name: 'Guilherme Benchimol',
        linkedin_data: JSON.stringify({
          headline: 'Fundador e Presidente do Conselho da XP Inc.',
          about: 'Fundei a XP em 2001...',
          experience: [
            { company: 'XP Inc.', title: 'Fundador', startDate: 'Jan 2001', endDate: 'Present' }
          ]
        })
      },
      [
        {
          title: 'XP Inc. abre capital na Nasdaq com valor de mercado de US\$ 14 bi',
          date: '2019-12-11',
          url: 'https://exemplo.com/xp-nasdaq',
          snippet: 'A XP Inc. estreou na bolsa americana...',
          source: 'bing'
        }
      ]
    )
  ).then(r => console.log(JSON.stringify(r, null, 2)))
"
# → {
#     tldr: '...',
#     topics: ['fintech', 'mercado de capitais', ...],
#     dataQuality: 'alta' | 'média',
#     timeline: [{ year: '2019', event: '...', source: 'https://exemplo.com/xp-nasdaq' }]
#   }
# VERIFICAR: nenhum campo de timeline tem source null
# VERIFICAR: dataQuality não é 'alta' quando dados são claramente fracos
```

Na UI: seção "Perfil AI" renderiza com tldr em destaque, badges de topics, e cada entrada de timeline tem link clicável para a fonte.

# 04 — LinkedIn profile scraping

## O que fazer

### `enricher/scrapers/linkedin.js` — adicionar `ensureSession` e `scrapeProfile`

Este arquivo já existe após a tarefa 03 com `findLinkedInUrl`. Adicionar as duas funções abaixo.

```js
// export: async function scrapeProfile(url) => LinkedInData
// LinkedInData: { name, headline, about, experience[], education[] }
// experience[]: { company, title, startDate, endDate, description }
// education[]:  { school, degree, field, startDate, endDate }
```

**`ensureSession(browser)`** — gerencia persistência da sessão LinkedIn:
```
SE enricher/data/linkedin-session.json NÃO existe:
  Abre nova página com browser headed
  Navega para https://www.linkedin.com/login
  Exibe no terminal: "Faça login no LinkedIn e aguarde ser redirecionado ao feed..."
  Polling a cada 2s: aguarda page.url() conter '/feed/' (timeout 120s)
  Salva browser.storageState() → enricher/data/linkedin-session.json
  Exibe: "Sessão salva. Prosseguindo..."

SE existe:
  Cria contexto com storageState: JSON.parse(fs.readFileSync(...))
  Retorna contexto

SE durante scrapeProfile a URL redirecionar para /login ou /authwall:
  Deleta enricher/data/linkedin-session.json
  Chama ensureSession novamente (retry único — não loop infinito)
```

**`scrapeProfile(url)`**:
1. Lança browser **headed** (`headless: false`)
2. Chama `ensureSession(browser)`
3. Navega para `url`
4. Verifica redirect para login/authwall → retry via `ensureSession` se necessário
5. Extrai dados usando seletores baseados em **aria-label e estrutura semântica** (não class names que mudam):
   - `name`: `h1` da seção principal
   - `headline`: elemento logo abaixo do h1 com texto de cargo/empresa
   - `about`: seção `#about` ou aria-label "About"
   - `experience`: lista de itens na seção "Experience"; para cada item: empresa, título, período (startDate/endDate como strings "Jan 2020")
   - `education`: lista de itens na seção "Education"
6. Salva screenshot em `enricher/data/diag/<mentorId>-<timestamp>.png` (passar mentorId como parâmetro opcional)
7. Fecha contexto (não o browser — reutilizar instância)
8. Retorna `LinkedInData` (campos ausentes = `null`; arrays vazios = `[]`)
9. Nunca lança exceção não tratada

### `enricher/db.js` — adicionar

```js
// updateLinkedinData(mentorId, { linkedin_url, linkedin_data })
// linkedin_data: string (JSON.stringify do LinkedInData)
```

### `enricher/server.js` — adicionar

```js
// POST /api/enrich/:id/linkedin
// Chama scrapeProfile para um mentor existente
// Salva linkedin_data e linkedin_url no banco
// Response: { mentorId }
// Erro 404 se mentor não existe
```

### `enricher/ui.html` — adicionar

No painel de ações (lado direito):
- Botão "Atualizar LinkedIn" — chama `POST /api/enrich/:id/linkedin`
- Enquanto processa: botão desabilitado com texto "Aguardando..."
- Após concluir: seção de experiências no painel central atualiza com:
  - Headline do mentor
  - Lista de experiências: empresa em negrito, título, período

## O que precisa existir antes

- **Tarefa 01 concluída**: scaffold base com Playwright instalado
- *(Tarefa 03 pode ter sido concluída antes, mas não é obrigatória — `scrapeProfile` funciona com URL passada diretamente)*

## Como saber que está pronto

```bash
cd enricher

# Primeiro uso: abre browser headed para login manual
node -e "
  import('./scrapers/linkedin.js')
    .then(m => m.scrapeProfile('https://www.linkedin.com/in/guilherme-benchimol/'))
    .then(r => console.log(JSON.stringify(r, null, 2)))
"
# → faz login manual no browser que abriu
# → { name: 'Guilherme Benchimol', headline: '...', experience: [{company: 'XP', ...}] }

ls enricher/data/linkedin-session.json
# → arquivo existe

ls enricher/data/diag/
# → tem pelo menos 1 screenshot .png

# Segundo uso: não pede login (reutiliza sessão)
node -e "
  import('./scrapers/linkedin.js')
    .then(m => m.scrapeProfile('https://www.linkedin.com/in/guilherme-benchimol/'))
    .then(r => console.log('experience count:', r.experience.length))
"
# → executa sem abrir tela de login
# → experience count: N (≥ 1)
```

Na UI: clicar "Atualizar LinkedIn" em um mentor com URL conhecida → seção de experiências aparece com dados reais.

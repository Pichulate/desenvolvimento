# 07 — UI completa

## O que fazer

Reescrever `enricher/ui.html` como SPA single-file. Todo o HTML, CSS e JavaScript em um único arquivo. Sem bundler, sem framework. Servido diretamente pelo Express.

**Design system:** Ops Center Dark (fundo escuro, texto claro, cores de destaque para status).

---

### Layout — três painéis

```
┌──────────────────┬────────────────────────────────┬──────────────────┐
│ Painel esquerdo  │ Painel central                 │ Painel direito   │
│                  │                                │                  │
│ Lista de         │ Detalhe do mentor              │ Ações            │
│ mentores         │                                │                  │
│ com scores       │ score breakdown                │ [Enriquecer]     │
│                  │ LinkedIn + confiança           │ [Refresh]        │
│ [+ Novo]         │ ai_profile:                   │ [Só LinkedIn]    │
│                  │   tldr                         │ [Re-sintetizar]  │
│                  │   topics (badges)              │ [Delete]         │
│                  │   timeline com fontes          │                  │
│                  │ notícias com fontes            │                  │
└──────────────────┴────────────────────────────────┴──────────────────┘
```

---

### Hash routing

```js
window.addEventListener('hashchange', render);
window.addEventListener('load', render);

function render() {
  const hash = location.hash || '#/';
  if (hash === '#/') renderList();
  else if (hash.startsWith('#/mentor/')) renderMentor(hash.split('/')[2]);
  else if (hash === '#/enrich') renderEnrich();
}
```

---

### Estado global (três variáveis)

```js
let activeMentor = null;       // objeto mentor selecionado (GET /api/mentors/:id)
let activeStream = null;       // EventSource | null — fecha ao trocar de mentor ou concluir
let progressLog = [];          // string[] — linhas do log SSE
```

---

### Painel esquerdo — lista de mentores

- Carrega via `GET /api/mentors` ao iniciar e após cada enriquecimento concluído
- Cada item: nome do mentor + score como número colorido (verde ≥ 60, amarelo 30-59, vermelho < 30)
- Item selecionado: destaque visual
- Clicar → `location.hash = '#/mentor/' + id`
- Botão "+" ou "Enriquecer novo" → `location.hash = '#/enrich'`

---

### Painel central — detalhe do mentor (`#/mentor/:id`)

Carrega via `GET /api/mentors/:id`.

**Seção LinkedIn:**
- Badge URL (link externo clicável)
- Cor por confiança: verde = alta, amarelo = média, laranja = baixa
- Quando baixa: texto do `motivo` ao lado
- Quando null: "LinkedIn não encontrado"

**Score breakdown:**
- Número grande com o score total
- Expandível com detalhe dos pontos: "LinkedIn +40 · Notícias +20 · Recente +20"
- `alerta` em destaque amarelo quando presente

**Seção ai_profile:**
- `tldr`: fonte maior, cor de destaque
- `dataQuality`: badge colorido; quando `baixa`: fundo laranja + "Verificar manualmente"
- `topics`: lista de badges
- `timeline`: lista vertical; cada entrada: `year · event · [fonte →]`
  - **Regra crítica**: só exibir entradas com `source` preenchido; cada `source` é link clicável
- `publicVoice`: parágrafo em itálico (quando não null)

**Seção notícias:**
- Lista de `news_items` do banco; ordenada por data desc
- Cada item: título (link externo), data, fonte (`bing` / `google_rss`)
- **Regra crítica**: título sempre é link clicável para a URL original

---

### Painel central — formulário de enriquecimento (`#/enrich`)

- Input: "Nome do mentor" (obrigatório)
- Input: "LinkedIn URL" (opcional — placeholder: "Deixe em branco para descoberta automática")
- Botão "Enriquecer"
- Ao submeter:
  1. `POST /api/enrich` com `{ name, linkedinUrl? }`
  2. Recebe `{ mentorId }`
  3. Abre `EventSource: GET /api/enrich/:mentorId/stream`
  4. Exibe log linha a linha conforme eventos chegam:
     - `progress` → nova linha no log com ícone de step
     - `screenshot` → link "Ver screenshot diagnóstico →"
     - `synthesis_done` → "Síntese concluída" + preview do tldr
     - `done` → "Concluído! Score: N" + navega para `#/mentor/:id` após 1.5s
     - `error` → linha vermelha + para de processar
  5. Fecha `activeStream` após `done` ou `error`

---

### Painel direito — ações

Exibido quando um mentor está selecionado (`activeMentor !== null`):

| Botão | Ação |
|---|---|
| Enriquecer (refresh completo) | `POST /api/enrich/:id/refresh` → abre stream |
| Atualizar LinkedIn | `POST /api/enrich/:id/linkedin` → atualiza painel central |
| Re-sintetizar | `POST /api/enrich/:id/synthesize` → atualiza ai_profile |
| Excluir mentor | `DELETE /api/mentors/:id` → volta para `#/` + recarrega lista |

Botões desabilitados durante operação em andamento (`activeStream !== null`).

## O que precisa existir antes

- **Tarefa 06 concluída**: todos os endpoints funcionando, SSE emitindo eventos corretos

## Como saber que está pronto

Abrir `http://localhost:3000` e executar o fluxo completo **sem abrir DevTools**:

1. Painel esquerdo lista mentores já existentes no banco (ou vazio com botão "+ Novo")
2. Clicar "+ Novo" → `#/enrich` abre formulário
3. Digitar "Guilherme Benchimol" → clicar "Enriquecer"
4. Log de progresso aparece linha a linha: news_done → url_found → linkedin_done → synthesis_done → done
5. Após 1.5s do `done`: navega automaticamente para `#/mentor/1`
6. Detalhe exibe:
   - Score com breakdown dos pontos
   - Badge LinkedIn verde (confiança alta) com link clicável
   - tldr em destaque
   - Pelo menos 2 topics como badges
   - Timeline com ≥ 1 entrada com link para fonte
   - Ao menos 1 notícia com título clicável e data
7. Clicar em outro mentor na lista esquerda → detalhe atualiza (sem reload)
8. Clicar "Excluir mentor" → mentor some da lista, volta para `#/`
9. Nenhuma ação require reload manual da página

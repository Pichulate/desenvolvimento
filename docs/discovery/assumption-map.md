# Assumption Map — Enriquecimento de Perfis de Mentores

> Suposições ordenadas por prioridade de validação. As críticas precisam ser testadas antes de escrever uma linha de código — se qualquer uma delas cair, o design muda fundamentalmente.

---

## Críticas — validar antes de codar

### 1. LinkedIn e notícias são acessíveis programaticamente e se complementam

**O que assumimos:** é possível extrair dados estruturados do LinkedIn (cargo, histórico, empresas) e de notícias/artigos públicos sobre o mentor e suas empresas — e que as duas fontes juntas cobrem o que cada uma isolada não cobre. Se o LinkedIn for escasso, notícias compensam. Se não houver notícias, o LinkedIn sustenta o perfil sozinho.

**Por que é arriscado:** LinkedIn bloqueia scraping ativamente; serviços terceiros (Proxycurl, PhantomBuster) têm custo e limites. Notícias dependem de visibilidade pública — mentores de perfil baixo podem não ter cobertura relevante. Se as duas fontes falharem ao mesmo tempo para o mesmo mentor, o perfil fica vazio.

| Campo | Valor |
|---|---|
| Risco | Alto |
| Certeza atual | Baixa |
| Como validar | Testar acesso ao LinkedIn (API oficial, Proxycurl, scraping) e a notícias (Google News, Bing News API, busca direta) para 15 mentores da rede. Medir: cobertura por fonte isolada e cobertura combinada. Identificar em quantos casos as duas falham ao mesmo tempo. |
| Prazo | 2 dias |

---

### 1b. O fallback entre fontes produz perfis de qualidade comparável

**O que assumimos:** um perfil gerado só com LinkedIn (sem notícias) ou só com notícias (sem LinkedIn estruturado) ainda é útil o suficiente para a usuária confiar — mesmo sendo menos completo do que o perfil com as duas fontes.

**Por que é arriscado:** se o fallback produzir um perfil visivelmente inferior, a usuária vai desconfiar do sistema toda vez que não souber qual fonte foi usada. A confiança precisa ser consistente independente do caminho percorrido.

| Campo | Valor |
|---|---|
| Risco | Médio |
| Certeza atual | Baixa |
| Como validar | Gerar três versões do mesmo perfil para 5 mentores: só LinkedIn, só notícias, combinado. Mostrar as três para a usuária sem identificar qual é qual. Avaliar se ela consegue usar as versões parciais ou se só confia na combinada. |
| Prazo | 2 dias (após validação da suposição 1) |

---

### 2. Só o nome é suficiente para encontrar o mentor certo

**O que assumimos:** dado apenas um nome, o sistema consegue identificar o LinkedIn e as fontes corretas do mentor — sem confundir com homônimos.

**Por que é arriscado:** nomes comuns no Brasil (ex: "Carlos Silva", "Ana Lima") vão retornar múltiplos resultados. Sem URL ou e-mail, a desambiguação é um problema real.

| Campo | Valor |
|---|---|
| Risco | Alto |
| Certeza atual | Baixa |
| Como validar | Pegar 15 nomes reais da rede (incluindo nomes comuns) e testar a taxa de acerto da identificação automática. |
| Prazo | 1 dia |

---

### 3. Dados públicos são suficientes para inferir autoridade real — não só cargo

**O que assumimos:** a diferença entre "foi VP de Crescimento" e "construiu go-to-market do zero para 3 países" pode ser extraída de fontes públicas (entrevistas, artigos, posts).

**Por que é arriscado:** essa é a promessa central do produto. Se os dados públicos só repetirem o que já está no LinkedIn, o perfil gerado não vai além do que a usuária já tem.

| Campo | Valor |
|---|---|
| Risco | Alto |
| Certeza atual | Baixa |
| Como validar | Montar manualmente 5 perfis de mentores conhecidos usando só fontes públicas. Pedir à usuária que avalie: "isso te diz algo que o LinkedIn não dizia?" |
| Prazo | 2 dias |

---

### 4. Connect Endeavor tem uma rota de integração viável

**O que assumimos:** é possível fazer o output do sistema aparecer no Connect Endeavor — seja via API, importação, extensão ou outra integração.

**Por que é arriscado:** o Connect Endeavor é um sistema interno. Pode não ter API, pode ter restrições de segurança, pode depender de aprovação de outro time. Se não houver integração, a usuária não vai adotar — ela não vai sair do fluxo dela para usar uma ferramenta separada.

| Campo | Valor |
|---|---|
| Risco | Alto |
| Certeza atual | Baixa |
| Como validar | Conversa de 30 minutos com o time técnico que mantém o Connect Endeavor. Mapear: existe API? Existe campo de texto livre onde o perfil poderia ser colado? Existe alguma extensão possível? |
| Prazo | 1 dia |

---

### 5. LLM extrai áreas de autoridade com precisão suficiente para ser confiável

**O que assumimos:** um modelo de linguagem consegue ler os dados coletados e identificar em quais áreas o mentor tem experiência de quem *fez*, não de quem *estudou* — com baixa taxa de alucinação.

**Por que é arriscado:** LLMs podem extrapolar, confundir ou inventar nuances que não estão nas fontes. A usuária disse que não vai dar segunda chance se o primeiro perfil estiver claramente errado.

| Campo | Valor |
|---|---|
| Risco | Alto |
| Certeza atual | Baixa |
| Como validar | Gerar 10 perfis automaticamente e pedir à usuária que avalie cada área extraída: "correto", "parcialmente correto" ou "errado". Meta mínima: 80% correto ou parcialmente correto. |
| Prazo | 3 dias |

---

## Logo — validar no sprint 1

### 6. A maioria dos mentores tem presença pública suficiente

**O que assumimos:** a maior parte da rede tem material público indexado suficiente (LinkedIn, notícias, entrevistas, posts) para gerar um perfil útil.

**Por que é arriscado:** mentores discretos, sêniores mais velhos ou de setores tradicionais podem ter presença online escassa. Se isso acontecer com 40%+ da rede, o produto tem escopo limitado demais.

| Campo | Valor |
|---|---|
| Risco | Médio |
| Certeza atual | Média |
| Como validar | Amostrar 20 mentores aleatórios da rede e checar manualmente a cobertura de fontes públicas. Medir: quantos têm dados suficientes para um perfil útil? |
| Prazo | 2 dias |

---

### 7. Ver a fonte de cada dado vai construir confiança — não fricção

**O que assumimos:** exibir a origem de cada informação (URL, artigo, post) vai fazer a usuária confiar mais no perfil gerado.

**Por que é arriscado:** pode ter efeito inverso — ela pode ver as fontes, sentir que precisa checar cada uma, e acabar verificando manualmente de qualquer forma. A transparência pode aumentar o trabalho em vez de reduzir.

| Campo | Valor |
|---|---|
| Risco | Médio |
| Certeza atual | Média |
| Como validar | Mostrar dois formatos de output para a usuária: um com fontes inline, outro com fontes agregadas no final. Observar qual ela consulta mais e qual gera menos dúvida. |
| Prazo | 1 dia (junto com validação da suposição 3 ou 5) |

---

### 8. A dor é frequente o suficiente para justificar adoção regular

**O que assumimos:** a usuária faz pesquisas de mentor com frequência suficiente para que uma ferramenta dedicada se encaixe no hábito — e não seja usada só esporadicamente.

**Por que é arriscado:** "algumas vezes por semana" é estimativa. Pode ser menos. Se o uso real for 2-3x por mês, a ferramenta vira algo que ela lembra quando precisar — e provavelmente não vai lembrar.

| Campo | Valor |
|---|---|
| Risco | Médio |
| Certeza atual | Média |
| Como validar | Pedir à usuária que registre (no próprio Notion ou planilha) cada vez que faz pesquisa manual de mentor nas próximas 2 semanas. |
| Prazo | 2 semanas (pode rodar em paralelo com desenvolvimento) |

---

### 9. Um perfil ruim vai queimar a confiança definitivamente

**O que assumimos:** se a usuária receber um perfil com erros claros nas primeiras interações, ela abandona a ferramenta e não volta.

**Por que é arriscado:** isso não é hipótese — ela disse isso explicitamente. O risco não é "talvez aconteça", é "quase certo que acontece se a qualidade inicial for ruim". A suposição aqui é que o MVP consegue evitar esse cenário.

| Campo | Valor |
|---|---|
| Risco | Alto |
| Certeza atual | Alta |
| Como validar | Não é para validar — é para planejar. A estratégia de lançamento precisa garantir qualidade nos primeiros 5 a 10 perfis. Considerar curadoria manual dos primeiros casos. |
| Prazo | Decisão de design antes do sprint 1 |

---

### 10. Notícias sobre o mentor e suas empresas têm sinal útil — não só ruído

**O que assumimos:** busca em Google News, portais de negócios e redes sociais vai retornar eventos com sinal real: nova empresa fundada, cargo assumido, entrevista concedida, empresa do portfólio com movimento relevante. E que esse sinal complementa (ou substitui) o que o LinkedIn não conta.

**Por que é arriscado:** para mentores sem alta visibilidade pública, o resultado pode ser silêncio ou ruído (menção periférica em notícia sobre terceiro, dado desatualizado de 2015). O sistema precisa saber distinguir sinal de ruído — e isso é mais difícil do que coletar.

| Campo | Valor |
|---|---|
| Risco | Médio |
| Certeza atual | Média |
| Como validar | Buscar notícias de 15 mentores da rede (mesma amostra da suposição 1). Para cada resultado, classificar manualmente: "sinal útil", "ruído" ou "sem resultado". Meta mínima: 60% dos mentores com ao menos um sinal útil. Pode ser feito junto com a validação da suposição 1. |
| Prazo | 1 dia (paralelo à suposição 1) |

---

## Depois — validar após MVP em uso

### 11. A qualidade do match percebida pelo empreendedor vai melhorar

**O que assumimos:** perfis mais ricos e precisos levam a matches melhores, e isso se traduz em sessões mais bem avaliadas pelos empreendedores.

**Por que é arriscado:** a cadeia de causalidade é longa: perfil melhor → decisão de match melhor → sessão mais relevante → empreendedor percebe. Muitas variáveis no meio.

| Campo | Valor |
|---|---|
| Risco | Baixo (para o MVP) |
| Certeza atual | Baixa |
| Como validar | Pesquisa pós-sessão com empreendedores comparando NPS de matches feitos com e sem perfil enriquecido. |
| Prazo | 2-3 meses após lançamento |

---

### 12. O time vai adotar de forma consistente — não só a pessoa que pediu o MVP

**O que assumimos:** a ferramenta vai ser usada por todo o time de operações, não só pela pessoa mais motivada que liderou o projeto.

**Por que é arriscado:** adoção individual é diferente de adoção organizacional. Sem integração no fluxo padrão (onboarding de mentor, processo de match), vira ferramenta opcional que cada um usa ou não.

| Campo | Valor |
|---|---|
| Risco | Médio |
| Certeza atual | Baixa |
| Como validar | Observar taxa de uso por membro do time nas primeiras 4 semanas. Se só uma pessoa usa, investigar o bloqueio. |
| Prazo | 4 semanas após lançamento |

---

## Resumo de prioridades

| # | Suposição | Risco | Certeza | Prioridade |
|---|---|---|---|---|
| 1 | LinkedIn e notícias são acessíveis e se complementam | Alto | Baixa | **Crítica** |
| 1b | Fallback entre fontes produz perfil de qualidade comparável | Médio | Baixa | **Crítica** |
| 2 | Nome é suficiente para identificar o mentor | Alto | Baixa | **Crítica** |
| 3 | Dados públicos revelam autoridade real | Alto | Baixa | **Crítica** |
| 4 | Connect Endeavor tem rota de integração | Alto | Baixa | **Crítica** |
| 5 | LLM extrai autoridade com precisão suficiente | Alto | Baixa | **Crítica** |
| 6 | Maioria dos mentores tem presença pública | Médio | Média | Logo |
| 7 | Fontes constroem confiança, não fricção | Médio | Média | Logo |
| 8 | Dor é frequente o suficiente para adoção | Médio | Média | Logo |
| 9 | Perfil ruim queima confiança definitivamente | Alto | Alta | Logo |
| 10 | Notícias têm sinal útil — não só ruído | Médio | Média | Logo |
| 11 | Qualidade do match percebida pelo empreendedor melhora | Baixo | Baixa | Depois |
| 12 | Adoção se espalha para todo o time | Médio | Baixa | Depois |

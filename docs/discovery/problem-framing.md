# Problem Framing — Enriquecimento de Perfis de Mentores

## A dor real

A Endeavor tem uma rede de centenas de mentores, mas não tem dados estruturados sobre o que cada um deles *de fato construiu e viveu*. Isso significa que, na prática, a rede existe no papel — mas o time não consegue ativá-la bem porque não sabe, com rapidez e confiança, *quem sabe o quê de verdade*.

O briefing manual antes de sessões e matches é o sintoma visível. A dor real é estrutural: **ausência de conhecimento organizado e confiável sobre a rede de mentores**.

---

## Quem sofre e em que contexto

**Afetado principal:** time de operações/CS da Endeavor.

**Contexto de ativação:** sob demanda, antes de uma sessão de mentoria ou decisão de match. O ponto de partida disponível é apenas o nome do mentor — sem LinkedIn URL, sem histórico estruturado.

**Afetados secundários:**
- Empreendedores: recebem matches mal direcionados, desperdiçam sessões com mentores fora da sua realidade
- Mentores: têm seu tempo usado em sessões aquém do que poderiam contribuir

---

## O que acontece sem solução

- Pesquisa manual de 30+ minutos por mentor (Google, LinkedIn, notícias)
- Qualidade do briefing depende de quem fez — resultado desigual e inconsistente
- A rede de centenas de mentores permanece subutilizada porque o time não tem dados para navegar nela com agilidade
- Matches fracos → sessões mal direcionadas → desperdício de tempo de todos os envolvidos

---

## O que o sistema precisa fazer

**Input:** nome do mentor (apenas)

**Processo:**
1. Localizar fontes públicas automaticamente (LinkedIn, notícias, entrevistas, publicações)
2. Extrair e estruturar as informações relevantes
3. Alertar explicitamente quando os dados forem insuficientes ou de baixa confiança

**Output — perfil estruturado com:**
- Áreas de autoridade real (o que ele construiu, não só o que estudou)
- Empresas e setores onde atuou (histórico substancial de carreira)
- Acontecimentos recentes (movimentos de carreira, entrevistas, notícias)
- Indicador de completude/confiança do perfil

**Destino:** ferramenta interna do time (CRM, Notion ou planilha)

---

## Definição de sucesso para o MVP

> O time consulta o perfil gerado e para de fazer a pesquisa manual.

Indicadores concretos:
- Perfil gerado em segundos a partir de um nome
- O que é encontrado é confiável o suficiente para o time confiar sem verificar manualmente
- Quando os dados são escassos, o sistema deixa isso explícito em vez de inventar

---

## Fora do escopo do MVP

- Interface visual / produto com UI
- Atualização automática e periódica dos perfis
- Match automático entre mentor e empreendedor (decisão permanece humana)
- Validação ou aprovação do perfil pelo próprio mentor

---

## Premissas e riscos

| Premissa | Risco se falsa |
|---|---|
| Mentores relevantes têm presença pública suficiente | Perfis incompletos para mentores discretos — mitigado pelo alerta de completude |
| LinkedIn + busca pública geram dados suficientes | Pode precisar de fontes adicionais (ex: formulário de onboarding do mentor) |
| O time adota a ferramenta se confiar na qualidade | Se a taxa de erro for alta, o time volta a pesquisar manualmente |

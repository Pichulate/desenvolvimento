# User Study — Coordenadora de Rede / Analista de Programas

## Quem é essa pessoa

**Papel:** Membro do time da Endeavor Brasil responsável pela rede de mentores. O cargo varia — Gerente de Rede, Analista de Programas — mas o trabalho é o mesmo: gerir um portfólio de centenas de mentores e conectá-los com os empreendedores certos, para os desafios certos.

**Perfil técnico:** usuária de ferramentas, não técnica. Domina Notion, planilhas, o sistema interno. Não roda scripts, não configura integrações — precisa de algo que funcione dentro do ambiente que ela já usa.

**Ambiente de trabalho principal:** Connect Endeavor (sistema interno da Endeavor).

---

## Como o problema aparece no dia dela

Ela recebe pedidos de match com frequência — algumas vezes por semana. Um empreendedor precisa de ajuda com fundraising, internacionalização, gestão de time. Ela precisa identificar 2 ou 3 mentores relevantes rapidamente.

Para cada mentor candidato, ela abre o LinkedIn, googla o nome, lê notícias, anota o que encontra. Leva entre 20 e 40 minutos por mentor. O contexto típico é de urgência: o pedido chegou, a sessão está próxima, o briefing precisa sair.

O que ela sente durante esse processo: sabe que poderia ser melhor, já tentou melhorar — mas não conseguiu mudar. Faz assim porque é o único jeito que tem.

---

## O que a impede de agir melhor hoje

Três travamentos reais, em ordem de impacto:

1. **Volume:** a rede tem centenas de mentores. Ela não consegue pesquisar todos — então o conhecimento que tem é fragmentado. Quem não foi pesquisado recentemente fica invisível.

2. **Inconsistência:** cada pessoa do time pesquisa de um jeito diferente. O resultado varia muito dependendo de quem fez. Não há um padrão.

3. **Desatualização:** um mentor pode ter mudado de foco, passado por uma crise, ou se destacado recentemente — e isso não aparece em perfis feitos há meses. Os dados envelhecem e ninguém percebe.

---

## Como ela vai saber que funcionou

**Sinal de sucesso pessoal:** preparar uma recomendação de match em menos de 5 minutos, com confiança de que os tópicos do mentor refletem o que ele realmente viveu — não só o que está no LinkedIn.

**Sinal de sucesso do sistema:** o empreendedor sai da sessão dizendo que o mentor entendeu exatamente o problema dele.

---

## O que ela precisa para confiar no output

Ela não vai usar um perfil gerado automaticamente se não souber de onde vieram os dados. **Precisa ver a fonte de cada informação.**

Isso tem implicação direta no design: o output não pode ser só um texto corrido ou um card de resumo. Cada claim — área de autoridade, cargo, evento recente — precisa estar vinculado à fonte que o originou (URL, artigo, post).

Sem rastreabilidade de fonte, ela vai verificar manualmente de qualquer forma — e o sistema perde o ponto.

---

## Implicações para o MVP

| Decisão de design | Por quê |
|---|---|
| Output deve rodar dentro do Connect Endeavor ou exportar para ele | É onde ela vive. Ferramenta fora do fluxo não será usada. |
| Cada dado deve exibir sua fonte | Ela só confia se puder ver de onde veio. Sem isso, verifica manualmente. |
| Interface não pode exigir configuração técnica | Ela não é técnica. Precisa funcionar com nome e um clique. |
| Indicador de completude é obrigatório | Ela precisa saber quando confiar menos — não pode ser surpreendida por um perfil vazio ou inventado. |
| Dados precisam ter timestamp | Ela sofre com desatualização. Saber quando o perfil foi gerado é informação crítica. |

---

## O que ela não é

- Não é desenvolvedora nem vai rodar nada no terminal
- Não é a pessoa que define os programas ou aprova os matches finais (liderança faz isso)
- Não tem tempo para aprender uma ferramenta nova com curva de aprendizado
- Não vai dar uma segunda chance se o primeiro perfil gerado estiver claramente errado

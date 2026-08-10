# Funil de simulação — EASY HOUSE

Documentação de instalação, operação e manutenção.

---

## 1. O que foi construído

Uma ferramenta gratuita de pré-simulação de compra de imóvel no Japão, em português,
que entrega valor antes de pedir contato e encaminha a conversa para o WhatsApp com
contexto suficiente para o corretor não recomeçar do zero.

**Decisão de arquitetura:** o site já existia como estático (HTML/CSS/JS, com
Supabase). Em vez de migrar para Next.js — o que significaria reescrever 11 páginas já
otimizadas —, o funil foi construído sobre a mesma base, com Serverless Functions para o
que precisa de servidor. O resultado atende aos requisitos de cálculo isolado, dados
sensíveis fora do browser, configuração versionada e testes, sem descartar o que já funciona.

**Hospedagem:** Vercel (projeto `easy-house-site`). O site nasceu no Netlify e foi migrado
em 05/08/2026; qualquer referência a Netlify em documentos antigos está obsoleta.

---

## 2. Arquivos

```
lib/
  financing.js               motor financeiro (determinístico, sem I/O, sem IA)
  financing-config.json      configuração versionada (reserva local)
tests/
  financing.test.mjs         43 testes — node --test
api/
  simulate.mjs               POST /api/simulate  — calcula no servidor
  lead.mjs                   POST /api/lead      — grava lead, consentimento, simulação
  event.mjs                  POST /api/event     — eventos do funil, sem dados sensíveis
sql/
  schema.sql                 tabelas, RLS e retenção
simular.html                 funil (modo geral)
simular/{cidade}.html        funil por cidade — gerado por build-pages.mjs
funnel.css / funnel.js       tema claro e controlador do funil
simular.js                   fluxo, validações e telas de resultado
admin-taxas.html             painel de configuração de taxas
build-pages.mjs              gera as páginas por cidade
```

---

## 3. Instalação

### 3.1 Banco

No SQL Editor do Supabase, executar **`sql/instalar.sql`** — ele traz o schema
completo e já publica a configuração ativa. É um único arquivo, cole e execute.

(`sql/schema.sql` contém apenas as tabelas, caso queira separar.)

Para conferir se ficou tudo certo:

```bash
bash verificar-funil.sh
```

### 3.2 Variáveis de ambiente (Vercel → Project Settings → Environment Variables)

| Variável | Para quê | Onde obter |
|---|---|---|
| `SUPABASE_URL` | Endereço do projeto | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_KEY` | Gravar leads e simulações | Supabase → API → `service_role` |

Pela CLI (a chave é pedida na hora, sem ficar em arquivo nem no histórico):

```bash
vercel env add SUPABASE_SERVICE_KEY production
vercel env add SUPABASE_SERVICE_KEY preview
vercel --prod          # nova publicação para as variáveis valerem
```

> A `service_role` ignora o RLS. Ela só pode existir nas variáveis do Vercel —
> nunca no HTML, no JS do browser ou no repositório.

Sem essas variáveis o funil continua funcionando: calcula, mostra o resultado e leva ao
WhatsApp, apenas não grava o lead.

### 3.3 Publicação

`git push` — o Vercel publica automaticamente. As functions em `api/` viram
`/api/simulate`, `/api/lead` e `/api/event`. Os cabeçalhos e o cache ficam em
`vercel.json` (`cleanUrls` está ligado, por isso as rotas não levam `.html`).

---

## 4. Como rodar os testes

```bash
node --test tests/financing.test.mjs
```

43 testes cobrindo: fórmula da parcela, cálculo inverso, prazo por idade, capacidade pela
renda, custo de aquisição, seleção de cenário, simulação completa, comparação com aluguel,
taxa zero, idade inválida, dívida acima do limite, mudança de configuração e ausência de
linguagem de aprovação no resultado.

---

## 5. Motor financeiro

Todas as fórmulas ficam em `lib/financing.js`, sem dependência de interface.

| Função | O que faz |
|---|---|
| `calculateMonthlyPayment` | Parcela pelo sistema de amortização constante |
| `calculatePrincipalFromPayment` | Principal a partir da parcela |
| `calculateTerm` | Prazo limitado pelo produto e pela idade de quitação |
| `calculateMaximumHousingPayment` | Capacidade mensal após descontar dívidas |
| `calculateAcquisitionCost` | Imóvel + despesas − entrada |
| `calculateMaximumPropertyPrice` | Preço máximo compatível com o valor financiável |
| `selectFinancingScenario` | Escolhe o cenário de simulação |
| `runSimulation` | Orquestra tudo e devolve o resultado com faixa |
| `compareWithRent` | Comparação honesta com o aluguel atual |

### Regras aplicadas

- **Flat 35** — autônomo, ou empreiteira com menos de 3 anos. Taxa 2,9%, prazo máximo 35 anos,
  quitação até 80 anos, comprometimento de 30% abaixo de ¥4.000.000 e 35% a partir daí.
- **Cenário bancário** — funcionário efetivo, ou empreiteira com 3 anos ou mais. Taxa 1,4%,
  prazo máximo 50 anos, quitação até 80 anos. **A regra de comprometimento ainda não está
  validada**: enquanto isso, o simulador calcula apenas pela parcela desejada e avisa o cliente.
- **Análise manual** — dono de empresa, contrato temporário, outro, ou residência fora da lista
  aceita. Ainda simula pela parcela desejada, deixando claro que não é análise de capacidade.
- **Faixa** — o resultado é sempre um intervalo (margem de 7%, configurável), nunca um valor exato.

> O teto de 35 anos do Flat 35 é aplicado dentro do motor
> (`FLAT35_ABSOLUTE_MAX_TERM_YEARS`), não apenas na configuração. Mesmo que alguém
> edite a configuração por engano, o produto nunca aparece com prazo maior.
> Existe no mercado japonês um Flat 50; ele é outro produto e não é oferecido aqui.

---

## 6. Privacidade

| Dado | Onde vive |
|---|---|
| Renda, dívidas, entrada, visto | Memória do navegador durante a simulação; enviados ao servidor só após o aceite |
| Etapa, cidade, variante do teste | `localStorage` (dados não sensíveis) |
| Identificador de sessão | `sessionStorage` |
| Eventos de analytics | Apenas nome do evento, etapa, variante e origem |

`api/event.mjs` mantém uma lista de bloqueio: renda, dívidas, idade, visto,
nacionalidade, telefone, e-mail e nome são descartados antes de gravar, mesmo se enviados
por engano.

A mensagem do WhatsApp leva apenas o código do lead (`EH-XXXXXX`) e as cidades escolhidas —
nunca valores financeiros. O corretor consulta o restante no CRM pelo código.

Consentimentos ficam em `consent`, com versão da política, texto aceito e data. Nenhuma caixa
vem marcada.

---

## 7. Eventos do funil

`landing_view` · `simulation_started` · `quick_question_completed` · `quick_simulation_completed`
· `preliminary_result_viewed` · `full_simulation_started` · `lead_form_viewed` · `lead_submitted`
· `simulation_result_viewed` · `property_match_viewed` · `property_opened` · `whatsapp_clicked`
· `visit_requested`

Vão para `window.dataLayer` (GTM/GA4) e para a tabela `funnel_event`.

**Meta Pixel — instalado.** `analytics.js` está em todas as páginas públicas e traduz os
eventos acima para o Meta. Falta apenas colar o ID do pixel na constante `PIXEL_ID`
(primeiras linhas do arquivo); enquanto ela estiver vazia, nada é carregado.

- Só carrega após aceite explícito (aviso com *Aceitar* / *Recusar*, nada pré-marcado).
- Ao Meta vão apenas `step` e `variant` — a lista `PARAMS_PERMITIDOS` descarta o resto.
- `lib/meta-capi.js` envia a conversão `Lead` também pelo servidor, com o mesmo
  `eventId` para o Meta não contar duas vezes. Precisa de `META_PIXEL_ID` e
  `META_CAPI_TOKEN` nas variáveis do Vercel; sem elas fica inerte.
- A Conversions API respeita a mesma escolha do visitante: sem aceite, `atribuicao()`
  devolve `null` e o servidor não envia nada.
- **Não enviamos telefone nem e-mail ao Meta**, nem com hash — o aceite do formulário
  é para o atendimento, não para repasse a terceiro. Ver o cabeçalho de `lib/meta-capi.js`.
- `autoConfig` fica **desligado**. Ligado, o Meta dispara `SubscribedButtonClick` a cada
  clique e lê campos de formulário por conta própria — o que mandaria nome, telefone e
  e-mail. Não religar.

> ⚠️ **Ao alterar `analytics.js`, subir o `?v=` nas páginas** (`analytics.js?v=2` → `v=3`)
> e rodar `node build-pages.mjs`. O `vercel.json` guarda `.js` por 24 h: sem subir a versão,
> quem já visitou continua rodando o arquivo antigo. Isso já aconteceu uma vez — a correção
> estava no servidor e o navegador seguia com a versão em cache.

**Ainda não instalado:** GTM, GA4, Google Ads e Meta Conversions API para eventos
que não sejam `Lead`.

---

## 8. Testes A/B

Variante sorteada no primeiro acesso e guardada em `localStorage`. Forçar pela URL: `?v=A` ou `?v=B`.

| Teste | Variante A | Variante B | Métrica |
|---|---|---|---|
| 1 (ativo) | "Veja em 60 segundos quanto pode custar sua casa no Japão" | "Veja quais casas podem caber na parcela que você deseja pagar" | `quick_simulation_completed` |
| 2 (a fazer) | Contato após o resultado preliminar | Contato após a simulação completa | Leads qualificados e agendamentos |
| 3 (a fazer) | "Calcular minha faixa de compra" | "Fazer minha simulação gratuita" | `simulation_started` |

Definir o volume mínimo antes de declarar vencedor. Um teste por vez.

---

## 9. Rotas

| Rota | Uso |
|---|---|
| `/simular` | Campanha geral |
| `/simular/hekinan`, `/takahama`, `/nishio`, `/anjo`, `/kariya` | Campanha por cidade |
| `/admin-taxas` | Configuração das taxas (uso interno) |

Para um imóvel específico, adicionar no `<body>`: `data-property-id` e `data-property-price`.
A página passa a mostrar a parcela estimada daquele imóvel.

Depois de mudar `simular.html`, rodar `node build-pages.mjs` para regerar as páginas de cidade.

---

## 10. Pontos que ainda precisam de validação humana

1. **Regra de comprometimento de renda do cenário bancário.** Não foi configurada por não ter
   sido validada. Enquanto isso, o simulador não estima capacidade nesse cenário.
2. **Imóveis.** Por decisão da Easy House, o funil não consulta base nem mostra contagem.
   Exibe sempre: *"Temos imóveis disponíveis na região, o corretor irá lhe apresentar as
   opções que se enquadram."* A tabela `property` existe no schema para uso futuro.
3. **Percentual da segunda renda.** Configurado em 50% como ponto de partida. Confirmar com
   as instituições.
4. **Produto de análise conjunta de dívidas.** Limite de ¥5.000.000 e prazo de 50 anos são
   indicativos. Exige análise manual e não gera segundo cenário automático.
5. **Taxas de referência.** 2,5% e 1,4% precisam de revisão periódica no painel.
6. **Idade mínima e máxima.** Hoje o formulário aceita de 18 a 79 anos.
7. **Distribuição de leads entre corretores.** O campo `owner` existe; a regra de rodízio
   ainda não foi definida.

---

## 11. Checklist de publicação

- [ ] `sql/schema.sql` executado no Supabase
- [ ] Configuração versão 1 publicada e ativa
- [ ] `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` no Vercel
- [ ] `node --test tests/financing.test.mjs` sem falhas
- [ ] Fluxo completo testado no celular
- [ ] Envio de lead gravando em `lead`, `consent` e `simulation`
- [ ] Mensagem do WhatsApp chegando com o código
- [ ] Página `/admin-taxas` acessível apenas por quem deve
- [ ] Política de privacidade revisada para citar a simulação
- [ ] Definir quem recebe os leads e em quanto tempo responde

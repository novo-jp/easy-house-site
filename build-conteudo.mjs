/**
 * Gera as páginas de conteúdo que respondem as perguntas grandes.
 *
 *     node build-conteudo.mjs
 *
 * Os números vêm do acervo real e da configuração de financiamento, não são
 * digitados aqui: rodar de novo depois de uma varredura atualiza tudo. Uma
 * página que diz "610 casas" quando são 480 perde exatamente a credibilidade
 * que a torna citável.
 *
 * Precisa de SUPABASE_URL e SUPABASE_SERVICE_KEY (ver .env.local).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { carregarCasas, financingConfig, casasConfig } from './lib/casas-fonte.mjs';
import { formatarYen } from './lib/casas.mjs';

if (existsSync('.env.local')) {
  for (const linha of readFileSync('.env.local', 'utf8').split('\n')) {
    const [k, ...resto] = linha.split('=');
    if (k && resto.length && !linha.trim().startsWith('#')) {
      process.env[k.trim()] ??= resto.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
}

const L = JSON.parse(readFileSync('lib/casas-layout.json', 'utf8'));
const custos = lerTaxasDeCustos();
const SITE = 'https://easyhouse.homes';
const WA = (texto) => `https://wa.me/818028867708?text=${encodeURIComponent(texto)}`;

/** Lê as taxas do custos.js — a mesma fonte que a calculadora do site usa. */
function lerTaxasDeCustos() {
  const src = readFileSync('custos.js', 'utf8');
  const bloco = src.match(/var TAXAS = \{([\s\S]*?)\};/)[1];
  const t = {};
  for (const m of bloco.matchAll(/(\w+):\s*([\d.]+)/g)) t[m[1]] = Number(m[2]);
  return t;
}

const yen = (v) => '¥' + Math.round(v).toLocaleString('ja-JP');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function pagina({ slug, titulo, descricao, h1, resposta, corpo, faq, relacionadas }) {
  const url = `${SITE}/${slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        mainEntity: faq.map(([p, r]) => ({
          '@type': 'Question', name: p,
          acceptedAnswer: { '@type': 'Answer', text: r.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }
        }))
      },
      {
        '@type': 'Article',
        headline: h1,
        description: descricao,
        inLanguage: 'pt-BR',
        dateModified: new Date().toISOString().slice(0, 10),
        author: { '@type': 'Organization', name: '株式会社EASY HOUSE', url: SITE },
        publisher: { '@type': 'Organization', name: '株式会社EASY HOUSE', url: SITE },
        mainEntityOfPage: url
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Início', item: SITE },
          { '@type': 'ListItem', position: 2, name: h1, item: url }
        ]
      }
    ]
  };

  return `<!DOCTYPE html>
<html lang="pt-BR" class="no-js">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}"/>
<link rel="canonical" href="${url}"/>
<meta name="robots" content="index, follow"/>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
<meta property="og:type" content="article"/>
<meta property="og:url" content="${url}"/>
<meta property="og:title" content="${esc(titulo)}"/>
<meta property="og:description" content="${esc(descricao)}"/>
<meta property="og:image" content="${SITE}/images/opt/consultoria-1024.jpg"/>
<meta name="twitter:card" content="summary_large_image"/>
<link rel="stylesheet" href="/theme-v2.css?v=8"/>
<link rel="stylesheet" href="/casas.css?v=10"/>
<style>
.resposta {
  padding: 22px 24px; border-radius: var(--radius-lg); margin: 26px 0 8px;
  background: linear-gradient(145deg, rgba(91,216,204,.1), rgba(212,165,116,.06));
  border: 1px solid rgba(91,216,204,.28);
}
.resposta p { font-size: 1.06rem; line-height: 1.65; color: var(--pearl); }
.resposta p + p { margin-top: 12px; }
.conteudo { max-width: var(--wrap-narrow); margin-inline: auto; padding: 0 var(--pad-x); }
.conteudo h2 { font-size: clamp(1.35rem, 3vw, 1.75rem); margin: 40px 0 14px; }
.conteudo h3 { font-size: 1.08rem; margin: 24px 0 8px; color: var(--gold-bright); }
.conteudo p { color: var(--pearl-dim); line-height: 1.75; margin-bottom: 14px; }
.conteudo ul { color: var(--pearl-dim); line-height: 1.75; margin: 0 0 16px 20px; }
.conteudo li { margin-bottom: 7px; }
.conteudo strong { color: var(--pearl); }
.tabela-dados { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: .94rem; }
.tabela-dados th, .tabela-dados td { padding: 11px 10px; border-bottom: 1px solid var(--line); text-align: left; }
.tabela-dados th { color: var(--pearl-muted); font-weight: 600; font-size: .82rem; text-transform: uppercase; letter-spacing: .06em; }
.tabela-dados td { color: var(--pearl); }
.tabela-dados td:last-child, .tabela-dados th:last-child { text-align: right; }
.tabela-dados tfoot td { font-weight: 700; border-top: 2px solid var(--line-strong); border-bottom: 0; color: var(--gold-bright); }
.nota-fonte { font-size: .84rem; color: var(--pearl-muted); font-style: italic; margin-top: -6px; }
@media (max-width: 560px) { .tabela-dados { font-size: .86rem; } .tabela-dados th, .tabela-dados td { padding: 9px 6px; } }
</style>
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
</head>
<body>
<a class="skip-link" href="#main">Ir para o conteúdo</a>
${L.nav}
${L.drawer}

<main id="main">
<nav class="migalhas" aria-label="Você está em">
  <ol><li><a href="/">Início</a></li><li aria-current="page">${esc(h1)}</li></ol>
</nav>

<div class="conteudo">
  <h1 style="font-size:clamp(1.7rem,4.5vw,2.6rem);line-height:1.18;margin-bottom:8px">${h1}</h1>
  <p class="nota-fonte">Atualizado em ${new Date().toLocaleDateString('pt-BR')} · 株式会社EASY HOUSE, imobiliária licenciada no Japão</p>

  <div class="resposta">${resposta}</div>

  ${corpo}

  <h2>Perguntas frequentes</h2>
  <div class="faq">
    ${faq.map(([p, r]) => `<div class="faq__item"><p class="faq__q">${esc(p)}</p><div class="faq__a">${r}</div></div>`).join('\n    ')}
  </div>

  <section class="simular" style="margin:36px 0">
    <h3>Quer ver isso aplicado ao seu caso?</h3>
    <p>Cada situação tem detalhes que uma página não cobre. A gente olha o seu caso e responde em português, sem compromisso.</p>
    <a class="btn btn--wa" rel="nofollow" data-cta="conteudo_${slug}" href="${WA(`Olá! Li a página sobre ${h1.toLowerCase()} no site da Easy House e queria tirar uma dúvida.`)}">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="18" height="18"><path d="M12 2C6.5 2 2 6.5 2 12c0 1.7.5 3.4 1.3 4.9L2 22l5.3-1.3c1.4.8 3 1.3 4.7 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2z"/></svg>
      Falar com a Easy House
    </a>
    <ul class="simular__checks"><li>Atendimento em português</li><li>Sem compromisso</li><li>Imobiliária licenciada</li></ul>
  </section>

  <h2>Continue lendo</h2>
  <ul>${relacionadas.map(([href, txt]) => `<li><a href="${href}" style="color:var(--teal)">${esc(txt)}</a></li>`).join('')}</ul>
  <p style="margin-top:28px"></p>
</div>
</main>

${L.foot}
<script src="/theme-v2.js?v=8" defer></script>
<script src="/casas-comum.js?v=10" defer></script>
<script src="/analytics.js" defer></script>
</body>
</html>`;
}

/* ═══════════════════════════════════════════════════════════════
   1. Quanto custa comprar uma casa no Japão
   ═══════════════════════════════════════════════════════════════ */

function paginaQuantoCusta(casas) {
  const p = casas.map((c) => c.preco).filter(Boolean).sort((a, b) => a - b);
  const q = (n) => p[Math.floor(p.length * n)];
  const faixa = (min, max) => p.filter((x) => x >= min && (max ? x < max : true)).length;
  const areas = casas.map((c) => c.areaConstruida).filter(Boolean).sort((a, b) => a - b);
  const terrenos = casas.map((c) => c.areaTerreno).filter(Boolean).sort((a, b) => a - b);
  const med = (a) => Math.round(a[Math.floor(a.length / 2)]);
  const novas = casas.filter((c) => c.ano?.ano >= new Date().getFullYear() - 1).length;
  const cidades = new Set(casas.map((c) => c.cidade).filter(Boolean)).size;

  const taxaAquisicao = financingConfig.acquisitionFeeRate;
  const flat = financingConfig.flat35;
  const mediana = q(.5);
  const parcelaMediana = (() => {
    const i = flat.referenceAnnualRate / 12, n = flat.maximumTermYears * 12;
    return Math.round(mediana * i / (1 - Math.pow(1 + i, -n)) / 500) * 500;
  })();

  return pagina({
    slug: 'quanto-custa-casa-japao',
    titulo: 'Quanto custa comprar uma casa no Japão em 2026 | Easy House',
    descricao: `Preços reais de ${casas.length} casas à venda em Aichi: mediana de ${yen(mediana)}, com custos de aquisição e parcela estimada. Dados de imóveis disponíveis hoje, em português.`,
    h1: 'Quanto custa comprar uma casa no Japão',
    resposta: `<p>Entre as <strong>${casas.length} casas que a Easy House tem disponíveis hoje</strong> em ${cidades} cidades da província de Aichi, o preço mediano é de <strong>${yen(mediana)}</strong>. Metade custa menos que isso.</p>
      <p>A faixa vai de <strong>${yen(p[0])}</strong> a <strong>${yen(p[p.length - 1])}</strong>. Além do preço do imóvel, some cerca de <strong>${Math.round(taxaAquisicao * 100)}%</strong> em custos de aquisição — impostos de registro, escritura e taxas.</p>`,
    corpo: `
<h2>Os preços que existem de verdade hoje</h2>
<p>A tabela abaixo não é estimativa de mercado: é a distribuição dos ${casas.length} imóveis que estão anunciados no site neste momento, atualizados semanalmente.</p>
<table class="tabela-dados">
  <thead><tr><th>Faixa de preço</th><th>Casas disponíveis</th></tr></thead>
  <tbody>
    <tr><td>Abaixo de ¥15 milhões</td><td>${faixa(0, 15000000)}</td></tr>
    <tr><td>¥15 a ¥25 milhões</td><td>${faixa(15000000, 25000000)}</td></tr>
    <tr><td>¥25 a ¥35 milhões</td><td>${faixa(25000000, 35000000)}</td></tr>
    <tr><td>Acima de ¥35 milhões</td><td>${faixa(35000000, null)}</td></tr>
  </tbody>
  <tfoot><tr><td>Total</td><td>${casas.length}</td></tr></tfoot>
</table>
<p class="nota-fonte">Fonte: acervo da Easy House, atualizado semanalmente. <a href="/comprar/imoveis" style="color:var(--teal)">Ver as casas disponíveis</a>.</p>

<h3>O que se recebe por esse preço</h3>
<p>A casa mediana desse acervo tem <strong>${med(areas)} m² construídos</strong> e <strong>${med(terrenos)} m² de terreno</strong> — medidas bem acima do que o mesmo valor compra em uma capital brasileira. ${novas} das ${casas.length} são construção nova ou de até dois anos.</p>
<p>A planta mais comum é <strong>4LDK</strong> (quatro quartos mais sala, copa e cozinha), seguida de 3LDK.</p>

<h2>O preço não é o custo total</h2>
<p>Comprar um imóvel no Japão envolve despesas além do valor anunciado. A conta que a Easy House usa nas simulações reserva <strong>${Math.round(taxaAquisicao * 100)}% do valor do imóvel</strong> para esses custos, que incluem:</p>
<ul>
  <li>Imposto de aquisição (不動産取得税) e imposto de registro (登録免許税)</li>
  <li>Honorários do escrivão judicial (司法書士) que registra a transferência</li>
  <li>Comissão de intermediação, quando aplicável</li>
  <li>Selo fiscal do contrato (印紙税) e seguro contra incêndio</li>
</ul>
<p>Numa casa de ${yen(mediana)}, isso representa aproximadamente <strong>${yen(mediana * taxaAquisicao)}</strong> a mais.</p>

<h2>Quanto fica por mês</h2>
<p>Uma casa de ${yen(mediana)} financiada em ${flat.maximumTermYears} anos, à taxa de referência de ${flat.rateDisplayLabel}, resulta em parcela aproximada de <strong>${yen(parcelaMediana)} por mês</strong>.</p>
<p>Esse número é indicativo. A parcela real depende do banco, da entrada, do prazo aprovado e da análise do seu perfil — e a Easy House não é instituição financeira, então não aprova crédito. Para uma estimativa com os seus dados, use o <a href="/simular" style="color:var(--teal)">simulador gratuito</a>.</p>

<h2>Casa usada custa menos?</h2>
<p>Nem sempre. No mercado japonês, o valor da construção deprecia rápido — uma casa de madeira é contabilmente considerada sem valor por volta dos 22 anos — mas o terreno mantém valor. Por isso uma casa antiga em bairro valorizado pode custar mais que uma nova em região distante.</p>
<p>No acervo atual há casas reformadas e prontas para morar em toda a faixa de preço. O que muda entre elas costuma ser localização e tamanho do terreno, não a idade isolada.</p>`,
    faq: [
      ['Estrangeiro pode comprar imóvel no Japão?',
       'Sim. Não existe restrição de nacionalidade nem exigência de visto específico para <strong>comprar</strong> um imóvel no Japão — o registro de propriedade é aberto a estrangeiros. O que varia é a análise de crédito, quando há financiamento envolvido.'],
      ['Qual o preço mínimo de uma casa no Japão?',
       `No acervo atual da Easy House, a casa mais barata está em ${yen(p[0])} e há ${faixa(0, 15000000)} imóveis abaixo de ¥15 milhões. Valores menores existem no mercado, geralmente em áreas rurais ou em imóveis que precisam de reforma estrutural.`],
      ['Preciso ter o valor todo em dinheiro?',
       'Não necessariamente. É possível financiar, e há linhas que financiam a totalidade do valor para determinados perfis. A aprovação depende do banco, da renda, do tempo de trabalho, do visto e das dívidas existentes.'],
      ['Quanto preciso ter de entrada?',
       'Varia por banco e por produto. Algumas linhas trabalham sem entrada; outras pedem 10% ou 20%. Quanto maior a entrada, menor a parcela e maior a chance de aprovação — mas não existe um número único que valha para todos.'],
      ['Esses preços incluem os impostos?',
       `Não. O preço anunciado é do imóvel. Reserve cerca de ${Math.round(taxaAquisicao * 100)}% a mais para impostos de aquisição, registro, escrivão e seguro.`]
    ],
    relacionadas: [
      ['/comprar/imoveis', `Ver as ${casas.length} casas à venda disponíveis hoje`],
      ['/financiamento-imovel-japao', 'Como funciona o financiamento imobiliário no Japão'],
      ['/comprar-casa-sem-pr', 'Comprar sem visto permanente: o que pesa na análise'],
      ['/simular', 'Simular qual faixa de imóvel cabe no seu orçamento']
    ]
  });
}

/* ═══════════════════════════════════════════════════════════════
   2. Custo de entrada do aluguel (初期費用)

   Esta é a página com o dado mais difícil de achar em português: as
   taxas reais que a imobiliária cobra na assinatura. Os valores saem
   de custos.js, a mesma fonte da calculadora do site.
   ═══════════════════════════════════════════════════════════════ */

function paginaCustoAluguel() {
  const t = custos;
  // Exemplo trabalhado com um aluguel comum na região
  const aluguel = 60000, condominio = 5000, vaga = 0;
  const mensal = aluguel + condominio;
  const corretagem = Math.round((aluguel + vaga) * t.corretagemMult);
  const diarias = Math.round(mensal * t.diasPadrao / t.diasMes);
  const garantiaMes = Math.round(mensal * t.garantiaMensalPct);
  const total = corretagem + t.garantiaInicial + t.limpeza + t.administrativa
              + t.chaves + diarias + mensal;

  return pagina({
    slug: 'custo-inicial-aluguel-japao',
    titulo: 'Quanto se paga para entrar num apartamento no Japão (初期費用) | Easy House',
    descricao: 'Todas as taxas da entrada de um aluguel no Japão, com valores reais e uma conta fechada: corretagem, garantidora, limpeza, chaves e diárias. Em português.',
    h1: 'Quanto custa entrar num apartamento alugado no Japão',
    resposta: `<p>Para alugar no Japão paga-se muito mais que o primeiro aluguel. Num apartamento de <strong>${yen(aluguel)}</strong> mais <strong>${yen(condominio)}</strong> de condomínio, a entrada fica em torno de <strong>${yen(total)}</strong> — cerca de <strong>${(total / mensal).toFixed(1).replace('.', ',')} vezes o valor mensal</strong>.</p>
      <p>Esse total reúne corretagem, taxa da empresa garantidora, limpeza, chaves, taxa administrativa e as diárias do primeiro mês. A tabela abaixo abre item por item.</p>`,
    corpo: `
<h2>A conta aberta, item por item</h2>
<p>Este é o cálculo que a Easy House usa, com as taxas praticadas nos imóveis que intermedia. O exemplo usa aluguel de ${yen(aluguel)} e condomínio de ${yen(condominio)}.</p>
<table class="tabela-dados">
  <thead><tr><th>Item</th><th>Como é calculado</th><th>Valor</th></tr></thead>
  <tbody>
    <tr><td>Corretagem<br><span class="nota-fonte">仲介手数料</span></td><td>Um aluguel + 10%</td><td>${yen(corretagem)}</td></tr>
    <tr><td>Garantidora<br><span class="nota-fonte">保証委託料</span></td><td>Valor fixo na assinatura</td><td>${yen(t.garantiaInicial)}</td></tr>
    <tr><td>Limpeza<br><span class="nota-fonte">クリーニング費</span></td><td>Valor fixo</td><td>${yen(t.limpeza)}</td></tr>
    <tr><td>Taxa administrativa<br><span class="nota-fonte">更新事務手数料</span></td><td>Cobrada já na entrada</td><td>${yen(t.administrativa)}</td></tr>
    <tr><td>Jogo de chaves<br><span class="nota-fonte">鍵セット費</span></td><td>Valor fixo</td><td>${yen(t.chaves)}</td></tr>
    <tr><td>Diárias do primeiro mês<br><span class="nota-fonte">日割り家賃</span></td><td>${t.diasPadrao} dias proporcionais</td><td>${yen(diarias)}</td></tr>
    <tr><td>Primeiro mês integral</td><td>Aluguel + condomínio</td><td>${yen(mensal)}</td></tr>
  </tbody>
  <tfoot><tr><td colspan="2">Total estimado da entrada</td><td>${yen(total)}</td></tr></tfoot>
</table>
<p class="nota-fonte">Valores de referência da Easy House. Cada imóvel tem condições próprias — alguns pedem 敷金 (caução) ou 礼金 (luvas), que não estão neste exemplo.</p>

<h2>O que continua sendo cobrado depois</h2>
<p>Além do aluguel e do condomínio mensais, dois valores costumam se repetir:</p>
<ul>
  <li><strong>Garantidora mensal</strong> (保証委託料): ${(t.garantiaMensalPct * 100).toString().replace('.', ',')}% do valor mensal, ou cerca de ${yen(garantiaMes)} neste exemplo</li>
  <li><strong>Suporte</strong>: ${yen(t.suporteMensal)} por mês em parte dos contratos</li>
</ul>

<h2>Dá para pagar no cartão?</h2>
<p>Em parte dos casos sim, com acréscimo de <strong>${(t.cartaoPct * 100).toString().replace('.', ',')}%</strong> sobre o valor. Numa entrada de ${yen(total)}, isso representa ${yen(total * t.cartaoPct)} a mais — o que pode compensar quando a alternativa é não conseguir fechar o contrato agora.</p>

<h2>Por que é tão caro entrar</h2>
<p>O mercado japonês concentra na assinatura custos que em outros países se diluem ao longo do contrato. A lógica é do proprietário: a limpeza deixa o imóvel pronto para o próximo, a garantidora substitui o fiador, e a corretagem remunera a intermediação.</p>
<p>Para quem vem do Brasil, a diferença é que <strong>não existe fiador pessoa física na maioria dos contratos</strong> — a empresa garantidora ocupa esse lugar, e cobra por isso.</p>

<h2>Como ver o custo real de um imóvel específico</h2>
<p>Cada apartamento anunciado no site mostra a estimativa de entrada com todas as taxas discriminadas, calculada sobre o aluguel daquele imóvel. <a href="/imoveis" style="color:var(--teal)">Veja os apartamentos disponíveis</a> e abra a estimativa de custos em qualquer um.</p>`,
    faq: [
      ['Preciso de fiador japonês para alugar?',
       'Na maior parte dos contratos, não. O papel do fiador é ocupado por uma empresa garantidora (保証会社), que cobra uma taxa na assinatura e um percentual mensal. É o modelo padrão no Japão hoje.'],
      ['Posso alugar sem falar japonês?',
       'Sim, quando há alguém que faça a intermediação. A Easy House atende em português e conversa em japonês com a imobiliária, o proprietário e a garantidora.'],
      ['O que é 敷金 e 礼金?',
       '敷金 (shikikin) é a caução, devolvida no fim do contrato descontados eventuais reparos. 礼金 (reikin) são as luvas, um valor não devolvido, pago ao proprietário. Nem todo imóvel cobra os dois — vários dispensam ambos.'],
      ['Quanto preciso ter guardado para me mudar?',
       `Como referência, reserve algo em torno de ${(total / mensal).toFixed(1).replace('.', ',')} vezes o valor mensal do imóvel que pretende alugar. Num apartamento de ${yen(mensal)} mensais, isso significa aproximadamente ${yen(total)}.`],
      ['Esses valores mudam de imóvel para imóvel?',
       'Sim. As taxas fixas (limpeza, chaves, administrativa) variam pouco, mas corretagem e diárias dependem do aluguel, e alguns imóveis cobram caução ou luvas. A estimativa na página de cada apartamento usa os valores daquele imóvel.']
    ],
    relacionadas: [
      ['/imoveis', 'Ver apartamentos para alugar com custo de entrada calculado'],
      ['/landingaluguel', 'Como a Easy House ajuda a alugar sem falar japonês'],
      ['/quanto-custa-casa-japao', 'Quanto custa comprar em vez de alugar'],
      ['/sobre', 'Sobre a Easy House']
    ]
  });
}

/* ═══════════════════════════════════════════════════════════════
   3. Financiamento imobiliário (住宅ローン) para estrangeiros
   ═══════════════════════════════════════════════════════════════ */

function paginaFinanciamento(casas) {
  const f = financingConfig.flat35, b = financingConfig.bank;
  const teto = financingConfig.acquisitionFeeRate;
  const rendaCorte = f.incomeThreshold;
  const parcela = (valor, taxa, anos) => {
    const i = taxa / 12, n = anos * 12;
    return Math.round(valor * i / (1 - Math.pow(1 + i, -n)) / 500) * 500;
  };
  const exemplo = 25000000;

  return pagina({
    slug: 'financiamento-imovel-japao',
    titulo: 'Financiamento imobiliário no Japão para estrangeiros (住宅ローン) | Easy House',
    descricao: 'Como funciona o 住宅ローン para quem é estrangeiro no Japão: prazos, taxas de referência, limite de comprometimento da renda e o peso do visto. Explicado em português.',
    h1: 'Financiamento imobiliário no Japão para estrangeiros',
    resposta: `<p><strong>Comprar e financiar são coisas diferentes.</strong> Não há restrição de nacionalidade para comprar um imóvel no Japão. A dificuldade, quando existe, está no crédito — e cada banco decide pelos seus próprios critérios.</p>
      <p>Os fatores que mais pesam na análise são <strong>tipo de visto, tempo no emprego atual, renda declarada e dívidas existentes</strong>. Não existe uma regra única que valha para todas as instituições, e nenhuma imobiliária pode garantir aprovação — quem aprova é o banco.</p>`,
    corpo: `
<h2>Dois caminhos, condições diferentes</h2>
<p>Na prática, quem compra no Japão costuma comparar duas rotas:</p>
<table class="tabela-dados">
  <thead><tr><th>&nbsp;</th><th>${f.label}</th><th>${b.label}</th></tr></thead>
  <tbody>
    <tr><td>Taxa de referência</td><td>${f.rateDisplayLabel.replace(' (taxa fixa de referência)', '')}</td><td>${b.rateDisplayLabel.replace(' (taxa de referência)', '')}</td></tr>
    <tr><td>Tipo de taxa</td><td>Fixa por todo o prazo</td><td>Geralmente variável</td></tr>
    <tr><td>Prazo máximo</td><td>${f.maximumTermYears} anos</td><td>${b.maximumTermYears} anos</td></tr>
    <tr><td>Idade limite na quitação</td><td>${f.payoffAgeLimit} anos</td><td>${b.payoffAgeLimit} anos</td></tr>
  </tbody>
</table>
<p class="nota-fonte">Taxas de referência usadas nas simulações da Easy House. Valores de mercado mudam; a condição real vem da instituição na análise.</p>

<h3>Taxa fixa ou variável?</h3>
<p>A taxa fixa protege de aumentos: a parcela de hoje é a mesma daqui a vinte anos. A variável começa mais baixa, mas pode subir. Para quem tem orçamento apertado e nenhuma folga para surpresas, a previsibilidade da fixa costuma valer o custo maior.</p>

<h2>Quanto da renda pode comprometer</h2>
<p>Os bancos limitam quanto da renda anual pode ir para parcelas de dívidas — o chamado 返済比率 (índice de comprometimento). A régua usada nas simulações da Easy House:</p>
<ul>
  <li>Renda anual até ${yen(rendaCorte)}: até <strong>${Math.round(f.lowerIncomeRepaymentRatio * 100)}%</strong> da renda</li>
  <li>Renda anual acima de ${yen(rendaCorte)}: até <strong>${Math.round(f.higherIncomeRepaymentRatio * 100)}%</strong></li>
</ul>
<p>Atenção: esse limite conta <strong>todas</strong> as parcelas, não só a da casa. Financiamento de carro, cartão parcelado, キャッシング e リボ払い entram na conta e reduzem o quanto sobra para o imóvel. É por isso que organizar dívidas antes de pedir muda o resultado — veja <a href="/omatome" style="color:var(--teal)">como reunir parcelas antes de financiar</a>.</p>

<h2>O peso do visto</h2>
<p>O tipo de visto é o fator que mais varia entre instituições:</p>
<ul>
  <li><strong>Visto permanente (永住) ou permanente especial</strong>: aceito pela maior parte das instituições, com as mesmas condições de um cidadão japonês</li>
  <li><strong>Cônjuge de japonês (日本人の配偶者)</strong>, <strong>residente de longa permanência (定住者)</strong> e <strong>vistos de trabalho</strong>: dependem de análise individual. Algumas instituições atendem, outras não</li>
</ul>
<p>Não ter 永住 não encerra o assunto — muda quais portas fazem sentido bater. A página <a href="/comprar-casa-sem-pr" style="color:var(--teal)">comprar sem visto permanente</a> detalha os fatores que pesam nesse caso.</p>

<h2>Exemplo: uma casa de ${yen(exemplo)}</h2>
<table class="tabela-dados">
  <thead><tr><th>Cenário</th><th>Prazo</th><th>Parcela estimada</th></tr></thead>
  <tbody>
    <tr><td>${f.label} — taxa fixa</td><td>${f.maximumTermYears} anos</td><td>${yen(parcela(exemplo, f.referenceAnnualRate, f.maximumTermYears))}/mês</td></tr>
    <tr><td>${f.label} — prazo menor</td><td>25 anos</td><td>${yen(parcela(exemplo, f.referenceAnnualRate, 25))}/mês</td></tr>
    <tr><td>${b.label} — taxa de referência</td><td>35 anos</td><td>${yen(parcela(exemplo, b.referenceAnnualRate, 35))}/mês</td></tr>
  </tbody>
</table>
<p class="nota-fonte">Cálculo sobre o valor cheio, sem entrada. Valores indicativos: a condição real depende do banco e da análise do seu perfil.</p>
<p>Some ainda cerca de ${Math.round(teto * 100)}% do valor do imóvel em custos de aquisição, que normalmente não entram no financiamento.</p>

<h2>O que a Easy House faz — e o que não faz</h2>
<p>A Easy House <strong>não é instituição financeira e não aprova crédito</strong>. O que ela faz é organizar o caso antes de apresentá-lo: verificar o que pesa contra, orientar sobre documentos, explicar o contrato em português e conversar em japonês com as instituições.</p>
<p>O atendimento é feito por consultor com certificação de <strong>住宅ローンアドバイザー</strong> (consultor de financiamento habitacional), qualificação que a maior parte dos corretores não possui.</p>
<p>Para uma estimativa com os seus números, o <a href="/simular" style="color:var(--teal)">simulador</a> leva cerca de um minuto e não pede documento nenhum.</p>`,
    faq: [
      ['Estrangeiro consegue financiamento imobiliário no Japão?',
       'Sim, é possível. As condições variam bastante conforme o tipo de visto, o tempo no emprego atual, a renda e as dívidas existentes. Quem tem visto permanente (永住) costuma ter acesso às mesmas condições de um cidadão japonês; outros vistos dependem de análise individual em cada instituição.'],
      ['Preciso ter visto permanente (永住) para financiar?',
       'Não é uma regra única. Parte das instituições exige, outras analisam caso a caso vistos de trabalho, de cônjuge de japonês e de residente de longa permanência. Não ter 永住 muda quais instituições fazem sentido procurar, mas não encerra a possibilidade.'],
      ['Quanto tempo de trabalho preciso comprovar?',
       'Varia por instituição. Em geral, quanto mais tempo no mesmo empregador e mais estável o vínculo, melhor a análise. Trocar de emprego às vésperas de pedir financiamento costuma atrapalhar.'],
      ['Ter キャッシング ou リボ払い impede o financiamento?',
       'Não automaticamente. Essas parcelas entram no cálculo do índice de comprometimento da renda e reduzem o valor disponível para a casa. Organizá-las antes do pedido frequentemente muda o resultado da análise.'],
      ['A Easy House garante a aprovação?',
       'Não. Nenhuma imobiliária aprova crédito — quem decide é o banco. O que a Easy House faz é preparar e apresentar o caso, explicando em português cada etapa e conversando em japonês com as instituições.'],
      ['Dá para financiar 100% do valor?',
       'Algumas linhas trabalham sem entrada, para determinados perfis. Mas os custos de aquisição (cerca de ' + Math.round(teto * 100) + '% do valor) normalmente não entram no financiamento e precisam estar disponíveis.']
    ],
    relacionadas: [
      ['/simular', 'Simular qual faixa de imóvel cabe no seu orçamento'],
      ['/comprar-casa-sem-pr', 'Comprar sem visto permanente: o que pesa na análise'],
      ['/omatome', 'Organizar dívidas antes de pedir financiamento'],
      ['/quanto-custa-casa-japao', 'Quanto custa comprar uma casa no Japão'],
      ['/comprar/imoveis', `Ver as ${casas.length} casas à venda disponíveis`]
    ]
  });
}

/* ── Geração ─────────────────────────────────────────────── */

const casas = await carregarCasas();
const paginas = [
  ['quanto-custa-casa-japao.html', paginaQuantoCusta(casas)],
  ['custo-inicial-aluguel-japao.html', paginaCustoAluguel()],
  ['financiamento-imovel-japao.html', paginaFinanciamento(casas)]
];
for (const [arquivo, html] of paginas) {
  writeFileSync(arquivo, html);
  console.log(`  ${arquivo.padEnd(36)} ${(html.length / 1024).toFixed(1)} KB`);
}
console.log(`\n  números usados: ${casas.length} casas, ${new Set(casas.map(c => c.cidade)).size} cidades`);

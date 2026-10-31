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

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { carregarCasas, financingConfig, casasConfig } from './lib/casas-fonte.mjs';
import { formatarYen } from './lib/casas.mjs';
import { navEs, drawerEs, footEs } from './lib/layout-es.mjs';

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

/**
 * Registro de 住宅ローンアドバイザー do consultor (一般財団法人住宅金融普及協会,
 * nº (1)第2455204号). Mesma data do claim `certificado-advisor` no app da
 * /entregas (easyhouse-raiox, lib/content/claims.ts): lá o bloco some sozinho
 * no dia seguinte; aqui a página é estática, então a frase só entra se a
 * geração acontecer dentro da validade. Renovou? Atualizar as duas datas e
 * rodar este script de novo.
 */
const CERTIFICADO_VALIDO_ATE = '2026-10-31';
const certificadoValido = () => new Date().toISOString().slice(0, 10) <= CERTIFICADO_VALIDO_ATE;

/** Pares português ↔ espanhol (hreflang). Só páginas que existem nas duas línguas. */
const PARES = {
  'quanto-custa-casa-japao': 'es/gastos-comprar-vivienda',
  'financiamento-imovel-japao': 'es/financiamiento-hipotecario-tokai',
  'guia-comprar-casa-japao': 'es/guia-comprar-casa-japon',
  'financiamento-sem-eijuken': 'es/hipoteca-sin-residencia-permanente',
  'financiamento-trabalho-haken': 'es/hipoteca-trabajo-haken',
  'financiamento-autonomo': 'es/hipoteca-trabajador-independiente',
  'renda-minima-financiamento': 'es/ingresos-para-hipoteca',
  'documentos-financiamento': 'es/documentos-hipoteca',
};
const PAR_DE = Object.fromEntries(Object.entries(PARES).flatMap(([pt, es]) => [[pt, { pt, es }], [es, { pt, es }]]));

/** Textos da casca, nas duas línguas. */
const CASCA = {
  pt: {
    lang: 'pt-BR', locale: 'pt_BR', skip: 'Ir para o conteúdo', voceEsta: 'Você está em', inicio: 'Início', inicioHref: '/',
    atualizado: (d) => `Atualizado em ${d} · 株式会社EASY HOUSE, imobiliária licenciada no Japão`,
    data: () => new Date().toLocaleDateString('pt-BR'),
    perguntas: 'Perguntas frequentes', ctaTitulo: 'Quer ver isso aplicado ao seu caso?',
    ctaTexto: 'Cada situação tem detalhes que uma página não cobre. A gente olha o seu caso e responde em português, sem compromisso.',
    ctaBotao: 'Falar com a Easy House', ctaChecks: ['Atendimento em português', 'Sem compromisso', 'Imobiliária licenciada'],
    waMsg: (h1) => `Olá! Li a página sobre ${h1.toLowerCase()} no site da Easy House e queria tirar uma dúvida.`,
    continue: 'Continue lendo',
  },
  es: {
    lang: 'es', locale: 'es_419', skip: 'Ir al contenido', voceEsta: 'Estás en', inicio: 'Inicio', inicioHref: '/es/casas-en-venta',
    atualizado: (d) => `Actualizado el ${d} · 株式会社EASY HOUSE, inmobiliaria con licencia en Japón`,
    data: () => new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    perguntas: 'Preguntas frecuentes', ctaTitulo: '¿Quieres verlo aplicado a tu caso?',
    ctaTexto: 'Cada situación tiene detalles que una página no cubre. Revisamos tu caso y te respondemos en español, sin compromiso.',
    ctaBotao: 'Hablar con Easy House', ctaChecks: ['Atención en español', 'Sin compromiso', 'Inmobiliaria con licencia'],
    waMsg: (h1) => `¡Hola! Leí la página sobre ${h1.toLowerCase()} en el sitio de Easy House y quería hacer una consulta.`,
    continue: 'Sigue leyendo',
  },
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function pagina({ slug, titulo, descricao, h1, resposta, corpo, faq, relacionadas, lang = 'pt' }) {
  const url = `${SITE}/${slug}`;
  const C = CASCA[lang];
  const par = PAR_DE[slug];
  const hreflang = par
    ? [['pt-BR', par.pt], ['es', par.es], ['x-default', par.pt]]
        .map(([h, p]) => `<link rel="alternate" hreflang="${h}" href="${SITE}/${p}"/>`).join('\n')
    : '';
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
        inLanguage: C.lang,
        dateModified: new Date().toISOString().slice(0, 10),
        author: { '@type': 'Organization', name: '株式会社EASY HOUSE', url: SITE },
        publisher: { '@type': 'Organization', name: '株式会社EASY HOUSE', url: SITE },
        mainEntityOfPage: url
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: C.inicio, item: `${SITE}${C.inicioHref}` },
          { '@type': 'ListItem', position: 2, name: h1, item: url }
        ]
      }
    ]
  };

  return `<!DOCTYPE html>
<html lang="${C.lang}" class="no-js">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}"/>
<link rel="canonical" href="${url}"/>
${hreflang}
<meta name="robots" content="index, follow"/>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
<meta property="og:type" content="article"/>
<meta property="og:locale" content="${C.locale}"/>
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
<a class="skip-link" href="#main">${C.skip}</a>
${lang === 'es' ? navEs : L.nav}
${lang === 'es' ? drawerEs : L.drawer}

<main id="main">
<nav class="migalhas" aria-label="${C.voceEsta}">
  <ol><li><a href="${C.inicioHref}">${C.inicio}</a></li><li aria-current="page">${esc(h1)}</li></ol>
</nav>

<div class="conteudo">
  <h1 style="font-size:clamp(1.7rem,4.5vw,2.6rem);line-height:1.18;margin-bottom:8px">${h1}</h1>
  <p class="nota-fonte">${C.atualizado(C.data())}</p>

  <div class="resposta">${resposta}</div>

  ${corpo}

  <h2>${C.perguntas}</h2>
  <div class="faq">
    ${faq.map(([p, r]) => `<div class="faq__item"><p class="faq__q">${esc(p)}</p><div class="faq__a">${r}</div></div>`).join('\n    ')}
  </div>

  <section class="simular" style="margin:36px 0">
    <h3>${C.ctaTitulo}</h3>
    <p>${C.ctaTexto}</p>
    <a class="btn btn--wa" rel="nofollow" data-cta="conteudo_${slug}" href="${WA(C.waMsg(h1))}">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="18" height="18"><path d="M12 2C6.5 2 2 6.5 2 12c0 1.7.5 3.4 1.3 4.9L2 22l5.3-1.3c1.4.8 3 1.3 4.7 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2z"/></svg>
      ${C.ctaBotao}
    </a>
    <ul class="simular__checks">${C.ctaChecks.map((c) => `<li>${c}</li>`).join('')}</ul>
  </section>

  <h2>${C.continue}</h2>
  <ul>${relacionadas.map(([href, txt]) => `<li><a href="${href}" style="color:var(--teal)">${esc(txt)}</a></li>`).join('')}</ul>
  <p style="margin-top:28px"></p>
</div>
</main>

${lang === 'es' ? footEs : L.foot}
<script src="/theme-v2.js?v=8" defer></script>
<script src="/casas-comum.js?v=10" defer></script>
<script src="/analytics.js" defer></script>
</body>
</html>`;
}

/* ═══════════════════════════════════════════════════════════════
   1. Quanto custa comprar uma casa no Japão
   ═══════════════════════════════════════════════════════════════ */

/** Os números de "quanto custa", calculados uma vez para as duas línguas. */
function dadosQuantoCusta(casas) {
  const p = casas.map((c) => c.preco).filter(Boolean).sort((a, b) => a - b);
  const q = (n) => p[Math.floor(p.length * n)];
  const areas = casas.map((c) => c.areaConstruida).filter(Boolean).sort((a, b) => a - b);
  const terrenos = casas.map((c) => c.areaTerreno).filter(Boolean).sort((a, b) => a - b);
  const med = (a) => Math.round(a[Math.floor(a.length / 2)]);
  const plantas = Object.entries(casas.reduce((m, c) => { if (c.planta) m[c.planta] = (m[c.planta] || 0) + 1; return m; }, {}))
    .sort((a, b) => b[1] - a[1]);
  const provincias = [...new Set(casas.map((c) => c.prefeitura).filter(Boolean))];
  const flat = financingConfig.flat35;
  const mediana = q(.5);
  const i = flat.referenceAnnualRate / 12, n = flat.maximumTermYears * 12;
  return {
    p, mediana, min: p[0], max: p[p.length - 1],
    faixa: (min, max) => p.filter((x) => x >= min && (max ? x < max : true)).length,
    areaMed: med(areas), terrenoMed: med(terrenos),
    novas: casas.filter((c) => c.ano?.ano >= new Date().getFullYear() - 1).length,
    cidades: new Set(casas.map((c) => c.cidade).filter(Boolean)).size,
    plantas, provincias,
    taxaAquisicao: financingConfig.acquisitionFeeRate, flat,
    parcelaMediana: Math.round(mediana * i / (1 - Math.pow(1 + i, -n)) / 500) * 500,
  };
}

/** "Aichi e Mie" / "Aichi y Mie" — a lista sai do acervo, não do texto. */
const juntar = (itens, e) => (itens.length > 1 ? `${itens.slice(0, -1).join(', ')} ${e} ${itens[itens.length - 1]}` : itens[0] || '');

function paginaQuantoCusta(casas) {
  const D = dadosQuantoCusta(casas);
  const provs = juntar(D.provincias, 'e');
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
    descricao: `Preços reais de ${casas.length} casas à venda em ${provs}: mediana de ${yen(mediana)}, com custos de aquisição e parcela estimada. Dados de imóveis disponíveis hoje, em português.`,
    h1: 'Quanto custa comprar uma casa no Japão',
    resposta: `<p>Entre as <strong>${casas.length} casas que a Easy House tem disponíveis hoje</strong> em ${cidades} cidades de ${provs}, o preço mediano é de <strong>${yen(mediana)}</strong>. Metade custa menos que isso.</p>
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
<p>A planta mais comum é <strong>${D.plantas[0][0]}</strong> (${D.plantas[0][1]} casas)${D.plantas[1] ? `, seguida de ${D.plantas[1][0]} (${D.plantas[1][1]})` : ''}. No Japão, o número são os quartos e LDK é a sala com copa e cozinha.</p>

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
      ['/guia-comprar-casa-japao', 'Como comprar casa no Japão sendo estrangeiro'],
      ['/financiamento-imovel-japao', 'Como funciona o financiamento imobiliário no Japão'],
      ['/entregas', 'Entregas reais: famílias que já compraram no Japão'],
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
    <tr><td>Estrangeiros</td><td>Só com visto permanente (永住者) ou permanente especial (特別永住者)</td><td>Critério de cada banco</td></tr>
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
<p>Atenção: esse limite conta <strong>todas</strong> as parcelas, não só a da casa. Financiamento de carro, cartão parcelado, キャッシング e リボ払い entram na conta e reduzem o quanto sobra para o imóvel. É por isso que organizar dívidas antes de pedir muda o resultado — o <a href="/simular" style="color:var(--teal)">simulador</a> pergunta pelas parcelas atuais justamente por isso.</p>

<h2>O peso do visto</h2>
<p>O tipo de visto é o fator que mais varia entre instituições:</p>
<ul>
  <li><strong>Visto permanente (永住) ou permanente especial</strong>: aceito pela maior parte das instituições, inclusive no Flat 35, em geral nas mesmas condições de um cidadão japonês</li>
  <li><strong>Cônjuge de japonês (日本人の配偶者)</strong>, <strong>residente de longa permanência (定住者)</strong> e <strong>vistos de trabalho</strong>: o Flat 35 não aceita — a JHF, que opera o produto, exige 永住者 ou 特別永住者 de quem é estrangeiro. Nos bancos privados, depende de análise individual: algumas instituições atendem, outras não</li>
</ul>
<p>Não ter 永住 não encerra o assunto — muda quais portas fazem sentido bater. O <a href="/simular" style="color:var(--teal)">simulador</a> pergunta pelo tipo de visto e já considera isso no cenário que devolve.</p>

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
${certificadoValido() ? '<p>O atendimento é feito por consultor com certificação de <strong>住宅ローンアドバイザー</strong> (consultor de financiamento habitacional), qualificação que a maior parte dos corretores não possui.</p>' : ''}
<p>Para uma estimativa com os seus números, o <a href="/simular" style="color:var(--teal)">simulador</a> leva cerca de um minuto e não pede documento nenhum.</p>`,
    faq: [
      ['Estrangeiro consegue financiamento imobiliário no Japão?',
       'Sim, é possível. As condições variam bastante conforme o tipo de visto, o tempo no emprego atual, a renda e as dívidas existentes. Quem tem visto permanente (永住) costuma ter acesso às mesmas condições de um cidadão japonês; outros vistos dependem de análise individual em cada instituição.'],
      ['Preciso ter visto permanente (永住) para financiar?',
       'No Flat 35, sim: a JHF aceita estrangeiros só com visto permanente (永住者) ou permanente especial (特別永住者). Nos bancos privados não é uma regra única — parte exige, outras analisam caso a caso vistos de trabalho, de cônjuge de japonês e de residente de longa permanência. Não ter 永住 muda quais instituições fazem sentido procurar, mas não encerra a possibilidade.'],
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
      ['/financiamento-sem-eijuken', 'Financiar casa no Japão sem visto permanente'],
      ['/renda-minima-financiamento', 'Quanto preciso ganhar para financiar'],
      ['/documentos-financiamento', 'Documentos para financiar, por etapa'],
      ['/quanto-custa-casa-japao', 'Quanto custa comprar uma casa no Japão'],
      ['/comprar/imoveis', `Ver as ${casas.length} casas à venda disponíveis`]
    ]
  });
}

/* ═══════════════════════════════════════════════════════════════
   4. As mesmas páginas em espanhol (público latino)

   Mesmos números de "quanto custa" e de financiamento, texto em espanhol.
   Não é tradução da interface: o que só vale para o público brasileiro (a
   comparação com capitais brasileiras) sai, e os termos seguem o
   /simular-es — "cuota", "pago inicial", "residente de larga estancia".
   ═══════════════════════════════════════════════════════════════ */

const pct = (taxa) => `${(taxa * 100).toFixed(1).replace('.', ',')}%`;

function paginaQuantoCustaEs(casas) {
  const D = dadosQuantoCusta(casas);
  const provs = juntar(D.provincias, 'y');
  return pagina({
    lang: 'es',
    slug: 'es/gastos-comprar-vivienda',
    titulo: 'Cuánto cuesta comprar una casa en Japón en 2026 | Easy House',
    descricao: `Precios reales de ${casas.length} casas en venta en ${provs}: mediana de ${yen(D.mediana)}, con gastos de compra y cuota estimada. Datos de viviendas disponibles hoy.`,
    h1: 'Cuánto cuesta comprar una casa en Japón',
    resposta: `<p>Entre las <strong>${casas.length} casas que Easy House tiene disponibles hoy</strong> en ${D.cidades} ciudades de ${provs}, el precio mediano es de <strong>${yen(D.mediana)}</strong>. La mitad cuesta menos que eso.</p>
      <p>El rango va de <strong>${yen(D.min)}</strong> a <strong>${yen(D.max)}</strong>. Además del precio de la vivienda, suma alrededor de <strong>${Math.round(D.taxaAquisicao * 100)}%</strong> en gastos de compra: impuestos de registro, escritura y comisiones.</p>`,
    corpo: `
<h2>Los precios que existen hoy</h2>
<p>La tabla de abajo no es una estimación del mercado: es la distribución de las ${casas.length} viviendas anunciadas en el sitio en este momento, actualizadas cada semana.</p>
<table class="tabela-dados">
  <thead><tr><th>Rango de precio</th><th>Casas disponibles</th></tr></thead>
  <tbody>
    <tr><td>Menos de ¥15 millones</td><td>${D.faixa(0, 15000000)}</td></tr>
    <tr><td>¥15 a ¥25 millones</td><td>${D.faixa(15000000, 25000000)}</td></tr>
    <tr><td>¥25 a ¥35 millones</td><td>${D.faixa(25000000, 35000000)}</td></tr>
    <tr><td>Más de ¥35 millones</td><td>${D.faixa(35000000, null)}</td></tr>
  </tbody>
  <tfoot><tr><td>Total</td><td>${casas.length}</td></tr></tfoot>
</table>
<p class="nota-fonte">Fuente: inventario de Easy House, actualizado cada semana. <a href="/es/casas-en-venta" style="color:var(--teal)">Ver las casas por ciudad</a>.</p>

<h3>Qué se recibe por ese precio</h3>
<p>La casa mediana de este inventario tiene <strong>${D.areaMed} m² construidos</strong> y <strong>${D.terrenoMed} m² de terreno</strong>. ${D.novas} de las ${casas.length} son de construcción nueva o de hasta dos años.</p>
<p>La distribución más común es <strong>${D.plantas[0][0]}</strong> (${D.plantas[0][1]} casas)${D.plantas[1] ? `, seguida de ${D.plantas[1][0]} (${D.plantas[1][1]})` : ''}. En Japón, el número son los dormitorios y LDK es la sala con comedor y cocina.</p>

<h2>El precio no es el costo total</h2>
<p>Comprar una vivienda en Japón tiene gastos además del valor anunciado. La cuenta que Easy House usa en sus simulaciones reserva <strong>${Math.round(D.taxaAquisicao * 100)}% del valor de la vivienda</strong> para estos gastos, que incluyen:</p>
<ul>
  <li>Impuesto de adquisición (不動産取得税) e impuesto de registro (登録免許税)</li>
  <li>Honorarios del escribano judicial (司法書士) que registra la transferencia</li>
  <li>Comisión de intermediación, cuando corresponde</li>
  <li>Timbre fiscal del contrato (印紙税) y seguro contra incendio</li>
</ul>
<p>En una casa de ${yen(D.mediana)}, eso representa aproximadamente <strong>${yen(D.mediana * D.taxaAquisicao)}</strong> más.</p>

<h2>Cuánto queda por mes</h2>
<p>Una casa de ${yen(D.mediana)} financiada a ${D.flat.maximumTermYears} años, con la tasa de referencia de ${pct(D.flat.referenceAnnualRate)} anual (fija), da una cuota aproximada de <strong>${yen(D.parcelaMediana)} por mes</strong>.</p>
<p>Ese número es indicativo. La cuota real depende del banco, del pago inicial, del plazo aprobado y del análisis de tu perfil, y Easy House no es una institución financiera: no aprueba créditos. Para una estimación con tus datos, usa el <a href="/simular-es" style="color:var(--teal)">simulador gratuito</a>.</p>

<h2>¿Una casa usada cuesta menos?</h2>
<p>No siempre. En el mercado japonés, el valor de la construcción se deprecia rápido —contablemente, una casa de madera se considera sin valor alrededor de los 22 años—, pero el terreno mantiene su valor. Por eso una casa antigua en un barrio valorizado puede costar más que una nueva en una zona lejana.</p>
<p>En el inventario actual hay <a href="/es/casas-nuevas" style="color:var(--teal)">casas nuevas</a> y <a href="/es/casas-usadas" style="color:var(--teal)">usadas</a> en todo el rango de precios. Lo que cambia entre ellas suele ser la ubicación y el tamaño del terreno, no solo la antigüedad.</p>`,
    faq: [
      ['¿Un extranjero puede comprar una vivienda en Japón?',
       'Sí. No hay restricción de nacionalidad ni exigencia de una visa específica para <strong>comprar</strong> una vivienda en Japón: el registro de propiedad está abierto a extranjeros. Lo que varía es el análisis de crédito, cuando hay financiamiento.'],
      ['¿Cuál es el precio mínimo de una casa en Japón?',
       `En el inventario actual de Easy House, la casa más barata cuesta ${yen(D.min)} y hay ${D.faixa(0, 15000000)} viviendas por debajo de ¥15 millones. Existen valores menores en el mercado, en general en zonas rurales o en viviendas que necesitan reforma estructural.`],
      ['¿Necesito tener todo el valor en efectivo?',
       'No necesariamente. Es posible financiar, y hay líneas que financian la totalidad del valor para determinados perfiles. La aprobación depende del banco, de los ingresos, del tiempo de trabajo, de la visa y de las deudas existentes.'],
      ['¿Cuánto necesito de pago inicial?',
       'Varía según el banco y el producto. Algunas líneas trabajan sin pago inicial; otras piden 10% o 20%. Cuanto mayor el pago inicial, menor la cuota, pero no existe un número único que valga para todos.'],
      ['¿Estos precios incluyen los impuestos?',
       `No. El precio anunciado es el de la vivienda. Reserva alrededor de ${Math.round(D.taxaAquisicao * 100)}% más para impuestos de adquisición, registro, escribano y seguro.`]
    ],
    relacionadas: [
      ['/es/casas-en-venta', `Ver las ${casas.length} casas en venta por ciudad`],
      ['/es/financiamiento-hipotecario-tokai', 'Cómo funciona la hipoteca en Japón para extranjeros'],
      ['/es/guia-comprar-casa-japon', 'Cómo comprar casa en Japón siendo extranjero'],
      ['/simular-es', 'Simular qué rango de vivienda cabe en tu presupuesto']
    ]
  });
}

function paginaFinanciamentoEs(casas) {
  const f = financingConfig.flat35, b = financingConfig.bank;
  const teto = financingConfig.acquisitionFeeRate;
  const rendaCorte = f.incomeThreshold;
  const parcela = (valor, taxa, anos) => {
    const i = taxa / 12, n = anos * 12;
    return Math.round(valor * i / (1 - Math.pow(1 + i, -n)) / 500) * 500;
  };
  const exemplo = 25000000;
  const banco = 'Escenario bancario';

  return pagina({
    lang: 'es',
    slug: 'es/financiamiento-hipotecario-tokai',
    titulo: 'Hipoteca en Japón para extranjeros (住宅ローン) | Easy House',
    descricao: 'Cómo funciona el 住宅ローン para extranjeros en Japón: plazos, tasas de referencia, límite de endeudamiento y el peso de la visa. Explicado en español.',
    h1: 'Hipoteca en Japón para extranjeros',
    resposta: `<p><strong>Comprar y financiar son cosas distintas.</strong> No hay restricción de nacionalidad para comprar una vivienda en Japón. La dificultad, cuando existe, está en el crédito, y cada banco decide con sus propios criterios.</p>
      <p>Los factores que más pesan en el análisis son <strong>tipo de visa, tiempo en el empleo actual, ingresos declarados y deudas existentes</strong>. No hay una regla única para todas las instituciones, y ninguna inmobiliaria puede garantizar la aprobación: quien aprueba es el banco.</p>`,
    corpo: `
<h2>Dos caminos, condiciones distintas</h2>
<p>En la práctica, quien compra en Japón suele comparar dos rutas:</p>
<table class="tabela-dados">
  <thead><tr><th>&nbsp;</th><th>${f.label}</th><th>${banco}</th></tr></thead>
  <tbody>
    <tr><td>Tasa de referencia</td><td>${pct(f.referenceAnnualRate)} anual</td><td>${pct(b.referenceAnnualRate)} anual</td></tr>
    <tr><td>Tipo de tasa</td><td>Fija durante todo el plazo</td><td>Generalmente variable</td></tr>
    <tr><td>Extranjeros</td><td>Solo con residencia permanente (永住者) o residencia permanente especial (特別永住者)</td><td>Criterio de cada banco</td></tr>
    <tr><td>Plazo máximo</td><td>${f.maximumTermYears} años</td><td>${b.maximumTermYears} años</td></tr>
    <tr><td>Edad límite al terminar de pagar</td><td>${f.payoffAgeLimit} años</td><td>${b.payoffAgeLimit} años</td></tr>
  </tbody>
</table>
<p class="nota-fonte">Tasas de referencia usadas en las simulaciones de Easy House. Los valores del mercado cambian; la condición real la da la institución en el análisis.</p>

<h3>¿Tasa fija o variable?</h3>
<p>La tasa fija protege de aumentos: la cuota de hoy es la misma dentro de veinte años. La variable empieza más baja, pero puede subir. Para quien tiene un presupuesto ajustado y ningún margen para sorpresas, la previsibilidad de la fija suele valer su costo mayor.</p>

<h2>Cuánto de tus ingresos puedes comprometer</h2>
<p>Los bancos limitan cuánto del ingreso anual puede ir a cuotas de deudas: el 返済比率 (índice de endeudamiento). La regla usada en las simulaciones de Easy House:</p>
<ul>
  <li>Ingreso anual hasta ${yen(rendaCorte)}: hasta el <strong>${Math.round(f.lowerIncomeRepaymentRatio * 100)}%</strong> del ingreso</li>
  <li>Ingreso anual por encima de ${yen(rendaCorte)}: hasta el <strong>${Math.round(f.higherIncomeRepaymentRatio * 100)}%</strong></li>
</ul>
<p>Atención: ese límite cuenta <strong>todas</strong> las cuotas, no solo la de la casa. Préstamo de auto, tarjeta en cuotas, キャッシング y リボ払い entran en la cuenta y reducen lo que queda para la vivienda. Por eso ordenar las deudas antes de solicitar cambia el resultado; el <a href="/simular-es" style="color:var(--teal)">simulador</a> pregunta por las cuotas actuales justamente por eso.</p>

<h2>El peso de la visa</h2>
<p>El tipo de visa es el factor que más varía entre instituciones:</p>
<ul>
  <li><strong>Residencia permanente (永住) o residencia permanente especial</strong>: aceptada por la mayoría de las instituciones, incluso en Flat 35, en general en las mismas condiciones que un ciudadano japonés</li>
  <li><strong>Cónyuge de japonés (日本人の配偶者)</strong>, <strong>residente de larga estancia (定住者)</strong> y <strong>visas de trabajo</strong>: Flat 35 no las acepta —la JHF, que opera el producto, exige 永住者 o 特別永住者 a los extranjeros—. En los bancos privados depende de un análisis individual: algunas instituciones atienden y otras no</li>
</ul>
<p>No tener 永住 no cierra el tema: cambia a qué puertas tiene sentido tocar. Lee <a href="/es/hipoteca-sin-residencia-permanente" style="color:var(--teal)">hipoteca sin residencia permanente</a>.</p>

<h2>Ejemplo: una casa de ${yen(exemplo)}</h2>
<table class="tabela-dados">
  <thead><tr><th>Escenario</th><th>Plazo</th><th>Cuota estimada</th></tr></thead>
  <tbody>
    <tr><td>${f.label} — tasa fija</td><td>${f.maximumTermYears} años</td><td>${yen(parcela(exemplo, f.referenceAnnualRate, f.maximumTermYears))}/mes</td></tr>
    <tr><td>${f.label} — plazo menor</td><td>25 años</td><td>${yen(parcela(exemplo, f.referenceAnnualRate, 25))}/mes</td></tr>
    <tr><td>${banco} — tasa de referencia</td><td>35 años</td><td>${yen(parcela(exemplo, b.referenceAnnualRate, 35))}/mes</td></tr>
  </tbody>
</table>
<p class="nota-fonte">Cálculo sobre el valor total, sin pago inicial. Valores indicativos: la condición real depende del banco y del análisis de tu perfil.</p>
<p>Suma además alrededor del ${Math.round(teto * 100)}% del valor de la vivienda en gastos de compra, que normalmente no entran en el financiamiento.</p>

<h2>Lo que Easy House hace, y lo que no</h2>
<p>Easy House <strong>no es una institución financiera y no aprueba créditos</strong>. Lo que hace es ordenar el caso antes de presentarlo: ver qué pesa en contra, orientar sobre documentos, explicar el contrato en español y hablar en japonés con las instituciones.</p>
${certificadoValido() ? '<p>La atención la hace un asesor con certificación de <strong>住宅ローンアドバイザー</strong> (asesor de préstamos de vivienda), una calificación que la mayoría de los corredores no tiene.</p>' : ''}
<p>Para una estimación con tus números, el <a href="/simular-es" style="color:var(--teal)">simulador</a> toma cerca de un minuto y no pide ningún documento.</p>`,
    faq: [
      ['¿Un extranjero puede conseguir una hipoteca en Japón?',
       'Sí, es posible. Las condiciones varían mucho según el tipo de visa, el tiempo en el empleo actual, los ingresos y las deudas existentes. Quien tiene residencia permanente (永住) suele acceder a las mismas condiciones que un ciudadano japonés; las otras visas dependen de un análisis individual en cada institución.'],
      ['¿Necesito residencia permanente (永住) para financiar?',
       'En Flat 35, sí: la JHF acepta extranjeros solo con residencia permanente (永住者) o residencia permanente especial (特別永住者). En los bancos privados no hay una regla única: algunos la exigen y otros analizan caso por caso las visas de trabajo, de cónyuge de japonés y de residente de larga estancia.'],
      ['¿Cuánto tiempo de trabajo necesito demostrar?',
       'Varía según la institución. En general, cuanto más tiempo con el mismo empleador y más estable el vínculo, mejor el análisis. Cambiar de empleo justo antes de solicitar suele perjudicar.'],
      ['¿Tener キャッシング o リボ払い impide la hipoteca?',
       'No automáticamente. Esas cuotas entran en el cálculo del índice de endeudamiento y reducen el valor disponible para la casa. Ordenarlas antes de solicitar a menudo cambia el resultado del análisis.'],
      ['¿Easy House garantiza la aprobación?',
       'No. Ninguna inmobiliaria aprueba créditos: decide el banco. Lo que hace Easy House es preparar y presentar el caso, explicando cada etapa en español y hablando en japonés con las instituciones.'],
      ['¿Se puede financiar el 100% del valor?',
       'Algunas líneas trabajan sin pago inicial, para determinados perfiles. Pero los gastos de compra (alrededor del ' + Math.round(teto * 100) + '% del valor) normalmente no entran en el financiamiento y hay que tenerlos disponibles.']
    ],
    relacionadas: [
      ['/simular-es', 'Simular qué rango de vivienda cabe en tu presupuesto'],
      ['/es/hipoteca-sin-residencia-permanente', 'Hipoteca sin residencia permanente'],
      ['/es/ingresos-para-hipoteca', '¿Cuánto necesito ganar para una hipoteca?'],
      ['/es/gastos-comprar-vivienda', 'Cuánto cuesta comprar una casa en Japón'],
      ['/es/casas-en-venta', `Ver las ${casas.length} casas en venta por ciudad`]
    ]
  });
}

/* ═══════════════════════════════════════════════════════════════
   5. Guias (aprovados pela Easy House em 31/10/2026)

   O texto mora em docs/seo/guias/{pt,es}/*.md — Markdown simples, fora do
   site (docs/ não é publicada). Este script converte para a mesma casca das
   outras páginas. Mudar um guia: editar o .md e rodar o script. Guia novo
   só entra depois de aprovado: o briefing exige revisão humana para
   conteúdo financeiro.
   ═══════════════════════════════════════════════════════════════ */

const GUIAS = [
  // [slug pt, slug es]
  ['guia-comprar-casa-japao', 'guia-comprar-casa-japon'],
  ['financiamento-sem-eijuken', 'hipoteca-sin-residencia-permanente'],
  ['financiamento-trabalho-haken', 'hipoteca-trabajo-haken'],
  ['financiamento-autonomo', 'hipoteca-trabajador-independiente'],
  ['renda-minima-financiamento', 'ingresos-para-hipoteca'],
  ['documentos-financiamento', 'documentos-hipoteca'],
];

/** Links de português para o par em espanhol, nas páginas em espanhol. */
const LINK_ES = {
  '/simular': '/simular-es',
  '/casas-a-venda': '/es/casas-en-venta',
  '/casas-novas': '/es/casas-nuevas',
  '/casas-usadas': '/es/casas-usadas',
  '/quanto-custa-casa-japao': '/es/gastos-comprar-vivienda',
  '/financiamento-imovel-japao': '/es/financiamiento-hipotecario-tokai',
  ...Object.fromEntries(GUIAS.map(([pt, es]) => [`/${pt}`, `/es/${es}`])),
};

const escMd = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inline: **negrito**, *itálico*, [texto](url). Links internos viram o par em espanhol. */
function inline(t, lang) {
  return escMd(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, txt, href) => {
      const alvo = lang === 'es' ? (LINK_ES[href] || href) : href;
      return `<a href="${alvo}" style="color:var(--teal)">${txt}</a>`;
    });
}

/** Markdown do guia → HTML. Só o que os guias usam: títulos, parágrafos, listas e tabelas. */
function md(texto, lang) {
  const linhas = texto.split('\n');
  const out = [];
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    if (!l.trim()) { i++; continue; }
    if (l.startsWith('### ')) { out.push(`<h3>${inline(l.slice(4), lang)}</h3>`); i++; continue; }
    if (l.startsWith('## ')) { out.push(`<h2>${inline(l.slice(3), lang)}</h2>`); i++; continue; }
    if (l.startsWith('|')) {
      const tab = [];
      while (i < linhas.length && linhas[i].startsWith('|')) { tab.push(linhas[i]); i++; }
      const celulas = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const [cab, , ...corpo] = tab;
      out.push(`<table class="tabela-dados"><thead><tr>${celulas(cab).map((c) => `<th>${c ? inline(c, lang) : '&nbsp;'}</th>`).join('')}</tr></thead><tbody>`
        + corpo.map((r) => `<tr>${celulas(r).map((c) => `<td>${inline(c, lang)}</td>`).join('')}</tr>`).join('') + '</tbody></table>');
      continue;
    }
    const lista = l.match(/^(-|\d+\.) /);
    if (lista) {
      const ordenada = lista[1] !== '-';
      const itens = [];
      while (i < linhas.length && (/^(-|\d+\.) /.test(linhas[i]) || (/^\s+\S/.test(linhas[i]) && itens.length))) {
        if (/^(-|\d+\.) /.test(linhas[i])) itens.push(linhas[i].replace(/^(-|\d+\.) /, ''));
        else itens[itens.length - 1] += ' ' + linhas[i].trim();
        i++;
      }
      const tag = ordenada ? 'ol' : 'ul';
      out.push(`<${tag}>${itens.map((t) => `<li>${inline(t, lang)}</li>`).join('')}</${tag}>`);
      continue;
    }
    const par = [];
    while (i < linhas.length && linhas[i].trim() && !/^(#|\||- |\d+\. )/.test(linhas[i])) { par.push(linhas[i].trim()); i++; }
    const html = inline(par.join(' '), lang);
    out.push(/^\*[^*].*\*$/.test(par.join(' ')) ? `<p class="nota-fonte">${html.replace(/^<em>|<\/em>$/g, '')}</p>` : `<p>${html}</p>`);
  }
  return out.join('\n');
}

/** Lê um guia aprovado: metadados do comentário, resposta, corpo, perguntas e chamadas. */
function lerGuia(arquivo, lang) {
  const bruto = readFileSync(arquivo, 'utf8');
  const meta = Object.fromEntries([...bruto.matchAll(/^(Título|Descrição|Descripción|Title)\s*(?:\([^)]*\))?:\s*(.+)$/gm)]
    .map(([, k, v]) => [k.startsWith('Desc') ? 'descricao' : 'titulo', v.trim()]));
  const texto = bruto.replace(/<!--[\s\S]*?-->/, '').trim();
  const h1 = texto.match(/^# (.+)$/m)[1].trim();
  const semH1 = texto.replace(/^# .+$/m, '').trim();
  const secoes = semH1.split(/^(?=## )/m);
  const intro = secoes[0].startsWith('## ') ? '' : secoes.shift();

  const ehFaq = (s) => /^## (Perguntas frequentes|Preguntas frecuentes)/.test(s);
  const ehProximo = (s) => /^## (Próximo passo|Próximo paso)/.test(s);

  const faq = [];
  for (const s of secoes.filter(ehFaq)) {
    const blocos = s.replace(/^## .+\n/, '').trim().split(/\n(?=\*\*[^*]+\*\*\s*$)/m);
    for (const b of blocos) {
      const m = b.trim().match(/^\*\*(.+?)\*\*\s*\n([\s\S]+)$/);
      if (m) faq.push([m[1].trim(), inline(m[2].replace(/\s*\n\s*/g, ' ').trim(), lang)]);
    }
  }

  // Chamadas: "[CTA] Rótulo → /url" vira botão; "[CTA] ... WhatsApp ("mensagem")" vira o
  // botão do WhatsApp, sem os marcadores [cidade]/[província] (a página não é de cidade).
  let chamadas = '';
  let rodape = '';
  for (const s of secoes.filter(ehProximo)) {
    const corpoSec = s.replace(/^## .+\n/, '');
    const ctas = [...corpoSec.matchAll(/\[CTA\]([\s\S]*?)(?=\n\[CTA\]|\n\n|$)/g)].map((m) => m[1].replace(/\s*\n\s*/g, ' ').trim());
    const botoes = ctas.map((c) => {
      const wa = c.match(/WhatsApp \("(.+)"\)/);
      if (wa) {
        const msg = wa[1].replace(/\s+(em|en) \[(cidade|ciudad)\], \[(província|provincia)\]/, '');
        return `<a class="btn btn--wa" rel="nofollow" data-cta="guia_whatsapp" href="${WA(msg)}">WhatsApp</a>`;
      }
      const m = c.match(/^(.+?)\s*→\s*(\/\S*)$/);
      if (!m) return '';
      const alvo = lang === 'es' ? (LINK_ES[m[2]] || m[2]) : m[2];
      return `<a class="btn btn--ghost" data-cta="guia_cta" href="${alvo}">${escMd(m[1])}</a>`;
    }).join('\n    ');
    chamadas = `<p class="btn-row" style="margin:24px 0">\n    ${botoes}\n  </p>`;
    const aviso = corpoSec.split('\n').filter((l) => /^\*[^*].*\*$/.test(l.trim()));
    rodape = aviso.map((l) => `<p class="nota-fonte">${escMd(l.trim().slice(1, -1))}</p>`).join('');
  }

  const corpo = md(secoes.filter((s) => !ehFaq(s) && !ehProximo(s)).join('\n'), lang) + chamadas + rodape;
  return { titulo: meta.titulo, descricao: meta.descricao, h1, resposta: md(intro, lang), corpo, faq };
}

function paginasGuias() {
  const saida = [];
  const titulos = { pt: {}, es: {} };
  const lidos = GUIAS.map(([pt, es]) => {
    const gPt = lerGuia(`docs/seo/guias/pt/${pt}.md`, 'pt');
    const gEs = lerGuia(`docs/seo/guias/es/${es}.md`, 'es');
    titulos.pt[pt] = gPt.h1; titulos.es[es] = gEs.h1;
    return { pt, es, gPt, gEs };
  });
  for (const { pt, es, gPt, gEs } of lidos) {
    const relPt = GUIAS.filter(([p]) => p !== pt).map(([p]) => [`/${p}`, titulos.pt[p]]).concat([['/financiamento-imovel-japao', 'Como funciona o financiamento imobiliário no Japão']]);
    const relEs = GUIAS.filter(([, e]) => e !== es).map(([, e]) => [`/es/${e}`, titulos.es[e]]).concat([['/es/financiamiento-hipotecario-tokai', 'Cómo funciona la hipoteca en Japón para extranjeros']]);
    saida.push([`${pt}.html`, pagina({ slug: pt, lang: 'pt', relacionadas: relPt, ...gPt })]);
    saida.push([`es/${es}.html`, pagina({ slug: `es/${es}`, lang: 'es', relacionadas: relEs, ...gEs })]);
  }
  return saida;
}

/* ── Geração ─────────────────────────────────────────────── */

const casas = await carregarCasas();
mkdirSync('es', { recursive: true });
const paginas = [
  ['quanto-custa-casa-japao.html', paginaQuantoCusta(casas)],
  ['custo-inicial-aluguel-japao.html', paginaCustoAluguel()],
  ['financiamento-imovel-japao.html', paginaFinanciamento(casas)],
  ['es/gastos-comprar-vivienda.html', paginaQuantoCustaEs(casas)],
  ['es/financiamiento-hipotecario-tokai.html', paginaFinanciamentoEs(casas)],
  ...paginasGuias(),
];
for (const [arquivo, html] of paginas) {
  writeFileSync(arquivo, html);
  console.log(`  ${arquivo.padEnd(36)} ${(html.length / 1024).toFixed(1)} KB`);
}
console.log(`\n  números usados: ${casas.length} casas, ${new Set(casas.map(c => c.cidade)).size} cidades`);

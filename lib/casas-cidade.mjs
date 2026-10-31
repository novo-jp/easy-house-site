/**
 * lib/casas-cidade.mjs — uma página por cidade: /casas-a-venda/<cidade>
 *
 * Por que existe. Quem procura casa no Japão em português não busca "casas à
 * venda": busca "casa à venda em Nishio", "quanto custa uma casa em Anjo".
 * O site respondia a isso com a lista filtrada (`/comprar/imoveis?cidade=x`),
 * que é `noindex` de propósito — navegação facetada não se indexa, e fazer
 * isso geraria centenas de URLs com o mesmo texto. Resultado: nenhuma página
 * mirava a cidade, que é como a pergunta é feita.
 *
 * Por que não é doorway page. A regra do Google (scaled content abuse) não é
 * sobre quantidade, é sobre a página ter conteúdo próprio. Aqui cada cidade
 * tem números diferentes porque o acervo é diferente: quantas casas, de que
 * preço a que preço, mediana, plantas, idade, estações, quantas com vaga, e
 * a lista real de imóveis. Nada é texto fixo com o nome trocado — se duas
 * cidades tivessem os mesmos números, teriam o mesmo acervo.
 *
 * As cinco páginas `/simular/<cidade>` que existem hoje são o contrário
 * disso: 99,8% de texto idêntico entre si. Ficam para revisão à parte.
 *
 * Quem serve: `api/casas-lista.mjs`, a mesma função da busca, por rewrite.
 * O plano da Vercel limita o projeto a 12 funções e ele está em 11; esta
 * página precisa exatamente do acervo que aquela função já carrega e guarda
 * em memória.
 */

import { createRequire } from 'node:module';
import { documento, esc as e, SITE, ICONE_WA } from './casas-html.mjs';
import { chave } from './casas-busca.mjs';

const require = createRequire(import.meta.url);
const Cartao = require('./casas-cartao.js');

export const CAMINHO_BASE = '/casas-a-venda';
const LISTA = '/comprar/imoveis';
const WHATSAPP = '818028867708';

/** Quantas casas uma cidade precisa ter para a página ser anunciada. */
export const MINIMO_PARA_SITEMAP = 5;

/** Quantos cards a página mostra antes de mandar para a busca completa. */
const CARDS = 12;

const yen = (v) => (typeof v === 'number' && isFinite(v) ? '¥' + Math.round(v).toLocaleString('pt-BR') : null);
const m2 = (v) => (typeof v === 'number' && isFinite(v) && v > 0 ? v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' m²' : null);

/**
 * Mediana.
 *
 * `zeroVale` existe porque 0 significa coisas opostas conforme o campo: em
 * preço e área é dado ausente, e entra na conta puxando tudo para baixo; em
 * idade é "casa nova", e descartá-lo mente. Nishio tem 54 das 56 casas novas
 * e a mediana de idade saía como 3 anos, calculada sobre as duas usadas.
 */
function mediana(nums, { zeroVale = false } = {}) {
  const v = nums
    .filter((n) => typeof n === 'number' && isFinite(n) && (zeroVale ? n >= 0 : n > 0))
    .sort((a, b) => a - b);
  if (!v.length) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : Math.round((v[meio - 1] + v[meio]) / 2);
}

/** Conta por valor e devolve ordenado, do mais comum ao menos. */
function contar(itens, campo) {
  const m = new Map();
  for (const i of itens) {
    const v = campo(i);
    if (v) m.set(v, (m.get(v) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * Os números da cidade. É isto que diferencia uma página da outra — e o que
 * some da página quando o dado não existe, em vez de virar zero.
 */
export function estatisticas(casas) {
  const precos = casas.map((c) => c.preco).filter((p) => typeof p === 'number' && p > 0);
  const idades = casas.map((c) => c.idade).filter((i) => typeof i === 'number' && i >= 0);
  const comVaga = casas.filter((c) => c.vaga?.vagas > 0).length;
  const novas = casas.filter((c) => c.idade === 0).length;

  return {
    total: casas.length,
    precoMin: precos.length ? Math.min(...precos) : null,
    precoMax: precos.length ? Math.max(...precos) : null,
    precoMediana: mediana(precos),
    areaConstruida: mediana(casas.map((c) => c.areaConstruida)),
    areaTerreno: mediana(casas.map((c) => c.areaTerreno)),
    idadeMediana: idades.length ? mediana(idades, { zeroVale: true }) : null,
    novas,
    comVaga,
    plantas: contar(casas, (c) => c.planta).slice(0, 6),
    estacoes: contar(casas, (c) => c.acesso?.estacao).slice(0, 5),
  };
}

/** Distribuição em faixas, para a pessoa achar a sua de relance. */
function faixas(casas) {
  const cortes = [20e6, 25e6, 30e6, 35e6, 40e6];
  const rotulos = [
    ['Até ¥20 milhões', (p) => p < cortes[0]],
    ['¥20 a ¥25 milhões', (p) => p >= cortes[0] && p < cortes[1]],
    ['¥25 a ¥30 milhões', (p) => p >= cortes[1] && p < cortes[2]],
    ['¥30 a ¥35 milhões', (p) => p >= cortes[2] && p < cortes[3]],
    ['¥35 a ¥40 milhões', (p) => p >= cortes[3] && p < cortes[4]],
    ['Acima de ¥40 milhões', (p) => p >= cortes[4]],
  ];
  const precos = casas.map((c) => c.preco).filter((p) => typeof p === 'number' && p > 0);
  return rotulos
    .map(([rotulo, teste]) => ({ rotulo, total: precos.filter(teste).length }))
    .filter((f) => f.total > 0);
}

/**
 * As cidades que têm página, da maior para a menor.
 * `minimo` separa o que entra no sitemap do que apenas existe: uma cidade com
 * duas casas tem página (o link da busca leva até ela), mas anunciá-la ao
 * Google seria oferecer página magra.
 */
export function cidadesComPagina(todas, minimo = 1) {
  const m = new Map();
  for (const c of todas) {
    if (!c.cidade) continue;
    const k = chave(c.cidade);
    if (!m.has(k)) m.set(k, { chave: k, nome: c.cidade, nomeJp: c.cidadeJp || null, prefeitura: c.prefeitura || null, total: 0 });
    m.get(k).total += 1;
  }
  return [...m.values()].filter((c) => c.total >= minimo).sort((a, b) => b.total - a.total);
}

/** Acha a cidade pela chave da URL; devolve null se não existe no acervo. */
export function acharCidade(todas, chaveUrl) {
  const k = chave(chaveUrl);
  if (!k) return null;
  const casas = todas.filter((c) => c.cidade && chave(c.cidade) === k);
  if (!casas.length) return null;
  return { chave: k, nome: casas[0].cidade, nomeJp: casas[0].cidadeJp || null, prefeitura: casas[0].prefeitura || null, casas };
}

export function paginaCidade({ cidade, casas, alugueis = [], agora = new Date() }) {
  const url = `${SITE}${CAMINHO_BASE}/${cidade.chave}`;
  const s = estatisticas(casas);
  const nome = cidade.nome;
  const comJp = cidade.nomeJp ? `${nome} <span lang="ja">(${cidade.nomeJp})</span>` : nome;
  const local = [nome, cidade.prefeitura].filter(Boolean).join(', ');

  // Ordenadas por preço: a primeira da lista é a mais barata, que é o que a
  // pessoa quer ver quando chega por "casa barata em X".
  const ordenadas = [...casas].sort((a, b) => (a.preco || Infinity) - (b.preco || Infinity));

  const titulo = `${s.total} ${s.total === 1 ? 'casa à venda' : 'casas à venda'} em ${nome}, ${cidade.prefeitura || 'Japão'}`
    + `${s.precoMin ? ` a partir de ${yen(s.precoMin)}` : ''} | Easy House`;

  const descricao = `${s.total} ${s.total === 1 ? 'casa à venda' : 'casas à venda'} em ${local}`
    + `${s.precoMin && s.precoMax ? `, de ${yen(s.precoMin)} a ${yen(s.precoMax)}` : ''}`
    + `${s.precoMediana ? ` (mediana ${yen(s.precoMediana)})` : ''}.`
    + ' Preço, planta e parcela estimada de cada uma, em português, com atendimento da Easy House.';

  /* ── Resumo em números: o texto que só serve para esta cidade ───────── */
  const parcelaMin = ordenadas.find((c) => c.estimativa?.valor)?.estimativa?.valor ?? null;

  const resumo = `
<div class="info-bloco" id="resumo">
  <h2>O que existe em ${e(nome)} hoje</h2>
  <table class="info-tabela"><tbody>
    <tr><th scope="row">Casas à venda</th><td>${s.total}</td></tr>
    ${s.precoMin && s.precoMax ? `<tr><th scope="row">Faixa de preço</th><td>${e(yen(s.precoMin))} a ${e(yen(s.precoMax))}</td></tr>` : ''}
    ${s.precoMediana ? `<tr><th scope="row">Preço mediano</th><td>${e(yen(s.precoMediana))}</td></tr>` : ''}
    ${parcelaMin ? `<tr><th scope="row">Parcela estimada da mais barata</th><td>${e(yen(parcelaMin))}/mês</td></tr>` : ''}
    ${m2(s.areaConstruida) ? `<tr><th scope="row">Área construída (mediana)</th><td>${e(m2(s.areaConstruida))}</td></tr>` : ''}
    ${m2(s.areaTerreno) ? `<tr><th scope="row">Terreno (mediana)</th><td>${e(m2(s.areaTerreno))}</td></tr>` : ''}
    ${s.idadeMediana !== null ? `<tr><th scope="row">Idade da construção</th><td>${
      s.idadeMediana === 0
        ? `Mediana: construção nova${s.novas ? ` (${s.novas} de ${s.total})` : ''}`
        : `Mediana: ${s.idadeMediana} ano${s.idadeMediana > 1 ? 's' : ''}${s.novas ? ` · ${s.novas} nova${s.novas > 1 ? 's' : ''}` : ''}`
    }</td></tr>` : ''}
    ${s.comVaga ? `<tr><th scope="row">Com estacionamento</th><td>${s.comVaga} de ${s.total}</td></tr>` : ''}
  </tbody></table>
  <p class="estimativa-nota">Números do acervo de hoje, recontados a cada atualização. A parcela é estimativa educativa — não é oferta nem aprovação de crédito.</p>
</div>`;

  const dist = faixas(casas);
  const blocoFaixas = dist.length > 1 ? `
<div class="info-bloco" id="faixas">
  <h2>Quanto custa uma casa em ${e(nome)}</h2>
  <table class="info-tabela"><tbody>
    ${dist.map((f) => `<tr><th scope="row">${e(f.rotulo)}</th><td>${f.total} ${f.total === 1 ? 'casa' : 'casas'}</td></tr>`).join('')}
  </tbody></table>
  <p class="estimativa-nota"><a href="/simular">Descubra qual faixa cabe no seu bolso</a> — 60 segundos, sem documentos.</p>
</div>` : '';

  const blocoPlantas = s.plantas.length ? `
<div class="info-bloco" id="plantas">
  <h2>Plantas disponíveis em ${e(nome)}</h2>
  <table class="info-tabela"><tbody>
    ${s.plantas.map(([p, n]) => `<tr><th scope="row"><span lang="ja">${e(p)}</span></th><td>${n} ${n === 1 ? 'casa' : 'casas'}</td></tr>`).join('')}
  </tbody></table>
  <p class="estimativa-nota">No Japão a planta é escrita assim: o número são os quartos, e <span lang="ja">LDK</span> é a sala com cozinha integrada. <span lang="ja">3LDK</span> = três quartos mais sala/cozinha.</p>
</div>` : '';

  const blocoEstacoes = s.estacoes.length ? `
<div class="info-bloco" id="estacoes">
  <h2>Estações mais próximas</h2>
  <table class="info-tabela"><tbody>
    ${s.estacoes.map(([est, n]) => `<tr><th scope="row" lang="ja">${e(est)}</th><td>${n} ${n === 1 ? 'casa' : 'casas'}</td></tr>`).join('')}
  </tbody></table>
</div>` : '';

  /* ── Aluguel na mesma cidade: a outra metade da pergunta ────────────── */
  const alugueisCidade = alugueis.filter((a) => a.cidade && chave(a.cidade) === cidade.chave);
  const aluguelMediana = mediana(alugueisCidade.map((a) => a.aluguel));
  const blocoAluguel = alugueisCidade.length ? `
<div class="info-bloco" id="aluguel">
  <h2>Alugar em ${e(nome)}, para comparar</h2>
  <p class="texto-livre">São ${alugueisCidade.length} ${alugueisCidade.length === 1 ? 'apartamento' : 'apartamentos'} para alugar em ${e(nome)} no acervo de hoje${aluguelMediana ? `, com aluguel mediano de ${e(yen(aluguelMediana))}/mês` : ''}.${s.precoMediana && parcelaMin ? ` A parcela estimada da casa mais barata da cidade é ${e(yen(parcelaMin))}/mês.` : ''}</p>
  <p class="btn-row"><a class="btn btn--ghost" href="/imoveis?cidade=${e(cidade.chave)}">Ver apartamentos em ${e(nome)}</a></p>
  <p class="estimativa-nota">Comparar aluguel com parcela ajuda, mas não decide: comprar tem entrada e custos de aquisição que o aluguel não tem. <a href="/custo-inicial-aluguel-japao">Veja o custo de entrada de um aluguel</a>.</p>
</div>` : '';

  /* ── As casas de verdade ────────────────────────────────────────────── */
  const cards = ordenadas.slice(0, CARDS)
    .map((c, i) => Cartao.cartao(c, { prioridade: i === 0, titulo: 'h3' })).join('');

  const blocoCasas = `
<div class="info-bloco" id="casas">
  <h2>${s.total > CARDS ? `${CARDS} das ${s.total} casas` : `${s.total === 1 ? 'A casa' : `As ${s.total} casas`}`} em ${e(nome)}</h2>
  <p class="texto-livre">Da mais barata para a mais cara. Cada uma tem página própria com planta, área, estação e a parcela estimada.</p>
  <div class="casa-grid">${cards}</div>
  ${s.total > CARDS ? `<p class="btn-row" style="margin-top:18px"><a class="btn btn--gold" href="${LISTA}?cidade=${e(cidade.chave)}">Ver as ${s.total} casas em ${e(nome)}</a></p>` : ''}
</div>`;

  const contato = `
<div class="info-bloco" id="contato">
  <h2>Comprar em ${e(nome)} com a Easy House</h2>
  <p class="texto-livre">A gente visita com você, conversa em japonês com o anunciante e com o banco, e explica cada etapa em português. A Easy House não é instituição financeira e não aprova crédito — quem decide é o banco; o que fazemos é preparar e apresentar o seu caso.</p>
  <p class="btn-row" style="margin-top:14px">
    <a class="btn btn--wa" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Olá! Quero saber sobre as casas à venda em ${nome}.`)}" target="_blank" rel="noopener" data-cta="cidade_casas">${ICONE_WA} Falar sobre ${e(nome)}</a>
    <a class="btn btn--ghost" href="/simular">Simular minha faixa de compra</a>
  </p>
</div>`;

  const outras = `
<div class="info-bloco" id="outras">
  <h2>Outras cidades</h2>
  <p class="btn-row">
    <a class="btn btn--ghost" href="${LISTA}">Ver o acervo inteiro</a>
    <a class="btn btn--ghost" href="/entregas">Entregas reais</a>
  </p>
</div>`;

  /* ── Dados estruturados ─────────────────────────────────────────────── */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Início', item: SITE },
          { '@type': 'ListItem', position: 2, name: 'Casas à venda', item: `${SITE}${LISTA}` },
          { '@type': 'ListItem', position: 3, name: nome, item: url },
        ],
      },
      {
        '@type': 'ItemList',
        name: `Casas à venda em ${nome}`,
        numberOfItems: s.total,
        itemListElement: ordenadas.slice(0, CARDS).map((c, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: `${SITE}${LISTA}/${c.slug}`,
          name: c.titulo,
        })),
      },
    ],
  };

  const corpo = `
<main id="main">
  <nav class="migalhas" aria-label="Você está em">
    <ol>
      <li><a href="/">Início</a></li>
      <li><a href="${LISTA}">Casas à venda</a></li>
      <li aria-current="page">${e(nome)}</li>
    </ol>
  </nav>

  <header class="ficha-topo">
    <h1>Casas à venda em ${comJp}</h1>
    <p class="ficha-local">${e(local)}</p>
    <p class="ficha-preco">${s.total} ${s.total === 1 ? 'imóvel' : 'imóveis'}${s.precoMin ? ` · a partir de <strong>${e(yen(s.precoMin))}</strong>` : ''}</p>
  </header>

  ${resumo}
  ${blocoCasas}
  ${blocoFaixas}
  ${blocoPlantas}
  ${blocoEstacoes}
  ${blocoAluguel}
  ${contato}
  ${outras}
</main>`;

  return documento({
    titulo,
    descricao,
    canonical: url,
    imagem: ordenadas[0]?.fotos?.[0],
    jsonLd,
    corpo,
    caminhoAtual: LISTA,
    scripts: ['/casas-comum.js?v=11'],
  });
}

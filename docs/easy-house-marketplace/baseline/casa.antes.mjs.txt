/**
 * GET /comprar/imoveis/<slug> — página de um imóvel.
 *
 * Renderizada no servidor de propósito: esta é uma das principais portas de
 * entrada vinda do Google, então o HTML precisa chegar pronto, com título,
 * descrição, Open Graph e dados estruturados já preenchidos. Um app que
 * monta a página no navegador entregaria uma casca ao buscador.
 *
 * Um imóvel que saiu do ar não vira 404: a URL pode já estar indexada e o
 * visitante veio de uma busca real. Ele recebe o aviso e opções parecidas.
 */

import { readFileSync } from 'node:fs';
import { buscarPorSlug, carregarCasas, relacionadas, casasConfig } from '../lib/casas-fonte.mjs';
import { escaparHtml, formatarYen, formatarArea, linkWhatsApp } from '../lib/casas.mjs';

const L = JSON.parse(readFileSync(new URL('../lib/casas-layout.json', import.meta.url), 'utf8'));
const SITE = 'https://easyhouse.homes';
const e = escaparHtml;

/* ── Peças reutilizáveis ─────────────────────────────────── */

const ICONE_WA = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="18" height="18"><path d="M12 2C6.5 2 2 6.5 2 12c0 1.7.5 3.4 1.3 4.9L2 22l5.3-1.3c1.4.8 3 1.3 4.7 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2z"/></svg>';

function botaoWa(casa, motivo, cta, rotulo, classe = 'btn btn--wa') {
  const url = `${SITE}/comprar/imoveis/${casa.slug}`;
  return `<a class="${classe}" href="${e(linkWhatsApp(casa, motivo, url, cta, casasConfig))}"
     data-cta="${e(cta)}" data-imovel="${e(casa.codigo)}" rel="nofollow">${ICONE_WA} ${e(rotulo)}</a>`;
}

/** Bloco de conversão — repetido em pontos diferentes, com texto diferente. */
function blocoSimular(casa, cta, titulo, texto) {
  const est = casa.estimativa;
  return `
<section class="simular">
  <h3>${e(titulo)}</h3>
  <p>${e(texto)}</p>
  ${est ? `<p class="simular__valor">a partir de ${e(formatarYen(est.valor))}<small> /mês estimados</small></p>` : ''}
  ${botaoWa(casa, 'simulacao', cta, 'Quero uma simulação personalizada')}
  <ul class="simular__checks">
    <li>Atendimento em português</li><li>Sem compromisso</li><li>Análise conforme seu perfil</li>
  </ul>
</section>`;
}

function linha(rotulo, valor, jp) {
  if (valor === null || valor === undefined || valor === '') return '';
  return `<tr><th scope="row">${e(rotulo)}${jp ? ` <span class="jp">(${e(jp)})</span>` : ''}</th><td>${e(valor)}</td></tr>`;
}

function cartao(casa) {
  const f = casa.fotos[0];
  const specs = [
    casa.planta,
    casa.areaConstruida ? formatarArea(casa.areaConstruida) : null,
    casa.vaga?.pt
  ].filter(Boolean);
  return `
<article class="casa">
  <div class="casa__foto">
    ${f ? `<img src="${e(f)}" alt="Foto de ${e(casa.titulo)}" loading="lazy" decoding="async" width="400" height="300">`
        : '<div class="vazio" aria-hidden="true">家</div>'}
  </div>
  <div class="casa__corpo">
    <p class="casa__onde">${e([casa.cidade, casa.prefeitura].filter(Boolean).join(', '))}</p>
    <h3 class="casa__nome"><a href="/comprar/imoveis/${e(casa.slug)}">${e(casa.titulo)}</a></h3>
    <p class="casa__preco"><b>${e(casa.precoFormatado)}</b></p>
    ${casa.estimativa ? `<p class="casa__mensal"><b>${e(formatarYen(casa.estimativa.valor))}/mês</b><span class="est">estimado</span></p>` : ''}
    <p class="casa__specs">${specs.map((s) => `<span>${e(s)}</span>`).join('')}</p>
  </div>
</article>`;
}

function moldura({ titulo, descricao, canonical, imagem, robots, jsonLd, corpo, barraFixa }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${e(titulo)}</title>
<meta name="description" content="${e(descricao)}"/>
<link rel="canonical" href="${e(canonical)}"/>
${robots ? `<meta name="robots" content="${e(robots)}"/>` : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
<meta property="og:type" content="website"/>
<meta property="og:url" content="${e(canonical)}"/>
<meta property="og:title" content="${e(titulo)}"/>
<meta property="og:description" content="${e(descricao)}"/>
${imagem ? `<meta property="og:image" content="${e(imagem)}"/>` : ''}
<meta name="twitter:card" content="summary_large_image"/>
<link rel="preconnect" href="https://img4.athome.jp"/>
<link rel="preconnect" href="https://img.miraie-net.com"/>
<link rel="stylesheet" href="/theme-v2.css?v=8"/>
<link rel="stylesheet" href="/casas.css?v=10"/>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body${barraFixa ? ' class="tem-barra-fixa"' : ''}>
<a class="skip-link" href="#main">Ir para o conteúdo</a>
${L.nav}
${L.drawer}
${corpo}
${L.foot}
<script src="/theme-v2.js?v=8" defer></script>
<script src="/casas-comum.js?v=10" defer></script>
<script src="/casas-imovel.js?v=10" defer></script>
<script src="/analytics.js" defer></script>
</body>
</html>`;
}

/* ── Página do imóvel ────────────────────────────────────── */

function paginaImovel(casa, parecidas) {
  const url = `${SITE}/comprar/imoveis/${casa.slug}`;
  const est = casa.estimativa;
  const local = [casa.cidade, casa.prefeitura].filter(Boolean).join(', ');

  const titulo = `Casa ${casa.planta} à venda em ${casa.cidade || 'Aichi'} por ${casa.precoFormatado} | Easy House`;
  const descricao = `Casa ${casa.planta} à venda em ${local}. Veja ${casa.totalFotos} fotos, terreno, área construída`
    + `${est ? ` e estimativa de ${formatarYen(est.valor)} por mês` : ''}. Atendimento em português pela Easy House.`;

  const fotos = casa.fotos;
  const galeria = `
<div class="galeria">
  <div class="galeria__trilho" id="galeria" role="group" aria-label="Fotos do imóvel">
    ${fotos.slice(0, 5).map((f, i) => `
    <div class="galeria__slide">
      <img src="${e(f)}" alt="${e(casa.titulo)} — foto ${i + 1} de ${casa.totalFotos}"
           ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="900" height="675">
    </div>`).join('')}
  </div>
  ${casa.imagemEhFicha ? `<p class="galeria__aviso">Este anúncio não libera as fotos para o site. A imagem acima é a ficha do imóvel — as fotos existem e a gente envia pelo WhatsApp.</p>` : ''}
  ${fotos.length && !casa.imagemEhFicha ? `<p class="galeria__contador" id="contadorFotos" aria-live="polite">1 / ${casa.totalFotos}</p>
  <button class="galeria__ver" type="button" data-abrir-galeria>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
    Ver todas as ${casa.totalFotos} fotos
  </button>` : ''}
</div>

<div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="Fotos do imóvel">
  <div class="lightbox__topo">
    <span id="lightboxContador">1 / ${casa.totalFotos}</span>
    <button class="lightbox__fechar" type="button" data-fechar-galeria aria-label="Fechar galeria">×</button>
  </div>
  <div class="lightbox__palco" id="lightboxPalco"></div>
  <div class="lightbox__setas">
    <button type="button" data-foto-anterior aria-label="Foto anterior">←</button>
    <button type="button" data-foto-proxima aria-label="Próxima foto">→</button>
  </div>
</div>`;

  const principais = `
<div class="info-bloco">
  <h2>Informações do imóvel</h2>
  <table class="info-tabela">
    <tbody>
      ${linha('Preço', casa.precoFormatado)}
      ${linha('Planta', casa.planta, '間取り')}
      ${linha('Área construída', formatarArea(casa.areaConstruida), '建物面積')}
      ${linha('Área do terreno', formatarArea(casa.areaTerreno), '土地面積')}
      ${linha('Construído em', casa.ano ? `${casa.ano.ano}${casa.ano.mes ? `/${String(casa.ano.mes).padStart(2, '0')}` : ''}${casa.idade !== null ? ` · ${casa.idade} anos` : ''}` : null, '築年月')}
      ${linha('Estrutura', casa.estrutura?.pt, '構造')}
      ${linha('Estacionamento', casa.vaga?.pt ? casa.vaga.pt + (casa.vaga.mensalidade ? ` · ${formatarYen(casa.vaga.mensalidade)}/mês` : '') : null, '駐車場')}
      ${linha('Endereço', casa.endereco, '所在地')}
      ${linha('Zoneamento', casa.usoTerreno?.pt, '用途地域')}
      ${linha('Direito sobre o terreno', casa.direitoTerreno?.pt, '土地権利')}
      ${linha('Tipo de negociação', casa.transacao?.pt, '取引態様')}
      ${linha('Disponibilidade', casa.entrega?.pt, '引渡し')}
      ${linha('Comissão de intermediação', casa.comissaoPct ? `${String(casa.comissaoPct).replace('.', ',')}%` : null, '仲介手数料')}
      ${linha('Código do imóvel', casa.codigo)}
    </tbody>
  </table>
</div>`;

  const acessoBloco = casa.acesso?.estacao ? `
<div class="info-bloco">
  <h2>Como chegar</h2>
  <table class="info-tabela"><tbody>
    ${linha('Estação mais próxima', casa.acesso.estacao, '最寄駅')}
    ${linha('Linha', casa.acesso.linha)}
    ${linha('A pé', casa.acesso.minutosAPe ? `${casa.acesso.minutosAPe} minutos` : null, '徒歩')}
    ${linha('Distância', casa.acesso.distanciaKm ? `${String(casa.acesso.distanciaKm).replace('.', ',')} km` : null)}
  </tbody></table>
</div>` : '';

  const reforma = casa.reforma ? `
<div class="info-bloco">
  <h2>Reforma</h2>
  <p class="texto-livre">${e(casa.reforma)}</p>
  ${casa.incluiReforma ? '<p class="estimativa-nota">O preço anunciado inclui o custo da reforma.</p>' : ''}
</div>` : '';

  const semTraducao = casa.destaquesLista.filter((d) => !d.pt).length;
  const destaques = casa.destaquesLista.length ? `
<div class="info-bloco">
  <h2>O que este imóvel tem</h2>
  <p class="etiquetas">${casa.destaquesLista.slice(0, 45).map((d) => d.pt
      ? `<span title="${e(d.jp)}">${e(d.pt)}</span>`
      : `<span lang="ja">${e(d.jp)}</span>`).join('')}</p>
  ${semTraducao ? '<p class="estimativa-nota">Alguns itens seguem em japonês por não terem tradução direta. Se quiser saber o que significam, é só perguntar no WhatsApp.</p>' : ''}
</div>` : '';

  const obs = casa.observacoes ? `
<div class="info-bloco">
  <h2>Observações do anúncio</h2>
  <p class="texto-livre">${e(casa.observacoes)}</p>
  <p class="estimativa-nota">Texto original do anúncio. Se algum ponto não ficou claro, pergunte — explicamos em português.</p>
</div>` : '';

  const financiamento = `
<div class="info-bloco">
  <h2>Posso financiar esta casa?</h2>
  <p class="texto-livre">O financiamento depende do banco e do perfil de cada pessoa. Renda, visto, tempo de trabalho, outras dívidas e entrada podem influenciar a análise — e cada banco avalia de um jeito. Não dá para saber pelo anúncio: dá para saber analisando o seu caso.</p>
  ${est ? `<p class="estimativa-nota">A estimativa de ${e(formatarYen(est.valor))}/mês mostrada nesta página usa ${e(est.taxaRotulo || '')} em ${est.prazoAnos} anos, sobre o preço cheio do imóvel. ${e(est.avisoLongo)}</p>` : ''}
  <p class="btn-row" style="margin-top:16px">
    ${botaoWa(casa, 'simulacao', 'financiamento', 'Analisar meu caso')}
    <a class="btn btn--ghost" href="/simular">Ver se esta casa cabe no meu orçamento</a>
  </p>
</div>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Início', item: SITE },
          { '@type': 'ListItem', position: 2, name: 'Casas à venda', item: `${SITE}/comprar/imoveis` },
          ...(casa.cidade ? [{ '@type': 'ListItem', position: 3, name: casa.cidade, item: `${SITE}/comprar/imoveis?cidade=${encodeURIComponent(casa.cidade.toLowerCase())}` }] : []),
          { '@type': 'ListItem', position: casa.cidade ? 4 : 3, name: casa.titulo, item: url }
        ]
      },
      {
        '@type': 'Product',
        name: casa.titulo,
        description: descricao,
        sku: casa.codigo,
        image: casa.fotos.slice(0, 6),
        offers: {
          '@type': 'Offer', price: casa.preco, priceCurrency: 'JPY',
          availability: 'https://schema.org/InStock', url,
          seller: { '@type': 'RealEstateAgent', name: '株式会社EASY HOUSE', url: SITE }
        },
        additionalProperty: [
          casa.planta && { '@type': 'PropertyValue', name: 'Planta', value: casa.planta },
          casa.areaConstruida && { '@type': 'PropertyValue', name: 'Área construída', value: `${casa.areaConstruida} m2` },
          casa.areaTerreno && { '@type': 'PropertyValue', name: 'Área do terreno', value: `${casa.areaTerreno} m2` },
          casa.ano?.ano && { '@type': 'PropertyValue', name: 'Ano de construção', value: String(casa.ano.ano) }
        ].filter(Boolean)
      }
    ]
  };

  const corpo = `
<nav class="migalhas" aria-label="Você está em">
  <ol>
    <li><a href="/">Início</a></li>
    <li><a href="/comprar/imoveis">Casas à venda</a></li>
    ${casa.cidade ? `<li><a href="/comprar/imoveis?cidade=${encodeURIComponent(casa.cidade.toLowerCase())}">${e(casa.cidade)}</a></li>` : ''}
    <li aria-current="page">${e(casa.codigo)}</li>
  </ol>
</nav>

<main id="main" class="imovel"
      data-imovel="${e(casa.codigo)}" data-cidade="${e(casa.cidade || '')}"
      data-prefeitura="${e(casa.prefeitura || '')}" data-preco="${casa.preco}"
      data-fotos='${JSON.stringify(casa.fotos).replace(/'/g, '&#39;')}'>

  <div class="imovel__topo">
    <div>
      <h1 class="imovel__titulo">Casa à venda em ${e(casa.cidade || casa.prefeitura || 'Aichi')}</h1>
      <p class="imovel__local">${e([casa.planta, local].filter(Boolean).join(' · '))}</p>
      <p class="imovel__codigo">Código ${e(casa.codigo)}</p>
    </div>
    <div class="imovel__acoes">
      <button class="acao-redonda" type="button" data-favoritar="${e(casa.codigo)}"
              aria-pressed="false" aria-label="Salvar este imóvel nos favoritos" title="Salvar">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
      </button>
      <button class="acao-redonda" type="button" data-compartilhar aria-label="Compartilhar este imóvel" title="Compartilhar">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>
      </button>
    </div>
  </div>

  ${galeria}

  <div class="imovel__grade">
    <div>
      <div class="preco-bloco">
        <p class="preco-bloco__valor">${e(casa.precoFormatado)}</p>
        <p class="preco-bloco__man">${e(casa.precoMan)}${casa.incluiReforma ? ' · reforma incluída no preço' : ''}</p>
        ${est ? `
        <div class="preco-bloco__extra">
          <p class="estimativa-linha">Parcela estimada <b>${e(formatarYen(est.valor))}/mês</b></p>
          <p class="estimativa-nota">${e(est.avisoLongo)}</p>
        </div>` : ''}
      </div>

      <p class="btn-row">
        ${botaoWa(casa, 'simulacao', 'topo', 'Quanto ficaria para mim?')}
        ${botaoWa(casa, 'visita', 'topo_visita', 'Agendar uma visita', 'btn btn--ghost')}
      </p>

      ${blocoSimular(casa, 'apos_galeria', 'Quanto esta casa ficaria por mês para você?',
        'A parcela depende da sua renda, do visto, da entrada, do prazo e do banco disponível. Podemos verificar o seu caso.')}

      ${principais}
      ${acessoBloco}

      <p class="btn-row">${botaoWa(casa, 'duvida', 'apos_caracteristicas', 'Tirar uma dúvida no WhatsApp', 'btn btn--ghost')}</p>

      ${reforma}
      ${destaques}
      ${financiamento}
      ${obs}

      ${blocoSimular(casa, 'fim_pagina', 'Gostou desta casa?',
        'Antes de desistir pelo preço, veja quanto ela poderia ficar por mês para o seu perfil.')}
    </div>

    <aside class="imovel__lateral">
      <div class="wa-card">
        <h3>Interessado nesta casa?</h3>
        <p>Falamos português. Responda o que precisa e a gente verifica.</p>
        ${botaoWa(casa, 'simulacao', 'lateral_simulacao', 'Fazer simulação')}
        ${botaoWa(casa, 'visita', 'lateral_visita', 'Agendar visita', 'btn btn--ghost')}
        ${botaoWa(casa, 'duvida', 'lateral_duvida', 'Tirar uma dúvida', 'btn btn--ghost')}
        <p class="wa-card__nota">株式会社EASY HOUSE · imobiliária licenciada no Japão (沖縄県知事(1)第5984号). Atendimento em português, espanhol, inglês e japonês.</p>
      </div>
    </aside>
  </div>
</main>

${parecidas.length ? `
<section class="relacionados" aria-labelledby="rel-t">
  <h2 id="rel-t">Casas parecidas que você pode gostar</h2>
  <p>Mesma região ou faixa de preço parecida.</p>
  <div class="casa-grid">${parecidas.map(cartao).join('')}</div>
</section>` : ''}

<div class="wa-fixo">
  ${est ? `<div class="wa-fixo__preco"><b>${e(formatarYen(est.valor))}/mês</b><small>estimado</small></div>` : ''}
  ${botaoWa(casa, 'simulacao', 'barra_celular', 'Quanto ficaria para mim?')}
</div>`;

  return moldura({
    titulo, descricao, canonical: url,
    imagem: casa.fotos[0] || null,
    jsonLd, corpo, barraFixa: true
  });
}

/* ── Imóvel que saiu do ar ───────────────────────────────── */

function paginaIndisponivel(casa, parecidas, slug) {
  const url = `${SITE}/comprar/imoveis/${casa ? casa.slug : slug}`;
  const onde = casa?.cidade ? ` em ${casa.cidade}` : '';
  const corpo = `
<main id="main">
  <div class="indisponivel">
    <p class="indisponivel__selo">Imóvel não disponível</p>
    <h1>Esta casa${onde ? e(onde) : ''} não está mais disponível</h1>
    <p>Imóveis saem do ar quando são vendidos ou reservados. Mas separamos outras opções parecidas — e, se preferir, a gente procura de acordo com o que você precisa.</p>
    <p class="btn-row" style="justify-content:center">
      <a class="btn btn--gold" href="/comprar/imoveis">Ver casas disponíveis</a>
      <a class="btn btn--wa" rel="nofollow" href="https://wa.me/${casasConfig.whatsapp.numero}?text=${encodeURIComponent(
        `Olá! Vi um imóvel no site da Easy House que já não está disponível${casa ? ` (${casa.codigo})` : ''}. Podem me ajudar a encontrar algo parecido?`)}"
        data-cta="indisponivel">${ICONE_WA} Procurar algo parecido</a>
    </p>
  </div>
  ${parecidas.length ? `
  <section class="relacionados" aria-labelledby="rel-t">
    <h2 id="rel-t">Casas disponíveis que podem servir</h2>
    <p>Escolhidas pela mesma região ou faixa de preço.</p>
    <div class="casa-grid">${parecidas.map(cartao).join('')}</div>
  </section>` : ''}
</main>`;

  return moldura({
    titulo: `Imóvel não disponível${onde} | Easy House`,
    descricao: 'Este imóvel não está mais disponível. Veja outras casas à venda no Japão com atendimento em português pela Easy House.',
    canonical: url,
    robots: 'noindex, follow',       // sai do índice sem quebrar os links que apontam para cá
    imagem: null, jsonLd: null, corpo, barraFixa: false
  });
}

/* ── Handler ─────────────────────────────────────────────── */

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || 'easyhouse.homes'}`);
  const slug = (url.searchParams.get('slug') || '').slice(0, 120);

  try {
    const [{ casa, disponivel }, todas] = await Promise.all([buscarPorSlug(slug), carregarCasas()]);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (!casa) {
      res.setHeader('Cache-Control', 'public, s-maxage=60');
      return res.status(404).send(paginaIndisponivel(null, todas.slice(0, 6), slug));
    }

    const parecidas = relacionadas(casa, todas, 6);

    if (!disponivel) {
      res.setHeader('Cache-Control', 'public, s-maxage=600');
      return res.status(200).send(paginaIndisponivel(casa, parecidas, slug));
    }

    // Slug antigo (o imóvel mudou de preço/planta) → manda para o atual
    if (slug !== casa.slug) {
      res.setHeader('Location', `/comprar/imoveis/${casa.slug}`);
      return res.status(301).end();
    }

    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    return res.status(200).send(paginaImovel(casa, parecidas));
  } catch (err) {
    console.error('[api/casa]', slug, err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).send(moldura({
      titulo: 'Não foi possível carregar o imóvel | Easy House',
      descricao: 'Tente novamente em instantes.',
      canonical: `${SITE}/comprar/imoveis`, robots: 'noindex',
      corpo: `<main id="main"><div class="indisponivel">
        <h1>Não conseguimos carregar este imóvel agora</h1>
        <p>Foi uma falha nossa, não sua. Tente de novo em alguns instantes.</p>
        <p class="btn-row" style="justify-content:center"><a class="btn btn--gold" href="/comprar/imoveis">Ver casas à venda</a></p>
      </div></main>`,
      barraFixa: false
    }));
  }
}

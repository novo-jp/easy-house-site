/**
 * lib/aluguel-ficha.mjs — a página de um apartamento de aluguel.
 *
 * Até 29/10/2026 o acervo de aluguel tinha lista e nada mais: quem queria
 * detalhe era mandado para `front.dk-portal.jp`, o portal japonês de atacado.
 * Perdia-se o visitante no momento de maior interesse, em japonês, fora do
 * site — e os 2.287 apartamentos não existiam como página para buscador
 * nenhum. Agora cada um tem endereço próprio, como já acontecia com as casas.
 *
 * Isto é uma lib, não uma função: quem serve é `api/aluguel-lista.mjs`, que
 * já carrega o acervo inteiro em memória. O plano da Vercel limita o projeto
 * a 12 funções e ele está em 11 — uma função nova para a ficha gastaria a
 * última vaga sem necessidade, já que a busca por código é uma varredura
 * num array que o processo já tem na mão.
 *
 * O desenho reaproveita as classes de `casas.css` (`info-bloco`,
 * `info-tabela`, `galeria`, `estimativa-nota`): a ficha do apartamento e a
 * ficha da casa são a mesma página com dados diferentes, e CSS novo só para
 * isso seria dívida.
 *
 * Honestidade, que aqui também é 景表法: o anúncio de aluguel vira e mexe sai
 * do ar antes de o scraper perceber. A página diz a data da última
 * verificação e nunca afirma que a unidade está livre hoje.
 */

import { createRequire } from 'node:module';
import { documento, esc as e, SITE, ICONE_WA } from './casas-html.mjs';

const require = createRequire(import.meta.url);
const Custos = require('../custos.js');
const Cartao = require('./aluguel-cartao.js');

export const CAMINHO_LISTA = '/imoveis';
const WHATSAPP = Cartao.WHATSAPP;

const yen = (v) => (typeof v === 'number' && isFinite(v) ? '¥' + Math.round(v).toLocaleString('pt-BR') : null);
const m2 = (v) => (typeof v === 'number' && isFinite(v) && v > 0 ? v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' m²' : null);
const dataPt = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null);

/** Uma linha da tabela. Dado ausente é omitido — nunca "0", "—" ou "NaN". */
function linha(rotulo, valor, jp, { lang = null } = {}) {
  if (valor === null || valor === undefined || valor === '') return '';
  const cabeca = jp ? `${e(rotulo)} <span class="jp" lang="ja">(${e(jp)})</span>` : e(rotulo);
  return `<tr><th scope="row">${cabeca}</th><td${lang ? ` lang="${lang}"` : ''}>${e(valor)}</td></tr>`;
}

function linkWhats(a, texto) {
  const msg = [
    `Olá! Tenho interesse no apartamento "${a.titulo}"${a.cidade ? ` em ${a.cidade}` : ''}${a.planta ? ` (${a.planta})` : ''}.`,
    yen(a.aluguel) ? `Aluguel: ${yen(a.aluguel)}/mês.` : '',
    `Código ${a.codigo}. Pode me passar mais informações?`,
  ].filter(Boolean).join('\n');
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`;
}

/** Apartamentos parecidos: mesma cidade primeiro, depois planta igual. */
export function relacionados(a, todos, quantos = 6) {
  const outros = todos.filter((x) => x.codigo !== a.codigo);
  const nota = (x) => (x.cidade === a.cidade ? 2 : 0) + (x.planta === a.planta ? 1 : 0);
  return outros
    .map((x) => ({ x, n: nota(x) }))
    .filter((p) => p.n > 0)
    .sort((p, q) => q.n - p.n || Math.abs((p.x.aluguel || 0) - (a.aluguel || 0)) - Math.abs((q.x.aluguel || 0) - (a.aluguel || 0)))
    .slice(0, quantos)
    .map((p) => p.x);
}

export function paginaApartamento(a, parecidos = []) {
  const url = `${SITE}${CAMINHO_LISTA}/${a.slug}`;
  const local = [a.cidade, 'Aichi'].filter(Boolean).join(', ');

  const titulo = `Apartamento ${a.planta || ''} para alugar em ${a.cidade || 'Aichi'} por ${yen(a.aluguel)}/mês | Easy House`
    .replace(/\s+/g, ' ');
  const descricao = `Apartamento ${a.planta ? a.planta + ' ' : ''}para alugar em ${local}`
    + `${m2(a.area) ? `, ${m2(a.area)}` : ''}`
    + `${a.acesso?.estacao ? `, perto da estação ${a.acesso.estacao}` : ''}.`
    + ` Custo mensal e entrada (初期費用) calculados item a item, em português, pela Easy House.`;

  /* ── Fotos: prédio e planta, quando existem ─────────────────────────── */
  const fotos = [
    a.fotoUrl ? { src: a.fotoUrl, alt: `${a.titulo} — foto do anúncio` } : null,
    a.fotoPlanta ? { src: a.fotoPlanta, alt: `Planta do apartamento ${a.planta || ''} — ${a.titulo}`.replace(/\s+/g, ' ') } : null,
  ].filter(Boolean);

  const galeria = fotos.length ? `
<div class="galeria">
  <div class="galeria__trilho" role="group" aria-label="Imagens do apartamento (rolagem horizontal)" tabindex="0">
    ${fotos.map((f, i) => `
    <div class="galeria__slide">
      <img src="${e(f.src)}" alt="${e(f.alt)}" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}
           decoding="async" width="900" height="600" referrerpolicy="no-referrer">
    </div>`).join('')}
  </div>
  <p class="galeria__aviso">Imagens do anúncio de origem. Se quiser mais fotos do apartamento, a gente pede e envia pelo WhatsApp.</p>
</div>` : '';

  /* ── Resumo factual, numa frase ─────────────────────────────────────── */
  const ja = (t) => `<span lang="ja">${e(t)}</span>`;
  const resumo = [
    a.planta ? `planta ${ja(a.planta)}` : null,
    m2(a.area),
    a.acesso?.estacao ? `estação ${ja(a.acesso.estacao)}${a.acesso.minutosAPe ? ` a ${a.acesso.minutosAPe} min a pé` : ''}` : null,
    a.temVaga === true ? (a.vaga ? `vaga por ${yen(a.vaga)}/mês` : 'com estacionamento') : (a.temVaga === false ? 'sem vaga' : null),
    a.pet === true ? 'aceita pet' : null,
  ].filter(Boolean).join(' · ');

  /* ── Custo: o que a pessoa realmente paga ───────────────────────────── */
  const custos = Custos.calcular({
    aluguel: a.aluguel || 0, condominio: a.condominio || 0,
    estacionamento: a.vaga || 0, tem_estacionamento: a.temVaga,
    deposito: a.deposito || 0, luva: a.luva || 0,
  });

  const itensEntrada = (custos.itens || []).filter((i) => i && i.valor > 0);
  const blocoCusto = `
<div class="info-bloco" id="custos">
  <h2>Quanto custa por mês</h2>
  <table class="info-tabela"><tbody>
    ${linha('Aluguel', yen(a.aluguel), '家賃')}
    ${linha('Condomínio', yen(a.condominio), '管理費・共益費')}
    ${a.temVaga === true && a.vaga ? linha('Estacionamento', `${yen(a.vaga)}/mês`, '駐車場') : ''}
    ${linha('Empresa garantidora (mensal)', yen(custos.garantiaMensal), '保証会社')}
    ${linha('Suporte Easy House', yen(custos.suporte), null)}
    <tr><th scope="row"><strong>Custo mensal total</strong></th><td><strong>${e(yen(custos.mensal))}/mês</strong></td></tr>
  </tbody></table>
  <p class="estimativa-nota">O portal anuncia só o aluguel. O que sai da sua conta todo mês é a soma acima — é por isso que a Easy House publica os dois números.</p>
</div>

<div class="info-bloco" id="entrada">
  <h2>Quanto custa para entrar <span class="jp" lang="ja">(初期費用)</span></h2>
  <p class="texto-livre">Estimativa para este apartamento, item a item. É a conta que costuma pegar o brasileiro de surpresa.</p>
  <table class="info-tabela"><tbody>
    ${itensEntrada.map((i) => `<tr><th scope="row">${e(i.pt)}${i.jp ? ` <span class="jp" lang="ja">(${e(i.jp)})</span>` : ''}${i.detalhe ? `<br><span class="estimativa-nota">${e(i.detalhe)}</span>` : ''}</th><td>${e(yen(i.valor))}</td></tr>`).join('')}
    <tr><th scope="row"><strong>Entrada estimada</strong></th><td><strong>${e(yen(custos.entrada))}</strong></td></tr>
    ${custos.entradaCartao && custos.entradaCartao !== custos.entrada
      ? `<tr><th scope="row">Pagando no cartão${custos.acrescimoCartao ? `<br><span class="estimativa-nota">${e(yen(custos.acrescimoCartao))} a mais que à vista</span>` : ''}</th><td>${e(yen(custos.entradaCartao))}</td></tr>`
      : ''}
  </tbody></table>
  <p class="estimativa-nota">Estimativa com ${custos.dias} diárias do primeiro mês. O valor fecha quando se sabe a data exata da mudança e o que o proprietário exige neste contrato. Não é cobrança nem proposta.</p>
  <p class="estimativa-nota"><a href="/custo-inicial-aluguel-japao">Entenda cada taxa da entrada de um aluguel no Japão</a></p>
</div>`;

  /* ── Ficha técnica ──────────────────────────────────────────────────── */
  const ficha = `
<div class="info-bloco" id="ficha">
  <h2>O apartamento</h2>
  <table class="info-tabela"><tbody>
    ${linha('Planta', a.planta, '間取り', { lang: 'ja' })}
    ${linha('Área', m2(a.area), '専有面積')}
    ${linha('Depósito', yen(a.deposito), '敷金')}
    ${linha('Taxa ao proprietário', yen(a.luva), '礼金')}
    ${linha('Estacionamento', a.temVaga === true ? (a.vaga ? `Com vaga · ${yen(a.vaga)}/mês` : 'Com vaga') : a.temVaga === false ? 'Sem vaga' : null, '駐車場')}
    ${linha('Aceita pet', a.pet === true ? 'Sim' : a.pet === false ? 'Não' : null, 'ペット')}
    ${linha('Internet grátis', a.internet === true ? 'Sim' : a.internet === false ? 'Não' : null, 'インターネット無料')}
    ${linha('Disponibilidade', a.disponibilidade?.texto, '入居可能時期')}
  </tbody></table>
  ${a.pet === null ? '<p class="estimativa-nota">Pet e internet só aparecem quando a Easy House confere na página de detalhe do anúncio — o texto do portal diz “ペット可” em todas, inclusive nas que não aceitam. Sem conferência, a gente não afirma.</p>' : ''}
</div>`;

  /* ── Localização ────────────────────────────────────────────────────── */
  const localizacao = `
<div class="info-bloco" id="localizacao">
  <h2>Onde fica</h2>
  <table class="info-tabela"><tbody>
    ${a.cidade ? `<tr><th scope="row">Cidade <span class="jp" lang="ja">(所在地)</span></th><td>${e(local)}${a.cidadeJp ? ` · <span lang="ja">${e(a.cidadeJp)}</span>` : ''}</td></tr>` : ''}
    ${linha('Endereço do anúncio', a.endereco, null, { lang: 'ja' })}
    ${linha('Estação mais próxima', a.acesso?.estacao, '最寄駅', { lang: 'ja' })}
    ${linha('Linha', a.acesso?.linha, null, { lang: 'ja' })}
    ${linha('A pé até a estação', a.acesso?.minutosAPe ? `${a.acesso.minutosAPe} minutos` : null, '徒歩')}
    ${linha('De ônibus', a.acesso?.onibus && a.acesso?.minutosOnibus ? `${a.acesso.minutosOnibus} minutos${a.acesso.ponto ? ` até ${a.acesso.ponto}` : ''}` : null, 'バス', { lang: a.acesso?.ponto ? 'ja' : null })}
  </tbody></table>
  ${a.endereco ? `<p class="estimativa-nota"><a href="https://www.google.com/maps/search/${encodeURIComponent(a.endereco)}" target="_blank" rel="noopener">Ver o endereço no mapa</a> (abre em outra aba)</p>` : ''}
</div>`;

  /* ── Fonte e datas: o que sustenta a honestidade da página ──────────── */
  const fonte = `
<div class="info-bloco" id="fonte">
  <h2>Fonte e datas</h2>
  <table class="info-tabela"><tbody>
    ${linha('Última verificação na fonte', dataPt(a.verificadoEm))}
    ${linha('Código do imóvel', a.codigo)}
  </tbody></table>
  <p class="estimativa-nota">Aluguel vira rápido: estes dados são os que a fonte publicava na última verificação, e a unidade pode ter sido alugada desde então. A Easy House confirma a disponibilidade com o anunciante antes de qualquer visita — é a primeira coisa que fazemos quando você chama.</p>
</div>`;

  /* ── Contato ────────────────────────────────────────────────────────── */
  const contato = `
<div class="info-bloco" id="contato">
  <h2>Quero este apartamento</h2>
  <p class="texto-livre">A gente confirma se está disponível, fecha o orçamento exato da entrada e cuida da papelada em japonês — contrato, garantidora e vistoria. Atendimento em português.</p>
  <p class="btn-row" style="margin-top:14px">
    <a class="btn btn--wa" href="${e(linkWhats(a))}" target="_blank" rel="noopener" data-cta="ficha_aluguel" data-imovel="${e(a.codigo)}">${ICONE_WA} Falar no WhatsApp</a>
    <a class="btn btn--ghost" href="${CAMINHO_LISTA}">Ver outros apartamentos</a>
  </p>
</div>`;

  const outros = parecidos.length ? `
<div class="info-bloco" id="parecidos">
  <h2>Outros em ${e(a.cidade || 'Aichi')}</h2>
  <div class="alu__grade">
    ${parecidos.map((p) => Cartao.cartao(p, { titulo: 'h3' })).join('')}
  </div>
</div>` : '';

  /* ── Dados estruturados ─────────────────────────────────────────────── */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Início', item: SITE },
          { '@type': 'ListItem', position: 2, name: 'Apartamentos para alugar', item: `${SITE}${CAMINHO_LISTA}` },
          ...(a.cidade ? [{ '@type': 'ListItem', position: 3, name: a.cidade, item: `${SITE}${CAMINHO_LISTA}?cidade=${encodeURIComponent(a.cidade.toLowerCase())}` }] : []),
          { '@type': 'ListItem', position: a.cidade ? 4 : 3, name: a.titulo, item: url },
        ],
      },
      {
        '@type': 'Product',
        name: `${a.titulo}${a.planta ? ` — ${a.planta}` : ''}`,
        description: descricao,
        sku: a.codigo,
        ...(fotos.length ? { image: fotos.map((f) => f.src) } : {}),
        offers: {
          '@type': 'Offer',
          priceCurrency: 'JPY',
          availability: 'https://schema.org/InStock',
          url,
          // Aluguel é preço por mês: sem a especificação, o valor seria lido
          // como preço de venda do imóvel.
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: a.aluguel,
            priceCurrency: 'JPY',
            unitCode: 'MON',
            referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' },
          },
          seller: { '@type': 'RealEstateAgent', name: 'EASY HOUSE ｜株式会社movO', url: SITE },
        },
        additionalProperty: [
          a.planta && { '@type': 'PropertyValue', name: 'Planta', value: a.planta },
          a.area && { '@type': 'PropertyValue', name: 'Área', value: `${a.area} m2` },
          a.acesso?.estacao && { '@type': 'PropertyValue', name: 'Estação', value: a.acesso.estacao },
          custos.mensal && { '@type': 'PropertyValue', name: 'Custo mensal total', value: `${custos.mensal} JPY` },
        ].filter(Boolean),
      },
    ],
  };

  const corpo = `
<main id="main">
  <nav class="migalhas" aria-label="Você está em">
    <ol>
      <li><a href="/">Início</a></li>
      <li><a href="${CAMINHO_LISTA}">Apartamentos para alugar</a></li>
      <li aria-current="page">${e(a.titulo)}</li>
    </ol>
  </nav>

  <header class="ficha-topo">
    <h1>${e(a.titulo)}${a.planta ? ` — ${e(a.planta)}` : ''}</h1>
    <p class="ficha-local">${e(local)}</p>
    <p class="ficha-preco"><strong>${e(yen(a.aluguel))}/mês</strong>${custos.mensal ? ` <span class="estimativa-nota">· custo mensal total ${e(yen(custos.mensal))}</span>` : ''}</p>
    ${resumo ? `<p class="texto-livre">${resumo}</p>` : ''}
  </header>

  ${galeria}
  ${blocoCusto}
  ${ficha}
  ${localizacao}
  ${contato}
  ${fonte}
  ${outros}
</main>`;

  return documento({
    titulo,
    descricao,
    canonical: url,
    imagem: fotos[0]?.src,
    imagemAlt: fotos[0]?.alt,
    jsonLd,
    corpo,
    caminhoAtual: CAMINHO_LISTA,
    preconnect: ['https://image.eheya.net'],
    scripts: ['/custos.js?v=4', '/lib/aluguel-cartao.js?v=2'],
  });
}

/**
 * Página do apartamento que saiu do acervo.
 *
 * 404 de propósito: dizer "não encontrado" com status 200 enche o índice do
 * Google de páginas mortas. Mas a pessoa veio de um link real, então a página
 * oferece a saída — os parecidos e a busca — em vez de um beco.
 */
export function paginaIndisponivel(slug, parecidos = []) {
  return documento({
    titulo: 'Este apartamento saiu do ar | Easy House',
    descricao: 'O anúncio não está mais disponível. Veja outros apartamentos para alugar em Aichi.',
    canonical: `${SITE}${CAMINHO_LISTA}`,
    robots: 'noindex, follow',
    caminhoAtual: CAMINHO_LISTA,
    scripts: ['/custos.js?v=4', '/lib/aluguel-cartao.js?v=2'],
    corpo: `
<main id="main">
  <div class="indisponivel">
    <h1>Este apartamento não está mais no ar</h1>
    <p>Anúncio de aluguel sai rápido — este já não aparece na fonte. Não dá para prometer o que não existe mais.</p>
    <p class="btn-row" style="justify-content:center">
      <a class="btn btn--gold" href="${CAMINHO_LISTA}">Ver apartamentos disponíveis</a>
      <a class="btn btn--wa" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Olá! Vi um apartamento no site que saiu do ar. Pode me ajudar a encontrar outro parecido?')}" target="_blank" rel="noopener">${ICONE_WA} Procurar um parecido</a>
    </p>
  </div>
  ${parecidos.length ? `<div class="info-bloco"><h2>Disponíveis agora</h2><div class="alu__grade">${parecidos.map((p) => Cartao.cartao(p, { titulo: 'h3' })).join('')}</div></div>` : ''}
</main>`,
  });
}

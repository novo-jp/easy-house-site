/**
 * GET /comprar/imoveis/<slug> — página de um imóvel.
 *
 * Renderizada no servidor de propósito: esta é uma das principais portas de
 * entrada vinda do Google, então o HTML precisa chegar pronto, com título,
 * descrição, Open Graph e dados estruturados já preenchidos.
 *
 * Um imóvel que saiu do ar não vira 404: a URL pode já estar indexada e o
 * visitante veio de uma busca real. Ele recebe o aviso e opções parecidas.
 *
 * Contato: UMA hierarquia deliberada. O botão principal é "Perguntar sobre
 * este imóvel" (topo, barra fixa do celular e coluna lateral); "Agendar visita"
 * é secundário. Antes havia 13 links de WhatsApp competindo com o conteúdo.
 *
 * Dado ausente que pesa na decisão aparece como "Não informado pela fonte",
 * nunca é omitido em silêncio nem preenchido por suposição.
 */

import { createRequire } from 'node:module';
import { buscarPorSlug, carregarCasas, relacionadas, casasConfig } from '../lib/casas-fonte.mjs';
import { formatarYen, formatarArea, linkWhatsApp } from '../lib/casas.mjs';
import { documento, esc as e, SITE, ICONE_WA } from '../lib/casas-html.mjs';

const require = createRequire(import.meta.url);
const Cartao = require('../lib/casas-cartao.js');

const LISTA = '/comprar/imoveis';

/* ── Peças reutilizáveis ─────────────────────────────────── */

function botaoWa(casa, motivo, cta, rotulo, classe = 'btn btn--wa') {
  const url = `${SITE}${LISTA}/${casa.slug}`;
  return `<a class="${classe}" href="${e(linkWhatsApp(casa, motivo, url, cta, casasConfig))}"
     data-cta="${e(cta)}" data-imovel="${e(casa.codigo)}" rel="nofollow">${ICONE_WA} ${e(rotulo)}</a>`;
}

const AUSENTE = 'Não informado pela fonte — confirme com a Easy House';

/** Linha da tabela. Some quando vazia, a menos que `obrigatoria` (aí diz que falta). */
function linha(rotulo, valor, jp, { obrigatoria = false, lang = null } = {}) {
  const vazio = valor === null || valor === undefined || valor === '';
  if (vazio && !obrigatoria) return '';
  const th = `${e(rotulo)}${jp ? ` <span class="jp" lang="ja">(${e(jp)})</span>` : ''}`;
  const td = vazio ? `<span class="ausente">${AUSENTE}</span>` : `<span${lang ? ` lang="${lang}"` : ''}>${e(valor)}</span>`;
  return `<tr><th scope="row">${th}</th><td>${td}</td></tr>`;
}

/** "2026-09-10" → "10/09/2026" */
function dataPt(iso) {
  if (!iso) return null;
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

function traduzPavimentos(jp) {
  const m = String(jp).match(/(\d+)階建/);
  const sub = /地下(\d+)階/.test(jp) ? ` + ${jp.match(/地下(\d+)階/)[1]} subsolo` : '';
  return m ? `${m[1]} ${m[1] === '1' ? 'pavimento' : 'pavimentos'}${sub}` : jp;
}
function traduzSituacao(jp) {
  if (!jp) return null;
  return { '空家': 'Desocupada', '完成済': 'Obra concluída', '所有者居住中': 'Proprietário ainda mora no imóvel', '賃貸中': 'Alugada a terceiros', '未完成': 'Em construção' }[jp] || jp;
}

/* ── Página do imóvel ────────────────────────────────────── */

function paginaImovel(casa, parecidas) {
  const url = `${SITE}${LISTA}/${casa.slug}`;
  const est = casa.estimativa;
  const local = [casa.cidade, casa.prefeitura].filter(Boolean).join(', ');

  const titulo = `Casa ${casa.planta} à venda em ${casa.cidade || casa.prefeitura} por ${casa.precoFormatado} | Easy House`;
  const descricao = `Casa ${casa.planta} à venda em ${local}${casa.areaConstruida ? `, ${formatarArea(casa.areaConstruida)} construídos` : ''}${casa.areaTerreno ? ` em terreno de ${formatarArea(casa.areaTerreno)}` : ''}.`
    + ` ${casa.totalFotos} ${casa.totalFotos === 1 ? 'foto' : 'fotos'}, dados do anúncio em português e atendimento pela Easy House.`;

  const fotos = casa.fotos;
  const altFoto = (i) => casa.imagemEhFicha
    ? `Ficha do imóvel ${casa.codigo} preparada pela Easy House — o anúncio não libera as fotos para o site`
    : `${casa.titulo} — foto ${i + 1} de ${casa.totalFotos}`;

  const galeria = `
<div class="galeria">
  <div class="galeria__trilho" id="galeria" role="group" aria-label="Fotos do imóvel (rolagem horizontal)" tabindex="0">
    ${fotos.slice(0, 5).map((f, i) => `
    <div class="galeria__slide">
      <img src="${e(f)}" alt="${e(altFoto(i))}"
           ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="900" height="600">
    </div>`).join('')}
  </div>
  ${casa.imagemEhFicha ? `<p class="galeria__aviso">Este anúncio não libera as fotos para publicação no site. A imagem acima é a ficha do imóvel preparada pela Easy House — as fotos existem e a gente envia pelo WhatsApp.</p>` : ''}
  ${fotos.length && !casa.imagemEhFicha ? `<p class="galeria__contador" id="contadorFotos" aria-live="polite">1 / ${casa.totalFotos}</p>
  <button class="galeria__ver" type="button" data-abrir-galeria>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
    Ver todas as ${casa.totalFotos} fotos
  </button>` : ''}
</div>

<div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="Fotos do imóvel em tela cheia">
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

  // ── Resumo factual: só o que existe, em uma frase
  const ja = (t) => `<span lang="ja">${e(t)}</span>`;
  const resumo = [
    casa.construcaoNova === true ? 'casa nova' : (casa.construcaoNova === false ? 'casa usada' : null),
    casa.planta ? `planta ${ja(casa.planta)}` : null,
    casa.areaConstruida ? `${formatarArea(casa.areaConstruida)} construídos` : null,
    casa.areaTerreno ? `terreno de ${formatarArea(casa.areaTerreno)}` : null,
    casa.ano?.ano ? `construída em ${casa.ano.ano}` : null,
    casa.pavimentosJp ? traduzPavimentos(casa.pavimentosJp) : null,
    casa.temEstacionamento === true ? (casa.vaga?.vagas ? `${casa.vaga.vagas} vaga${casa.vaga.vagas > 1 ? 's' : ''}` : 'com estacionamento') : (casa.temEstacionamento === false ? 'sem vaga' : null),
    casa.acesso?.estacao ? `estação ${ja(casa.acesso.estacao)}${casa.acesso.minutosAPe ? ` a ${casa.acesso.minutosAPe} min a pé` : ''}` : null
  ].filter(Boolean).map((t) => e(t).replace(/&lt;span lang=&quot;ja&quot;&gt;(.*?)&lt;\/span&gt;/g, '<span lang="ja">$1</span>'));

  const entregaTexto = casa.entregaClasse === 'imediata' ? 'Imediata'
    : casa.entregaClasse === 'prevista' ? (casa.entregaPrevista ? casa.entregaPrevista.replace(/^previsão: /, 'Prevista — ') : 'Prevista (obra)')
    : casa.entregaClasse === 'combinar' ? 'A combinar' : (casa.entrega?.pt || null);

  const fatos = `
<div class="info-bloco" id="dados">
  <h2>Dados do imóvel</h2>
  <table class="info-tabela">
    <tbody>
      ${linha('Planta', casa.planta, '間取り', { obrigatoria: true, lang: 'ja' })}
      ${linha('Área construída', formatarArea(casa.areaConstruida), '建物面積', { obrigatoria: true })}
      ${linha('Área do terreno', formatarArea(casa.areaTerreno), '土地面積', { obrigatoria: true })}
      ${linha('Construção', casa.ano ? `${casa.ano.ano}${casa.ano.mes ? `/${String(casa.ano.mes).padStart(2, '0')}` : ''}${casa.idade !== null ? ` · ${casa.idade === 0 ? 'este ano' : `${casa.idade} ano${casa.idade > 1 ? 's' : ''}`}` : ''}` : null, '築年月', { obrigatoria: true })}
      ${linha('Estado', casa.construcaoNova === true ? 'Nova (primeira venda)' : casa.construcaoNova === false ? 'Usada' : null, '新築／中古')}
      ${linha('Pavimentos', casa.pavimentosJp ? traduzPavimentos(casa.pavimentosJp) : null, '階建')}
      ${linha('Estrutura', casa.estrutura?.pt || casa.estrutura?.jp, '構造', { lang: casa.estrutura?.pt ? null : 'ja' })}
      ${linha('Estacionamento', casa.temEstacionamento === true ? (casa.vaga?.pt || 'Com vaga') + (casa.vaga?.mensalidade ? ` · ${formatarYen(casa.vaga.mensalidade)}/mês` : '') : casa.temEstacionamento === false ? 'Sem vaga' : null, '駐車場', { obrigatoria: true })}
      ${linha('Situação atual', traduzSituacao(casa.situacaoJp), '現況')}
      ${linha('Entrega', entregaTexto, '引渡し', { obrigatoria: true })}
    </tbody>
  </table>
</div>`;

  const localizacao = `
<div class="info-bloco" id="localizacao">
  <h2>Localização e transporte</h2>
  <table class="info-tabela"><tbody>
    ${casa.cidade ? `<tr><th scope="row">Cidade <span class="jp" lang="ja">(所在地)</span></th><td>${e([casa.cidade, casa.prefeitura].filter(Boolean).join(', '))}${casa.cidadeJp ? ` · <span lang="ja">${e(casa.cidadeJp)}</span>` : ''}</td></tr>` : ''}
    ${linha('Endereço do anúncio', casa.endereco, null, { obrigatoria: true, lang: 'ja' })}
    ${linha('Estação mais próxima', casa.acesso?.estacao, '最寄駅', { obrigatoria: true, lang: 'ja' })}
    ${linha('Linha', casa.acesso?.linha, null, { lang: 'ja' })}
    ${linha('A pé até a estação', casa.acesso?.minutosAPe ? `${casa.acesso.minutosAPe} minutos` : null, '徒歩', { obrigatoria: true })}
    ${linha('Distância', casa.acesso?.distanciaKm ? `${String(casa.acesso.distanciaKm).replace('.', ',')} km` : null)}
    ${casa.acesso?.jp && !casa.acesso?.estacao ? linha('Acesso (texto do anúncio)', casa.acesso.jp, null, { lang: 'ja' }) : ''}
  </tbody></table>
  <p class="estimativa-nota">Sem mapa: o anúncio de origem não traz coordenadas, e a Easy House não estima a posição. O endereço acima é o que a fonte publica.</p>
</div>`;

  const custos = `
<div class="info-bloco" id="custos">
  <h2>Preço e custos</h2>
  <table class="info-tabela"><tbody>
    <tr><th scope="row">Preço do imóvel <span class="jp" lang="ja">(価格)</span></th><td>${e(casa.precoFormatado)} (<span lang="ja">${e(casa.precoMan)}</span>)</td></tr>
    ${linha('Comissão de intermediação', casa.comissaoPct ? `${String(casa.comissaoPct).replace('.', ',')}%` : null, '仲介手数料', { obrigatoria: true })}
    ${linha('Reforma incluída no preço', casa.incluiReforma ? 'Sim' : null)}
  </tbody></table>
  ${est ? `
  <div class="estimativa-bloco">
    <p class="estimativa-linha">Estimativa mensal <b>${e(formatarYen(est.valor))}/mês</b></p>
    <p class="estimativa-nota">Premissas: ${e(est.produtoRotulo || 'Flat 35')}, ${e(est.taxaRotulo || `${(est.taxaAnual * 100).toFixed(2)}% ao ano`)}, ${est.prazoAnos} anos, entrada de ${Math.round((est.entradaPercentual || 0) * 100)}%, sobre o preço cheio do imóvel. Não inclui impostos, escritura, seguro nem taxas de registro (o anúncio não os informa). Estimativa educativa. Não é oferta nem aprovação. Condições dependem da análise de cada instituição.</p>
    <p class="estimativa-nota"><a href="/simular">Ajustar prazo e entrada no simulador</a> — sem informar renda ou dívidas.</p>
  </div>` : ''}
</div>`;

  const reforma = casa.reforma ? `
<div class="info-bloco">
  <h2>Reforma <span class="jp" lang="ja">(リフォーム)</span></h2>
  <p class="texto-livre" lang="ja">${e(casa.reforma)}</p>
  <p class="estimativa-nota">Texto original do anúncio, em japonês. Se quiser, explicamos em português pelo WhatsApp.</p>
</div>` : '';

  const semTraducao = casa.destaquesLista.filter((d) => !d.pt).length;
  const destaques = casa.destaquesLista.length ? `
<div class="info-bloco">
  <h2>Características</h2>
  <p class="etiquetas">${casa.destaquesLista.slice(0, 45).map((d) => d.pt
      ? `<span>${e(d.pt)} <span class="jp" lang="ja">${e(d.jp)}</span></span>`
      : `<span lang="ja">${e(d.jp)}</span>`).join('')}</p>
  ${semTraducao ? `<p class="estimativa-nota">${semTraducao} ${semTraducao === 1 ? 'item segue' : 'itens seguem'} em japonês por não ter tradução direta. É só perguntar.</p>` : ''}
</div>` : '';

  const obs = casa.observacoes ? `
<div class="info-bloco">
  <h2>Observações do anúncio <span class="jp" lang="ja">(備考)</span></h2>
  <p class="texto-livre" lang="ja">${e(casa.observacoes)}</p>
  <p class="estimativa-nota">Texto original do anúncio. Se algum ponto não ficou claro, pergunte — explicamos em português.</p>
</div>` : '';

  const legal = `
<div class="info-bloco" id="legal">
  <h2>Dados legais e da transação</h2>
  <table class="info-tabela"><tbody>
    ${linha('Direito sobre o terreno', casa.direitoTerreno?.pt || casa.direitoTerreno?.jp, '土地権利', { obrigatoria: true })}
    ${linha('Zoneamento', casa.usoTerreno?.pt || casa.usoTerreno?.jp, '用途地域', { obrigatoria: true })}
    ${linha('Forma da transação', casa.transacao?.pt || casa.transacao?.jp, '取引態様', { obrigatoria: true })}
    ${linha('Taxa de ocupação / aproveitamento', null, '建ぺい率 / 容積率', { obrigatoria: true })}
  </tbody></table>
  <p class="estimativa-nota"><strong>Glossário:</strong> <span lang="ja">所有権</span> = propriedade plena do terreno; <span lang="ja">売主</span> = a imobiliária anunciante é a própria vendedora; <span lang="ja">用途地域</span> = zoneamento urbano, define o que pode ser construído ao redor.</p>
</div>`;

  const fonte = `
<div class="info-bloco" id="fonte">
  <h2>Fonte e datas</h2>
  <table class="info-tabela"><tbody>
    ${linha('Fonte do anúncio', casa.fonteRotulo || casa.origem?.fonte, null, { obrigatoria: true })}
    ${linha('Última verificação na fonte', dataPt(casa.verificadoEm), null, { obrigatoria: true })}
    ${linha('Publicado neste site em', casa.criadoEm ? dataPt(casa.criadoEm) : null)}
    ${linha('Código do imóvel', casa.codigo)}
    ${linha('Fotos', casa.imagemEhFicha ? 'O anúncio não autoriza a publicação das fotos; a imagem é a ficha da Easy House' : `${casa.totalFotos} do anúncio original`)}
  </tbody></table>
  <p class="estimativa-nota">Disponibilidade, preço e condições são os que a fonte publicava na última verificação. Antes de qualquer decisão, a Easy House confirma diretamente com o anunciante.</p>
</div>`;

  const financiamento = `
<div class="info-bloco" id="financiamento">
  <h2>Posso financiar esta casa?</h2>
  <p class="texto-livre">Depende do banco e do perfil de cada pessoa — e cada banco avalia de um jeito. Não dá para saber pelo anúncio: dá para saber analisando o seu caso, sem compromisso. Nada nesta página é aprovação ou promessa de crédito.</p>
  <p class="btn-row" style="margin-top:14px">
    <a class="btn btn--ghost" href="/simular">Simular minha faixa de compra</a>
    <a class="btn btn--ghost" href="#contato">Perguntar sobre financiamento</a>
  </p>
</div>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Início', item: SITE },
          { '@type': 'ListItem', position: 2, name: 'Casas à venda', item: `${SITE}${LISTA}` },
          ...(casa.cidade ? [{ '@type': 'ListItem', position: 3, name: casa.cidade, item: `${SITE}${LISTA}?cidade=${encodeURIComponent(casa.cidade.toLowerCase())}` }] : []),
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
          seller: { '@type': 'RealEstateAgent', name: 'EASY HOUSE ｜株式会社movO', url: SITE }
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
    <li><a href="${LISTA}" id="voltarBusca" data-voltar-busca>Casas à venda</a></li>
    ${casa.cidade ? `<li><a href="${LISTA}?cidade=${encodeURIComponent(casa.cidade.toLowerCase())}">${e(casa.cidade)}</a></li>` : ''}
    <li aria-current="page">${e(casa.codigo)}</li>
  </ol>
</nav>

<main id="main" class="imovel"
      data-imovel="${e(casa.codigo)}" data-cidade="${e(casa.cidade || '')}"
      data-prefeitura="${e(casa.prefeitura || '')}" data-preco="${casa.preco}" data-fonte="${e(casa.origem?.fonte || '')}"
      data-fotos='${JSON.stringify(casa.fotos).replace(/'/g, '&#39;')}'>

  <div class="imovel__topo">
    <div>
      <h1 class="imovel__titulo">${e(casa.titulo)}</h1>
      <p class="imovel__local">${e(local)}${casa.cidadeJp ? ` <span lang="ja">${e(casa.cidadeJp)}</span>` : ''}</p>
      <p class="imovel__estado">
        ${casa.verificadoEm ? `<span class="imovel__verificado">Anúncio verificado em ${e(dataPt(casa.verificadoEm))}</span>` : ''}
        <span class="imovel__codigo">Código ${e(casa.codigo)}</span>
        <span class="imovel__fonte">Fonte: ${e(casa.fonteRotulo || casa.origem?.fonte || 'não informada')}</span>
      </p>
    </div>
    <div class="imovel__acoes">
      <button class="acao-redonda" type="button" data-favoritar="${e(casa.codigo)}" data-nome="${e(casa.titulo)}"
              aria-pressed="false" aria-label="Salvar ${e(casa.titulo)} nos favoritos">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
      </button>
      <button class="acao-redonda" type="button" data-comparar="${e(casa.codigo)}" aria-pressed="false" aria-label="Adicionar ${e(casa.titulo)} à comparação">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3H4v18h5M15 3h5v18h-5M9 12h6"/></svg>
      </button>
      <button class="acao-redonda" type="button" data-compartilhar aria-label="Compartilhar este imóvel">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>
      </button>
    </div>
  </div>

  ${galeria}

  <div class="imovel__grade">
    <div>
      <div class="preco-bloco">
        <p class="preco-bloco__valor">${e(casa.precoFormatado)}</p>
        <p class="preco-bloco__man"><span lang="ja">${e(casa.precoMan)}</span>${casa.incluiReforma ? ' · reforma incluída no preço' : ''}</p>
        ${est ? `
        <div class="preco-bloco__extra">
          <p class="estimativa-linha">Estimativa mensal <b>${e(formatarYen(est.valor))}/mês</b></p>
          <p class="estimativa-nota">${e(est.taxaRotulo || '')} · ${est.prazoAnos} anos · entrada ${Math.round((est.entradaPercentual || 0) * 100)}%. Estimativa educativa, não é oferta nem aprovação. <a href="#custos">Ver premissas</a></p>
        </div>` : ''}
      </div>

      ${resumo.length ? `<p class="imovel__resumo">${resumo.join(' · ').replace(/^./, (c) => c.toUpperCase())}.</p>` : ''}

      <p class="btn-row" id="contato">
        ${botaoWa(casa, 'duvida', 'topo', 'Perguntar sobre este imóvel')}
        ${botaoWa(casa, 'visita', 'topo_visita', 'Agendar uma visita', 'btn btn--ghost')}
      </p>
      <p class="estimativa-nota">Abre o WhatsApp da Easy House com o código ${e(casa.codigo)} já na mensagem. Nenhum dado seu é enviado antes de você escrever.</p>

      ${fatos}
      ${localizacao}
      ${custos}
      ${destaques}
      ${reforma}
      ${legal}
      ${obs}
      ${financiamento}
      ${fonte}
    </div>

    <aside class="imovel__lateral">
      <div class="wa-card">
        <h3>Interessado nesta casa?</h3>
        <p>Falamos português. A gente confirma disponibilidade, explica os custos e responde o que precisar.</p>
        ${botaoWa(casa, 'duvida', 'lateral', 'Perguntar sobre este imóvel')}
        ${botaoWa(casa, 'visita', 'lateral_visita', 'Agendar uma visita', 'btn btn--ghost')}
        <p class="wa-card__nota">EASY HOUSE ｜株式会社movO · imobiliária licenciada no Japão (<span lang="ja">沖縄県知事(1)第5984号</span>). Atendimento em português, espanhol, inglês e japonês.</p>
      </div>
    </aside>
  </div>
</main>

${parecidas.length ? `
<section class="relacionados" aria-labelledby="rel-t">
  <h2 id="rel-t">Casas parecidas</h2>
  <p>Escolhidas por regra fixa, entre os anúncios ativos: mesma cidade, mesma planta, preço próximo (até 15% ou 30% de diferença) e mesma estação pesam, nessa ordem. Nenhum destaque pago.</p>
  <div class="casa-grid">${parecidas.map((c) => Cartao.cartao(c, { titulo: 'h3' })).join('')}</div>
</section>` : ''}

<div class="wa-fixo" role="region" aria-label="Contato rápido">
  <div class="wa-fixo__preco"><b>${e(casa.precoFormatado)}</b><small lang="ja">${e(casa.precoMan)}</small></div>
  ${botaoWa(casa, 'duvida', 'barra_celular', 'Perguntar sobre este imóvel')}
</div>

<div class="comparar-bandeja" id="bandejaComparar" role="region" aria-label="Imóveis marcados para comparar" hidden>
  <p><strong id="bandejaN">0</strong> para comparar <span class="bandeja__dica">(até 3)</span></p>
  <a class="btn btn--gold btn--sm" id="bandejaIr" href="/comparar">Comparar</a>
  <button class="btn btn--ghost btn--sm" type="button" id="bandejaLimpar">Limpar</button>
</div>`;

  return documento({
    titulo, descricao, canonical: url,
    imagem: casa.fotos[0] || null,
    jsonLd, corpo, caminhoAtual: LISTA,
    classeBody: 'tem-barra-fixa',
    scripts: ['/casas-imovel.js?v=11'],
    preconnect: ['https://igtqdhesorahhdyvsjrl.supabase.co']
  });
}

/* ── Imóvel que saiu do ar ───────────────────────────────── */

function paginaIndisponivel(casa, parecidas, slug) {
  const url = `${SITE}${LISTA}/${casa ? casa.slug : slug}`;
  const onde = casa?.cidade ? ` em ${casa.cidade}` : '';
  const corpo = `
<main id="main">
  <div class="indisponivel">
    <p class="indisponivel__selo">Imóvel não disponível</p>
    <h1>Esta casa${e(onde)} não está mais disponível</h1>
    <p>Imóveis saem do ar quando são vendidos, reservados ou retirados pelo anunciante${casa?.verificadoEm ? ` — este foi visto na fonte pela última vez em ${e(dataPt(casa.verificadoEm))}` : ''}. Separamos outras opções parecidas, e se preferir a gente procura de acordo com o que você precisa.</p>
    <p class="btn-row" style="justify-content:center">
      <a class="btn btn--gold" href="${LISTA}" data-voltar-busca>Ver casas disponíveis</a>
      <a class="btn btn--wa" rel="nofollow" href="https://wa.me/${casasConfig.whatsapp.numero}?text=${encodeURIComponent(
        `Olá! Vi um imóvel no site da Easy House que já não está disponível${casa ? ` (${casa.codigo})` : ''}. Podem me ajudar a encontrar algo parecido?`)}"
        data-cta="indisponivel">${ICONE_WA} Procurar algo parecido</a>
    </p>
  </div>
  ${parecidas.length ? `
  <section class="relacionados" aria-labelledby="rel-t">
    <h2 id="rel-t">Casas disponíveis que podem servir</h2>
    <p>Escolhidas pela mesma cidade ou faixa de preço.</p>
    <div class="casa-grid">${parecidas.map((c) => Cartao.cartao(c, { titulo: 'h3' })).join('')}</div>
  </section>` : ''}
</main>`;

  return documento({
    titulo: `Imóvel não disponível${onde} | Easy House`,
    descricao: 'Este imóvel não está mais disponível. Veja outras casas à venda no Japão com atendimento em português pela Easy House.',
    canonical: url,
    robots: 'noindex, follow',       // sai do índice sem quebrar os links que apontam para cá
    corpo, caminhoAtual: LISTA, scripts: ['/casas-imovel.js?v=11']
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
      res.setHeader('Location', `${LISTA}/${casa.slug}`);
      return res.status(301).end();
    }

    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    return res.status(200).send(paginaImovel(casa, parecidas));
  } catch (err) {
    console.error('[api/casa]', slug, err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).send(documento({
      titulo: 'Não foi possível carregar o imóvel | Easy House',
      descricao: 'Tente novamente em instantes.',
      canonical: `${SITE}${LISTA}`, robots: 'noindex', caminhoAtual: LISTA,
      corpo: `<main id="main"><div class="indisponivel">
        <h1>Não conseguimos carregar este imóvel agora</h1>
        <p>Foi uma falha nossa, não sua. Tente de novo em alguns instantes.</p>
        <p class="btn-row" style="justify-content:center"><a class="btn btn--gold" href="${LISTA}">Ver casas à venda</a></p>
      </div></main>`
    }));
  }
}

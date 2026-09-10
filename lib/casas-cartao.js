/**
 * lib/casas-cartao.js — o card de imóvel, em UM lugar.
 *
 * Arquivo universal: roda no Node (página renderizada no servidor e testes)
 * e no navegador (casas-busca.js, favoritos, comparação). Sem isso o card do
 * HTML inicial e o card montado pelo JavaScript divergiam — e divergiam de
 * verdade: o da ficha não tinha coração, o da lista não tinha "ver detalhes".
 *
 * Regras do card (o que ele precisa responder: "vale a pena abrir?"):
 *   - foto real em 3:2, com dimensões reservadas (sem salto de layout);
 *   - no máximo dois selos, e só com regra real (created_at ≤ 14 dias; imagem é a ficha);
 *   - preço total em destaque; 万円 como secundário; estimativa mensal pequena e rotulada;
 *   - dado ausente é OMITIDO — nunca "0", "—" ou "NaN";
 *   - um link acessível por card ("Ver detalhes: <título>"); a foto também leva
 *     à ficha, mas fica fora da ordem de tabulação para não duplicar parada;
 *   - favoritar e comparar são botões separados, com nome e alvo de 44 px.
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  raiz.EHCartao = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function yen(v) {
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return '¥' + Math.round(v).toLocaleString('pt-BR');
  }

  function area(v) {
    if (typeof v !== 'number' || !isFinite(v) || v <= 0) return null;
    return v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' m²';
  }

  /** "2026-09-10" → "10/09" */
  function diaMes(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
    return iso.slice(8, 10) + '/' + iso.slice(5, 7);
  }

  var CORACAO = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
  var COMPARAR = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 3H4v18h5M15 3h5v18h-5M9 12h6"/></svg>';

  /**
   * @param {object} c    imóvel normalizado (lib/casas.mjs → normalizarCasa)
   * @param {object} o    opções: { favorito: bool, comparando: bool, prioridade: bool,
   *                                comparar: bool (mostrar botão), titulo: 'h2'|'h3', indisponivel: bool }
   */
  function cartao(c, o) {
    o = o || {};
    var tag = o.titulo === 'h3' ? 'h3' : 'h2';
    var href = '/comprar/imoveis/' + esc(c.slug);
    var foto = c.fotos && c.fotos[0];
    var titulo = c.titulo || 'Casa';

    // ── selos: no máximo dois, e só com regra real
    var selos = [];
    if (o.indisponivel) selos.push('<span class="selo selo--fora">Não disponível</span>');
    else if (c.novo) selos.push('<span class="selo selo--novo">Novo anúncio</span>');
    if (c.imagemEhFicha) selos.push('<span class="selo selo--ficha">Fotos sob consulta</span>');
    selos = selos.slice(0, 2);

    var altFoto = c.imagemEhFicha
      ? 'Ficha do imóvel ' + esc(c.codigo) + ' (o anúncio não libera as fotos para o site)'
      : 'Fachada ou ambiente da ' + esc(titulo).toLowerCase();

    // ── fatos: só o que existe
    var fatos = [];
    if (c.planta) fatos.push('<li><b>' + esc(c.planta) + '</b><span class="sr-only"> planta</span></li>');
    if (area(c.areaConstruida)) fatos.push('<li>' + esc(area(c.areaConstruida)) + ' <span class="fato__rotulo">construída</span></li>');
    if (area(c.areaTerreno)) fatos.push('<li>' + esc(area(c.areaTerreno)) + ' <span class="fato__rotulo">terreno</span></li>');
    if (c.temEstacionamento === true) fatos.push('<li>' + esc(c.vaga && c.vaga.vagas ? c.vaga.vagas + (c.vaga.vagas === 1 ? ' vaga' : ' vagas') : 'Com vaga') + '</li>');
    else if (c.temEstacionamento === false) fatos.push('<li>Sem vaga</li>');
    if (c.acesso && typeof c.acesso.minutosAPe === 'number' && c.acesso.minutosAPe > 0) {
      fatos.push('<li>' + c.acesso.minutosAPe + ' min a pé' + (c.acesso.estacao ? ' de <span lang="ja">' + esc(c.acesso.estacao) + '</span>' : ' da estação') + '</li>');
    } else if (c.acesso && c.acesso.estacao) {
      fatos.push('<li>Estação <span lang="ja">' + esc(c.acesso.estacao) + '</span></li>');
    }

    // ── situação e verificação
    var meta = [];
    if (c.construcaoNova === true) meta.push('Casa nova');
    else if (c.construcaoNova === false && c.ano && c.ano.ano) meta.push('Construída em ' + c.ano.ano);
    if (c.entregaClasse === 'imediata') meta.push('Entrega imediata');
    else if (c.entregaClasse === 'prevista') meta.push(c.entregaPrevista ? 'Entrega prevista para ' + c.entregaPrevista.replace('previsão: ', '') : 'Entrega prevista');
    else if (c.entregaClasse === 'combinar') meta.push('Entrega a combinar');
    if (diaMes(c.verificadoEm)) meta.push('Verificado em ' + diaMes(c.verificadoEm));

    var estimativa = c.estimativa && yen(c.estimativa.valor)
      ? '<p class="casa__mensal">≈ ' + esc(yen(c.estimativa.valor)) + '/mês <span class="est">estimativa, não é oferta</span></p>' : '';

    var acoes = ''
      + '<button class="acao acao--favoritar" type="button" data-favoritar="' + esc(c.codigo) + '"'
      + ' aria-pressed="' + (o.favorito ? 'true' : 'false') + '" aria-label="' + (o.favorito ? 'Remover ' : 'Salvar ') + esc(titulo) + (o.favorito ? ' dos favoritos' : ' nos favoritos') + '">'
      + CORACAO + '<span class="acao__txt">' + (o.favorito ? 'Salvo' : 'Salvar') + '</span></button>';
    if (o.comparar !== false) {
      acoes += '<button class="acao acao--comparar" type="button" data-comparar="' + esc(c.codigo) + '"'
        + ' aria-pressed="' + (o.comparando ? 'true' : 'false') + '" aria-label="' + (o.comparando ? 'Tirar ' : 'Adicionar ') + esc(titulo) + (o.comparando ? ' da comparação' : ' à comparação') + '">'
        + COMPARAR + '<span class="acao__txt">' + (o.comparando ? 'Comparando' : 'Comparar') + '</span></button>';
    }

    return '<article class="casa' + (o.indisponivel ? ' casa--fora' : '') + '" data-codigo="' + esc(c.codigo) + '">'
      + '<a class="casa__foto" href="' + href + '" tabindex="-1" aria-hidden="true">'
      + (foto
          ? '<img src="' + esc(foto) + '" alt="' + altFoto + '" width="600" height="400"'
            + (o.prioridade ? ' fetchpriority="high" decoding="async"' : ' loading="lazy" decoding="async"') + '>'
          : '<span class="vazio" aria-hidden="true">家</span>')
      + (c.totalFotos > 1 && !c.imagemEhFicha ? '<span class="casa__nfotos">' + c.totalFotos + ' fotos</span>' : '')
      + (selos.length ? '<span class="casa__selos">' + selos.join('') + '</span>' : '')
      + '</a>'
      + '<div class="casa__corpo">'
      + '<p class="casa__preco"><b>' + esc(yen(c.preco) || 'Preço sob consulta') + '</b>'
      + (c.precoMan ? '<small lang="ja">' + esc(c.precoMan) + '</small>' : '') + '</p>'
      + '<' + tag + ' class="casa__nome">' + esc(titulo)
      + (c.cidadeJp || c.prefeitura ? ' <span class="casa__onde">' + (c.cidadeJp ? '<span lang="ja">' + esc(c.cidadeJp) + '</span>' : '') + (c.prefeitura ? (c.cidadeJp ? ' · ' : '') + esc(c.prefeitura) : '') + '</span>' : '')
      + '</' + tag + '>'
      + (fatos.length ? '<ul class="casa__fatos">' + fatos.join('') + '</ul>' : '')
      + estimativa
      + (meta.length ? '<p class="casa__meta">' + meta.map(esc).join(' · ') + '</p>' : '')
      + '<div class="casa__acoes">' + acoes
      + '<a class="casa__ver" href="' + href + '" aria-label="Ver detalhes: ' + esc(titulo) + '">Ver detalhes<span aria-hidden="true"> →</span></a>'
      + '</div>'
      + '</div></article>';
  }

  /** Card para um favorito que saiu do ar: só o código é conhecido. */
  function cartaoSumido(codigo) {
    return '<article class="casa casa--fora" data-codigo="' + esc(codigo) + '">'
      + '<div class="casa__foto casa__foto--vazio"><span class="vazio" aria-hidden="true">家</span>'
      + '<span class="casa__selos"><span class="selo selo--fora">Não disponível</span></span></div>'
      + '<div class="casa__corpo">'
      + '<h2 class="casa__nome">Este imóvel saiu do site</h2>'
      + '<p class="casa__onde">Código ' + esc(codigo) + '</p>'
      + '<p class="casa__meta">Imóveis saem quando são vendidos, reservados ou retirados pelo anunciante.</p>'
      + '<div class="casa__acoes">'
      + '<button class="acao acao--favoritar" type="button" data-favoritar="' + esc(codigo) + '" aria-pressed="true" aria-label="Remover ' + esc(codigo) + ' dos favoritos">'
      + CORACAO + '<span class="acao__txt">Salvo</span></button></div>'
      + '</div></article>';
  }

  function esqueleto(n) {
    var html = '';
    for (var i = 0; i < (n || 6); i++) {
      html += '<div class="esq" aria-hidden="true"><div class="esq__foto"></div><div class="esq__linha esq__linha--curta"></div>'
            + '<div class="esq__linha"></div><div class="esq__linha esq__linha--curta"></div></div>';
    }
    return html;
  }

  return { cartao: cartao, cartaoSumido: cartaoSumido, esqueleto: esqueleto, esc: esc, yen: yen, area: area, diaMes: diaMes };
});

/**
 * lib/aluguel-cartao.js — o card do apartamento de aluguel, em UM lugar.
 *
 * Arquivo universal: roda no Node (página renderizada no servidor e testes)
 * e no navegador (aluguel-busca.js). O card do HTML inicial e o card montado
 * pelo JavaScript saem da mesma função — nunca divergem.
 *
 * O que o card precisa responder: "cabe no meu bolso e vale a pena chamar?"
 *   - aluguel em destaque, condomínio ao lado (o portal separa os dois);
 *   - custo mensal TOTAL e entrada estimada — o que a pessoa realmente
 *     paga — com o link "o que está incluso" abrindo o detalhamento;
 *   - foto do prédio e planta na mesma moldura, alternáveis;
 *   - um selo no máximo, só com dado real (pet conferido). "Sem taxa ao
 *     proprietário" já aparece no filtro e na entrada; no card só poluía;
 *   - dado ausente é OMITIDO — nunca "0", "—" ou "NaN";
 *   - WhatsApp com a mensagem já escrita é a ação principal; o portal e o
 *     mapa são secundários. Não há ficha própria: o detalhe é a página do
 *     portal (quando o anúncio tem URL pública).
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  raiz.EHCartaoAluguel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var WHATSAPP = '818028867708';

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

  /** Mensagem do WhatsApp com o imóvel já descrito. */
  function mensagem(a) {
    var linhas = ['Olá! Tenho interesse no apartamento "' + (a.titulo || '') + '"'
      + (a.cidade ? ' em ' + a.cidade : '') + (a.planta ? ' (' + a.planta + ')' : '') + '.'];
    if (yen(a.aluguel)) linhas.push('Aluguel: ' + yen(a.aluguel) + '/mês.');
    linhas.push('Código ' + a.codigo + '. Pode me passar mais informações?');
    return linhas.join('\n');
  }

  function linkWhatsApp(a, cta) {
    return 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(mensagem(a));
  }

  var ICONE_WA = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="16" height="16"><path d="M12 2C6.5 2 2 6.5 2 12c0 1.7.5 3.4 1.3 4.9L2 22l5.3-1.3c1.4.8 3 1.3 4.7 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2z"/></svg>';

  /**
   * @param {object} a  apartamento normalizado (lib/aluguel.mjs → normalizarAluguel)
   * @param {object} o  opções: { prioridade: bool, titulo: 'h2'|'h3' }
   */
  function cartao(a, o) {
    o = o || {};
    var tag = o.titulo === 'h3' ? 'h3' : 'h2';
    var titulo = a.titulo || 'Apartamento';
    var duas = !!(a.fotoUrl && a.fotoPlanta);

    // ── selo: só com dado real (pet conferido na página de detalhe)
    var selos = [];
    if (a.pet === true) selos.push('<span class="selo selo--pet">Aceita pet</span>');

    var altFoto = 'Fachada de ' + esc(titulo);
    var altPlanta = 'Planta ' + (a.planta ? esc(a.planta) + ' ' : '') + 'de ' + esc(titulo);
    var carregar = o.prioridade ? ' fetchpriority="high" decoding="async"' : ' loading="lazy" decoding="async"';

    var midia = '<div class="casa__foto alu__midia" data-slide="0">';
    if (a.fotoUrl) midia += '<img class="alu__img alu__img--foto" src="' + esc(a.fotoUrl) + '" alt="' + altFoto + '" width="600" height="375"' + carregar + '>';
    if (a.fotoPlanta) midia += '<img class="alu__img alu__img--planta" src="' + esc(a.fotoPlanta) + '" alt="' + altPlanta + '" width="600" height="375" loading="lazy" decoding="async"' + (a.fotoUrl ? ' hidden' : '') + '>';
    if (!a.fotoUrl && !a.fotoPlanta) midia += '<span class="vazio" aria-hidden="true">家</span>';
    if (duas) {
      midia += '<div class="alu__troca" role="group" aria-label="Foto ou planta">'
        + '<button type="button" class="alu__dot" data-slide-ir="0" aria-pressed="true">Foto</button>'
        + '<button type="button" class="alu__dot" data-slide-ir="1" aria-pressed="false" lang="ja">間取り</button></div>';
    }
    if (selos.length) midia += '<span class="casa__selos">' + selos.join('') + '</span>';
    midia += '</div>';

    // ── fatos: só o que existe
    var fatos = [];
    if (a.planta) fatos.push('<li><b>' + esc(a.planta) + '</b><span class="sr-only"> planta</span></li>');
    if (area(a.area)) fatos.push('<li>' + esc(area(a.area)) + '</li>');
    var ac = a.acesso || {};
    if (ac.onibus) {
      fatos.push('<li>Ônibus' + (ac.minutosOnibus ? ' ' + ac.minutosOnibus + ' min' : '') + (ac.estacao ? ' até <span lang="ja">' + esc(ac.estacao) + '</span>' : '') + '</li>');
    } else if (typeof ac.minutosAPe === 'number' && ac.minutosAPe > 0) {
      fatos.push('<li>' + ac.minutosAPe + ' min a pé' + (ac.estacao ? ' de <span lang="ja">' + esc(ac.estacao) + '</span>' : ' da estação') + '</li>');
    } else if (ac.estacao) {
      fatos.push('<li>Estação <span lang="ja">' + esc(ac.estacao) + '</span></li>');
    }
    if (a.vaga) fatos.push('<li>Vaga ' + esc(yen(a.vaga)) + '/mês</li>');
    else if (a.temVaga) fatos.push('<li>Com vaga</li>');

    // ── situação e verificação
    var meta = [];
    if (a.disponibilidade && a.disponibilidade.texto) meta.push(a.disponibilidade.texto);
    if (a.internet === true) meta.push('Internet inclusa');
    if (diaMes(a.verificadoEm)) meta.push('Verificado em ' + diaMes(a.verificadoEm));

    var custos = '';
    if (yen(a.mensal) || yen(a.entrada)) {
      custos = '<dl class="alu__custos">'
        + (yen(a.mensal) ? '<div><dt>Custo mensal</dt><dd>' + esc(yen(a.mensal)) + '</dd></div>' : '')
        + (yen(a.entrada) ? '<div><dt>Entrada estimada</dt><dd>' + esc(yen(a.entrada)) + '</dd></div>' : '')
        + '</dl>'
        + '<a class="alu__incluso" href="/custo-inicial-aluguel-japao" data-custos="' + esc(a.codigo) + '" aria-label="Ver o que está incluso no custo de ' + esc(titulo) + '">Ver o que está incluso</a>';
    }

    var acoes = '<a class="btn btn--wa btn--sm alu__wa" href="' + esc(linkWhatsApp(a)) + '" target="_blank" rel="noopener" data-cta="card_aluguel" data-imovel="' + esc(a.codigo) + '">' + ICONE_WA + ' Quero informações</a>';
    var secundarias = '';
    if (a.dkUrl) secundarias += '<a class="alu__sec alu__sec--ficha" href="' + esc(a.dkUrl) + '" target="_blank" rel="noopener" aria-label="Mais detalhes de ' + esc(titulo) + ': ficha completa no portal (abre em outra aba)">Mais detalhes do apartamento <span aria-hidden="true">↗</span></a>';
    if (a.endereco) secundarias += '<a class="alu__sec" href="https://www.google.com/maps/search/' + encodeURIComponent(a.endereco) + '" target="_blank" rel="noopener" aria-label="Ver ' + esc(titulo) + ' no mapa">Mapa</a>';
    if (secundarias) acoes += '<div class="alu__sec-row">' + secundarias + '</div>';

    return '<article class="casa alu" data-codigo="' + esc(a.codigo) + '">'
      + midia
      + '<div class="casa__corpo">'
      + '<p class="casa__preco"><b>' + esc(yen(a.aluguel) || 'Aluguel sob consulta') + '</b>'
      + (yen(a.aluguel) ? '<small>/mês</small>' : '')
      + (yen(a.condominio) ? '<span class="alu__cond">+ ' + esc(yen(a.condominio)) + ' condomínio</span>' : '') + '</p>'
      + '<' + tag + ' class="casa__nome"><span lang="ja">' + esc(titulo) + '</span>'
      + (a.cidade || a.cidadeJp ? ' <span class="casa__onde">' + esc(a.cidade || '') + (a.cidadeJp ? ' · <span lang="ja">' + esc(a.cidadeJp) + '</span>' : '') + '</span>' : '')
      + '</' + tag + '>'
      + (fatos.length ? '<ul class="casa__fatos">' + fatos.join('') + '</ul>' : '')
      + custos
      + (meta.length ? '<p class="casa__meta">' + meta.map(esc).join(' · ') + '</p>' : '')
      + '<div class="casa__acoes alu__acoes">' + acoes + '</div>'
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

  return { cartao: cartao, esqueleto: esqueleto, esc: esc, yen: yen, area: area, diaMes: diaMes, mensagem: mensagem, linkWhatsApp: linkWhatsApp, WHATSAPP: WHATSAPP };
});

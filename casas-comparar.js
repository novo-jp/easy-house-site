/**
 * casas-comparar.js — até três casas lado a lado.
 *
 * Os códigos vêm da URL (?ids=EH-1,EH-2 — compartilhável) ou do localStorage
 * (o que a pessoa marcou "Comparar"). Os dados vêm de UMA consulta à API
 * (`codigos=`), nunca do acervo inteiro. Sem cadastro.
 *
 * Diferenças são marcadas com ◆ + negrito, além de cor. Ausência é dita
 * ("não informado"), não escondida — e não vira "melhor" nem "pior".
 */
(function () {
  'use strict';

  var EH = window.EHCasas || {};
  var Cartao = window.EHCartao;
  var caixa = document.getElementById('tabelaComparar');
  if (!caixa || !Cartao) return;
  var esc = Cartao.esc, yen = Cartao.yen, area = Cartao.area;
  var MAX = 3;

  function codigosIniciais() {
    var p = new URLSearchParams(location.search);
    var ids = (p.get('ids') || '').split(',').map(function (s) { return s.trim().toUpperCase(); }).filter(function (s) { return /^EH-[A-Z0-9]{3,12}$/.test(s); });
    if (!ids.length && EH.lerComparacao) ids = EH.lerComparacao();
    return ids.slice(0, MAX);
  }

  function dataPt(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : null; }
  var AUS = '<span class="ausente">não informado</span>';

  /** Cada linha: rótulo, termo japonês, extrator → { txt, num } (num para "melhor"). */
  var LINHAS = [
    { r: 'Preço', jp: '価格', f: function (c) { return { txt: c.precoFormatado + (c.precoMan ? ' <span class="jp" lang="ja">' + esc(c.precoMan) + '</span>' : ''), num: c.preco, melhor: 'menor' }; } },
    { r: 'Estimativa mensal', f: function (c) { return c.estimativa ? { txt: '≈ ' + esc(yen(c.estimativa.valor)) + '/mês <span class="jp">estimativa, não é oferta</span>', num: c.estimativa.valor, melhor: 'menor' } : null; } },
    { r: 'Cidade', jp: '所在地', f: function (c) { return { txt: esc([c.cidade, c.prefeitura].filter(Boolean).join(', ')) + (c.cidadeJp ? ' <span class="jp" lang="ja">' + esc(c.cidadeJp) + '</span>' : '') }; } },
    { r: 'Planta', jp: '間取り', f: function (c) { return c.planta ? { txt: '<span lang="ja">' + esc(c.planta) + '</span>' } : null; } },
    { r: 'Área construída', jp: '建物面積', f: function (c) { return area(c.areaConstruida) ? { txt: esc(area(c.areaConstruida)), num: c.areaConstruida, melhor: 'maior' } : null; } },
    { r: 'Terreno', jp: '土地面積', f: function (c) { return area(c.areaTerreno) ? { txt: esc(area(c.areaTerreno)), num: c.areaTerreno, melhor: 'maior' } : null; } },
    { r: 'Construção', jp: '築年月', f: function (c) { return c.ano && c.ano.ano ? { txt: c.ano.ano + (c.idade !== null && c.idade !== undefined ? ' <span class="jp">' + (c.idade === 0 ? 'este ano' : c.idade + ' anos') + '</span>' : ''), num: c.ano.ano, melhor: 'maior' } : null; } },
    { r: 'Estado', f: function (c) { return c.construcaoNova === true ? { txt: 'Nova' } : c.construcaoNova === false ? { txt: 'Usada' } : null; } },
    { r: 'Estacionamento', jp: '駐車場', f: function (c) { return c.temEstacionamento === true ? { txt: esc(c.vaga && c.vaga.pt || 'Com vaga') } : c.temEstacionamento === false ? { txt: 'Sem vaga' } : null; } },
    { r: 'Estação', jp: '最寄駅', f: function (c) { return c.acesso && c.acesso.estacao ? { txt: '<span lang="ja">' + esc(c.acesso.estacao) + '</span>' + (c.acesso.linha ? ' <span class="jp" lang="ja">' + esc(c.acesso.linha) + '</span>' : '') } : null; } },
    { r: 'A pé até a estação', jp: '徒歩', f: function (c) { return c.acesso && c.acesso.minutosAPe ? { txt: c.acesso.minutosAPe + ' min', num: c.acesso.minutosAPe, melhor: 'menor' } : null; } },
    { r: 'Entrega', jp: '引渡し', f: function (c) { return c.entregaClasse ? { txt: { imediata: 'Imediata', prevista: 'Prevista' + (c.entregaPrevista ? ' — ' + esc(c.entregaPrevista.replace('previsão: ', '')) : ''), combinar: 'A combinar' }[c.entregaClasse] } : null; } },
    { r: 'Fotos', f: function (c) { return { txt: c.imagemEhFicha ? 'Sob consulta (anúncio não libera)' : c.totalFotos + (c.totalFotos === 1 ? ' foto' : ' fotos') }; } },
    { r: 'Verificado na fonte em', f: function (c) { return c.verificadoEm ? { txt: esc(dataPt(c.verificadoEm)) } : null; } },
    { r: 'Código', f: function (c) { return { txt: esc(c.codigo) }; } }
  ];

  function tabela(casas) {
    var head = '<tr><th scope="col"><span class="sr-only">Campo</span></th>' + casas.map(function (c) {
      return '<th scope="col" class="comparar__cabecalho">'
        + (c.fotos && c.fotos[0] ? '<img class="comparar__foto" src="' + esc(c.fotos[0]) + '" alt="' + (c.imagemEhFicha ? 'Ficha do imóvel ' + esc(c.codigo) : 'Foto da ' + esc(c.titulo).toLowerCase()) + '" width="300" height="200" loading="lazy">' : '')
        + '<a href="/comprar/imoveis/' + esc(c.slug) + '">' + esc(c.titulo) + '</a>'
        + '<button class="comparar__remover" type="button" data-remover-comparacao="' + esc(c.codigo) + '" aria-label="Tirar ' + esc(c.titulo) + ' da comparação">Tirar da comparação</button></th>';
    }).join('') + '</tr>';

    var linhas = LINHAS.map(function (L) {
      var vals = casas.map(function (c) { return L.f(c); });
      var txts = vals.map(function (v) { return v ? v.txt : null; });
      var presentes = txts.filter(function (t) { return t !== null; });
      var difere = presentes.length > 1 && new Set(presentes).size > 1;
      var nums = vals.map(function (v) { return v && typeof v.num === 'number' ? v.num : null; }).filter(function (n) { return n !== null; });
      var alvo = null;
      if (difere && nums.length > 1 && vals.some(function (v) { return v && v.melhor; })) {
        var melhor = vals.filter(Boolean)[0].melhor;
        alvo = melhor === 'menor' ? Math.min.apply(null, nums) : Math.max.apply(null, nums);
      }
      return '<tr><th scope="row">' + esc(L.r) + (L.jp ? ' <span class="jp" lang="ja">' + esc(L.jp) + '</span>' : '') + '</th>'
        + vals.map(function (v) {
          if (!v) return '<td>' + AUS + '</td>';
          var eMelhor = alvo !== null && v.num === alvo;
          return '<td class="' + (difere ? 'difere' : '') + (eMelhor ? ' melhor' : '') + '">' + v.txt
            + (eMelhor ? ' <span class="sr-only">(' + (vals.filter(Boolean)[0].melhor === 'menor' ? 'menor' : 'maior') + ' entre os comparados)</span>' : '') + '</td>';
        }).join('') + '</tr>';
    }).join('');

    var acoes = '<tr><th scope="row">Perguntar</th>' + casas.map(function (c) {
      var msg = 'Olá! Estou comparando imóveis no site da Easy House e gostaria de saber mais sobre este:\n\nImóvel: ' + c.titulo + '\nCódigo: ' + c.codigo + (c.precoFormatado ? '\nValor: ' + c.precoFormatado : '') + '\nLink: https://easyhouse.homes/comprar/imoveis/' + c.slug;
      return '<td><a class="btn btn--wa btn--sm" rel="nofollow" data-cta="comparar" data-imovel="' + esc(c.codigo) + '" href="https://wa.me/' + EH.whatsapp + '?text=' + encodeURIComponent(msg) + '">Perguntar sobre ' + esc(c.codigo) + '</a></td>';
    }).join('') + '</tr>';

    return '<table class="comparar__tabela"><caption class="sr-only">Comparação de ' + casas.length + ' imóveis</caption><thead>' + head + '</thead><tbody>' + linhas + acoes + '</tbody></table>';
  }

  function vazio(msg) {
    caixa.removeAttribute('aria-busy');
    caixa.innerHTML = '<div class="aviso-vazio" role="status"><h2>' + msg + '</h2>'
      + '<p>Na busca, toque em “Comparar” em até três casas. A comparação fica neste navegador, sem cadastro.</p>'
      + '<p class="btn-row" style="justify-content:center"><a class="btn btn--gold" href="/comprar/imoveis">Ver casas à venda</a></p></div>';
  }

  var ctrl = null;
  async function carregar() {
    var ids = codigosIniciais();
    if (!ids.length) return vazio('Nenhum imóvel para comparar');
    if (ids.length === 1) { /* segue: mostra um, e diz que falta outro */ }
    caixa.setAttribute('aria-busy', 'true');
    if (ctrl) ctrl.abort(); ctrl = new AbortController();
    try {
      var r = await fetch('/api/casas?codigos=' + encodeURIComponent(ids.join(',')) + '&porPagina=' + MAX, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var d = await r.json();
      var porCodigo = {}; d.itens.forEach(function (c) { porCodigo[c.codigo] = c; });
      var casas = ids.map(function (i) { return porCodigo[i]; }).filter(Boolean);
      var sumidos = ids.filter(function (i) { return !porCodigo[i]; });
      if (!casas.length) return vazio('Estes imóveis já não estão no site');
      caixa.innerHTML = tabela(casas)
        + (sumidos.length ? '<p class="estimativa-nota" role="status">' + sumidos.length + ' dos imóveis marcados (' + sumidos.map(esc).join(', ') + ') já saiu do site e ficou de fora.</p>' : '')
        + (casas.length < 2 ? '<p class="estimativa-nota">Marque pelo menos mais um imóvel na busca para ver as diferenças.</p>' : '');
      caixa.removeAttribute('aria-busy');
      // URL compartilhável: só códigos públicos
      var url = '/comparar?ids=' + encodeURIComponent(casas.map(function (c) { return c.codigo; }).join(','));
      history.replaceState(null, '', url);
      EH.medir('property_compare_view', { total: casas.length });
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      caixa.removeAttribute('aria-busy');
      caixa.innerHTML = '<div class="aviso-vazio" role="alert"><h2>Não conseguimos carregar a comparação</h2><p>Tente de novo em instantes.</p>'
        + '<p class="btn-row" style="justify-content:center"><button class="btn btn--gold" type="button" id="tentarDeNovo">Tentar de novo</button></p></div>';
      document.getElementById('tentarDeNovo').addEventListener('click', carregar);
    }
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-remover-comparacao]');
    if (!b) return;
    var cod = b.getAttribute('data-remover-comparacao');
    var lista = codigosIniciais().filter(function (c) { return c !== cod; });
    if (EH.lerComparacao && EH.lerComparacao().indexOf(cod) !== -1) EH.alternarComparacao(cod);
    history.replaceState(null, '', '/comparar' + (lista.length ? '?ids=' + encodeURIComponent(lista.join(',')) : ''));
    carregar();
  });

  var copiar = document.getElementById('copiarComparacao');
  if (copiar) copiar.addEventListener('click', async function () {
    try { await navigator.clipboard.writeText(location.href); copiar.textContent = 'Link copiado'; }
    catch (e) { copiar.textContent = 'Copie o endereço da barra do navegador'; }
    setTimeout(function () { copiar.textContent = 'Copiar link desta comparação'; }, 2500);
  });

  try {
    var ultima = sessionStorage.getItem('eh_ultima_busca');
    if (ultima && /^\/comprar\/imoveis(\?|$)/.test(ultima)) document.getElementById('voltarBusca').href = ultima;
  } catch (e) {}

  carregar();
})();

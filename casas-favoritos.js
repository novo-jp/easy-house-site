/**
 * casas-favoritos.js — a lista de imóveis que a pessoa salvou.
 *
 * Os favoritos são só códigos no localStorage; os dados vêm da API na hora
 * de mostrar. Assim um imóvel salvo há semanas aparece com o preço de hoje —
 * e, se saiu do ar, aparece marcado em vez de sumir sem explicação.
 *
 * Uma consulta só: `/api/casas?codigos=EH-1,EH-2` devolve apenas os pedidos
 * (máx. 50). Antes esta página baixava o acervo inteiro em 17 chamadas para
 * filtrar no navegador.
 */
(function () {
  'use strict';

  var EH = window.EHCasas || {};
  var Cartao = window.EHCartao;
  var grade = document.getElementById('resultados');
  var elContagem = document.getElementById('contagem');
  var botaoEnviar = document.getElementById('enviarFavoritos');
  if (!grade || !Cartao) return;

  function vazio() {
    grade.removeAttribute('aria-busy');
    grade.innerHTML = '';
    var antigo = document.querySelector('.aviso-vazio'); if (antigo) antigo.remove();
    grade.insertAdjacentHTML('afterend',
      '<div class="aviso-vazio" role="status"><h2>Você ainda não salvou nenhum imóvel</h2>'
      + '<p>Toque em “Salvar” em qualquer casa para guardá-la aqui e comparar com calma depois. Fica só neste navegador, sem cadastro.</p>'
      + '<p class="btn-row" style="justify-content:center">'
      + '<a class="btn btn--gold" href="/comprar/imoveis">Ver casas à venda</a></p></div>');
    if (botaoEnviar) botaoEnviar.hidden = true;
    elContagem.innerHTML = '<strong>0</strong> imóveis salvos';
  }

  function montarEnvio(casas) {
    if (!botaoEnviar) return;
    if (!casas.length) { botaoEnviar.hidden = true; return; }
    var linhas = casas.map(function (c) {
      return '• ' + c.codigo + ' — ' + c.titulo + (c.precoFormatado ? ' (' + c.precoFormatado + ')' : '');
    });
    var texto = 'Olá! Separei estes imóveis no site da Easy House e gostaria de saber quais seriam melhores para o meu perfil:\n\n'
              + linhas.join('\n') + '\n\nPodem me ajudar a comparar?';
    botaoEnviar.href = 'https://wa.me/' + EH.whatsapp + '?text=' + encodeURIComponent(texto);
    botaoEnviar.hidden = false;
  }

  var ctrl = null;

  async function carregar() {
    var codigos = EH.lerFavoritos();
    if (!codigos.length) return vazio();
    var antigo = document.querySelector('.aviso-vazio'); if (antigo) antigo.remove();
    grade.setAttribute('aria-busy', 'true');
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();

    try {
      var r = await fetch('/api/casas?codigos=' + encodeURIComponent(codigos.slice(0, 50).join(',')) + '&porPagina=48',
        { headers: { Accept: 'application/json' }, signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var dados = await r.json();

      var porCodigo = {};
      dados.itens.forEach(function (c) { porCodigo[c.codigo] = c; });
      var achadas = [], sumidas = [];
      codigos.forEach(function (cod) { if (porCodigo[cod]) achadas.push(porCodigo[cod]); else sumidas.push(cod); });

      var comp = EH.lerComparacao ? EH.lerComparacao() : [];
      grade.innerHTML = achadas.map(function (c) {
        return Cartao.cartao(c, { favorito: true, comparando: comp.indexOf(c.codigo) !== -1 });
      }).join('') + sumidas.map(Cartao.cartaoSumido).join('');
      grade.removeAttribute('aria-busy');

      elContagem.innerHTML = '<strong>' + codigos.length + '</strong> '
        + (codigos.length === 1 ? 'imóvel salvo' : 'imóveis salvos')
        + (sumidas.length ? ' <span class="barra__de">· ' + sumidas.length + ' já ' + (sumidas.length === 1 ? 'saiu' : 'saíram') + ' do site</span>' : '')
        + (codigos.length > 50 ? ' <span class="barra__de">· mostrando os 50 primeiros</span>' : '');

      EH.ligarFavoritos(document);
      if (EH.ligarComparacao) EH.ligarComparacao(document);
      montarEnvio(achadas);
      EH.medir('favorites_view', { total: codigos.length, disponiveis: achadas.length });
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      grade.removeAttribute('aria-busy');
      grade.innerHTML = '<div class="aviso-vazio" role="alert"><h2>Não conseguimos carregar seus favoritos agora</h2>'
        + '<p>Eles continuam salvos neste navegador. Tente de novo em instantes.</p>'
        + '<p class="btn-row" style="justify-content:center"><button class="btn btn--gold" type="button" id="tentarDeNovo">Tentar de novo</button></p></div>';
      var b = document.getElementById('tentarDeNovo'); if (b) b.addEventListener('click', carregar);
    }
  }

  // Remover um favorito aqui só tira o card — não recarrega a lista inteira.
  window.addEventListener('favoritos:mudou', function (ev) {
    var d = ev.detail || {};
    if (d.ativo === false) {
      var card = grade.querySelector('.casa[data-codigo="' + d.codigo + '"]');
      if (card) card.remove();
      if (!EH.lerFavoritos().length) return vazio();
      elContagem.innerHTML = '<strong>' + EH.lerFavoritos().length + '</strong> ' + (EH.lerFavoritos().length === 1 ? 'imóvel salvo' : 'imóveis salvos');
      return;
    }
    carregar();
  });
  carregar();
})();

/**
 * casas-favoritos.js — a lista de imóveis que a pessoa salvou.
 *
 * Os favoritos são só códigos no localStorage; os dados vêm da API na hora
 * de mostrar. Assim um imóvel salvo há semanas aparece com o preço de hoje —
 * e, se saiu do ar, aparece marcado em vez de sumir sem explicação.
 */
(function () {
  'use strict';

  var EH = window.EHCasas || {};
  var grade = document.getElementById('resultados');
  var elContagem = document.getElementById('contagem');
  var botaoEnviar = document.getElementById('enviarFavoritos');
  if (!grade) return;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function vazio() {
    grade.removeAttribute('aria-busy');
    grade.innerHTML = '';
    grade.insertAdjacentHTML('afterend',
      '<div class="aviso-vazio"><h2>Você ainda não salvou nenhum imóvel</h2>'
      + '<p>Toque no coração de qualquer casa para guardá-la aqui e comparar com calma depois.</p>'
      + '<p class="btn-row" style="justify-content:center">'
      + '<a class="btn btn--gold" href="/comprar/imoveis">Ver casas à venda</a></p></div>');
    if (botaoEnviar) botaoEnviar.hidden = true;
    elContagem.innerHTML = '<strong>0</strong> imóveis salvos';
  }

  function cartao(c, indisponivel) {
    var specs = [];
    if (c.planta) specs.push('<span class="destaque">' + esc(c.planta) + '</span>');
    if (c.areaConstruida) specs.push('<span>' + Number(c.areaConstruida).toLocaleString('pt-BR') + ' m²</span>');
    if (c.vaga && c.vaga.pt) specs.push('<span>' + esc(c.vaga.pt) + '</span>');
    return '<article class="casa">'
      + '<div class="casa__foto">'
      + (c.fotos && c.fotos[0]
          ? '<img src="' + esc(c.fotos[0]) + '" alt="Foto de ' + esc(c.titulo) + '" loading="lazy" decoding="async" width="400" height="300">'
          : '<div class="vazio" aria-hidden="true">家</div>')
      + '<div class="casa__selos">' + (indisponivel ? '<span class="selo">Não disponível</span>' : '') + '</div>'
      + '<button class="coracao" type="button" data-favoritar="' + esc(c.codigo) + '" aria-pressed="true" aria-label="Remover dos favoritos">'
      + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"/></svg></button>'
      + '</div><div class="casa__corpo">'
      + '<p class="casa__onde">' + esc([c.cidade, c.prefeitura].filter(Boolean).join(', ')) + '</p>'
      + '<h2 class="casa__nome"><a href="/comprar/imoveis/' + esc(c.slug) + '">' + esc(c.titulo) + '</a></h2>'
      + '<p class="casa__preco"><b>' + esc(c.precoFormatado) + '</b></p>'
      + (c.estimativa ? '<p class="casa__mensal"><b>' + esc(EH.formatarYen(c.estimativa.valor)) + '/mês</b><span class="est">estimado</span></p>' : '')
      + '<p class="casa__specs">' + specs.join('') + '</p></div></article>';
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

  async function carregar() {
    var codigos = EH.lerFavoritos();
    if (!codigos.length) return vazio();

    var antigo = document.querySelector('.aviso-vazio');
    if (antigo) antigo.remove();

    try {
      // O acervo é pequeno: uma chamada traz tudo e casamos pelos códigos.
      var r = await fetch('/api/casas?porPagina=48&pagina=1');
      var dados = await r.json();
      var todas = dados.itens.slice();
      for (var p = 2; p <= dados.totalPaginas; p++) {
        var rp = await fetch('/api/casas?porPagina=48&pagina=' + p);
        todas = todas.concat((await rp.json()).itens);
      }

      var porCodigo = {};
      todas.forEach(function (c) { porCodigo[c.codigo] = c; });

      var achadas = [], sumidas = [];
      codigos.forEach(function (cod) {
        if (porCodigo[cod]) achadas.push(porCodigo[cod]); else sumidas.push(cod);
      });

      grade.removeAttribute('aria-busy');
      elContagem.innerHTML = '<strong>' + codigos.length + '</strong> '
        + (codigos.length === 1 ? 'imóvel salvo' : 'imóveis salvos')
        + (sumidas.length ? ' · ' + sumidas.length + ' não disponível(is)' : '');

      grade.innerHTML = achadas.map(function (c) { return cartao(c, false); }).join('')
        + sumidas.map(function (cod) {
            return '<article class="casa"><div class="casa__foto"><div class="vazio" aria-hidden="true">家</div>'
              + '<div class="casa__selos"><span class="selo">Não disponível</span></div>'
              + '<button class="coracao" type="button" data-favoritar="' + esc(cod) + '" aria-pressed="true" aria-label="Remover dos favoritos">'
              + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"/></svg></button>'
              + '</div><div class="casa__corpo"><p class="casa__onde">Imóvel ' + esc(cod) + '</p>'
              + '<h2 class="casa__nome">Este imóvel não está mais disponível</h2>'
              + '<p class="casa__specs"><span>Saiu do site</span></p></div></article>';
          }).join('');

      EH.ligarFavoritos(document);
      montarEnvio(achadas);
      EH.medir('favorites_view', { total: codigos.length, disponiveis: achadas.length });
    } catch (e) {
      grade.removeAttribute('aria-busy');
      grade.innerHTML = '<div class="aviso-vazio"><h2>Não conseguimos carregar seus favoritos agora</h2>'
        + '<p>Eles continuam salvos. Tente de novo em instantes.</p></div>';
    }
  }

  window.addEventListener('favoritos:mudou', function () { carregar(); });
  carregar();
})();

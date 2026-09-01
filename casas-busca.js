/**
 * casas-busca.js — a busca de casas à venda.
 *
 * O estado da busca mora na URL. Isso resolve de uma vez três coisas que o
 * cliente sente: voltar do imóvel não perde a pesquisa, o link pode ser
 * mandado para o marido/esposa, e a mesma busca pode virar anúncio.
 */
(function () {
  'use strict';

  var EH = window.EHCasas || {};
  var medir = EH.medir || function () {};

  var grade = document.getElementById('resultados');
  if (!grade) return;

  var elContagem = document.getElementById('contagem');
  var elPaginacao = document.getElementById('paginacao');
  var elAtivos = document.getElementById('filtrosAtivos');
  var painel = document.getElementById('painelFiltros');
  var campoBusca = document.getElementById('campoBusca');

  /* Cada filtro: como se chama na URL e como aparece na tela. */
  var CAMPOS = [
    { chave: 'q',          rotulo: 'Busca' },
    { chave: 'prefeitura', rotulo: 'Província', multi: true },
    { chave: 'cidade',     rotulo: 'Cidade', multi: true },
    { chave: 'planta',     rotulo: 'Planta', multi: true },
    { chave: 'precoMin',   rotulo: 'A partir de', formato: yen },
    { chave: 'precoMax',   rotulo: 'Até', formato: yen },
    { chave: 'mensalMax',  rotulo: 'Mensalidade até', formato: function (v) { return yen(v) + '/mês'; } },
    { chave: 'vagasMin',   rotulo: 'Vagas', formato: function (v) { return v + '+'; } },
    { chave: 'estacaoMax', rotulo: 'Estação até', formato: function (v) { return v + ' min a pé'; } },
    { chave: 'areaMin',    rotulo: 'Área a partir de', formato: function (v) { return v + ' m²'; } },
    { chave: 'terrenoMin', rotulo: 'Terreno a partir de', formato: function (v) { return v + ' m²'; } },
    { chave: 'anoMin',     rotulo: 'A partir de', formato: function (v) { return v; } }
  ];

  function yen(v) { return '¥' + Number(v).toLocaleString('ja-JP'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function lerURL() {
    var p = new URLSearchParams(window.location.search);
    var estado = {};
    CAMPOS.forEach(function (c) { var v = p.get(c.chave); if (v) estado[c.chave] = v; });
    estado.ordem = p.get('ordem') || 'recomendados';
    estado.pagina = Math.max(1, Number(p.get('pagina')) || 1);
    return estado;
  }

  function escreverURL(estado, substituir) {
    var p = new URLSearchParams();
    CAMPOS.forEach(function (c) { if (estado[c.chave]) p.set(c.chave, estado[c.chave]); });
    if (estado.ordem && estado.ordem !== 'recomendados') p.set('ordem', estado.ordem);
    if (estado.pagina > 1) p.set('pagina', estado.pagina);
    var url = window.location.pathname + (p.toString() ? '?' + p : '');
    window.history[substituir ? 'replaceState' : 'pushState'](estado, '', url);
  }

  var estado = lerURL();

  /* ── Render ─────────────────────────────────────────────── */

  function esqueletos(n) {
    var html = '';
    for (var i = 0; i < n; i++) {
      html += '<div class="esq"><div class="esq__foto"></div><div class="esq__linha"></div>'
            + '<div class="esq__linha esq__linha--curta"></div><div class="esq__linha"></div></div>';
    }
    grade.innerHTML = html;
    grade.setAttribute('aria-busy', 'true');
  }

  function cartao(c) {
    var specs = [];
    if (c.planta) specs.push('<span class="destaque">' + esc(c.planta) + '</span>');
    if (c.areaConstruida) specs.push('<span>' + esc(fmtArea(c.areaConstruida)) + '</span>');
    if (c.areaTerreno) specs.push('<span>Terreno ' + esc(fmtArea(c.areaTerreno)) + '</span>');
    if (c.vaga && c.vaga.pt) specs.push('<span>' + esc(c.vaga.pt) + '</span>');
    if (c.acesso && c.acesso.minutosAPe) specs.push('<span>' + c.acesso.minutosAPe + ' min da estação</span>');

    var selos = [];
    if (c.novo) selos.push('<span class="selo selo--novo">Recém-adicionado</span>');
    if (c.ano && c.ano.ano) selos.push('<span class="selo">' + c.ano.ano + '</span>');
    if (c.totalFotos > 1) selos.push('<span class="selo selo--fotos">' + c.totalFotos + ' fotos</span>');

    var foto = c.fotos && c.fotos[0];
    return '<article class="casa">'
      + '<div class="casa__foto">'
      + (foto ? '<img src="' + esc(foto) + '" alt="Foto de ' + esc(c.titulo) + '" loading="lazy" decoding="async" width="400" height="300">'
              : '<div class="vazio" aria-hidden="true">家</div>')
      + '<div class="casa__selos">' + selos.join('') + '</div>'
      + '<button class="coracao" type="button" data-favoritar="' + esc(c.codigo) + '" aria-pressed="false" aria-label="Salvar nos favoritos">'
      + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"/></svg></button>'
      + '</div>'
      + '<div class="casa__corpo">'
      + '<p class="casa__onde">' + esc([c.cidade, c.prefeitura].filter(Boolean).join(', ')) + '</p>'
      + '<h2 class="casa__nome"><a href="/comprar/imoveis/' + esc(c.slug) + '">' + esc(c.titulo) + '</a></h2>'
      + '<p class="casa__preco"><b>' + esc(c.precoFormatado) + '</b><small>' + esc(c.precoMan || '') + '</small></p>'
      + (c.estimativa ? '<p class="casa__mensal"><b>' + esc(EH.formatarYen(c.estimativa.valor)) + '/mês</b><span class="est">estimado</span></p>' : '')
      + '<p class="casa__specs">' + specs.join('') + '</p>'
      + '</div></article>';
  }

  function fmtArea(v) { return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' m²'; }

  function vazio() {
    var descricao = descreverBusca();
    var texto = 'Olá! Procuro uma casa no Japão' + (descricao ? ': ' + descricao : '')
              + '. Não encontrei no site — vocês podem me ajudar a achar algo assim?';
    grade.innerHTML = '';
    grade.removeAttribute('aria-busy');
    grade.style.padding = '0';
    grade.insertAdjacentHTML('afterend',
      '<div class="aviso-vazio" id="avisoVazio">'
      + '<h2>Não encontramos exatamente o que você procurou</h2>'
      + '<p>' + (descricao ? 'Você buscou por <strong>' + esc(descricao) + '</strong>. ' : '')
      + 'Podemos procurar outras opções para você — inclusive imóveis que ainda não estão no site.</p>'
      + '<p class="btn-row" style="justify-content:center">'
      + '<a class="btn btn--wa" rel="nofollow" data-cta="busca_vazia" href="https://wa.me/' + EH.whatsapp + '?text=' + encodeURIComponent(texto) + '">'
      + '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="18" height="18"><path d="M12 2C6.5 2 2 6.5 2 12c0 1.7.5 3.4 1.3 4.9L2 22l5.3-1.3c1.4.8 3 1.3 4.7 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2z"/></svg>'
      + ' Pedir ajuda para encontrar uma casa</a>'
      + '<button class="btn btn--ghost" type="button" id="limparTudoVazio">Limpar filtros</button></p></div>');
    medir('search_no_results', { filtros: descricao || null });
  }

  /** Descreve a busca em português — vai na mensagem do WhatsApp. */
  function descreverBusca() {
    var partes = [];
    if (estado.q) partes.push('"' + estado.q + '"');
    function bonito(chave) {
      return estado[chave].split(',').map(function (v) { return rotuloDe(chave, v); }).join(' ou ');
    }
    if (estado.cidade) partes.push('em ' + bonito('cidade'));
    if (estado.prefeitura) partes.push('na região de ' + bonito('prefeitura'));
    if (estado.planta) partes.push(bonito('planta'));
    if (estado.precoMax) partes.push('até ' + yen(estado.precoMax));
    if (estado.mensalMax) partes.push('com parcela até ' + yen(estado.mensalMax) + '/mês');
    if (estado.vagasMin) partes.push(estado.vagasMin + '+ vagas');
    if (estado.estacaoMax) partes.push('até ' + estado.estacaoMax + ' min da estação');
    return partes.join(', ');
  }

  function paginar(dados) {
    if (dados.totalPaginas <= 1) { elPaginacao.innerHTML = ''; return; }
    var atual = dados.pagina, ultimo = dados.totalPaginas, html = '';
    function link(n, rotulo, marcado) {
      var p = new URLSearchParams(window.location.search);
      if (n > 1) p.set('pagina', n); else p.delete('pagina');
      return '<a href="?' + p.toString() + '" data-pagina="' + n + '"'
           + (marcado ? ' aria-current="page"' : '') + '>' + (rotulo || n) + '</a>';
    }
    if (atual > 1) html += link(atual - 1, '‹');
    var jan = [];
    for (var i = 1; i <= ultimo; i++) {
      if (i === 1 || i === ultimo || Math.abs(i - atual) <= 1) jan.push(i);
    }
    var anterior = 0;
    jan.forEach(function (n) {
      if (anterior && n - anterior > 1) html += '<span class="reticencias">…</span>';
      html += link(n, null, n === atual);
      anterior = n;
    });
    if (atual < ultimo) html += link(atual + 1, '›');
    elPaginacao.innerHTML = html;
  }

  function pintarAtivos() {
    var tags = [];
    CAMPOS.forEach(function (c) {
      var v = estado[c.chave];
      if (!v) return;
      (c.multi ? String(v).split(',') : [v]).forEach(function (item) {
        var texto = c.formato ? c.rotulo + ' ' + c.formato(item)
                  : (c.chave === 'q' ? '"' + item + '"' : rotuloDe(c.chave, item));
        tags.push('<span class="tag-ativa">' + esc(texto)
          + '<button type="button" data-remover="' + esc(c.chave) + '" data-valor="' + esc(item)
          + '" aria-label="Remover filtro ' + esc(texto) + '">×</button></span>');
      });
    });
    elAtivos.innerHTML = tags.join('');
    var n = tags.length;
    document.getElementById('contaFiltros').textContent = n ? '(' + n + ')' : '';
  }

  /* ── Busca ──────────────────────────────────────────────── */

  /* A URL guarda os valores em minúsculas; a tela mostra o nome como ele é.
     Este mapa é preenchido pelas facetas da API. */
  var ROTULOS = {};
  function rotuloDe(chave, valor) {
    return (ROTULOS[chave] && ROTULOS[chave][valor]) || valor;
  }

  var requisicao = 0;

  async function buscar(opcoes) {
    var meu = ++requisicao;
    var avisoAntigo = document.getElementById('avisoVazio');
    if (avisoAntigo) avisoAntigo.remove();
    esqueletos(6);

    var p = new URLSearchParams();
    CAMPOS.forEach(function (c) { if (estado[c.chave]) p.set(c.chave, estado[c.chave]); });
    p.set('ordem', estado.ordem);
    p.set('pagina', estado.pagina);
    p.set('porPagina', 24);

    try {
      var r = await fetch('/api/casas?' + p.toString(), { headers: { Accept: 'application/json' } });
      if (meu !== requisicao) return;                     // chegou fora de ordem: descarta
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var dados = await r.json();
      if (meu !== requisicao) return;

      elContagem.innerHTML = '<strong>' + dados.total + '</strong> ' + (dados.total === 1 ? 'imóvel' : 'imóveis');
      montarOpcoes(dados.facetas, dados.rotulos);
      pintarAtivos();
      paginar(dados);

      if (!dados.total) { vazio(); return; }

      grade.innerHTML = dados.itens.map(cartao).join('');
      grade.style.padding = '';
      grade.removeAttribute('aria-busy');
      EH.ligarFavoritos(document);

      medir('property_list_view', { total: dados.total, pagina: dados.pagina, ordem: dados.ordem });
      if (opcoes && opcoes.medirBusca) medir('search_performed', { termo: estado.q || null, filtros: descreverBusca() || null });
    } catch (e) {
      if (meu !== requisicao) return;
      grade.removeAttribute('aria-busy');
      grade.innerHTML = '<div class="aviso-vazio"><h2>Não conseguimos carregar os imóveis agora</h2>'
        + '<p>Foi uma falha nossa. Tente de novo em instantes.</p>'
        + '<p class="btn-row" style="justify-content:center"><button class="btn btn--gold" type="button" id="tentarDeNovo">Tentar de novo</button></p></div>';
      var b = document.getElementById('tentarDeNovo');
      if (b) b.addEventListener('click', function () { buscar(); });
    }
  }

  /* ── Opções dos filtros (vêm das facetas da API) ────────── */

  var opcoesMontadas = false;

  function botaoOpcao(chave, valor, rotulo, total) {
    var atuais = (estado[chave] || '').split(',').filter(Boolean);
    var ativo = atuais.indexOf(String(valor).toLowerCase()) !== -1;
    return '<button class="chip-f' + (ativo ? ' ativo' : '') + '" type="button"'
      + ' data-filtro="' + esc(chave) + '" data-valor="' + esc(String(valor).toLowerCase()) + '"'
      + ' aria-pressed="' + ativo + '">' + esc(rotulo)
      + (total != null ? ' <span class="conta">' + total + '</span>' : '') + '</button>';
  }

  function guardarRotulos(chave, itens) {
    ROTULOS[chave] = ROTULOS[chave] || {};
    itens.forEach(function (f) { ROTULOS[chave][String(f.valor).toLowerCase()] = f.valor; });
  }

  function montarOpcoes(facetas, rotulos) {
    // `rotulos` cobre o acervo inteiro; as facetas só o que sobrou do filtro
    if (rotulos) {
      guardarRotulos('prefeitura', rotulos.prefeituras.map(function (v) { return { valor: v }; }));
      guardarRotulos('cidade', rotulos.cidades.map(function (v) { return { valor: v }; }));
      guardarRotulos('planta', rotulos.plantas.map(function (v) { return { valor: v }; }));
    }
    guardarRotulos('prefeitura', facetas.prefeituras);
    guardarRotulos('cidade', facetas.cidades);
    guardarRotulos('planta', facetas.plantas);
    if (opcoesMontadas) { sincronizarOpcoes(); pintarAtivos(); return; }
    opcoesMontadas = true;

    document.getElementById('grupoPrefeitura').innerHTML =
      facetas.prefeituras.map(function (f) { return botaoOpcao('prefeitura', f.valor, f.valor, f.total); }).join('');
    document.getElementById('grupoCidade').innerHTML =
      facetas.cidades.map(function (f) { return botaoOpcao('cidade', f.valor, f.valor, f.total); }).join('');
    document.getElementById('grupoPlanta').innerHTML =
      facetas.plantas.map(function (f) { return botaoOpcao('planta', f.valor, f.valor, f.total); }).join('');

    document.getElementById('grupoMensal').innerHTML = [50000, 70000, 100000, 150000]
      .map(function (v) { return botaoOpcao('mensalMax', v, 'Até ' + yen(v)); }).join('');
    document.getElementById('grupoVagas').innerHTML = [1, 2, 3]
      .map(function (v) { return botaoOpcao('vagasMin', v, v + '+ ' + (v === 1 ? 'vaga' : 'vagas')); }).join('');
    document.getElementById('grupoEstacao').innerHTML = [10, 15, 20, 30]
      .map(function (v) { return botaoOpcao('estacaoMax', v, 'Até ' + v + ' min'); }).join('');

    ['precoMin', 'precoMax', 'areaMin', 'terrenoMin', 'anoMin'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && estado[id]) el.value = estado[id];
    });
  }

  function sincronizarOpcoes() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-filtro]'), function (b) {
      var chave = b.getAttribute('data-filtro'), valor = b.getAttribute('data-valor');
      var atuais = (estado[chave] || '').split(',').filter(Boolean);
      var ativo = atuais.indexOf(valor) !== -1;
      b.classList.toggle('ativo', ativo);
      b.setAttribute('aria-pressed', String(ativo));
    });
  }

  /* ── Interação ──────────────────────────────────────────── */

  function alterar(mudancas, opcoes) {
    Object.keys(mudancas).forEach(function (k) {
      if (mudancas[k] === null || mudancas[k] === '') delete estado[k];
      else estado[k] = String(mudancas[k]);
    });
    if (!('pagina' in mudancas)) estado.pagina = 1;
    escreverURL(estado);
    buscar(opcoes);
  }

  document.addEventListener('click', function (ev) {
    var opcao = ev.target.closest && ev.target.closest('[data-filtro]');
    if (opcao) {
      var chave = opcao.getAttribute('data-filtro'), valor = opcao.getAttribute('data-valor');
      var multi = ['prefeitura', 'cidade', 'planta'].indexOf(chave) !== -1;
      var atuais = (estado[chave] || '').split(',').filter(Boolean);
      var i = atuais.indexOf(valor);
      if (multi) { if (i === -1) atuais.push(valor); else atuais.splice(i, 1); }
      else atuais = (i === -1) ? [valor] : [];
      var mud = {}; mud[chave] = atuais.join(',');
      alterar(mud);
      medir('filter_used', { filtro: chave, valor: valor });
      return;
    }

    var remover = ev.target.closest && ev.target.closest('[data-remover]');
    if (remover) {
      var ch = remover.getAttribute('data-remover'), val = remover.getAttribute('data-valor');
      var lista = (estado[ch] || '').split(',').filter(function (x) { return x !== val; });
      var m = {}; m[ch] = lista.join(',');
      if (ch === 'q' && campoBusca) campoBusca.value = '';
      ['precoMin','precoMax','areaMin','terrenoMin','anoMin'].forEach(function (id) {
        if (id === ch) { var el = document.getElementById(id); if (el) el.value = ''; }
      });
      alterar(m);
      return;
    }

    if (ev.target.closest && ev.target.closest('#abrirFiltros')) return abrirPainel();
    if (ev.target.closest && ev.target.closest('[data-fechar-painel]')) return fecharPainel();
    if (ev.target.id === 'limparFiltros' || ev.target.id === 'limparTudoVazio') return limparTudo();

    var pag = ev.target.closest && ev.target.closest('[data-pagina]');
    if (pag) {
      ev.preventDefault();
      alterar({ pagina: pag.getAttribute('data-pagina') });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  function limparTudo() {
    estado = { ordem: 'recomendados', pagina: 1 };
    if (campoBusca) campoBusca.value = '';
    ['precoMin','precoMax','areaMin','terrenoMin','anoMin'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.value = '';
    });
    escreverURL(estado);
    buscar();
  }

  var formBusca = document.getElementById('formBusca');
  if (formBusca) {
    formBusca.addEventListener('submit', function (ev) {
      ev.preventDefault();
      alterar({ q: campoBusca.value.trim() || null }, { medirBusca: true });
      fecharPainel();
    });
  }

  var selOrdem = document.getElementById('ordenar');
  if (selOrdem) {
    selOrdem.value = estado.ordem;
    selOrdem.addEventListener('change', function () { alterar({ ordem: selOrdem.value }); });
  }

  // Campos numéricos: espera a digitação parar antes de buscar
  var espera;
  ['precoMin', 'precoMax', 'areaMin', 'terrenoMin', 'anoMin'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function () {
      clearTimeout(espera);
      espera = setTimeout(function () {
        var m = {}; m[id] = el.value.trim() || null;
        alterar(m);
      }, 550);
    });
  });

  /* ── Painel ─────────────────────────────────────────────── */
  var focoAntesDoPainel = null;

  function abrirPainel() {
    focoAntesDoPainel = document.activeElement;
    painel.setAttribute('open', '');
    document.body.style.overflow = 'hidden';
    var f = painel.querySelector('.painel__fechar');
    if (f) f.focus();
  }

  function fecharPainel() {
    painel.removeAttribute('open');
    document.body.style.overflow = '';
    if (focoAntesDoPainel && focoAntesDoPainel.focus) focoAntesDoPainel.focus();
  }

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && painel.hasAttribute('open')) fecharPainel();
  });

  /* Voltar do imóvel devolve a busca exatamente como estava. */
  window.addEventListener('popstate', function () {
    estado = lerURL();
    if (campoBusca) campoBusca.value = estado.q || '';
    if (selOrdem) selOrdem.value = estado.ordem;
    sincronizarOpcoes();
    buscar();
  });

  if (campoBusca) campoBusca.value = estado.q || '';
  escreverURL(estado, true);
  buscar();
})();

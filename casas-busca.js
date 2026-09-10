/**
 * casas-busca.js — a busca de casas à venda, no navegador.
 *
 * A página chega pronta do servidor (api/casas-lista.mjs): resultados, filtros
 * como <form>, chips como links, paginação como links. Este arquivo só entra
 * por cima, para evitar o recarregamento da página a cada toque. Tudo que ele
 * faz tem um equivalente sem JavaScript.
 *
 * Três regras que vieram do baseline de 10/09/2026:
 *   1. O painel de filtros é um RASCUNHO: mexer nele só atualiza o botão
 *      "Mostrar X imóveis" (uma consulta leve, cancelável). A lista muda quando
 *      a pessoa toca no botão. Antes cada clique disparava consulta + pushState,
 *      e três toques viravam três entradas no histórico.
 *   2. Uma consulta nova cancela a anterior (AbortController). Resposta atrasada
 *      nunca vence a atual.
 *   3. As opções do painel são reconciliadas a cada resposta: contagens novas,
 *      opção sem resultado fica apagada com o motivo — nunca somem.
 */
(function () {
  'use strict';

  var EH = window.EHCasas || {};
  var Cartao = window.EHCartao;
  var medir = EH.medir || function () {};
  var grade = document.getElementById('resultados');
  var dadosEl = document.getElementById('dadosBusca');
  if (!grade || !dadosEl || !Cartao) return;

  var CAMINHO = '/comprar/imoveis';
  var inicial = {};
  try { inicial = JSON.parse(dadosEl.textContent); } catch (e) { return; }

  var elContagem = document.getElementById('contagem');
  var elPaginacao = document.getElementById('paginacao');
  var elAtivos = document.getElementById('filtrosAtivos');
  var elExplica = document.getElementById('ordemExplica');
  var painel = document.getElementById('painelFiltros');
  var formFiltros = document.getElementById('formFiltros');
  var formBusca = document.getElementById('formBusca');
  var formOrdem = document.getElementById('formOrdem');
  var campoBusca = document.getElementById('campoBusca');
  var selOrdem = document.getElementById('ordenar');
  var btnAbrir = document.getElementById('abrirFiltros');
  var btnVer = document.getElementById('verResultados');
  var nVer = document.getElementById('verResultadosN');
  var ROTULOS = inicial.rotulos || {};
  var ORDENS = {};

  function esc(s) { return Cartao.esc(s); }
  function yen(v) { return Cartao.yen(Number(v)); }
  function clonar(o) { return JSON.parse(JSON.stringify(o)); }

  /* ── Estado ⇄ URL ─────────────────────────────────────────── */

  var MULTI = { prefeitura: 'prefeituras', cidade: 'cidades', planta: 'plantas', entrega: 'entrega' };
  var NUM = ['precoMin', 'precoMax', 'mensalMax', 'areaMin', 'terrenoMin', 'anoMin', 'estacaoMax'];
  var UM = ['estado', 'estacionamento', 'fotos'];

  function lerURL(search) {
    var p = new URLSearchParams(search === undefined ? window.location.search : search);
    var f = { q: p.get('q') || null, prefeituras: [], cidades: [], plantas: [], entrega: [] };
    Object.keys(MULTI).forEach(function (k) {
      f[MULTI[k]] = (p.get(k) || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
    });
    NUM.forEach(function (k) { var v = p.get(k); f[k] = v && isFinite(Number(v)) ? Number(v) : null; });
    UM.forEach(function (k) { f[k] = p.get(k) || null; });
    return { filtros: f, ordem: p.get('ordem') || 'recentes', pagina: Math.max(1, Number(p.get('pagina')) || 1) };
  }

  function paraParams(estado) {
    var f = estado.filtros, p = new URLSearchParams();
    if (f.q) p.set('q', f.q);
    Object.keys(MULTI).forEach(function (k) { if (f[MULTI[k]] && f[MULTI[k]].length) p.set(k, f[MULTI[k]].join(',')); });
    NUM.forEach(function (k) { if (f[k] !== null && f[k] !== undefined) p.set(k, String(f[k])); });
    UM.forEach(function (k) { if (f[k]) p.set(k, f[k]); });
    if (estado.ordem && estado.ordem !== 'recentes') p.set('ordem', estado.ordem);
    if (estado.pagina > 1) p.set('pagina', String(estado.pagina));
    return p;
  }

  function urlDe(estado) { var q = paraParams(estado).toString(); return CAMINHO + (q ? '?' + q : ''); }

  /** Lê o <form> do painel como filtros (mesmos nomes da URL). */
  function lerForm(form, base) {
    var fd = new FormData(form);
    var p = new URLSearchParams();
    var multi = {};
    fd.forEach(function (v, k) {
      v = String(v).trim();
      if (!v) return;
      if (MULTI[k]) { (multi[k] = multi[k] || []).push(v); } else p.set(k, v);
    });
    Object.keys(multi).forEach(function (k) { p.set(k, multi[k].join(',')); });
    if (base) {
      if (base.filtros.q && !p.has('q')) p.set('q', base.filtros.q);
      if (!p.has('ordem') && base.ordem) p.set('ordem', base.ordem);
    }
    return lerURL('?' + p.toString());
  }

  var estado = lerURL();
  var aplicado = estado;                        // último estado que virou lista

  /* ── Requests canceláveis ─────────────────────────────────── */

  function consultar(estado, extra, ref) {
    if (ref.atual) ref.atual.abort();
    var ctrl = new AbortController();
    ref.atual = ctrl;
    var p = paraParams(estado);
    p.set('porPagina', '18');            // igual ao servidor (api/casas-lista.mjs)
    p.set('pagina', String(estado.pagina || 1));
    Object.keys(extra || {}).forEach(function (k) { p.set(k, extra[k]); });
    return fetch('/api/casas?' + p.toString(), { headers: { Accept: 'application/json' }, signal: ctrl.signal })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { if (ref.atual !== ctrl) throw new DOMException('obsoleto', 'AbortError'); return d; });
  }
  var refLista = { atual: null }, refContagem = { atual: null };

  /* ── Render ───────────────────────────────────────────────── */

  function rotuloChip(k, v) {
    var r = ROTULOS;
    switch (k) {
      case 'q': return 'Busca: “' + v + '”';
      case 'prefeituras': return 'Província: ' + ((r.prefeitura || {})[v] || v);
      case 'cidades': return 'Cidade: ' + ((r.cidade || {})[v] || v);
      case 'plantas': return 'Planta: ' + String(v).toUpperCase();
      case 'precoMin': return 'Preço: a partir de ' + yen(v);
      case 'precoMax': return 'Preço: até ' + yen(v);
      case 'mensalMax': return 'Parcela estimada: até ' + yen(v) + '/mês';
      case 'areaMin': return 'Área construída: a partir de ' + v + ' m²';
      case 'terrenoMin': return 'Terreno: a partir de ' + v + ' m²';
      case 'anoMin': return 'Construída a partir de ' + v;
      case 'estacaoMax': return 'Estação: até ' + v + ' min a pé';
      case 'estado': return v === 'novo' ? 'Casa nova' : 'Casa usada';
      case 'entrega': return { imediata: 'Entrega imediata', prevista: 'Entrega prevista', combinar: 'Entrega a combinar' }[v] || v;
      case 'estacionamento': return 'Com estacionamento';
      case 'fotos': return 'Só com fotos do imóvel';
    }
    return v;
  }

  function ativos(f) {
    var out = [];
    Object.keys(f).forEach(function (k) {
      var v = f[k];
      if (Array.isArray(v)) v.forEach(function (x) { out.push([k, x]); });
      else if (v !== null && v !== undefined && v !== '') out.push([k, v]);
    });
    return out;
  }

  function pintarChips(estado) {
    var lista = ativos(estado.filtros);
    var html = lista.map(function (par) {
      var texto = rotuloChip(par[0], par[1]);
      var sem = clonar(estado);
      if (Array.isArray(sem.filtros[par[0]])) sem.filtros[par[0]] = sem.filtros[par[0]].filter(function (x) { return x !== par[1]; });
      else sem.filtros[par[0]] = null;
      sem.pagina = 1;
      return '<a class="tag-ativa" href="' + esc(urlDe(sem)) + '" data-remover="' + esc(par[0]) + '" data-valor="' + esc(par[1]) + '" rel="nofollow">'
        + esc(texto) + ' <span class="tag-ativa__x" aria-hidden="true">×</span><span class="sr-only"> — remover este filtro</span></a>';
    }).join('');
    if (lista.length) html += '<a class="tag-limpar" href="' + CAMINHO + '" id="limparTudo" rel="nofollow">Limpar tudo</a>';
    elAtivos.innerHTML = html;
    var conta = document.getElementById('contaFiltros');
    if (conta) conta.textContent = lista.length ? String(lista.length) : '';
  }

  function pintarPaginacao(d, estado) {
    if (!elPaginacao) return;
    if (d.totalPaginas <= 1) { elPaginacao.innerHTML = ''; return; }
    function link(n, rotulo, atual) {
      var e = clonar(estado); e.pagina = n;
      return '<a href="' + esc(urlDe(e)) + '" data-pagina="' + n + '"' + (atual ? ' aria-current="page"' : '')
        + (rotulo ? ' aria-label="' + rotulo + '"' : '') + ' rel="nofollow">' + (rotulo ? (n < d.pagina ? '‹' : '›') : n) + '</a>';
    }
    var html = '';
    if (d.pagina > 1) html += link(d.pagina - 1, 'Página anterior');
    var jan = [], ant = 0;
    for (var i = 1; i <= d.totalPaginas; i++) if (i === 1 || i === d.totalPaginas || Math.abs(i - d.pagina) <= 1) jan.push(i);
    jan.forEach(function (n) {
      if (ant && n - ant > 1) html += '<span class="reticencias" aria-hidden="true">…</span>';
      html += link(n, null, n === d.pagina); ant = n;
    });
    if (d.pagina < d.totalPaginas) html += link(d.pagina + 1, 'Próxima página');
    elPaginacao.innerHTML = html;
  }

  function pintarCarregarMais(d, estado) {
    var antigo = document.querySelector('.carregar-mais');
    if (antigo) antigo.remove();
    if (d.totalPaginas <= d.pagina) return;
    var e = clonar(estado); e.pagina = d.pagina + 1;
    var restam = Math.min(d.porPagina, d.total - d.pagina * d.porPagina);
    grade.insertAdjacentHTML('afterend', '<p class="carregar-mais"><a class="btn btn--ghost" id="carregarMais" href="' + esc(urlDe(e))
      + '" rel="nofollow">Carregar mais <span class="conta">' + restam + '</span></a></p>');
  }

  var NOMES = { q: 'a busca por texto', prefeituras: 'a província', cidades: 'as cidades', plantas: 'a planta',
    precoMin: 'o preço mínimo', precoMax: 'o preço máximo', mensalMax: 'a parcela máxima', areaMin: 'a área mínima',
    terrenoMin: 'o terreno mínimo', anoMin: 'o ano mínimo', estacaoMax: 'a distância da estação', estado: 'novo/usado',
    entrega: 'a entrega', estacionamento: 'o estacionamento', fotos: 'só com fotos' };

  function pintarVazio(d, estado) {
    var antigo = document.getElementById('avisoVazio');
    if (antigo) antigo.remove();
    if (d.total) return;
    var f = estado.filtros;
    var descricao = ativos(f).map(function (p) { return rotuloChip(p[0], p[1]); }).join(' · ');
    var sug = (d.vazio && d.vazio.sugestoes || []).slice(0, 3);
    var acoes = sug.map(function (s) {
      var e = clonar(estado); e.filtros[s.filtro] = Array.isArray(f[s.filtro]) ? [] : null; e.pagina = 1;
      return '<a class="btn btn--ghost" href="' + esc(urlDe(e)) + '" data-sugestao="' + esc(s.filtro) + '" rel="nofollow">Remover '
        + esc(NOMES[s.filtro] || s.filtro) + ' <span class="conta">+' + s.voltariam + '</span></a>';
    }).join('');
    var msg = 'Olá! Procuro uma casa no Japão' + (descricao ? ' (' + descricao + ')' : '') + ' e não encontrei no site da Easy House. Podem me ajudar a achar algo assim?';
    grade.insertAdjacentHTML('afterend', '<div class="aviso-vazio" id="avisoVazio" role="status">'
      + '<h2>Nenhuma casa com todos esses filtros</h2>'
      + (descricao ? '<p class="aviso-vazio__filtros">Você pediu: <strong>' + esc(descricao) + '</strong>.</p>' : '')
      + (sug.length ? '<p>O que mais está limitando a busca é <strong>' + esc(NOMES[sug[0].filtro] || sug[0].filtro) + '</strong>: sem esse filtro voltariam ' + sug[0].voltariam + ' imóveis. Você escolhe o que afrouxar — nada muda sozinho.</p>' : '')
      + '<div class="aviso-vazio__acoes">' + acoes + '<a class="btn btn--ghost" href="' + CAMINHO + '" rel="nofollow">Limpar todos os filtros</a></div>'
      + '<p class="aviso-vazio__ajuda">Prefere que a gente procure? Há imóveis que ainda não estão no site. '
      + '<a href="https://wa.me/' + EH.whatsapp + '?text=' + encodeURIComponent(msg) + '" data-cta="busca_vazia" rel="nofollow">Pedir ajuda pelo WhatsApp</a> — abre o WhatsApp com a sua busca já descrita.</p></div>');
    medir('search_no_results', { filtros: ativos(f).map(function (p) { return p[0]; }).join(',') || null });
  }

  function pintarLista(d, estado, anexar) {
    var favs = EH.lerFavoritos ? EH.lerFavoritos() : [];
    var comp = EH.lerComparacao ? EH.lerComparacao() : [];
    var html = d.itens.map(function (c, i) {
      return Cartao.cartao(c, { favorito: favs.indexOf(c.codigo) !== -1, comparando: comp.indexOf(c.codigo) !== -1, prioridade: !anexar && i === 0 });
    }).join('');
    if (anexar) grade.insertAdjacentHTML('beforeend', html); else grade.innerHTML = html;
    grade.removeAttribute('aria-busy');
    grade.setAttribute('data-pagina', d.pagina);
    if (EH.ligarFavoritos) EH.ligarFavoritos(document);
    if (EH.ligarComparacao) EH.ligarComparacao(document);
  }

  function pintarContagem(d) {
    elContagem.innerHTML = '<strong>' + d.total + '</strong> ' + (d.total === 1 ? 'imóvel' : 'imóveis')
      + (d.total !== d.totalAcervo ? ' <span class="barra__de">de ' + d.totalAcervo + '</span>' : '');
  }

  function pintarOrdem(d) {
    if (d.ordens) ORDENS = d.ordens;
    if (selOrdem && d.ordem) selOrdem.value = d.ordem;
    if (elExplica && ORDENS[d.ordem]) elExplica.textContent = ORDENS[d.ordem].explica;
  }

  /* ── Reconciliação das opções do painel ───────────────────── */

  function reconciliar(fac, filtrosAtuais) {
    if (!fac || !formFiltros) return;
    function ajustar(nome, itens, motivoZero) {
      itens.forEach(function (it) {
        var input = formFiltros.querySelector('input[name="' + nome + '"][value="' + it.chave + '"]');
        if (!input) return;
        var label = input.closest('.opcao');
        var conta = label && label.querySelector('.conta');
        if (conta) { conta.textContent = it.total; conta.setAttribute('aria-label', it.total + ' imóveis'); }
        var zero = it.total === 0 && !input.checked;
        input.disabled = zero;
        if (!label) return;
        label.classList.toggle('zero', zero);
        var sr = label.querySelector('.sr-only');
        if (zero) {
          var motivo = motivoZero ? motivoZero(it) : 'Nenhum imóvel com os filtros atuais';
          if (!sr) { sr = document.createElement('span'); sr.className = 'sr-only'; label.appendChild(sr); }
          sr.textContent = '. ' + motivo;
          label.title = motivo;
        } else { if (sr) sr.remove(); label.removeAttribute('title'); }
      });
    }
    ajustar('prefeitura', fac.prefeituras);
    ajustar('cidade', fac.cidades, function (it) {
      if (filtrosAtuais.prefeituras.length && it.prefeitura && filtrosAtuais.prefeituras.indexOf(it.prefeitura.toLowerCase()) === -1) {
        return it.valor + ' fica em ' + it.prefeitura + ', fora da província escolhida';
      }
      return 'Nenhum imóvel em ' + it.valor + ' com os filtros atuais';
    });
    ajustar('planta', fac.plantas);
    ajustar('estado', [{ chave: 'novo', total: fac.estado.novo }, { chave: 'usado', total: fac.estado.usado }]);
    ajustar('entrega', ['imediata', 'prevista', 'combinar'].map(function (k) { return { chave: k, total: fac.entrega[k] }; }));
    Array.prototype.forEach.call(formFiltros.querySelectorAll('.painel__sub[data-provincia]'), function (fs) {
      var soma = 0;
      Array.prototype.forEach.call(fs.querySelectorAll('input[name="cidade"]'), function (i) {
        var c = i.closest('.opcao').querySelector('.conta'); soma += Number(c && c.textContent) || 0;
      });
      var leg = fs.querySelector('legend .conta'); if (leg) leg.textContent = soma;
    });
    if (fac.semDado) {
      Array.prototype.forEach.call(formFiltros.querySelectorAll('.painel__nota'), function (n) {
        n.textContent = n.textContent
          .replace(/^\d+ dos resultados atuais não informam estacionamento/, fac.semDado.estacionamento + ' dos resultados atuais não informam estacionamento')
          .replace(/^\d+ dos resultados atuais não informam a caminhada/, fac.semDado.estacao + ' dos resultados atuais não informam a caminhada');
      });
    }
  }

  /* ── Busca completa (aplica um estado) ────────────────────── */

  function aplicar(novo, opcoes) {
    opcoes = opcoes || {};
    estado = novo;
    if (!opcoes.semHistorico) {
      guardarRolagem();
      window.history[opcoes.substituir ? 'replaceState' : 'pushState']({ busca: true }, '', urlDe(estado));
    }
    grade.setAttribute('aria-busy', 'true');          // a lista antiga fica visível, só esmaece
    var antigo = document.getElementById('avisoVazio'); if (antigo) antigo.remove();

    return consultar(estado, null, refLista).then(function (d) {
      aplicado = estado;
      if (d.urlCanonica && d.urlCanonica !== '?' + paraParams(estado).toString() && d.filtros) {
        // o servidor entendeu o texto como lugar: a URL e o estado seguem a forma canônica
        estado = lerURL(d.urlCanonica); aplicado = estado;
        window.history.replaceState({ busca: true }, '', urlDe(estado));
      }
      pintarContagem(d); pintarOrdem(d); pintarChips(estado); pintarLista(d, estado, false);
      pintarPaginacao(d, estado); pintarCarregarMais(d, estado); pintarVazio(d, estado);
      reconciliar(d.facetas, estado.filtros);
      sincronizarForm(estado);
      if (nVer) nVer.textContent = d.total;
      try { sessionStorage.setItem('eh_ultima_busca', urlDe(estado)); } catch (e) {}
      if (opcoes.rolarTopo) rolarParaResultados();
      medir('property_list_view', { total: d.total, pagina: d.pagina, ordem: d.ordem });
      if (opcoes.medirBusca) medir('search_performed', { filtros: ativos(estado.filtros).map(function (p) { return p[0]; }).join(',') || null });
      return d;
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return;
      grade.removeAttribute('aria-busy');
      var antigoErro = document.getElementById('avisoErro'); if (antigoErro) antigoErro.remove();
      grade.insertAdjacentHTML('afterend', '<div class="aviso-vazio" id="avisoErro" role="alert"><h2>Não conseguimos atualizar a lista</h2>'
        + '<p>Foi uma falha nossa. A lista anterior continua na tela.</p>'
        + '<p class="btn-row" style="justify-content:center"><button class="btn btn--gold" type="button" id="tentarDeNovo">Tentar de novo</button></p></div>');
      document.getElementById('tentarDeNovo').addEventListener('click', function () {
        document.getElementById('avisoErro').remove(); aplicar(estado, { semHistorico: true });
      });
    });
  }

  function prefereReduzir() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function rolarParaResultados() {
    var barra = document.getElementById('barra');
    var topo = (barra ? barra.getBoundingClientRect().top + window.scrollY : 0) - 60;
    window.scrollTo({ top: Math.max(0, topo), behavior: prefereReduzir() ? 'auto' : 'smooth' });
  }

  /** Sincroniza formulários com o estado (após popstate, chips, canonização). */
  function sincronizarForm(estado) {
    var f = estado.filtros;
    if (campoBusca) campoBusca.value = f.q || '';
    var precoR = document.getElementById('precoMaxRapido');
    if (precoR) precoR.value = f.precoMax !== null && precoR.querySelector('option[value="' + f.precoMax + '"]') ? String(f.precoMax) : '';
    var plantaR = document.getElementById('plantaRapida');
    if (plantaR) plantaR.value = f.plantas.length === 1 ? f.plantas[0] : '';
    if (selOrdem) selOrdem.value = estado.ordem;
    if (!formFiltros) return;
    Array.prototype.forEach.call(formFiltros.querySelectorAll('input[type=checkbox],input[type=radio]'), function (i) {
      var k = MULTI[i.name];
      if (k) i.checked = f[k].indexOf(i.value) !== -1;
      else if (i.type === 'radio') i.checked = String(f[i.name] === null || f[i.name] === undefined ? '' : f[i.name]) === i.value;
      else i.checked = String(f[i.name] || '') === i.value;
    });
    NUM.forEach(function (k) { var el = formFiltros.querySelector('input[name="' + k + '"]'); if (el) el.value = f[k] === null ? '' : f[k]; });
    var q = formFiltros.querySelector('input[name="q"]'); if (q) q.value = f.q || '';
    var o = formFiltros.querySelector('input[name="ordem"]'); if (o) o.value = estado.ordem;
    resumosDoPainel(f);
    leituraDePreco();
  }

  function resumosDoPainel(f) {
    var r = {
      onde: [].concat(f.prefeituras.map(function (v) { return (ROTULOS.prefeitura || {})[v] || v; }), f.cidades.map(function (v) { return (ROTULOS.cidade || {})[v] || v; })),
      preco: [].concat(f.precoMin !== null ? ['de ' + yen(f.precoMin)] : [], f.precoMax !== null ? ['até ' + yen(f.precoMax)] : [], f.mensalMax !== null ? ['parcela até ' + yen(f.mensalMax)] : []),
      tamanho: [].concat(f.plantas.map(function (v) { return v.toUpperCase(); }), f.areaMin !== null ? [f.areaMin + ' m²+'] : [], f.terrenoMin !== null ? ['terreno ' + f.terrenoMin + ' m²+'] : []),
      imovel: [].concat(f.estado ? [f.estado === 'novo' ? 'nova' : 'usada'] : [], f.entrega, f.anoMin !== null ? ['desde ' + f.anoMin] : []),
      rotina: [].concat(f.estacionamento ? ['estacionamento'] : [], f.estacaoMax !== null ? ['≤ ' + f.estacaoMax + ' min'] : []),
      transp: f.fotos ? ['só com fotos'] : []
    };
    Object.keys(r).forEach(function (k) {
      var el = formFiltros.querySelector('[data-resumo="' + k + '"]'); if (!el) return;
      var itens = r[k];
      el.textContent = itens.length > 2 ? itens.slice(0, 2).join(', ') + ' +' + (itens.length - 2) : itens.join(', ');
    });
  }

  function leituraDePreco() {
    var el = document.getElementById('leituraPreco'); if (!el) return;
    var mn = Number((document.getElementById('precoMin') || {}).value) || null;
    var mx = Number((document.getElementById('precoMax') || {}).value) || null;
    var partes = [];
    if (mn) partes.push('a partir de ' + yen(mn) + ' (' + (mn / 10000).toLocaleString('pt-BR') + ' 万円)');
    if (mx) partes.push('até ' + yen(mx) + ' (' + (mx / 10000).toLocaleString('pt-BR') + ' 万円)');
    el.textContent = partes.length ? 'Entendido: ' + partes.join(', ') : '';
  }

  /* ── Painel: rascunho + contagem viva ─────────────────────── */

  var focoAntes = null, rascunhoTimer = null;

  function abrirPainel() {
    if (!painel) return;
    focoAntes = document.activeElement;
    painel.hidden = false;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('dialogo-aberto');
    if (btnAbrir) btnAbrir.setAttribute('aria-expanded', 'true');
    sincronizarForm(aplicado);                    // o rascunho começa igual ao aplicado
    var atual = document.querySelector('#contagem strong');
    if (nVer && atual) nVer.textContent = atual.textContent;
    var t = painel.querySelector('#tituloFiltros');
    if (t) { t.setAttribute('tabindex', '-1'); t.focus(); }
    painel.addEventListener('keydown', presoNoPainel);
  }

  function fecharPainel(aplicarRascunho) {
    if (!painel || painel.hidden) return;
    if (refContagem.atual) refContagem.atual.abort();
    painel.hidden = true;
    document.body.style.overflow = '';
    document.body.classList.remove('dialogo-aberto');
    if (btnAbrir) btnAbrir.setAttribute('aria-expanded', 'false');
    painel.removeEventListener('keydown', presoNoPainel);
    if (focoAntes && focoAntes.focus) focoAntes.focus();
    if (!aplicarRascunho) sincronizarForm(aplicado);   // cancelou: descarta o rascunho
  }

  /** Foco contido no diálogo; ESC fecha sem aplicar. */
  function presoNoPainel(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); fecharPainel(false); return; }
    if (ev.key !== 'Tab') return;
    var focaveis = Array.prototype.filter.call(
      painel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, summary'),
      function (el) { return el.offsetParent !== null; });
    if (!focaveis.length) return;
    var primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
    var titulo = painel.querySelector('#tituloFiltros');
    if (ev.shiftKey && (document.activeElement === primeiro || document.activeElement === titulo)) { ev.preventDefault(); ultimo.focus(); }
    else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primeiro.focus(); }
  }

  function contagemDoRascunho() {
    if (!formFiltros || painel.hidden) return;
    var rascunho = lerForm(formFiltros, estado);
    resumosDoPainel(rascunho.filtros);
    leituraDePreco();
    if (btnVer) btnVer.setAttribute('aria-busy', 'true');
    consultar(rascunho, { somenteTotal: '1' }, refContagem).then(function (d) {
      if (nVer) nVer.textContent = d.total;
      if (btnVer) btnVer.removeAttribute('aria-busy');
      reconciliar(d.facetas, rascunho.filtros);
    }).catch(function () { if (btnVer) btnVer.removeAttribute('aria-busy'); });
  }

  if (formFiltros) {
    formFiltros.addEventListener('change', function () {
      clearTimeout(rascunhoTimer); rascunhoTimer = setTimeout(contagemDoRascunho, 150);
    });
    formFiltros.addEventListener('input', function (ev) {
      if (ev.target.type === 'number') { clearTimeout(rascunhoTimer); rascunhoTimer = setTimeout(contagemDoRascunho, 400); }
    });
    formFiltros.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var novo = lerForm(formFiltros, estado); novo.pagina = 1;
      fecharPainel(true);
      aplicar(novo, { medirBusca: true, rolarTopo: true });
      medir('filter_used', { filtros: ativos(novo.filtros).map(function (p) { return p[0]; }).join(',') || 'nenhum' });
    });
    var filtroCidade = document.getElementById('filtroCidade');
    if (filtroCidade) {
      filtroCidade.addEventListener('input', function () {
        var termo = filtroCidade.value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
        Array.prototype.forEach.call(formFiltros.querySelectorAll('input[name="cidade"]'), function (i) {
          var label = i.closest('.opcao');
          var nome = label.querySelector('.opcao__txt').textContent.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
          label.hidden = !!termo && nome.indexOf(termo) === -1 && !i.checked;
        });
        Array.prototype.forEach.call(formFiltros.querySelectorAll('.painel__sub[data-provincia]'), function (fs) {
          fs.hidden = !!termo && !fs.querySelector('.opcao:not([hidden])');
        });
      });
    }
    var limpar = document.getElementById('limparFiltros');
    if (limpar) limpar.addEventListener('click', function (ev) {
      ev.preventDefault();
      var vazio = lerURL('?'); vazio.ordem = estado.ordem;
      sincronizarForm(vazio); contagemDoRascunho();
    });
  }

  /* ── Busca rápida e ordenação ─────────────────────────────── */

  if (formBusca) formBusca.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var fd = new FormData(formBusca);
    var novo = clonar(estado);
    novo.filtros.q = String(fd.get('q') || '').trim() || null;
    var pm = fd.get('precoMax'); novo.filtros.precoMax = pm ? Number(pm) : null;
    var pl = fd.get('planta'); novo.filtros.plantas = pl ? [String(pl)] : [];
    novo.pagina = 1;
    aplicar(novo, { medirBusca: true, rolarTopo: true });
  });

  if (selOrdem) selOrdem.addEventListener('change', function () {
    var novo = clonar(estado); novo.ordem = selOrdem.value; novo.pagina = 1;
    aplicar(novo);
    medir('filter_used', { filtros: 'ordem:' + selOrdem.value });
  });
  if (formOrdem) formOrdem.addEventListener('submit', function (ev) { ev.preventDefault(); });

  /* ── Cliques delegados: chips, paginação, carregar mais, sugestões ── */

  document.addEventListener('click', function (ev) {
    var a;
    if (!ev.target.closest) return;
    if ((a = ev.target.closest('#abrirFiltros'))) { ev.preventDefault(); abrirPainel(); return; }
    if ((a = ev.target.closest('[data-fechar-painel]'))) { ev.preventDefault(); fecharPainel(false); return; }

    if ((a = ev.target.closest('.tag-ativa[data-remover], #limparTudo, [data-sugestao]'))) {
      ev.preventDefault();
      var novo = lerURL(new URL(a.href, location.origin).search); novo.pagina = 1;
      aplicar(novo);
      medir('filter_used', { filtros: a.id === 'limparTudo' ? 'limpar' : 'remover:' + (a.getAttribute('data-remover') || a.getAttribute('data-sugestao')) });
      return;
    }
    if ((a = ev.target.closest('#carregarMais'))) {
      ev.preventDefault();
      var prox = lerURL(new URL(a.href, location.origin).search);
      a.setAttribute('aria-busy', 'true'); a.textContent = 'Carregando…';
      consultar(prox, null, refLista).then(function (d) {
        estado = prox; aplicado = prox;
        window.history.replaceState({ busca: true }, '', urlDe(prox));   // voltar da ficha reabre nesta página
        var antes = grade.children.length;
        pintarLista(d, prox, true); pintarPaginacao(d, prox); pintarCarregarMais(d, prox);
        var primeiroNovo = grade.children[antes], alvo = primeiroNovo && primeiroNovo.querySelector('.casa__ver');
        if (alvo) alvo.focus({ preventScroll: true });
        medir('property_list_view', { total: d.total, pagina: d.pagina, ordem: d.ordem, modo: 'carregar_mais' });
      }).catch(function (e) { if (e && e.name !== 'AbortError') { a.removeAttribute('aria-busy'); a.textContent = 'Carregar mais'; } });
      return;
    }
    if ((a = ev.target.closest('#paginacao a[data-pagina]'))) {
      ev.preventDefault();
      aplicar(lerURL(new URL(a.href, location.origin).search), { rolarTopo: true });
      return;
    }
    // ir para a ficha: guarda de onde saiu, para voltar ao mesmo ponto
    if ((a = ev.target.closest('a[href^="/comprar/imoveis/"]'))) {
      guardarRolagem();
      try { sessionStorage.setItem('eh_ultima_busca', location.pathname + location.search); } catch (e) {}
    }
  });

  /* ── Voltar: restaura filtros, página e posição ───────────── */

  function guardarRolagem() {
    try { sessionStorage.setItem('eh_rolagem:' + location.pathname + location.search, String(window.scrollY)); } catch (e) {}
  }
  function restaurarRolagem() {
    try {
      var y = sessionStorage.getItem('eh_rolagem:' + location.pathname + location.search);
      // 'instant' ignora o scroll-behavior: smooth do tema — restauração não é animação
      if (y !== null) window.scrollTo({ top: Number(y), behavior: 'instant' });
    } catch (e) {}
  }

  window.addEventListener('popstate', function () {
    aplicar(lerURL(), { semHistorico: true }).then(restaurarRolagem);
  });
  window.addEventListener('pagehide', guardarRolagem);

  /* ── Início: o HTML já veio pronto; só liga o que precisa ───── */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  pintarChips(estado);
  sincronizarForm(estado);
  if (EH.ligarComparacao) EH.ligarComparacao(document);
  try { sessionStorage.setItem('eh_ultima_busca', location.pathname + location.search); } catch (e) {}
  restaurarRolagem();
  medir('property_list_view', { total: inicial.total, pagina: inicial.pagina, ordem: inicial.ordem, modo: 'servidor' });
})();

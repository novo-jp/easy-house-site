/**
 * aluguel-busca.js — a busca de apartamentos para alugar, no navegador.
 *
 * Derivado de casas-busca.js (mesma estrutura, mesmas três regras): a
 * página chega pronta do servidor (api/aluguel-lista.mjs) e este arquivo só
 * entra por cima, para evitar recarregar a página a cada toque. Tudo que ele
 * faz tem um equivalente sem JavaScript.
 *
 *   1. O painel de filtros é um RASCUNHO: mexer nele só atualiza o botão
 *      "Mostrar X imóveis". A lista muda quando a pessoa toca no botão.
 *   2. Uma consulta nova cancela a anterior (AbortController).
 *   3. As opções do painel são reconciliadas a cada resposta: contagens
 *      novas, opção sem resultado fica apagada com o motivo — nunca somem.
 *
 * O que só existe aqui (não há na busca de casas):
 *   - o detalhamento de custos ("Ver o que está incluso"), calculado com o
 *     mesmo custos.js que o servidor usou para o número do card;
 *   - a troca foto ⇄ planta dentro do card.
 *
 * Ao corrigir um bug de comportamento aqui, olhe o casas-busca.js: a chance
 * de ele ter o mesmo é alta.
 */
(function () {
  'use strict';

  var EH = window.EHCasas || {};
  var Cartao = window.EHCartaoAluguel;
  var Custos = window.EHCustos;
  var medir = EH.medir || function () {};
  var grade = document.getElementById('resultados');
  var dadosEl = document.getElementById('dadosBusca');
  if (!grade || !dadosEl || !Cartao) return;

  var CAMINHO = '/imoveis';
  var API = '/api/aluguel';
  var POR_PAGINA = '18';
  var ORDEM_PADRAO = 'aluguel_asc';
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
  var verificadoEm = inicial.verificadoEm || null;

  /** Imóveis já vistos nesta visita, pelo código — o modal de custos lê daqui. */
  var acervoVisto = {};
  function lembrar(itens) { (itens || []).forEach(function (a) { acervoVisto[a.codigo] = a; }); }
  lembrar(inicial.itens);

  function esc(s) { return Cartao.esc(s); }
  function yen(v) { return Cartao.yen(Number(v)); }
  function clonar(o) { return JSON.parse(JSON.stringify(o)); }

  /* ── Estado ⇄ URL ─────────────────────────────────────────── */

  var MULTI = { cidade: 'cidades', quartos: 'quartos', planta: 'plantas', disponivel: 'disponivel' };
  var NUM = ['aluguelMin', 'aluguelMax', 'mensalMax', 'entradaMax', 'areaMin', 'estacaoMax'];
  var UM = ['pet', 'internet', 'luva', 'deposito'];

  function lerURL(search) {
    var p = new URLSearchParams(search === undefined ? window.location.search : search);
    var f = { q: p.get('q') || null, cidades: [], quartos: [], plantas: [], disponivel: [] };
    Object.keys(MULTI).forEach(function (k) {
      f[MULTI[k]] = (p.get(k) || '').split(',').map(function (s) { return s.trim().toLowerCase().replace('+', ''); }).filter(Boolean);
    });
    NUM.forEach(function (k) { var v = p.get(k); f[k] = v && isFinite(Number(v)) ? Number(v) : null; });
    UM.forEach(function (k) { f[k] = p.get(k) || null; });
    return { filtros: f, ordem: p.get('ordem') || ORDEM_PADRAO, pagina: Math.max(1, Number(p.get('pagina')) || 1) };
  }

  function paraParams(estado) {
    var f = estado.filtros, p = new URLSearchParams();
    if (f.q) p.set('q', f.q);
    Object.keys(MULTI).forEach(function (k) { if (f[MULTI[k]] && f[MULTI[k]].length) p.set(k, f[MULTI[k]].join(',')); });
    NUM.forEach(function (k) { if (f[k] !== null && f[k] !== undefined) p.set(k, String(f[k])); });
    UM.forEach(function (k) { if (f[k]) p.set(k, f[k]); });
    if (estado.ordem && estado.ordem !== ORDEM_PADRAO) p.set('ordem', estado.ordem);
    if (estado.pagina > 1) p.set('pagina', String(estado.pagina));
    return p;
  }

  function urlDe(estado) { var q = paraParams(estado).toString(); return CAMINHO + (q ? '?' + q : ''); }

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
  var aplicado = estado;

  /* ── Requests canceláveis ─────────────────────────────────── */

  function consultar(estado, extra, ref) {
    if (ref.atual) ref.atual.abort();
    var ctrl = new AbortController();
    ref.atual = ctrl;
    var p = paraParams(estado);
    p.set('porPagina', POR_PAGINA);
    p.set('pagina', String(estado.pagina || 1));
    Object.keys(extra || {}).forEach(function (k) { p.set(k, extra[k]); });
    return fetch(API + '?' + p.toString(), { headers: { Accept: 'application/json' }, signal: ctrl.signal })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { if (ref.atual !== ctrl) throw new DOMException('obsoleto', 'AbortError'); return d; });
  }
  var refLista = { atual: null }, refContagem = { atual: null };

  /* ── Render ───────────────────────────────────────────────── */

  function rotuloChip(k, v) {
    var r = ROTULOS;
    switch (k) {
      case 'q': return 'Busca: “' + v + '”';
      case 'cidades': return 'Cidade: ' + ((r.cidade || {})[v] || v);
      case 'quartos': return v === '3' ? '3 quartos ou mais' : v + ' quarto' + (v === '1' ? '' : 's');
      case 'plantas': return 'Planta: ' + String(v).toUpperCase();
      case 'aluguelMin': return 'Aluguel: a partir de ' + yen(v);
      case 'aluguelMax': return 'Aluguel: até ' + yen(v);
      case 'mensalMax': return 'Custo mensal: até ' + yen(v);
      case 'entradaMax': return 'Entrada: até ' + yen(v);
      case 'areaMin': return 'Área: a partir de ' + v + ' m²';
      case 'estacaoMax': return 'Estação: até ' + v + ' min a pé';
      case 'pet': return 'Aceita pet';
      case 'internet': return 'Internet inclusa';
      case 'luva': return 'Sem luva (礼金)';
      case 'deposito': return 'Sem depósito (敷金)';
      case 'disponivel': return { imediata: 'Entrada imediata', prevista: 'Entrada com data prevista' }[v] || v;
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
      var sem = clonar(estado);
      if (Array.isArray(sem.filtros[par[0]])) sem.filtros[par[0]] = sem.filtros[par[0]].filter(function (x) { return x !== par[1]; });
      else sem.filtros[par[0]] = null;
      sem.pagina = 1;
      return '<a class="tag-ativa" href="' + esc(urlDe(sem)) + '" data-remover="' + esc(par[0]) + '" data-valor="' + esc(par[1]) + '" rel="nofollow">'
        + esc(rotuloChip(par[0], par[1])) + ' <span class="tag-ativa__x" aria-hidden="true">×</span><span class="sr-only"> — remover este filtro</span></a>';
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

  var NOMES = { q: 'a busca por texto', cidades: 'as cidades', quartos: 'os quartos', plantas: 'a planta',
    aluguelMin: 'o aluguel mínimo', aluguelMax: 'o aluguel máximo', mensalMax: 'o custo mensal máximo',
    entradaMax: 'a entrada máxima', areaMin: 'a área mínima', estacaoMax: 'a distância da estação',
    pet: 'aceita pet', internet: 'internet inclusa', luva: 'sem luva', deposito: 'sem depósito', disponivel: 'a disponibilidade' };

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
    var msg = 'Olá! Procuro um apartamento para alugar em Aichi' + (descricao ? ' (' + descricao + ')' : '') + ' e não encontrei no site da Easy House. Podem me ajudar a achar algo assim?';
    grade.insertAdjacentHTML('afterend', '<div class="aviso-vazio" id="avisoVazio" role="status">'
      + '<h2>Nenhum apartamento com todos esses filtros</h2>'
      + (descricao ? '<p class="aviso-vazio__filtros">Você pediu: <strong>' + esc(descricao) + '</strong>.</p>' : '')
      + (sug.length ? '<p>O que mais está limitando a busca é <strong>' + esc(NOMES[sug[0].filtro] || sug[0].filtro) + '</strong>: sem esse filtro voltariam ' + sug[0].voltariam + ' imóveis. Você escolhe o que afrouxar — nada muda sozinho.</p>' : '')
      + '<div class="aviso-vazio__acoes">' + acoes + '<a class="btn btn--ghost" href="' + CAMINHO + '" rel="nofollow">Limpar todos os filtros</a></div>'
      + '<p class="aviso-vazio__ajuda">Prefere que a gente procure? A lista tem só o que a busca salva no portal alcança — há imóveis fora dela. '
      + '<a href="https://wa.me/' + Cartao.WHATSAPP + '?text=' + encodeURIComponent(msg) + '" data-cta="busca_vazia_aluguel" rel="nofollow">Pedir ajuda pelo WhatsApp</a> — abre o WhatsApp com a sua busca já descrita.</p></div>');
    medir('search_no_results', { filtros: ativos(f).map(function (p) { return p[0]; }).join(',') || null, tipo: 'aluguel' });
  }

  function pintarLista(d, estado, anexar) {
    lembrar(d.itens);
    var html = d.itens.map(function (a, i) { return Cartao.cartao(a, { prioridade: !anexar && i === 0 }); }).join('');
    if (anexar) grade.insertAdjacentHTML('beforeend', html); else grade.innerHTML = html;
    grade.removeAttribute('aria-busy');
    grade.setAttribute('data-pagina', d.pagina);
  }

  function pintarContagem(d) {
    var quando = d.verificadoEm ? Cartao.diaMes(d.verificadoEm) : (verificadoEm ? Cartao.diaMes(verificadoEm) : null);
    elContagem.innerHTML = '<strong>' + d.total + '</strong> ' + (d.total === 1 ? 'apartamento' : 'apartamentos')
      + (d.total !== d.totalAcervo ? ' <span class="barra__de">de ' + d.totalAcervo + '</span>' : '')
      + (quando ? ' <span class="barra__de">· lista verificada em ' + esc(quando) + '</span>' : '');
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
    ajustar('cidade', fac.cidades, function (it) { return 'Nenhum imóvel em ' + it.valor + ' com os filtros atuais'; });
    ajustar('quartos', fac.quartos.map(function (q) { return { chave: q.valor, total: q.total }; }));
    ajustar('planta', fac.plantas);
    ajustar('disponivel', ['imediata', 'prevista'].map(function (k) { return { chave: k, total: fac.disponivel[k] }; }));
    ajustar('luva', [{ chave: 'sem', total: fac.luva.sem }]);
    ajustar('deposito', [{ chave: 'sem', total: fac.deposito.sem }]);
    ajustar('pet', [{ chave: 'sim', total: fac.pet.sim }], function () { return 'Nenhum imóvel conferido aceita pet com os filtros atuais'; });
    ajustar('internet', [{ chave: 'sim', total: fac.internet.sim }], function () { return 'Nenhum imóvel conferido com internet inclusa nos filtros atuais'; });
    var legCidades = formFiltros.querySelector('[data-cidades] legend .conta');
    if (legCidades) legCidades.textContent = fac.cidades.reduce(function (s, c) { return s + c.total; }, 0);
    if (fac.semDado) {
      Array.prototype.forEach.call(formFiltros.querySelectorAll('.painel__nota'), function (n) {
        n.textContent = n.textContent
          .replace(/^\d+ dos resultados atuais não informam a caminhada[^—]*— \d+ deles/, fac.semDado.estacao + ' dos resultados atuais não informam a caminhada até a estação e continuam aparecendo — ' + fac.semDado.onibus + ' deles')
          .replace(/^\d+ dos resultados atuais não informam a área/, fac.semDado.area + ' dos resultados atuais não informam a área');
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
    grade.setAttribute('aria-busy', 'true');
    var antigo = document.getElementById('avisoVazio'); if (antigo) antigo.remove();

    return consultar(estado, null, refLista).then(function (d) {
      aplicado = estado;
      if (d.urlCanonica && d.urlCanonica !== '?' + paraParams(estado).toString() && d.filtros) {
        estado = lerURL(d.urlCanonica); aplicado = estado;
        window.history.replaceState({ busca: true }, '', urlDe(estado));
      }
      pintarContagem(d); pintarOrdem(d); pintarChips(estado); pintarLista(d, estado, false);
      pintarPaginacao(d, estado); pintarCarregarMais(d, estado); pintarVazio(d, estado);
      reconciliar(d.facetas, estado.filtros);
      sincronizarForm(estado);
      if (nVer) nVer.textContent = d.total;
      try { sessionStorage.setItem('eh_ultima_busca_aluguel', urlDe(estado)); } catch (e) {}
      if (opcoes.rolarTopo) rolarParaResultados();
      medir('property_list_view', { total: d.total, pagina: d.pagina, ordem: d.ordem, tipo: 'aluguel' });
      if (opcoes.medirBusca) medir('search_performed', { filtros: ativos(estado.filtros).map(function (p) { return p[0]; }).join(',') || null, tipo: 'aluguel' });
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

  function sincronizarForm(estado) {
    var f = estado.filtros;
    if (campoBusca) campoBusca.value = f.q || '';
    var alR = document.getElementById('aluguelMaxRapido');
    if (alR) alR.value = f.aluguelMax !== null && alR.querySelector('option[value="' + f.aluguelMax + '"]') ? String(f.aluguelMax) : '';
    var qR = document.getElementById('quartosRapido');
    if (qR) qR.value = f.quartos.length === 1 ? f.quartos[0] : '';
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
      onde: f.cidades.map(function (v) { return (ROTULOS.cidade || {})[v] || v; }),
      preco: [].concat(f.aluguelMin !== null ? ['de ' + yen(f.aluguelMin)] : [], f.aluguelMax !== null ? ['até ' + yen(f.aluguelMax)] : [],
        f.mensalMax !== null ? ['mensal até ' + yen(f.mensalMax)] : [], f.entradaMax !== null ? ['entrada até ' + yen(f.entradaMax)] : [],
        f.luva ? ['sem luva'] : [], f.deposito ? ['sem depósito'] : []),
      tamanho: [].concat(f.quartos.map(function (v) { return v === '3' ? '3+ quartos' : v + ' q.'; }), f.plantas.map(function (v) { return v.toUpperCase(); }), f.areaMin !== null ? [f.areaMin + ' m²+'] : []),
      quando: f.disponivel.map(function (v) { return v === 'imediata' ? 'imediata' : 'com data'; }),
      rotina: f.estacaoMax !== null ? ['≤ ' + f.estacaoMax + ' min'] : [],
      comod: [].concat(f.pet ? ['pet'] : [], f.internet ? ['internet'] : [])
    };
    Object.keys(r).forEach(function (k) {
      var el = formFiltros.querySelector('[data-resumo="' + k + '"]'); if (!el) return;
      var itens = r[k];
      el.textContent = itens.length > 2 ? itens.slice(0, 2).join(', ') + ' +' + (itens.length - 2) : itens.join(', ');
    });
  }

  function leituraDePreco() {
    var el = document.getElementById('leituraPreco'); if (!el) return;
    var mn = Number((document.getElementById('aluguelMin') || {}).value) || null;
    var mx = Number((document.getElementById('aluguelMax') || {}).value) || null;
    var partes = [];
    if (mn) partes.push('a partir de ' + yen(mn));
    if (mx) partes.push('até ' + yen(mx));
    el.textContent = partes.length ? 'Entendido: aluguel ' + partes.join(', ') + ' por mês' : '';
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
    sincronizarForm(aplicado);
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
    if (!aplicarRascunho) sincronizarForm(aplicado);
  }

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
      medir('filter_used', { filtros: ativos(novo.filtros).map(function (p) { return p[0]; }).join(',') || 'nenhum', tipo: 'aluguel' });
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
    var am = fd.get('aluguelMax'); novo.filtros.aluguelMax = am ? Number(am) : null;
    var qu = fd.get('quartos'); novo.filtros.quartos = qu ? [String(qu)] : [];
    novo.pagina = 1;
    aplicar(novo, { medirBusca: true, rolarTopo: true });
  });

  if (selOrdem) selOrdem.addEventListener('change', function () {
    var novo = clonar(estado); novo.ordem = selOrdem.value; novo.pagina = 1;
    aplicar(novo);
    medir('filter_used', { filtros: 'ordem:' + selOrdem.value, tipo: 'aluguel' });
  });
  if (formOrdem) formOrdem.addEventListener('submit', function (ev) { ev.preventDefault(); });

  /* ── Modal de custos ("Ver o que está incluso") ───────────── */

  var modal = document.getElementById('modalCustos');
  var focoModal = null;

  function linhaCusto(item) {
    return '<tr><td>' + esc(item.pt) + (item.jp ? '<span class="jp" lang="ja">' + esc(item.jp) + '</span>' : '')
      + (item.detalhe ? '<span class="det">' + esc(item.detalhe) + '</span>' : '') + '</td><td>' + esc(Custos.iene(item.valor)) + '</td></tr>';
  }

  function abrirCustos(codigo, incluirVaga) {
    var a = acervoVisto[codigo];
    if (!a || !modal || !Custos) return false;
    var temVaga = !!a.vaga;
    if (incluirVaga === undefined) incluirVaga = temVaga;
    var c = Custos.calcular({ aluguel: a.aluguel || 0, condominio: a.condominio || 0, estacionamento: a.vaga || 0,
      tem_estacionamento: a.temVaga, deposito: a.deposito || 0, luva: a.luva || 0 }, { estacionamento: incluirVaga ? (a.vaga || 0) : 0 });

    document.getElementById('modalSub').textContent = a.titulo + (a.cidade ? ' · ' + a.cidade : '') + (a.planta ? ' · ' + a.planta : '');

    var html = '<table class="custos"><caption>Todo mês</caption><tbody>'
      + '<tr><td>Aluguel<span class="jp" lang="ja">家賃</span></td><td>' + esc(Custos.iene(c.aluguel)) + '</td></tr>'
      + (c.condominio ? '<tr><td>Taxa de condomínio<span class="jp" lang="ja">共益費</span></td><td>' + esc(Custos.iene(c.condominio)) + '</td></tr>' : '')
      + (c.estacionamento ? '<tr><td>Vaga de estacionamento<span class="jp" lang="ja">駐車場</span></td><td>' + esc(Custos.iene(c.estacionamento)) + '</td></tr>' : '')
      + '<tr><td>Empresa garantidora<span class="jp" lang="ja">保証委託料</span><span class="det">2,2% do total</span></td><td>' + esc(Custos.iene(c.garantiaMensal)) + '</td></tr>'
      + '<tr><td>Suporte 24h<span class="jp" lang="ja">ruumサポート</span></td><td>' + esc(Custos.iene(c.suporte)) + '</td></tr>'
      + '<tr class="total"><td>Total por mês</td><td>' + esc(Custos.iene(c.mensal)) + '</td></tr>'
      + '</tbody></table>'
      + '<table class="custos"><caption>Para entrar (pagamento único)</caption><tbody>'
      + c.itens.map(linhaCusto).join('')
      + '<tr class="total"><td>Total da entrada</td><td>' + esc(Custos.iene(c.entrada)) + '</td></tr>'
      + '</tbody></table>'
      + (temVaga
        ? '<label class="opcao-vaga"><input type="checkbox" id="modalVaga"' + (incluirVaga ? ' checked' : '') + '>'
          + '<span>Incluir <b>vaga de estacionamento</b> (' + esc(Custos.iene(a.vaga)) + '/mês). A vaga entra no aluguel mensal e também na taxa de intermediação.</span></label>'
        : '<p class="muted" style="margin:14px 0 4px">Este imóvel não tem vaga de estacionamento informada pelo portal.</p>')
      + '<div class="cartao-box">'
      + '<p><strong>Dá para pagar no cartão de crédito.</strong> Há um acréscimo de 3,6% sobre o valor, e o parcelamento é combinado no atendimento.</p>'
      + '<div class="linha"><span>Entrada no cartão</span><b>' + esc(Custos.iene(c.entradaCartao)) + '</b></div>'
      + '<div class="linha"><span>Acréscimo</span><span>' + esc(Custos.iene(c.acrescimoCartao)) + '</span></div>'
      + '</div>'
      + '<p class="muted" style="margin-top:16px">Estimativa com ' + c.dias + ' dias de diária no primeiro mês. O valor final muda conforme a data de entrada, a vaga e as condições do proprietário. Confirmamos tudo por escrito antes de qualquer pagamento.</p>'
      + '<div class="btn-row" style="margin-top:20px"><a class="btn btn--wa" href="' + esc(Cartao.linkWhatsApp(a)) + '" target="_blank" rel="noopener" data-cta="modal_custos" data-imovel="' + esc(a.codigo) + '">Pedir orçamento exato</a></div>';

    document.getElementById('modalCorpo').innerHTML = html;
    var chk = document.getElementById('modalVaga');
    if (chk) chk.addEventListener('change', function () { abrirCustos(codigo, chk.checked); });
    if (modal.hidden) {
      focoModal = document.activeElement;
      modal.hidden = false;
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
      modal.querySelector('.modal__fechar').focus();
      medir('rent_costs_opened', { property_id: codigo });
    }
    return true;
  }

  function fecharCustos() {
    if (!modal || modal.hidden) return;
    modal.classList.remove('open');
    modal.hidden = true;
    document.body.style.overflow = '';
    if (focoModal && focoModal.focus) focoModal.focus();
  }

  if (modal) {
    modal.addEventListener('click', function (e) { if (e.target.hasAttribute('data-fechar')) fecharCustos(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) fecharCustos(); });
  }

  /* ── Cliques delegados ────────────────────────────────────── */

  document.addEventListener('click', function (ev) {
    var a;
    if (!ev.target.closest) return;
    if ((a = ev.target.closest('#abrirFiltros'))) { ev.preventDefault(); abrirPainel(); return; }
    if ((a = ev.target.closest('[data-fechar-painel]'))) { ev.preventDefault(); fecharPainel(false); return; }

    // foto ⇄ planta dentro do card
    if ((a = ev.target.closest('[data-slide-ir]'))) {
      ev.preventDefault();
      var midia = a.closest('.alu__midia'); if (!midia) return;
      var n = a.getAttribute('data-slide-ir');
      midia.setAttribute('data-slide', n);
      var foto = midia.querySelector('.alu__img--foto'), planta = midia.querySelector('.alu__img--planta');
      if (foto) foto.hidden = n !== '0';
      if (planta) planta.hidden = n !== '1';
      Array.prototype.forEach.call(midia.querySelectorAll('[data-slide-ir]'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-slide-ir') === n ? 'true' : 'false'); });
      return;
    }

    if ((a = ev.target.closest('[data-custos]'))) {
      if (abrirCustos(a.getAttribute('data-custos'))) ev.preventDefault();   // sem dado, o link leva à página explicativa
      return;
    }

    if ((a = ev.target.closest('.tag-ativa[data-remover], #limparTudo, [data-sugestao]'))) {
      ev.preventDefault();
      var novo = lerURL(new URL(a.href, location.origin).search); novo.pagina = 1;
      aplicar(novo);
      medir('filter_used', { filtros: a.id === 'limparTudo' ? 'limpar' : 'remover:' + (a.getAttribute('data-remover') || a.getAttribute('data-sugestao')), tipo: 'aluguel' });
      return;
    }
    if ((a = ev.target.closest('#carregarMais'))) {
      ev.preventDefault();
      var prox = lerURL(new URL(a.href, location.origin).search);
      a.setAttribute('aria-busy', 'true'); a.textContent = 'Carregando…';
      consultar(prox, null, refLista).then(function (d) {
        estado = prox; aplicado = prox;
        window.history.replaceState({ busca: true }, '', urlDe(prox));
        var antes = grade.children.length;
        pintarLista(d, prox, true); pintarPaginacao(d, prox); pintarCarregarMais(d, prox);
        var primeiroNovo = grade.children[antes], alvo = primeiroNovo && primeiroNovo.querySelector('.alu__wa');
        if (alvo) alvo.focus({ preventScroll: true });
        medir('property_list_view', { total: d.total, pagina: d.pagina, ordem: d.ordem, modo: 'carregar_mais', tipo: 'aluguel' });
      }).catch(function (e) { if (e && e.name !== 'AbortError') { a.removeAttribute('aria-busy'); a.textContent = 'Carregar mais'; } });
      return;
    }
    if ((a = ev.target.closest('#paginacao a[data-pagina]'))) {
      ev.preventDefault();
      aplicar(lerURL(new URL(a.href, location.origin).search), { rolarTopo: true });
      return;
    }
  });

  /* ── Voltar: restaura filtros, página e posição ───────────── */

  function guardarRolagem() {
    try { sessionStorage.setItem('eh_rolagem:' + location.pathname + location.search, String(window.scrollY)); } catch (e) {}
  }
  function restaurarRolagem() {
    try {
      var y = sessionStorage.getItem('eh_rolagem:' + location.pathname + location.search);
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
  try { sessionStorage.setItem('eh_ultima_busca_aluguel', location.pathname + location.search); } catch (e) {}
  restaurarRolagem();
  medir('property_list_view', { total: inicial.total, pagina: inicial.pagina, ordem: inicial.ordem, modo: 'servidor', tipo: 'aluguel' });
})();

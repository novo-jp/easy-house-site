/**
 * casas-comum.js — o que a busca e a página do imóvel compartilham:
 * favoritos e medição. Carregado por todas as páginas do portal.
 *
 * Sem framework, como o resto do site.
 */
(function () {
  'use strict';

  var CHAVE = 'eh_casas_favoritas';
  var WHATSAPP = '818028867708';

  /* ── Favoritos ──────────────────────────────────────────────
     localStorage porque o site não tem login. Toda leitura é
     protegida: em aba anônima ou com cookies bloqueados o acesso
     lança, e uma página inteira não pode quebrar por causa disso. */

  function lerFavoritos() {
    try {
      var bruto = window.localStorage.getItem(CHAVE);
      if (!bruto) return [];
      var lista = JSON.parse(bruto);
      return Array.isArray(lista) ? lista.filter(function (c) { return typeof c === 'string'; }).slice(0, 200) : [];
    } catch (e) { return []; }
  }

  function gravarFavoritos(lista) {
    try { window.localStorage.setItem(CHAVE, JSON.stringify(lista)); return true; }
    catch (e) { return false; }
  }

  function ehFavorito(codigo) { return lerFavoritos().indexOf(codigo) !== -1; }

  function alternarFavorito(codigo) {
    var lista = lerFavoritos();
    var i = lista.indexOf(codigo);
    if (i === -1) lista.push(codigo); else lista.splice(i, 1);
    gravarFavoritos(lista);
    var agora = i === -1;
    window.dispatchEvent(new CustomEvent('favoritos:mudou', { detail: { codigo: codigo, ativo: agora, total: lista.length } }));
    return agora;
  }

  /* ── Medição ────────────────────────────────────────────────
     Mesma camada que o funil já usa (window.dataLayer). Nada de
     dado pessoal: só o imóvel e de onde o clique saiu. */

  function idDeSessao() {
    try {
      var id = window.sessionStorage.getItem('eh_session');
      if (!id) {
        id = 'S' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        window.sessionStorage.setItem('eh_session', id);
      }
      return id;
    } catch (e) { return 'anon'; }
  }

  function medir(evento, dados) {
    var carga = {};
    for (var k in dados) {
      if (Object.prototype.hasOwnProperty.call(dados, k) && dados[k] != null) carga[k] = dados[k];
    }

    // 1) camada de dados para GTM/GA4
    try {
      window.dataLayer = window.dataLayer || [];
      var paraGtm = { event: evento };
      for (var g in carga) paraGtm[g] = carga[g];
      window.dataLayer.push(paraGtm);
    } catch (e) { /* medir nunca pode quebrar a página */ }

    // 2) medição de primeira parte — não depende de GTM nem do aceite de
    //    publicidade, e é o que responde "qual CTA trouxe este lead".
    try {
      navigator.sendBeacon('/api/event', new Blob([JSON.stringify({
        event: evento,
        sessionId: idDeSessao(),
        step: window.location.pathname,
        payload: carga
      })], { type: 'application/json' }));
    } catch (e) { /* idem */ }
  }

  /** Todo link de WhatsApp é medido com o CTA de origem, sem precisar de onclick no HTML. */
  function ligarMedicaoWhatsApp(escopo) {
    (escopo || document).addEventListener('click', function (ev) {
      var a = ev.target.closest && ev.target.closest('a[href*="wa.me"]');
      if (!a) return;
      var cta = a.getAttribute('data-cta') || 'desconhecido';
      var base = { cta_position: cta, property_id: a.getAttribute('data-imovel') || null };
      medir('whatsapp_click', base);
      if (base.property_id) medir('whatsapp_property_click', base);
      if (/simula|financiamento/.test(cta)) medir('whatsapp_simulation_click', base);
      if (/visita/.test(cta)) medir('whatsapp_visit_click', base);
    });
  }

  /** Botões de coração: estado inicial + alternância. */
  function ligarFavoritos(escopo) {
    var raiz = escopo || document;

    function sincronizar(botao) {
      var codigo = botao.getAttribute('data-favoritar');
      var ativo = ehFavorito(codigo);
      var nome = botao.getAttribute('data-nome') || nomeDoCard(botao) || codigo;
      botao.setAttribute('aria-pressed', ativo ? 'true' : 'false');
      botao.setAttribute('aria-label', (ativo ? 'Remover ' : 'Salvar ') + nome + (ativo ? ' dos favoritos' : ' nos favoritos'));
      var txt = botao.querySelector('.acao__txt');
      if (txt) txt.textContent = ativo ? 'Salvo' : 'Salvar';
    }

    Array.prototype.forEach.call(raiz.querySelectorAll('[data-favoritar]'), sincronizar);

    if (raiz.__favoritosLigados) return;
    raiz.__favoritosLigados = true;

    raiz.addEventListener('click', function (ev) {
      var botao = ev.target.closest && ev.target.closest('[data-favoritar]');
      if (!botao) return;
      ev.preventDefault();
      ev.stopPropagation();                        // não seguir o link do card
      var codigo = botao.getAttribute('data-favoritar');
      var ativo = alternarFavorito(codigo);
      sincronizar(botao);
      medir('property_favorite', { property_id: codigo, acao: ativo ? 'salvou' : 'removeu' });
    });

    window.addEventListener('favoritos:mudou', function () {
      Array.prototype.forEach.call(document.querySelectorAll('[data-favoritar]'), sincronizar);
      atualizarContador();
    });
    atualizarContador();
  }

  /** Título do card ao qual o botão pertence (para o nome acessível). */
  function nomeDoCard(botao) {
    var card = botao.closest && botao.closest('.casa, .imovel');
    var h = card && card.querySelector('.casa__nome, .imovel__titulo');
    return h ? h.textContent.trim() : null;
  }

  /* ── Comparação ─────────────────────────────────────────────
     Até três códigos no localStorage, como os favoritos. A bandeja
     aparece quando há dois — antes disso não há o que comparar. */

  var CHAVE_COMP = 'eh_casas_comparar';
  var MAX_COMP = 3;

  function lerComparacao() {
    try {
      var lista = JSON.parse(window.localStorage.getItem(CHAVE_COMP) || '[]');
      return Array.isArray(lista) ? lista.filter(function (c) { return typeof c === 'string'; }).slice(0, MAX_COMP) : [];
    } catch (e) { return []; }
  }
  function gravarComparacao(lista) {
    try { window.localStorage.setItem(CHAVE_COMP, JSON.stringify(lista.slice(0, MAX_COMP))); } catch (e) {}
    window.dispatchEvent(new CustomEvent('comparacao:mudou', { detail: { total: lista.length } }));
  }
  /** Devolve { ativo, cheio }: cheio = tentou o 4º. */
  function alternarComparacao(codigo) {
    var lista = lerComparacao();
    var i = lista.indexOf(codigo);
    if (i !== -1) { lista.splice(i, 1); gravarComparacao(lista); return { ativo: false, cheio: false }; }
    if (lista.length >= MAX_COMP) return { ativo: false, cheio: true };
    lista.push(codigo); gravarComparacao(lista);
    return { ativo: true, cheio: false };
  }

  function ligarComparacao(escopo) {
    var raiz = escopo || document;
    function sincronizar(botao) {
      var codigo = botao.getAttribute('data-comparar');
      var ativo = lerComparacao().indexOf(codigo) !== -1;
      var nome = nomeDoCard(botao) || codigo;
      botao.setAttribute('aria-pressed', ativo ? 'true' : 'false');
      botao.setAttribute('aria-label', (ativo ? 'Tirar ' : 'Adicionar ') + nome + (ativo ? ' da comparação' : ' à comparação'));
      var txt = botao.querySelector('.acao__txt');
      if (txt) txt.textContent = ativo ? 'Comparando' : 'Comparar';
    }
    Array.prototype.forEach.call(raiz.querySelectorAll('[data-comparar]'), sincronizar);
    if (raiz.__comparacaoLigada) return;
    raiz.__comparacaoLigada = true;

    raiz.addEventListener('click', function (ev) {
      var botao = ev.target.closest && ev.target.closest('[data-comparar]');
      if (!botao) return;
      ev.preventDefault();
      var codigo = botao.getAttribute('data-comparar');
      var r = alternarComparacao(codigo);
      if (r.cheio) { avisarBandeja('Você já tem 3 imóveis na comparação. Tire um para incluir outro.'); return; }
      sincronizar(botao);
      medir(r.ativo ? 'property_compare_started' : 'property_compare_removed', { property_id: codigo, total: lerComparacao().length });
    });
    window.addEventListener('comparacao:mudou', function () {
      Array.prototype.forEach.call(document.querySelectorAll('[data-comparar]'), sincronizar);
      atualizarBandeja();
    });
    atualizarBandeja();
  }

  function atualizarBandeja() {
    var bandeja = document.getElementById('bandejaComparar');
    if (!bandeja) return;
    var lista = lerComparacao();
    var mostrar = lista.length >= 2;
    bandeja.hidden = !mostrar;
    document.body.classList.toggle('tem-bandeja', mostrar);
    var n = document.getElementById('bandejaN'); if (n) n.textContent = String(lista.length);
    var ir = document.getElementById('bandejaIr'); if (ir) ir.href = '/comparar?ids=' + encodeURIComponent(lista.join(','));
    var limpar = document.getElementById('bandejaLimpar');
    if (limpar && !limpar.__ligado) { limpar.__ligado = true; limpar.addEventListener('click', function () { gravarComparacao([]); }); }
  }
  function avisarBandeja(texto) {
    var el = document.getElementById('avisoComparar');
    if (!el) {
      el = document.createElement('p');
      el.id = 'avisoComparar'; el.className = 'aviso-flutuante'; el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = texto;
    clearTimeout(el.__t); el.__t = setTimeout(function () { el.textContent = ''; }, 4000);
  }

  function atualizarContador() {
    var total = lerFavoritos().length;
    Array.prototype.forEach.call(document.querySelectorAll('[data-contador-favoritos]'), function (el) {
      el.textContent = total ? String(total) : '';
      el.hidden = total === 0;
    });
  }

  function formatarYen(v) {
    if (typeof v !== 'number' || !isFinite(v)) return '';
    return '¥' + Math.round(v).toLocaleString('pt-BR');
  }

  window.EHCasas = {
    lerFavoritos: lerFavoritos,
    ehFavorito: ehFavorito,
    alternarFavorito: alternarFavorito,
    ligarFavoritos: ligarFavoritos,
    lerComparacao: lerComparacao,
    alternarComparacao: alternarComparacao,
    ligarComparacao: ligarComparacao,
    ligarMedicaoWhatsApp: ligarMedicaoWhatsApp,
    medir: medir,
    formatarYen: formatarYen,
    whatsapp: WHATSAPP
  };

  document.addEventListener('DOMContentLoaded', function () {
    ligarFavoritos(document);
    ligarComparacao(document);
    ligarMedicaoWhatsApp(document);
  });
})();

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
      botao.setAttribute('aria-pressed', ativo ? 'true' : 'false');
      botao.setAttribute('aria-label', (ativo ? 'Remover ' : 'Salvar ') + codigo + (ativo ? ' dos favoritos' : ' nos favoritos'));
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

  function atualizarContador() {
    var total = lerFavoritos().length;
    Array.prototype.forEach.call(document.querySelectorAll('[data-contador-favoritos]'), function (el) {
      el.textContent = total ? String(total) : '';
      el.hidden = total === 0;
    });
  }

  function formatarYen(v) {
    if (typeof v !== 'number' || !isFinite(v)) return '';
    return '¥' + Math.round(v).toLocaleString('ja-JP');
  }

  window.EHCasas = {
    lerFavoritos: lerFavoritos,
    ehFavorito: ehFavorito,
    alternarFavorito: alternarFavorito,
    ligarFavoritos: ligarFavoritos,
    ligarMedicaoWhatsApp: ligarMedicaoWhatsApp,
    medir: medir,
    formatarYen: formatarYen,
    whatsapp: WHATSAPP
  };

  document.addEventListener('DOMContentLoaded', function () {
    ligarFavoritos(document);
    ligarMedicaoWhatsApp(document);
  });
})();

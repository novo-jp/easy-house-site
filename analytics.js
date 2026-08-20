/**
 * EASY HOUSE — Medição (Meta Pixel) com consentimento
 *
 * Um único arquivo para todas as páginas. Responsabilidades:
 *   1. Pedir consentimento antes de carregar qualquer tag de publicidade.
 *   2. Carregar o Meta Pixel apenas se o consentimento for dado.
 *   3. Traduzir os eventos que o funil já publica em `window.dataLayer`
 *      para eventos do Meta, sem precisar alterar funnel.js / simular.js.
 *
 * Regra de privacidade: nenhum dado financeiro ou pessoal vai para o Meta.
 * A política publicada em /privacy promete que a medição recebe apenas nome
 * do evento, etapa e variante do teste — a lista PARAMS_PERMITIDOS abaixo é
 * o que garante isso na prática.
 */
(function () {
  'use strict';

  /* ============================================================
     Configuração
     ============================================================ */

  /**
   * ID do Meta Pixel.
   *
   * COLE AQUI o número que aparece no Gerenciador de Eventos do Meta
   * (Gerenciador de Eventos → Fontes de dados → o pixel → ID, 15-16 dígitos).
   *
   * Enquanto estiver vazio, nada é carregado e nenhum aviso aparece para o
   * visitante — o site continua funcionando normalmente.
   */
  var PIXEL_ID = '137135779491997';   // conjunto de dados "EASY HOUSE"

  var CONSENT_KEY = 'eh_consent_ads';
  var CONSENT_VERSION = '1';           // trocar obriga a perguntar de novo
  var POLICY_URL = '/privacy';

  /**
   * De evento do funil para evento do Meta.
   *
   * 'std'    → evento padrão do Meta (serve para otimizar campanha)
   * 'custom' → evento personalizado (serve para público e diagnóstico)
   *
   * `quick_question_completed` fica de fora de propósito: dispara seis vezes
   * por sessão e só polui o pixel.
   */
  var MAPA = {
    simulation_started:         { tipo: 'std',    nome: 'ViewContent' },
    quick_simulation_completed: { tipo: 'std',    nome: 'CompleteRegistration' },
    preliminary_result_viewed:  { tipo: 'custom', nome: 'ResultadoPreliminar' },
    full_simulation_started:    { tipo: 'custom', nome: 'SimulacaoCompletaIniciada' },
    lead_form_viewed:           { tipo: 'std',    nome: 'InitiateCheckout' },
    lead_submitted:             { tipo: 'std',    nome: 'Lead' },
    simulation_result_viewed:   { tipo: 'custom', nome: 'ResultadoCompleto' },
    whatsapp_clicked:           { tipo: 'std',    nome: 'Contact' }
  };

  /**
   * Únicos parâmetros que podem chegar ao Meta.
   * Tudo que não estiver aqui é descartado, mesmo que alguém envie por engano.
   */
  var PARAMS_PERMITIDOS = ['variant', 'step'];

  /* ============================================================
     Consentimento
     ============================================================ */

  function lerConsentimento() {
    try {
      var bruto = localStorage.getItem(CONSENT_KEY);
      if (!bruto) return null;
      var v = JSON.parse(bruto);
      return v && v.version === CONSENT_VERSION ? v.status : null;
    } catch (e) {
      return null;                     // navegação privada: trata como sem resposta
    }
  }

  function gravarConsentimento(status) {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({
        status: status,
        version: CONSENT_VERSION,
        date: new Date().toISOString()
      }));
    } catch (e) { /* sem localStorage, vale só para esta página */ }
  }

  /* ============================================================
     Aviso de consentimento
     ============================================================ */

  var CSS = [
    '.eh-cc{position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;',
    'background:#fff;color:#12224A;border:1px solid #D9E0EC;border-radius:14px;',
    'box-shadow:0 10px 40px rgba(18,34,74,.22);padding:16px 18px;',
    'font:400 14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
    'max-width:560px;margin:0 auto;display:flex;flex-direction:column;gap:12px}',
    '.eh-cc p{margin:0}',
    '.eh-cc a{color:#12224A;text-decoration:underline}',
    '.eh-cc__acoes{display:flex;gap:10px;flex-wrap:wrap}',
    '.eh-cc button{flex:1;min-width:120px;cursor:pointer;border-radius:999px;',
    'padding:11px 18px;font:600 14px/1 inherit;border:2px solid #12224A;',
    'font-family:inherit}',
    '.eh-cc__sim{background:#12224A;color:#fff}',
    '.eh-cc__nao{background:#fff;color:#12224A}',
    '.eh-cc button:focus-visible{outline:3px solid #16A34A;outline-offset:2px}',
    '@media (prefers-reduced-motion:no-preference){',
    '.eh-cc{animation:eh-cc-in .25s ease-out}',
    '@keyframes eh-cc-in{from{transform:translateY(14px);opacity:0}}}'
  ].join('');

  function mostrarAviso() {
    var estilo = document.createElement('style');
    estilo.textContent = CSS;
    document.head.appendChild(estilo);

    var caixa = document.createElement('div');
    caixa.className = 'eh-cc';
    caixa.setAttribute('role', 'dialog');
    caixa.setAttribute('aria-live', 'polite');
    caixa.setAttribute('aria-label', 'Aviso sobre medição');
    caixa.innerHTML =
      '<p>Usamos medição para entender quais anúncios trazem pessoas até aqui. ' +
      'Não enviamos sua renda, suas dívidas nem seus dados de contato. ' +
      '<a href="' + POLICY_URL + '">Como funciona</a>.</p>' +
      '<div class="eh-cc__acoes">' +
      '<button type="button" class="eh-cc__sim">Aceitar</button>' +
      '<button type="button" class="eh-cc__nao">Recusar</button>' +
      '</div>';

    function responder(status) {
      gravarConsentimento(status);
      caixa.remove();
      if (status === 'granted') iniciarPixel();
    }

    caixa.querySelector('.eh-cc__sim').addEventListener('click', function () { responder('granted'); });
    caixa.querySelector('.eh-cc__nao').addEventListener('click', function () { responder('denied'); });

    document.body.appendChild(caixa);
    afastarDaBarraFixa(caixa);
  }

  /**
   * O aviso não pode cobrir uma barra de ação fixa.
   *
   * No simulador o botão principal fica numa barra fixa no rodapé. Como o aviso
   * também é fixo no rodapé, ele ficava exatamente por cima: no celular o
   * visitante não conseguia apertar "Calcular" e ia embora. Aqui o aviso é
   * empurrado para cima da barra sempre que ela existir e estiver fixa.
   */
  function afastarDaBarraFixa(caixa) {
    try {
      var barra = document.getElementById('fxActions');
      if (!barra) return;
      if (window.getComputedStyle(barra).position !== 'fixed') return;   // no desktop ela é estática
      var altura = barra.getBoundingClientRect().height;
      if (altura > 0) caixa.style.bottom = Math.round(altura + 12) + 'px';
    } catch (e) { /* na dúvida, deixa no rodapé */ }
  }

  /* ============================================================
     Meta Pixel
     ============================================================ */

  var pixelPronto = false;

  function carregarPixel() {
    /* Snippet oficial do Meta, com a fila `fbq` criada antes do script chegar. */
    if (window.fbq) return;
    var n = window.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!window._fbq) window._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
  }

  function iniciarPixel() {
    if (pixelPronto || !PIXEL_ID) return;
    carregarPixel();

    // Desliga a coleta automática do Meta. Precisa vir ANTES do init.
    //
    // Ligada, ela faz duas coisas que contradizem o que /privacy promete:
    // dispara SubscribedButtonClick a cada clique (levando junto o texto do
    // botão) e, pelo Automatic Advanced Matching, lê campos de formulário —
    // o que na etapa de contato significaria mandar nome, telefone e e-mail
    // ao Meta. Aqui só sai o que está no MAPA, e nada além disso.
    window.fbq('set', 'autoConfig', false, PIXEL_ID);
    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
    pixelPronto = true;
    escutarDataLayer();
  }

  /* ============================================================
     Ponte: dataLayer do funil  →  Meta
     ============================================================ */

  function limparParametros(origem) {
    var saida = {};
    for (var i = 0; i < PARAMS_PERMITIDOS.length; i++) {
      var chave = PARAMS_PERMITIDOS[i];
      var valor = origem[chave];
      if (valor != null && typeof valor !== 'object') saida[chave] = valor;
    }
    return saida;
  }

  function enviar(item) {
    if (!pixelPronto || !item || !item.event) return;
    var destino = MAPA[item.event];
    if (!destino) return;

    var params = limparParametros(item);
    var metodo = destino.tipo === 'std' ? 'track' : 'trackCustom';

    // O eventID permite ao Meta juntar este disparo com o do servidor
    // (Conversions API) e não contar a mesma conversão duas vezes.
    if (item.event === 'lead_submitted' && item.eventId) {
      window.fbq(metodo, destino.nome, params, { eventID: item.eventId });
    } else {
      window.fbq(metodo, destino.nome, params);
    }
  }

  /**
   * Passa a escutar tudo que for empurrado para o dataLayer daqui em diante.
   * O que aconteceu antes do consentimento não é reenviado — de propósito.
   */
  function escutarDataLayer() {
    window.dataLayer = window.dataLayer || [];
    var pushOriginal = window.dataLayer.push.bind(window.dataLayer);
    window.dataLayer.push = function () {
      for (var i = 0; i < arguments.length; i++) {
        try { enviar(arguments[i]); } catch (e) { /* medição nunca quebra a página */ }
      }
      return pushOriginal.apply(null, arguments);
    };
  }

  /* ============================================================
     Medição interna das landing pages
     ------------------------------------------------------------
     O simulador já registra tudo pelo funnel.js. As outras páginas
     (omatome, refinanciamento) não registravam nada: o clique no
     WhatsApp ia só para o Meta.

     Isso é cegueira, porque o Meta subconta — perde quem usa
     bloqueador e quem recusa a medição. Aqui mandamos o mesmo clique
     para o nosso `/api/event`, que é medição de primeira parte e não
     depende de aceite de publicidade.

     Os eventos usam nomes próprios (`lp_view`, `lp_whatsapp_clicked`)
     para não se misturarem com os do funil nas consultas existentes.
     ============================================================ */
  function idDeSessao() {
    var id = sessionStorage.getItem('eh_session');
    if (!id) {
      id = 'S' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem('eh_session', id);
    }
    return id;
  }

  function origemDaUrl() {
    var p = new URLSearchParams(location.search);
    var f = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid']
      .forEach(function (k) { var v = p.get(k); if (v) f[k] = v; });
    f.landing = location.pathname;
    return f;
  }

  function registrarInterno(evento) {
    try {
      navigator.sendBeacon('/api/event', new Blob([JSON.stringify({
        event: evento,
        sessionId: idDeSessao(),
        step: location.pathname,
        source: origemDaUrl(),
        payload: {}
      })], { type: 'application/json' }));
    } catch (e) { /* medição nunca quebra a página */ }
  }

  /** Só nas páginas que não são o funil — lá o funnel.js já cuida. */
  function ehLandingPage() {
    return !document.getElementById('fxMain');
  }

  function escutarWhatsApp() {
    document.addEventListener('click', function (ev) {
      var link = ev.target && ev.target.closest && ev.target.closest('a[href*="wa.me"]');
      if (!link || !ehLandingPage()) return;
      registrarInterno('lp_whatsapp_clicked');          // sempre
      if (pixelPronto) window.fbq('track', 'Contact');  // só com aceite
    }, true);
  }

  /* ============================================================
     Início
     ============================================================ */

  function iniciar() {
    // A medição interna independe do pixel e do aceite: é primeira parte.
    if (ehLandingPage()) registrarInterno('lp_view');

    escutarWhatsApp();

    if (!PIXEL_ID) return;             // sem ID configurado, nenhuma tag de anúncio

    var resposta = lerConsentimento();
    if (resposta === 'granted') iniciarPixel();
    else if (resposta !== 'denied') mostrarAviso();
  }

  function lerCookie(nome) {
    var m = document.cookie.match('(^|;)\\s*' + nome + '\\s*=\\s*([^;]+)');
    return m ? m.pop() : null;
  }

  window.ehConsent = {
    /** Permite rever a escolha a partir da página de privacidade. */
    status: lerConsentimento,
    revogar: function () {
      try { localStorage.removeItem(CONSENT_KEY); } catch (e) {}
      location.reload();
    },

    /**
     * Dados de atribuição que o servidor precisa para a Conversions API.
     * Devolve null sem consentimento — é o que impede o servidor de medir
     * alguém que recusou aqui no navegador.
     */
    atribuicao: function () {
      if (lerConsentimento() !== 'granted') return null;
      return {
        fbp: lerCookie('_fbp'),
        fbc: lerCookie('_fbc'),
        url: location.href.split('#')[0]
      };
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();

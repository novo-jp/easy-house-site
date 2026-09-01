/**
 * casas-imovel.js — galeria, compartilhamento e medição da página do imóvel.
 *
 * As fotos vêm em data-fotos no <main>: o HTML já traz as 5 primeiras
 * renderizadas e o resto só é criado quando a pessoa abre a tela cheia.
 * Um imóvel tem em média 20 fotos — carregar todas de saída desperdiçaria
 * dados de quem está no celular e nunca vai abrir a galeria.
 */
(function () {
  'use strict';

  var principal = document.querySelector('main.imovel');
  if (!principal) return;

  var EH = window.EHCasas || {};
  var medir = EH.medir || function () {};

  var fotos = [];
  try { fotos = JSON.parse(principal.getAttribute('data-fotos') || '[]'); } catch (e) { fotos = []; }

  var contexto = {
    property_id: principal.getAttribute('data-imovel'),
    city: principal.getAttribute('data-cidade') || null,
    prefecture: principal.getAttribute('data-prefeitura') || null,
    price: Number(principal.getAttribute('data-preco')) || null,
    source: 'reprice'
  };
  medir('property_view', contexto);

  /* ── Contador do carrossel (celular) ─────────────────────── */
  var trilho = document.getElementById('galeria');
  var contador = document.getElementById('contadorFotos');
  if (trilho && contador && fotos.length) {
    var pendente = false;
    trilho.addEventListener('scroll', function () {
      if (pendente) return;
      pendente = true;
      window.requestAnimationFrame(function () {
        pendente = false;
        var largura = trilho.clientWidth || 1;
        var i = Math.min(fotos.length, Math.round(trilho.scrollLeft / largura) + 1);
        contador.textContent = i + ' / ' + fotos.length;
      });
    }, { passive: true });
  }

  /* ── Tela cheia ──────────────────────────────────────────── */
  var caixa = document.getElementById('lightbox');
  var palco = document.getElementById('lightboxPalco');
  var rotulo = document.getElementById('lightboxContador');
  var montado = false;
  var focoAnterior = null;

  function montar() {
    if (montado || !palco) return;
    palco.innerHTML = fotos.map(function (src, i) {
      return '<div class="lightbox__item"><img src="' + src.replace(/"/g, '&quot;') +
             '" alt="Foto ' + (i + 1) + ' de ' + fotos.length +
             '" loading="lazy" decoding="async"></div>';
    }).join('');
    montado = true;
  }

  function indiceAtual() {
    if (!palco) return 0;
    return Math.round(palco.scrollLeft / (palco.clientWidth || 1));
  }

  function atualizarRotulo() {
    if (rotulo) rotulo.textContent = (indiceAtual() + 1) + ' / ' + fotos.length;
  }

  function irPara(i) {
    if (!palco || !palco.clientWidth) return;
    var alvo = Math.max(0, Math.min(fotos.length - 1, i));
    palco.scrollLeft = alvo * palco.clientWidth;   // a suavidade vem do CSS
    atualizarRotulo();
  }

  function abrir(inicio) {
    if (!caixa || !fotos.length) return;
    montar();
    focoAnterior = document.activeElement;
    caixa.setAttribute('open', '');
    document.body.style.overflow = 'hidden';
    // O palco só ganha largura depois que o navegador refaz o layout;
    // medir antes disso dava clientWidth 0 e a galeria abria sempre na foto 1.
    requestAnimationFrame(function () {
      if (typeof inicio === 'number' && palco.clientWidth) palco.scrollLeft = inicio * palco.clientWidth;
      atualizarRotulo();
    });
    var fechar = caixa.querySelector('[data-fechar-galeria]');
    if (fechar) fechar.focus();
    medir('gallery_open', contexto);
  }

  function fechar() {
    if (!caixa) return;
    caixa.removeAttribute('open');
    document.body.style.overflow = '';
    if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (t.closest('[data-abrir-galeria]')) { ev.preventDefault(); return abrir(0); }
    if (t.closest('[data-fechar-galeria]')) return fechar();
    if (t.closest('[data-foto-anterior]')) return irPara(indiceAtual() - 1);
    if (t.closest('[data-foto-proxima]')) return irPara(indiceAtual() + 1);
    // Tocar numa foto abre a tela cheia naquela foto — no celular também.
    // Arrastar o carrossel não dispara 'click', então não atrapalha o swipe.
    var slide = t.closest('.galeria__slide');
    if (slide && trilho) {
      var todos = Array.prototype.slice.call(trilho.querySelectorAll('.galeria__slide'));
      return abrir(Math.max(0, todos.indexOf(slide)));
    }
  });

  if (palco) palco.addEventListener('scroll', atualizarRotulo, { passive: true });

  document.addEventListener('keydown', function (ev) {
    if (!caixa || !caixa.hasAttribute('open')) return;
    if (ev.key === 'Escape') fechar();
    else if (ev.key === 'ArrowRight') irPara(indiceAtual() + 1);
    else if (ev.key === 'ArrowLeft') irPara(indiceAtual() - 1);
  });

  /* ── Compartilhar ────────────────────────────────────────── */
  var btnShare = document.querySelector('[data-compartilhar]');
  if (btnShare) {
    btnShare.addEventListener('click', async function () {
      var dados = {
        title: document.title,
        text: 'Veja esta casa no site da Easy House',
        url: window.location.href
      };
      medir('property_share', contexto);
      try {
        if (navigator.share) { await navigator.share(dados); return; }
        await navigator.clipboard.writeText(dados.url);
        avisar('Link copiado');
      } catch (e) {
        if (e && e.name === 'AbortError') return;      // a pessoa desistiu
        avisar('Copie o endereço da barra do navegador');
      }
    });
  }

  function avisar(texto) {
    var aviso = document.createElement('p');
    aviso.setAttribute('role', 'status');
    aviso.textContent = texto;
    aviso.style.cssText = 'position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:400;'
      + 'background:var(--pearl);color:var(--ink);padding:10px 18px;border-radius:100px;'
      + 'font-size:.88rem;font-weight:600;box-shadow:0 8px 30px rgba(0,0,0,.4)';
    document.body.appendChild(aviso);
    setTimeout(function () { aviso.remove(); }, 2600);
  }

  /* ── Relacionados ────────────────────────────────────────── */
  var rel = document.querySelector('.relacionados');
  if (rel) {
    rel.addEventListener('click', function (ev) {
      var link = ev.target.closest && ev.target.closest('.casa__nome a');
      if (link) medir('related_property_click', { de: contexto.property_id, para: link.getAttribute('href') });
    });
  }
})();

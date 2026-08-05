/* EASY HOUSE — interações compartilhadas (v3)
   Leve, sem dependências. Tudo degrada bem se o JS falhar. */
(function () {
  'use strict';

  document.documentElement.classList.remove('no-js');

  /* ---------- Menu mobile ---------- */
  var burger = document.getElementById('navBurger');
  var drawer = document.getElementById('navDrawer');

  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  if (burger && drawer) {
    burger.addEventListener('click', function () {
      var open = drawer.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
      if (open) {
        var first = drawer.querySelector('a');
        if (first) first.focus({ preventScroll: true });
      }
    });

    drawer.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeDrawer();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.classList.contains('open')) {
        closeDrawer();
        burger.focus();
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 900) closeDrawer();
    });
  }

  /* ---------- Barra de navegação ao rolar ---------- */
  var nav = document.getElementById('nav');
  if (nav) {
    var onScroll = function () {
      nav.classList.toggle('scrolled', window.scrollY > 24);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- Revelação ao rolar ---------- */
  var targets = document.querySelectorAll('.reveal, .reveal-group');
  if (targets.length) {
    if (!('IntersectionObserver' in window) ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      targets.forEach(function (el) { el.classList.add('in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px' });
      targets.forEach(function (el) { io.observe(el); });
    }
  }

  /* ---------- FAQ acessível ---------- */
  document.querySelectorAll('.faq__q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.closest('.faq__item');
      var isOpen = item.classList.contains('open');
      var list = btn.closest('.faq');
      if (list) {
        list.querySelectorAll('.faq__item.open').forEach(function (other) {
          if (other !== item) {
            other.classList.remove('open');
            other.querySelector('.faq__q').setAttribute('aria-expanded', 'false');
          }
        });
      }
      item.classList.toggle('open', !isOpen);
      btn.setAttribute('aria-expanded', String(!isOpen));
    });
  });

  /* ---------- Formulário: validação, estado e envio ---------- */
  window.EH = window.EH || {};

  window.EH.handleForm = function (form, buildMessage) {
    var status = form.querySelector('.form-status');
    var submit = form.querySelector('[type="submit"]');
    var sending = false;

    function setStatus(kind, html) {
      if (!status) return;
      status.className = 'form-status show form-status--' + kind;
      status.innerHTML = html;
      status.setAttribute('role', kind === 'err' ? 'alert' : 'status');
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (sending) return;

      // Validação campo a campo, com mensagem legível
      var invalid = null;
      form.querySelectorAll('[required]').forEach(function (el) {
        var field = el.closest('.field') || el.closest('.form-privacy');
        var ok = el.type === 'checkbox' ? el.checked : String(el.value).trim() !== '';
        if (field) field.classList.toggle('invalid', !ok);
        if (!ok && !invalid) invalid = el;
      });

      if (invalid) {
        setStatus('err', 'Faltou preencher um campo obrigatório. Confira os campos destacados.');
        invalid.focus({ preventScroll: false });
        invalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      sending = true;
      if (submit) {
        submit.setAttribute('aria-busy', 'true');
        submit.dataset.label = submit.textContent;
        submit.textContent = 'Abrindo o WhatsApp...';
      }

      var text = buildMessage(form);
      var url = 'https://wa.me/818028867708?text=' + encodeURIComponent(text);

      setTimeout(function () {
        window.open(url, '_blank', 'noopener');
        setStatus('ok',
          '<strong>Pronto.</strong> Abrimos o WhatsApp com suas informações já escritas. ' +
          'É só tocar em enviar. Respondemos em português no horário comercial.<br>' +
          '<span class="muted">Se o WhatsApp não abriu, ' +
          '<a href="' + url + '" target="_blank" rel="noopener" style="color:var(--teal)">toque aqui</a>.</span>');
        if (submit) {
          submit.removeAttribute('aria-busy');
          submit.textContent = submit.dataset.label || 'Enviar';
        }
        sending = false;
        status.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    });

    // Limpa o erro assim que o visitante corrige
    form.querySelectorAll('input, select, textarea').forEach(function (el) {
      el.addEventListener('input', function () {
        var field = el.closest('.field') || el.closest('.form-privacy');
        if (field) field.classList.remove('invalid');
      });
      el.addEventListener('change', function () {
        var field = el.closest('.field') || el.closest('.form-privacy');
        if (field) field.classList.remove('invalid');
      });
    });
  };

  /* ---------- Formatação de valores em ienes ---------- */
  window.EH.moneyInput = function (el) {
    if (!el) return;
    el.addEventListener('input', function () {
      var raw = el.value.replace(/[^\d]/g, '');
      el.value = raw ? Number(raw).toLocaleString('pt-BR') : '';
    });
  };
})();

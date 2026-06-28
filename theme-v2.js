// EASY HOUSE — Theme v2 shared interactions

// Loader
window.addEventListener('load', () => {
  const l = document.getElementById('loader');
  if (l) setTimeout(() => l.classList.add('hide'), 500);
});

// Custom cursor
(() => {
  const dot = document.getElementById('cursorDot');
  const ring = document.getElementById('cursorRing');
  if (!dot || !ring) return;
  let mx = -50, my = -50, rx = -50, ry = -50;
  document.addEventListener('mousemove', (e) => {
    mx = e.clientX; my = e.clientY;
    dot.style.transform = `translate(${mx - 3}px, ${my - 3}px)`;
  });
  (function tick() {
    rx += (mx - rx) * 0.18;
    ry += (my - ry) * 0.18;
    ring.style.transform = `translate(${rx - 18}px, ${ry - 18}px)`;
    requestAnimationFrame(tick);
  })();
  const refresh = () => {
    document.querySelectorAll('a, button, .bento-card, .glass-card, .hoverable').forEach(el => {
      if (el.__cursorBound) return;
      el.__cursorBound = true;
      el.addEventListener('mouseenter', () => ring.classList.add('active'));
      el.addEventListener('mouseleave', () => ring.classList.remove('active'));
    });
  };
  refresh();
  window.__cursorRefresh = refresh;
})();

// Scroll progress + nav
(() => {
  const bar = document.getElementById('scrollProgress');
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const h = document.body.scrollHeight - window.innerHeight;
    if (bar) bar.style.width = Math.min((y / h) * 100, 100) + '%';
    if (nav) nav.classList.toggle('scrolled', y > 60);
  }, { passive: true });
})();

// Stat counter
const animateCount = (el) => {
  const target = parseInt(el.dataset.target, 10);
  const suffix = el.dataset.suffix || '';
  const start = performance.now();
  const dur = 1800;
  function step(now) {
    const p = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased).toLocaleString('pt-BR') + suffix;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
};

// Reveal on scroll + counter trigger
(() => {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        e.target.querySelectorAll('[data-target]').forEach(animateCount);
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.reveal, .reveal-stagger').forEach(el => io.observe(el));
})();

// Magnetic buttons
document.querySelectorAll('.btn-mag').forEach(btn => {
  btn.addEventListener('mousemove', (e) => {
    const r = btn.getBoundingClientRect();
    const dx = (e.clientX - r.left - r.width / 2) * 0.18;
    const dy = (e.clientY - r.top - r.height / 2) * 0.18;
    btn.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
});

// FAQ accordion
document.querySelectorAll('.faq-q').forEach(q => {
  q.addEventListener('click', () => {
    const item = q.closest('.faq-item');
    const open = item.classList.contains('active');
    item.parentElement.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
    if (!open) item.classList.add('active');
  });
});

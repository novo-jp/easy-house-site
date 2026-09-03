/**
 * Medição do portal de casas à venda → Meta Pixel.
 *
 * Por que existe: /comprar/imoveis é destino de tráfego pago. Antes desta
 * suíte, `property_view` era empurrado para o dataLayer por casas-imovel.js
 * ANTES de o analytics.js instalar o interceptador — o evento mais importante
 * da página nunca chegava ao pixel, e nada avisava.
 *
 * O analytics.js é um IIFE de navegador. Aqui ele roda dentro de um `vm` com
 * um DOM mínimo e um `fbq` de mentira, para que nenhum evento de teste chegue
 * ao pixel real e suje o Gerenciador de Eventos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONTE = readFileSync(join(RAIZ, 'analytics.js'), 'utf8');

function armazenamento() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k)
  };
}

/**
 * Roda o analytics.js num DOM mínimo, no caminho “aceite já dado”.
 *
 * @param {object}  o
 * @param {array}   o.filaInicial  o que já está no dataLayer quando o script roda
 * @param {boolean} o.portal       simula window.EHCasas (páginas de casas)
 * @param {boolean} o.simulador    simula #fxMain (o funil cuida da medição lá)
 */
function rodar({ filaInicial = [], portal = true, simulador = false } = {}) {
  const chamadas = [];                 // tudo que foi para o fbq
  const beacons = [];                  // corpos enviados a /api/event
  const cliques = [];                  // handlers de clique registrados

  const local = armazenamento();
  local.setItem('eh_consent_ads', JSON.stringify({ status: 'granted', version: '1' }));

  const janela = {
    document: {
      readyState: 'complete',
      cookie: '',
      documentElement: { lang: 'pt-BR' },
      head: { appendChild() {} },
      body: { style: {} },
      getElementById: (id) => (id === 'fxMain' && simulador ? {} : null),
      querySelectorAll: () => [],
      createElement: () => ({ setAttribute() {} }),
      addEventListener: (tipo, fn) => { if (tipo === 'click') cliques.push(fn); }
    },
    localStorage: local,
    sessionStorage: armazenamento(),
    navigator: { sendBeacon: (_u, blob) => { beacons.push(blob.partes[0]); return true; } },
    location: { search: '?utm_source=meta', pathname: '/comprar/imoveis', href: 'http://x/comprar/imoveis' },
    addEventListener() {}, removeEventListener() {}, innerHeight: 800,
    Blob: class { constructor(partes) { this.partes = partes; } },
    Date, Math, JSON, URLSearchParams, Array, Object, String, Number, console
  };
  janela.window = janela;
  janela.dataLayer = filaInicial.slice();
  if (portal) janela.EHCasas = { medir() {} };

  // O snippet oficial só busca o fbevents.js se `window.fbq` não existir.
  // Definir o nosso antes é o que mantém o pixel real fora do teste.
  janela.fbq = (...args) => { chamadas.push(args); };

  runInContext(FONTE, createContext(janela));

  return {
    janela, chamadas, beacons, cliques,
    eventos: () => chamadas
      .filter((c) => c[0] === 'track' || c[0] === 'trackCustom')
      .map((c) => c[1]),
    parametros: (nome) => (chamadas.find((c) => c[1] === nome) || [])[2]
  };
}

/** Dispara um clique simulado num link de WhatsApp. */
function clicar(r, href = 'https://wa.me/818028867708') {
  const alvo = { closest: (sel) => (/wa\.me/.test(sel) ? { getAttribute: () => null } : null) };
  r.cliques.forEach((fn) => fn({ target: alvo }));
}

test('o pixel inicia e dispara PageView', () => {
  const r = rodar();
  assert.ok(r.chamadas.some((c) => c[0] === 'init'), 'faltou o init do pixel');
  assert.deepEqual(r.eventos(), ['PageView']);
});

test('property_view empurrado ANTES do analytics.js ainda vira ViewContent', () => {
  // Reproduz a ordem real dos <script defer>: casas-imovel.js roda primeiro
  // e já mediu property_view quando o analytics.js entra.
  const r = rodar({ filaInicial: [{ event: 'property_view', property_id: 'X1', city: 'Hekinan', price: 12800000 }] });
  assert.ok(r.eventos().includes('ViewContent'),
    'property_view disparado antes do interceptador não chegou ao pixel');
});

test('eventos posteriores continuam passando', () => {
  const r = rodar();
  r.janela.dataLayer.push({ event: 'search_performed', termo: 'Hekinan' });
  r.janela.dataLayer.push({ event: 'property_view', property_id: 'X2' });
  assert.deepEqual(r.eventos(), ['PageView', 'Search', 'ViewContent']);
});

test('nenhum dado do imóvel ou da busca chega ao Meta', () => {
  // /privacy enumera o que é enviado: etapa e variante do teste, mais nada.
  // Preço, cidade, código do imóvel e o termo digitado ficam de fora.
  // (os objetos nascem dentro do vm, então compara-se por chaves, não por deepEqual)
  const r = rodar({ filaInicial: [{ event: 'property_view', property_id: 'X1', city: 'Hekinan', price: 12800000, source: 'reprice' }] });
  assert.deepEqual(Object.keys(r.parametros('ViewContent')), []);

  r.janela.dataLayer.push({ event: 'search_performed', termo: 'Nagoya 3LDK', filtros: 'até ¥15M' });
  assert.deepEqual(Object.keys(r.parametros('Search')), []);
});

test('favoritar manda AddToWishlist; desfavoritar não manda nada', () => {
  const r = rodar();
  r.janela.dataLayer.push({ event: 'property_favorite', property_id: 'X1', acao: 'salvou' });
  r.janela.dataLayer.push({ event: 'property_favorite', property_id: 'X1', acao: 'removeu' });
  assert.deepEqual(r.eventos(), ['PageView', 'AddToWishlist']);
});

test('listagem e paginação não poluem o pixel', () => {
  const r = rodar();
  r.janela.dataLayer.push({ event: 'property_list_view', total: 240, pagina: 2 });
  r.janela.dataLayer.push({ event: 'filter_used', filtro: 'cidade', valor: 'Hekinan' });
  r.janela.dataLayer.push({ event: 'gallery_open', property_id: 'X1' });
  assert.deepEqual(r.eventos(), ['PageView']);
});

test('no portal, um clique no WhatsApp gera UM evento de primeira parte', () => {
  // casas-comum.js já grava `whatsapp_click`. Se o analytics.js também gravasse
  // `lp_whatsapp_clicked`, funnel_event teria duas linhas para um clique só e
  // qualquer contagem de cliques sairia dobrada.
  const r = rodar({ portal: true });
  const antes = r.beacons.length;
  clicar(r);
  const novos = r.beacons.slice(antes).map((b) => JSON.parse(b).event);
  assert.deepEqual(novos, [], 'o portal já mede o clique; analytics.js não deve duplicar');
});

test('fora do portal, o clique no WhatsApp continua sendo medido', () => {
  const r = rodar({ portal: false });        // omatome, refinanciamento…
  const antes = r.beacons.length;
  clicar(r);
  const novos = r.beacons.slice(antes).map((b) => JSON.parse(b).event);
  assert.deepEqual(novos, ['lp_whatsapp_clicked']);
  assert.ok(r.eventos().includes('Contact'));
});

test('lp_view sai com a origem da campanha', () => {
  // É o único evento do portal que carrega utm_*/fbclid. Os demais se ligam
  // a ele pelo session_id, que casas-comum.js e analytics.js compartilham.
  const r = rodar();
  const lp = JSON.parse(r.beacons[0]);
  assert.equal(lp.event, 'lp_view');
  assert.equal(lp.source.utm_source, 'meta');
  assert.equal(lp.source.landing, '/comprar/imoveis');
});

test('todo evento do portal está mapeado ou excluído de propósito', () => {
  // Trava contra deriva: quem criar um evento novo em casas-*.js decide,
  // aqui, se ele vai ou não para o pixel.
  const fontes = ['casas-comum.js', 'casas-busca.js', 'casas-imovel.js', 'casas-favoritos.js']
    .map((f) => readFileSync(join(RAIZ, f), 'utf8')).join('\n');
  const emitidos = new Set([...fontes.matchAll(/\bmedir\('([a-z_]+)'/g)].map((m) => m[1]));

  const noPixel = new Set(['property_view', 'search_performed', 'property_favorite', 'whatsapp_click']);
  const foraDePropostio = new Set([
    'property_list_view',        // dispara a cada página e a cada filtro
    'filter_used',               // idem
    'search_no_results',         // não é interesse, é frustração
    'gallery_open',              // redundante com property_view
    'property_share',            // volume baixo demais para otimizar
    'favorites_view',            // já coberto por AddToWishlist
    'related_property_click',    // navegação interna
    'whatsapp_property_click',   // duplicaria o Contact de whatsapp_click
    'whatsapp_simulation_click',
    'whatsapp_visit_click'
  ]);

  for (const e of emitidos) {
    assert.ok(noPixel.has(e) || foraDePropostio.has(e),
      `evento "${e}" não foi classificado: mapeie no MAPA do analytics.js ou liste como exclusão aqui`);
  }
});

test('todo link de WhatsApp do portal diz de onde saiu', () => {
  // `cta_position` é o que responde "qual botão da página trouxe o lead".
  // Sem data-cta o clique entra como "desconhecido" e a resposta se perde —
  // era o caso do CTA fixo do topo, do menu e do rodapé.
  const arquivos = ['comprar/imoveis.html', 'favoritos.html', 'lib/casas-layout.json'];
  for (const arquivo of arquivos) {
    const html = readFileSync(join(RAIZ, arquivo), 'utf8');
    // cada <a ...> que aponte para wa.me
    const links = [...html.matchAll(/<a\b[^>]*wa\.me[^>]*>/g)].map((m) => m[0]);
    assert.ok(links.length, `${arquivo}: nenhum link de WhatsApp encontrado — o teste ficou cego`);
    const semCta = links.filter((a) => !/data-cta=\\?"/.test(a));
    assert.deepEqual(semCta, [], `${arquivo}: link(s) de WhatsApp sem data-cta`);
  }
});

/**
 * Gera as variações do simulador por cidade a partir de simular.html.
 * Rodar: node build-pages.mjs
 *
 * Mantém o site estático (sem framework) e garante que as páginas
 * de campanha não saiam do padrão do simulador principal.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const CITIES = [
  { slug: 'hekinan',  name: 'Hekinan',  jp: '碧南市' },
  { slug: 'takahama', name: 'Takahama', jp: '高浜市' },
  { slug: 'nishio',   name: 'Nishio',   jp: '西尾市' },
  { slug: 'anjo',     name: 'Anjo',     jp: '安城市' },
  { slug: 'kariya',   name: 'Kariya',   jp: '刈谷市' }
];

const base = readFileSync('simular.html', 'utf8');
mkdirSync('simular', { recursive: true });

for (const city of CITIES) {
  let html = base;

  // caminhos relativos passam a absolutos (a página fica em /simular/)
  html = html
    .replace(/(src|href)="(images|funnel|simular|lib|favicon)/g, '$1="/$2')
    .replace(/href="\/funnel\.css/g, 'href="/funnel.css')
    .replace(/src="\/simular\.js/g, 'src="/simular.js');

  html = html
    .replace(
      /<title>[^<]*<\/title>/,
      `<title>Casa própria em ${city.name}: simule sua faixa de compra | EASY HOUSE</title>`
    )
    .replace(
      /<meta name="description" content="[^"]*"\/>/,
      `<meta name="description" content="Ferramenta gratuita em português para quem quer comprar imóvel em ${city.name} (${city.jp}). Escolha a parcela e veja a faixa de imóvel compatível com o seu perfil."/>`
    )
    .replace(
      /<link rel="canonical" href="[^"]*"\/>/,
      `<link rel="canonical" href="https://easyhouse.homes/simular/${city.slug}"/>`
    )
    .replace(
      /<meta property="og:url" content="[^"]*"\/>/,
      `<meta property="og:url" content="https://easyhouse.homes/simular/${city.slug}"/>`
    )
    .replace(
      '<body>',
      `<body data-city="${city.name}">`
    )
    .replace(
      /<h1 class="fx-hero__title" id="fxHeadline">[^<]*<\/h1>/,
      `<h1 class="fx-hero__title" id="fxHeadline">Quanto pode custar sua casa em ${city.name}?</h1>`
    )
    .replace(
      /<p class="fx-hero__sub" id="fxSubline">[^<]*<\/p>/,
      `<p class="fx-hero__sub" id="fxSubline">Escolha a parcela que cabe no seu mês e veja a faixa de imóvel mais próxima do seu perfil em ${city.name} e região.</p>`
    );

  writeFileSync(`simular/${city.slug}.html`, html);
  console.log(`gerado: simular/${city.slug}.html`);
}

console.log(`\n${CITIES.length} páginas de cidade geradas.`);

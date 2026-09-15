/**
 * lib/casas-html.mjs — pedaços de HTML compartilhados pelas páginas do portal
 * renderizadas no servidor (lista e ficha).
 *
 * A navegação vem de casas-layout.json SEM nenhum item marcado como atual;
 * quem renderiza marca exatamente um, pela URL. Antes o JSON trazia "Sobre"
 * marcado para sempre, e a ficha anunciava duas páginas atuais ao leitor de tela.
 */

import { readFileSync } from 'node:fs';

const L = JSON.parse(readFileSync(new URL('./casas-layout.json', import.meta.url), 'utf8'));
export const SITE = 'https://easyhouse.homes';

export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Marca como atual o link cujo href é exatamente `caminho`. Um só. */
export function navAtual(caminho) {
  let marcado = false;
  return L.nav.replace(/<a href="([^"]+)"([^>]*)>/g, (tudo, href, resto) => {
    if (!marcado && href === caminho && !/aria-current/.test(resto)) {
      marcado = true;
      return `<a href="${href}" class="active" aria-current="page"${resto}>`;
    }
    return tudo;
  });
}

export const drawer = L.drawer;
export const foot = L.foot;

export const ICONE_WA = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="18" height="18"><path d="M12 2C6.5 2 2 6.5 2 12c0 1.7.5 3.4 1.3 4.9L2 22l5.3-1.3c1.4.8 3 1.3 4.7 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2z"/></svg>';

/**
 * Documento completo. `scripts` são caminhos; `caminhoAtual` é o item da nav.
 */
export function documento({ titulo, descricao, canonical, imagem, imagemLargura, imagemAltura, imagemAlt,
                            robots, jsonLd, corpo, caminhoAtual,
                            classeBody = '', scripts = [], preconnect = [], head = '' }) {
  // WhatsApp e Facebook só mostram o preview grande de primeira quando
  // conhecem o tamanho da imagem; sem width/height a primeira partilha sai miúda.
  const metaImagem = imagem ? [
    `<meta property="og:image" content="${esc(imagem)}"/>`,
    imagemLargura ? `<meta property="og:image:width" content="${imagemLargura}"/>` : '',
    imagemAltura ? `<meta property="og:image:height" content="${imagemAltura}"/>` : '',
    imagemAlt ? `<meta property="og:image:alt" content="${esc(imagemAlt)}"/>` : '',
    `<meta name="twitter:image" content="${esc(imagem)}"/>`,
  ].filter(Boolean).join('\n') : '';
  return `<!DOCTYPE html>
<html lang="pt-BR" class="no-js">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}"/>
<link rel="canonical" href="${esc(canonical)}"/>
${robots ? `<meta name="robots" content="${esc(robots)}"/>` : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
<meta property="og:type" content="website"/>
<meta property="og:url" content="${esc(canonical)}"/>
<meta property="og:title" content="${esc(titulo)}"/>
<meta property="og:description" content="${esc(descricao)}"/>
${metaImagem}
<meta name="twitter:card" content="summary_large_image"/>
${preconnect.map((h) => `<link rel="preconnect" href="${esc(h)}"/>`).join('\n')}
<link rel="stylesheet" href="/theme-v2.css?v=8"/>
<link rel="stylesheet" href="/casas.css?v=11"/>
${head}
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body${classeBody ? ` class="${esc(classeBody)}"` : ''}>
<a class="skip-link" href="#main">Ir para o conteúdo</a>
${navAtual(caminhoAtual)}
${drawer}
${corpo}
${foot}
<script src="/theme-v2.js?v=9" defer></script>
<script src="/lib/casas-cartao.js?v=11" defer></script>
<script src="/casas-comum.js?v=11" defer></script>
${scripts.map((s) => `<script src="${esc(s)}" defer></script>`).join('\n')}
<script src="/analytics.js" defer></script>
</body>
</html>`;
}

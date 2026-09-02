/**
 * GET /sitemap-casas.xml — sitemap das páginas de imóvel.
 *
 * Gerado na hora a partir do banco: assim uma casa que o scraper trouxe hoje
 * de manhã já pode ser encontrada pelo Google, sem depender de um novo deploy.
 */

import { carregarCasas } from '../lib/casas-fonte.mjs';

const SITE = 'https://easyhouse.homes';
const xml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

export default async function handler(req, res) {
  try {
    const casas = await carregarCasas();
    const urls = casas.map((c) => {
      const quando = c.atualizadoEm ? new Date(c.atualizadoEm).toISOString().slice(0, 10) : null;
      const foto = c.fotos[0];
      return `  <url>
    <loc>${xml(`${SITE}/comprar/imoveis/${c.slug}`)}</loc>${quando ? `
    <lastmod>${quando}</lastmod>` : ''}
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>${foto ? `
    <image:image><image:loc>${xml(foto)}</image:loc><image:title>${xml(c.titulo)}</image:title></image:image>` : ''}
  </url>`;
    });

    const corpo = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${SITE}/comprar/imoveis</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
${urls.join('\n')}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(corpo);
  } catch (e) {
    console.error('[sitemap-casas]', e);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>');
  }
}

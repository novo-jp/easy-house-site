/**
 * Gera o portal educativo: /guias, /dicionario-imobiliario, /duvidas, /blog,
 * as páginas publicadas de cada um, o /rss.xml e o trecho do portal no sitemap.
 *
 *     node build-portal.mjs           gera o site
 *     node build-portal.mjs --previa  também monta a prévia dos rascunhos
 *                                     (docs/seo/portal-guias/previa-rascunhos.html)
 *
 * Não precisa do banco: o texto vem de docs/seo/portal-guias/conteudo/. Nada é
 * gravado se algum item publicado tiver campo faltando, link quebrado, título
 * repetido ou o tema excluído (lib/tema-excluido.mjs).
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  lerItem, problemasDoItem, paginaItem, paginaHubGuias, paginaHubDicionario, paginaHubDuvidas,
  paginaHubBlog, rss, caminhoDe, arquivoDe, linksInternos, ROTAS_DINAMICAS, HUBS, SITE, md, ancora, esc,
} from './lib/portal.mjs';
import { trechosVetados } from './lib/tema-excluido.mjs';
import { documento } from './lib/casas-html.mjs';

const RAIZ_CONTEUDO = 'docs/seo/portal-guias/conteudo';
const PASTAS = { verbete: 'verbetes', blog: 'blog', guia: 'guias' };
const PREVIA = process.argv.includes('--previa');

/* ── Leitura ─────────────────────────────────────────────── */

const itens = Object.entries(PASTAS).flatMap(([tipo, pasta]) => {
  const dir = path.join(RAIZ_CONTEUDO, pasta);
  return readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map((f) => {
    const item = lerItem(readFileSync(path.join(dir, f), 'utf8'), `${pasta}/${f}`);
    if (item.contentType !== tipo) throw new Error(`${pasta}/${f}: contentType ${item.contentType} na pasta de ${tipo}`);
    if (`${item.slug}.md` !== f) throw new Error(`${pasta}/${f}: o arquivo deve se chamar ${item.slug}.md`);
    return item;
  });
});
const publicados = itens.filter((i) => i.status === 'publicado');
const porId = new Map(itens.map((i) => [i.id, i]));

const indice = JSON.parse(readFileSync(path.join(RAIZ_CONTEUDO, 'dicionario-indice.json'), 'utf8'));
const duvidas = lerItem(readFileSync(path.join(RAIZ_CONTEUDO, 'duvidas.md'), 'utf8'), 'duvidas.md');

/* ── Validação ───────────────────────────────────────────── */

const erros = [];
for (const i of itens) for (const p of problemasDoItem(i)) erros.push(`${i.origem}: ${p}`);
const repetidos = (campo) => {
  const vistos = new Map();
  for (const i of publicados) {
    const v = campo === 'caminho' ? caminhoDe(i) : i[campo];
    if (vistos.has(v)) erros.push(`${campo} repetido: "${v}" (${vistos.get(v)} e ${i.origem})`);
    vistos.set(v, i.origem);
  }
};
['caminho', 'title', 'h1', 'description', 'id'].forEach(repetidos);
for (const i of itens) {
  // Página já gravada por este script (tem o CSS do portal) não conta como duplicata.
  if (i.contentType === 'guia' && existsSync(`${i.slug}.html`) && !i.substitui
      && !readFileSync(`${i.slug}.html`, 'utf8').includes('.nota-portal {')) {
    erros.push(`${i.origem}: /${i.slug} já existe como página do build-conteudo — não duplicar`);
  }
}

/** Título e descrição de uma página que já existe no site (lidos do HTML gravado). */
function paginaExistente(href) {
  const arquivo = arquivoDe(href);
  if (!existsSync(arquivo)) return null;
  const h = readFileSync(arquivo, 'utf8');
  const h1 = h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, '').trim();
  const desc = h.match(/<meta name="description" content="([^"]*)"/)?.[1];
  return h1 ? { titulo: h1.replace(/&amp;/g, '&'), texto: desc?.replace(/&amp;/g, '&').replace(/&quot;/g, '"') } : null;
}

/** Destinos fixos que não são arquivo nem item do portal. */
const FIXOS = {
  '/simular': ['Simulador de financiamento', 'Em um minuto, a faixa de imóvel compatível com a parcela que cabe no seu mês. Não pede documento.'],
  '/comprar/imoveis': ['Casas à venda', 'Busca com filtro por cidade, preço, planta e distância da estação.'],
  '/casas-a-venda': ['Casas à venda por cidade', 'Aichi e Mie: quantidade de casas, faixa de preço e estações de cada cidade.'],
  '/casas-novas': ['Casas novas (新築)', 'Construção nova à venda no acervo atual.'],
  '/casas-usadas': ['Casas usadas (中古)', 'Casas usadas à venda no acervo atual.'],
  '/duvidas': ['Dúvidas frequentes', 'Respostas curtas sobre compra, financiamento, contrato, custos e o que vem depois das chaves.'],
  '/entregas': ['Entregas reais', 'Famílias que já compraram a casa com a Easy House.'],
};

/** [href, título, texto] de um destino: item do portal (publicado), página existente ou fixo. */
function destino(ref) {
  if (!ref.startsWith('/')) {
    const i = porId.get(ref);
    if (!i) { erros.push(`relatedIds aponta para id inexistente: ${ref}`); return null; }
    if (i.status !== 'publicado') return null;
    return [caminhoDe(i), i.contentType === 'verbete' ? `${i.termJa}: ${i.traducao}` : i.h1.replace(/\*/g, ''), i.summary];
  }
  const portal = publicados.find((i) => caminhoDe(i) === ref);
  if (portal) return destino(portal.id);
  if (FIXOS[ref]) return [ref, ...FIXOS[ref]];
  const ex = paginaExistente(ref);
  if (ex) return [ref, ex.titulo, ex.texto];
  erros.push(`destino desconhecido: ${ref}`);
  return null;
}

/* ── Hubs ────────────────────────────────────────────────── */

/**
 * A jornada do comprador. Cada etapa lista caminhos e ids; o que não estiver
 * publicado some sozinho do hub (rascunho não vira cartão "em breve").
 */
const ETAPAS = [
  { id: 'comece-aqui', titulo: '1. Comece aqui', texto: 'O mapa da compra inteira e quanto ela custa além do preço da casa.',
    refs: ['/guia-comprar-casa-japao', '/quanto-custa-casa-japao', '/simular', '/duvidas'] },
  { id: 'preparacao-financeira', titulo: '2. Preparação financeira', texto: 'Antes de visitar casas: quanto o banco libera para a sua renda, o que ele analisa e que documentos separar.',
    refs: ['/financiamento-imovel-japao', '/renda-minima-financiamento', '/documentos-financiamento', 'EH-ED-048', 'EH-ED-049',
      '/financiamento-trabalho-haken', '/financiamento-autonomo', 'EH-ED-022'] },
  { id: 'escolhendo-o-imovel', titulo: '3. Escolhendo o imóvel', texto: 'Ler o anúncio, visitar, conferir o terreno e os riscos naturais do endereço.',
    refs: ['EH-ED-009', 'EH-ED-010', 'EH-ED-098', 'EH-ED-099', 'EH-ED-100', 'EH-ED-102', 'EH-ED-109', 'EH-ED-058', 'EH-ED-059',
      'EH-DIC-SETSUDO', 'EH-ED-088', '/casas-a-venda'] },
  { id: 'contrato-e-chaves', titulo: '4. Contrato e chaves', texto: 'Da proposta ao registro: cada documento que você vai assinar e o que ele muda.',
    refs: ['EH-ED-011', 'EH-ED-050', 'EH-ED-051', 'EH-ED-052', 'EH-ED-053', 'EH-ED-054', 'EH-ED-056', 'EH-ED-057', 'EH-ED-113'] },
  { id: 'custos-e-pos-compra', titulo: '5. Custos e depois da compra', texto: 'Comissão, impostos e o que muda quando a casa é sua.',
    refs: ['/quanto-custa-casa-japao', 'EH-ED-073', 'EH-ED-076', 'EH-ED-077', 'EH-DIC-TOKI', 'EH-DIC-TEITOKEN'] },
];
const etapas = ETAPAS.map((e) => ({
  ...e,
  itens: e.refs.map(destino).filter(Boolean).map(([href, titulo, texto]) => {
    const i = publicados.find((x) => caminhoDe(x) === href);
    return { href, titulo, texto, rotulo: i ? { verbete: 'Dicionário', blog: 'Blog', guia: 'Guia' }[i.contentType] : ({ '/simular': 'Ferramenta', '/duvidas': 'Dúvidas' }[href] || 'Guia') };
  }),
})).filter((e) => e.itens.length);

/** Dicionário: o índice inteiro, com link para os verbetes que têm página publicada. */
const comPagina = new Map(publicados.filter((i) => i.contentType === 'verbete').map((i) => [i.slug, caminhoDe(i)]));
for (const t of indice.termos) {
  if (t.pagina && !itens.some((i) => i.contentType === 'verbete' && i.slug === t.pagina)) erros.push(`dicionario-indice: página "${t.pagina}" não existe`);
}
for (const v of publicados.filter((i) => i.contentType === 'verbete')) {
  if (!indice.termos.some((t) => t.pagina === v.slug)) erros.push(`${v.origem}: verbete publicado fora do dicionario-indice.json`);
}
const categorias = indice.categorias.map((c) => ({
  ...c,
  termos: indice.termos.filter((t) => t.categoria === c.id)
    .map((t) => ({ ...t, ancora: ancora(t.romaji), href: comPagina.get(t.pagina) || null }))
    .sort((a, b) => a.romaji.localeCompare(b.romaji)),
})).filter((c) => c.termos.length);
for (const t of indice.termos) if (!indice.categorias.some((c) => c.id === t.categoria)) erros.push(`dicionario-indice: categoria desconhecida em ${t.termJa}`);

/** Dúvidas: "## Grupo" e "### Pergunta" seguida da resposta. */
const grupos = duvidas.corpo.split(/^(?=## )/m).filter((s) => s.startsWith('## ')).map((s) => {
  const [cab, ...resto] = s.split('\n');
  const titulo = cab.slice(3).trim();
  const perguntas = resto.join('\n').split(/^(?=### )/m).filter((q) => q.startsWith('### ')).map((q) => {
    const [p, ...r] = q.split('\n');
    const pergunta = p.slice(4).trim();
    return { id: ancora(pergunta), pergunta, html: md(r.join('\n').trim()).html };
  });
  return { id: ancora(titulo), titulo, perguntas };
});

const posts = publicados.filter((i) => i.contentType === 'blog')
  .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug))
  .map((p) => ({ href: caminhoDe(p), titulo: p.h1.replace(/\*/g, ''), resumo: p.summary, data: p.publishedAt }));

const maisRecente = (lista) => lista.reduce((m, i) => (i.updatedAt > m ? i.updatedAt : m), '2026-11-02');

/* ── Páginas ─────────────────────────────────────────────── */

const paginas = [];
for (const i of publicados) {
  const rel = i.relatedIds.map(destino).filter(Boolean).map(([href, titulo]) => [href, titulo]);
  rel.push([TIPOS_HUB(i), { verbete: 'Todos os termos do dicionário imobiliário', blog: 'Todos os artigos do blog', guia: 'Todos os guias' }[i.contentType]]);
  paginas.push([arquivoDe(caminhoDe(i)), paginaItem(i, rel)]);
}
function TIPOS_HUB(i) { return { verbete: HUBS.dicionario, blog: HUBS.blog, guia: HUBS.guias }[i.contentType]; }

paginas.push([arquivoDe(HUBS.guias), paginaHubGuias({ etapas, atualizado: maisRecente(publicados) })]);
paginas.push([arquivoDe(HUBS.dicionario), paginaHubDicionario({
  categorias, atualizado: maisRecente([...publicados.filter((i) => i.contentType === 'verbete'), { updatedAt: indice.atualizado }]),
  total: categorias.reduce((n, c) => n + c.termos.length, 0), comPagina: comPagina.size,
})]);
paginas.push([arquivoDe(HUBS.duvidas), paginaHubDuvidas({ grupos, atualizado: duvidas.updatedAt })]);
if (posts.length) paginas.push([arquivoDe(HUBS.blog), paginaHubBlog({ posts, atualizado: maisRecente(publicados.filter((i) => i.contentType === 'blog')) })]);

/* ── Conferências antes de gravar ────────────────────────── */

const vaiExistir = new Set([...paginas.map(([a]) => `/${a.replace(/\.html$/, '')}`), ...(posts.length ? ['/rss.xml'] : [])]);
const existe = (href) => vaiExistir.has(href) || existsSync(arquivoDe(href)) || existsSync(href.slice(1))
  || ROTAS_DINAMICAS.some((re) => re.test(href));
for (const [arquivo, html] of paginas) {
  for (const href of linksInternos(html)) if (!existe(href)) erros.push(`${arquivo}: link quebrado ${href}`);
  for (const t of trechosVetados(html)) erros.push(`${arquivo}: tema excluído (${t})`);
}
// Link no texto para rascunho: o leitor cairia num 404.
for (const i of publicados) {
  for (const r of itens.filter((x) => x.status === 'rascunho')) {
    if (linksInternos(md(i.corpo).html).includes(caminhoDe(r))) erros.push(`${i.origem}: link para rascunho ${caminhoDe(r)}`);
  }
}
// Rascunhos também passam pelo filtro do tema: o texto vai ser lido e aprovado.
for (const i of itens) for (const t of trechosVetados(i.corpo + i.title + i.description)) erros.push(`${i.origem}: tema excluído (${t})`);
for (const t of trechosVetados(JSON.stringify(indice) + duvidas.corpo)) erros.push(`índice/dúvidas: tema excluído (${t})`);

if (erros.length) {
  for (const e of erros) console.error(`  ✗ ${e}`);
  console.error(`\n  ${erros.length} problema(s). Nada foi gravado.`);
  process.exit(1);
}

/* ── Gravação ────────────────────────────────────────────── */

for (const [arquivo, html] of paginas) {
  mkdirSync(path.dirname(arquivo), { recursive: true });
  writeFileSync(arquivo, html);
}
if (posts.length) writeFileSync('rss.xml', rss(posts));

// 404 estático: a Vercel serve /404.html (com status 404) para qualquer caminho
// sem arquivo nem rota. Sem ele, quem caía num link velho via só texto puro.
writeFileSync('404.html', documento({
  titulo: 'Página não encontrada | Easy House',
  descricao: 'Esta página não existe ou mudou de endereço.',
  canonical: `${SITE}/404`,
  robots: 'noindex, follow',
  corpo: `<main id="main" style="max-width:var(--wrap-narrow);margin:0 auto;padding:calc(var(--nav-h) + 40px) var(--pad-x) 64px">
  <h1>Página não encontrada</h1>
  <p>O endereço pode ter mudado ou o imóvel saiu do ar. Por aqui você continua:</p>
  <ul style="margin:18px 0 0 20px;line-height:2">
    <li><a href="/comprar/imoveis">Casas à venda</a></li>
    <li><a href="/imoveis">Apartamentos para alugar</a></li>
    <li><a href="/casas-a-venda">Casas por cidade</a></li>
    <li><a href="${HUBS.guias}">Guias para comprar casa no Japão</a></li>
    <li><a href="${HUBS.duvidas}">Dúvidas frequentes</a></li>
    <li><a href="/entregas">Página inicial</a></li>
  </ul>
</main>`,
}));

// Sitemap: o trecho entre os marcadores é deste script; o resto é escrito à mão.
const INICIO = '  <!-- portal: gerado por build-portal.mjs -->';
const FIM = '  <!-- /portal -->';
const urls = [
  [HUBS.guias, maisRecente(publicados)],
  [HUBS.dicionario, maisRecente([...publicados.filter((i) => i.contentType === 'verbete'), { updatedAt: indice.atualizado }])],
  [HUBS.duvidas, duvidas.updatedAt],
  ...(posts.length ? [[HUBS.blog, maisRecente(publicados.filter((i) => i.contentType === 'blog'))]] : []),
  ...publicados.map((i) => [caminhoDe(i), i.updatedAt]),
];
const bloco = [INICIO, ...urls.map(([p, d]) => `  <url><loc>${SITE}${p}</loc><lastmod>${d}</lastmod></url>`), FIM].join('\n');
let sitemap = readFileSync('sitemap.xml', 'utf8');
sitemap = sitemap.includes(INICIO)
  ? sitemap.replace(new RegExp(`${INICIO}[\\s\\S]*?${FIM}`), bloco)
  : sitemap.replace('</urlset>', `${bloco}\n</urlset>`);
writeFileSync('sitemap.xml', sitemap);

const conta = (t) => publicados.filter((i) => i.contentType === t).length;
const rascunhos = itens.filter((i) => i.status === 'rascunho');
console.log(`  publicados: ${conta('verbete')} verbetes, ${conta('blog')} artigos, ${conta('guia')} guias + ${paginas.length - publicados.length} hubs`);
console.log(`  dicionário: ${categorias.reduce((n, c) => n + c.termos.length, 0)} termos no índice`);
console.log(`  dúvidas: ${grupos.reduce((n, g) => n + g.perguntas.length, 0)} perguntas`);
console.log(`  rascunhos (fora do site): ${rascunhos.length} — ${rascunhos.map((r) => r.slug).join(', ') || 'nenhum'}`);

/* ── Prévia dos rascunhos (para revisão, não vai para o site) ── */

if (PREVIA) {
  const partes = rascunhos.map((r) => {
    const { html } = md(r.corpo);
    return `<article><p class="tag">${esc(r.contentType)} · rascunho · ${esc(r.id)}</p>
<h1>${esc(r.h1.replace(/\*/g, ''))}</h1>
<p class="meta"><b>URL proposta:</b> ${esc(caminhoDe(r))}<br><b>Title:</b> ${esc(r.title)}<br><b>Description:</b> ${esc(r.description)}</p>
${html}
<h2>Fontes</h2><ul>${r.references.map((x) => { const [t, u] = x.split(/\s*\|\s*(?=https:)/); return `<li><a href="${u}">${esc(t)}</a></li>`; }).join('')}</ul>
</article>`;
  });
  writeFileSync('docs/seo/portal-guias/previa-rascunhos.html', `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Rascunhos do portal — para revisão</title>
<style>body{font:16px/1.65 system-ui,sans-serif;max-width:760px;margin:0 auto;padding:16px;color:#1d1d1f}article{border-bottom:3px solid #ddd;padding:24px 0 32px}.tag{display:inline-block;background:#fde68a;padding:2px 10px;border-radius:99px;font-size:13px}.meta{background:#f4f4f5;padding:10px 14px;border-radius:8px;font-size:14px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}aside{border-left:3px solid #d4a574;padding:4px 14px;background:#faf6f1}h2{margin-top:28px}</style></head><body>
<h1>Rascunhos do portal — para revisão</h1>
<p>${rascunhos.length} textos. Nenhum está no ar. Para publicar um, troque <code>status: rascunho</code> por <code>status: publicado</code> e <code>needsFactCheck: true</code> por <code>false</code> no arquivo do texto e rode <code>node build-portal.mjs</code>.</p>
${partes.join('\n')}
</body></html>`);
  console.log('  prévia: docs/seo/portal-guias/previa-rascunhos.html');
}

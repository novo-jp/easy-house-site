/**
 * lib/portal.mjs — o portal educativo: Guias, Dicionário imobiliário, Dúvidas e Blog.
 *
 * O texto mora em docs/seo/portal-guias/conteudo/ (Markdown com cabeçalho de
 * metadados, fora do site — docs/ não é publicada). `node build-portal.mjs`
 * converte para HTML estático com a mesma casca das outras páginas de conteúdo.
 *
 * Por que um gerador próprio e não o pagina() do build-conteudo.mjs: aquelas
 * páginas dependem do acervo (Supabase) e marcam a data de hoje a cada
 * geração. Aqui as datas são as do texto (publicado/atualizado de verdade), há
 * sumário, fontes oficiais e migalhas de três níveis, e nada depende do banco.
 *
 * Status: só `publicado` vira página e entra no sitemap. `rascunho` fica no
 * Markdown até a Easy House aprovar — conteúdo de banco, imposto e contrato
 * exige revisão humana antes de ir ao ar.
 */

import { readFileSync } from 'node:fs';

const L = JSON.parse(readFileSync(new URL('./casas-layout.json', import.meta.url), 'utf8'));

export const SITE = 'https://easyhouse.homes';
const WA = (texto) => `https://wa.me/818028867708?text=${encodeURIComponent(texto)}`;

/**
 * Autoria institucional: a marca, como está no rodapé de todas as páginas.
 * Nenhum texto do portal tem autor ou revisor pessoa física — não inventar.
 */
export const AUTOR = { '@type': 'Organization', name: 'EASY HOUSE', url: `${SITE}/sobre` };

/** Onde cada tipo de conteúdo mora. Guias ficam na raiz, como os já publicados. */
export const TIPOS = {
  verbete: { base: '/dicionario-imobiliario', hub: '/dicionario-imobiliario', rotulo: 'Dicionário imobiliário', schema: 'Article' },
  blog: { base: '/blog', hub: '/blog', rotulo: 'Blog', schema: 'BlogPosting' },
  guia: { base: '', hub: '/guias', rotulo: 'Guias', schema: 'Article' },
};

export const HUBS = {
  guias: '/guias',
  dicionario: '/dicionario-imobiliario',
  duvidas: '/duvidas',
  blog: '/blog',
};

export const caminhoDe = (item) => `${TIPOS[item.contentType].base}/${item.slug}`;
export const arquivoDe = (caminho) => `${caminho.slice(1)}.html`;

const CAMPOS = ['id', 'locale', 'slug', 'contentType', 'cluster', 'title', 'h1', 'description', 'summary',
  'sourceFiles', 'references', 'author', 'reviewer', 'publishedAt', 'updatedAt', 'status', 'relatedIds',
  'tags', 'needsFactCheck'];
const CAMPOS_VERBETE = ['termJa', 'reading', 'romaji', 'traducao'];
const LISTAS = new Set(['sourceFiles', 'references', 'relatedIds', 'tags']);

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const textoPuro = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/* ── Leitura ─────────────────────────────────────────────────── */

/**
 * Cabeçalho entre `---`: `chave: valor` e listas (`chave:` seguida de linhas
 * `  - item`). Um subconjunto de YAML que cabe aqui sem dependência nova.
 */
export function lerItem(texto, origem = 'texto') {
  const m = texto.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${origem}: falta o cabeçalho entre ---`);
  const meta = {};
  let lista = null;
  for (const linha of m[1].split('\n')) {
    if (!linha.trim() || linha.trim().startsWith('#')) continue;
    const item = linha.match(/^\s+-\s+(.*)$/);
    if (item) {
      if (!lista) throw new Error(`${origem}: item de lista fora de uma lista: "${linha}"`);
      meta[lista].push(item[1].trim());
      continue;
    }
    const kv = linha.match(/^(\w+):\s*(.*)$/);
    if (!kv) throw new Error(`${origem}: linha que não entendi: "${linha}"`);
    const [, k, v] = kv;
    if (v === '' || v === '[]') { meta[k] = []; lista = v === '' ? k : null; continue; }
    lista = null;
    meta[k] = v === 'true' ? true : v === 'false' ? false : v.replace(/^"(.*)"$/, '$1');
  }
  for (const k of LISTAS) if (typeof meta[k] === 'string') meta[k] = [meta[k]];
  return { ...meta, corpo: m[2].trim(), origem };
}

/** Problemas de um item (lista vazia = ok). Publicado tem regras mais duras. */
export function problemasDoItem(item) {
  const p = [];
  const faltam = CAMPOS.filter((c) => item[c] === undefined || item[c] === '');
  if (faltam.length) p.push(`faltam campos: ${faltam.join(', ')}`);
  if (item.contentType === 'verbete') {
    const fv = CAMPOS_VERBETE.filter((c) => !item[c]);
    if (fv.length) p.push(`verbete sem: ${fv.join(', ')}`);
  }
  if (!TIPOS[item.contentType]) p.push(`contentType desconhecido: ${item.contentType}`);
  if (!['publicado', 'rascunho'].includes(item.status)) p.push(`status inválido: ${item.status}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.slug || '')) p.push(`slug inválido: ${item.slug}`);
  if (item.locale !== 'pt-BR') p.push('só há conteúdo em pt-BR por enquanto');
  for (const d of ['publishedAt', 'updatedAt']) if (!/^\d{4}-\d{2}-\d{2}$/.test(item[d] || '')) p.push(`${d} não é AAAA-MM-DD`);
  if (item.updatedAt < item.publishedAt) p.push('updatedAt antes de publishedAt');
  if (item.status === 'publicado') {
    if (item.needsFactCheck !== false) p.push('publicado com needsFactCheck — volta para rascunho ou confere');
    if ((item.description || '').length < 70 || (item.description || '').length > 165) p.push(`description com ${(item.description || '').length} caracteres (70–165)`);
    if ((item.title || '').length > 70) p.push(`title com ${item.title.length} caracteres (até 70)`);
    if (!item.references?.length) p.push('publicado sem nenhuma fonte');
  }
  for (const r of item.references || []) if (!/\|\s*https:\/\/\S+$/.test(r)) p.push(`fonte sem "Texto | https://...": ${r}`);
  return p;
}

/* ── Markdown ────────────────────────────────────────────────── */

const escMd = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Âncora legível a partir do título da seção (sem acento, minúsculas). */
export const ancora = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/<[^>]+>/g, '').replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '') || 'secao';

/** Inline: **negrito**, *itálico*, [texto](url). Link externo ganha rel. */
export function inline(t) {
  return escMd(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, href) => (/^https?:/.test(href)
      ? `<a href="${href}" rel="noopener" style="color:var(--teal)">${txt}</a>`
      : `<a href="${href}" style="color:var(--teal)">${txt}</a>`));
}

/**
 * Markdown → HTML. Títulos (## viram âncora do sumário), parágrafos, listas,
 * tabelas e `> ` como nota de destaque. Devolve também o sumário.
 */
export function md(texto) {
  const linhas = texto.split('\n');
  const out = [];
  const sumario = [];
  const usadas = new Set();
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    if (!l.trim()) { i++; continue; }
    if (l.startsWith('### ')) { out.push(`<h3>${inline(l.slice(4))}</h3>`); i++; continue; }
    if (l.startsWith('## ')) {
      const titulo = l.slice(3).trim();
      let id = ancora(titulo);
      while (usadas.has(id)) id += '-2';
      usadas.add(id);
      sumario.push([id, titulo]);
      out.push(`<h2 id="${id}">${inline(titulo)}</h2>`);
      i++;
      continue;
    }
    if (l.startsWith('> ')) {
      const nota = [];
      while (i < linhas.length && linhas[i].startsWith('>')) { nota.push(linhas[i].replace(/^>\s?/, '')); i++; }
      out.push(`<aside class="nota-portal">${md(nota.join('\n')).html}</aside>`);
      continue;
    }
    if (l.startsWith('|')) {
      const tab = [];
      while (i < linhas.length && linhas[i].startsWith('|')) { tab.push(linhas[i]); i++; }
      const celulas = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const [cab, , ...corpo] = tab;
      out.push(`<div class="tabela-rolagem"><table class="tabela-dados"><thead><tr>${celulas(cab).map((c) => `<th>${c ? inline(c) : '&nbsp;'}</th>`).join('')}</tr></thead><tbody>`
        + corpo.map((r) => `<tr>${celulas(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>');
      continue;
    }
    const lista = l.match(/^(-|\d+\.) /);
    if (lista) {
      const ordenada = lista[1] !== '-';
      const itens = [];
      while (i < linhas.length && (/^(-|\d+\.) /.test(linhas[i]) || (/^\s+\S/.test(linhas[i]) && itens.length))) {
        if (/^(-|\d+\.) /.test(linhas[i])) itens.push(linhas[i].replace(/^(-|\d+\.) /, ''));
        else itens[itens.length - 1] += ' ' + linhas[i].trim();
        i++;
      }
      const tag = ordenada ? 'ol' : 'ul';
      out.push(`<${tag}>${itens.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`);
      continue;
    }
    const par = [];
    while (i < linhas.length && linhas[i].trim() && !/^(#|\||- |\d+\. |> )/.test(linhas[i])) { par.push(linhas[i].trim()); i++; }
    out.push(`<p>${inline(par.join(' '))}</p>`);
  }
  return { html: out.join('\n'), sumario };
}

/* ── Casca ───────────────────────────────────────────────────── */

const dataBr = (iso) => iso.split('-').reverse().join('/');

const ESTILO = `<style>
.conteudo { max-width: var(--wrap-narrow); margin-inline: auto; padding: 0 var(--pad-x); }
.conteudo h2 { font-size: clamp(1.35rem, 3vw, 1.75rem); margin: 40px 0 14px; scroll-margin-top: calc(var(--nav-h) + 16px); }
.conteudo h3 { font-size: 1.08rem; margin: 24px 0 8px; color: var(--gold-bright); }
.conteudo p { color: var(--pearl-dim); line-height: 1.75; margin-bottom: 14px; }
.conteudo ul, .conteudo ol { color: var(--pearl-dim); line-height: 1.75; margin: 0 0 16px 20px; }
.conteudo li { margin-bottom: 7px; }
.conteudo strong { color: var(--pearl); }
.resposta { padding: 22px 24px; border-radius: var(--radius-lg); margin: 22px 0 8px;
  background: linear-gradient(145deg, rgba(91,216,204,.1), rgba(212,165,116,.06)); border: 1px solid rgba(91,216,204,.28); }
.resposta p { font-size: 1.06rem; line-height: 1.65; color: var(--pearl); }
.resposta p:last-child { margin-bottom: 0; }
.tabela-rolagem { overflow-x: auto; margin: 18px 0; }
.tabela-dados { width: 100%; border-collapse: collapse; font-size: .94rem; }
.tabela-dados th, .tabela-dados td { padding: 11px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
.tabela-dados th { color: var(--pearl-muted); font-weight: 600; font-size: .82rem; text-transform: uppercase; letter-spacing: .06em; }
.tabela-dados td { color: var(--pearl); }
.nota-fonte { font-size: .84rem; color: var(--pearl-muted); font-style: italic; }
.nota-portal { border-left: 3px solid var(--gold-bright); padding: 12px 16px; margin: 18px 0; background: rgba(212,165,116,.06); border-radius: 0 var(--radius-lg) var(--radius-lg) 0; }
.nota-portal p { margin-bottom: 6px; }
.termo { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 18px 0 0; padding: 16px 18px; border: 1px solid var(--line); border-radius: var(--radius-lg); }
.termo dt { color: var(--pearl-muted); font-size: .84rem; }
.termo dd { color: var(--pearl); margin: 0; }
.termo dd[lang="ja"] { font-size: 1.15rem; }
.sumario { margin: 22px 0; padding: 16px 18px; border: 1px solid var(--line); border-radius: var(--radius-lg); }
.sumario p { margin: 0 0 6px; font-weight: 600; color: var(--pearl); }
.sumario ol { margin: 0 0 0 20px; }
.fontes li { font-size: .92rem; }
.cartoes { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; margin: 16px 0 8px; }
.cartao { display: block; padding: 16px 18px; border: 1px solid var(--line); border-radius: var(--radius-lg); color: inherit; text-decoration: none; transition: border-color .2s; }
.cartao:hover, .cartao:focus-visible { border-color: var(--teal); }
.cartao strong { display: block; color: var(--pearl); margin-bottom: 6px; line-height: 1.35; }
.cartao span { display: block; color: var(--pearl-dim); font-size: .9rem; line-height: 1.55; }
.cartao em { display: block; color: var(--pearl-muted); font-size: .8rem; font-style: normal; margin-bottom: 4px; }
.busca-portal { width: 100%; padding: 12px 14px; border-radius: var(--radius-pill); border: 1px solid var(--line-strong); background: var(--surface); color: var(--pearl); font-size: 1rem; margin: 10px 0 4px; }
.verbetes { margin: 0; }
.verbetes > div { padding: 14px 0; border-bottom: 1px solid var(--line); }
.verbetes dt { color: var(--pearl); font-weight: 600; }
.verbetes dt .ro { color: var(--pearl-muted); font-weight: 400; font-size: .86rem; margin-left: 6px; }
.verbetes dd { color: var(--pearl-dim); margin: 4px 0 0; line-height: 1.6; }
.duvida { padding: 16px 0; border-bottom: 1px solid var(--line); }
.duvida h3 { margin-top: 0; }
.duvida p:last-child { margin-bottom: 0; }
.indice-letras { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
.indice-letras a { padding: 6px 12px; border: 1px solid var(--line); border-radius: var(--radius-pill); font-size: .86rem; color: var(--pearl-dim); }
[hidden] { display: none !important; }
@media (max-width: 560px) { .tabela-dados { font-size: .86rem; } .tabela-dados th, .tabela-dados td { padding: 9px 6px; } .termo { grid-template-columns: 1fr; gap: 2px; } .termo dd { margin-bottom: 8px; } }
</style>`;

/** Documento completo: cabeça, menu, migalhas e rodapé — a mesma casca das páginas de conteúdo. */
export function documento({ caminho, titulo, descricao, ogType = 'article', jsonLd, migalhas, corpo, extraHead = '', script = '' }) {
  const url = `${SITE}${caminho}`;
  const listaMigalhas = migalhas.map(([nome, href], i) => (i === migalhas.length - 1
    ? `<li aria-current="page">${esc(nome)}</li>`
    : `<li><a href="${href}">${esc(nome)}</a></li>`)).join('');
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      ...jsonLd,
      {
        '@type': 'BreadcrumbList',
        itemListElement: migalhas.map(([nome, href], i) => ({ '@type': 'ListItem', position: i + 1, name: nome, item: `${SITE}${href}` })),
      },
    ],
  };
  return `<!DOCTYPE html>
<html lang="pt-BR" class="no-js">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}"/>
<link rel="canonical" href="${url}"/>
<meta name="robots" content="index, follow"/>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
<meta property="og:type" content="${ogType}"/>
<meta property="og:locale" content="pt_BR"/>
<meta property="og:url" content="${url}"/>
<meta property="og:title" content="${esc(titulo)}"/>
<meta property="og:description" content="${esc(descricao)}"/>
<meta property="og:image" content="${SITE}/images/opt/consultoria-1024.jpg"/>
<meta name="twitter:card" content="summary_large_image"/>
${extraHead}<link rel="stylesheet" href="/theme-v2.css?v=8"/>
<link rel="stylesheet" href="/casas.css?v=10"/>
${ESTILO}
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
</head>
<body>
<a class="skip-link" href="#main">Ir para o conteúdo</a>
${L.nav}
${L.drawer}

<main id="main">
<nav class="migalhas" aria-label="Você está em">
  <ol>${listaMigalhas}</ol>
</nav>

${corpo}
</main>

${L.foot}
<script src="/theme-v2.js?v=8" defer></script>
<script src="/casas-comum.js?v=10" defer></script>
<script src="/analytics.js" defer></script>
${script}</body>
</html>`;
}

/* ── Página de conteúdo (verbete, blog, guia) ────────────────── */

const CTA = {
  verbete: { cta: 'portal_dicionario', msg: (h1) => `Olá! Li no dicionário da Easy House sobre ${h1} e queria tirar uma dúvida.` },
  blog: { cta: 'blog_contact_click', msg: (h1) => `Olá! Li o artigo "${h1}" no blog da Easy House e queria tirar uma dúvida.` },
  guia: { cta: 'guide_cta_click', msg: (h1) => `Olá! Li o guia "${h1}" no site da Easy House e queria tirar uma dúvida.` },
};

/** "## " antes do primeiro título = resposta direta; o resto é o corpo. */
function separarResposta(corpo) {
  const idx = corpo.search(/^## /m);
  return idx < 0 ? [corpo, ''] : [corpo.slice(0, idx).trim(), corpo.slice(idx).trim()];
}

/**
 * HTML de uma página do portal. `relacionados` já vem resolvido em
 * [href, título]; só itens publicados chegam aqui.
 */
export function paginaItem(item, relacionados) {
  const tipo = TIPOS[item.contentType];
  const caminho = caminhoDe(item);
  const [resposta, resto] = separarResposta(item.corpo);
  const corpo = md(resto);
  const curto = textoPuro(item.h1);
  const migalhas = [['Início', '/entregas'], [tipo.rotulo, tipo.hub], [item.contentType === 'verbete' ? item.termJa : curto, caminho]];
  const fontes = item.references.map((r) => {
    const [txt, href] = r.split(/\s*\|\s*(?=https:)/);
    return `<li><a href="${href}" rel="noopener" style="color:var(--teal)">${esc(txt)}</a></li>`;
  }).join('');
  const datas = item.publishedAt === item.updatedAt
    ? `Publicado em <time datetime="${item.publishedAt}">${dataBr(item.publishedAt)}</time>`
    : `Publicado em <time datetime="${item.publishedAt}">${dataBr(item.publishedAt)}</time> · atualizado em <time datetime="${item.updatedAt}">${dataBr(item.updatedAt)}</time>`;
  const termo = item.contentType === 'verbete' ? `
  <dl class="termo">
    <dt>Em japonês</dt><dd lang="ja">${esc(item.termJa)}</dd>
    <dt>Leitura</dt><dd><span lang="ja">${esc(item.reading)}</span> · ${esc(item.romaji)}</dd>
    <dt>Em português</dt><dd>${esc(item.traducao)}</dd>
  </dl>` : '';
  const sumario = item.contentType !== 'verbete' && corpo.sumario.length >= 3 ? `
  <nav class="sumario" aria-label="Neste texto">
    <p>Neste texto</p>
    <ol>${corpo.sumario.map(([id, t]) => `<li><a href="#${id}" style="color:var(--teal)">${inline(t)}</a></li>`).join('')}</ol>
  </nav>` : '';
  const c = CTA[item.contentType];

  const html = `<article class="conteudo">
  <p class="eyebrow">${esc(tipo.rotulo)}</p>
  <h1 style="font-size:clamp(1.7rem,4.5vw,2.5rem);line-height:1.18;margin-bottom:8px">${inline(item.h1)}</h1>
  <p class="nota-fonte">${datas} · EASY HOUSE, imobiliária licenciada no Japão</p>
  ${termo}
  <div class="resposta">${md(resposta).html}</div>
  ${sumario}
  ${corpo.html}

  <section class="fontes" aria-labelledby="fontes">
    <h2 id="fontes">Fontes</h2>
    <ul>${fontes}</ul>
    <p class="nota-fonte">Leis, taxas e prazos mudam. Este texto foi conferido nessas fontes em ${dataBr(item.updatedAt)}. Para decidir, confirme a sua situação com o banco, a prefeitura ou um profissional habilitado.</p>
  </section>

  <section class="simular" style="margin:36px 0">
    <h3>Ficou alguma dúvida sobre o seu caso?</h3>
    <p>A Easy House explica cada etapa em português e conversa em japonês com o vendedor, o banco e a prefeitura.</p>
    <p class="btn-row" style="margin:0">
      <a class="btn btn--wa" rel="nofollow" data-cta="${c.cta}" href="${WA(c.msg(curto))}">Falar com a Easy House</a>
      <a class="btn btn--ghost" data-cta="${c.cta}_simular" href="/simular">Simular minha parcela</a>
    </p>
  </section>

  <h2 id="continue-lendo">Continue lendo</h2>
  <ul>${relacionados.map(([href, txt]) => `<li><a href="${href}" style="color:var(--teal)">${esc(txt)}</a></li>`).join('')}</ul>
  <p style="margin-top:28px"></p>
</article>`;

  const jsonLd = [{
    '@type': tipo.schema,
    headline: curto,
    description: item.description,
    inLanguage: 'pt-BR',
    datePublished: item.publishedAt,
    dateModified: item.updatedAt,
    author: AUTOR,
    publisher: AUTOR,
    mainEntityOfPage: `${SITE}${caminho}`,
    image: `${SITE}/images/opt/consultoria-1024.jpg`,
    ...(item.contentType === 'verbete' ? {
      about: { '@type': 'DefinedTerm', name: item.termJa, alternateName: [item.romaji, item.traducao], inDefinedTermSet: `${SITE}${HUBS.dicionario}` },
    } : {}),
  }];

  return documento({ caminho, titulo: item.title, descricao: item.description, jsonLd, migalhas, corpo: html });
}

/* ── Hubs ────────────────────────────────────────────────────── */

const cartao = ({ href, titulo, texto, rotulo }) => `<a class="cartao" href="${href}">${rotulo ? `<em>${esc(rotulo)}</em>` : ''}<strong>${esc(titulo)}</strong>${texto ? `<span>${esc(texto)}</span>` : ''}</a>`;

/**
 * Filtro de texto no próprio índice. O conteúdo inteiro já está no HTML; sem
 * JavaScript a página funciona igual, só sem o campo de busca.
 */
const scriptFiltro = (seletor) => `<script>
(function () {
  var campo = document.getElementById('filtroPortal');
  if (!campo) return;
  campo.hidden = false;
  var norm = function (s) { return s.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase(); };
  var itens = Array.prototype.slice.call(document.querySelectorAll('${seletor}'));
  var vazio = document.getElementById('filtroVazio');
  campo.addEventListener('input', function () {
    var q = norm(campo.value.trim());
    var visiveis = 0;
    itens.forEach(function (el) { var ok = !q || norm(el.textContent).indexOf(q) > -1; el.hidden = !ok; if (ok) visiveis++; });
    document.querySelectorAll('[data-grupo]').forEach(function (g) { g.hidden = !g.querySelector('${seletor}:not([hidden])'); });
    if (vazio) vazio.hidden = visiveis > 0;
  });
})();
</script>
`;

const campoFiltro = (rotulo, exemplo) => `<label class="sr-only" for="filtroPortal">${esc(rotulo)}</label>
  <input class="busca-portal" id="filtroPortal" type="search" placeholder="${esc(exemplo)}" autocomplete="off" hidden/>
  <p class="nota-fonte" id="filtroVazio" hidden>Nada encontrado com esse termo. Tente em português ou em japonês.</p>`;

/**
 * /guias — a jornada do comprador, por etapa. Cada etapa lista páginas que
 * existem e estão publicadas; nenhuma vaga para "em breve".
 */
export function paginaHubGuias({ etapas, atualizado }) {
  const corpo = `<div class="conteudo">
  <p class="eyebrow">Guias</p>
  <h1 style="font-size:clamp(1.7rem,4.5vw,2.5rem);line-height:1.18;margin-bottom:8px">Guias para comprar casa no Japão</h1>
  <div class="resposta">
    <p>Do primeiro cálculo de quanto você pode pagar até o dia de receber as chaves: os guias, o dicionário e os artigos da Easy House organizados pela ordem em que as dúvidas aparecem.</p>
    <p>Tudo em português, com o termo japonês ao lado — é ele que aparece nos documentos, no banco e na prefeitura.</p>
  </div>
  <nav class="sumario" aria-label="Etapas">
    <p>As etapas</p>
    <ol>${etapas.map((e) => `<li><a href="#${e.id}" style="color:var(--teal)">${esc(e.titulo)}</a></li>`).join('')}</ol>
  </nav>
  ${etapas.map((e) => `
  <section aria-labelledby="${e.id}">
    <h2 id="${e.id}">${esc(e.titulo)}</h2>
    <p>${esc(e.texto)}</p>
    <div class="cartoes">${e.itens.map(cartao).join('')}</div>
  </section>`).join('')}

  <h2 id="tambem">Também no portal</h2>
  <div class="cartoes">
    ${cartao({ href: HUBS.dicionario, titulo: 'Dicionário imobiliário japonês–português', texto: 'Os termos dos anúncios, contratos e documentos, com leitura e explicação.' })}
    ${cartao({ href: HUBS.duvidas, titulo: 'Dúvidas frequentes', texto: 'Respostas curtas, com o link para a explicação completa.' })}
    ${cartao({ href: HUBS.blog, titulo: 'Blog', texto: 'Artigos práticos: anúncios, visitas, riscos e perguntas antes de assinar.' })}
  </div>
  <p class="nota-fonte" style="margin-top:24px">Atualizado em ${dataBr(atualizado)} · EASY HOUSE, imobiliária licenciada no Japão</p>
  <p style="margin-top:28px"></p>
</div>`;
  const todas = etapas.flatMap((e) => e.itens);
  return documento({
    caminho: HUBS.guias,
    titulo: 'Guias para comprar casa no Japão, etapa por etapa | Easy House',
    descricao: 'Guias em português para comprar casa no Japão: quanto pode pagar, documentos, financiamento, terreno, contrato e chaves, com o termo japonês de cada etapa.',
    ogType: 'website',
    jsonLd: [{
      '@type': 'CollectionPage', name: 'Guias para comprar casa no Japão', inLanguage: 'pt-BR', url: `${SITE}${HUBS.guias}`,
      dateModified: atualizado, publisher: AUTOR,
      hasPart: todas.map((i) => ({ '@type': 'WebPage', name: i.titulo, url: `${SITE}${i.href}` })),
    }],
    migalhas: [['Início', '/entregas'], ['Guias', HUBS.guias]],
    corpo,
  });
}

/** /dicionario-imobiliario — índice por categoria, com busca. */
export function paginaHubDicionario({ categorias, atualizado, total, comPagina }) {
  const corpo = `<div class="conteudo">
  <p class="eyebrow">Dicionário imobiliário</p>
  <h1 style="font-size:clamp(1.7rem,4.5vw,2.5rem);line-height:1.18;margin-bottom:8px">Dicionário imobiliário japonês–português</h1>
  <div class="resposta">
    <p>${total} termos que aparecem nos anúncios, nos contratos e no banco quando se compra ou aluga um imóvel no Japão — com a escrita em japonês, a leitura e o que significa na prática.</p>
    <p>Os ${comPagina} termos com link têm página própria, com exemplo, erro comum e fontes oficiais.</p>
  </div>
  ${campoFiltro('Buscar no dicionário', 'Buscar termo: 手付金, sinal, terreno…')}
  <nav class="indice-letras" aria-label="Categorias">${categorias.map((c) => `<a href="#${c.id}">${esc(c.titulo)}</a>`).join('')}</nav>
  ${categorias.map((c) => `
  <section aria-labelledby="${c.id}" data-grupo>
    <h2 id="${c.id}">${esc(c.titulo)}</h2>
    <dl class="verbetes">${c.termos.map((t) => `
      <div class="verbete" id="termo-${esc(t.ancora)}">
        <dt>${t.href ? `<a href="${t.href}" lang="ja" style="color:var(--teal)">${esc(t.termJa)}</a>` : `<span lang="ja">${esc(t.termJa)}</span>`} <span class="ro">${esc(t.romaji)} · ${esc(t.titulo)}</span></dt>
        <dd>${esc(t.definicao)}${t.href ? ` <a href="${t.href}" style="color:var(--teal)">Ver explicação completa</a>` : t.leiaMais ? ` <a href="${t.leiaMais[0]}" style="color:var(--teal)">${esc(t.leiaMais[1])}</a>` : ''}</dd>
      </div>`).join('')}
    </dl>
  </section>`).join('')}
  <p class="nota-fonte" style="margin-top:24px">Atualizado em ${dataBr(atualizado)} · Explicações próprias da EASY HOUSE. Os verbetes com página citam a lei ou o órgão de origem.</p>
  <p style="margin-top:28px"></p>
</div>`;
  return documento({
    caminho: HUBS.dicionario,
    titulo: 'Dicionário imobiliário japonês–português | Easy House',
    descricao: `${total} termos imobiliários japoneses explicados em português: anúncio, terreno, contrato, financiamento e impostos, com escrita, leitura e uso na compra.`,
    ogType: 'website',
    jsonLd: [{
      '@type': 'DefinedTermSet', '@id': `${SITE}${HUBS.dicionario}`, name: 'Dicionário imobiliário japonês–português', inLanguage: 'pt-BR',
      url: `${SITE}${HUBS.dicionario}`, dateModified: atualizado, publisher: AUTOR,
      hasDefinedTerm: categorias.flatMap((c) => c.termos).map((t) => ({
        '@type': 'DefinedTerm', name: t.termJa, alternateName: [t.romaji, t.titulo], description: t.definicao,
        ...(t.href ? { url: `${SITE}${t.href}` } : {}),
      })),
    }],
    migalhas: [['Início', '/entregas'], ['Dicionário imobiliário', HUBS.dicionario]],
    corpo,
    script: scriptFiltro('.verbete'),
  });
}

/** /duvidas — perguntas curtas agrupadas, cada uma levando à explicação completa. */
export function paginaHubDuvidas({ grupos, atualizado }) {
  const total = grupos.reduce((n, g) => n + g.perguntas.length, 0);
  const corpo = `<div class="conteudo">
  <p class="eyebrow">Dúvidas</p>
  <h1 style="font-size:clamp(1.7rem,4.5vw,2.5rem);line-height:1.18;margin-bottom:8px">Dúvidas sobre comprar casa no Japão</h1>
  <div class="resposta">
    <p>${total} perguntas que os brasileiros mais fazem antes de comprar uma casa no Japão, com resposta direta. Quando o assunto pede mais do que um parágrafo, o link leva à explicação completa.</p>
  </div>
  ${campoFiltro('Buscar nas dúvidas', 'Buscar: entrada, sinal, carimbo, enchente…')}
  <nav class="indice-letras" aria-label="Assuntos">${grupos.map((g) => `<a href="#${g.id}">${esc(g.titulo)}</a>`).join('')}</nav>
  ${grupos.map((g) => `
  <section aria-labelledby="${g.id}" data-grupo>
    <h2 id="${g.id}">${esc(g.titulo)}</h2>
    ${g.perguntas.map((q) => `<div class="duvida" id="${q.id}">
      <h3>${esc(q.pergunta)}</h3>
      ${q.html}
    </div>`).join('\n    ')}
  </section>`).join('')}
  <p class="nota-fonte" style="margin-top:24px">Atualizado em ${dataBr(atualizado)} · EASY HOUSE, imobiliária licenciada no Japão. A Easy House não é instituição financeira e não aprova crédito.</p>
  <p style="margin-top:28px"></p>
</div>`;
  return documento({
    caminho: HUBS.duvidas,
    titulo: 'Dúvidas sobre comprar casa no Japão: respostas diretas | Easy House',
    descricao: 'Entrada, sinal, carimbo, corretagem, enchente, chaves: respostas diretas às dúvidas de quem quer comprar casa no Japão, em português.',
    ogType: 'website',
    jsonLd: [{ '@type': 'CollectionPage', name: 'Dúvidas sobre comprar casa no Japão', inLanguage: 'pt-BR', url: `${SITE}${HUBS.duvidas}`, dateModified: atualizado, publisher: AUTOR }],
    migalhas: [['Início', '/entregas'], ['Dúvidas', HUBS.duvidas]],
    corpo,
    script: scriptFiltro('.duvida'),
  });
}

/** /blog — artigos publicados, do mais novo ao mais antigo. */
export function paginaHubBlog({ posts, atualizado }) {
  const corpo = `<div class="conteudo">
  <p class="eyebrow">Blog</p>
  <h1 style="font-size:clamp(1.7rem,4.5vw,2.5rem);line-height:1.18;margin-bottom:8px">Blog da Easy House: casa própria no Japão na prática</h1>
  <div class="resposta">
    <p>Artigos sobre o que aparece no caminho de quem compra casa no Japão: como ler um anúncio, o que olhar na visita, como consultar riscos e o que perguntar antes de assinar.</p>
  </div>
  <div class="cartoes">${posts.map((p) => cartao({ href: p.href, titulo: p.titulo, texto: p.resumo, rotulo: dataBr(p.data) })).join('')}</div>
  <p class="nota-fonte" style="margin-top:24px">Atualizado em ${dataBr(atualizado)} · <a href="/rss.xml" style="color:var(--teal)">Assinar por RSS</a></p>
  <p style="margin-top:28px"></p>
</div>`;
  return documento({
    caminho: HUBS.blog,
    titulo: 'Blog da Easy House: casa própria no Japão na prática',
    descricao: 'Artigos práticos para brasileiros que querem comprar casa no Japão: anúncios em japonês, visitas, riscos de enchente, terremoto e perguntas antes do contrato.',
    ogType: 'website',
    extraHead: `<link rel="alternate" type="application/rss+xml" title="Blog da Easy House" href="${SITE}/rss.xml"/>\n`,
    jsonLd: [{
      '@type': 'Blog', name: 'Blog da Easy House', inLanguage: 'pt-BR', url: `${SITE}${HUBS.blog}`, publisher: AUTOR,
      blogPost: posts.map((p) => ({ '@type': 'BlogPosting', headline: p.titulo, url: `${SITE}${p.href}`, datePublished: p.data })),
    }],
    migalhas: [['Início', '/entregas'], ['Blog', HUBS.blog]],
    corpo,
  });
}

/** RSS 2.0 do blog. */
export function rss(posts) {
  const itens = posts.map((p) => `  <item>
    <title>${esc(p.titulo)}</title>
    <link>${SITE}${p.href}</link>
    <guid isPermaLink="true">${SITE}${p.href}</guid>
    <pubDate>${new Date(`${p.data}T09:00:00+09:00`).toUTCString()}</pubDate>
    <description>${esc(p.resumo)}</description>
  </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Blog da Easy House</title>
  <link>${SITE}${HUBS.blog}</link>
  <description>Casa própria no Japão na prática, em português.</description>
  <language>pt-BR</language>
${itens}
</channel>
</rss>
`;
}

/* ── Links ───────────────────────────────────────────────────── */

/** Todos os href internos de um HTML (sem âncora e sem query). */
export const linksInternos = (html) => [...new Set([...html.matchAll(/href="(\/[^"#?]*)/g)].map((m) => m[1]))];

/**
 * Rotas que não são arquivo: as do vercel.json (listas e fichas geradas na
 * hora) e os arquivos servidos por função.
 */
export const ROTAS_DINAMICAS = [
  /^\/$/, /^\/comprar\/imoveis(\/[^/]+)?$/, /^\/imoveis(\/[^/]+)?$/, /^\/casas-a-venda(\/[^/]+)?$/,
  /^\/casas-novas$/, /^\/casas-usadas$/, /^\/es\/casas-en-venta(\/[^/]+)?$/, /^\/es\/casas-nuevas$/, /^\/es\/casas-usadas$/,
  /^\/llms\.txt$/, /^\/sitemap-casas\.xml$/, /^\/sitemap-aluguel\.xml$/,
];

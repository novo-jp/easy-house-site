/**
 * Portal educativo: /guias, /duvidas, /dicionario-imobiliario e /blog.
 *
 * Confere o que o build-portal.mjs gravou contra o texto-fonte em
 * docs/seo/portal-guias/conteudo/: só item `publicado` vira página e entra no
 * sitemap, rascunho fica fora do site, e cada página tem os metadados, o
 * JSON-LD e os links que o build promete.
 *
 * Mudou o texto e esqueceu de rodar `node build-portal.mjs`? Estes testes
 * acusam (a página gravada não bate com o .md).
 *
 * Rodar: node --test tests/
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lerItem, problemasDoItem, caminhoDe, arquivoDe, linksInternos, ROTAS_DINAMICAS, HUBS, SITE, md }
  from '../lib/portal.mjs';
import { trechosVetados } from '../lib/tema-excluido.mjs';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const ler = (rel) => readFileSync(path.join(RAIZ, rel), 'utf8');
const CONTEUDO = 'docs/seo/portal-guias/conteudo';

const itens = ['verbetes', 'blog', 'guias'].flatMap((pasta) =>
  readdirSync(path.join(RAIZ, CONTEUDO, pasta)).filter((f) => f.endsWith('.md'))
    .map((f) => ({ ...lerItem(ler(`${CONTEUDO}/${pasta}/${f}`), `${pasta}/${f}`), arquivoFonte: f })));
const publicados = itens.filter((i) => i.status === 'publicado');
const rascunhos = itens.filter((i) => i.status === 'rascunho');
const hubs = Object.values(HUBS);
const paginasPortal = [...hubs, ...publicados.map(caminhoDe)];
const html = (caminho) => ler(arquivoDe(caminho));
const sitemap = ler('sitemap.xml');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(SITE, '') || '/');

describe('texto-fonte (frontmatter)', () => {
  test('todo item tem os campos obrigatórios e o arquivo se chama slug.md', () => {
    for (const i of itens) {
      assert.deepEqual(problemasDoItem(i), [], i.origem);
      assert.equal(i.arquivoFonte, `${i.slug}.md`, i.origem);
    }
  });

  test('id, caminho, title, h1 e description não se repetem entre os publicados', () => {
    for (const campo of ['id', 'title', 'h1', 'description']) {
      const v = publicados.map((i) => i[campo]);
      assert.equal(new Set(v).size, v.length, `${campo} repetido`);
    }
    const c = publicados.map(caminhoDe);
    assert.equal(new Set(c).size, c.length, 'caminho repetido');
  });

  test('publicado não tem pendência de checagem; rascunho tem', () => {
    for (const i of publicados) assert.equal(i.needsFactCheck, false, i.origem);
    for (const i of rascunhos) assert.equal(i.needsFactCheck, true, i.origem);
  });

  test('guia novo não duplica página que o build-conteudo já gera', () => {
    for (const i of itens.filter((x) => x.contentType === 'guia')) {
      assert.ok(!existsSync(path.join(RAIZ, `${i.slug}.html`)) || i.status === 'publicado', `/${i.slug} já existe`);
    }
  });
});

describe('páginas publicadas', () => {
  test('cada publicado e cada hub tem arquivo gravado', () => {
    for (const c of paginasPortal) assert.ok(existsSync(path.join(RAIZ, arquivoDe(c))), c);
  });

  test('title, description, canonical, h1 único e lang pt-BR', () => {
    const canonicos = [];
    for (const c of paginasPortal) {
      const h = html(c);
      assert.match(h, /<html lang="pt-BR"/, c);
      assert.match(h, /<title>[^<]{10,}<\/title>/, c);
      assert.match(h, /<meta name="description" content="[^"]{50,}"/, c);
      const can = h.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      assert.equal(can, `${SITE}${c}`, `canonical de ${c}`);
      canonicos.push(can);
      assert.equal((h.match(/<h1[\s>]/g) || []).length, 1, `um h1 em ${c}`);
      assert.doesNotMatch(h, /noindex/, c);
      // O portal só existe em português: sem hreflang que prometa par em espanhol.
      assert.doesNotMatch(h, /<link rel="alternate" hreflang/, c);
    }
    assert.equal(new Set(canonicos).size, canonicos.length, 'canonical repetido');
  });

  test('a página gravada é a do texto-fonte atual (o build foi rodado)', () => {
    for (const i of publicados) {
      const h = html(caminhoDe(i));
      assert.ok(h.includes(`<title>${i.title.replace(/&/g, '&amp;')}`), `${i.origem}: title desatualizado — rode node build-portal.mjs`);
      assert.ok(h.includes(i.description.replace(/&/g, '&amp;').replace(/"/g, '&quot;')), `${i.origem}: description desatualizada`);
      assert.ok(h.includes(`"dateModified":"${i.updatedAt}"`), `${i.origem}: dateModified ≠ updatedAt`);
    }
  });

  test('JSON-LD válido: Article/BlogPosting com autor e datas, DefinedTerm nos verbetes, BreadcrumbList', () => {
    for (const i of publicados) {
      const h = html(caminhoDe(i));
      const blocos = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
      const tipos = blocos.flatMap((b) => (b['@graph'] || [b]).map((x) => x['@type']));
      assert.ok(tipos.includes('BreadcrumbList'), `${i.origem}: sem BreadcrumbList`);
      const art = blocos.flatMap((b) => b['@graph'] || [b]).find((x) => ['Article', 'BlogPosting'].includes(x['@type']));
      assert.ok(art, `${i.origem}: sem Article`);
      assert.equal(art.author?.name, 'EASY HOUSE', i.origem);
      assert.equal(art.datePublished, i.publishedAt, i.origem);
      if (i.contentType === 'verbete') assert.equal(art.about?.['@type'], 'DefinedTerm', i.origem);
      if (i.contentType === 'blog') assert.equal(art['@type'], 'BlogPosting', i.origem);
    }
  });

  test('toda página tem fontes oficiais e um CTA medido', () => {
    for (const i of publicados) {
      const h = html(caminhoDe(i));
      for (const ref of i.references) assert.ok(h.includes(ref.split(/\s*\|\s*/).pop()), `${i.origem}: fonte ${ref} não aparece`);
      assert.match(h, /href="https:\/\/wa\.me\/[^"]+" [^>]*data-cta="(portal_dicionario|blog_contact_click|guide_cta_click)"|data-cta="(portal_dicionario|blog_contact_click|guide_cta_click)"[^>]*href="https:\/\/wa\.me/, `${i.origem}: CTA sem data-cta`);
    }
  });
});

describe('rascunhos ficam fora do site', () => {
  test('rascunho não tem página, não está no sitemap nem em link de página publicada', () => {
    const todosLinks = new Set(paginasPortal.flatMap((c) => linksInternos(html(c))));
    for (const r of rascunhos) {
      const c = caminhoDe(r);
      assert.ok(!existsSync(path.join(RAIZ, arquivoDe(c))), `${r.origem}: página gravada`);
      assert.ok(!locs.includes(c), `${r.origem}: no sitemap`);
      assert.ok(!todosLinks.has(c), `${r.origem}: alguma página publicada aponta para ele`);
    }
  });

  test('a prévia de revisão não vai para a Vercel (docs/ está no .vercelignore)', () => {
    assert.match(ler('.vercelignore'), /^\/?docs\/?$/m);
  });
});

describe('sitemap e RSS', () => {
  test('o bloco do portal tem exatamente os hubs e os publicados, com lastmod = updatedAt', () => {
    const bloco = sitemap.match(/<!-- portal: gerado por build-portal\.mjs -->([\s\S]*?)<!-- \/portal -->/)?.[1];
    assert.ok(bloco, 'bloco do portal ausente no sitemap');
    const noBloco = [...bloco.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(SITE, ''));
    assert.deepEqual([...noBloco].sort(), [...paginasPortal].sort());
    for (const i of publicados) assert.ok(bloco.includes(`<loc>${SITE}${caminhoDe(i)}</loc><lastmod>${i.updatedAt}</lastmod>`), i.origem);
  });

  test('nenhuma URL aparece duas vezes no sitemap', () => {
    assert.equal(new Set(locs).size, locs.length);
  });

  test('o RSS lista os artigos publicados do blog', () => {
    const r = ler('rss.xml');
    for (const p of publicados.filter((i) => i.contentType === 'blog')) assert.ok(r.includes(`${SITE}${caminhoDe(p)}`), p.origem);
  });
});

describe('links internos', () => {
  const existe = (href) => existsSync(path.join(RAIZ, arquivoDe(href))) || existsSync(path.join(RAIZ, href.slice(1)))
    || ROTAS_DINAMICAS.some((re) => re.test(href));

  test('nenhum link interno quebrado nas páginas do portal', () => {
    for (const c of paginasPortal) for (const href of linksInternos(html(c))) assert.ok(existe(href), `${c} → ${href}`);
  });

  test('âncoras do dicionário usadas pelo portal existem', () => {
    const dic = html(HUBS.dicionario);
    for (const c of paginasPortal) {
      for (const m of html(c).matchAll(/href="\/dicionario-imobiliario#([^"]+)"/g)) assert.match(dic, new RegExp(`id="${m[1]}"`), `${c} → #${m[1]}`);
    }
  });

  test('menu, gaveta e rodapé levam ao portal', () => {
    const L = JSON.parse(ler('lib/casas-layout.json'));
    assert.match(L.nav, /href="\/guias"/);
    assert.match(L.drawer, /href="\/guias"/);
    for (const h of hubs) assert.match(L.foot, new RegExp(`href="${h}"`), h);
  });
});

describe('tema excluído', () => {
  test('nada do portal (publicado, rascunho, índice, dúvidas) cita o tema', () => {
    for (const i of itens) assert.deepEqual(trechosVetados(i.corpo + i.title + i.description), [], i.origem);
    assert.deepEqual(trechosVetados(ler(`${CONTEUDO}/dicionario-indice.json`) + ler(`${CONTEUDO}/duvidas.md`)), []);
    for (const c of paginasPortal) assert.deepEqual(trechosVetados(html(c)), [], c);
  });
});

describe('o renderizador', () => {
  test('md: título vira h2 com id, nota vira aside, tabela ganha rolagem', () => {
    const { html: h, sumario } = md('Intro.\n\n## Primeira parte\n\n> Atenção\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    assert.match(h, /<h2 id="primeira-parte">/);
    assert.match(h, /<aside class="nota-portal">/);
    assert.match(h, /class="tabela-rolagem"/);
    assert.equal(sumario.length, 1);
  });
});

describe('manifesto resolvido', () => {
  const r = JSON.parse(ler('docs/seo/portal-guias/manifesto-resolvido.json'));
  const CAMPOS = ['id', 'proposedPath', 'actualPath', 'canonical', 'language', 'source', 'status', 'publicationGate', 'targetIntent', 'duplicateOf'];

  test('os 125 candidatos têm decisão e todos os campos', () => {
    assert.equal(r.itens.length, 125);
    for (const x of r.itens) for (const c of CAMPOS) assert.ok(c in x, `${x.id}: falta ${c}`);
  });

  test('o que diz publicado existe no site, e o que é rascunho não', () => {
    for (const x of r.itens) {
      if (['publicado_novo', 'publicado_no_hub', 'existente_mantido'].includes(x.status)) {
        assert.ok(x.actualPath, x.id);
        const [pg, ancoraId] = x.actualPath.split('#');
        if (ROTAS_DINAMICAS.some((re) => re.test(pg))) continue;
        assert.ok(existsSync(path.join(RAIZ, arquivoDe(pg))), `${x.id}: ${pg}`);
        if (ancoraId) assert.match(ler(arquivoDe(pg)), new RegExp(`id="${ancoraId}"`), `${x.id}: #${ancoraId}`);
      }
      if (x.status === 'rascunho') assert.equal(x.actualPath, null, x.id);
      if (x.status === 'consolidado') assert.ok(r.itens.some((y) => y.id === x.duplicateOf) , `${x.id}: duplicateOf ${x.duplicateOf}`);
    }
  });
});

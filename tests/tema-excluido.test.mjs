/**
 * Financiamento sem visto permanente está fora do escopo editorial.
 *
 * Decisão da Easy House em 02/11/2026 (regras SEO revisadas): as duas
 * páginas do tema (/financiamento-sem-eijuken e o par em espanhol) saíram
 * do ar e devolvem 404, e o assunto não volta como página, FAQ, metadado,
 * link interno, sitemap, dado estruturado ou texto para IA.
 *
 * A regra do produto continua verdadeira num lugar só: o quadro
 * "Flat 35 × banco" das páginas de financiamento, marcado com
 * `data-fato-produto`. O simulador pergunta o tipo de visto para qualificar
 * o lead — é funil, não conteúdo de busca.
 *
 * Rodar: node --test tests/
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { trechosVetados } from '../lib/tema-excluido.mjs';
import { acharCidade, acharProvincia, paginaCidade, paginaProvincia, paginaHub, paginaTipo,
         urlsRegionais } from '../lib/casas-cidade.mjs';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const ler = (rel) => readFileSync(path.join(RAIZ, rel), 'utf8');

/** Arquivos do site que podem citar o tema, e por quê. */
const PODEM_CITAR = new Map([
  ['lib/tema-excluido.mjs', 'define a regra'],
  ['build-conteudo.mjs', 'quadro do Flat 35 (data-fato-produto) e a mensagem da trava'],
  ['simular.html', 'funil: o tipo de visto qualifica o lead'],
  ['simular-es.html', 'funil, em espanhol'],
  ['simular.js', 'funil'],
  ['lib/financing.js', 'aviso do Flat 35 no resultado do simulador'],
  ['lib/financing-config.json', 'regra do Flat 35 do simulador (residencyStatusesAccepted)'],
  ['i18n.js', 'tradução do aviso do simulador'],
  ['lib/notificar.js', 'e-mail interno para a equipe com o tipo de visto do lead'],
]);

// docs/ não é publicada (.vercelignore); _next/ é o pacote do app da /entregas,
// cujo texto visível é conferido no HTML exportado (entregas.html).
const IGNORAR = new Set(['node_modules', '_next', '.git', 'Imoveis', 'media', 'images', 'modelos', '.claude', 'docs', 'tests']);
const EXTENSOES = ['.html', '.js', '.mjs', '.json', '.xml', '.txt', '.css'];

function* arquivos(dir) {
  for (const nome of readdirSync(dir)) {
    if (IGNORAR.has(nome)) continue;
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) yield* arquivos(p);
    else if (EXTENSOES.includes(path.extname(nome))) yield p;
  }
}

describe('tema excluído: financiamento sem visto permanente', () => {
  test('as duas páginas saíram do ar e nenhum rewrite as traz de volta', () => {
    for (const rel of ['financiamento-sem-eijuken.html', 'es/hipoteca-sin-residencia-permanente.html']) {
      assert.ok(!existsSync(path.join(RAIZ, rel)), `${rel} voltou`);
    }
    const vercel = ler('vercel.json');
    assert.doesNotMatch(vercel, /eijuken|sin-residencia/);
  });

  test('nenhum arquivo publicado cita o tema, fora os que têm motivo', () => {
    const culpados = [];
    for (const arq of arquivos(RAIZ)) {
      const rel = path.relative(RAIZ, arq).split(path.sep).join('/');
      if (PODEM_CITAR.has(rel)) continue;
      const v = trechosVetados(readFileSync(arq, 'utf8'));
      if (v.length) culpados.push(`${rel}: ${v.join(', ')}`);
    }
    assert.deepEqual(culpados, [], `tema excluído em:\n${culpados.join('\n')}`);
  });

  test('a regra do Flat 35 fica só no quadro das páginas de financiamento, com fonte e data', () => {
    for (const rel of ['financiamento-imovel-japao.html', 'es/financiamiento-hipotecario-tokai.html']) {
      const h = ler(rel);
      const quadro = h.match(/<tr data-fato-produto="flat35">([\s\S]*?)<\/tr>/);
      assert.ok(quadro, `${rel} perdeu o quadro do Flat 35`);
      assert.match(quadro[1], /永住者/);
      assert.match(quadro[1], /特別永住者/);
      assert.match(h, /JHF \(pregunta n\.º 308\)|JHF \(pergunta nº 308\)/);
      assert.match(h, /31\/10\/2026/);
      assert.deepEqual(trechosVetados(h), [], 'fora do quadro, nada');
      // Nem como pergunta frequente nem no FAQPage.
      assert.doesNotMatch(h, /Preciso ter visto|Necesito residencia/);
    }
  });

  describe('páginas regionais geradas na hora', () => {
    const casa = (over = {}) => ({
      codigo: 'EH-1', slug: 'c', titulo: 'Casa 3LDK', cidade: 'Nishio', cidadeJp: '西尾市', prefeitura: 'Aichi',
      preco: 30e6, precoFormatado: '¥30.000.000', precoMan: '3.000 万円', planta: '3LDK',
      areaConstruida: 100, areaTerreno: 150, idade: 0, vaga: { vagas: 1, pt: 'Com vaga' },
      acesso: { estacao: '西尾', minutosAPe: 10 }, estimativa: { valor: 90000 }, fotos: [], destaquesLista: [], ...over,
    });
    const acervo = [
      ...Array.from({ length: 6 }, (_, i) => casa({ slug: `n${i}`, preco: (20 + i) * 1e6 })),
      ...Array.from({ length: 5 }, (_, i) => casa({ slug: `s${i}`, cidade: 'Suzuka', cidadeJp: '鈴鹿市', prefeitura: 'Mie', idade: 12, construcaoNova: false })),
    ];

    for (const lang of ['pt', 'es']) {
      test(`hub, província, cidade e tipo (${lang}) não citam o tema`, () => {
        const cidade = acharCidade(acervo, 'nishio');
        const prov = acharProvincia(acervo, 'mie');
        const paginas = {
          hub: paginaHub({ todas: acervo, lang }),
          provincia: paginaProvincia({ provincia: prov, casas: prov.casas, lang }),
          cidade: paginaCidade({ cidade, casas: cidade.casas, todas: acervo, lang }),
          novas: paginaTipo({ tipo: 'novas', todas: acervo, lang }),
          usadas: paginaTipo({ tipo: 'usadas', todas: acervo, lang }),
        };
        for (const [nome, h] of Object.entries(paginas)) assert.deepEqual(trechosVetados(h), [], nome);
      });
    }

    test('o sitemap regional não lista o tema', () => {
      assert.deepEqual(trechosVetados(JSON.stringify(urlsRegionais(acervo))), []);
    });
  });

  describe('o filtro', () => {
    test('pega acento, hífen de URL e japonês', () => {
      assert.deepEqual(trechosVetados('Residência Permanente'), ['residencia permanente']);
      assert.deepEqual(trechosVetados('href="/financiamento-sem-eijuken"'), ['eijuken']);
      assert.deepEqual(trechosVetados('/es/hipoteca-sin-residencia-permanente'), ['residencia permanente']);
      assert.deepEqual(trechosVetados('住宅ローン 永住権なし'), ['永住']);
      assert.deepEqual(trechosVetados('Status de residência (在留資格)'), []);
    });

    test('perdoa só o elemento marcado como regra de produto', () => {
      assert.deepEqual(trechosVetados('<tr data-fato-produto="flat35"><td>永住者</td></tr>'), []);
      assert.deepEqual(trechosVetados('<tr data-fato-produto="flat35"><td>Flat 35</td></tr><p>sem 永住</p>'), ['永住']);
    });
  });

  test('o manifesto SEO segue a lista revisada: 132 páginas, 525 palavras-chave, nenhuma do tema', () => {
    const m = JSON.parse(ler('docs/seo/seo_manifest_resolvido.json'));
    assert.equal(m.paginas.length, 132);
    assert.equal(m.keywords.length, 525);
    assert.deepEqual(trechosVetados(JSON.stringify(m)), []);
    const alvo = Object.fromEntries(m.keywords.map((k) => [k.keyword, k.url_real]));
    assert.equal(alvo['haken financiamento casa'], '/financiamento-trabalho-haken');
    assert.equal(alvo['kojin financiamento imóvel'], '/financiamento-autonomo');
    assert.equal(alvo['quanto banco libera para financiar casa'], '/renda-minima-financiamento');
    assert.equal(alvo['hipoteca para trabajadores temporales Japón'], '/es/hipoteca-trabajo-haken');
  });
});

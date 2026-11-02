/**
 * Guias de financiamento e páginas-pilar em português e espanhol.
 *
 * Publicados em 31/10/2026 depois da aprovação da Easy House. O texto mora
 * em docs/seo/guias/{pt,es}/*.md e vira HTML por build-conteudo.mjs. Este
 * teste lê o HTML gerado — o que de fato vai ao ar.
 *
 * Rodar: node --test tests/
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const ler = (rel) => readFileSync(path.join(RAIZ, `${rel}.html`), 'utf8');
const texto = (h) => h.replace(/<script.*?<\/script>/gs, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const PARES = [
  ['quanto-custa-casa-japao', 'es/gastos-comprar-vivienda'],
  ['financiamento-imovel-japao', 'es/financiamiento-hipotecario-tokai'],
  ['guia-comprar-casa-japao', 'es/guia-comprar-casa-japon'],
  ['financiamento-trabalho-haken', 'es/hipoteca-trabajo-haken'],
  ['financiamento-autonomo', 'es/hipoteca-trabajador-independiente'],
  ['renda-minima-financiamento', 'es/ingresos-para-hipoteca'],
  ['documentos-financiamento', 'es/documentos-hipoteca'],
];

describe('páginas de conteúdo bilíngues', () => {
  for (const [pt, es] of PARES) {
    test(`${pt} ↔ ${es}: existem, cada uma na sua língua, e uma aponta para a outra`, () => {
      assert.ok(existsSync(path.join(RAIZ, `${pt}.html`)), `${pt}.html não foi gerado`);
      assert.ok(existsSync(path.join(RAIZ, `${es}.html`)), `${es}.html não foi gerado`);
      const hPt = ler(pt), hEs = ler(es);
      assert.match(hPt, /<html lang="pt-BR"/);
      assert.match(hEs, /<html lang="es"/);
      for (const h of [hPt, hEs]) {
        assert.ok(h.includes(`hreflang="pt-BR" href="https://easyhouse.homes/${pt}"`));
        assert.ok(h.includes(`hreflang="es" href="https://easyhouse.homes/${es}"`));
      }
    });

    test(`${pt} e ${es}: nada de rascunho, nada proibido`, () => {
      for (const h of [ler(pt), ler(es)]) {
        const t = texto(h);
        assert.doesNotMatch(t, /CONFIRMAR|RASCUNHO|\[CTA\]|\[cidade\]|\[ciudad\]/);
        assert.doesNotMatch(t, /aprova[çc][ãa]o garantida|cr[ée]dito aprovado|aprobaci[óo]n garantizada|renda m[íi]nima de ¥/i);
      }
    });
  }

  test('haken e autônomo citam a exigência do Flat 35 e levam ao quadro com a regra', () => {
    for (const [rel, quadro] of [
      ['financiamento-trabalho-haken', '/financiamento-imovel-japao'],
      ['financiamento-autonomo', '/financiamento-imovel-japao'],
      ['es/hipoteca-trabajo-haken', '/es/financiamiento-hipotecario-tokai'],
      ['es/hipoteca-trabajador-independiente', '/es/financiamiento-hipotecario-tokai'],
    ]) {
      const h = ler(rel);
      assert.match(texto(h), /status de residência|estatus de residencia/);
      assert.ok(h.includes(`href="${quadro}"`), `${rel} não linka ${quadro}`);
    }
  });

  test('nas páginas em espanhol, os links internos levam ao par em espanhol', () => {
    for (const [, es] of PARES) {
      const h = ler(es).replace(/<footer[\s\S]*<\/footer>/, '').replace(/<nav[\s\S]*?<\/nav>/g, '');
      for (const pt of ['/simular"', '/financiamento-trabalho-haken"', '/quanto-custa-casa-japao"', '/guia-comprar-casa-japao"']) {
        assert.ok(!h.includes(`href="${pt}`), `${es} ainda linka ${pt}`);
      }
    }
  });
});

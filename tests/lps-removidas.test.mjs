/**
 * As landings que saíram do ar em 10/10/2026 não podem voltar por um link.
 *
 * A Easy House concentrou o tráfego pago em /simular, /simular-es e /entregas.
 * As outras sete páginas foram removidas e devolvem 404 — decisão dela, em
 * 10/10/2026, depois de considerar o redirecionamento.
 *
 * O risco que este teste cobre não é a página voltar: é um link para ela
 * sobreviver em algum canto (menu compartilhado, rodapé, llms.txt, gerador de
 * conteúdo) e virar beco sem saída, sem ninguém perceber. Já aconteceu de um
 * link escapar da varredura por estar escapado dentro de JSON.
 *
 * Rodar: node --test tests/
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, não `.pathname`: o caminho do projeto tem espaço e viria
// como "Site%20Easy%20House".
const RAIZ = fileURLToPath(new URL('..', import.meta.url));

const REMOVIDAS = [
  'raio-x', 'comprar-casa-sem-pr', 'documentos-entrada-dividas',
  'omatome', 'landingvendas', 'landingaluguel', 'refinanciamento',
];

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

describe('landings fora do ar', () => {
  test('nenhum arquivo do site linka para uma página removida', () => {
    // Padrão solto de propósito: pega href="/omatome", '/omatome' no gerador e
    // \"/omatome\" escapado dentro de lib/casas-layout.json.
    const pad = new RegExp(`/(?:${REMOVIDAS.join('|')})\\b`);
    const culpados = [];
    for (const arq of arquivos(RAIZ)) {
      const linhas = readFileSync(arq, 'utf8').split('\n');
      linhas.forEach((l, i) => {
        // Comentários podem citar a página para explicar por que ela saiu.
        const comentario = /^\s*(\/\/|\/\*|\*|#|<!--)/.test(l);
        if (pad.test(l) && !comentario) {
          culpados.push(`${path.relative(RAIZ, arq)}:${i + 1}  ${l.trim().slice(0, 90)}`);
        }
      });
    }
    assert.deepEqual(culpados, [], `links para landing fora do ar:\n${culpados.join('\n')}`);
  });

  test('o sitemap só anuncia páginas que existem', () => {
    const sitemap = readFileSync(path.join(RAIZ, 'sitemap.xml'), 'utf8');
    for (const slug of REMOVIDAS) {
      assert.ok(!sitemap.includes(`/${slug}<`), `${slug} ainda está no sitemap`);
    }
    // E as que ficaram continuam anunciadas.
    for (const viva of ['/simular', '/simular-es', '/entregas']) {
      assert.ok(sitemap.includes(`https://easyhouse.homes${viva}</loc>`), `${viva} sumiu do sitemap`);
    }
  });

  test('o menu compartilhado do portal leva só a páginas vivas', () => {
    const L = JSON.parse(readFileSync(path.join(RAIZ, 'lib', 'casas-layout.json'), 'utf8'));
    const destinos = Object.values(L).flatMap((html) => [...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]));
    assert.ok(destinos.length > 0, 'nenhum link encontrado no layout');
    for (const d of destinos) {
      assert.ok(!REMOVIDAS.some((r) => d === `/${r}`), `o layout ainda leva a ${d}`);
    }
    for (const esperado of ['/simular', '/entregas', '/comprar/imoveis']) {
      assert.ok(destinos.includes(esperado), `o layout deixou de levar a ${esperado}`);
    }
  });
});

/**
 * Servidor de desenvolvimento — imita o roteamento da Vercel localmente.
 *
 *   node dev-server.mjs        → http://localhost:3000
 *
 * Reproduz o que o vercel.json faz em produção: cleanUrls (/sobre → sobre.html),
 * as funções em /api/* e o rewrite das páginas de imóvel.
 * Precisa de SUPABASE_URL e SUPABASE_SERVICE_KEY no ambiente (ou em .env.local).
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const RAIZ = process.cwd();
const PORTA = Number(process.env.PORT) || 3000;

if (existsSync('.env.local')) {
  for (const linha of readFileSync('.env.local', 'utf8').split('\n')) {
    const [k, ...resto] = linha.split('=');
    if (k && resto.length && !linha.trim().startsWith('#')) {
      process.env[k.trim()] ??= resto.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

/** Resposta no formato que os handlers da Vercel esperam. */
function adaptarResposta(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); return res; };
  res.send = (b) => { res.end(b); return res; };
  return res;
}

async function servirArquivo(res, caminho) {
  const dados = await readFile(caminho);
  res.setHeader('Content-Type', TIPOS[extname(caminho).toLowerCase()] || 'application/octet-stream');
  res.end(dados);
}

/** A Vercel entrega req.body já parseado; aqui isso é feito na mão. */
async function lerCorpo(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const pedacos = [];
  for await (const p of req) pedacos.push(p);
  const cru = Buffer.concat(pedacos).toString('utf8');
  if (!cru) return undefined;
  const tipo = req.headers['content-type'] || '';
  if (tipo.includes('application/json')) {
    try { return JSON.parse(cru); } catch { return cru; }
  }
  return cru;
}

const servidor = createServer(async (req, res) => {
  adaptarResposta(res);
  req.body = await lerCorpo(req);
  const url = new URL(req.url, `http://localhost:${PORTA}`);
  let rota = decodeURIComponent(url.pathname);

  try {
    // /comprar/imoveis/<slug> → função da página do imóvel
    const mSlug = rota.match(/^\/comprar\/imoveis\/([^/]+)\/?$/);
    if (mSlug) {
      const { default: h } = await import(`./api/casa.mjs?t=${Date.now()}`);
      req.url = `/api/casa?slug=${encodeURIComponent(mSlug[1])}`;
      return h(req, res);
    }

    if (rota === '/sitemap-casas.xml') {
      const { default: h } = await import(`./api/sitemap-casas.mjs?t=${Date.now()}`);
      return h(req, res);
    }

    if (rota.startsWith('/api/')) {
      const nome = rota.replace('/api/', '').replace(/\/$/, '');
      const arq = join(RAIZ, 'api', `${nome}.mjs`);
      if (!existsSync(arq)) { res.statusCode = 404; return res.end('API não encontrada'); }
      const { default: h } = await import(`${arq}?t=${Date.now()}`);   // recarrega a cada request
      return h(req, res);
    }

    // Estático, com cleanUrls
    let alvo = normalize(join(RAIZ, rota));
    if (!alvo.startsWith(RAIZ)) { res.statusCode = 403; return res.end('Proibido'); }

    if (rota === '/' || rota === '') alvo = join(RAIZ, 'index.html');
    else if (!extname(alvo)) {
      if (existsSync(`${alvo}.html`)) alvo = `${alvo}.html`;
      else if (existsSync(join(alvo, 'index.html'))) alvo = join(alvo, 'index.html');
    }

    if (existsSync(alvo) && (await stat(alvo)).isFile()) return servirArquivo(res, alvo);

    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<h1>404</h1><p>Não encontrado: ' + rota.replace(/[<>&]/g, '') + '</p>');
  } catch (e) {
    console.error('[dev]', rota, e);
    res.statusCode = 500;
    res.end('Erro: ' + e.message);
  }
});

servidor.listen(PORTA, () => {
  const ok = process.env.SUPABASE_SERVICE_KEY ? 'configurado' : 'AUSENTE (as páginas de imóvel vão falhar)';
  console.log(`dev-server em http://localhost:${PORTA}  |  Supabase: ${ok}`);
});

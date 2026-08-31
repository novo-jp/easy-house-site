/**
 * POST /api/raiox — Vercel Serverless Function
 *
 * Recebe o Raio-X concluído para que o atendimento comece com o caso na mão.
 *
 * POR QUE ISTO EXISTE
 * A pessoa termina o Raio-X e abre o WhatsApp. Sem este caminho, o consultor
 * recebe "olá" e pergunta tudo de novo — prazo, região, residência, renda —
 * repetindo treze perguntas que ela acabou de responder. É o atrito que mata a
 * conversa no primeiro minuto.
 *
 * POR QUE NÃO VAI NA URL DO WHATSAPP
 * Porque `?text=` é query string: viaja em texto claro, fica no histórico do
 * navegador e é registrada antes de qualquer criptografia — num domínio da
 * Meta, ainda por cima. O relatório proíbe renda, dívida, residência ou
 * qualquer resposta em URL (§12.7). Aqui os dados vão direto para o banco da
 * Easy House e o WhatsApp leva só o código.
 *
 * Requer, para persistir:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY   (service role — nunca exposta ao browser)
 * Requer, para avisar:
 *   RESEND_API_KEY, LEAD_NOTIFY_TO
 *
 * Sem elas o endpoint não quebra: responde 204 e registra o motivo no log. Um
 * envio perdido não pode impedir ninguém de falar no WhatsApp.
 */

import { avisarRaioXNovo } from '../lib/notificar.js';

const FORMATO_CODIGO = /^EH-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

/** Perguntas do Raio-X e o que cada resposta é, para o banco etiquetar certo. */
const SENSIBILIDADE = {
  momento: 'normal',
  prazo: 'normal',
  regiao: 'normal',
  tipo_imovel: 'normal',
  residencia: 'residency',
  conjuge: 'residency',
  trabalho: 'normal',
  tempo_trabalho: 'normal',
  renda: 'financial',
  obrigacoes: 'financial',
  entrada: 'financial',
  documentos: 'normal',
  analise_anterior: 'financial',
  idioma: 'normal'
};

/** O que pode aparecer no e-mail. O resto o consultor abre no painel. */
const PODE_NO_EMAIL = ['momento', 'prazo', 'regiao', 'tipo_imovel', 'documentos', 'idioma'];

const hits = new Map();
function rateLimited(ip, max = 10, windowMs = 60_000) {
  const now = Date.now();
  const e = hits.get(ip) || { count: 0, reset: now + windowMs };
  if (now > e.reset) { e.count = 0; e.reset = now + windowMs; }
  e.count += 1;
  hits.set(ip, e);
  if (hits.size > 5000) hits.clear();
  return e.count > max;
}

function sb(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  return fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });
}

function safeParse(txt) {
  try { return JSON.parse(txt); } catch { return null; }
}

/** Corta o que for grande demais e descarta chave que não é pergunta conhecida. */
function limparRespostas(brutas) {
  const saida = {};
  if (!brutas || typeof brutas !== 'object') return saida;
  for (const [chave, valor] of Object.entries(brutas)) {
    if (!Object.hasOwn(SENSIBILIDADE, chave)) continue;
    if (Array.isArray(valor)) {
      saida[chave] = valor.slice(0, 20).map((v) => String(v).slice(0, 80));
    } else if (valor !== null && valor !== undefined && valor !== '') {
      saida[chave] = String(valor).slice(0, 200);
    }
  }
  return saida;
}

/**
 * Prioridade da fila, calculada aqui e não no navegador.
 *
 * Mede intenção declarada — quando pretende comprar e em que ponto está —, não
 * dinheiro. Renda e dívida ficam de fora de propósito: fila por renda é
 * discriminação com outro nome, e o relatório é explícito em nunca derivar
 * classificação comercial de dado financeiro ou de residência.
 */
function prioridade(respostas) {
  let p = 0;
  const prazo = respostas.prazo;
  if (prazo === '0_3') p += 40;
  else if (prazo === '4_6') p += 30;
  else if (prazo === '7_12') p += 20;
  else if (prazo === '13_24') p += 8;

  const momento = respostas.momento;
  if (momento === 'escolhi') p += 30;
  else if (momento === 'procurando') p += 22;
  else if (momento === 'ja_tentei') p += 22;
  else if (momento === 'organizando') p += 12;

  if (respostas.regiao) p += 8;
  if (Array.isArray(respostas.documentos) && respostas.documentos.length) p += 10;
  return Math.min(100, p);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  if (rateLimited(ip)) return res.status(429).end();

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  if (!body) return res.status(400).json({ error: 'Corpo inválido' });

  const codigo = String(body.codigo || '');
  if (!FORMATO_CODIGO.test(codigo)) {
    return res.status(422).json({ error: 'Código inválido' });
  }

  const respostas = limparRespostas(body.respostas);
  const plano = body.plano && typeof body.plano === 'object' ? body.plano : {};
  const origem = body.origem && typeof body.origem === 'object' ? body.origem : {};

  // A resposta sai antes do trabalho pesado. Quem enviou já está indo para o
  // WhatsApp e não espera nada daqui.
  res.status(204).end();

  try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      const registro = {
        code: codigo,
        engine_version: String(body.versaoMotor || '').slice(0, 40) || null,
        template: String(body.template || '').slice(0, 60) || null,
        answers: respostas,
        sensitivity: Object.fromEntries(
          Object.keys(respostas).map((k) => [k, SENSIBILIDADE[k] || 'normal'])
        ),
        plan: {
          sinais: Array.isArray(plano.sinais) ? plano.sinais.slice(0, 40) : [],
          confirmar: Array.isArray(plano.confirmar) ? plano.confirmar.slice(0, 40) : [],
          acoes: Array.isArray(plano.acoes) ? plano.acoes.slice(0, 20) : []
        },
        priority: prioridade(respostas),
        source: origem,
        status: 'aguardando_contato'
      };

      // Mesmo código duas vezes é a mesma pessoa reenviando: atualiza, não duplica.
      const achado = await sb(`raiox?code=eq.${encodeURIComponent(codigo)}&select=id&limit=1`);
      const existente = achado.ok ? (await achado.json())[0] : null;

      if (existente) {
        await sb(`raiox?id=eq.${existente.id}`, { method: 'PATCH', body: JSON.stringify(registro) });
      } else {
        const ins = await sb('raiox', { method: 'POST', body: JSON.stringify(registro) });
        if (!ins.ok) console.error('raiox: falha ao gravar', ins.status);
      }
    } else {
      console.error('raiox: banco não configurado; nada gravado');
    }
  } catch {
    console.error('raiox: erro ao gravar');
  }

  // O aviso é o que faz alguém agir. Sem ele o Raio-X fica esperando que
  // alguém abra o painel por conta própria — foi assim que um lead de
  // prioridade 90 ficou quatro dias sem resposta.
  try {
    const resumo = {};
    for (const chave of PODE_NO_EMAIL) {
      if (respostas[chave] !== undefined) resumo[chave] = respostas[chave];
    }
    await avisarRaioXNovo({
      codigo,
      resumo,
      prioridade: prioridade(respostas),
      totalConfirmar: Array.isArray(plano.confirmar) ? plano.confirmar.length : 0,
      origem
    });
  } catch {
    console.error('raiox: falha ao avisar');
  }
}

/**
 * lib/painel-sessao.mjs — login do acompanhamento (clientes e equipe).
 *
 * A senha fica no Supabase Auth, que já faz o hash; aqui nunca se guarda nem
 * se compara senha. O que este módulo faz:
 *   - confere usuário + senha contra o Supabase Auth, do servidor;
 *   - emite o cookie de sessão do painel, assinado (HMAC), que o JavaScript
 *     da página não consegue ler;
 *   - trava o usuário depois de tentativas erradas seguidas.
 *
 * Por que um cookie nosso em vez do token do Supabase: o token do Supabase
 * expira em 1 hora e exigiria guardar o refresh token no navegador. O cookie
 * assinado vale 7 dias, não sai do servidor em forma utilizável e a cada
 * requisição conferimos de novo se a pessoa continua ativa — desativar alguém
 * no painel corta o acesso na hora, sem esperar o cookie vencer.
 *
 * O "usuário" que a pessoa digita vira um e-mail interno
 * (<usuario>@acompanhamento.easyhouse.homes), porque o Supabase Auth só
 * entende e-mail. Ninguém recebe nada nesse endereço.
 */

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

const URL_SB = () => process.env.SUPABASE_URL;
const CHAVE = () => process.env.SUPABASE_SERVICE_KEY;

export const COOKIE = 'eh_painel';
const DURACAO_S = 7 * 24 * 3600;
const DOMINIO_INTERNO = 'acompanhamento.easyhouse.homes';

// Tentativas erradas permitidas antes de travar, e por quanto tempo.
const MAX_FALHAS = 5;
const JANELA_MIN = 15;

/**
 * Chave do HMAC. SESSAO_SEGREDO, se existir; senão derivada da service key,
 * que já mora só no servidor. Trocar a service key derruba todas as sessões —
 * o que é exatamente o que se quer quando ela vaza.
 */
function segredo() {
  const proprio = process.env.SESSAO_SEGREDO;
  if (proprio && proprio.length >= 32) return proprio;
  const base = CHAVE();
  if (!base) throw new Error('SUPABASE_SERVICE_KEY ausente');
  return createHmac('sha256', base).update('acomp-sessao-v1').digest('hex');
}

const b64 = (s) => Buffer.from(s).toString('base64url');
const assinar = (dados) => createHmac('sha256', segredo()).update(dados).digest('base64url');

/** Normaliza o que a pessoa digitou. Só letras, números, ponto, hífen e _. */
export function normalizarUsuario(v) {
  const u = String(v || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,39}$/.test(u) ? u : null;
}

export const emailInterno = (usuario) => `${usuario}@${DOMINIO_INTERNO}`;

/**
 * Senha legível para mandar por WhatsApp: 3 blocos de 4, sem caracteres que
 * se confundem (0/O, 1/l/I). ~69 bits — sobra para um login com trava.
 */
export function gerarSenha() {
  const alfa = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bloco = () => Array.from({ length: 4 }, () => alfa[randomInt(alfa.length)]).join('');
  return `${bloco()}-${bloco()}-${bloco()}`;
}

// ── cookie ──────────────────────────────────────────────────────────────────

export function emitirCookie(req, userId) {
  const expira = Math.floor(Date.now() / 1000) + DURACAO_S;
  const corpo = `${userId}.${expira}`;
  const valor = `${b64(corpo)}.${assinar(corpo)}`;
  return montarCookie(req, valor, DURACAO_S);
}

export function cookieApagado(req) {
  return montarCookie(req, '', 0);
}

function montarCookie(req, valor, maxAge) {
  // Secure só fora do localhost: no dev-server (http) o navegador recusaria o
  // cookie e o login pareceria quebrado.
  const host = String(req.headers?.host || '');
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  return [
    `${COOKIE}=${valor}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    local ? '' : 'Secure',
    `Max-Age=${maxAge}`,
  ].filter(Boolean).join('; ');
}

/** user_id da sessão, ou null se o cookie faltar, for adulterado ou vencer. */
export function lerSessao(req) {
  const bruto = String(req.headers?.cookie || '')
    .split(';').map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE}=`));
  if (!bruto) return null;
  const valor = bruto.slice(COOKIE.length + 1);
  const [corpo64, assinatura] = valor.split('.');
  if (!corpo64 || !assinatura) return null;

  let corpo;
  try { corpo = Buffer.from(corpo64, 'base64url').toString(); } catch { return null; }
  const esperada = Buffer.from(assinar(corpo));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;

  const [userId, expira] = corpo.split('.');
  if (!userId || !(Number(expira) > Date.now() / 1000)) return null;
  return userId;
}

// ── Supabase ────────────────────────────────────────────────────────────────

/** PostgREST com a service key. Lança em erro HTTP, com a mensagem do banco. */
export async function sb(caminho, { method = 'GET', body, prefer } = {}) {
  const r = await fetch(`${URL_SB()}/rest/v1/${caminho}`, {
    method,
    headers: {
      apikey: CHAVE(),
      Authorization: `Bearer ${CHAVE()}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`banco ${r.status}: ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : null;
}

async function auth(caminho, { method = 'GET', body } = {}) {
  const r = await fetch(`${URL_SB()}/auth/v1/${caminho}`, {
    method,
    headers: {
      apikey: CHAVE(),
      Authorization: `Bearer ${CHAVE()}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const txt = await r.text();
  let dados = null;
  try { dados = txt ? JSON.parse(txt) : null; } catch { /* corpo não-JSON */ }
  return { ok: r.ok, status: r.status, dados };
}

/**
 * Cria a conta no Supabase Auth. Se o e-mail interno já existir, FALHA —
 * nunca reaproveita. O cadastro público do Supabase está aberto, e
 * reaproveitar deixaria alguém pré-registrar o usuário de um cliente com uma
 * senha que só essa pessoa conhece.
 */
export async function criarContaAuth(usuario, senha) {
  const r = await auth('admin/users', {
    method: 'POST',
    body: { email: emailInterno(usuario), password: senha, email_confirm: true },
  });
  if (!r.ok) {
    const msg = r.dados?.msg || r.dados?.message || `HTTP ${r.status}`;
    if (/already|registered|exists/i.test(msg)) throw new Error('usuario_existe');
    throw new Error(`auth: ${msg}`);
  }
  return r.dados.id;
}

export async function trocarSenhaAuth(userId, senha) {
  const r = await auth(`admin/users/${userId}`, { method: 'PUT', body: { password: senha } });
  if (!r.ok) throw new Error(`auth: ${r.dados?.msg || r.status}`);
}

export async function apagarContaAuth(userId) {
  await auth(`admin/users/${userId}`, { method: 'DELETE' });
}

/** Confere a senha. Devolve o user_id do Supabase ou null. */
async function conferirSenha(usuario, senha) {
  const r = await auth('token?grant_type=password', {
    method: 'POST',
    body: { email: emailInterno(usuario), password: senha },
  });
  return r.ok ? r.dados?.user?.id || null : null;
}

// ── login com trava ─────────────────────────────────────────────────────────

async function falhasRecentes(usuario) {
  const desde = new Date(Date.now() - JANELA_MIN * 60000).toISOString();
  const linhas = await sb(
    `acomp_login_falha?select=em&usuario=eq.${encodeURIComponent(usuario)}&em=gte.${encodeURIComponent(desde)}`
  );
  return linhas.length;
}

/**
 * @returns {{ ok: true, perfil } | { ok: false, motivo: 'credenciais'|'travado'|'inativo' }}
 *
 * "credenciais" cobre usuário inexistente e senha errada sem distinguir os
 * dois — dizer "esse usuário não existe" ajudaria a adivinhar quem é cliente.
 */
export async function entrar(usuarioDigitado, senha) {
  const usuario = normalizarUsuario(usuarioDigitado);
  if (!usuario || !senha || String(senha).length > 200) return { ok: false, motivo: 'credenciais' };

  if (await falhasRecentes(usuario) >= MAX_FALHAS) return { ok: false, motivo: 'travado' };

  const userId = await conferirSenha(usuario, String(senha));
  if (!userId) {
    await sb('acomp_login_falha', { method: 'POST', body: { usuario } });
    // faxina: tentativas com mais de um dia não servem mais para a trava
    const ontem = new Date(Date.now() - 86400000).toISOString();
    await sb(`acomp_login_falha?em=lt.${encodeURIComponent(ontem)}`, { method: 'DELETE' }).catch(() => {});
    return { ok: false, motivo: 'credenciais' };
  }

  // Ter senha certa no Supabase Auth não basta: a conta precisa ter sido
  // criada pelo painel. Uma conta aberta pelo cadastro público do Supabase
  // não tem linha aqui e não entra.
  const [perfil] = await sb(`acomp_usuario?select=*&user_id=eq.${userId}`);
  if (!perfil) {
    await sb('acomp_login_falha', { method: 'POST', body: { usuario } });
    return { ok: false, motivo: 'credenciais' };
  }
  if (!perfil.ativo) return { ok: false, motivo: 'inativo' };

  await sb(`acomp_login_falha?usuario=eq.${encodeURIComponent(usuario)}`, { method: 'DELETE' });
  await sb(`acomp_usuario?user_id=eq.${userId}`, {
    method: 'PATCH', body: { ultimo_acesso: new Date().toISOString() },
  });
  return { ok: true, perfil };
}

/** Perfil de quem está logado, ou null. Confere ativo a cada chamada. */
export async function quemEsta(req) {
  const userId = lerSessao(req);
  if (!userId) return null;
  const [perfil] = await sb(`acomp_usuario?select=*&user_id=eq.${userId}`);
  return perfil && perfil.ativo ? perfil : null;
}

export const ehEquipe = (p) => p && (p.papel === 'admin' || p.papel === 'corretor');

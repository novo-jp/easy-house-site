/**
 * api/painel.mjs — acompanhamento do processo de compra.
 *
 * Uma função só para tudo: o plano da Vercel permite 12 funções e o site já
 * usa 11. As ações vão em ?acao=... (GET) ou no corpo { acao } (POST).
 *
 * Quem pode o quê está numa tabela só, ACOES, logo abaixo. Cada ação declara
 * o nível exigido e o despachante confere antes de rodar — não existe ação
 * que dependa de "lembrar de checar" dentro dela. A única regra que não cabe
 * ali é "este cliente pode ver ESTE processo", e ela mora em exigirProcesso().
 *
 * Sem Supabase no navegador: a página fala só com esta função, e esta fala com
 * o banco usando a service key. As tabelas acomp_* têm RLS ligado e nenhuma
 * política, então a chave pública não enxerga nada delas.
 */

import { readFileSync } from 'node:fs';
import {
  sb, entrar, quemEsta, ehEquipe, emitirCookie, cookieApagado,
  normalizarUsuario, gerarSenha, criarContaAuth, trocarSenhaAuth, apagarContaAuth,
} from '../lib/painel-sessao.mjs';

const MODELOS = JSON.parse(readFileSync(new URL('../lib/acompanhamento-modelos.json', import.meta.url), 'utf8'));
const BUCKET = 'acompanhamento';
const WHATSAPP_PADRAO = '818028867708';

class Recusa extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

// ── helpers ─────────────────────────────────────────────────────────────────

const agora = () => new Date().toISOString();
const uuidOk = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const txt = (v, max = 500) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

function exigirUuid(v, nome = 'id') {
  if (!uuidOk(v)) throw new Recusa(400, `${nome} inválido`);
  return v;
}

/** Equipe vê qualquer processo; cliente só os ligados ao login dele. */
async function exigirProcesso(perfil, processoId) {
  exigirUuid(processoId, 'processo');
  if (ehEquipe(perfil)) return;
  const v = await sb(`acomp_processo_cliente?select=processo_id&processo_id=eq.${processoId}&user_id=eq.${perfil.user_id}`);
  // 404 e não 403: não confirmar a quem não tem acesso que o processo existe.
  if (!v.length) throw new Recusa(404, 'processo não encontrado');
}

async function tocarProcesso(processoId) {
  await sb(`acomp_processo?id=eq.${processoId}`, { method: 'PATCH', body: { atualizado_em: agora() } });
}

async function urlFoto(caminho) {
  if (!caminho) return null;
  const r = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${caminho}`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: 3600 }),
  });
  if (!r.ok) return null;
  const { signedURL } = await r.json();
  return signedURL ? `${process.env.SUPABASE_URL}/storage/v1${signedURL}` : null;
}

/** Etapa atual = a primeira, na ordem, que ainda não foi concluída. */
function etapaAtual(etapas) {
  return [...etapas].sort((a, b) => a.ordem - b.ordem).find((e) => !e.concluida_em) || null;
}

const nomeBanco = (b) => MODELOS.bancos[b]?.nome || b;

// ── montagem de processo a partir do modelo ─────────────────────────────────

function etapasDoBanco(banco) {
  const caminho = MODELOS.caminhos[MODELOS.bancos[banco].caminho];
  return caminho.map((chave, i) => ({
    ordem: i + 1, chave,
    titulo: MODELOS.etapas[chave].titulo,
    descricao: MODELOS.etapas[chave].descricao,
  }));
}

function documentosIniciais() {
  const lista = [];
  for (const [grupo, docs] of Object.entries(MODELOS.documentos)) {
    docs.forEach((d, i) => lista.push({ grupo, ordem: i, nome: d.nome, detalhe: d.detalhe || null }));
  }
  return lista;
}

// ── leitura ─────────────────────────────────────────────────────────────────

async function carregarProcesso(perfil, id) {
  await exigirProcesso(perfil, id);
  const equipe = ehEquipe(perfil);

  const [[p], etapas, documentos, notasTodas] = await Promise.all([
    sb(`acomp_processo?select=*&id=eq.${id}`),
    sb(`acomp_etapa?select=*&processo_id=eq.${id}&order=ordem`),
    sb(`acomp_documento?select=*&processo_id=eq.${id}&order=grupo,ordem,atualizado_em`),
    sb(`acomp_nota?select=*&processo_id=eq.${id}&order=criado_em.desc`),
  ]);
  if (!p) throw new Recusa(404, 'processo não encontrado');

  const ids = [...new Set([p.corretor_id, ...notasTodas.map((n) => n.autor_id)].filter(Boolean))];
  const pessoas = ids.length
    ? await sb(`acomp_usuario?select=user_id,nome,whatsapp,papel&user_id=in.(${ids.join(',')})`)
    : [];
  const nomeDe = (uid) => pessoas.find((x) => x.user_id === uid)?.nome || null;
  const corretor = pessoas.find((x) => x.user_id === p.corretor_id);

  // Cliente nunca recebe nota interna, nem dados que só servem à equipe.
  const notas = (equipe ? notasTodas : notasTodas.filter((n) => !n.interna))
    .map((n) => ({ ...n, autor: nomeDe(n.autor_id) }));

  let acessos = [];
  if (equipe) {
    const vinc = await sb(`acomp_processo_cliente?select=user_id&processo_id=eq.${id}`);
    if (vinc.length) {
      acessos = await sb(`acomp_usuario?select=user_id,usuario,nome,ativo,ultimo_acesso&user_id=in.(${vinc.map((v) => v.user_id).join(',')})`);
    }
  }

  const banco = MODELOS.bancos[p.banco];
  const guia = banco?.guia ? MODELOS.guias[banco.guia] : null;

  return {
    processo: {
      id: p.id,
      cliente_nome: p.cliente_nome,
      banco: p.banco,
      banco_nome: nomeBanco(p.banco),
      caminho: banco?.caminho,
      casa_titulo: p.casa_titulo,
      casa_endereco: p.casa_endereco,
      casa_preco_yen: p.casa_preco_yen,
      casa_url: p.casa_url,
      casa_foto_url: await urlFoto(p.casa_foto_path),
      extras: p.extras || {},
      atualizado_em: p.atualizado_em,
      ...(equipe ? { lead_code: p.lead_code, corretor_id: p.corretor_id, arquivado: p.arquivado, criado_em: p.criado_em } : {}),
    },
    consultor: {
      nome: corretor?.nome || 'Equipe Easy House',
      whatsapp: (corretor?.whatsapp || WHATSAPP_PADRAO).replace(/\D/g, ''),
    },
    etapas,
    etapa_atual: etapaAtual(etapas)?.chave || null,
    documentos,
    notas,
    guia,
    avisos: MODELOS.avisos,
    lembretes: MODELOS.lembretes,
    aviso_legal: MODELOS.aviso_legal,
    ...(equipe ? { acessos } : {}),
  };
}

async function listarProcessos() {
  const processos = await sb('acomp_processo?select=id,cliente_nome,banco,corretor_id,casa_titulo,arquivado,atualizado_em,lead_code&order=arquivado,atualizado_em.desc');
  if (!processos.length) return [];
  const ids = processos.map((p) => p.id).join(',');
  const [etapas, corretores] = await Promise.all([
    sb(`acomp_etapa?select=processo_id,ordem,titulo,concluida_em&processo_id=in.(${ids})`),
    sb('acomp_usuario?select=user_id,nome&papel=in.(admin,corretor)'),
  ]);
  return processos.map((p) => {
    const desta = etapas.filter((e) => e.processo_id === p.id);
    const atual = etapaAtual(desta);
    return {
      ...p,
      banco_nome: nomeBanco(p.banco),
      corretor: corretores.find((c) => c.user_id === p.corretor_id)?.nome || null,
      etapa_ordem: atual ? atual.ordem : desta.length,
      etapa_titulo: atual ? atual.titulo : 'Concluído',
      etapas_total: desta.length,
      concluido: !atual,
    };
  });
}

// ── escrita: processo ───────────────────────────────────────────────────────

async function criarProcesso(perfil, b) {
  const cliente_nome = txt(b.cliente_nome, 120);
  if (!cliente_nome) throw new Recusa(422, 'informe o nome do cliente');
  if (!MODELOS.bancos[b.banco]) throw new Recusa(422, 'banco inválido');
  let corretor_id = b.corretor_id && uuidOk(b.corretor_id) ? b.corretor_id : perfil.user_id;

  const [p] = await sb('acomp_processo', {
    method: 'POST', prefer: 'return=representation',
    body: {
      cliente_nome, banco: b.banco, corretor_id,
      lead_code: txt(b.lead_code, 20),
    },
  });
  try {
    await sb('acomp_etapa', { method: 'POST', body: etapasDoBanco(b.banco).map((e) => ({ ...e, processo_id: p.id })) });
    await sb('acomp_documento', { method: 'POST', body: documentosIniciais().map((d) => ({ ...d, processo_id: p.id })) });
  } catch (e) {
    // sem etapas o processo fica inútil e confuso na lista — desfaz
    await sb(`acomp_processo?id=eq.${p.id}`, { method: 'DELETE' });
    throw e;
  }
  return { id: p.id };
}

const CAMPOS_PROCESSO = {
  cliente_nome: (v) => txt(v, 120),
  lead_code: (v) => txt(v, 20),
  casa_titulo: (v) => txt(v, 160),
  casa_endereco: (v) => txt(v, 240),
  casa_url: (v) => {
    const s = txt(v, 400);
    if (!s) return null;
    if (!/^https:\/\//i.test(s)) throw new Recusa(422, 'o link da casa precisa começar com https://');
    return s;
  },
  casa_preco_yen: (v) => {
    if (v === null || v === '' || v === undefined) return null;
    const n = Math.round(Number(String(v).replace(/[^\d.]/g, '')));
    if (!Number.isFinite(n) || n < 0 || n > 10_000_000_000) throw new Recusa(422, 'preço inválido');
    return n;
  },
  arquivado: (v) => !!v,
};

async function editarProcesso(perfil, b) {
  const id = exigirUuid(b.processo_id, 'processo');
  const mudanca = {};
  for (const [campo, limpar] of Object.entries(CAMPOS_PROCESSO)) {
    if (campo in (b.campos || {})) mudanca[campo] = limpar(b.campos[campo]);
  }
  if ('cliente_nome' in mudanca && !mudanca.cliente_nome) throw new Recusa(422, 'o nome do cliente não pode ficar vazio');

  if (b.campos && 'corretor_id' in b.campos) {
    const c = b.campos.corretor_id;
    if (c && !uuidOk(c)) throw new Recusa(422, 'corretor inválido');
    mudanca.corretor_id = c || null;
  }

  if (b.campos && 'extras' in b.campos) {
    // Só chaves conhecidas dos guias — nada de JSON livre vindo do navegador.
    const permitidas = new Set(
      Object.values(MODELOS.guias).flatMap((g) => g.itens.map((i) => i.campo).filter(Boolean))
    );
    const [atual] = await sb(`acomp_processo?select=extras&id=eq.${id}`);
    const extras = { ...(atual?.extras || {}) };
    for (const [k, v] of Object.entries(b.campos.extras || {})) {
      if (permitidas.has(k)) extras[k] = txt(v, 120);
    }
    mudanca.extras = extras;
  }

  if (b.campos && 'banco' in b.campos && b.campos.banco) {
    await trocarBanco(id, b.campos.banco);
    mudanca.banco = b.campos.banco;
  }

  mudanca.atualizado_em = agora();
  await sb(`acomp_processo?id=eq.${id}`, { method: 'PATCH', body: mudanca });
  return { ok: true };
}

/**
 * Trocar o banco muda o caminho. As 7 etapas têm as mesmas chaves nos dois
 * caminhos — só a ordem muda —, então basta reordenar: o que já foi concluído
 * e os documentos (presos à chave da etapa) seguem junto.
 */
async function trocarBanco(processoId, banco) {
  if (!MODELOS.bancos[banco]) throw new Recusa(422, 'banco inválido');
  const nova = MODELOS.caminhos[MODELOS.bancos[banco].caminho];
  const etapas = await sb(`acomp_etapa?select=id,chave,ordem&processo_id=eq.${processoId}`);
  if (etapas.some((e) => !nova.includes(e.chave))) {
    throw new Recusa(409, 'as etapas deste processo não batem com o caminho do banco novo');
  }
  // Duas passadas: a ordem é única por processo, e trocar 3↔4 direto colidiria.
  for (const e of etapas) {
    await sb(`acomp_etapa?id=eq.${e.id}`, { method: 'PATCH', body: { ordem: e.ordem + 100 } });
  }
  for (const e of etapas) {
    await sb(`acomp_etapa?id=eq.${e.id}`, { method: 'PATCH', body: { ordem: nova.indexOf(e.chave) + 1 } });
  }
}

// ── escrita: etapas, documentos, notas ──────────────────────────────────────

async function mexerEtapa(perfil, b) {
  const etapaId = exigirUuid(b.etapa_id, 'etapa');
  const [e] = await sb(`acomp_etapa?select=processo_id&id=eq.${etapaId}`);
  if (!e) throw new Recusa(404, 'etapa não encontrada');

  const mudanca = {};
  if (b.operacao === 'concluir') mudanca.concluida_em = agora();
  else if (b.operacao === 'reabrir') mudanca.concluida_em = null;
  else if (b.operacao === 'data') {
    if (b.data && Number.isNaN(Date.parse(b.data))) throw new Recusa(422, 'data inválida');
    mudanca.data_prevista = b.data ? new Date(b.data).toISOString() : null;
  } else throw new Recusa(400, 'operação inválida');

  await sb(`acomp_etapa?id=eq.${etapaId}`, { method: 'PATCH', body: mudanca });
  await tocarProcesso(e.processo_id);
  return { ok: true };
}

async function mexerDocumento(perfil, b) {
  const equipe = ehEquipe(perfil);

  if (b.operacao === 'adicionar') {
    if (!equipe) throw new Recusa(403, 'só a equipe adiciona documentos');
    await exigirProcesso(perfil, b.processo_id);
    const nome = txt(b.nome, 160);
    if (!nome) throw new Recusa(422, 'informe o nome do documento');
    const gruposValidos = new Set(['ter_em_maos', 'outros', ...Object.keys(MODELOS.etapas)]);
    const grupo = gruposValidos.has(b.grupo) ? b.grupo : 'outros';
    await sb('acomp_documento', {
      method: 'POST',
      body: { processo_id: b.processo_id, grupo, ordem: 999, nome, detalhe: txt(b.detalhe, 240), atualizado_por: perfil.user_id },
    });
    await tocarProcesso(b.processo_id);
    return { ok: true };
  }

  const docId = exigirUuid(b.documento_id, 'documento');
  const [d] = await sb(`acomp_documento?select=processo_id,status&id=eq.${docId}`);
  if (!d) throw new Recusa(404, 'documento não encontrado');
  await exigirProcesso(perfil, d.processo_id);

  if (b.operacao === 'status') {
    const status = b.status;
    if (!['pendente', 'pronto', 'entregue'].includes(status)) throw new Recusa(422, 'status inválido');
    // O cliente marca "já tenho" e desmarca. "Entregue" é a equipe que confirma
    // — e um documento já entregue o cliente não volta para pendente.
    if (!equipe && (status === 'entregue' || d.status === 'entregue')) {
      throw new Recusa(403, 'quem confirma a entrega é o seu consultor');
    }
    await sb(`acomp_documento?id=eq.${docId}`, {
      method: 'PATCH', body: { status, atualizado_em: agora(), atualizado_por: perfil.user_id },
    });
  } else if (b.operacao === 'remover') {
    if (!equipe) throw new Recusa(403, 'só a equipe remove documentos');
    await sb(`acomp_documento?id=eq.${docId}`, { method: 'DELETE' });
  } else {
    throw new Recusa(400, 'operação inválida');
  }
  await tocarProcesso(d.processo_id);
  return { ok: true };
}

async function mexerNota(perfil, b) {
  if (b.operacao === 'remover') {
    const id = exigirUuid(b.nota_id, 'nota');
    const [n] = await sb(`acomp_nota?select=processo_id&id=eq.${id}`);
    if (!n) throw new Recusa(404, 'nota não encontrada');
    await sb(`acomp_nota?id=eq.${id}`, { method: 'DELETE' });
    return { ok: true };
  }
  await exigirProcesso(perfil, b.processo_id);
  const texto = txt(b.texto, 2000);
  if (!texto) throw new Recusa(422, 'escreva a atualização');
  const etapa_chave = b.etapa_chave && MODELOS.etapas[b.etapa_chave] ? b.etapa_chave : null;
  await sb('acomp_nota', {
    method: 'POST',
    body: { processo_id: b.processo_id, autor_id: perfil.user_id, etapa_chave, texto, interna: !!b.interna },
  });
  await tocarProcesso(b.processo_id);
  return { ok: true };
}

/**
 * Foto da casa. A página já reduz a imagem (máx. 1600 px, JPEG) antes de
 * mandar, então o que chega aqui é pequeno — o limite da Vercel é 4,5 MB por
 * requisição. Ainda assim confere: precisa ser JPEG de verdade (assinatura
 * FF D8 FF), não só dizer que é.
 */
async function subirFoto(perfil, b) {
  const id = exigirUuid(b.processo_id, 'processo');
  const m = String(b.imagem || '').match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new Recusa(422, 'envie a foto em JPEG');
  const bytes = Buffer.from(m[1], 'base64');
  if (bytes.length > 3_000_000) throw new Recusa(413, 'foto grande demais (máx. 3 MB)');
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Recusa(422, 'o arquivo não é um JPEG');

  const caminho = `processos/${id}/casa-${Date.now()}.jpg`;
  const r = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${caminho}`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'image/jpeg',
    },
    body: bytes,
  });
  if (!r.ok) throw new Error(`storage ${r.status}: ${(await r.text()).slice(0, 160)}`);

  const [antes] = await sb(`acomp_processo?select=casa_foto_path&id=eq.${id}`);
  await sb(`acomp_processo?id=eq.${id}`, { method: 'PATCH', body: { casa_foto_path: caminho, atualizado_em: agora() } });
  if (antes?.casa_foto_path && antes.casa_foto_path !== caminho) {
    await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${antes.casa_foto_path}`, {
      method: 'DELETE',
      headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` },
    }).catch(() => {});
  }
  return { ok: true, url: await urlFoto(caminho) };
}

// ── usuários ────────────────────────────────────────────────────────────────

/**
 * Cria a conta e o perfil. Se o perfil falhar depois da conta criada, apaga a
 * conta — senão sobraria um login com senha válida e sem dono no painel.
 */
async function criarPessoa({ usuario, nome, papel, whatsapp }) {
  const u = normalizarUsuario(usuario);
  if (!u) throw new Recusa(422, 'usuário: 3 a 40 caracteres, só letras, números, ponto, hífen ou _');
  if (!txt(nome, 120)) throw new Recusa(422, 'informe o nome');

  const [ja] = await sb(`acomp_usuario?select=user_id&usuario=eq.${u}`);
  if (ja) throw new Recusa(409, 'esse usuário já existe — escolha outro');

  const senha = gerarSenha();
  let userId;
  try {
    userId = await criarContaAuth(u, senha);
  } catch (e) {
    if (e.message === 'usuario_existe') throw new Recusa(409, 'esse usuário já existe — escolha outro');
    throw e;
  }
  try {
    await sb('acomp_usuario', {
      method: 'POST',
      body: { user_id: userId, usuario: u, nome: txt(nome, 120), papel, whatsapp: txt(whatsapp, 30) },
    });
  } catch (e) {
    await apagarContaAuth(userId);
    throw e;
  }
  return { userId, usuario: u, senha };
}

async function criarAcessoCliente(perfil, b) {
  await exigirProcesso(perfil, b.processo_id);
  const [p] = await sb(`acomp_processo?select=cliente_nome&id=eq.${b.processo_id}`);
  const r = await criarPessoa({ usuario: b.usuario, nome: txt(b.nome, 120) || p.cliente_nome, papel: 'cliente' });
  try {
    await sb('acomp_processo_cliente', { method: 'POST', body: { processo_id: b.processo_id, user_id: r.userId } });
  } catch (e) {
    await sb(`acomp_usuario?user_id=eq.${r.userId}`, { method: 'DELETE' });
    await apagarContaAuth(r.userId);
    throw e;
  }
  // A senha sai daqui uma única vez. Não fica gravada em lugar nenhum além do
  // hash no Supabase Auth.
  return { usuario: r.usuario, senha: r.senha };
}

async function criarMembroEquipe(perfil, b) {
  const papel = b.papel === 'admin' ? 'admin' : 'corretor';
  const r = await criarPessoa({ usuario: b.usuario, nome: b.nome, papel, whatsapp: b.whatsapp });
  return { usuario: r.usuario, senha: r.senha };
}

/** Equipe redefine/desativa cliente; só admin mexe em outro membro da equipe. */
async function alvoGerenciavel(perfil, userId) {
  exigirUuid(userId, 'usuário');
  const [alvo] = await sb(`acomp_usuario?select=*&user_id=eq.${userId}`);
  if (!alvo) throw new Recusa(404, 'usuário não encontrado');
  if (alvo.papel !== 'cliente' && perfil.papel !== 'admin') throw new Recusa(403, 'só o administrador gerencia a equipe');
  if (alvo.user_id === perfil.user_id) throw new Recusa(409, 'para a sua própria conta, use "Trocar senha"');
  return alvo;
}

async function redefinirSenha(perfil, b) {
  const alvo = await alvoGerenciavel(perfil, b.user_id);
  const senha = gerarSenha();
  await trocarSenhaAuth(alvo.user_id, senha);
  return { usuario: alvo.usuario, senha };
}

async function definirAtivo(perfil, b) {
  const alvo = await alvoGerenciavel(perfil, b.user_id);
  await sb(`acomp_usuario?user_id=eq.${alvo.user_id}`, { method: 'PATCH', body: { ativo: !!b.ativo } });
  return { ok: true };
}

async function trocarPropriaSenha(perfil, b) {
  const nova = String(b.nova || '');
  if (nova.length < 8) throw new Recusa(422, 'a senha nova precisa ter pelo menos 8 caracteres');
  if (nova.length > 72) throw new Recusa(422, 'senha longa demais');
  // Confere a atual pelo mesmo caminho do login (com a trava de tentativas).
  const r = await entrar(perfil.usuario, b.atual);
  if (!r.ok) throw new Recusa(r.motivo === 'travado' ? 429 : 403, r.motivo === 'travado'
    ? 'muitas tentativas — aguarde 15 minutos' : 'a senha atual não confere');
  await trocarSenhaAuth(perfil.user_id, nova);
  return { ok: true };
}

async function listarEquipe() {
  return sb('acomp_usuario?select=user_id,usuario,nome,papel,whatsapp,ativo,ultimo_acesso&papel=in.(admin,corretor)&order=nome');
}

// ── despachante ─────────────────────────────────────────────────────────────

const ACOES = {
  // método, nível exigido, função
  eu:               ['GET',  'logado', (p) => ({ usuario: p.usuario, nome: p.nome, papel: p.papel })],
  processos:        ['GET',  'equipe', () => listarProcessos()],
  meus_processos:   ['GET',  'logado', meusProcessos],
  processo:         ['GET',  'logado', (p, b) => carregarProcesso(p, b.id)],
  equipe:           ['GET',  'equipe', () => listarEquipe()],
  modelos:          ['GET',  'equipe', () => ({ bancos: MODELOS.bancos, etapas: MODELOS.etapas })],

  criar_processo:   ['POST', 'equipe', criarProcesso],
  editar_processo:  ['POST', 'equipe', editarProcesso],
  etapa:            ['POST', 'equipe', mexerEtapa],
  documento:        ['POST', 'logado', mexerDocumento],   // cliente só alterna "já tenho"
  nota:             ['POST', 'equipe', mexerNota],
  foto:             ['POST', 'equipe', subirFoto],
  criar_acesso:     ['POST', 'equipe', criarAcessoCliente],
  criar_membro:     ['POST', 'admin',  criarMembroEquipe],
  redefinir_senha:  ['POST', 'equipe', redefinirSenha],
  ativo:            ['POST', 'equipe', definirAtivo],
  trocar_senha:     ['POST', 'logado', trocarPropriaSenha],
};

async function meusProcessos(perfil) {
  if (ehEquipe(perfil)) return [];
  const vinc = await sb(`acomp_processo_cliente?select=processo_id&user_id=eq.${perfil.user_id}`);
  if (!vinc.length) return [];
  return sb(`acomp_processo?select=id,cliente_nome,banco,arquivado&id=in.(${vinc.map((v) => v.processo_id).join(',')})&arquivado=eq.false`);
}

const NIVEL_OK = {
  logado: (p) => !!p,
  equipe: (p) => ehEquipe(p),
  admin: (p) => p?.papel === 'admin',
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  const corpo = typeof req.body === 'object' && req.body ? req.body : {};
  const params = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const acao = req.method === 'GET' ? params.acao : corpo.acao;

  try {
    // POST precisa vir da própria página: JSON + cabeçalho próprio. Um
    // formulário de outro site não consegue mandar nenhum dos dois sem que o
    // navegador peça permissão antes (CORS) — permissão que nunca damos.
    if (req.method === 'POST') {
      const tipo = String(req.headers['content-type'] || '');
      if (!tipo.includes('application/json') || req.headers['x-painel'] !== '1') {
        throw new Recusa(403, 'requisição recusada');
      }
    }

    if (acao === 'login' && req.method === 'POST') {
      const r = await entrar(corpo.usuario, corpo.senha);
      if (!r.ok) {
        const msg = {
          credenciais: 'Usuário ou senha incorretos.',
          travado: 'Muitas tentativas. Aguarde 15 minutos e tente de novo.',
          inativo: 'Este acesso foi desativado. Fale com a Easy House.',
        }[r.motivo];
        return res.status(r.motivo === 'travado' ? 429 : 401).json({ erro: msg });
      }
      res.setHeader('Set-Cookie', emitirCookie(req, r.perfil.user_id));
      return res.status(200).json({ ok: true, papel: r.perfil.papel, nome: r.perfil.nome });
    }

    if (acao === 'logout' && req.method === 'POST') {
      res.setHeader('Set-Cookie', cookieApagado(req));
      return res.status(200).json({ ok: true });
    }

    const def = ACOES[acao];
    if (!def) throw new Recusa(404, 'ação desconhecida');
    const [metodo, nivel, fn] = def;
    if (req.method !== metodo) throw new Recusa(405, 'método não permitido');

    const perfil = await quemEsta(req);
    if (!perfil) {
      // sessão vencida ou conta desativada: limpa o cookie para a página voltar ao login
      res.setHeader('Set-Cookie', cookieApagado(req));
      throw new Recusa(401, 'sessão expirada — entre de novo');
    }
    if (!NIVEL_OK[nivel](perfil)) throw new Recusa(403, 'sem permissão');

    const dados = await fn(perfil, req.method === 'GET' ? params : corpo);
    return res.status(200).json(dados ?? { ok: true });
  } catch (e) {
    if (e instanceof Recusa) return res.status(e.status).json({ erro: e.message });
    console.error('[painel]', acao, e);
    return res.status(500).json({ erro: 'Algo deu errado. Tente de novo em instantes.' });
  }
}

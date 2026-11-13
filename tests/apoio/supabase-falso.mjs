/**
 * Supabase de mentira, em memória, para testar api/painel.mjs sem tocar no
 * banco de verdade. Imita só o que o painel usa do PostgREST e do Auth:
 *
 *   /rest/v1/<tabela>?select=…&col=eq.v&col=in.(a,b)&order=…&limit=…
 *   POST (com return=representation e on_conflict), PATCH e DELETE com filtro
 *   /auth/v1/token?grant_type=password e /auth/v1/admin/users
 *
 * Tabela que não existe responde como o PostgREST de verdade (PGRST205): é
 * assim que se testa o painel ANTES de o SQL de uma tabela nova rodar.
 */

import { randomUUID } from 'node:crypto';

const agora = () => new Date().toISOString();

/** Valores que o banco preencheria sozinho (default das colunas). */
const PADROES = {
  acomp_usuario: () => ({ ativo: true, criado_em: agora(), ultimo_acesso: null, whatsapp: null }),
  acomp_processo: () => ({
    id: randomUUID(), lead_code: null, corretor_id: null, casa_titulo: null, casa_endereco: null, casa_preco_yen: null,
    casa_url: null, casa_foto_path: null, extras: {}, arquivado: false, criado_em: agora(), atualizado_em: agora(),
  }),
  acomp_processo_cliente: () => ({}),
  acomp_etapa: () => ({ id: randomUUID(), descricao: null, data_prevista: null, concluida_em: null }),
  acomp_documento: () => ({ id: randomUUID(), ordem: 0, detalhe: null, status: 'pendente', atualizado_em: agora(), atualizado_por: null }),
  acomp_nota: () => ({ id: randomUUID(), etapa_chave: null, interna: false, criado_em: agora() }),
  acomp_login_falha: () => ({ em: agora() }),
  acomp_evento_equipe: () => ({ id: randomUUID(), criado_por: null, criado_em: agora() }),
  acomp_ficha: () => ({
    id: randomUUID(), corretor_id: null, nome: '', status: 'lead', ficha: {}, codevedor: {}, credito: {}, simulacao: {},
    processo_id: null, versao: 1, criado_em: agora(), atualizado_em: agora(),
  }),
  acomp_config: () => ({ atualizado_em: agora(), atualizado_por: null }),
};

function separar(lista) {
  // vírgulas de primeiro nível (in.(a,b) e select aninhado não aparecem aqui, mas custa pouco)
  const partes = []; let nivel = 0; let atual = '';
  for (const ch of lista) {
    if (ch === '(') nivel += 1;
    if (ch === ')') nivel -= 1;
    if (ch === ',' && nivel === 0) { partes.push(atual); atual = ''; } else atual += ch;
  }
  if (atual) partes.push(atual);
  return partes;
}

function projetar(linha, select) {
  if (!select || select === '*') return { ...linha };
  const saida = {};
  for (const item of separar(select)) {
    const [, apelido, expr] = item.match(/^(?:([\w]+):)?(.+)$/);
    const [coluna, ...caminho] = expr.split(/->>?/);
    let v = coluna === '*' ? undefined : linha[coluna];
    if (coluna === '*') { Object.assign(saida, linha); continue; }
    for (const k of caminho) v = v == null ? null : v[k];
    saida[apelido || (caminho.length ? caminho.at(-1) : coluna)] = v === undefined ? null : v;
  }
  return saida;
}

function casa(linha, coluna, condicao) {
  const [, op, valor] = condicao.match(/^(\w+)\.(.*)$/s) || [];
  const v = linha[coluna];
  const txt = v === null || v === undefined ? null : String(v);
  switch (op) {
    case 'eq': return txt === valor;
    case 'neq': return txt !== valor;
    case 'in': return valor.replace(/^\(|\)$/g, '').split(',').includes(txt);
    case 'gte': return txt !== null && txt >= valor;
    case 'gt': return txt !== null && txt > valor;
    case 'lte': return txt !== null && txt <= valor;
    case 'lt': return txt !== null && txt < valor;
    case 'is': return valor === 'null' ? v === null || v === undefined : String(v) === valor;
    default: throw new Error(`operador não imitado: ${op}`);
  }
}

const RESERVADOS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict']);

export function criarSupabaseFalso({ tabelas = {}, contas = {} } = {}) {
  const db = { tabelas, contas };
  for (const nome of Object.keys(PADROES)) db.tabelas[nome] ??= [];

  function rest(metodo, url, cabecalhos, corpo) {
    const nome = url.pathname.replace('/rest/v1/', '');
    const linhas = db.tabelas[nome];
    if (!linhas) {
      return { status: 404, corpo: { code: 'PGRST205', message: `Could not find the table 'public.${nome}' in the schema cache` } };
    }
    const q = url.searchParams;
    const filtros = [...q.entries()].filter(([k]) => !RESERVADOS.has(k));
    const filtra = (l) => filtros.every(([col, cond]) => casa(l, col, cond));
    const prefer = String(cabecalhos.Prefer || cabecalhos.prefer || '');
    const devolve = prefer.includes('return=representation');
    const select = q.get('select');

    if (metodo === 'GET') {
      let r = linhas.filter(filtra);
      const ordem = q.get('order');
      if (ordem) {
        const chaves = ordem.split(',').map((o) => { const [c, dir] = o.split('.'); return [c, dir === 'desc' ? -1 : 1]; });
        r = [...r].sort((a, b) => {
          for (const [c, d] of chaves) {
            if (a[c] === b[c]) continue;
            return (a[c] > b[c] ? 1 : -1) * d;
          }
          return 0;
        });
      }
      if (q.get('limit')) r = r.slice(0, Number(q.get('limit')));
      return { status: 200, corpo: r.map((l) => projetar(l, select)) };
    }

    if (metodo === 'POST') {
      const entradas = Array.isArray(corpo) ? corpo : [corpo];
      const conflito = q.get('on_conflict');
      const feitas = [];
      for (const e of entradas) {
        const existente = conflito ? linhas.find((l) => l[conflito] === e[conflito]) : null;
        if (existente) {
          if (!prefer.includes('merge-duplicates')) return { status: 409, corpo: { code: '23505', message: 'duplicate key' } };
          Object.assign(existente, e); feitas.push(existente);
        } else {
          const nova = { ...(PADROES[nome]?.() || {}), ...structuredClone(e) };
          linhas.push(nova); feitas.push(nova);
        }
      }
      return devolve ? { status: 201, corpo: feitas.map((l) => projetar(l, select)) } : { status: 201, corpo: null };
    }

    if (metodo === 'PATCH') {
      const alvo = linhas.filter(filtra);
      for (const l of alvo) Object.assign(l, structuredClone(corpo));
      return devolve ? { status: 200, corpo: alvo.map((l) => projetar(l, select)) } : { status: 204, corpo: null };
    }

    if (metodo === 'DELETE') {
      const ficam = linhas.filter((l) => !filtra(l));
      const sairam = linhas.filter(filtra);
      db.tabelas[nome] = ficam;
      // cascatas e "on delete set null" que o painel espera do banco
      for (const s of sairam) {
        if (nome === 'acomp_processo') {
          for (const t of ['acomp_etapa', 'acomp_documento', 'acomp_nota', 'acomp_processo_cliente']) {
            db.tabelas[t] = db.tabelas[t].filter((l) => l.processo_id !== s.id);
          }
          for (const f of db.tabelas.acomp_ficha || []) if (f.processo_id === s.id) f.processo_id = null;
        }
      }
      return { status: 204, corpo: null };
    }
    return { status: 405, corpo: { message: 'método não imitado' } };
  }

  function auth(metodo, url, corpo) {
    const caminho = url.pathname.replace('/auth/v1/', '');
    if (caminho === 'token' && metodo === 'POST') {
      const conta = Object.values(db.contas).find((c) => c.email === corpo?.email);
      if (!conta || conta.senha !== corpo?.password) return { status: 400, corpo: { error_description: 'Invalid login credentials' } };
      return { status: 200, corpo: { access_token: 'falso', user: { id: conta.id } } };
    }
    if (caminho === 'admin/users' && metodo === 'POST') {
      if (Object.values(db.contas).some((c) => c.email === corpo.email)) return { status: 422, corpo: { msg: 'already registered' } };
      const id = randomUUID();
      db.contas[id] = { id, email: corpo.email, senha: corpo.password };
      return { status: 200, corpo: { id } };
    }
    const m = caminho.match(/^admin\/users\/(.+)$/);
    if (m && metodo === 'PUT') { if (db.contas[m[1]]) db.contas[m[1]].senha = corpo.password; return { status: 200, corpo: {} }; }
    if (m && metodo === 'DELETE') { delete db.contas[m[1]]; return { status: 200, corpo: {} }; }
    return { status: 404, corpo: { msg: 'não imitado' } };
  }

  /** Responde a uma chamada como o Supabase responderia. */
  function responder(metodo, endereco, cabecalhos = {}, corpoTexto) {
    const url = new URL(endereco);
    const corpo = corpoTexto ? JSON.parse(corpoTexto) : undefined;
    if (url.pathname.startsWith('/rest/v1/')) return rest(metodo, url, cabecalhos, corpo);
    if (url.pathname.startsWith('/auth/v1/')) return auth(metodo, url, corpo);
    return { status: 404, corpo: { message: 'não imitado' } };
  }

  /** fetch() que atende em memória tudo que for para `base`. */
  function comoFetch(base) {
    return async (endereco, { method = 'GET', headers = {}, body } = {}) => {
      if (!String(endereco).startsWith(base)) throw new Error(`fetch fora do Supabase falso: ${endereco}`);
      const r = responder(method, String(endereco), headers, typeof body === 'string' ? body : undefined);
      const texto = r.corpo === null || r.corpo === undefined ? '' : JSON.stringify(r.corpo);
      return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => texto, json: async () => JSON.parse(texto || 'null') };
    };
  }

  return { db, responder, comoFetch };
}

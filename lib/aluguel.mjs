/**
 * lib/aluguel.mjs — o apartamento de aluguel, normalizado.
 *
 * Uma linha da tabela `imoveis_aichi` (o que o scraper do DK Portal grava)
 * vira UM objeto com o formato que a busca, o card e o modal de custos
 * esperam. É o par de lib/casas.mjs para o aluguel.
 *
 * Regras que atravessam o arquivo:
 *   - dado ausente vira null, nunca 0 ou "" — o card omite, o filtro não
 *     exclui, a faceta conta como "não informado";
 *   - pet e internet só valem alguma coisa depois que a página de detalhe
 *     foi lida (pet_verificado_em). Antes disso são null, e a interface diz
 *     quantos já foram conferidos;
 *   - a metragem pode vir no campo `andar` (o portal manda "44.75㎡" no lugar
 *     do andar). Aceitamos os dois, para que linhas antigas continuem certas;
 *   - o custo mensal e a entrada saem de custos.js, o MESMO arquivo que o
 *     modal do navegador usa. Um número só, dos dois lados.
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Custos = require('../custos.js');

/** URL de cliente do DK Portal. As de corretor (/broker/) pedem login e não servem ao público. */
export const URL_PORTAL_OK = /\/(p|g)\/h\/|\/personalize\//;

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const positivo = (v) => { const n = num(v); return n !== null && n > 0 ? n : null; };
const texto = (v) => { const s = v === null || v === undefined ? '' : String(v).trim(); return s || null; };

/** Remove acento e caixa para que "sao paulo" ache "São Paulo". */
export const chave = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/* ─────────────────────────────────────────────────────────────
   Planta → quartos
   1R/1K/1DK/1LDK/1SK = 1 · 2K/2DK/2LDK = 2 · 3 ou mais = "3"
   ───────────────────────────────────────────────────────────── */
export function quartosDaPlanta(planta) {
  const m = /^(\d+)/.exec(String(planta || '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 3 ? '3' : String(n);
}

/* ─────────────────────────────────────────────────────────────
   Área: "44.75㎡" → 44.75
   ───────────────────────────────────────────────────────────── */
export function lerArea(area, andar) {
  const a = positivo(area);
  if (a) return a;
  const m = /([\d.]+)\s*(㎡|m²|m2)/i.exec(String(andar || ''));
  return m ? positivo(m[1]) : null;
}

/* ─────────────────────────────────────────────────────────────
   Acesso: "名古屋市交通局東山線 高畑駅 バス 31分 (バス停)八百島"
           "名古屋鉄道尾西線 観音寺駅"
   `minutos_estacao` é a caminhada (até a estação, ou até o ponto
   quando o trajeto é de ônibus).
   ───────────────────────────────────────────────────────────── */
export function lerAcesso(estacao, minutos) {
  const bruto = String(estacao || '').replace(/\s+/g, ' ').trim();
  if (!bruto) return { linha: null, estacao: null, minutosAPe: positivo(minutos), onibus: false, minutosOnibus: null, ponto: null };
  const onibus = /バス/.test(bruto);
  const semOnibus = bruto.replace(/\s*バス.*$/, '').trim();
  const partes = semOnibus.split(' ');
  const est = partes.length > 1 ? partes[partes.length - 1] : (/駅$/.test(partes[0]) ? partes[0] : null);
  const linha = partes.length > 1 ? partes.slice(0, -1).join(' ') : (est ? null : partes[0]);
  const mOn = /バス\s*(\d+)\s*分/.exec(bruto);
  const mPonto = /\(バス停\)\s*(\S+)/.exec(bruto);
  return {
    linha: texto(linha),
    estacao: texto(est),
    minutosAPe: positivo(minutos),
    onibus,
    minutosOnibus: mOn ? Number(mOn[1]) : null,
    ponto: mPonto ? mPonto[1] : null
  };
}

/* ─────────────────────────────────────────────────────────────
   Disponibilidade: "即入居可" → imediata
                    "2026年10月上旬" → prevista, "início de outubro/2026"
   ───────────────────────────────────────────────────────────── */
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function lerDisponibilidade(bruto) {
  const s = String(bruto || '').trim();
  if (!s) return { classe: null, quando: null, texto: null };
  if (/即入居|即時/.test(s)) return { classe: 'imediata', quando: null, texto: 'Entrada imediata' };
  const m = /(\d{4})年\s*(\d{1,2})月\s*(上旬|中旬|下旬)?/.exec(s.normalize('NFKC'));
  if (!m) return { classe: null, quando: null, texto: null };
  const ano = Number(m[1]), mes = Number(m[2]);
  const parte = { '上旬': 'início de ', '中旬': 'meados de ', '下旬': 'fim de ' }[m[3]] || '';
  // ordenável: ano-mês-decêndio (1, 2, 3)
  const dec = { '上旬': 1, '中旬': 2, '下旬': 3 }[m[3]] || 2;
  return {
    classe: 'prevista',
    quando: `${ano}-${String(mes).padStart(2, '0')}-${dec}`,
    texto: `Disponível a partir de ${parte}${MESES[mes - 1] || mes}/${ano}`
  };
}

/* ─────────────────────────────────────────────────────────────
   Normalização
   ───────────────────────────────────────────────────────────── */

/**
 * @param {object} linha  linha crua de imoveis_aichi
 */
export function normalizarAluguel(linha) {
  const r = linha || {};
  const aluguel = positivo(r.aluguel);
  const condominio = positivo(r.condominio);
  const vaga = positivo(r.estacionamento);
  const temVaga = r.tem_estacionamento === true || !!vaga;
  const deposito = positivo(r.deposito);
  const luva = positivo(r.luva);
  const verificadoPet = !!r.pet_verificado_em;
  const planta = texto(r.planta) ? String(r.planta).trim().toUpperCase() : null;
  const dkUrl = texto(r.dk_url) && URL_PORTAL_OK.test(r.dk_url) ? String(r.dk_url) : null;
  const fotoUrl = /^https?:\/\//.test(String(r.foto_url || '')) ? String(r.foto_url) : null;
  const fotoPlanta = /^https?:\/\//.test(String(r.foto_planta || '')) ? String(r.foto_planta) : null;

  const custos = Custos.calcular({
    aluguel: aluguel || 0, condominio: condominio || 0, estacionamento: vaga || 0,
    tem_estacionamento: temVaga, deposito: deposito || 0, luva: luva || 0
  });

  return {
    codigo: String(r.id),
    titulo: texto(r.titulo) || 'Apartamento',
    endereco: texto(r.endereco),
    cidade: texto(r.cidade_pt),
    cidadeJp: texto(r.cidade),
    planta,
    quartos: quartosDaPlanta(planta),
    area: lerArea(r.area, r.andar),
    aluguel,
    condominio,
    vaga,                       // ¥/mês da vaga, quando o portal informa
    temVaga,
    deposito,                   // 敷金 em ienes (null = não cobra)
    luva,                       // 礼金 em ienes (null = não cobra)
    acesso: lerAcesso(r.estacao, r.minutos_estacao),
    disponibilidade: lerDisponibilidade(r.disponivel_de),
    // null = ainda não conferido na página de detalhe
    pet: verificadoPet ? r.pet === true : null,
    internet: verificadoPet ? r.internet === true : null,
    fotoUrl,
    fotoPlanta,
    dkUrl,
    mensal: custos.mensal,      // aluguel + condomínio + vaga + garantidora + suporte
    entrada: custos.entrada,    // estimativa, com 15 diárias e a vaga incluída
    verificadoEm: texto(r.updated_at) ? String(r.updated_at).slice(0, 10) : null
  };
}

/** Só publica o que dá para mostrar com honestidade: preço e cidade. */
export function ehPublicavel(a) {
  return !!(a && a.aluguel && a.cidade);
}

/** Versão para o JSON da lista e o modal: o que o card e o modal precisam, nada mais. */
export function resumirParaLista(a) {
  return a;   // o objeto já é enxuto (sem galeria, sem textos longos)
}

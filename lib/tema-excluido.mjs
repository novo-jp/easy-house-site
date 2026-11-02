/**
 * Tema fora do escopo editorial: financiamento sem visto permanente.
 *
 * Decisão da Easy House em 02/11/2026 (regras SEO revisadas): nenhuma
 * página, FAQ, metadado, link interno, sitemap, dado estruturado ou texto
 * para IA sobre financiar sem 永住 — em português, espanhol ou japonês.
 *
 * A exceção é a regra do produto quando ela é necessária para o texto ser
 * verdadeiro: o Flat 35 só aceita estrangeiros com 永住者 ou 特別永住者
 * (JHF, FAQ 308). Esse fato fica num lugar só — o quadro "Flat 35 × banco"
 * das páginas de financiamento —, marcado com `data-fato-produto`. O
 * simulador (/simular, /simular-es) pergunta o tipo de visto para qualificar
 * o lead e avisa a regra; é funil, não conteúdo de busca, e fica fora daqui.
 */

/** Trechos vetados, já normalizados (minúsculas, sem acento, hífen = espaço). */
export const FRAGMENTOS_VETADOS = [
  'eijuken',
  'visto permanente',
  'visa permanente',
  'residencia permanente',
  '永住',
  'permanent resident',
  'permanent residence',
];

export const normalizar = (s) => s
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[-_]+/g, ' ');

/** Remove os elementos marcados como regra de produto (a exceção permitida). */
const semFatoDeProduto = (html) => html.replace(/<(\w+)[^>]*\bdata-fato-produto="[^"]*"[^>]*>[\s\S]*?<\/\1>/g, ' ');

/**
 * Trechos vetados presentes no HTML (ou texto) — inclui head, metadados,
 * JSON-LD e atributos, como href. Lista vazia = limpo.
 */
export function trechosVetados(html) {
  const n = normalizar(semFatoDeProduto(html));
  return FRAGMENTOS_VETADOS.filter((f) => n.includes(f));
}

/**
 * GET /llms.txt — resumo do site para assistentes de IA.
 *
 * Gerado na hora porque o acervo muda toda semana: um arquivo estático
 * diria "610 casas" para sempre, e um número errado é pior que nenhum.
 *
 * O formato segue a proposta llms.txt (Markdown, com links). Vale dizer que
 * nenhum provedor de IA confirmou publicamente que lê este arquivo — o que
 * de fato faz a diferença é o conteúdo das páginas estar acessível e
 * respondendo as perguntas reais. Este arquivo é barato e não atrapalha.
 */

import { readFileSync } from 'node:fs';
import { carregarCasas, financingConfig } from '../lib/casas-fonte.mjs';

const MODELO = readFileSync(new URL('../lib/llms-template.txt', import.meta.url), 'utf8');

export default async function handler(req, res) {
  let total = null, cidades = null;
  try {
    const casas = await carregarCasas();
    total = casas.length;
    cidades = new Set(casas.map((c) => c.cidade).filter(Boolean)).size;
  } catch {
    // Sem o banco, publicamos o texto sem os números em vez de números velhos.
  }

  const flat35 = financingConfig?.flat35 ?? {};
  const corpo = MODELO
    .replace('{{TOTAL}}', total ?? 'centenas de')
    .replace('{{CIDADES}}', cidades ?? 'várias')
    .replace('{{TAXA}}', flat35.rateDisplayLabel ?? 'taxa fixa de referência')
    .replace('{{PRAZO}}', flat35.maximumTermYears ?? 35);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(corpo);
}

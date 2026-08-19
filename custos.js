/* EASY HOUSE — estimativa de custos de aluguel
   Valores padrão dos contratos que intermediamos. Ajuste em um lugar só. */
(function (global) {
  'use strict';

  var TAXAS = {
    corretagemMult:    1.1,     // 仲介手数料: (aluguel + estacionamento) x 1,1
    garantiaInicial:   22000,   // 保証委託料 — na assinatura
    garantiaMensalPct: 0.022,   // 保証委託料 — 2,2% do total mensal
    limpeza:           70000,   // クリーニング費 — cobrada na entrada
    administrativa:    22000,   // 更新事務手数料 — cobrada já na assinatura
    chaves:            3300,    // 鍵セット費
    suporteMensal:     1980,    // ruumサポート
    diasPadrao:        15,      // diárias do primeiro mês, por padrão
    diasMes:           30,
    cartaoPct:         0.036    // acréscimo para pagamento no cartão
  };

  function calcular(imovel, opcoes) {
    opcoes = opcoes || {};
    var dias = opcoes.dias == null ? TAXAS.diasPadrao : opcoes.dias;

    // A vaga vem do portal. É opcional: quem não quiser alugar vaga
    // pode tirar da conta na tela de detalhes.
    var vagaDisponivel = Number(imovel.estacionamento || 0);
    var estacionamento = opcoes.estacionamento != null
      ? Number(opcoes.estacionamento) || 0
      : vagaDisponivel;

    var aluguel = imovel.aluguel || 0;
    var condominio = imovel.condominio || 0;

    var base = aluguel + condominio + estacionamento;
    var garantiaMensal = Math.ceil(base * TAXAS.garantiaMensalPct);
    var mensal = base + garantiaMensal + TAXAS.suporteMensal;

    var itens = [
      { chave: 'diarias', jp: '日割り家賃',   pt: 'Diárias do primeiro mês',
        detalhe: dias + ' dias', valor: Math.round(mensal / TAXAS.diasMes * dias) },
      { chave: 'adiantado', jp: '前家賃',     pt: 'Aluguel adiantado',
        detalhe: '1 mês completo', valor: mensal },
      { chave: 'corretagem', jp: '仲介手数料', pt: 'Taxa de intermediação',
        detalhe: 'aluguel × 1,1', valor: Math.round((aluguel + estacionamento) * TAXAS.corretagemMult) },
      { chave: 'garantia', jp: '保証委託料',   pt: 'Empresa garantidora',
        detalhe: 'na assinatura', valor: TAXAS.garantiaInicial },
      { chave: 'limpeza', jp: 'クリーニング費', pt: 'Limpeza na saída',
        detalhe: 'paga na entrada', valor: TAXAS.limpeza },
      { chave: 'administrativa', jp: '更新事務手数料', pt: 'Taxa administrativa de contrato',
        detalhe: 'cobrada na assinatura', valor: TAXAS.administrativa },
      { chave: 'chaves', jp: '鍵セット費',     pt: 'Jogo de chaves',
        detalhe: '', valor: TAXAS.chaves }
    ];

    var total = itens.reduce(function (s, i) { return s + i.valor; }, 0);

    return {
      aluguel: aluguel,
      condominio: condominio,
      estacionamento: estacionamento,
      vagaDisponivel: vagaDisponivel,
      temVaga: !!(imovel.tem_estacionamento || vagaDisponivel),
      garantiaMensal: garantiaMensal,
      suporte: TAXAS.suporteMensal,
      mensal: mensal,
      dias: dias,
      itens: itens,
      entrada: total,
      entradaCartao: Math.round(total * (1 + TAXAS.cartaoPct)),
      acrescimoCartao: Math.round(total * TAXAS.cartaoPct)
    };
  }

  function iene(v) { return '¥' + Number(v || 0).toLocaleString('ja-JP'); }

  global.EHCustos = { TAXAS: TAXAS, calcular: calcular, iene: iene };
})(window);

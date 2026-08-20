/**
 * Aviso de lead novo por e-mail.
 *
 * Existe porque o funil fazia tudo certo — capturava, gravava, pontuava — e
 * ninguém era avisado. Um lead de prioridade 90 ficou 4 dias sem resposta
 * porque só apareceria para quem abrisse o Supabase por conta própria.
 *
 * Requer as variáveis de ambiente:
 *   RESEND_API_KEY     chave da conta Resend
 *   LEAD_NOTIFY_TO     para quem enviar (pode ser mais de um, separado por vírgula)
 *   LEAD_NOTIFY_FROM   opcional; sem domínio verificado use o padrão abaixo
 *
 * Sem elas não faz nada e devolve { enviado: false }. O lead continua sendo
 * gravado normalmente — o aviso nunca pode derrubar o atendimento.
 *
 * ---
 * O QUE VAI NO E-MAIL, E O QUE NÃO VAI
 *
 * Vai o necessário para agir: código, nome, telefone, cidades, prazo e um link
 * que já abre a conversa no WhatsApp.
 *
 * **Não vai renda, dívidas, entrada nem a faixa de imóvel.** O e-mail atravessa
 * um serviço de terceiro, e /privacy promete que dado financeiro não é
 * compartilhado. O corretor consulta esses valores no banco pelo código.
 */

const RESEND_URL = 'https://api.resend.com/emails';
const REMETENTE_PADRAO = 'Easy House <onboarding@resend.dev>';

/** Telefone em E.164 vira link de conversa direta. */
function linkWhatsApp(telefone, nome) {
  const numero = String(telefone || '').replace(/\D/g, '');
  if (!numero) return null;
  const texto = `Olá${nome ? ' ' + nome : ''}! Aqui é da Easy House. Recebi sua simulação pelo site e queria te ajudar com os próximos passos.`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

const PRAZOS = {
  asap: 'O quanto antes',
  '3m': 'Nos próximos 3 meses',
  '6m': 'Nos próximos 6 meses',
  '12m': 'Dentro de 1 ano',
  pesquisando: 'Só pesquisando'
};

function montarHtml({ lead, answers, source }) {
  const wa = linkWhatsApp(lead.phone, lead.first_name);
  const cidades = Array.isArray(lead.cities) && lead.cities.length ? lead.cities.join(', ') : '—';
  const prazo = PRAZOS[answers?.purchaseTiming] || '—';
  const campanha = source?.utm_campaign || 'orgânico / direto';

  const linha = (rotulo, valor) => `
    <tr>
      <td style="padding:8px 0;color:#5A6478;font-size:14px;width:150px">${rotulo}</td>
      <td style="padding:8px 0;color:#1B2434;font-size:15px;font-weight:600">${valor}</td>
    </tr>`;

  return `<!doctype html><html><body style="margin:0;background:#F4F7FB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px 20px">
    <p style="margin:0 0 4px;color:#46587F;font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:700">Easy House</p>
    <h1 style="margin:0 0 4px;color:#12224A;font-size:22px">Lead novo: ${lead.first_name || 'sem nome'}</h1>
    <p style="margin:0 0 20px;color:#5A6478;font-size:14px">Prioridade ${lead.internal_score} de 100 · código ${lead.code}</p>

    ${wa ? `<a href="${wa}" style="display:block;background:#25D366;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:999px;font-size:16px;font-weight:700;margin-bottom:8px">Responder no WhatsApp agora</a>
    <p style="margin:0 0 22px;text-align:center;color:#5A6478;font-size:13px">Abre a conversa já com a mensagem pronta.</p>` : ''}

    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:10px;padding:8px 16px" cellpadding="0" cellspacing="0">
      <tr><td colspan="2" style="padding:14px 16px 4px"><table style="width:100%;border-collapse:collapse">
        ${linha('Telefone', lead.phone || '—')}
        ${linha('E-mail', lead.email || '—')}
        ${linha('Idioma', lead.language || 'pt-BR')}
        ${linha('Melhor horário', lead.preferred_time || 'Tanto faz')}
        ${linha('Cidades', cidades)}
        ${linha('Quando pretende comprar', prazo)}
        ${linha('Veio de', campanha)}
      </table></td></tr>
    </table>

    <p style="margin:22px 0 0;color:#5A6478;font-size:13px;line-height:1.6">
      Renda, dívidas e faixa de imóvel <strong>não vão neste e-mail</strong> por segurança.
      Consulte no Supabase pelo código <strong>${lead.code}</strong>.
    </p>
    <p style="margin:16px 0 0;color:#8A93A6;font-size:12px">
      EASY HOUSE — 株式会社movO · 沖縄県知事(1)第5984号
    </p>
  </div></body></html>`;
}

/**
 * @returns {Promise<{enviado: boolean, motivo?: string}>}
 */
export async function avisarLeadNovo({ lead, answers, source }) {
  const chave = process.env.RESEND_API_KEY;
  const para = process.env.LEAD_NOTIFY_TO;
  if (!chave || !para) return { enviado: false, motivo: 'nao_configurado' };

  const destinatarios = para.split(',').map(e => e.trim()).filter(Boolean);
  if (!destinatarios.length) return { enviado: false, motivo: 'sem_destinatario' };

  try {
    const resp = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.LEAD_NOTIFY_FROM || REMETENTE_PADRAO,
        to: destinatarios,
        subject: `Lead novo — ${lead.first_name || 'sem nome'} (${lead.code})`,
        html: montarHtml({ lead, answers, source })
      })
    });
    if (!resp.ok) {
      console.error('notificar: resposta', resp.status);   // sem corpo: pode ecoar a chave
      return { enviado: false, motivo: 'erro_' + resp.status };
    }
    return { enviado: true };
  } catch {
    console.error('notificar: falha de rede');
    return { enviado: false, motivo: 'rede' };
  }
}

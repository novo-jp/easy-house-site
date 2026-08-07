/**
 * Conversions API do Meta — envio de conversão pelo servidor.
 *
 * Por que existe: bloqueador de anúncio e restrições do iOS derrubam boa parte
 * dos disparos feitos pelo navegador. O envio pelo servidor recupera essas
 * conversões. O mesmo `eventId` vai nos dois caminhos, e o Meta junta os dois
 * em uma conversão só.
 *
 * Requer as variáveis de ambiente:
 *   META_PIXEL_ID
 *   META_CAPI_TOKEN     (token de acesso da Conversions API — nunca no browser)
 *
 * Sem elas, `sendLeadEvent` não faz nada e devolve `{ sent: false }`.
 *
 * ---
 * DECISÃO DE PRIVACIDADE
 *
 * Este módulo **não envia e-mail nem telefone** ao Meta, nem em forma de hash.
 *
 * O aceite que a pessoa dá no formulário é para a Easy House usar os dados
 * naquele atendimento. Não é aceite de repasse de dado pessoal a terceiro,
 * que é o que a 個人情報保護法 exige para mandar contato a uma plataforma de
 * publicidade. Enviamos apenas o que o aviso de medição cobre: os cookies de
 * atribuição do próprio Meta (_fbp / _fbc), IP e navegador.
 *
 * Isso reduz um pouco a taxa de correspondência, e é a troca correta.
 * Para incluir contato seria preciso um aceite específico e separado no
 * formulário, dizendo com todas as letras que o dado vai para o Meta.
 */

const API_VERSION = 'v21.0';

/**
 * @param {object} params
 * @param {string} params.eventId     mesmo id usado no disparo do navegador
 * @param {object|null} params.ads    { fbp, fbc, url } — null se não houve aceite
 * @param {string} params.ip
 * @param {string} params.userAgent
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
export async function sendLeadEvent({ eventId, ads, ip, userAgent }) {
  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;

  if (!pixelId || !token) return { sent: false, reason: 'nao_configurado' };
  if (!ads) return { sent: false, reason: 'sem_consentimento' };

  const userData = {};
  if (ads.fbp) userData.fbp = ads.fbp;
  if (ads.fbc) userData.fbc = ads.fbc;
  if (ip) userData.client_ip_address = ip;
  if (userAgent) userData.client_user_agent = userAgent;

  // Sem nenhum identificador o Meta rejeita o evento — não vale a chamada.
  if (!Object.keys(userData).length) return { sent: false, reason: 'sem_identificador' };

  const payload = {
    data: [{
      event_name: 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: 'website',
      event_source_url: ads.url || undefined,
      user_data: userData
    }]
  };

  try {
    const resp = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
    if (!resp.ok) {
      // Não expõe o corpo da resposta: pode conter eco do token.
      console.error('meta-capi: resposta', resp.status);
      return { sent: false, reason: 'erro_' + resp.status };
    }
    return { sent: true };
  } catch {
    console.error('meta-capi: falha de rede');
    return { sent: false, reason: 'rede' };
  }
}

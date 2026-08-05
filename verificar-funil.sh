#!/bin/bash
# Verifica se o funil está completamente configurado.
# Uso: bash verificar-funil.sh

KEY="sb_publishable_jYJGgS4CfLkRbUFkSWI5PQ_qEYgFmLZ"
URL="https://igtqdhesorahhdyvsjrl.supabase.co"
SITE="https://easyhouse.homes"

echo "=== 1. Tabelas no Supabase ==="
faltando=0
for t in financing_configuration property lead simulation consent funnel_event lead_answer property_match; do
  r=$(curl -s "$URL/rest/v1/$t?select=count&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY")
  if echo "$r" | grep -q "PGRST205\|does not exist"; then
    printf "  %-26s FALTA\n" "$t"; faltando=1
  else
    printf "  %-26s ok\n" "$t"
  fi
done

echo ""
echo "=== 2. Configuração ativa ==="
cfg=$(curl -s "$URL/rest/v1/financing_configuration?select=version,valid_from&is_active=eq.true" -H "apikey: $KEY" -H "Authorization: Bearer $KEY")
if echo "$cfg" | grep -q "version"; then
  echo "  $cfg"
else
  echo "  nenhuma configuração ativa (rode sql/instalar.sql)"
fi

echo ""
echo "=== 3. Cálculo em produção ==="
curl -s -X POST "$SITE/api/simulate" -H "Content-Type: application/json" \
  -d '{"age":30,"employmentType":"autonomo","employmentYears":"gte3","residency":"permanent_resident","desiredMonthlyPayment":90000}' \
  | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)['result']
    print(f\"  taxa {d['rate']['display']} · prazo {d['term']['years']} anos · config v{d['configVersion']}\")
except Exception:
    print('  falhou')
"

echo ""
echo "=== 4. Gravação de lead ==="
r=$(curl -s -X POST "$SITE/api/lead" -H "Content-Type: application/json" \
  -d '{"contact":{"firstName":"Verificacao","phone":"08000000000"},"consent":{"dataProcessing":true},"answers":{"age":35,"employmentType":"seishain","employmentYears":"gte3","residency":"permanent_resident","desiredMonthlyPayment":90000},"sessionId":"verificacao"}')
if echo "$r" | grep -q '"persisted":true'; then
  echo "  gravando no banco — funil completo"
  echo "  $(echo "$r" | python3 -c "import json,sys; d=json.load(sys.stdin); print('código gerado:', d.get('code'))")"
  echo "  (apague depois: delete from lead where phone = '+818000000000';)"
elif echo "$r" | grep -q '"persisted":false'; then
  echo "  NÃO grava — falta a variável SUPABASE_SERVICE_KEY na Vercel"
else
  echo "  resposta inesperada: $(echo $r | head -c 120)"
fi

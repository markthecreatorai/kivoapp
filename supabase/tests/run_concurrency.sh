#!/usr/bin/env bash
# =============================================================================
# QA-4A-V7 — Runner de CONCORRÊNCIA REAL (duas conexões Postgres independentes)
# -----------------------------------------------------------------------------
# Cada cenário abre 2 sessões psql simultâneas (via FIFO) e cruza os COMMITs
# para provar serialização por lock, idempotência e ausência de duplo gasto.
#
# Cenários:
#   C1 — dois settlements simultâneos do MESMO pedido
#   C2 — dois refunds simultâneos com gateway_refund_id DISTINTOS
#   C3 — replay SIMULTÂNEO do MESMO refund
#   C4 — dois pedidos de saque simultâneos disputando o MESMO saldo
#   C5 — duas resoluções simultâneas do MESMO chargeback
#
# Estes cenários NÃO podem rodar em BEGIN…ROLLBACK (precisam de COMMIT), então
# usam um banco DESCARTÁVEL que é DESTRUÍDO no fim (trap). Nunca aponte para
# produção: o script recusa o ref wfuwenylojhabresnrvi e hosts Supabase.
# =============================================================================
set -Eeuo pipefail

FORBIDDEN_REF="wfuwenylojhabresnrvi"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mktemp -d)"
PASS=0; FAIL=0

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERRO: exporte DATABASE_URL de um banco EFEMERO e DESCARTAVEL (kivo_qa_conc*)." >&2
  exit 2
fi
if [[ "${DATABASE_URL}" == *"${FORBIDDEN_REF}"* ]]; then
  echo "ABORTADO: DATABASE_URL referencia PRODUCAO (${FORBIDDEN_REF})." >&2; exit 3
fi
if [[ "${DATABASE_URL}" == *"supabase.co"* || "${DATABASE_URL}" == *"supabase.com"* || "${DATABASE_URL}" == *"pooler.supabase"* ]]; then
  echo "ABORTADO: host Supabase gerenciado nao e permitido neste runner." >&2; exit 3
fi
DBNAME="$(psql "${DATABASE_URL}" -tAc 'SELECT current_database()')"
if [[ "${DBNAME}" != kivo_qa_conc* ]]; then
  echo "ABORTADO: banco '${DBNAME}' precisa do prefixo kivo_qa_conc* (descartavel)." >&2
  exit 3
fi
echo "==> Banco descartavel confirmado: ${DBNAME}"

cleanup() { rm -rf "${WORK}"; }
trap cleanup EXIT

q() { psql "${DATABASE_URL}" -tAX -c "$1"; }

# Abre uma sessão psql persistente alimentada por FIFO.
open_session() { # $1 = nome
  local n="$1"
  mkfifo "${WORK}/${n}.in"
  ( psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=0 -a < "${WORK}/${n}.in" \
      > "${WORK}/${n}.out" 2>&1 ) &
  exec {fd}<> /dev/null
  # mantém a FIFO aberta para escrita durante toda a sessão
  eval "exec ${2}> ${WORK}/${n}.in"
}

send() { # $1 = fd, $2 = sql
  eval "printf '%s\n' \"\$2\" >&$1"
}

report() { # $1 = nome, $2 = cond, $3 = detalhe
  if [[ "$2" == "t" ]]; then
    echo "PASS — $1 ${3:+($3)}"; PASS=$((PASS+1))
  else
    echo "FAIL — $1 ${3:+($3)}" >&2; FAIL=$((FAIL+1))
  fi
}

# ── Cenário genérico: 2 sessões, SQL entrelaçado, asserção final ────────────
run_pair() { # $1=nome  $2=setup_sql(gera contexto e imprime json)  $3=sql_A  $4=sql_B  $5=assert_sql
  local name="$1" setup="$2" a="$3" b="$4" assertion="$5"
  echo ""
  echo "──────── ${name} ────────"
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -q -c "${setup}" >/dev/null

  open_session "A" 7
  open_session "B" 8

  send 7 "BEGIN;"
  send 8 "BEGIN;"
  sleep 0.3
  send 7 "${a}"
  sleep 0.3           # A já detém o lock; B entra em espera real
  send 8 "${b}"
  sleep 0.5
  send 7 "COMMIT;"
  sleep 0.5
  send 8 "COMMIT;"
  sleep 0.5
  send 7 "\\q"
  send 8 "\\q"
  eval "exec 7>&-"; eval "exec 8>&-"
  wait || true

  local res; res="$(q "${assertion}")"
  report "${name}" "${res}" "$(tr -d '\n' < "${WORK}/B.out" | tail -c 160)"
  rm -f "${WORK}"/A.in "${WORK}"/B.in "${WORK}"/A.out "${WORK}"/B.out
}

# =============================== C1 =========================================
run_pair "C1 dois settlements simultaneos do mesmo pedido" \
  "TRUNCATE public.qa4b_ctx; INSERT INTO public.qa4b_ctx SELECT * FROM qa4b.conc_new_paid_order();" \
  "SELECT public.settle_order_atomic((SELECT order_id FROM public.qa4b_ctx), 349);" \
  "SELECT public.settle_order_atomic((SELECT order_id FROM public.qa4b_ctx), 349);" \
  "SELECT (SELECT count(*) FROM public.reserve_entries r JOIN public.qa4b_ctx c ON c.order_id = r.order_id) = 1
      AND (SELECT count(*) FROM public.wallet_ledger l JOIN public.qa4b_ctx c ON c.order_id = l.order_id AND l.type='sale') = 1
      AND qa4b.conc_invariant_ok();"

# =============================== C2 =========================================
run_pair "C2 dois refunds simultaneos com ids distintos" \
  "TRUNCATE public.qa4b_ctx; INSERT INTO public.qa4b_ctx SELECT * FROM qa4b.conc_new_settled_order();" \
  "SELECT public.process_refund_increment((SELECT order_id FROM public.qa4b_ctx), (SELECT payment_id FROM public.qa4b_ctx), 'conc-r1', 2000, 10000);" \
  "SELECT public.process_refund_increment((SELECT order_id FROM public.qa4b_ctx), (SELECT payment_id FROM public.qa4b_ctx), 'conc-r2', 2000, 10000);" \
  "SELECT (SELECT round(sum(amount)*100)::int FROM public.refunds f JOIN public.qa4b_ctx c ON c.order_id=f.order_id WHERE f.status='PROCESSED') = 4000
      AND qa4b.conc_invariant_ok();"

# =============================== C3 =========================================
run_pair "C3 replay simultaneo do mesmo refund" \
  "TRUNCATE public.qa4b_ctx; INSERT INTO public.qa4b_ctx SELECT * FROM qa4b.conc_new_settled_order();" \
  "SELECT public.process_refund_increment((SELECT order_id FROM public.qa4b_ctx), (SELECT payment_id FROM public.qa4b_ctx), 'conc-dup', 3000, 10000);" \
  "SELECT public.process_refund_increment((SELECT order_id FROM public.qa4b_ctx), (SELECT payment_id FROM public.qa4b_ctx), 'conc-dup', 3000, 10000);" \
  "SELECT (SELECT count(*) FROM public.refunds f JOIN public.qa4b_ctx c ON c.order_id=f.order_id WHERE f.gateway_refund_id='conc-dup') = 1
      AND (SELECT round(sum(amount)*100)::int FROM public.refunds f JOIN public.qa4b_ctx c ON c.order_id=f.order_id WHERE f.status='PROCESSED') = 3000
      AND qa4b.conc_invariant_ok();"

# =============================== C4 =========================================
run_pair "C4 dois saques simultaneos disputando o mesmo saldo" \
  "TRUNCATE public.qa4b_ctx; INSERT INTO public.qa4b_ctx SELECT * FROM qa4b.conc_new_available_balance(10000);" \
  "SELECT qa4b.conc_request_withdrawal(9000);" \
  "SELECT qa4b.conc_request_withdrawal(9000);" \
  "SELECT (SELECT count(*) FROM public.payout_requests p JOIN public.qa4b_ctx c ON c.workspace_id=p.workspace_id
            WHERE p.status NOT IN ('REJECTED','CANCELLED','FAILED')) <= 1
      AND qa4b.conc_no_overdraft();"

# =============================== C5 =========================================
run_pair "C5 duas resolucoes simultaneas do mesmo chargeback" \
  "TRUNCATE public.qa4b_ctx; INSERT INTO public.qa4b_ctx SELECT * FROM qa4b.conc_new_settled_order();" \
  "SELECT public.resolve_chargeback_financials((SELECT order_id FROM public.qa4b_ctx), (SELECT payment_id FROM public.qa4b_ctx), 'conc-disp', 10000);" \
  "SELECT public.resolve_chargeback_financials((SELECT order_id FROM public.qa4b_ctx), (SELECT payment_id FROM public.qa4b_ctx), 'conc-disp', 10000);" \
  "SELECT (SELECT count(*) FROM public.chargeback_cases c2 WHERE c2.gateway_dispute_id='conc-disp') = 1
      AND (SELECT count(*) FROM public.wallet_ledger l JOIN public.qa4b_ctx c ON c.order_id=l.order_id AND l.type='chargeback') = 1
      AND qa4b.conc_no_overdraft();"

echo ""
echo "CONCORRENCIA: ${PASS} PASS / ${FAIL} FAIL"
echo "AVISO: destrua o banco descartavel agora (dropdb ${DBNAME})."
exit $(( FAIL > 0 ? 1 : 0 ))

#!/usr/bin/env bash
# =============================================================================
# QA-4A-V7 — Runner da suíte SQL transacional da Onda 4A
# -----------------------------------------------------------------------------
# Cada arquivo roda em BEGIN … ROLLBACK: nada persiste. Exige DATABASE_URL de um
# banco EFÊMERO e isolado. Recusa explicitamente produção.
#
# NÃO executa deploy, não aplica migrations em remoto e não chama API externa.
# =============================================================================
set -Eeuo pipefail

FORBIDDEN_REF="wfuwenylojhabresnrvi"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERRO: exporte DATABASE_URL apontando para um banco efemero (ex.: postgres:///kivo_qa)." >&2
  exit 2
fi

if [[ "${DATABASE_URL}" == *"${FORBIDDEN_REF}"* ]]; then
  echo "ABORTADO: DATABASE_URL referencia o projeto de PRODUCAO (${FORBIDDEN_REF})." >&2
  exit 3
fi
if [[ "${DATABASE_URL}" == *"supabase.co"* || "${DATABASE_URL}" == *"supabase.com"* || "${DATABASE_URL}" == *"pooler.supabase"* ]]; then
  echo "ABORTADO: DATABASE_URL aponta para host Supabase gerenciado. Use cluster local efemero." >&2
  exit 3
fi

DBNAME="$(psql "${DATABASE_URL}" -tAc 'SELECT current_database()')"
if [[ "${DBNAME}" != kivo_qa* ]]; then
  echo "ABORTADO: banco '${DBNAME}' nao segue o prefixo obrigatorio kivo_qa*." >&2
  exit 3
fi

echo "==> Banco efemero confirmado: ${DBNAME}"

FILES=(
  "${HERE}/sql/01_settlement_atomic.sql"
  "${HERE}/sql/02_refunds.sql"
  "${HERE}/sql/03_chargeback.sql"
  "${HERE}/sql/04_reserve_lifecycle.sql"
  "${HERE}/sql/05_grants_rls.sql"
)

FAILED=0
for f in "${FILES[@]}"; do
  echo ""
  echo "===================================================================="
  echo "==> $(basename "$f")"
  echo "===================================================================="
  if psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "$f"; then
    echo "PASS: $(basename "$f")"
  else
    echo "FAIL: $(basename "$f")" >&2
    FAILED=1
  fi
done

echo ""
if [[ "${FAILED}" -eq 0 ]]; then
  echo "SUITE SQL: PASS (todas as transacoes revertidas)"
else
  echo "SUITE SQL: FAIL" >&2
fi
exit "${FAILED}"

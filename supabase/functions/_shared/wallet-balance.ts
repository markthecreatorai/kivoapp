// Regra canônica de saldo da carteira (espelha a função SQL public.get_wallet_balance).
// Status reais de wallet_ledger: 'pending' | 'available' | 'settled' | 'canceled'.
//   pending   -> em hold; se available_at já passou, conta como disponível
//   available -> liberado
//   settled   -> lançamento informativo (taxa Asaas já descontada do creator_net;
//                reembolso/chargeback já cancelam o crédito 'sale') → NÃO afeta saldo
//   canceled  -> ignorado
// Tipos reais: 'sale' | 'fee' | 'refund' | 'withdrawal' | 'adjustment' | 'chargeback'.
// Saque (withdrawal) e valores negativos SEMPRE subtraem.

export const LEDGER_BALANCE_STATUSES = ["pending", "available"] as const;
export const DEBIT_TYPES = ["withdrawal", "fee", "refund", "chargeback"] as const;

export interface LedgerRow {
  amount: number | string;
  status: string;
  type: string;
  available_at?: string | null;
}

/** Valor com sinal: débitos sempre negativos. */
export function signedAmount(row: LedgerRow): number {
  const raw = Number(row.amount || 0);
  if ((DEBIT_TYPES as readonly string[]).includes(row.type)) return -Math.abs(raw);
  return raw;
}

function affectsBalance(row: LedgerRow): boolean {
  return (LEDGER_BALANCE_STATUSES as readonly string[]).includes(row.status);
}

function isDue(row: LedgerRow, now = Date.now()): boolean {
  return !!row.available_at && new Date(row.available_at).getTime() <= now;
}

/** Já liberado: status available, ou pending com available_at vencido. */
export function isRealized(row: LedgerRow, now = Date.now()): boolean {
  if (!affectsBalance(row)) return false;
  return row.status === "available" || (row.status === "pending" && isDue(row, now));
}

/** Ainda em hold. */
export function isPending(row: LedgerRow, now = Date.now()): boolean {
  if (!affectsBalance(row)) return false;
  return row.status === "pending" && !isDue(row, now);
}

export function computeBalances(rows: LedgerRow[], now = Date.now()) {
  let available = 0;
  let pending = 0;
  for (const r of rows) {
    const value = signedAmount(r);
    if (isRealized(r, now)) available += value;
    else if (isPending(r, now)) pending += value;
  }
  return { available, pending, total: available + pending };
}

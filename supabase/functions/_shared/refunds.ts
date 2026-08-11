// ─── Reembolso (Asaas) ───────────────────────────────────────────────────────
//
// Eventos oficiais de reembolso e o que cada um significa:
//   PAYMENT_REFUND_IN_PROGRESS   → reembolso agendado/em processamento. NÃO houve
//                                  devolução ainda: só auditoria, zero efeito
//                                  financeiro (nem order, entitlement, commissions,
//                                  split_entries ou wallet_ledger).
//   PAYMENT_PARTIALLY_REFUNDED   → reembolso PARCIAL concluído.
//   PAYMENT_REFUNDED             → reembolso TOTAL concluído.
//
// O tipo do reembolso é decidido pelo EVENTO + valor acumulado no banco, nunca
// por `payment.status` (que muda de forma independente e já levou o handler
// antigo a tratar "em processamento" como concluído).
//
// Cada item de `refunds[]` é um reembolso próprio, com id e valor. O array é
// CUMULATIVO: um segundo parcial reenvia o primeiro. Por isso processamos por
// ID de gateway, um a um, comparando com o que já está persistido — nunca
// usando o primeiro id como representante do array nem somando o array inteiro.

export type RefundItem = { id: string; cents: number };

/** Extrai os reembolsos do payload. Fail-closed: sem id+valor inequívocos, aborta. */
export function parseRefundItems(paymentData: any, eventType: string): RefundItem[] {
  const raw = Array.isArray(paymentData?.refunds) ? paymentData.refunds : [];
  const items: RefundItem[] = [];

  for (const r of raw) {
    // Reembolso ainda não efetivado dentro do array não vira débito.
    const status = String(r?.status || "").toUpperCase();
    if (status && status !== "DONE" && status !== "REFUNDED" && status !== "CONFIRMED") continue;

    const id = r?.id != null ? String(r.id).trim() : "";
    const value = Math.abs(Number(r?.value));
    if (!id || !Number.isFinite(value) || value <= 0) {
      // Item sem identidade ou sem valor: não há como debitar uma vez só.
      throw new Error(`refund item sem id/valor inequívocos em ${eventType}`);
    }
    items.push({ id, cents: Math.round(value * 100) });
  }

  if (items.length === 0) {
    // Nunca cair para "valor da cobrança": era exatamente o defeito P0. O
    // contrato do Asaas não garante o valor devolvido fora de `refunds[]`,
    // então preferimos retry/reconciliação a debitar um valor inventado.
    throw new Error(`refund payload sem refunds[] utilizável em ${eventType} — reconciliação pendente`);
  }
  return items;
}

export async function handleRefundInProgress(supabase: any, paymentRecord: any, paymentData: any): Promise<string> {
  if (!paymentRecord) return "NOT_FOUND";
  // Apenas trilha: o evento é uma promessa de reembolso, não um reembolso.
  console.log(
    `Refund IN_PROGRESS para pedido ${paymentRecord.order_id} (asaas payment ${paymentData?.id}) — nenhum efeito financeiro aplicado`,
  );
  return "REFUND_IN_PROGRESS";
}

export async function handleRefundCompleted(
  supabase: any,
  paymentRecord: any,
  paymentData: any,
  eventType: string,
): Promise<string> {
  if (!paymentRecord) return "NOT_FOUND";

  const chargeCents = Math.round(Number(paymentData?.value || 0) * 100);
  if (!Number.isFinite(chargeCents) || chargeCents <= 0) {
    throw new Error(`valor de cobrança ausente em ${eventType}`);
  }

  const items = parseRefundItems(paymentData, eventType);

  // O que já foi confirmado antes deste evento (array cumulativo / replay).
  const { data: persisted, error: persistedErr } = await supabase
    .from("refunds")
    .select("gateway_refund_id")
    .eq("order_id", paymentRecord.order_id)
    .eq("status", "PROCESSED");
  if (persistedErr) throw new Error(`refunds load failed: ${persistedErr.message}`);

  const known = new Set(
    (persisted || []).map((r: any) => String(r.gateway_refund_id || "")).filter(Boolean),
  );

  const pending = items.filter((i) => !known.has(i.id));
  if (pending.length === 0) {
    console.log(`Nenhum reembolso novo em ${eventType} para pedido ${paymentRecord.order_id} (replay)`);
    return "REFUND_REPLAY";
  }

  let isTotal = false;
  let accumulated = 0;

  // Um RPC por reembolso novo: cada chamada é uma transação que faz auditoria +
  // reversão proporcional + fechamento. Erro em qualquer uma propaga, o webhook
  // devolve 500 e NÃO é marcado PROCESSED — os já aplicados permanecem, e o
  // reenvio do Asaas os reconhece como conhecidos (sem duplicar).
  for (const item of pending) {
    const { data, error } = await supabase.rpc("process_refund_increment", {
      p_order_id: paymentRecord.order_id,
      p_payment_id: paymentRecord.id,
      p_gateway_refund_id: item.id,
      p_amount_cents: item.cents,
      p_charge_cents: chargeCents,
    });
    if (error) {
      throw new Error(`process_refund_increment falhou (${item.id}): ${error.message}`);
    }
    const result = (data || {}) as Record<string, unknown>;
    isTotal = Boolean(result.refund_total);
    accumulated = Number(result.accumulated_cents || 0);
    console.log(
      `Refund ${item.id} (${item.cents} centavos) aplicado no pedido ${paymentRecord.order_id}: ` +
        `outcome=${result.outcome} acumulado=${accumulated}/${chargeCents} total=${isTotal} ` +
        `estagio=${result.ledger_status} reversao=${JSON.stringify(result.split_reversal ?? {})}`,
    );

    // Reserva de segurança: process_refund_increment já reduziu
    // split_entries.creator_net (parcial) ou marcou o split 'refunded' (total).
    // A reserva é recalculada a partir do creator_net REMANESCENTE, de forma que
    //     available + reserve = creator_net_remanescente
    // continue exato após o estorno. Total ⇒ remanescente 0 ⇒ reserva zerada.
    let remainingNet = 0;
    if (!isTotal) {
      const { data: splitAfter } = await supabase
        .from("split_entries")
        .select("creator_net, status")
        .eq("order_id", paymentRecord.order_id)
        .maybeSingle();
      remainingNet = splitAfter?.status === "refunded" ? 0 : Number(splitAfter?.creator_net || 0);
    }

    const { data: reserveAdj, error: reserveAdjErr } = await supabase.rpc("reverse_reserve_entry", {
      p_order_id: paymentRecord.order_id,
      p_remaining_net_cents: remainingNet,
      p_reason: isTotal ? "refund_total" : "refund_partial",
      p_final_status: "reversed",
    });
    if (reserveAdjErr) {
      // Fail-closed: reserva desalinhada do split criaria/destruiria saldo.
      throw new Error(`reverse_reserve_entry falhou (${item.id}): ${reserveAdjErr.message}`);
    }
    console.log(
      `Reserva ajustada no pedido ${paymentRecord.order_id}: remaining_net=${remainingNet} ` +
        `resultado=${JSON.stringify(reserveAdj ?? {})}`,
    );
  }

  return isTotal ? "REFUNDED" : "PARTIALLY_REFUNDED";
}

// Auditoria de execuções de cron: lê o cron_run_id enviado por public.cron_invoke
// e fecha o registro na tabela public.cron_runs ao final da execução.
import { createClient } from "npm:@supabase/supabase-js@2";

export interface CronRunContext {
  runId: string | null;
  finish: (status: "SUCCESS" | "FAILED", metadata?: Record<string, unknown>, error?: string) => Promise<void>;
}

/**
 * Extrai o cron_run_id do header/body e devolve um contexto para fechar a execução.
 * Nunca lança: observabilidade não pode derrubar o job.
 */
export async function startCronRun(req: Request, body?: unknown): Promise<CronRunContext> {
  const fromHeader = req.headers.get("x-kivo-cron-run-id");
  const fromBody =
    body && typeof body === "object" && "cron_run_id" in (body as Record<string, unknown>)
      ? String((body as Record<string, unknown>).cron_run_id ?? "")
      : "";
  const runId = (fromHeader || fromBody || "").trim() || null;

  return {
    runId,
    finish: async (status, metadata = {}, error) => {
      if (!runId) return;
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        await supabase.rpc("cron_run_finish", {
          p_run_id: runId,
          p_status: status,
          p_error: error ?? null,
          p_metadata: metadata,
        });
      } catch (err) {
        console.error("cron_run_finish falhou:", (err as Error).message);
      }
    },
  };
}

/** Lê o body JSON sem quebrar quando vazio. */
export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

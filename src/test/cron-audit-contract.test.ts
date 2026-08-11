import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Regressão QA Onda 0 (IF-014).
 * Bug: reconcile-asaas, release-reserves e subscription-health-daily nunca
 * fechavam o registro em public.cron_runs, então cron_runs_sweep marcava
 * TIMEOUT em toda execução (falso negativo de observabilidade).
 * Contrato: toda função agendada em pg_cron precisa instrumentar startCronRun
 * e chamar finish() nos caminhos de sucesso e de erro.
 */
const SCHEDULED_FUNCTIONS = [
  "abandoned-cart-recovery",
  "event-reminders",
  "process-email-sequences",
  "process-payouts",
  "process-streaks",
  "reconcile-asaas",
  "release-holds",
  "release-reserves",
  "renew-subscriptions",
  "send-recovery-emails",
  "subscription-health-daily",
];

describe("contrato de auditoria dos jobs de cron", () => {
  for (const fn of SCHEDULED_FUNCTIONS) {
    it(`${fn} importa startCronRun e fecha o run em sucesso e erro`, () => {
      const src = readFileSync(`supabase/functions/${fn}/index.ts`, "utf-8");
      expect(src).toMatch(/from "\.\.\/_shared\/cron-run\.ts"/);
      expect(src).toMatch(/startCronRun\(/);
      expect(src).toMatch(/finish\(\s*"SUCCESS"/);
      expect(src).toMatch(/finish\(\s*"FAILED"/);
    });
  }
});

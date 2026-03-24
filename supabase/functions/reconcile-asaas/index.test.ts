import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

Deno.test("rejects without x-cron-secret", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/reconcile-asaas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  await res.text();
  assertEquals(res.status, 401);
});

Deno.test("accepts with valid x-cron-secret", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/reconcile-asaas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": CRON_SECRET,
    },
    body: "{}",
  });
  await res.text();
  assertEquals(res.status, 200);
});

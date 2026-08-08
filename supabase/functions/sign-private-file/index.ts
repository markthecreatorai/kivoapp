import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "private-files";
const EXPIRES_IN = 300; // 5 minutos

/** Extrai o caminho dentro do bucket a partir de uma URL pública/assinada ou de um path puro. */
function normalizePath(input: string): string | null {
  if (!input) return null;
  let value = input.trim();
  const marker = `${BUCKET}/`;
  const idx = value.indexOf(marker);
  if (idx >= 0) value = value.slice(idx + marker.length);
  value = value.split("?")[0];
  try {
    value = decodeURIComponent(value);
  } catch {
    // mantém como está se não for encoding válido
  }
  value = value.replace(/^\/+/, "");
  if (!value || value.includes("..")) return null;
  return value;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Não autenticado" }, 401);
  }

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    const claims = claimsData?.claims as { sub?: string; email?: string } | undefined;
    if (claimsError || !claims?.sub) {
      return json({ error: "Não autenticado" }, 401);
    }

    const userId = claims.sub;
    const email = (claims.email || "").toLowerCase();

    const body = await req.json().catch(() => ({}));
    const productId: string | undefined = body?.product_id;
    const assetId: string | undefined = body?.asset_id;
    const requestedPath = normalizePath(body?.path || body?.url || "");

    if (!requestedPath) {
      return json({ error: "Caminho do arquivo inválido" }, 400);
    }
    if (!productId && !assetId) {
      return json({ error: "Informe product_id ou asset_id" }, 400);
    }

    const admin = createClient(url, serviceKey);
    const allowedPaths = new Set<string>();

    // ─── Caminho 1: entitlement de produto ───
    if (productId) {
      if (!email) return json({ error: "Não autenticado" }, 401);

      const { data: customers } = await admin
        .from("customers")
        .select("id")
        .eq("email", email);

      const customerIds = (customers || []).map((c) => c.id);
      if (customerIds.length === 0) {
        return json({ error: "Acesso não liberado para este produto" }, 403);
      }

      const nowIso = new Date().toISOString();
      const { data: entitlements } = await admin
        .from("entitlements")
        .select("id, expires_at")
        .eq("product_id", productId)
        .in("customer_id", customerIds)
        .is("revoked_at", null);

      const active = (entitlements || []).some(
        (e) => !e.expires_at || e.expires_at > nowIso,
      );
      if (!active) {
        return json({ error: "Acesso não liberado para este produto" }, 403);
      }

      const [product, digital, contents] = await Promise.all([
        admin.from("products").select("delivery_url").eq("id", productId).maybeSingle(),
        admin.from("digital_assets").select("file_url").eq("product_id", productId),
        admin.from("member_content").select("media_url").eq("product_id", productId),
      ]);

      const candidates = [
        product.data?.delivery_url,
        ...(digital.data || []).map((d: any) => d.file_url),
        ...(contents.data || []).map((c: any) => c.media_url),
      ];
      for (const candidate of candidates) {
        const p = normalizePath(candidate || "");
        if (p) allowedPaths.add(p);
      }
    }

    // ─── Caminho 2: entitlement de asset avulso ───
    if (assetId) {
      const { data: grant } = await admin
        .from("user_asset_entitlements")
        .select("id")
        .eq("asset_id", assetId)
        .eq("user_id", userId)
        .is("revoked_at", null)
        .maybeSingle();

      if (!grant) {
        return json({ error: "Acesso não liberado para este arquivo" }, 403);
      }

      const { data: asset } = await admin
        .from("content_assets")
        .select("file_path")
        .eq("id", assetId)
        .maybeSingle();

      const p = normalizePath(asset?.file_path || "");
      if (p) allowedPaths.add(p);
    }

    if (!allowedPaths.has(requestedPath)) {
      return json({ error: "Arquivo não pertence ao conteúdo liberado" }, 403);
    }

    const { data: signed, error: signError } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(requestedPath, EXPIRES_IN);

    if (signError || !signed?.signedUrl) {
      console.error("Falha ao assinar arquivo:", signError?.message);
      return json({ error: "Não foi possível gerar o link de download" }, 500);
    }

    return json({ url: signed.signedUrl, expires_in: EXPIRES_IN });
  } catch (err) {
    console.error("sign-private-file error:", (err as Error).message);
    return json({ error: "Erro interno" }, 500);
  }
});

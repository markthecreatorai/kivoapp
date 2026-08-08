import { supabase } from "@/integrations/supabase/client";

/** Detecta se uma URL/caminho aponta para o bucket privado de entregáveis. */
export function isPrivateFileUrl(value?: string | null): boolean {
  return !!value && value.includes("private-files");
}

interface SignArgs {
  path: string;
  productId?: string;
  assetId?: string;
}

/**
 * Gera uma URL assinada de curta duração (5 min) para um arquivo do bucket
 * privado. O entitlement ativo é validado no servidor pela edge function
 * `sign-private-file` — o cliente nunca acessa o bucket diretamente.
 */
export async function getSignedPrivateUrl({ path, productId, assetId }: SignArgs): Promise<string> {
  const { data, error } = await supabase.functions.invoke("sign-private-file", {
    body: { path, product_id: productId, asset_id: assetId },
  });

  if (error) {
    const message = (data as any)?.error || error.message || "Não foi possível liberar o arquivo";
    throw new Error(message);
  }
  if (!data?.url) {
    throw new Error((data as any)?.error || "Não foi possível liberar o arquivo");
  }
  return data.url as string;
}

/**
 * Resolve uma URL de mídia: se for do bucket privado, troca por uma URL
 * assinada; caso contrário devolve a original (YouTube, Vimeo, CDN, etc).
 */
export async function resolveMediaUrl(
  url: string | null | undefined,
  opts: { productId?: string; assetId?: string },
): Promise<string | null> {
  if (!url) return null;
  if (!isPrivateFileUrl(url)) return url;
  return getSignedPrivateUrl({ path: url, productId: opts.productId, assetId: opts.assetId });
}

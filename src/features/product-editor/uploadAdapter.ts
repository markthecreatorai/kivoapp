// =============================================================
// UploadAdapter — abstração mockável para upload de imagem.
// Mantém a store/UI desacopladas de Supabase Storage, permitindo
// substituição em testes (e futura troca de provider).
// =============================================================

import { supabase } from "@/integrations/supabase/client";

export interface UploadResult {
  url: string;
}

export interface UploadAdapter {
  /**
   * Sobe um arquivo de imagem e retorna a URL pública resultante.
   * Implementações devem lançar Error com mensagem amigável.
   */
  uploadImage: (file: File, opts: { folder: string }) => Promise<UploadResult>;
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateImageFile(file: File): ValidationResult {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, reason: "Formato não suportado. Use JPG, PNG, WEBP ou GIF." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, reason: "Imagem maior que 5MB." };
  }
  return { ok: true };
}

/**
 * Valida URL de imagem (não faz fetch — apenas sintaxe).
 * Aceita http(s) e data URLs.
 */
export function validateImageUrl(value: string): ValidationResult {
  const v = value.trim();
  if (!v) return { ok: false, reason: "Informe uma URL." };
  if (v.startsWith("data:image/")) return { ok: true };
  try {
    const u = new URL(v);
    if (!/^https?:$/.test(u.protocol)) {
      return { ok: false, reason: "URL deve começar com http:// ou https://" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "URL inválida." };
  }
}

export const supabaseUploadAdapter: UploadAdapter = {
  async uploadImage(file, { folder }) {
    const check = validateImageFile(file);
    if (check.ok === false) throw new Error(check.reason);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("assets")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from("assets").getPublicUrl(path);
    return { url: data.publicUrl };
  },
};

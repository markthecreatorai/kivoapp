// =============================================================
// Supabase adapter — implementação de SaveAdapter para produção.
// Mantido isolado do reducer/store para facilitar testes.
// =============================================================

import { supabase } from "@/integrations/supabase/client";
import type { ApiProductUpdatePayload, SaveAdapter } from "./index";

export const supabaseSaveAdapter: SaveAdapter = {
  async save(productId: string, payload: ApiProductUpdatePayload) {
    const { error } = await supabase
      .from("products")
      .update(payload as any)
      .eq("id", productId);
    if (error) throw new Error(error.message);
  },
};

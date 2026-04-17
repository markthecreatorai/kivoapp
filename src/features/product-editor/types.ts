// =============================================================
// ProductEditorState — Estado canônico unificado do editor
// Single source of truth para form fields, preview e payload.
// =============================================================

export type DeliveryType = "url" | "file";
export type SaveStatus = "idle" | "saving" | "saved" | "error";
export type ProductStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

/**
 * Estado normalizado e plano. NÃO duplicar por aba.
 * Cada aba consome via selector + actions.
 */
export interface ProductEditorState {
  // ── Identidade (read-only após load) ───────────────────
  id: string;
  workspaceId: string;
  formatId: string;
  status: ProductStatus;

  // ── Aba Visual ─────────────────────────────────────────
  thumbnailUrl: string;

  // ── Aba Conteúdo ───────────────────────────────────────
  name: string;
  shortDescription: string;
  ctaText: string;

  // ── Aba Configuração ───────────────────────────────────
  deliveryType: DeliveryType;
  deliveryUrl: string;
  deliveryFileUrl: string;
  confirmationSubject: string;
  confirmationBody: string;

  // ── Meta de runtime (não persistido como campo de produto) ──
  meta: {
    isDirty: boolean;
    saveStatus: SaveStatus;
    lastSavedAt: number | null;
    lastError: string | null;
  };
}

/**
 * Shape parcial vindo da API (Supabase products row).
 * Usamos um tipo flexível pois a tabela tem muitos campos
 * irrelevantes para o editor.
 */
export interface ApiProductRow {
  id: string;
  workspace_id: string;
  type: string;
  status?: string | null;
  name?: string | null;
  short_description?: string | null;
  thumbnail_url?: string | null;
  listing_button_text?: string | null;
  delivery_mode?: string | null;
  delivery_url?: string | null;
  confirmation_email_subject?: string | null;
  confirmation_email_body?: string | null;
  metadata?: Record<string, any> | null;
}

/**
 * Payload enviado em UPDATE products. Apenas os campos
 * efetivamente editáveis pelo editor.
 */
export interface ApiProductUpdatePayload {
  name: string;
  short_description: string;
  thumbnail_url: string;
  listing_button_text: string;
  delivery_mode: DeliveryType;
  delivery_url: string;
  confirmation_email_subject: string;
  confirmation_email_body: string;
  status?: ProductStatus;
  metadata?: Record<string, any>;
}

// ── Actions (reducer-style) ─────────────────────────────
export type EditorAction =
  | { type: "HYDRATE"; payload: ProductEditorState }
  | { type: "PATCH_FIELDS"; payload: Partial<Omit<ProductEditorState, "id" | "workspaceId" | "formatId" | "meta">> }
  | { type: "SET_SAVE_STATUS"; payload: { status: SaveStatus; error?: string | null } }
  | { type: "MARK_SAVED"; payload: { at: number } }
  | { type: "SET_STATUS"; payload: ProductStatus }
  | { type: "RESET_DIRTY" };

// =============================================================
// PreviewSurface — markup isolado e testável do preview do
// editor de Lead Magnet, com TODOS os `data-testid` exigidos
// pela Binding Matrix. Usado pelo teste de paridade e pode ser
// embedado pelo CollectEmailsFlow para reuso.
// =============================================================

import { Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FormField } from "./formFieldsSchema";
import type { PreviewSurface as Surface } from "./bindingMatrix";

export interface PreviewSurfaceProps {
  surface: Surface;
  thumbnailUrl: string;
  name: string;
  shortDescription: string;
  ctaText: string;
  formFields: FormField[];
  /** Para Lead Magnet, sempre true. */
  isLeadMagnet?: boolean;
}

/**
 * Componente puro — sem efeitos, sem provider, 100% derivado de props.
 * Cada elemento expõe `data-testid` listado em BINDING_MATRIX.
 */
export function PreviewSurface(props: PreviewSurfaceProps) {
  const {
    surface,
    thumbnailUrl,
    name,
    shortDescription,
    ctaText,
    formFields,
    isLeadMagnet = true,
  } = props;

  // CTA fallback varia por aba (alinhado ao MobilePreview real)
  const ctaFallback = surface === "config" ? "Enviar" : "Inscrever";
  const subtitleFallback =
    surface === "conteudo"
      ? "Breve descrição sobre o que será entregue."
      : "Breve descrição";

  return (
    <div data-testid={`surface-${surface}`}>
      {/* ── Thumbnail ──────────────────────────────────── */}
      <div data-testid="preview-thumb" className="relative">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" className="block w-full" />
        ) : (
          <ImageIcon data-testid="icon-fallback" className="h-8 w-8" />
        )}
      </div>

      {/* ── Título ─────────────────────────────────────── */}
      <p data-testid="preview-title" className="font-bold">
        {name || "Título aqui"}
      </p>

      {/* ── Subtítulo ──────────────────────────────────── */}
      <p data-testid="preview-subtitle" className="text-sm">
        {shortDescription || subtitleFallback}
      </p>

      {/* ── Free badge (apenas Lead Magnet, surface=config) ── */}
      {surface === "config" && isLeadMagnet && (
        <div data-testid="preview-free-badge" className="text-primary">
          Grátis
        </div>
      )}

      {/* ── Form fields (apenas surface=config) ──────────── */}
      {surface === "config" && (
        <div className="space-y-2">
          {formFields.map((f) => (
            <div
              key={f.id}
              data-testid={`preview-${f.field_key}`}
              data-field-type={f.field_type}
              data-required={f.is_required}
            >
              <span>{f.label}</span>
              {f.field_type === "dropdown" && (
                <span data-testid={`preview-${f.field_key}-dropdown`}>
                  {f.options?.[0] ?? "Selecione…"}
                </span>
              )}
              {(f.field_type === "checkboxes" ||
                f.field_type === "multiple_choice") && (
                <ul data-testid={`preview-${f.field_key}-options`}>
                  {(f.options ?? []).map((opt, i) => (
                    <li
                      key={i}
                      className={cn(
                        f.field_type === "multiple_choice"
                          ? "radio"
                          : "checkbox",
                      )}
                    >
                      {opt}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── CTA ────────────────────────────────────────── */}
      <div data-testid="preview-cta">{ctaText || ctaFallback}</div>
    </div>
  );
}

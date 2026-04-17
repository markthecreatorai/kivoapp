// =============================================================
// Schema central de validação da aba Conteúdo (Lead Magnet).
// Usado pela UI (mensagens inline) e pelos guards de avanço/
// publicação. Mensagens em pt-BR.
// =============================================================

import { z } from "zod";

export const CONTENT_LIMITS = {
  name: 50,
  shortDescription: 100,
  ctaText: 30,
} as const;

// Mensagens i18n pt-BR (centralizadas para reuso em testes e UI)
export const CONTENT_MESSAGES = {
  name: {
    required: "O título principal é obrigatório.",
    max: `O título deve ter no máximo ${CONTENT_LIMITS.name} caracteres.`,
  },
  shortDescription: {
    max: `O subtítulo deve ter no máximo ${CONTENT_LIMITS.shortDescription} caracteres.`,
  },
  ctaText: {
    required: "O texto do botão é obrigatório.",
    max: `O texto do botão deve ter no máximo ${CONTENT_LIMITS.ctaText} caracteres.`,
  },
} as const;

export const contentTabSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: CONTENT_MESSAGES.name.required })
    .max(CONTENT_LIMITS.name, { message: CONTENT_MESSAGES.name.max }),
  shortDescription: z
    .string()
    .max(CONTENT_LIMITS.shortDescription, {
      message: CONTENT_MESSAGES.shortDescription.max,
    })
    .optional()
    .default(""),
  ctaText: z
    .string()
    .trim()
    .min(1, { message: CONTENT_MESSAGES.ctaText.required })
    .max(CONTENT_LIMITS.ctaText, { message: CONTENT_MESSAGES.ctaText.max }),
});

export type ContentTabInput = z.input<typeof contentTabSchema>;
export type ContentTabValues = z.output<typeof contentTabSchema>;

export type ContentFieldErrors = Partial<
  Record<keyof ContentTabInput, string>
>;

/**
 * Valida e devolve um mapa pronto para consumo pela UI.
 * - Errors por campo (inline)
 * - isValid agregando os 3 campos
 * Não lança — sempre retorna shape consistente.
 */
export function validateContentTab(input: ContentTabInput): {
  isValid: boolean;
  errors: ContentFieldErrors;
} {
  const result = contentTabSchema.safeParse(input);
  if (result.success) return { isValid: true, errors: {} };

  const errors: ContentFieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof ContentTabInput | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { isValid: false, errors };
}

// =============================================================
// LegacyProductEditorProvider
//
// Wrapper no-op usado quando a flag `lm_v2_state` está OFF.
// Existe para manter o tree de Providers estável (mesmo número
// de níveis) entre os dois modos, evitando re-mount destrutivo
// ao alternar a flag em runtime.
//
// Não expõe contexto: os flows legados consomem `initialProduct`
// direto via prop e fazem suas próprias persistências (caminho
// pré-v2). O componente de fallback (CollectEmailsFlowLegacy)
// renderiza um aviso read-only para evitar perda silenciosa.
// =============================================================

import type { ReactNode } from "react";

export function LegacyProductEditorProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

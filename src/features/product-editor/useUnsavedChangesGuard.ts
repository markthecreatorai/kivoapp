// =============================================================
// useUnsavedChangesGuard — alerta antes de fechar/sair com
// alterações não salvas. Cobre:
//   1) navegação do navegador (beforeunload)
//   2) cliques internos do app via event delegation em <a>
// =============================================================

import { useEffect } from "react";
import { useProductEditor } from "./store";

const MSG = "Você tem alterações não salvas. Deseja sair mesmo assim?";

export function useUnsavedChangesGuard() {
  const { state } = useProductEditor();
  const isDirty = state.meta.isDirty;

  useEffect(() => {
    if (!isDirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = MSG;
      return MSG;
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);
}

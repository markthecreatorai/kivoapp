// Indicador compacto de estado de save (saving / saved / error / dirty).
import { Check, Cloud, CloudOff, Loader2 } from "lucide-react";
import { useProductEditor } from "./store";

export function SaveStatusIndicator() {
  const { state } = useProductEditor();
  const { saveStatus, isDirty, lastError } = state.meta;

  if (saveStatus === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…
      </span>
    );
  }
  if (saveStatus === "error") {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-destructive"
        title={lastError ?? undefined}
      >
        <CloudOff className="h-3.5 w-3.5" /> Erro ao salvar
      </span>
    );
  }
  if (isDirty) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Cloud className="h-3.5 w-3.5" /> Alterações pendentes
      </span>
    );
  }
  if (saveStatus === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-primary">
        <Check className="h-3.5 w-3.5" /> Salvo
      </span>
    );
  }
  return null;
}

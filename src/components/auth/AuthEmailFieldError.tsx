import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface Props {
  error: string | null;
  suggestion: string | null;
  /** Chamado quando o usuário aceita a sugestão. Recebe o email corrigido. */
  onAcceptSuggestion?: (corrected: string) => void;
  className?: string;
}

/**
 * Mensagem de erro inline para forms de auth.
 * Mostra "Você quis dizer X?" quando há sugestão de typo.
 */
export function AuthEmailFieldError({
  error,
  suggestion,
  onAcceptSuggestion,
  className,
}: Props) {
  if (!error) return null;
  return (
    <div
      className={`flex items-start gap-1.5 text-xs text-destructive ${className || ""}`}
      role="alert"
      aria-live="polite"
    >
      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p>{error}</p>
        {suggestion && (
          <p className="text-muted-foreground">
            Você quis dizer{" "}
            {onAcceptSuggestion ? (
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-xs font-medium text-primary"
                onClick={() => onAcceptSuggestion(suggestion)}
              >
                {suggestion}
              </Button>
            ) : (
              <span className="font-medium text-primary">{suggestion}</span>
            )}
            ?
          </p>
        )}
      </div>
    </div>
  );
}

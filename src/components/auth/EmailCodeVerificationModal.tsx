import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import {
  requestVerificationCode,
  verifyEmailCode,
  type AccountTypeInput,
  type VerifyCodeResult,
} from "@/lib/authVerification";

interface Props {
  open: boolean;
  email: string;
  accountType: AccountTypeInput;
  flowOrigin: "producer" | "circles";
  returnTarget?: string | null;
  /** Chamado após o e-mail ser confirmado com sucesso. */
  onVerified: (result: Extract<VerifyCodeResult, { kind: "verified" }>) => void;
  onUseAnotherEmail: () => void;
  initialCooldown?: number;
}

const CODE_LENGTH = 4;

export default function EmailCodeVerificationModal({
  open,
  email,
  accountType,
  flowOrigin,
  returnTarget,
  onVerified,
  onUseAnotherEmail,
  initialCooldown = 60,
}: Props) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [status, setStatus] = useState<"idle" | "verifying" | "success">("idle");
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(initialCooldown);
  const [resending, setResending] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const submittedRef = useRef("");

  useEffect(() => {
    if (!open) return;
    setDigits(Array(CODE_LENGTH).fill(""));
    setError("");
    setStatus("idle");
    submittedRef.current = "";
    setTimeout(() => inputs.current[0]?.focus(), 60);
  }, [open]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const code = digits.join("");

  const submit = async (value: string) => {
    if (value.length !== CODE_LENGTH || submittedRef.current === value) return;
    submittedRef.current = value;
    setStatus("verifying");
    setError("");
    const result = await verifyEmailCode(email, value);
    if (result.kind === "verified") {
      setStatus("success");
      onVerified(result);
      return;
    }
    setStatus("idle");
    setDigits(Array(CODE_LENGTH).fill(""));
    submittedRef.current = "";
    setTimeout(() => inputs.current[0]?.focus(), 40);
    switch (result.kind) {
      case "invalid":
        setError(
          result.attemptsLeft > 0
            ? `Código incorreto. Você ainda tem ${result.attemptsLeft} tentativa(s).`
            : "Código incorreto.",
        );
        break;
      case "expired":
        setError("Esse código expirou. Peça um novo código abaixo.");
        break;
      case "blocked":
        setError("Muitas tentativas. Solicite um novo código para continuar.");
        break;
      case "rate_limited":
        setError("Muitas tentativas em pouco tempo. Aguarde alguns minutos.");
        break;
      default:
        setError("Não foi possível validar o código. Tente novamente.");
    }
  };

  const setDigit = (index: number, value: string) => {
    const clean = value.replace(/\D/g, "");
    if (!clean) {
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      return;
    }
    // Colagem dos 4 dígitos de uma vez
    if (clean.length > 1) {
      const next = Array(CODE_LENGTH).fill("");
      clean.slice(0, CODE_LENGTH).split("").forEach((d, i) => (next[i] = d));
      setDigits(next);
      const filled = next.join("");
      inputs.current[Math.min(clean.length, CODE_LENGTH - 1)]?.focus();
      if (filled.length === CODE_LENGTH) void submit(filled);
      return;
    }
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    if (index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
    if (next.every((d) => d !== "")) void submit(next.join(""));
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      e.preventDefault();
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
      inputs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) inputs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError("");
    const result = await requestVerificationCode({
      email,
      accountType,
      flowOrigin,
      returnTarget,
      mode: "resend",
    });
    setResending(false);
    if (result.kind === "code_sent") {
      setCooldown(result.cooldownSeconds);
      setDigits(Array(CODE_LENGTH).fill(""));
      submittedRef.current = "";
      inputs.current[0]?.focus();
    } else if (result.kind === "cooldown") {
      setCooldown(result.retryAfterSeconds);
    } else if (result.kind === "rate_limited") {
      setError("Limite de reenvios atingido. Tente novamente mais tarde.");
    } else {
      setError("Não foi possível reenviar o código agora.");
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md [&>button]:hidden">
        <DialogHeader className="text-center space-y-3">
          <div className="mx-auto p-3 rounded-full bg-primary/10 w-fit">
            <Mail className="w-6 h-6 text-primary" />
          </div>
          <DialogTitle className="text-xl">Confirme seu e-mail</DialogTitle>
          <DialogDescription>
            Enviamos um código de 4 dígitos para <span className="font-medium text-foreground">{email}</span>.
            Ele expira em 10 minutos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <div
            className="flex justify-center gap-3"
            role="group"
            aria-label="Código de verificação de 4 dígitos"
          >
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => (inputs.current[i] = el)}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label={`Dígito ${i + 1} de ${CODE_LENGTH}`}
                maxLength={CODE_LENGTH}
                value={digit}
                disabled={status !== "idle"}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className="w-14 h-16 text-center text-2xl font-semibold rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
            ))}
          </div>

          {status === "verifying" && (
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="w-4 h-4 animate-spin" /> Verificando código...
            </p>
          )}

          {status === "success" && (
            <p className="flex items-center justify-center gap-2 text-sm text-primary" role="status">
              <ShieldCheck className="w-4 h-4" /> E-mail confirmado! Entrando...
            </p>
          )}

          {error && (
            <p className="text-sm text-destructive text-center" role="alert">
              {error}
            </p>
          )}

          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={handleResend}
              disabled={cooldown > 0 || resending || status !== "idle"}
            >
              <RefreshCw className={`w-4 h-4 ${resending ? "animate-spin" : ""}`} />
              {cooldown > 0 ? `Reenviar código em ${cooldown}s` : resending ? "Reenviando..." : "Reenviar código"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={onUseAnotherEmail}
              disabled={status === "verifying"}
            >
              Usar outro e-mail
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Não enviamos links de acesso por e-mail — apenas este código. Nunca compartilhe seu código.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

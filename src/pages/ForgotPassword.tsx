import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import kivoLogo from "@/assets/kivo-logo.svg";
import { AuthEmailFieldError } from "@/components/auth/AuthEmailFieldError";
import { useAuthEmailGuard } from "@/hooks/useAuthEmailGuard";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { toast } = useToast();
  const { emailError, suggestion, guard, reset } = useAuthEmailGuard("forgot_password");

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailCheck = guard(email);
    if (!emailCheck.ok) {
      toast({ title: "Email inválido", description: emailCheck.error, variant: "destructive" });
      return;
    }
    setEmail(emailCheck.email);
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailCheck.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        toast({
          title: "Erro",
          description: error.message,
          variant: "destructive",
        });
      } else {
        setEmailSent(true);
        toast({
          title: "Email enviado!",
          description: "Verifique sua caixa de entrada para redefinir sua senha",
        });
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Ocorreu um erro inesperado",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-muted/30">
        <Card className="w-full max-w-md card-radius shadow-sm border">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-primary">Email enviado!</CardTitle>
            <CardDescription>
              Verifique sua caixa de entrada
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-muted-foreground">
              Enviamos um link de redefinição de senha para <strong>{email}</strong>.
              Clique no link no email para criar uma nova senha.
            </p>
            
            <p className="text-sm text-muted-foreground">
              Não recebeu o email? Verifique sua pasta de spam ou tente novamente.
            </p>

            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full pill-radius"
                onClick={() => setEmailSent(false)}
              >
                Tentar outro email
              </Button>
              
              <Link to="/login">
                <Button variant="ghost" className="w-full">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar ao login
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-muted/30">
      <div className="w-full max-w-md space-y-6">
        {/* Logo/Brand */}
        <div className="text-center flex justify-center">
          <img src={kivoLogo} alt="Kivo" className="h-10" />
        </div>

        <Card className="card-radius shadow-sm border">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Esqueceu sua senha?</CardTitle>
            <CardDescription>
              Digite seu email e enviaremos um link para redefinir sua senha
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); reset(); }}
                  className="input-radius"
                  required
                />
                <AuthEmailFieldError error={emailError} suggestion={suggestion} onAcceptSuggestion={(corrected) => { setEmail(corrected); reset(); }} />
              </div>

              <Button
                type="submit"
                className="w-full pill-radius"
                disabled={isLoading}
              >
                {isLoading ? "Enviando..." : "Enviar link de redefinição"}
              </Button>
            </form>

            <div className="text-center">
              <Link to="/login">
                <Button variant="ghost" className="w-full">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar ao login
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import kivoLogo from "@/assets/kivo-logo.svg";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidRecovery, setIsValidRecovery] = useState(false);
  const [checking, setChecking] = useState(true);
  const [zxcvbnFn, setZxcvbnFn] = useState<null | ((password: string) => any)>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;
    import("zxcvbn")
      .then((mod) => {
        if (mounted) setZxcvbnFn(() => mod.default);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  const passwordStrength = useMemo(() => {
    if (!password || !zxcvbnFn) return null;
    return zxcvbnFn(password);
  }, [password, zxcvbnFn]);
  const strengthLabels = ["Muito fraca", "Fraca", "Regular", "Boa", "Muito forte"];

  useEffect(() => {
    // Supabase sends recovery tokens in the hash fragment: #type=recovery&access_token=...
    // The onAuthStateChange listener will fire PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsValidRecovery(true);
        setChecking(false);
      }
    });

    // Also check hash fragment directly as fallback
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const type = params.get("type");

    if (type === "recovery") {
      // Supabase will auto-exchange the token — wait for the auth event
      // Give it a moment to process
      const timeout = setTimeout(() => {
        if (!mounted) return;
        // If we have hash type=recovery, trust it even if event hasn't fired yet
        setIsValidRecovery(true);
        setChecking(false);
      }, 2000);

      let mounted = true;
      return () => {
        mounted = false;
        clearTimeout(timeout);
        subscription.unsubscribe();
      };
    } else {
      // No recovery type — check query params as well (edge case)
      const queryType = new URLSearchParams(window.location.search).get("type");
      if (queryType === "recovery") {
        setIsValidRecovery(true);
        setChecking(false);
      } else {
        // Not a valid recovery link
        setChecking(false);
      }
    }

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Redirect if not a valid recovery
  useEffect(() => {
    if (!checking && !isValidRecovery) {
      navigate("/login", { replace: true });
    }
  }, [checking, isValidRecovery, navigate]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        title: "Senhas não conferem",
        description: "Digite a mesma senha nos dois campos",
        variant: "destructive",
      });
      return;
    }

    if (passwordStrength && passwordStrength.score < 2) {
      toast({
        title: "Senha muito fraca",
        description: "Por favor, escolha uma senha mais forte",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        toast({
          title: "Erro",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Senha redefinida!",
          description: "Sua senha foi atualizada com sucesso",
        });
        navigate('/dashboard', { replace: true });
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

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isValidRecovery) {
    return null; // Will redirect via useEffect
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
            <CardTitle className="text-2xl">Nova senha</CardTitle>
            <CardDescription>
              Crie uma senha forte para sua conta
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nova senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Digite sua nova senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-radius pr-10"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                
                {password && passwordStrength && (
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Progress 
                        value={(passwordStrength.score + 1) * 20} 
                        className="flex-1 h-2"
                      />
                      <span className="text-xs text-muted-foreground">
                        {strengthLabels[passwordStrength.score]}
                      </span>
                    </div>
                    {passwordStrength.feedback.suggestions.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {passwordStrength.feedback.suggestions[0]}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Digite novamente sua senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-radius pr-10"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-destructive">
                    As senhas não conferem
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full pill-radius"
                disabled={isLoading || password !== confirmPassword}
              >
                {isLoading ? "Atualizando..." : "Redefinir senha"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
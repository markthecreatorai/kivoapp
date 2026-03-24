import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import zxcvbn from "zxcvbn";
import { Progress } from "@/components/ui/progress";

export default function Signup() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  // Handle OAuth error callback
  useEffect(() => {
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");
    if (error) {
      toast({
        title: "Erro na autenticação com Google",
        description: errorDescription || "Não foi possível criar conta com Google. Tente novamente.",
        variant: "destructive",
      });
    }
  }, [searchParams]);

  // Password strength analysis
  const passwordStrength = password ? zxcvbn(password) : null;
  const strengthColors = ["bg-destructive", "bg-orange-500", "bg-yellow-500", "bg-orange-400", "bg-accent"];
  const strengthLabels = ["Muito fraca", "Fraca", "Regular", "Boa", "Muito forte"];

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!acceptedTerms) {
      toast({
        title: "Termos de uso",
        description: "Você precisa aceitar os termos de uso e política de privacidade",
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
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
          emailRedirectTo: `${window.location.origin}/onboarding`,
        },
      });

      if (error) {
        toast({
          title: "Erro no cadastro",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Conta criada!",
          description: "Verifique seu email para confirmar a conta e continue",
        });
        navigate("/onboarding");
      }
    } catch (error) {
      toast({
        title: "Erro no cadastro",
        description: "Ocorreu um erro inesperado",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/onboarding`,
        },
      });

      if (error) {
        toast({
          title: "Erro no cadastro com Google",
          description: error.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro no cadastro com Google",
        description: "Ocorreu um erro inesperado",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Signup form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6">
          {/* Logo/Brand */}
          <div className="text-center">
            <h1 className="text-3xl font-bold text-primary">Kivo</h1>
            <p className="text-muted-foreground mt-2">
              Sua plataforma all-in-one para vender produtos digitais
            </p>
          </div>

          <Card className="card-radius shadow-sm border">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Criar sua conta</CardTitle>
              <CardDescription>
                Comece grátis hoje mesmo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                variant="outline"
                className="w-full pill-radius"
                onClick={handleGoogleSignup}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Entrar com Google
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator className="w-full" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Ou cadastre-se com email
                  </span>
                </div>
              </div>

              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nome completo</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="Seu nome completo"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="input-radius"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-radius"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Crie uma senha forte"
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
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  
                  {/* Password strength indicator */}
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

                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="terms"
                    checked={acceptedTerms}
                    onCheckedChange={(checked) => setAcceptedTerms(checked as boolean)}
                    className="mt-0.5"
                  />
                  <label htmlFor="terms" className="text-sm text-muted-foreground leading-5">
                    Aceito os{" "}
                    <Link to="/terms" className="text-primary hover:underline">
                      Termos de Uso
                    </Link>{" "}
                    e{" "}
                    <Link to="/privacy" className="text-primary hover:underline">
                      Política de Privacidade
                    </Link>
                  </label>
                </div>

                <Button
                  type="submit"
                  className="w-full pill-radius"
                  disabled={isLoading || !acceptedTerms}
                >
                  {isLoading ? "Criando conta..." : "Criar minha conta grátis"}
                </Button>
              </form>

              <div className="text-center text-sm">
                <span className="text-muted-foreground">Já tem uma conta? </span>
                <Link to="/login" className="text-primary hover:underline">
                  Fazer login
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Right side - Gradient/Image */}
      <div className="hidden lg:flex flex-1 kivo-gradient items-center justify-center text-white p-8">
        <div className="max-w-md text-center">
          <h2 className="text-3xl font-bold mb-4">
            Junte-se a milhares de creators
          </h2>
          <p className="text-lg opacity-90">
            Crie sua loja digital em minutos e comece a vender hoje mesmo.
          </p>
          
          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-start space-x-3">
              <Check className="h-5 w-5 text-accent" />
              <span>Setup em menos de 5 minutos</span>
            </div>
            <div className="flex items-center justify-start space-x-3">
              <Check className="h-5 w-5 text-accent" />
              <span>Sem taxas mensais</span>
            </div>
            <div className="flex items-center justify-start space-x-3">
              <Check className="h-5 w-5 text-accent" />
              <span>Suporte 24/7 em português</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Mail, Lock, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AuthEmailFieldError } from "@/components/auth/AuthEmailFieldError";
import { useAuthEmailGuard } from "@/hooks/useAuthEmailGuard";

export default function MemberLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const { emailError, suggestion, guard, reset } = useAuthEmailGuard("member_login");

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailCheck = guard(email);
    if (!emailCheck.ok) {
      setError(emailCheck.error || "Email inválido");
      return;
    }
    setEmail(emailCheck.email);
    setLoading(true);
    setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email: emailCheck.email, password });
    if (authError) {
      setError(authError.message === "Invalid login credentials" 
        ? "Email ou senha incorretos" 
        : authError.message);
    } else {
      navigate("/member");
    }
    setLoading(false);
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailCheck = guard(email);
    if (!emailCheck.ok) { setError(emailCheck.error || "Digite seu email"); return; }
    setEmail(emailCheck.email);
    setLoading(true);
    setError("");
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: emailCheck.email,
      options: { emailRedirectTo: `${window.location.origin}/member` },
    });
    if (authError) {
      setError(authError.message);
    } else {
      setMagicLinkSent(true);
    }
    setLoading(false);
  };

  if (magicLinkSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Link enviado!</h1>
          <p className="text-sm text-muted-foreground">
            Enviamos um link de acesso para <strong>{email}</strong>. Verifique sua caixa de entrada.
          </p>
          <Button variant="ghost" onClick={() => setMagicLinkSent(false)} className="text-sm">
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="max-w-sm w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Área de Membros</h1>
          <p className="text-sm text-muted-foreground">Acesse seus cursos e conteúdos</p>
        </div>

        <div className="bg-card rounded-xl border p-6">
          <Tabs defaultValue="magic" className="w-full">
            <TabsList className="w-full grid grid-cols-2 mb-4">
              <TabsTrigger value="magic" className="text-xs">Magic Link</TabsTrigger>
              <TabsTrigger value="password" className="text-xs">Email & Senha</TabsTrigger>
            </TabsList>

            <TabsContent value="magic">
              <form onSubmit={handleMagicLink} className="space-y-4">
                <div className="space-y-1">
                  <Label className="text-sm">Email</Label>
                  <Input
                    type="email"
                    value={email}
                     onChange={(e) => { setEmail(e.target.value); reset(); setError(""); }}
                    placeholder="seu@email.com"
                    className="h-12"
                  />
                   <AuthEmailFieldError error={emailError} suggestion={suggestion} onAcceptSuggestion={(corrected) => { setEmail(corrected); reset(); setError(""); }} />
                </div>
                <Button type="submit" disabled={loading} className="w-full h-12 font-semibold">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <><Mail className="w-4 h-4" /> Enviar link de acesso</>
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="password">
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div className="space-y-1">
                  <Label className="text-sm">Email</Label>
                  <Input
                    type="email"
                    value={email}
                     onChange={(e) => { setEmail(e.target.value); reset(); setError(""); }}
                    placeholder="seu@email.com"
                    className="h-12"
                  />
                   <AuthEmailFieldError error={emailError} suggestion={suggestion} onAcceptSuggestion={(corrected) => { setEmail(corrected); reset(); setError(""); }} />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">Senha</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-12"
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full h-12 font-semibold">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <><Lock className="w-4 h-4" /> Entrar</>
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
          {error && <p className="text-sm text-destructive text-center mt-3">{error}</p>}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Feito com 💜 na{" "}
          <a href="https://kivohub.com.br" className="text-primary hover:underline">Kivo</a>
        </p>
      </div>
    </div>
  );
}

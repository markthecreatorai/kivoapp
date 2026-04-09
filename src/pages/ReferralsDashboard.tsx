import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import {
  Copy, CopyCheck, AlertCircle, Users, DollarSign,
  TrendingUp, Link2, Heart, Play, Zap, Gift, Mail
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ReferralProfile {
  id: string;
  referral_code: string;
  referral_link: string;
  status: string;
}

// Plans the referred user might subscribe to
const KIVO_PLANS = [
  { name: "Starter", price: 97 },
  { name: "Pro", price: 197 },
  { name: "Scale", price: 397 },
];

const COMMISSION_RATE = 0.20; // 20% lifetime commission

export default function ReferralsDashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ReferralProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [customCode, setCustomCode] = useState("");

  // Calculator state
  const [referralCount, setReferralCount] = useState(5);
  const [selectedPlan, setSelectedPlan] = useState(KIVO_PLANS[1]); // defaults to Pro

  const monthlyEarnings = referralCount * selectedPlan.price * COMMISSION_RATE;
  const yearlyEarnings = monthlyEarnings * 12;
  const perReferral = selectedPlan.price * COMMISSION_RATE;

  useEffect(() => {
    if (user) loadProfile();
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("referral_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!error && data) {
        setProfile(data as ReferralProfile);
        setCustomCode(data.referral_code);
      } else {
        // Auto-create referral profile
        const baseName =
          user.user_metadata?.full_name?.split(" ")[0]?.toLowerCase() ||
          user.email?.split("@")[0]?.toLowerCase() ||
          "creator";
        const code = `${baseName}${Math.floor(Math.random() * 1000)}`.replace(/[^a-z0-9-]/g, "");
        const link = `${window.location.origin}/?ref=${code}`;
        
        const { data: newProfile, error: insertError } = await supabase
          .from("referral_profiles")
          .insert({ user_id: user.id, referral_code: code, referral_link: link })
          .select()
          .single();

        if (!insertError && newProfile) {
          setProfile(newProfile as ReferralProfile);
          setCustomCode(newProfile.referral_code);
        } else {
          setCustomCode(code);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCode = async () => {
    if (!user || !customCode) return;
    setCreating(true);
    const cleanCode = customCode.toLowerCase().replace(/[^a-z0-9-]/g, "");
    const link = `${window.location.origin}/?ref=${cleanCode}`;
    try {
      const { data, error } = await supabase
        .from("referral_profiles")
        .insert({ user_id: user.id, referral_code: cleanCode, referral_link: link })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") {
          toast.error("Este código já está em uso. Escolha outro.");
        } else {
          toast.error("Erro ao criar código: " + error.message);
        }
      } else if (data) {
        setProfile(data as ReferralProfile);
        toast.success("Link de indicação ativado com sucesso!");
      }
    } catch {
      toast.error("Erro inesperado ao criar perfil de afiliado.");
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = () => {
    if (!profile) return;
    const dynamicLink = `${window.location.origin}/?ref=${profile.referral_code}`;
    navigator.clipboard.writeText(dynamicLink);
    setCopied(true);
    toast.success("Link copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return null;

  return (
    <div className="w-full min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Indicações</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Indique a Kivo e ganhe <strong className="text-foreground">20% de comissão</strong> enquanto o indicado for cliente.
            </p>
          </div>
          {profile && (
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-2 text-sm font-medium text-primary bg-primary/10 border border-primary/20 px-4 py-2 rounded-full hover:bg-primary/15 transition-colors self-start sm:self-auto"
            >
              {copied ? <CopyCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span className="font-mono truncate max-w-[200px]">
                {`${window.location.host}/?ref=${profile.referral_code}`}
              </span>
            </button>
          )}
        </div>

        {/* ── Banner: sem link ── */}
        {!profile && (
          <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/30 text-amber-800 dark:text-amber-400 p-4 rounded-xl text-sm font-medium">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            Você ainda não tem um link de indicação. Crie o seu abaixo para começar a ganhar.
          </div>
        )}

        {/* ── Hero card ── */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col md:flex-row shadow-sm">
          <div className="flex-1 p-8 md:p-10 space-y-4 flex flex-col justify-center">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full w-fit">
              <Gift className="w-3.5 h-3.5" /> Programa de Indicações
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-foreground leading-[1.15] tracking-tight">
              Ganhe <span className="text-primary">20% de comissão</span> por cada indicação — para sempre.
            </h2>
            <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
              Enquanto seu indicado for assinante da Kivo, você recebe. Lifetime. Sem teto. Sem prazo de expiração.
            </p>
            <div className="flex items-center gap-6 pt-2">
              {[
                { icon: Zap, label: "Comissão automática" },
                { icon: TrendingUp, label: "Receita recorrente" },
                { icon: Users, label: "Sem limite de indicados" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-1.5 text-center">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground leading-tight">{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="w-full md:w-[42%] h-56 md:h-auto bg-muted relative group overflow-hidden flex-shrink-0">
            <img
              src="https://images.unsplash.com/photo-1573164713988-8665fc963095?auto=format&fit=crop&q=80&w=900"
              alt="Indicações"
              className="w-full h-full object-cover opacity-80 transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
              <button className="w-14 h-14 bg-white/25 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/35 transition-colors shadow-xl">
                <Play className="w-5 h-5 ml-0.5" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Main 2-col: link + calculator ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Link Section ── */}
          <div className="rounded-2xl border border-border bg-card shadow-sm p-6 md:p-8 flex flex-col gap-6">
            <div>
              <h3 className="text-lg font-bold text-foreground">Seu link de indicação</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Compartilhe com outros criadores e ganhe por cada assinatura gerada.
              </p>
            </div>

            {!profile ? (
              <div className="space-y-4 flex-1 flex flex-col justify-center">
                <div className="space-y-2">
                  <Label className="font-semibold">Personalize seu código único</Label>
                  <div className="flex items-center rounded-lg border border-input bg-background overflow-hidden focus-within:ring-1 focus-within:ring-ring">
                    <span className="pl-3 pr-1 text-sm text-muted-foreground whitespace-nowrap select-none">
                      kivo.com/?ref=
                    </span>
                    <input
                      className="flex-1 h-11 bg-transparent text-sm text-foreground font-mono px-1 focus:outline-none"
                      value={customCode}
                      onChange={(e) =>
                        setCustomCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                      }
                      placeholder="seu-codigo"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Apenas letras minúsculas, números e hífens.
                  </p>
                </div>
                <Button
                  onClick={handleCreateCode}
                  disabled={creating || !customCode.trim()}
                  className="w-full h-11 text-sm font-semibold"
                >
                  {creating ? "Ativando..." : "Ativar meu link de indicação"}
                </Button>
              </div>
            ) : (
              <div className="space-y-5 flex-1 flex flex-col">
                {/* Link pill */}
                <div className="flex items-center gap-2 bg-muted rounded-xl border border-border p-1.5">
                  <div className="flex-1 px-3 py-2 font-mono text-sm text-foreground truncate select-all">
                    {`${window.location.origin}/?ref=${profile.referral_code}`}
                  </div>
                  <Button
                    onClick={copyToClipboard}
                    size="sm"
                    className="shrink-0 gap-1.5 rounded-lg"
                  >
                    {copied ? <CopyCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copiado!" : "Copiar"}
                  </Button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Cliques no link", value: "0", sub: "este mês" },
                    { label: "Indicados pagantes", value: "0", sub: "ativos agora", highlight: true },
                  ].map(({ label, value, sub, highlight }) => (
                    <div
                      key={label}
                      className={cn(
                        "p-4 rounded-xl border",
                        highlight
                          ? "bg-primary/5 border-primary/20"
                          : "bg-muted/50 border-border"
                      )}
                    >
                      <p className={cn("text-xs font-semibold uppercase tracking-wider", highlight ? "text-primary/70" : "text-muted-foreground")}>
                        {label}
                      </p>
                      <p className={cn("text-3xl font-bold mt-1", highlight ? "text-primary" : "text-foreground")}>
                        {value}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
                    </div>
                  ))}
                </div>

                {/* Earnings */}
                <div className="mt-auto p-4 rounded-xl bg-muted/40 border border-border flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Comissão acumulada</p>
                    <p className="text-xl font-bold text-foreground">R$ 0,00</p>
                  </div>
                  <div className="ml-auto text-xs text-muted-foreground text-right leading-tight">
                    Pago<br />mensalmente
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Earnings Calculator ── */}
          <div className="rounded-2xl border border-border bg-card shadow-sm p-6 md:p-8 flex flex-col gap-6">
            <div>
              <h3 className="text-lg font-bold text-foreground">Calculadora de Ganhos</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Simule quanto você pode ganhar mensalmente com suas indicações.
              </p>
            </div>

            {/* Plan selector */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Plano do indicado
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {KIVO_PLANS.map((plan) => (
                  <button
                    key={plan.name}
                    onClick={() => setSelectedPlan(plan)}
                    className={cn(
                      "p-3 rounded-xl border-2 text-center transition-all",
                      selectedPlan.name === plan.name
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border bg-muted/40 text-muted-foreground hover:border-border/80"
                    )}
                  >
                    <p className="text-xs font-bold">{plan.name}</p>
                    <p className="text-sm font-mono mt-0.5">R${plan.price}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Slider */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Número de indicados
                </Label>
                <span className="text-2xl font-bold text-foreground tabular-nums">
                  {referralCount}
                </span>
              </div>
              <Slider
                min={1}
                max={50}
                step={1}
                value={[referralCount]}
                onValueChange={([v]) => setReferralCount(v)}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground font-medium">
                <span>1 indicado</span>
                <span>50 indicados</span>
              </div>
            </div>

            {/* Result cards */}
            <div className="mt-auto space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary/70">
                    Por indicado / mês
                  </p>
                  <p className="text-2xl font-extrabold text-primary mt-1">
                    R$ {perReferral.toFixed(2).replace(".", ",")}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-muted/50 border border-border text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Receita / ano
                  </p>
                  <p className="text-2xl font-extrabold text-foreground mt-1">
                    R$ {yearlyEarnings.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
                  </p>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-card border-2 border-primary relative overflow-hidden">
                <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
                <div className="flex items-center justify-between relative z-10">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary/70">
                      🎯 Receita Mensal Estimada
                    </p>
                    <p className="text-4xl font-extrabold text-foreground mt-1 tabular-nums">
                      R$ {monthlyEarnings.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
                      <span className="text-lg font-medium text-muted-foreground">/mês</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {referralCount} indicado{referralCount !== 1 ? "s" : ""} × Plano {selectedPlan.name} (R${selectedPlan.price}) × 20%
                    </p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-primary/30" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 3 Ways ── */}
        <div className="space-y-6">
          <div className="text-center">
            <h3 className="text-xl font-bold text-foreground">3 formas simples de indicar</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Escolha a que mais faz sentido para o seu canal.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                num: "01",
                icon: Link2,
                title: "Adicione na sua Loja",
                desc: "Crie um produto \"Link de Afiliado\" na sua vitrine Kivo. Um clique e seu visitante vira um lead indicado.",
              },
              {
                num: "02",
                icon: Play,
                title: "Mencione nos Stories",
                desc: "Compartilhe seus resultados na Kivo com a sua audiência. Use o Swipe Up ou o sticker de link com o seu código.",
              },
              {
                num: "03",
                icon: Mail,
                title: "Email no Rodapé",
                desc: "Adicione seu link de afiliado no PS dos seus emails de entrega de produto. Alcance quem já confia em você.",
              },
            ].map(({ num, icon: Icon, title, desc }) => (
              <div
                key={num}
                className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-4 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-muted-foreground font-mono">{num}</span>
                </div>
                <div>
                  <h4 className="font-bold text-foreground text-base">{title}</h4>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

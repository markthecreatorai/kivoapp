import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Copy, TrendingUp, Play, Smartphone, Instagram, Mail, Link2, CopyCheck, AlertCircle, DollarSign, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ReferralProfile {
  id: string;
  referral_code: string;
  referral_link: string;
  status: string;
}

export default function ReferralsDashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ReferralProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [customCode, setCustomCode] = useState("");

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
        // Sugerir um código baseado no email ou nome
        const baseName = user.user_metadata?.full_name?.split(" ")[0]?.toLowerCase() 
                         || user.email?.split("@")[0]?.toLowerCase() 
                         || "creator";
        setCustomCode(`${baseName}${Math.floor(Math.random() * 1000)}`);
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
    
    // Formatar código
    const cleanCode = customCode.toLowerCase().replace(/[^a-z0-9-]/g, "");
    const link = `${window.location.origin}/?ref=${cleanCode}`;
    
    try {
      const { data, error } = await supabase.from("referral_profiles").insert({
        user_id: user.id,
        referral_code: cleanCode,
        referral_link: link,
      }).select().single();
      
      if (error) {
        if (error.code === '23505') {
           toast.error("Este código já está em uso por outro criador. Escolha outro.");
        } else {
           toast.error("Erro ao criar código: " + error.message);
        }
      } else if (data) {
        setProfile(data as ReferralProfile);
        toast.success("Código de indicação ativado com sucesso!");
      }
    } catch (e) {
      toast.error("Erro inesperado ao criar perfil de afiliado.");
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = () => {
    if (!profile) return;
    navigator.clipboard.writeText(profile.referral_link);
    setCopied(true);
    toast.success("Link copiado para a área de transferência!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return null;

  return (
    <div className="w-full min-h-[calc(100vh-theme(spacing.16))] bg-[#FAFAFA] dark:bg-zinc-950 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header Title */}
        <div className="flex items-center justify-between pb-2 border-b border-border/40">
           <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-indigo-600">Minhas Indicações</h1>
           {profile && (
             <div 
                onClick={copyToClipboard}
                className="flex items-center gap-2 text-sm font-medium text-purple-600 bg-purple-50 dark:bg-purple-900/10 px-3 py-1.5 rounded-full cursor-pointer hover:bg-purple-100 transition-colors"
             >
                {copied ? <CopyCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {profile.referral_link.replace('https://', '').replace('http://', '')}
             </div>
           )}
        </div>

        {/* Warning Banner se o plano não estiver ativo (apenas ilustrativo) */}
        {!profile && (
          <div className="w-full bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-500 p-3 rounded-xl text-sm font-medium text-center border border-yellow-200 dark:border-yellow-900/50 flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4" /> 
            Você ainda não ativou seu link de indicações. Crie abaixo!
          </div>
        )}

        {/* Main Hero Card */}
        <div className="w-full bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col md:flex-row items-center">
           <div className="p-8 md:p-12 flex-1 space-y-4">
              <h2 className="text-3xl md:text-5xl font-extrabold text-zinc-900 dark:text-zinc-50 leading-[1.1] tracking-tight">
                Ganhe 20% de comissão lifetime a cada indicação. <span className="text-purple-600">De verdade.</span>
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-lg md:text-xl">
                Ajude outros criadores a transformar visualizações em clientes, e por isso, nós dividimos a nossa receita recorrente com você.
              </p>
           </div>
           {/* Video / Image Placeholder */}
           <div className="w-full md:w-[45%] h-64 md:h-auto self-stretch bg-zinc-100 dark:bg-zinc-800 relative group overflow-hidden">
              <img 
                 src="https://images.unsplash.com/photo-1573164713988-8665fc963095?auto=format&fit=crop&q=80&w=1000" 
                 alt="Referral Video" 
                 className="w-full h-full object-cover opacity-90 transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                 <button className="w-16 h-16 bg-white/30 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/40 transition-colors shadow-xl">
                   <Play className="w-6 h-6 ml-1" />
                 </button>
              </div>
           </div>
        </div>

        {/* Share Link & Slider Block */}
        <div className="w-full bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-8 md:p-10 flex flex-col md:flex-row gap-10 items-center justify-between">
           
           <div className="flex-1 space-y-6 w-full">
              <div>
                <h3 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">Compartilhe seu link</h3>
                <p className="text-zinc-500">Convide um amigo e ganhe toda vez que ele renovar a assinatura da Kivo.</p>
              </div>
              
              {!profile ? (
                <div className="space-y-3 max-w-sm">
                   <Label>Crie seu código de indicação</Label>
                   <div className="flex gap-2">
                     <div className="relative flex-1">
                        <span className="absolute left-3 top-3 text-sm text-zinc-400">kivo.com/?ref=</span>
                        <Input 
                          className="pl-[105px] font-mono text-sm border-zinc-300 focus-visible:ring-purple-600"
                          value={customCode}
                          onChange={(e) => setCustomCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                        />
                     </div>
                   </div>
                   <Button 
                      onClick={handleCreateCode} 
                      disabled={creating || !customCode.trim()}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-12 text-base font-semibold shadow-lg shadow-purple-600/20"
                   >
                     {creating ? "Ativando..." : "Criar URL de Indicação"}
                   </Button>
                </div>
              ) : (
                <div className="space-y-4 max-w-md">
                   <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl items-center border border-zinc-200 dark:border-zinc-800">
                     <div className="flex-1 px-4 py-3 font-mono text-sm text-zinc-900 dark:text-zinc-100 truncate select-all">
                       {profile.referral_link}
                     </div>
                     <Button 
                        onClick={copyToClipboard}
                        className="rounded-lg bg-purple-600 hover:bg-purple-700 text-white shadow-md m-1 px-6 min-w-[120px]"
                     >
                       {copied ? "Copiado!" : "Copiar"}
                     </Button>
                   </div>
                   
                   <div className="flex items-center gap-4 pt-2">
                      <div className="bg-zinc-50 dark:bg-zinc-800/50 px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 flex-1">
                         <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Cliques</p>
                         <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-1">0</p>
                      </div>
                      <div className="bg-purple-50 dark:bg-purple-900/10 px-4 py-3 rounded-xl border border-purple-100 dark:border-purple-900/40 flex-1">
                         <p className="text-xs text-purple-600/70 uppercase tracking-wider font-semibold">Pagantes</p>
                         <p className="text-2xl font-bold text-purple-600 mt-1">0</p>
                      </div>
                   </div>
                </div>
              )}
           </div>

           {/* Fake Chart / Slider Visualizer */}
           <div className="flex-1 w-full bg-slate-50 dark:bg-zinc-950/50 p-6 rounded-2xl border border-slate-100 dark:border-zinc-800">
              <div className="flex justify-between items-end mb-8 relative px-2">
                 {/* Decorative Bars */}
                 <div className="flex items-end gap-2 h-32 w-full">
                    <div className="w-[8%] bg-purple-200 dark:bg-purple-900/30 h-[10%] rounded-t-sm"></div>
                    <div className="w-[8%] bg-purple-200 dark:bg-purple-900/30 h-[20%] rounded-t-sm"></div>
                    <div className="w-[8%] bg-purple-300 dark:bg-purple-800/40 h-[25%] rounded-t-sm"></div>
                    <div className="w-[8%] bg-purple-300 dark:bg-purple-800/40 h-[35%] rounded-t-sm"></div>
                    <div className="w-[8%] bg-purple-400 dark:bg-purple-700/50 h-[45%] rounded-t-sm"></div>
                    <div className="w-[8%] bg-purple-400 dark:bg-purple-700/50 h-[55%] rounded-t-sm"></div>
                    <div className="w-[8%] bg-purple-500 dark:bg-purple-600/70 h-[70%] rounded-t-sm"></div>
                    <div className="w-[8%] bg-purple-500 dark:bg-purple-600/70 h-[80%] rounded-t-sm"></div>
                    <div className="w-[8%] bg-purple-600 dark:bg-purple-600 h-[95%] rounded-t-sm"></div>
                    <div className="w-[8%] bg-purple-600 dark:bg-purple-600 h-full rounded-t-sm"></div>
                 </div>
                 
                 <div className="absolute top-0 left-0 text-left">
                    <span className="text-purple-600 font-bold block">R$ 38/mês</span>
                    <span className="text-[10px] text-zinc-400">1 cadastro</span>
                 </div>
                 <div className="absolute top-[-20px] right-0 text-right">
                    <span className="text-purple-600 font-bold text-lg block">R$ 380/mês</span>
                    <span className="text-[10px] text-zinc-400 uppercase font-semibold">10 cadastros/mês</span>
                 </div>
              </div>

              {/* Slider UI */}
              <div className="relative pt-4">
                 <div className="h-1 w-full relative bg-zinc-200/60 dark:bg-zinc-800 rounded-full">
                    <div className="absolute left-0 top-0 bottom-0 w-1/4 bg-purple-500 rounded-full"></div>
                 </div>
                 <div className="absolute top-3 left-1/4 -translate-y-1/2 w-5 h-5 bg-white border-2 border-purple-500 rounded-full shadow cursor-grab"></div>
                 <div className="text-center mt-6 text-sm font-semibold text-purple-600">Simulador de Ganhos Recorrentes</div>
              </div>
           </div>
        </div>

        {/* 3 Easy Ways */}
        <div className="pt-10">
           <div className="text-center mb-10">
              <h3 className="text-2xl font-bold text-zinc-900 dark:text-white">3 formas fáceis de ganhar</h3>
           </div>
           
           <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Way 1 */}
              <div className="flex flex-col items-center text-center space-y-4">
                 <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center font-bold text-zinc-600 text-sm">1</div>
                 <h4 className="font-bold text-lg">Adicione na sua Loja</h4>
                 <p className="text-sm text-zinc-500 px-4">Basta criar um novo produto "Link de Afiliado" e ele listará na sua vitrine com um clique.</p>
                 
                 <div className="w-[200px] h-[360px] bg-white dark:bg-zinc-900 border-4 border-zinc-100 dark:border-zinc-800 rounded-3xl mt-4 p-3 shadow-xl flex flex-col items-center relative overflow-hidden">
                    <div className="w-16 h-4 bg-zinc-100 dark:bg-zinc-800 absolute top-0 rounded-b-lg"></div>
                    <div className="w-16 h-16 rounded-full bg-slate-200 mt-6 mb-2"></div>
                    <div className="w-24 h-3 rounded bg-slate-200 mb-6"></div>
                    
                    <div className="w-full py-2 bg-slate-100 dark:bg-zinc-800 rounded-lg mb-2"></div>
                    <div className="w-full py-2 bg-slate-100 dark:bg-zinc-800 rounded-lg mb-4"></div>
                    
                    {/* Simulated Referral block in store */}
                    <div className="w-full p-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/50 rounded-xl relative">
                       <div className="w-6 h-6 rounded-full bg-purple-200 absolute -top-3 -right-2 flex items-center justify-center"><DollarSign className="w-3 h-3 text-purple-600"/></div>
                       <p className="text-[10px] font-bold mt-1 text-purple-800 dark:text-purple-300">Crie sua Loja Kivo Hoje</p>
                       <div className="w-full bg-purple-600 py-1.5 rounded-md mt-2 text-[8px] font-bold text-white uppercase text-center">Começar de Graça</div>
                    </div>
                 </div>
              </div>

              {/* Way 2 */}
              <div className="flex flex-col items-center text-center space-y-4">
                 <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center font-bold text-zinc-600 text-sm">2</div>
                 <h4 className="font-bold text-lg">Mencione nos Stories</h4>
                 <p className="text-sm text-zinc-500 px-4">Compartilhe os resultados de vendas que você teve aqui dentro com a sua audiência!</p>
                 
                 <div className="w-[200px] h-[360px] bg-zinc-900 border-4 border-zinc-100 dark:border-zinc-800 rounded-3xl mt-4 shadow-xl overflow-hidden relative">
                    <div className="absolute top-4 left-3 flex items-center gap-2 z-10">
                      <div className="w-6 h-6 bg-white/20 rounded-full backdrop-blur-sm"></div>
                      <div className="w-16 h-2 bg-white/60 rounded backdrop-blur-sm"></div>
                    </div>
                    {/* Fake Instagram interface */}
                    <img src="https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&q=80&w=400" className="w-full h-[85%] object-cover opacity-80" />
                    
                    {/* Link sticker mock */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-3 py-1 pb-1.5 rounded flex items-center gap-1 shadow-lg transform -rotate-3">
                       <Link2 className="w-3 h-3 text-blue-500" />
                       <span className="text-[10px] font-bold text-blue-500">Minha Plataforma Kivo</span>
                    </div>

                    <div className="absolute bottom-0 inset-x-0 h-14 bg-black/80 backdrop-blur px-3 flex items-center justify-between">
                       <div className="w-24 h-6 border border-white/30 rounded-full flex items-center px-2">
                         <span className="text-[8px] text-white/60">Enviar mensagem</span>
                       </div>
                       <Heart className="w-5 h-5 text-white" />
                    </div>
                 </div>
              </div>

              {/* Way 3 */}
              <div className="flex flex-col items-center text-center space-y-4">
                 <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center font-bold text-zinc-600 text-sm">3</div>
                 <h4 className="font-bold text-lg">Email Automático</h4>
                 <p className="text-sm text-zinc-500 px-4">Coloque o seu link de afiliado no rodapé ou PS dos seus fluxos de entrega de e-mail.</p>
                 
                 <div className="w-[200px] h-[360px] bg-white dark:bg-zinc-900 border-4 border-zinc-100 dark:border-zinc-800 rounded-3xl mt-4 p-3 shadow-xl flex flex-col relative overflow-hidden">
                    <div className="w-full h-8 flex border-b dark:border-zinc-800 mb-2 items-center px-1">
                      <div className="w-14 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full"></div>
                    </div>
                    <div className="flex gap-2 items-center mb-4">
                       <div className="w-5 h-5 bg-purple-100 rounded-full"></div>
                       <div>
                         <div className="w-20 h-2 bg-zinc-300 dark:bg-zinc-600 rounded mb-1"></div>
                         <div className="w-12 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded"></div>
                       </div>
                    </div>
                    
                    <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded mb-2"></div>
                    <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded mb-2"></div>
                    <div className="w-[80%] h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded mb-6"></div>
                    
                    <div className="text-left mt-4 border-l-2 border-purple-300 pl-2">
                      <p className="text-[6px] font-bold text-zinc-500 mb-1">P.S. Hospedo meus produtos na Kivo</p>
                      <div className="text-[6px] text-purple-600 font-bold bg-purple-50 p-1 w-fit rounded">Conheça e gere sua conta</div>
                    </div>
                 </div>
              </div>

           </div>
        </div>

      </div>
    </div>
  );
}

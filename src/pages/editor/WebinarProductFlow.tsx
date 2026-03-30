import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Rocket,
  Save,
  Calendar,
  Clock,
  Video,
  Users,
  Bell,
  MessageSquare,
  Lock,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Mail
} from "lucide-react";

export default function WebinarProductFlow({
  initialProduct,
  setSaving,
}: {
  initialProduct: any;
  setSaving: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("thumbnail");

  const initialPriceConfig = initialProduct.prices?.[0] || { amount: 0, compare_at_amount: null };
  const metadata = (initialProduct.metadata as any) || {};

  const [form, setForm] = useState({
    // THUMBNAIL Tab
    cardStyle: initialProduct.thumbnail_style || "preview", // callout | preview
    name: initialProduct.name || "",
    shortDescription: initialProduct.short_description || "",
    ctaText: initialProduct.listing_button_text || "Garantir Vaga",
    thumbnailUrl: initialProduct.thumbnail_url || "",
    
    // CHECKOUT Tab
    checkoutImage: initialProduct.checkout_image || "",
    description: initialProduct.checkout_description || "",
    isFree: initialPriceConfig.amount === 0,
    price: initialPriceConfig.amount || 0,
    compareAtPrice: initialPriceConfig.compare_at_amount,
    
    // EVENT CONFIG
    eventDate: metadata.event_date || "", // YYYY-MM-DDTHH:mm
    duration: metadata.duration_minutes || 60,
    maxSeats: metadata.max_seats || null,
    limitSeats: !!metadata.max_seats,
    broadcastUrl: initialProduct.delivery_url || "", // Link do Zoom/Meet
    
    // OPÇÕES Tab
    confirmationSubject: initialProduct.confirmation_email_subject || "Ingresso Confirmado: Salve na Agenda!",
    confirmationBody: initialProduct.confirmation_email_body || "O seu lugar no evento ao vivo está garantido. O link oficial do Zoom irá 1 hora antes.",
    sendReminders: metadata.send_reminders ?? true,
  });

  const updateForm = (updates: Partial<typeof form>) => setForm((p) => ({ ...p, ...updates }));

  const [openEmail, setOpenEmail] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async (status: "DRAFT" | "PUBLISHED") => {
      setSaving(true);
      
      const updatedMetadata = {
        ...metadata,
        format_id: "webinar",
        event_date: form.eventDate,
        duration_minutes: form.duration,
        max_seats: form.limitSeats ? form.maxSeats : null,
        send_reminders: form.sendReminders
      };

      const { error: prodError } = await supabase.from("products").update({
        status,
        name: form.name,
        short_description: form.shortDescription,
        listing_button_text: form.ctaText,
        thumbnail_style: form.cardStyle,
        thumbnail_url: form.thumbnailUrl,
        checkout_image: form.checkoutImage,
        checkout_description: form.description,
        
        delivery_mode: "url", // Redireciona para um link de "Obrigado" ou Sala de Espera
        delivery_url: form.broadcastUrl, 
        
        confirmation_email_subject: form.confirmationSubject,
        confirmation_email_body: form.confirmationBody,
        metadata: updatedMetadata
      }).eq("id", initialProduct.id);

      if (prodError) throw prodError;

      if (initialPriceConfig.id) {
         await supabase.from("prices").update({
           amount: form.isFree ? 0 : form.price,
           compare_at_amount: form.compareAtPrice,
           type: "ONE_TIME"
         }).eq("id", initialPriceConfig.id);
      } else {
         await supabase.from("prices").insert({
           product_id: initialProduct.id,
           amount: form.isFree ? 0 : form.price,
           compare_at_amount: form.compareAtPrice,
           type: "ONE_TIME"
         });
      }

      return status;
    },
    onSuccess: (status) => {
      queryClient.invalidateQueries({ queryKey: ["product", initialProduct.id] });
      toast.success(status === "PUBLISHED" ? "Ingressos do Webinar Lançados!" : "Rascunho salvo!");
    },
    onError: (err: any) => {
      toast.error("Erro ao salvar: " + err.message);
    },
    onSettled: () => setSaving(false),
  });

  const handleNext = () => {
    if (tab === "thumbnail") {
      if (!form.name.trim()) { toast.error("Informe título"); return; }
      setTab("checkout");
    } else if (tab === "checkout") {
      if (!form.isFree && form.price <= 0) { toast.error("Cobrança exige um valor."); return; }
      if (!form.eventDate) { toast.error("Um evento precisa de uma data configurada."); return; }
      if (!form.broadcastUrl) { toast.error("Preencha o link do Zoom/Meet para o dia."); return; }
      setTab("opcoes");
    }
  };

  const formatDateLabel = (dateString: string) => {
    if (!dateString) return "SELECIONE UMA DATA";
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).toUpperCase();
    } catch {
      return "DATA INVÁLIDA";
    }
  };

  const MobilePreview = () => {
    return (
      <div className="hidden lg:block w-[320px] shrink-0 sticky top-24">
        <p className="text-xs font-medium text-blue-600/60 dark:text-blue-500/50 mb-3 text-center uppercase tracking-widest font-semibold flex items-center justify-center gap-1">
          <Calendar className="w-3 h-3" /> Preview de Ingresso
        </p>

        {/* Fake Phone */}
        <div className="w-[320px] h-[600px] bg-black rounded-[40px] p-2 shadow-xl flex flex-col justify-start">
          <div className="w-full h-full rounded-[32px] overflow-hidden bg-[#F5F5F5] dark:bg-zinc-950 flex flex-col relative overflow-y-auto">
            {/* Notch */}
            <div className="w-32 h-6 bg-black absolute top-0 inset-x-0 mx-auto rounded-b-xl z-20"></div>

            {/* Thumbnail Preview */}
            {tab === "thumbnail" && (
              <div className="p-4 pt-10 flex items-center h-full">
                
                {form.cardStyle === "callout" && (
                  <div className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
                    {form.thumbnailUrl ? (
                        <div className="h-32 bg-zinc-100 dark:bg-zinc-800 overflow-hidden rounded-xl mb-4">
                            <img src={form.thumbnailUrl} className="w-full h-full object-cover" />
                        </div>
                    ) : null}
                    
                    <div className="flex items-center gap-2 mb-2">
                       <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent hover:bg-secondary/80 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[10px] font-bold">EVENTO AO VIVO</span>
                       {form.limitSeats && <span className="text-[10px] font-bold text-red-500 leading-none">ÚLTIMAS {form.maxSeats || 0} VAGAS</span>}
                    </div>

                    <p className="font-bold text-zinc-900 dark:text-zinc-100 text-lg leading-snug">{form.name || "Masterclass Ao Vivo"}</p>
                    {form.shortDescription && (
                      <p className="text-sm text-zinc-500 mt-2 line-clamp-2">{form.shortDescription}</p>
                    )}
                    
                    <div className="flex items-center gap-2 mt-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded-md p-2 border border-zinc-200 dark:border-zinc-700">
                       <Calendar className="w-4 h-4 text-blue-600"/> {formatDateLabel(form.eventDate)}
                    </div>

                    <div className="mt-4 py-3 rounded-xl bg-blue-600 text-white text-sm font-bold text-center shadow-lg shadow-blue-600/20">
                      {form.ctaText || "Reservar Assento"}
                    </div>
                  </div>
                )}
                
                {form.cardStyle === "preview" && (
                  <div className="w-full rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm">
                    <div className="relative h-44 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
                      {form.thumbnailUrl ? (
                        <img src={form.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-10 w-10 text-zinc-300 dark:text-zinc-600" />
                      )}
                      <div className="absolute top-3 left-3 bg-blue-600 text-white backdrop-blur text-[10px] px-2 py-1 rounded-sm font-bold uppercase shadow-sm">
                         Evento Ao Vivo
                      </div>
                    </div>
                    <div className="p-5">
                      <p className="font-bold text-zinc-900 dark:text-zinc-100 text-lg leading-snug">{form.name || "Webinar Exclusivo"}</p>
                      
                      <div className="flex items-center gap-2 mt-3 text-xs font-bold text-zinc-600 dark:text-zinc-400">
                         <Clock className="w-3 h-3 text-blue-600"/> {formatDateLabel(form.eventDate)}
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                         <span className="font-bold text-foreground">
                            {form.isFree ? "Gratuito" : `R$ ${form.price.toFixed(2).replace(".", ",")}`}
                         </span>
                         <div className="py-2.5 px-4 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-600/20">
                           {form.ctaText || "Participar"}
                         </div>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* Checkout / Opções Preview */}
            {(tab === "checkout" || tab === "opcoes") && (
              <div className="bg-white dark:bg-zinc-900 min-h-full">
                {form.checkoutImage && (
                  <div className="h-44 bg-blue-100 overflow-hidden relative">
                    <img src={form.checkoutImage} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/80 to-transparent"></div>
                    <div className="absolute bottom-4 left-4 text-white">
                        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 hover:bg-accent hover:text-accent-foreground text-white/80 border-white/30 backdrop-blur-md mb-2">Ingresso Digital</span>
                        <p className="font-bold text-lg leading-none">{form.name || "Evento Ao Vivo"}</p>
                    </div>
                  </div>
                )}

                {!form.checkoutImage && (
                   <div className="pt-10 px-5">
                      <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent hover:bg-secondary/80 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">Sala Virtual Privada</span>
                      <p className="font-bold text-xl text-zinc-900 dark:text-zinc-100 leading-snug mt-3">{form.name || "Evento Ao Vivo"}</p>
                   </div>
                )}


                <div className="p-5 space-y-4">
                  <div className="flex flex-col p-3 rounded-lg border border-blue-500/20 bg-blue-50/50 dark:bg-blue-900/10 gap-2">
                     <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                        <Calendar className="w-4 h-4 text-blue-600"/> {formatDateLabel(form.eventDate)}
                     </div>
                     <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                        <Clock className="w-4 h-4 text-blue-600/60"/> Duração aprox: {form.duration} min
                     </div>
                     {form.limitSeats && (
                       <div className="flex items-center gap-2 text-xs font-bold text-red-500 mt-1 bg-red-50 dark:bg-red-900/10 p-1.5 rounded w-fit">
                          <Users className="w-3.5 h-3.5"/> ÚLTIMAS {form.maxSeats || 0} VAGAS
                       </div>
                     )}
                  </div>

                  <div className="flex items-center gap-2">
                    {!form.isFree && form.price > 0 && (
                      <span className="text-2xl font-bold text-blue-600">
                        R$ {form.price.toFixed(2).replace(".", ",")}
                      </span>
                    )}
                    {!form.isFree && form.compareAtPrice && (
                      <span className="text-sm text-zinc-400 line-through">
                        R$ {form.compareAtPrice.toFixed(2).replace(".", ",")}
                      </span>
                    )}
                    {form.isFree && <span className="text-xl font-bold text-blue-600">Registro 100% Gratuito</span>}
                  </div>

                  {form.description && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
                      {form.description}
                    </p>
                  )}

                  <div className="pt-3 space-y-3">
                     <div className="space-y-1">
                       <p className="text-xs font-medium text-zinc-700">Seu E-mail (Para Envio do Link da Sala)</p>
                       <div className="h-10 border rounded-lg bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700" />
                     </div>
                     <div className="pt-4">
                        <div className="w-full py-4 rounded-xl bg-blue-600 text-white font-bold text-center shadow-lg shadow-blue-600/20">
                          {form.ctaText || "Emitir Acesso"}
                        </div>
                     </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const CARD_STYLES = [
    { key: "preview", label: "Preview", desc: "Imagem grande e Detalhes" },
    { key: "callout", label: "Callout", desc: "Informação concisa com card" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col lg:flex-row gap-10">
        
        {/* Lado Esquerdo - Formulário */}
        <div className="flex-1 min-w-0">
          <Tabs value={tab} onValueChange={setTab} className="mb-8">
            <TabsList className="bg-muted/50 p-1 w-full flex mb-6">
              <TabsTrigger value="thumbnail" className="flex-1 text-xs sm:text-sm">1. Divulgação</TabsTrigger>
              <TabsTrigger value="checkout" className="flex-1 text-xs sm:text-sm">2. Datas e Vagas</TabsTrigger>
              <TabsTrigger value="opcoes" className="flex-1 text-xs sm:text-sm">3. Lembretes</TabsTrigger>
            </TabsList>

            {/* ABA: THUMBNAIL */}
            <TabsContent value="thumbnail" className="space-y-8 animate-in fade-in">
              <div className="space-y-2">
                <h2 className="text-xl font-bold flex items-center gap-2"><Video className="w-5 h-5 text-blue-600"/> Webinars & Masterclasses</h2>
                <p className="text-sm text-muted-foreground">Venda (ou atraia leads em massa) com Eventos Ao Vivo, Workshops ou Treinamentos.</p>
              </div>

              {/* Seletor de Estilo */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Decida o Estilo da Divulgação</Label>
                <div className="flex gap-3">
                  {CARD_STYLES.map(({ key, label, desc }) => (
                    <button
                      key={key}
                      onClick={() => updateForm({ cardStyle: key })}
                      className={cn(
                        "flex-1 p-3 rounded-xl border-2 text-center transition-all",
                        form.cardStyle === key
                          ? "border-blue-600 bg-blue-600/5 text-blue-600"
                          : "border-border bg-card hover:border-border/80 text-foreground"
                      )}
                    >
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="text-[10px] text-muted-foreground mt-1 hidden sm:block">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Imagem */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Imagem Ilustrativa (URL)</Label>
                <Input 
                  placeholder="Link banner do evento..." 
                  value={form.thumbnailUrl} onChange={e => updateForm({thumbnailUrl: e.target.value})}
                />
              </div>

              {/* Textos */}
              <div className="space-y-4 border-t border-border/40 pt-6">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Nome do Evento Ao Vivo *</Label>
                  <Input 
                    placeholder="Ex: Masterclass Automações V2" 
                    maxLength={80}
                    value={form.name} onChange={e => updateForm({name: e.target.value})}
                  />
                  <p className="text-right text-[10px] text-muted-foreground">{form.name.length}/80</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Pequena Descrição (Opcional)</Label>
                  <Textarea 
                    placeholder="O que o participante irá aprender nessa aula fechada?" 
                    maxLength={120}
                    value={form.shortDescription} onChange={e => updateForm({shortDescription: e.target.value})}
                    rows={2}
                    className="resize-none"
                  />
                  <p className="text-right text-[10px] text-muted-foreground">{form.shortDescription.length}/120</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Texto do Botão de Escassez</Label>
                  <Input 
                    placeholder="Reservar Vaga Agora" 
                    maxLength={30}
                    value={form.ctaText} onChange={e => updateForm({ctaText: e.target.value})}
                  />
                </div>
              </div>
            </TabsContent>

            {/* ABA: CHECKOUT E TEMPO */}
            <TabsContent value="checkout" className="space-y-8 animate-in fade-in">
              <div className="space-y-2">
                <h2 className="text-xl font-bold">Página de Inscrição e Assentos</h2>
                <p className="text-sm text-muted-foreground">Configurações cruciais de tempo para gerar senso de urgência ("FOMO").</p>
              </div>

              {/* Quando vai acontecer */}
              <div className="space-y-4 p-5 rounded-2xl border-2 border-blue-500/30 bg-blue-50/20 dark:bg-card shadow-sm">
                <div className="flex items-center gap-2 border-b border-blue-500/20 pb-3 mb-2 font-bold text-blue-600 dark:text-blue-400">
                  <Clock className="w-5 h-5"/>
                  Agenda Oficial do Evento
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase">Dia e Horário Local *</Label>
                    <Input
                      type="datetime-local"
                      className="border-blue-300 focus:ring-blue-500 bg-card h-11"
                      value={form.eventDate} onChange={(e) => updateForm({ eventDate: e.target.value })}
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase">Duração (Minutos)</Label>
                    <Input
                      type="number" min={15} step={15} placeholder="60"
                      className="border-blue-300 focus:ring-blue-500 bg-card h-11"
                      value={form.duration || ""} onChange={(e) => updateForm({ duration: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                   <Label className="text-xs font-semibold uppercase">Link da Transmissão / Sala (Zoom, Meet, YouTube) *</Label>
                   <Input 
                      placeholder="https://us02web.zoom.us/j/..." 
                      className="border-blue-300 focus:ring-blue-500 text-sm bg-card"
                      value={form.broadcastUrl} onChange={(e) => updateForm({ broadcastUrl: e.target.value })}
                   />
                   <p className="text-[10px] text-muted-foreground">O link será mantido em segredo absoluto até 1 hora antes do evento, enviado automaticamente na caixa de entrada do inscrito.</p>
                </div>
              </div>

              {/* Vagas */}
              <div className="space-y-4 p-5 rounded-2xl border border-border/60 bg-card">
                 <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Users className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <Label className="text-sm font-semibold">Limitar Vagas (Escassez)</Label>
                        <p className="text-xs text-muted-foreground">Bloquear compras automaticamente ao bater a lotação</p>
                      </div>
                    </div>
                    <Switch
                      checked={form.limitSeats}
                      onCheckedChange={(v) => updateForm({ limitSeats: v })}
                    />
                 </div>

                 {form.limitSeats && (
                   <div className="pt-3 border-t border-border/50 animate-in fade-in zoom-in-95 mt-2">
                     <Label className="text-xs font-semibold block mb-2 text-red-500">Qual a Lotação Máxima da Sala?</Label>
                     <Input 
                        type="number" min={1} placeholder="Ex: 50 lugares"
                        className="w-full sm:w-1/3"
                        value={form.maxSeats || ""} onChange={(e) => updateForm({maxSeats: Number(e.target.value)})}
                     />
                   </div>
                 )}
              </div>

              {/* Precificação */}
              <div className="space-y-4 p-5 rounded-2xl border border-border/60 bg-card shadow-sm">
                <p className="text-base font-semibold text-foreground">Valor do Ingresso</p>

                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.isFree}
                    onCheckedChange={(v) => updateForm({ isFree: v })}
                  />
                  <Label className="text-sm cursor-pointer">Inscrição Aberta/Gratuita (Custo Zero)</Label>
                </div>

                {!form.isFree && (
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Valor Cobrado (R$) *</Label>
                      <Input
                        type="number" min={0} step={0.01} placeholder="0,00"
                        className="text-lg font-mono font-medium border-blue-500/50 focus-visible:ring-blue-500"
                        value={form.price || ""} onChange={(e) => updateForm({ price: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">1º Lote (Ancoragem)</Label>
                      <Input
                        type="number" min={0} step={0.01} placeholder="Opcional"
                        value={form.compareAtPrice ?? ""} onChange={(e) => updateForm({ compareAtPrice: e.target.value ? Number(e.target.value) : null })}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2 pt-2">
                <Label className="text-sm font-semibold text-foreground">Apresentação / Landing Page do Evento</Label>
                <Textarea 
                  placeholder="Por que as pessoas devem comprar esse evento de X minutos?" 
                  value={form.description} onChange={e => updateForm({description: e.target.value})}
                  rows={4}
                  className="resize-none"
                />
              </div>

            </TabsContent>

            {/* ABA: OPÇÕES */}
            <TabsContent value="opcoes" className="space-y-6 animate-in fade-in">
              <div className="space-y-2">
                <h2 className="text-xl font-bold">Engajamento e Lembretes</h2>
                <p className="text-sm text-muted-foreground">Não deixe as pessoas esquecerem de entrar na live (Taxa de Comparecimento é a métrica Rei dos eventos ao vivo).</p>
              </div>

              <div className="space-y-3">
                 {/* Alarme Auto (Feature nativa para Webinars) */}
                 <div className="rounded-xl border border-blue-500/40 bg-blue-50/10 p-4 transition-all">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                           <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30">
                              <Bell className="h-5 w-5" />
                           </div>
                           <div className="flex-1">
                              <p className="text-sm font-semibold flex gap-2 items-center text-foreground">
                                Disparos Baseados no Relógio (Drip-Reverse) 
                                <span className="inline-flex items-center rounded-full border focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent hover:bg-secondary/80 font-bold bg-blue-600/10 text-blue-600 text-[10px] py-0 px-2 h-5">NOVO</span>
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">Nós enviaremos notificações automáticas para que ele logue na sala.</p>
                           </div>
                        </div>
                        <Switch checked={form.sendReminders} onCheckedChange={(v) => updateForm({sendReminders: v})} />
                    </div>
                    {form.sendReminders && (
                       <div className="border border-blue-200 dark:border-blue-900/30 rounded-lg p-3 bg-card space-y-2">
                          <p className="text-[11px] font-bold text-blue-800 dark:text-blue-300">O Sitema irá liberar automaticamente:</p>
                          <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc font-medium">
                             <li>Um e-mail "Falta 1 Dia!" contendo pautas gerais.</li>
                             <li>Um e-mail crítico "ESTAMOS AO VIVO" com o Link (<span className="text-blue-500">{form.broadcastUrl || "(link não definido)"}</span>) 30 minutos antes.</li>
                          </ul>
                       </div>
                    )}
                 </div>

                 {/* Custom - Email Livre de Recibo */}
                 <div className={cn("rounded-xl border bg-card transition-all mt-6", openEmail ? "border-foreground/20 shadow-sm" : "border-border/60 hover:border-border")}>
                    <div className="flex items-center gap-3 p-4 cursor-pointer select-none" onClick={() => setOpenEmail(!openEmail)}>
                       <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-muted text-muted-foreground">
                          <Mail className="h-5 w-5" />
                       </div>
                       <div className="flex-1">
                          <p className="text-sm font-semibold text-foreground">Email de Confirmação e Recibo da Inscrição</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Aviso instantâneo ao aprovar cartão informando os dados fixos</p>
                       </div>
                       <div className="flex items-center gap-2">
                         <Switch checked={true} disabled />
                         {openEmail ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                       </div>
                    </div>

                    {openEmail && (
                      <div className="px-5 pb-5 border-t border-border/30 pt-4 space-y-4">
                         <div className="space-y-2">
                           <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assunto (Confirmação Imediata)</Label>
                           <Input value={form.confirmationSubject} onChange={e => updateForm({confirmationSubject: e.target.value})} />
                         </div>
                         <div className="space-y-2">
                           <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Corpo da Mensagem</Label>
                           <Textarea 
                             value={form.confirmationBody} onChange={e => updateForm({confirmationBody: e.target.value})}
                             rows={6} className="resize-none font-mono text-xs leading-5 bg-card"
                           />
                           <p className="text-[11px] text-muted-foreground text-right">{'{nome_cliente}'} - {'{produto}'} - {'{data_hora}'}</p>
                         </div>
                      </div>
                    )}
                 </div>

              </div>
            </TabsContent>

          </Tabs>

          <div className="flex items-center justify-between pt-6 mt-6 border-t border-border/40 pb-10">
            <Button variant="outline" onClick={() => saveMutation.mutate("DRAFT")}>
              <Save className="h-4 w-4 mr-2" /> Salvar Rascunho
            </Button>
            {tab !== "opcoes" ? (
              <Button onClick={handleNext} className="bg-blue-600 hover:bg-blue-700 text-white max-w-[200px] w-full shadow-md transition-transform active:scale-95">
                Continuar a Editar
              </Button>
            ) : (
              <Button onClick={() => saveMutation.mutate("PUBLISHED")} className="bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-600/20 w-fit sm:w-[250px] transition-transform active:scale-95">
                <Rocket className="h-4 w-4 mr-2" /> Divulgar Ingresso
              </Button>
            )}
          </div>
        </div>

        {/* Lado Direito */}
        <MobilePreview />

      </div>
    </div>
  );
}

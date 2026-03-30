import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthProvider";
import { useNavigate } from "react-router-dom";
import { useStorefrontTheme } from "@/hooks/useStorefrontTheme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Rocket,
  Save,
  Image as ImageIcon,
  Link2,
  Video
} from "lucide-react";

export default function UrlMediaFlow({
  initialProduct,
  setSaving,
}: {
  initialProduct: any;
  setSaving: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const formatId = (initialProduct.metadata as any)?.format_id || "url_media";
  const isAffiliate = formatId === "affiliate";
  const isReferralLink = formatId === "referral_link";
  const { user } = useAuth();
  const navigate = useNavigate();
  const themeTokens = useStorefrontTheme();

  const { data: referralProfile, isLoading: isReferralLoading } = useQuery({
    queryKey: ["referralProfile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("referral_profiles").select("*").eq("user_id", user.id).maybeSingle();
      return data;
    },
    enabled: isReferralLink && !!user
  });

  const [form, setForm] = useState({
    cardStyle: initialProduct.thumbnail_style || (isAffiliate || isReferralLink ? "callout" : "button"), // button | callout | preview | embed
    name: initialProduct.name || (isReferralLink ? "Crie sua Loja Kivo" : ""),
    shortDescription: initialProduct.short_description || "",
    ctaText: initialProduct.listing_button_text || (isAffiliate || isReferralLink ? "Apoiar Canal" : "Acessar Link"),
    thumbnailUrl: initialProduct.thumbnail_url || "",
    targetUrl: initialProduct.delivery_url || "", // we save the target in delivery_url
  });

  // Auto-fill target URL for referral link

  useEffect(() => {
    if (isReferralLink && referralProfile?.referral_link && !form.targetUrl) {
      setForm(p => ({ ...p, targetUrl: referralProfile.referral_link }));
    }
  }, [isReferralLink, referralProfile]);

  const updateForm = (updates: Partial<typeof form>) => setForm((p) => ({ ...p, ...updates }));

  const detectEmbed = (url: string) => {
    if (!url) return null;
    if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
    if (url.includes("spotify.com")) return "spotify";
    if (url.includes("calendly.com")) return "calendly";
    if (url.includes("notion.site") || url.includes("notion.so")) return "notion";
    return null;
  };

  const embedType = detectEmbed(form.targetUrl);

  const saveMutation = useMutation({
    mutationFn: async (status: "DRAFT" | "PUBLISHED") => {
      setSaving(true);
      const isEmbeddable = embedType !== null && form.cardStyle === "embed";
      
      const { error: prodError } = await supabase.from("products").update({
        status,
        name: form.name,
        short_description: form.shortDescription,
        listing_button_text: form.ctaText,
        thumbnail_style: form.cardStyle,
        thumbnail_url: form.thumbnailUrl,
        delivery_mode: "none", 
        delivery_url: form.targetUrl, // Destination link
        source_url: form.targetUrl, // Mirror
        is_embeddable: isEmbeddable,
        provider_type: embedType || "external"
      }).eq("id", initialProduct.id);

      if (prodError) throw prodError;
      return status;
    },
    onSuccess: (status) => {
      queryClient.invalidateQueries({ queryKey: ["product", initialProduct.id] });
      toast.success(status === "PUBLISHED" ? "Link Publicado na Loja!" : "Rascunho salvo!");
    },
    onError: (err: any) => {
      toast.error("Erro ao salvar: " + err.message);
    },
    onSettled: () => setSaving(false),
  });

  const getYoutubeEmbedUrl = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    const videoId = match && match[2].length === 11 ? match[2] : null;
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
  };

  const getSpotifyEmbedUrl = (url: string) => {
    return url.replace("open.spotify.com", "open.spotify.com/embed");
  };

  const MobilePreview = () => {
    return (
      <div className="hidden lg:block w-[320px] shrink-0 sticky top-24">
        <p className="text-xs font-medium mb-3 text-center uppercase tracking-widest font-semibold flex items-center justify-center gap-1" style={{ color: themeTokens.primaryColor }}>
          <Link2 className="w-3 h-3" /> Preview de {isReferralLink ? "Afiliado" : isAffiliate ? "Link" : "URL"}
        </p>

        {/* Fake Phone */}
        <div className="w-[320px] h-[600px] bg-black rounded-[40px] p-2 shadow-xl flex flex-col justify-start">
          <div 
            className="w-full h-full rounded-[32px] overflow-hidden flex flex-col relative overflow-y-auto"
            style={{ backgroundColor: themeTokens.backgroundColor }}
          >
            {/* Notch */}
            <div className="w-32 h-6 bg-black absolute top-0 inset-x-0 mx-auto rounded-b-xl z-20"></div>

            <div className="p-4 pt-10 flex flex-col items-center h-full">
              {/* Button Style */}
              {form.cardStyle === "button" && (
                <div 
                  className="w-full py-4 px-6 rounded-2xl border-2 text-center text-sm font-bold shadow-sm truncate" 
                  style={{ borderColor: themeTokens.primaryColor, color: themeTokens.textColor, backgroundColor: themeTokens.backgroundColor }}
                >
                  {form.name || "Link Externo"}
                </div>
              )}

              {/* Callout Style */}
              {form.cardStyle === "callout" && (
                <div 
                  className="w-full rounded-2xl border p-4 shadow-sm"
                  style={{ borderColor: themeTokens.primaryColor + '40', backgroundColor: themeTokens.backgroundColor }}
                >
                  {form.thumbnailUrl && (
                      <div className="h-32 overflow-hidden rounded-xl mb-4" style={{ backgroundColor: themeTokens.textColor + '10' }}>
                          <img src={form.thumbnailUrl} className="w-full h-full object-cover" />
                      </div>
                  )}
                  <p className="font-bold text-base leading-snug" style={{ color: themeTokens.textColor }}>{form.name || "Título Destaque"}</p>
                  {form.shortDescription && (
                    <p className="text-sm mt-2 line-clamp-2" style={{ color: themeTokens.textColor, opacity: 0.7 }}>{form.shortDescription}</p>
                  )}
                  <div className="mt-4 py-3 rounded-xl text-white text-sm font-medium text-center" style={{ backgroundColor: themeTokens.primaryColor, borderRadius: themeTokens.buttonRadius, boxShadow: `0 4px 14px ${themeTokens.primaryColor}40` }}>
                    {form.ctaText || "Acessar Agora"}
                  </div>
                </div>
              )}

              {/* Preview Style */}
              {form.cardStyle === "preview" && (
                <div 
                  className="w-full rounded-3xl border overflow-hidden shadow-sm"
                  style={{ borderColor: themeTokens.primaryColor + '40', backgroundColor: themeTokens.backgroundColor }}
                >
                  <div className="h-44 flex items-center justify-center overflow-hidden" style={{ backgroundColor: themeTokens.textColor + '10' }}>
                    {form.thumbnailUrl ? (
                      <img src={form.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-10 w-10" style={{ color: themeTokens.textColor, opacity: 0.3 }} />
                    )}
                  </div>
                  <div className="p-5">
                    <p className="font-bold text-lg leading-snug" style={{ color: themeTokens.textColor }}>{form.name || "Título do produto"}</p>
                    {form.shortDescription && (
                      <p className="text-sm mt-2 line-clamp-2" style={{ color: themeTokens.textColor, opacity: 0.7 }}>{form.shortDescription}</p>
                    )}
                    <div className="mt-4 flex items-center justify-center">
                       <div className="w-full py-2.5 text-white rounded-xl text-sm font-medium text-center" style={{ backgroundColor: themeTokens.primaryColor, borderRadius: themeTokens.buttonRadius }}>
                         {form.ctaText || "Acessar Mídia"}
                       </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Embed Style */}
              {form.cardStyle === "embed" && (
                <div className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm">
                  <div className="w-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                    {embedType === "youtube" ? (
                      <iframe 
                        width="100%" height="180" 
                        src={getYoutubeEmbedUrl(form.targetUrl) || ""} 
                        title="YouTube player" 
                        frameBorder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowFullScreen>
                      </iframe>
                    ) : embedType === "spotify" ? (
                      <iframe 
                        style={{borderRadius: "12px"}} 
                        src={getSpotifyEmbedUrl(form.targetUrl)} 
                        width="100%" 
                        height="152" 
                        frameBorder="0" 
                        allowFullScreen 
                        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
                        loading="lazy">
                      </iframe>
                    ) : embedType === "calendly" || embedType === "notion" ? (
                      <iframe 
                        src={form.targetUrl} 
                        width="100%" 
                        height="200" 
                        frameBorder="0" 
                        loading="lazy">
                      </iframe>
                    ) : (
                      <div className="h-32 flex items-center justify-center flex-col text-zinc-400">
                         <Video className="w-6 h-6 mb-2" />
                         <span className="text-xs">Mídia Embedada Indisponível</span>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm leading-snug">{form.name || "Vídeo Integrado"}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const CARD_STYLES = [
    { key: "preview", label: "Preview Grande", desc: "Destaque visual c/ Link" },
    { key: "callout", label: "Callout", desc: "Imagem menor, foco no texto" },
    { key: "button", label: "Button", desc: "Link rápido e minimalista" },
    ...(!isAffiliate && !isReferralLink ? [{ key: "embed", label: "Embed nativo", desc: "Injeta YouTube ou Spotify" }] : [])
  ];

  if (isReferralLink && isReferralLoading) {
    return <div className="p-10 text-center animate-pulse text-muted-foreground">Verificando convite...</div>;
  }

  if (isReferralLink && !referralProfile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-6">
         <div className="mx-auto w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-6">
            <Link2 className="w-8 h-8 text-purple-600" />
         </div>
         <h2 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">Você ainda não gerou seu Link</h2>
         <p className="text-zinc-500 text-lg">Para adicionar o produto "Indique a Kivo" na sua loja, você precisa primeiro ativar seu painel de parceiro e link de afiliado.</p>
         <Button onClick={() => navigate("/referrals")} className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-12 px-8 shadow-xl shadow-purple-600/20">
           Ir para Painel de Indicações
         </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col lg:flex-row gap-10">
        
        {/* Lado Esquerdo - Formulário */}
        <div className="flex-1 min-w-0">
          <div className="space-y-8 animate-in fade-in pb-10">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Link2 className={isReferralLink ? "w-6 h-6" : "w-6 h-6"} style={{ color: isReferralLink ? themeTokens.primaryColor : themeTokens.primaryColor }} />
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Link2 className="w-5 h-5" style={{ color: themeTokens.primaryColor }} /> {isReferralLink ? "Link de Afiliado" : isAffiliate ? "Link Externo" : "URL / Mídia"}
                  </h2>
                  <p className="text-sm text-muted-foreground">Coloque um link externo, vídeo do YouTube ou embed.</p>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Estilo do Card na Loja</Label>
                  <div className="flex gap-3">
                    {CARD_STYLES.map(({ key, label, desc }) => (
                      <button
                        key={key}
                        onClick={() => setForm(p => ({ ...p, cardStyle: key }))}
                        className={cn(
                          "flex-1 p-3 rounded-xl border-2 text-center transition-all",
                          form.cardStyle === key
                            ? "border-[var(--theme-primary)] bg-[var(--theme-primary)]/5"
                            : "border-border bg-card hover:border-border/80 text-foreground"
                        )}
                      >
                        <p className="text-sm font-semibold">{label}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 hidden sm:block">{desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Nome do Link/Mídia *</Label>
                  <Input placeholder="Ex: meu Video-aula, meu Podcast..." value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} />
                </div>

            {/* URL Destino */}
            <div className={`space-y-4 p-5 rounded-2xl border-2 shadow-sm bg-card`} style={{ borderColor: isReferralLink ? `${themeTokens.primaryColor}30` : `${themeTokens.primaryColor}30` }}>
               <div className="space-y-2">
                 <Label className="text-sm font-semibold">{isReferralLink ? "Link Seguro Kivo" : isAffiliate ? "Seu Link de Afiliado (URL Completa)*" : "Link de Destino / URL do Vídeo *"}</Label>
                 <Input 
                   placeholder="https://..." 
                   className="text-lg font-mono bg-card"
                   value={form.targetUrl} onChange={e => updateForm({targetUrl: e.target.value})}
                   readOnly={isReferralLink}
                 />
                 {embedType === "youtube" && <p className="text-[11px] font-medium" style={{ color: themeTokens.primaryColor }}>✨ Vídeo do YouTube detectado automagicamente!</p>}
                 {embedType === "spotify" && <p className="text-[11px] font-medium" style={{ color: themeTokens.primaryColor }}>✨ Playlist do Spotify detectada automagicamente!</p>}
                 {embedType === "calendly" && <p className="text-[11px] font-medium" style={{ color: themeTokens.primaryColor }}>✨ Agenda do Calendly detectada automagicamente!</p>}
                 {embedType === "notion" && <p className="text-[11px] font-medium" style={{ color: themeTokens.primaryColor }}>✨ Página do Notion detectada automagicamente!</p>}
               </div>
            </div>

            {/* Estilo (Ações de Tela Única tem o formato tudo de uma vez) */}
            <div className="space-y-6 pt-6 border-t border-border/40">
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Exibição na Loja</Label>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {CARD_STYLES.map(({ key, label, desc }) => (
                    <button
                      key={key}
                      onClick={() => updateForm({ cardStyle: key })}
                      className={cn(
                        "flex flex-col items-center justify-center p-3 rounded-xl border-2 text-center transition-all",
                        form.cardStyle === key
                          ? "border-[var(--theme-primary)] bg-[var(--theme-primary)]/5"
                          : "border-border bg-card hover:border-border/80 text-foreground"
                      )}
                    >
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Condicional Imagem */}
              {form.cardStyle !== "button" && form.cardStyle !== "embed" && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Capa (Imagem em Link)</Label>
                  <Input 
                    placeholder="Cole a URL da imagem aqui" 
                    value={form.thumbnailUrl} onChange={e => updateForm({thumbnailUrl: e.target.value})}
                  />
                </div>
              )}

              {/* Textos */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Título do Botão / Link *</Label>
                  <Input 
                    placeholder={isAffiliate ? "Desconto na Plataforma X" : "Canal do Youtube"} 
                    maxLength={80}
                    value={form.name} onChange={e => updateForm({name: e.target.value})}
                  />
                </div>

                {form.cardStyle !== "button" && form.cardStyle !== "embed" && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Por que clicar aqui? (Subtítulo)</Label>
                    <Textarea 
                      placeholder="Use Copywriting para incentivar o clique."
                      maxLength={120}
                      value={form.shortDescription} onChange={e => updateForm({shortDescription: e.target.value})}
                      rows={2}
                      className="resize-none"
                    />
                  </div>
                )}

                {form.cardStyle !== "embed" && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Chamada pra Ação (CTA)</Label>
                    <Input 
                      placeholder="Acessar" 
                      maxLength={30}
                      value={form.ctaText} onChange={e => updateForm({ctaText: e.target.value})}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Ações Fixas Single-Screen */}
            <div className="flex items-center justify-between pt-6 mt-6 border-t border-border/40">
              <Button variant="outline" onClick={() => saveMutation.mutate("DRAFT")}>
                <Save className="h-4 w-4 mr-2" /> Salvar Rascunho
              </Button>
              <Button onClick={() => saveMutation.mutate("PUBLISHED")} className="text-white shadow-xl w-fit sm:w-[250px] transition-transform active:scale-95" style={{ backgroundColor: themeTokens.primaryColor, borderRadius: themeTokens.buttonRadius, boxShadow: `0 10px 15px -3px ${themeTokens.primaryColor}40` }}>
                <Rocket className="h-4 w-4 mr-2" /> Publicar na Loja
              </Button>
            </div>

          </div>
        </div>

        {/* Lado Direito */}
        <MobilePreview />

      </div>
    </div>
  );
}

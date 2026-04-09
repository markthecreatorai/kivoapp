import { useState, useEffect, useCallback } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthProvider";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { StepCard } from "@/components/editor/StepCard";
import {
  Rocket,
  Save,
  Image as ImageIcon,
  Link2,
  Video,
  Trash2,
  Lock
} from "lucide-react";
import kivoReferralLogo from "@/assets/kivo-referral-logo.png";

/* ─────────────── helpers ─────────────── */

const detectEmbed = (url: string) => {
  if (!url) return null;
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("spotify.com")) return "spotify";
  if (url.includes("calendly.com")) return "calendly";
  if (url.includes("notion.site") || url.includes("notion.so")) return "notion";
  return null;
};

const getYoutubeEmbedUrl = (url: string) => {
  const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
  const videoId = match && match[2].length === 11 ? match[2] : null;
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
};

const getSpotifyEmbedUrl = (url: string) =>
  url.replace("open.spotify.com", "open.spotify.com/embed");

const CHAR_MAX_TITLE = 50;
const CHAR_MAX_DESC = 120;
const CHAR_MAX_CTA = 30;

/* ─────────────── component ─────────────── */

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
  const isAffiliateOrReferral = isAffiliate || isReferralLink;
  const { user } = useAuth();
  const navigate = useNavigate();

  /* ── referral profile query (for affiliate AND referral_link) ── */
  const { data: referralProfile, isLoading: isReferralLoading } = useQuery({
    queryKey: ["referralProfile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("referral_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: isAffiliateOrReferral && !!user,
  });

  const [form, setForm] = useState({
    cardStyle: initialProduct.thumbnail_style || (isAffiliateOrReferral ? "callout" : "button"),
    name: initialProduct.name || (isAffiliateOrReferral ? "Crie com a Kivo" : ""),
    shortDescription: initialProduct.short_description || "",
    ctaText: initialProduct.listing_button_text || (isAffiliateOrReferral ? "Apoiar Canal" : "Acessar Link"),
    thumbnailUrl: initialProduct.thumbnail_url || "",
    targetUrl: initialProduct.delivery_url || "",
  });

  /* Auto-fill target URL for affiliate / referral */
  useEffect(() => {
    if (isAffiliateOrReferral && referralProfile?.referral_code && !form.targetUrl) {
      const dynamicUrl = `${window.location.origin}/?ref=${referralProfile.referral_code}`;
      setForm((p) => ({ ...p, targetUrl: dynamicUrl }));
    }
  }, [isAffiliateOrReferral, referralProfile]);

  const updateForm = useCallback(
    (updates: Partial<typeof form>) => setForm((p) => ({ ...p, ...updates })),
    []
  );

  const embedType = detectEmbed(form.targetUrl);

  /* ── save mutation ── */
  const saveMutation = useMutation({
    mutationFn: async (status: "DRAFT" | "PUBLISHED") => {
      setSaving(true);
      const isEmbeddable = embedType !== null && form.cardStyle === "embed";

      const { error: prodError } = await supabase
        .from("products")
        .update({
          status,
          name: form.name,
          short_description: form.shortDescription,
          listing_button_text: form.ctaText,
          thumbnail_style: form.cardStyle,
          thumbnail_url: form.thumbnailUrl,
          delivery_mode: "none",
          delivery_url: form.targetUrl,
          source_url: form.targetUrl,
          is_embeddable: isEmbeddable,
          provider_type: embedType || "external",
        })
        .eq("id", initialProduct.id);

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

  /* ── delete mutation ── */
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("products").delete().eq("id", initialProduct.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produto removido.");
      navigate("/products");
    },
    onError: (err: any) => toast.error("Erro ao remover: " + err.message),
  });

  /* ── loading / missing profile guards ── */
  if (isAffiliateOrReferral && isReferralLoading) {
    return (
      <div className="p-10 text-center animate-pulse text-muted-foreground">
        Verificando convite...
      </div>
    );
  }

  if (isAffiliateOrReferral && !referralProfile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-6">
          <Link2 className="w-8 h-8 text-purple-600" />
        </div>
        <h2 className="text-3xl font-bold">Você ainda não gerou seu Link</h2>
        <p className="text-muted-foreground text-lg">
          Para adicionar o produto "Indique a Kivo" na sua loja, você precisa primeiro ativar seu
          painel de parceiro e link de afiliado.
        </p>
        <Button
          onClick={() => navigate("/referrals")}
          className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-12 px-8 shadow-xl shadow-purple-600/20"
        >
          Ir para Painel de Indicações
        </Button>
      </div>
    );
  }

  /* ────────────────── affiliate-specific card styles ────────────────── */
  const AFFILIATE_CARD_STYLES = [
    { key: "button", label: "Button", desc: "Link rápido e minimalista" },
    { key: "callout", label: "Callout", desc: "Imagem menor, foco no texto" },
  ];

  const GENERIC_CARD_STYLES = [
    { key: "preview", label: "Preview Grande", desc: "Destaque visual c/ Link" },
    { key: "callout", label: "Callout", desc: "Imagem menor, foco no texto" },
    { key: "button", label: "Button", desc: "Link rápido e minimalista" },
    { key: "embed", label: "Embed nativo", desc: "Injeta YouTube ou Spotify" },
  ];

  const CARD_STYLES = isAffiliateOrReferral ? AFFILIATE_CARD_STYLES : GENERIC_CARD_STYLES;

  /* ────────────────── Mobile Preview (shared) ────────────────── */
  const MobilePreview = () => (
    <div className="hidden lg:block w-[320px] shrink-0 sticky top-24">
      <p className="text-xs font-medium text-muted-foreground/60 mb-3 text-center uppercase tracking-widest font-semibold flex items-center justify-center gap-1">
        <Link2 className="w-3 h-3" /> Preview
      </p>
      <div className="w-[320px] h-[600px] bg-black rounded-[40px] p-2 shadow-xl flex flex-col justify-start">
        <div className="w-full h-full rounded-[32px] overflow-hidden bg-[hsl(var(--background))] flex flex-col relative overflow-y-auto">
          <div className="w-32 h-6 bg-black absolute top-0 inset-x-0 mx-auto rounded-b-xl z-20" />
          <div className="p-4 pt-10 flex flex-col items-center h-full">
            {form.cardStyle === "button" && isAffiliateOrReferral && (
              <div className="w-full rounded-2xl border bg-card p-4 shadow-sm flex items-center gap-3">
                <img
                  src={form.thumbnailUrl || kivoReferralLogo}
                  alt=""
                  className="w-12 h-12 rounded-2xl object-cover shrink-0"
                />
                <p className="font-bold text-sm leading-snug truncate">{form.name || "Acesso Rápido"}</p>
              </div>
            )}
            {form.cardStyle === "button" && !isAffiliateOrReferral && (
              <div className="w-full py-4 px-6 rounded-2xl border-2 border-primary bg-card text-center text-sm font-bold shadow-sm truncate">
                {form.name || "Acesso Rápido"}
              </div>
            )}
            {form.cardStyle === "callout" && isAffiliateOrReferral && (
              <div className="w-full rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <img
                    src={form.thumbnailUrl || kivoReferralLogo}
                    alt=""
                    className="w-12 h-12 rounded-2xl object-cover shrink-0"
                  />
                  <p className="font-bold text-base leading-snug">{form.name || "Título Destaque"}</p>
                </div>
                {form.shortDescription && (
                  <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                    {form.shortDescription}
                  </p>
                )}
                <div className="mt-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium text-center">
                  {form.ctaText || "Acessar"}
                </div>
              </div>
            )}
            {form.cardStyle === "callout" && !isAffiliateOrReferral && (
              <div className="w-full rounded-2xl border bg-card p-4 shadow-sm">
                {form.thumbnailUrl && (
                  <div className="h-32 bg-muted overflow-hidden rounded-xl mb-4">
                    <img src={form.thumbnailUrl} className="w-full h-full object-cover" alt="" />
                  </div>
                )}
                <p className="font-bold text-base leading-snug">{form.name || "Título Destaque"}</p>
                {form.shortDescription && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                    {form.shortDescription}
                  </p>
                )}
                <div className="mt-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium text-center">
                  {form.ctaText || "Acessar"}
                </div>
              </div>
            )}
            {form.cardStyle === "preview" && (
              <div className="w-full rounded-3xl border bg-card overflow-hidden shadow-sm">
                <div className="h-44 bg-muted flex items-center justify-center overflow-hidden">
                  {form.thumbnailUrl ? (
                    <img src={form.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
                  )}
                </div>
                <div className="p-5">
                  <p className="font-bold text-lg leading-snug">{form.name || "Título do produto"}</p>
                  {form.shortDescription && (
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                      {form.shortDescription}
                    </p>
                  )}
                  <div className="mt-4 w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium text-center">
                    {form.ctaText || "Acessar Mídia"}
                  </div>
                </div>
              </div>
            )}
            {form.cardStyle === "embed" && (
              <div className="w-full rounded-2xl border bg-card overflow-hidden shadow-sm">
                <div className="w-full bg-muted flex items-center justify-center">
                  {embedType === "youtube" ? (
                    <iframe width="100%" height="180" src={getYoutubeEmbedUrl(form.targetUrl) || ""} title="YouTube" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                  ) : embedType === "spotify" ? (
                    <iframe style={{ borderRadius: "12px" }} src={getSpotifyEmbedUrl(form.targetUrl)} width="100%" height="152" frameBorder="0" allowFullScreen allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" />
                  ) : embedType === "calendly" || embedType === "notion" ? (
                    <iframe src={form.targetUrl} width="100%" height="200" frameBorder="0" loading="lazy" />
                  ) : (
                    <div className="h-32 flex items-center justify-center flex-col text-muted-foreground">
                      <Video className="w-6 h-6 mb-2" />
                      <span className="text-xs">Mídia Embedada Indisponível</span>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <p className="font-bold text-sm leading-snug">{form.name || "Vídeo Integrado"}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════════════════════
     AFFILIATE / REFERRAL LAYOUT — StepCard-based (Stan Store)
     ═══════════════════════════════════════════════════════════ */
  if (isAffiliateOrReferral) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-10">
          {/* Left — Form */}
          <div className="flex-1 min-w-0 space-y-6 animate-in fade-in pb-10">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Link2 className="w-6 h-6 text-purple-500" />
                {isReferralLink ? "Sua Indicação Kivo" : "Link de Afiliado Kivo"}
              </h2>
              <p className="text-sm text-muted-foreground">
                Recomende a Kivo para sua audiência e ganhe 20% de comissão recorrente lifetime.
              </p>
            </div>

            {/* Step 1 — Card style */}
            <StepCard
              stepNumber={1}
              title="Escolha o estilo"
              description="Como o link aparecerá na sua vitrine"
              completed={!!form.cardStyle}
            >
              <div className="grid grid-cols-2 gap-3">
                {CARD_STYLES.map(({ key, label, desc }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => updateForm({ cardStyle: key })}
                    className={cn(
                      "flex flex-col items-center justify-center p-4 rounded-xl border-2 text-center transition-all",
                      form.cardStyle === key
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border bg-card hover:border-border/80"
                    )}
                  >
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{desc}</p>
                  </button>
                ))}
              </div>
            </StepCard>

            {/* Step 2 — Cover image */}
            <StepCard
              stepNumber={2}
              title="Imagem de capa"
              description="Recomendado: 400×400 px"
              completed={!!form.thumbnailUrl}
            >
              {form.thumbnailUrl ? (
                <div className="space-y-3">
                  <div className="w-full max-w-[200px] aspect-square rounded-2xl overflow-hidden border bg-muted">
                    <img src={form.thumbnailUrl} alt="Capa" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const url = prompt("Nova URL da imagem:", form.thumbnailUrl);
                        if (url !== null) updateForm({ thumbnailUrl: url });
                      }}
                    >
                      Trocar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => updateForm({ thumbnailUrl: "" })}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative w-full max-w-[200px]">
                    <div className="aspect-square rounded-2xl overflow-hidden border bg-muted">
                      <img src={kivoReferralLogo} alt="Padrão" className="w-full h-full object-cover" />
                    </div>
                    <span className="absolute top-2 right-2 text-[10px] font-medium bg-background/80 backdrop-blur-sm border rounded-md px-1.5 py-0.5">Padrão</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const url = prompt("Cole a URL da nova imagem:");
                        if (url) updateForm({ thumbnailUrl: url });
                      }}
                    >
                      Trocar
                    </Button>
                  </div>
                </div>
              )}
            </StepCard>

            {/* Step 3 — Texts + locked URL */}
            <StepCard
              stepNumber={3}
              title="Textos"
              description="Título e link de afiliado"
              completed={form.name.length >= 3}
            >
              <div className="space-y-4">
                {/* Title */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Título *</Label>
                    <span className={cn("text-xs", form.name.length > CHAR_MAX_TITLE ? "text-destructive" : "text-muted-foreground")}>
                      {form.name.length}/{CHAR_MAX_TITLE}
                    </span>
                  </div>
                  <Input
                    placeholder="Ex: Crie sua Loja Kivo"
                    maxLength={CHAR_MAX_TITLE}
                    value={form.name}
                    onChange={(e) => updateForm({ name: e.target.value })}
                  />
                </div>

                {/* Button URL — locked */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    Button URL
                  </Label>
                  <Input
                    value={form.targetUrl}
                    readOnly
                    className="bg-muted text-muted-foreground cursor-not-allowed font-mono text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Link gerado automaticamente a partir do seu painel de indicações.
                  </p>
                </div>
              </div>
            </StepCard>

            {/* Footer actions */}
            <div className="flex items-center justify-between pt-6 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => {
                  if (confirm("Tem certeza que deseja remover este produto?")) {
                    deleteMutation.mutate();
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => saveMutation.mutate("DRAFT")} disabled={saveMutation.isPending}>
                  <Save className="h-4 w-4 mr-2" /> Salvar Rascunho
                </Button>
                <Button
                  onClick={() => saveMutation.mutate("PUBLISHED")}
                  disabled={saveMutation.isPending || form.name.length < 3}
                  className="bg-primary text-primary-foreground shadow-xl w-fit sm:w-[200px] transition-transform active:scale-95"
                >
                  <Rocket className="h-4 w-4 mr-2" /> Publicar
                </Button>
              </div>
            </div>
          </div>

          {/* Right — Preview */}
          <MobilePreview />
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════
     GENERIC LAYOUT (url_media — original)
     ═══════════════════════════════════════════════════════════ */
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col lg:flex-row gap-10">
        <div className="flex-1 min-w-0">
          <div className="space-y-8 animate-in fade-in pb-10">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Link2 className="w-6 h-6 text-primary" />
                URL, Mídia ou Link Externo
              </h2>
              <p className="text-sm text-muted-foreground">
                Adicione uma URL rápida, direcione para seu site principal, ou faça sua vitrine rodar
                um vídeo do Youtube/Spotify direto nela.
              </p>
            </div>

            {/* URL Destino */}
            <div className="space-y-4 p-5 rounded-2xl border-2 shadow-sm border-primary/30 bg-primary/5">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Link de Destino / URL do Vídeo *</Label>
                <Input
                  placeholder="https://..."
                  className="text-lg font-mono border-primary focus-visible:ring-primary"
                  value={form.targetUrl}
                  onChange={(e) => updateForm({ targetUrl: e.target.value })}
                />
                {embedType === "youtube" && <p className="text-[11px] text-green-600 font-medium">✨ Vídeo do YouTube detectado!</p>}
                {embedType === "spotify" && <p className="text-[11px] text-green-600 font-medium">✨ Playlist do Spotify detectada!</p>}
                {embedType === "calendly" && <p className="text-[11px] text-green-600 font-medium">✨ Agenda do Calendly detectada!</p>}
                {embedType === "notion" && <p className="text-[11px] text-green-600 font-medium">✨ Página do Notion detectada!</p>}
              </div>
            </div>

            {/* Estilo */}
            <div className="space-y-6 pt-6 border-t border-border/40">
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Exibição na Loja</Label>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {CARD_STYLES.map(({ key, label, desc }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => updateForm({ cardStyle: key })}
                      className={cn(
                        "flex flex-col items-center justify-center p-3 rounded-xl border-2 text-center transition-all",
                        form.cardStyle === key
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border bg-card hover:border-border/80"
                      )}
                    >
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {form.cardStyle !== "button" && form.cardStyle !== "embed" && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Capa (Imagem em Link)</Label>
                  <Input
                    placeholder="Cole a URL da imagem aqui"
                    value={form.thumbnailUrl}
                    onChange={(e) => updateForm({ thumbnailUrl: e.target.value })}
                  />
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Título do Botão / Link *</Label>
                  <Input
                    placeholder="Canal do Youtube"
                    maxLength={80}
                    value={form.name}
                    onChange={(e) => updateForm({ name: e.target.value })}
                  />
                </div>

                {form.cardStyle !== "button" && form.cardStyle !== "embed" && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Por que clicar aqui? (Subtítulo)</Label>
                    <Textarea
                      placeholder="Use Copywriting para incentivar o clique."
                      maxLength={CHAR_MAX_DESC}
                      value={form.shortDescription}
                      onChange={(e) => updateForm({ shortDescription: e.target.value })}
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
                      maxLength={CHAR_MAX_CTA}
                      value={form.ctaText}
                      onChange={(e) => updateForm({ ctaText: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Ações */}
            <div className="flex items-center justify-between pt-6 mt-6 border-t border-border/40">
              <Button variant="outline" onClick={() => saveMutation.mutate("DRAFT")}>
                <Save className="h-4 w-4 mr-2" /> Salvar Rascunho
              </Button>
              <Button
                onClick={() => saveMutation.mutate("PUBLISHED")}
                className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-xl w-fit sm:w-[250px] transition-transform active:scale-95"
              >
                <Rocket className="h-4 w-4 mr-2" /> Publicar na Loja
              </Button>
            </div>
          </div>
        </div>

        <MobilePreview />
      </div>
    </div>
  );
}
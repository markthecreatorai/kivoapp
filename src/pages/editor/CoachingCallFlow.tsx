import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Rocket, Save, Mail, ChevronDown, ChevronUp,
  Image as ImageIcon, Lock, MessageSquare, ShoppingCart,
  Users, Video, Plus, Trash2, Calendar, Clock, Bell, X
} from "lucide-react";
import { FormFieldsBuilder } from "@/components/FormFieldsBuilder";
import { ReviewsBuilder } from "@/components/ReviewsBuilder";

const DAYS = [
  { key: 0, label: "Domingo" },
  { key: 1, label: "Segunda-feira" },
  { key: 2, label: "Terça-feira" },
  { key: 3, label: "Quarta-feira" },
  { key: 4, label: "Quinta-feira" },
  { key: 5, label: "Sexta-feira" },
  { key: 6, label: "Sábado" },
];

type TimeSlot = { start: string; end: string };
type DaySchedule = { active: boolean; slots: TimeSlot[] };
type WeekSchedule = Record<number, DaySchedule>;
type ReminderTiming = { id: string; amount: number; unit: "minutes" | "hours" | "days" };

const defaultWeek = (): WeekSchedule => {
  const w: WeekSchedule = {};
  DAYS.forEach(({ key }) => {
    w[key] = {
      active: key >= 1 && key <= 5,
      slots: key >= 1 && key <= 5 ? [{ start: "09:00", end: "18:00" }] : [],
    };
  });
  return w;
};

export default function CoachingCallFlow({
  initialProduct,
  setSaving,
}: {
  initialProduct: any;
  setSaving: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("thumbnail");
  const meta = (initialProduct.metadata as any) || {};
  const initialPriceConfig = initialProduct.prices?.[0] || { amount: 0, compare_at_amount: null };

  // ── Form State ──────────────────────────────────────────────
  const [form, setForm] = useState({
    cardStyle: initialProduct.thumbnail_style || "preview",
    name: initialProduct.name || "",
    shortDescription: initialProduct.short_description || "",
    ctaText: initialProduct.listing_button_text || "Agendar Call",
    thumbnailUrl: initialProduct.thumbnail_url || "",
    checkoutImage: initialProduct.checkout_image || "",
    description: initialProduct.checkout_description || "",
    isFree: initialPriceConfig.amount === 0,
    price: initialPriceConfig.amount || 0,
    compareAtPrice: initialPriceConfig.compare_at_amount ?? null,
    // Disponibilidade
    provider: meta.meeting_provider || "google_meet",
    timezone: meta.timezone || "America/Sao_Paulo",
    durationMinutes: meta.duration_minutes || 60,
    preventBookingWithinHours: meta.prevent_booking_within_hours || 12,
    maxAttendees: meta.max_attendees || 1,
    breakBeforeMinutes: meta.break_before_minutes || 0,
    breakAfterMinutes: meta.break_after_minutes || 0,
    bookWithinDays: meta.book_within_days || 60,
    // Email
    confirmationSubject: initialProduct.confirmation_email_subject || "Call Agendada com Sucesso!",
    confirmationBody: initialProduct.confirmation_email_body || "Sua call foi confirmada. Você receberá o link da reunião em breve.",
  });

  const updateForm = (u: Partial<typeof form>) => setForm(p => ({ ...p, ...u }));

  const [weekSchedule, setWeekSchedule] = useState<WeekSchedule>(
    meta.week_schedule ? JSON.parse(JSON.stringify(meta.week_schedule)) : defaultWeek()
  );

  const [blockedDates, setBlockedDates] = useState<{ id: string; start: string; end: string; reason: string }[]>(
    meta.blocked_dates || []
  );

  const [reminders, setReminders] = useState<ReminderTiming[]>(
    meta.reminders || [
      { id: "1", amount: 24, unit: "hours" },
      { id: "2", amount: 1, unit: "hours" },
    ]
  );

  const [openEmail, setOpenEmail] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockForm, setBlockForm] = useState({ start: "", end: "", reason: "" });

  // ── Weekly Schedule Helpers ──────────────────────────────────
  const toggleDay = (day: number) => {
    setWeekSchedule(prev => {
      const d = prev[day];
      return {
        ...prev,
        [day]: {
          ...d,
          active: !d.active,
          slots: !d.active && d.slots.length === 0 ? [{ start: "09:00", end: "18:00" }] : d.slots,
        },
      };
    });
  };

  const addSlot = (day: number) => {
    setWeekSchedule(prev => ({
      ...prev,
      [day]: { ...prev[day], slots: [...prev[day].slots, { start: "09:00", end: "18:00" }] },
    }));
  };

  const removeSlot = (day: number, idx: number) => {
    setWeekSchedule(prev => ({
      ...prev,
      [day]: { ...prev[day], slots: prev[day].slots.filter((_, i) => i !== idx) },
    }));
  };

  const updateSlot = (day: number, idx: number, field: "start" | "end", value: string) => {
    setWeekSchedule(prev => {
      const slots = [...prev[day].slots];
      slots[idx] = { ...slots[idx], [field]: value };
      return { ...prev, [day]: { ...prev[day], slots } };
    });
  };

  // ── Reminders Helpers ────────────────────────────────────────
  const addReminder = () =>
    setReminders(r => [...r, { id: Date.now().toString(), amount: 1, unit: "hours" }]);

  const removeReminder = (id: string) =>
    setReminders(r => r.filter(x => x.id !== id));

  const updateReminder = (id: string, updates: Partial<ReminderTiming>) =>
    setReminders(r => r.map(x => (x.id === id ? { ...x, ...updates } : x)));

  // ── Save ─────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (status: "DRAFT" | "PUBLISHED") => {
      setSaving(true);
      const updatedMeta = {
        ...meta,
        format_id: "coaching_call",
        meeting_provider: form.provider,
        timezone: form.timezone,
        duration_minutes: form.durationMinutes,
        prevent_booking_within_hours: form.preventBookingWithinHours,
        max_attendees: form.maxAttendees,
        break_before_minutes: form.breakBeforeMinutes,
        break_after_minutes: form.breakAfterMinutes,
        book_within_days: form.bookWithinDays,
        week_schedule: weekSchedule,
        blocked_dates: blockedDates,
        reminders,
      };

      const { error } = await supabase.from("products").update({
        status,
        name: form.name,
        short_description: form.shortDescription,
        listing_button_text: form.ctaText,
        thumbnail_style: form.cardStyle,
        thumbnail_url: form.thumbnailUrl,
        checkout_image: form.checkoutImage,
        checkout_description: form.description,
        delivery_mode: "url",
        confirmation_email_subject: form.confirmationSubject,
        confirmation_email_body: form.confirmationBody,
        metadata: updatedMeta,
      }).eq("id", initialProduct.id);

      if (error) throw error;

      if (initialPriceConfig.id) {
        await supabase.from("prices").update({
          amount: form.isFree ? 0 : form.price,
          compare_at_amount: form.compareAtPrice,
        }).eq("id", initialPriceConfig.id);
      } else {
        await supabase.from("prices").insert({
          product_id: initialProduct.id,
          amount: form.isFree ? 0 : form.price,
          compare_at_amount: form.compareAtPrice,
          type: "ONE_TIME",
        });
      }

      return status;
    },
    onSuccess: status => {
      queryClient.invalidateQueries({ queryKey: ["product", initialProduct.id] });
      toast.success(status === "PUBLISHED" ? "Call publicada!" : "Rascunho salvo!");
    },
    onError: (err: any) => toast.error("Erro ao salvar: " + err.message),
    onSettled: () => setSaving(false),
  });

  const TABS = ["thumbnail", "checkout", "disponibilidade", "opcoes"];
  const handleNext = () => {
    const idx = TABS.indexOf(tab);
    if (tab === "thumbnail" && !form.name.trim()) { toast.error("Informe o título."); return; }
    if (tab === "checkout" && !form.isFree && form.price <= 0) { toast.error("Informe um preço válido."); return; }
    if (idx < TABS.length - 1) setTab(TABS[idx + 1]);
  };

  const CARD_STYLES = [
    { key: "preview", label: "Preview", desc: "Imagem grande + detalhes" },
    { key: "callout", label: "Callout", desc: "Card com CTA" },
    { key: "button", label: "Button", desc: "Link minimalista" },
  ];

  // ── Mobile Preview ────────────────────────────────────────────
  const MobilePreview = () => (
    <div className="hidden lg:block w-[300px] shrink-0 sticky top-24">
      <p className="text-xs font-medium text-green-600/70 mb-3 text-center uppercase tracking-widest font-semibold flex items-center justify-center gap-1">
        <Video className="w-3 h-3" /> Preview de Agendamento
      </p>
      <div className="w-[300px] h-[580px] bg-black rounded-[40px] p-2 shadow-xl">
        <div className="w-full h-full rounded-[32px] overflow-hidden bg-[#F5F5F5] dark:bg-zinc-950 flex flex-col relative overflow-y-auto">
          <div className="w-28 h-5 bg-black absolute top-0 inset-x-0 mx-auto rounded-b-xl z-20" />

          {tab === "thumbnail" && (
            <div className="p-4 pt-10 flex items-center h-full">
              {form.cardStyle === "button" && (
                <div className="w-full py-4 px-5 rounded-2xl border-2 border-green-600 bg-white dark:bg-zinc-900 text-center text-sm font-bold truncate">
                  {form.name || "Nome da Call"}
                </div>
              )}
              {form.cardStyle === "callout" && (
                <div className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
                  {form.thumbnailUrl ? (
                    <div className="h-28 rounded-xl mb-3 overflow-hidden">
                      <img src={form.thumbnailUrl} className="w-full h-full object-cover" />
                    </div>
                  ) : null}
                  <p className="font-bold text-lg leading-snug">{form.name || "Título da Call"}</p>
                  {form.shortDescription && <p className="text-sm text-zinc-500 mt-1 line-clamp-2">{form.shortDescription}</p>}
                  <div className="mt-4 py-3 rounded-xl bg-green-600 text-white text-sm font-medium text-center">
                    {form.ctaText || "Agendar Call"}
                  </div>
                </div>
              )}
              {form.cardStyle === "preview" && (
                <div className="w-full rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm">
                  <div className="h-40 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
                    {form.thumbnailUrl ? (
                      <img src={form.thumbnailUrl} className="w-full h-full object-cover" />
                    ) : <ImageIcon className="h-8 w-8 text-zinc-300" />}
                  </div>
                  <div className="p-4">
                    <p className="font-bold text-lg leading-snug">{form.name || "Call / Consultoria"}</p>
                    {form.shortDescription && <p className="text-sm text-zinc-500 mt-1 line-clamp-2">{form.shortDescription}</p>}
                    <div className="mt-3 flex items-center justify-between">
                      <span className="font-bold">{form.isFree ? "Gratuito" : `R$ ${(form.price || 0).toFixed(2).replace(".", ",")}`}</span>
                      <div className="py-2 px-4 bg-green-600 text-white rounded-xl text-sm font-medium">{form.ctaText || "Agendar"}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {(tab === "checkout" || tab === "disponibilidade" || tab === "opcoes") && (
            <div className="bg-white dark:bg-zinc-900 min-h-full">
              {form.checkoutImage && (
                <div className="h-40 overflow-hidden">
                  <img src={form.checkoutImage} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-4 space-y-3 pt-10">
                <p className="font-bold text-lg">{form.name || "Call / Consultoria"}</p>
                {!form.isFree && form.price > 0 && (
                  <span className="text-2xl font-bold text-green-600">
                    R$ {form.price.toFixed(2).replace(".", ",")}
                  </span>
                )}
                {form.isFree && <span className="text-xl font-bold text-green-600">Agendamento Gratuito</span>}

                {/* Fake calendar grid */}
                <div className="border border-green-200 rounded-xl p-3 bg-green-50/40">
                  <p className="text-xs font-bold text-green-700 mb-2 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Escolha um horário disponível
                  </p>
                  <div className="grid grid-cols-3 gap-1">
                    {["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"].map(t => (
                      <div key={t} className="text-center text-[10px] font-semibold py-1.5 rounded-lg bg-white border border-green-200 text-green-700 cursor-pointer hover:bg-green-100">
                        {t}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <div className="w-full py-3.5 rounded-xl bg-green-600 text-white font-medium text-center text-sm shadow-lg shadow-green-600/20">
                    {form.ctaText || "Confirmar Agendamento"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col lg:flex-row gap-10">

        {/* ── Left: Form ── */}
        <div className="flex-1 min-w-0">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="bg-muted/50 p-1 w-full flex mb-6">
              <TabsTrigger value="thumbnail" className="flex-1 text-xs sm:text-sm">1. Thumbnail</TabsTrigger>
              <TabsTrigger value="checkout" className="flex-1 text-xs sm:text-sm">2. Checkout</TabsTrigger>
              <TabsTrigger value="disponibilidade" className="flex-1 text-xs sm:text-sm">3. Disponibilidade</TabsTrigger>
              <TabsTrigger value="opcoes" className="flex-1 text-xs sm:text-sm">4. Opções</TabsTrigger>
            </TabsList>

            {/* ══ ABA 1: THUMBNAIL ══ */}
            <TabsContent value="thumbnail" className="space-y-8 animate-in fade-in">
              <div className="space-y-2">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Video className="w-5 h-5 text-green-600" /> Call / Consultoria
                </h2>
                <p className="text-sm text-muted-foreground">Configure como sua sessão aparece na vitrine da loja.</p>
              </div>

              {/* Style selector */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Estilo do card na loja</Label>
                <div className="flex gap-3">
                  {CARD_STYLES.map(({ key, label, desc }) => (
                    <button
                      key={key}
                      onClick={() => updateForm({ cardStyle: key })}
                      className={cn(
                        "flex-1 p-3 rounded-xl border-2 text-center transition-all",
                        form.cardStyle === key
                          ? "border-green-600 bg-green-600/5 text-green-700"
                          : "border-border bg-card hover:border-border/80"
                      )}
                    >
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="text-[10px] text-muted-foreground mt-1 hidden sm:block">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {form.cardStyle !== "button" && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Imagem de capa (URL)</Label>
                  <Input placeholder="https://..." value={form.thumbnailUrl} onChange={e => updateForm({ thumbnailUrl: e.target.value })} />
                  <p className="text-[11px] text-muted-foreground">Imagem do palestrante ou identidade visual (recomendado 16:9).</p>
                </div>
              )}

              <div className="space-y-4 border-t border-border/40 pt-6">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Nome da sessão *</Label>
                  <Input placeholder="Ex: Mentoria de Estratégia 1:1" maxLength={80} value={form.name} onChange={e => updateForm({ name: e.target.value })} />
                  <p className="text-right text-[10px] text-muted-foreground">{form.name.length}/80</p>
                </div>

                {form.cardStyle !== "button" && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Subtítulo</Label>
                    <Textarea placeholder="O que o cliente vai levar dessa sessão?" maxLength={120} value={form.shortDescription} onChange={e => updateForm({ shortDescription: e.target.value })} rows={2} className="resize-none" />
                    <p className="text-right text-[10px] text-muted-foreground">{form.shortDescription.length}/120</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Texto do botão na vitrine</Label>
                  <Input placeholder="Agendar Call" maxLength={30} value={form.ctaText} onChange={e => updateForm({ ctaText: e.target.value })} />
                </div>
              </div>
            </TabsContent>

            {/* ══ ABA 2: CHECKOUT ══ */}
            <TabsContent value="checkout" className="space-y-8 animate-in fade-in">
              <div className="space-y-2">
                <h2 className="text-xl font-bold">Página de Checkout</h2>
                <p className="text-sm text-muted-foreground">Página de vendas da sua sessão: imagem, descrição e preço.</p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Imagem principal (Hero Image)</Label>
                <Input placeholder="https://..." value={form.checkoutImage} onChange={e => updateForm({ checkoutImage: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Descrição / Apresentação da oferta</Label>
                <Textarea placeholder="Descreva o que será abordado na call, os benefícios e para quem é..." value={form.description} onChange={e => updateForm({ description: e.target.value })} rows={5} className="resize-none" />
              </div>

              <div className="space-y-4 p-5 rounded-2xl border border-border/60 bg-card shadow-sm">
                <p className="text-base font-semibold">Valor por sessão</p>
                <div className="flex items-center gap-3">
                  <Switch checked={form.isFree} onCheckedChange={v => updateForm({ isFree: v })} id="is-free-call" />
                  <Label htmlFor="is-free-call" className="text-sm cursor-pointer">Sessão gratuita (diagnóstico, discovery)</Label>
                </div>
                {!form.isFree && (
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Preço (R$) *</Label>
                      <Input type="number" min={0} step={0.01} placeholder="0,00" className="text-lg font-mono font-medium" value={form.price || ""} onChange={e => updateForm({ price: Number(e.target.value) })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Preço original (ancoragem)</Label>
                      <Input type="number" min={0} step={0.01} placeholder="Opcional" value={form.compareAtPrice ?? ""} onChange={e => updateForm({ compareAtPrice: e.target.value ? Number(e.target.value) : null })} />
                    </div>
                  </div>
                )}
              </div>

              {/* Formulário / Dados do Cliente */}
              <div className="space-y-4 pt-4 mt-6 border-t border-border/40">
                   <div className="space-y-1">
                     <p className="text-base font-semibold text-foreground">Construtor de Briefing / Formulário</p>
                     <p className="text-sm text-muted-foreground">O que o cliente precisa responder antes de agendar a sessão?</p>
                   </div>
                   <FormFieldsBuilder productId={initialProduct.id} />
              </div>
            </TabsContent>

            {/* ══ ABA 3: DISPONIBILIDADE ══ */}
            <TabsContent value="disponibilidade" className="space-y-8 animate-in fade-in">
              <div className="space-y-2">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Clock className="w-5 h-5 text-green-600" /> Disponibilidade
                </h2>
                <p className="text-sm text-muted-foreground">Configure quando e como os clientes podem agendar.</p>
              </div>

              {/* Setting cards */}
              <div className="space-y-4 p-5 rounded-2xl border border-border/60 bg-card shadow-sm">
                <p className="text-sm font-semibold border-b border-border/40 pb-3 mb-1">Configurações da sessão</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Plataforma de reunião</Label>
                    <Select value={form.provider} onValueChange={v => updateForm({ provider: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="google_meet">Google Meet</SelectItem>
                        <SelectItem value="zoom">Zoom</SelectItem>
                        <SelectItem value="teams">Microsoft Teams</SelectItem>
                        <SelectItem value="custom">Link personalizado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Duração (minutos)</Label>
                    <Select value={String(form.durationMinutes)} onValueChange={v => updateForm({ durationMinutes: Number(v) })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[15, 30, 45, 60, 90, 120].map(d => (
                          <SelectItem key={d} value={String(d)}>{d} min</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Antecedência mínima (horas)</Label>
                    <Input type="number" min={0} value={form.preventBookingWithinHours} onChange={e => updateForm({ preventBookingWithinHours: Number(e.target.value) })} />
                    <p className="text-[10px] text-muted-foreground">Ex: 12 = cliente deve agendar com 12h de antecedência</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Janela de agendamento (dias)</Label>
                    <Input type="number" min={1} value={form.bookWithinDays} onChange={e => updateForm({ bookWithinDays: Number(e.target.value) })} />
                    <p className="text-[10px] text-muted-foreground">Quantos dias à frente o cliente pode agendar</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Intervalo antes (min)</Label>
                    <Input type="number" min={0} step={5} value={form.breakBeforeMinutes} onChange={e => updateForm({ breakBeforeMinutes: Number(e.target.value) })} />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Intervalo depois (min)</Label>
                    <Input type="number" min={0} step={5} value={form.breakAfterMinutes} onChange={e => updateForm({ breakAfterMinutes: Number(e.target.value) })} />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Máx. participantes por slot</Label>
                    <Input type="number" min={1} value={form.maxAttendees} onChange={e => updateForm({ maxAttendees: Number(e.target.value) })} />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Fuso horário</Label>
                    <Select value={form.timezone} onValueChange={v => updateForm({ timezone: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="America/Sao_Paulo">Brasília (BRT)</SelectItem>
                        <SelectItem value="America/Manaus">Manaus (AMT)</SelectItem>
                        <SelectItem value="America/Fortaleza">Fortaleza (BRT)</SelectItem>
                        <SelectItem value="America/New_York">Nova York (EST)</SelectItem>
                        <SelectItem value="Europe/Lisbon">Lisboa (WET)</SelectItem>
                        <SelectItem value="UTC">UTC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Weekly schedule */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Horários semanais</p>
                  <p className="text-xs text-muted-foreground">Ative os dias e defina os intervalos</p>
                </div>

                <div className="rounded-2xl border border-border/60 overflow-hidden">
                  {DAYS.map(({ key, label }) => {
                    const day = weekSchedule[key];
                    return (
                      <div key={key} className={cn("border-b border-border/40 last:border-b-0", !day.active && "bg-muted/20")}>
                        <div className="flex items-center gap-3 px-4 py-3">
                          <Switch checked={day.active} onCheckedChange={() => toggleDay(key)} />
                          <span className={cn("text-sm font-medium w-32", day.active ? "text-foreground" : "text-muted-foreground")}>{label}</span>

                          {day.active ? (
                            <div className="flex-1 flex flex-col gap-2">
                              {day.slots.map((slot, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                  <Input
                                    type="time"
                                    value={slot.start}
                                    onChange={e => updateSlot(key, idx, "start", e.target.value)}
                                    className="h-8 w-24 text-xs"
                                  />
                                  <span className="text-muted-foreground text-xs">—</span>
                                  <Input
                                    type="time"
                                    value={slot.end}
                                    onChange={e => updateSlot(key, idx, "end", e.target.value)}
                                    className="h-8 w-24 text-xs"
                                  />
                                  <button onClick={() => removeSlot(key, idx)} className="text-muted-foreground hover:text-destructive transition-colors ml-1">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                  {idx === day.slots.length - 1 && (
                                    <button onClick={() => addSlot(key)} className="text-green-600 hover:text-green-700 transition-colors ml-1">
                                      <Plus className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              ))}
                              {day.slots.length === 0 && (
                                <button onClick={() => addSlot(key)} className="text-xs text-green-600 flex items-center gap-1 hover:underline">
                                  <Plus className="h-3 w-3" /> Adicionar horário
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Indisponível</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Block dates */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Datas bloqueadas</p>
                    <p className="text-xs text-muted-foreground">Férias, feriados ou qualquer período indisponível</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setShowBlockModal(true)}>
                    <Calendar className="h-3.5 w-3.5 mr-2" /> Bloquear período
                  </Button>
                </div>

                {blockedDates.length > 0 ? (
                  <div className="space-y-2">
                    {blockedDates.map(b => (
                      <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card">
                        <div className="flex-1 text-sm">
                          <span className="font-medium">{b.start}</span>
                          {b.end && b.end !== b.start && <><span className="text-muted-foreground mx-1">→</span><span className="font-medium">{b.end}</span></>}
                          {b.reason && <p className="text-xs text-muted-foreground mt-0.5">{b.reason}</p>}
                        </div>
                        <button onClick={() => setBlockedDates(d => d.filter(x => x.id !== b.id))} className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-5 rounded-xl border border-dashed border-border/60 text-center text-sm text-muted-foreground">
                    Nenhuma data bloqueada ainda.
                  </div>
                )}

                {/* Block Date Modal */}
                {showBlockModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-foreground">Bloquear período</h3>
                        <button onClick={() => setShowBlockModal(false)}>
                          <X className="h-5 w-5 text-muted-foreground" />
                        </button>
                      </div>
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">Data inicial</Label>
                          <Input type="date" value={blockForm.start} onChange={e => setBlockForm(p => ({ ...p, start: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">Data final (opcional)</Label>
                          <Input type="date" value={blockForm.end} onChange={e => setBlockForm(p => ({ ...p, end: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">Motivo (opcional)</Label>
                          <Input placeholder="Ex: Férias, feriado..." value={blockForm.reason} onChange={e => setBlockForm(p => ({ ...p, reason: e.target.value }))} />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" className="flex-1" onClick={() => setShowBlockModal(false)}>Cancelar</Button>
                        <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => {
                          if (!blockForm.start) { toast.error("Informe a data inicial."); return; }
                          setBlockedDates(d => [...d, { id: Date.now().toString(), ...blockForm }]);
                          setBlockForm({ start: "", end: "", reason: "" });
                          setShowBlockModal(false);
                        }}>
                          Confirmar bloqueio
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ══ ABA 4: OPÇÕES ══ */}
            <TabsContent value="opcoes" className="space-y-6 animate-in fade-in">
              <div className="space-y-2">
                <h2 className="text-xl font-bold">Opções e Lembretes</h2>
                <p className="text-sm text-muted-foreground">Configure lembretes automáticos e o e-mail de confirmação.</p>
              </div>

              <div className="space-y-3">
                {/* Reminders */}
                <div className="rounded-xl border border-green-500/30 bg-green-50/10 p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-900/30">
                      <Bell className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Lembretes automáticos</p>
                      <p className="text-xs text-muted-foreground">E-mails enviados antes do horário da call</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {reminders.map(r => (
                      <div key={r.id} className="flex items-center gap-2 p-3 rounded-xl bg-card border border-border/60">
                        <Input
                          type="number" min={1}
                          value={r.amount}
                          onChange={e => updateReminder(r.id, { amount: Number(e.target.value) })}
                          className="h-8 w-16 text-sm text-center"
                        />
                        <Select value={r.unit} onValueChange={v => updateReminder(r.id, { unit: v as ReminderTiming["unit"] })}>
                          <SelectTrigger className="h-8 text-xs w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="minutes">minutos antes</SelectItem>
                            <SelectItem value="hours">horas antes</SelectItem>
                            <SelectItem value="days">dias antes</SelectItem>
                          </SelectContent>
                        </Select>
                        <span className="text-xs text-muted-foreground flex-1">antes da sessão</span>
                        <button onClick={() => removeReminder(r.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}

                    <button onClick={addReminder} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-green-400/60 text-xs font-medium text-green-600 hover:bg-green-50 dark:hover:bg-green-900/10 transition-colors">
                      <Plus className="h-3.5 w-3.5" /> Adicionar lembrete
                    </button>
                  </div>

                  <p className="text-[10px] text-muted-foreground">Variáveis disponíveis: {"{nome_cliente}"} {"{data_reuniao}"} {"{hora_reuniao}"} {"{link_reuniao}"}</p>
                </div>

                {/* Avaliações / Depoimentos (Prova Social) */}
                <ReviewsBuilder productId={initialProduct.id} />

                {/* Locked features */}
                {[
                  { icon: ShoppingCart, label: "Order Bump", desc: "Oferta adicional no momento do pagamento" },
                  { icon: Users, label: "Rede de Afiliados", desc: "Comissão por indicação de novos clientes" },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="rounded-xl border border-border/50 bg-card p-4 flex items-center gap-4 opacity-50 grayscale select-none">
                    <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-zinc-200 text-zinc-600">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold flex gap-2 items-center text-zinc-900">
                        {label}
                        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold bg-zinc-800 text-zinc-100 h-5 gap-1">
                          <Lock className="w-3 h-3" /> Pro
                        </span>
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}

                {/* Confirmation email */}
                <div className={cn("rounded-xl border bg-card transition-all", openEmail ? "border-green-500/40 shadow-sm" : "border-border/60 hover:border-border")}>
                  <div className="flex items-center gap-3 p-4 cursor-pointer select-none" onClick={() => setOpenEmail(!openEmail)}>
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-green-600/10 text-green-600">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">E-mail de confirmação do agendamento</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Enviado automaticamente ao confirmar a sessão</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={true} disabled />
                      {openEmail ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                    </div>
                  </div>

                  {openEmail && (
                    <div className="px-5 pb-5 border-t border-border/30 pt-4 space-y-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assunto</Label>
                        <Input value={form.confirmationSubject} onChange={e => updateForm({ confirmationSubject: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Corpo da mensagem</Label>
                        <Textarea value={form.confirmationBody} onChange={e => updateForm({ confirmationBody: e.target.value })} rows={6} className="resize-none font-mono text-xs leading-5 bg-card" />
                        <p className="text-[11px] text-muted-foreground text-right">
                          {"{nome_cliente}"} {"{data_reuniao}"} {"{hora_reuniao}"} {"{link_reuniao}"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Footer */}
          <div className="flex items-center justify-between pt-6 mt-6 border-t border-border/40 pb-10">
            <Button variant="outline" onClick={() => saveMutation.mutate("DRAFT")} disabled={saveMutation.isPending}>
              <Save className="h-4 w-4 mr-2" /> Salvar Rascunho
            </Button>
            {tab !== "opcoes" ? (
              <Button onClick={handleNext} className="bg-green-600 hover:bg-green-700 text-white max-w-[200px] w-full shadow-md transition-transform active:scale-95">
                Continuar →
              </Button>
            ) : (
              <Button onClick={() => saveMutation.mutate("PUBLISHED")} disabled={saveMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white shadow-xl shadow-green-600/20 w-fit sm:w-[240px] transition-transform active:scale-95">
                <Rocket className="h-4 w-4 mr-2" /> Publicar Call
              </Button>
            )}
          </div>
        </div>

        {/* Right: Preview */}
        <MobilePreview />
      </div>
    </div>
  );
}

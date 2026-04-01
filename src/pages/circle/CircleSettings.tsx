import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { useUpdateMemberProfile } from "@/hooks/useUpdateMemberProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  User, Bell, Shield, Camera, Save, Loader2,
  Lock, Mail, AlertTriangle, ChevronDown, AlertCircle, CheckCircle2,
  Globe, Instagram, Youtube, Linkedin, Facebook, Link2, Eye, EyeOff,
  MapPin, Trash2, X, DollarSign, Wallet, Settings, CreditCard,
  Receipt, Palette, MessageCircle, Pin, LogOut, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import AffiliatesSettings from "@/components/circle/AffiliatesSettings";
import PayoutsSettings from "@/components/circle/PayoutsSettings";
import NotificationsSection from "@/components/circle/NotificationsSection";
import ChatSection from "@/components/circle/ChatSection";
import PaymentMethodsSection from "@/components/circle/PaymentMethodsSection";
import PaymentHistorySection from "@/components/circle/PaymentHistorySection";

const COMMON_TIMEZONES = [
  { value: "America/New_York", label: "(GMT-05:00) America/New_York" },
  { value: "America/Chicago", label: "(GMT-06:00) America/Chicago" },
  { value: "America/Denver", label: "(GMT-07:00) America/Denver" },
  { value: "America/Los_Angeles", label: "(GMT-08:00) America/Los_Angeles" },
  { value: "America/Sao_Paulo", label: "(GMT-03:00) America/Sao_Paulo" },
  { value: "America/Argentina/Buenos_Aires", label: "(GMT-03:00) America/Buenos_Aires" },
  { value: "America/Bogota", label: "(GMT-05:00) America/Bogota" },
  { value: "America/Mexico_City", label: "(GMT-06:00) America/Mexico_City" },
  { value: "Europe/London", label: "(GMT+00:00) Europe/London" },
  { value: "Europe/Paris", label: "(GMT+01:00) Europe/Paris" },
  { value: "Europe/Berlin", label: "(GMT+01:00) Europe/Berlin" },
  { value: "Europe/Lisbon", label: "(GMT+00:00) Europe/Lisbon" },
  { value: "Europe/Madrid", label: "(GMT+01:00) Europe/Madrid" },
  { value: "Asia/Tokyo", label: "(GMT+09:00) Asia/Tokyo" },
  { value: "Asia/Shanghai", label: "(GMT+08:00) Asia/Shanghai" },
  { value: "Asia/Dubai", label: "(GMT+04:00) Asia/Dubai" },
  { value: "Asia/Kolkata", label: "(GMT+05:30) Asia/Kolkata" },
  { value: "Australia/Sydney", label: "(GMT+11:00) Australia/Sydney" },
  { value: "Pacific/Auckland", label: "(GMT+13:00) Pacific/Auckland" },
  { value: "UTC", label: "(GMT+00:00) UTC" },
];

const DEFAULT_NOTIFICATIONS = {
  likes: true,
  comments: true,
  dms: true,
  events: true,
  announcements: true,
};

const MBTI_TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
];

const SOCIAL_FIELDS = [
  { key: "website", label: "Website", icon: Globe, placeholder: "https://seusite.com" },
  { key: "instagram", label: "Instagram", icon: Instagram, placeholder: "@usuario ou URL" },
  { key: "twitter", label: "X / Twitter", icon: Globe, placeholder: "@usuario ou URL" },
  { key: "youtube", label: "YouTube", icon: Youtube, placeholder: "URL do canal" },
  { key: "linkedin", label: "LinkedIn", icon: Linkedin, placeholder: "URL do perfil" },
  { key: "facebook", label: "Facebook", icon: Facebook, placeholder: "URL do perfil" },
] as const;

function normalizeSocialUrl(key: string, value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  if (key === "instagram" && v.startsWith("@")) return `https://instagram.com/${v.slice(1)}`;
  if (key === "twitter" && v.startsWith("@")) return `https://x.com/${v.slice(1)}`;
  if (key === "instagram") return `https://instagram.com/${v}`;
  if (key === "twitter") return `https://x.com/${v}`;
  if (key === "youtube") return `https://youtube.com/${v}`;
  if (key === "linkedin") return `https://linkedin.com/in/${v}`;
  if (key === "facebook") return `https://facebook.com/${v}`;
  return v.includes(".") ? `https://${v}` : v;
}

function getBioQuality(bio: string): { label: string; color: string; level: number } {
  const len = bio.trim().length;
  if (len === 0) return { label: "Vazia", color: "text-muted-foreground", level: 0 };
  if (len < 30) return { label: "Básica", color: "text-amber-500", level: 1 };
  if (len < 80) return { label: "Boa", color: "text-blue-500", level: 2 };
  return { label: "Forte", color: "text-green-500", level: 3 };
}

interface ProfileForm {
  display_name: string;
  bio: string;
  username: string;
  location: string;
  mbti: string;
  sync_with_kivo: boolean;
  social_links: Record<string, string>;
  hide_from_search: boolean;
  membership_visibility: Record<string, boolean>;
  notifications: typeof DEFAULT_NOTIFICATIONS;
}

const SECTION_ITEMS = [
  { id: "communities", label: "Comunidades" },
  { id: "profile", label: "Perfil" },
  { id: "affiliates", label: "Afiliados" },
  { id: "payouts", label: "Saques" },
  { id: "account", label: "Conta" },
  { id: "notifications", label: "Notificações" },
  { id: "chat", label: "Chat" },
  { id: "payment-methods", label: "Métodos de pagamento" },
  { id: "payment-history", label: "Histórico de pagamentos" },
  { id: "theme", label: "Tema" },
];

export default function CircleSettings() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSection = searchParams.get("section") || "communities";
  const [activeSection, setActiveSection] = useState(initialSection);
  const [socialOpen, setSocialOpen] = useState(false);
  const [membershipOpen, setMembershipOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState("light");

  // Account modals state
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailConfirmPassword, setEmailConfirmPassword] = useState("");
  const [changingEmail, setChangingEmail] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [selectedTimezone, setSelectedTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );
  const [savingTimezone, setSavingTimezone] = useState(false);

  const handleSectionChange = useCallback((id: string) => {
    setActiveSection(id);
    setSearchParams({ section: id }, { replace: true });
  }, [setSearchParams]);

  const { data: community } = useQuery({
    queryKey: ["community", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return null;
      const { data } = await supabase.from("communities").select("*").eq("workspace_id", currentWorkspace.id).maybeSingle();
      return data;
    },
    enabled: !!currentWorkspace,
    staleTime: 60_000,
  });

  const { data: member, refetch: refetchMember } = useQuery({
    queryKey: ["circle-member-settings", community?.id, user?.id],
    queryFn: async () => {
      if (!community || !user) return null;
      const { data } = await supabase
        .from("community_members")
        .select("*")
        .eq("community_id", community.id)
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!community && !!user,
    staleTime: 30_000,
  });

  const { data: userCommunities = [] } = useQuery({
    queryKey: ["user-communities-list", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("community_members")
        .select("community_id, role, communities:community_id(id, name, icon_url, slug)")
        .eq("user_id", user.id)
        .eq("status", "ACTIVE");
      return (data || []).map((d: any) => ({
        id: d.community_id,
        name: d.communities?.name || "Comunidade",
        icon_url: d.communities?.icon_url,
        slug: d.communities?.slug,
        role: d.role,
      }));
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const { updateProfile, uploadAvatar } = useUpdateMemberProfile(
    member?.id || "",
    community?.id || ""
  );

  const [form, setForm] = useState<ProfileForm | null>(null);
  const isOwnerOrAdmin = member?.role === "OWNER" || member?.role === "ADMIN";

  useEffect(() => {
    if (member && !form) {
      setForm({
        display_name: member.display_name || "",
        bio: (member as any).bio || "",
        username: (member as any).username || "",
        location: (member as any).location || "",
        mbti: ((member as any).social_links as any)?.mbti || "",
        sync_with_kivo: (member as any).sync_with_kivo ?? true,
        social_links: {
          website: ((member as any).social_links as any)?.website || "",
          instagram: ((member as any).social_links as any)?.instagram || "",
          twitter: ((member as any).social_links as any)?.twitter || "",
          youtube: ((member as any).social_links as any)?.youtube || "",
          linkedin: ((member as any).social_links as any)?.linkedin || "",
          facebook: ((member as any).social_links as any)?.facebook || "",
        },
        hide_from_search: (member as any).hide_from_search || false,
        membership_visibility: ((member as any).membership_visibility as any) || {},
        notifications: {
          ...DEFAULT_NOTIFICATIONS,
          ...((member as any).notification_preferences || {}),
        },
      });
    }
  }, [member]);

  const updateForm = useCallback((updates: Partial<ProfileForm>) => {
    setForm((p) => p && ({ ...p, ...updates }));
    setIsDirty(true);
  }, []);

  // ── Completeness ──
  const completenessItems = useMemo(() => {
    if (!form) return [];
    return [
      { label: "Foto de perfil", done: !!(member?.avatar_url), field: "avatar" },
      { label: "Nome exibido", done: !!form.display_name.trim(), field: "display-name" },
      { label: "@username", done: !!form.username.trim(), field: "username" },
      { label: "Bio", done: form.bio.trim().length >= 10, field: "bio" },
      { label: "Localização", done: !!form.location.trim(), field: "location" },
      { label: "Pelo menos 1 link social", done: Object.values(form.social_links).some(v => !!v?.trim()), field: "social" },
    ];
  }, [form, member]);

  const completenessScore = useMemo(() => {
    if (!completenessItems.length) return 0;
    return Math.round((completenessItems.filter(i => i.done).length / completenessItems.length) * 100);
  }, [completenessItems]);

  const bioQuality = useMemo(() => getBioQuality(form?.bio || ""), [form?.bio]);

  const handleAvatarChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Máximo 5MB");
      return;
    }
    setUploadingAvatar(true);
    try {
      const url = await uploadAvatar(file);
      if (url) {
        await updateProfile.mutateAsync({ avatar_url: url });
        await refetchMember();
        toast.success("Foto atualizada!");
      }
    } catch {
      toast.error("Erro ao enviar foto");
    } finally {
      setUploadingAvatar(false);
    }
  }, [uploadAvatar, updateProfile, refetchMember]);

  const handleSave = useCallback(async () => {
    if (!form) return;
    setSaving(true);
    try {
      const normalizedLinks: Record<string, string> = {};
      for (const [key, val] of Object.entries(form.social_links)) {
        normalizedLinks[key] = normalizeSocialUrl(key, val);
      }
      if (form.mbti) normalizedLinks.mbti = form.mbti;

      await updateProfile.mutateAsync({
        display_name: form.display_name,
        bio: form.bio,
        notification_preferences: form.notifications,
        ...(({
          username: form.username,
          sync_with_kivo: form.sync_with_kivo,
          social_links: normalizedLinks,
          location: form.location || null,
          hide_from_search: form.hide_from_search,
          membership_visibility: form.membership_visibility,
        }) as any),
      });
      setIsDirty(false);
    } catch {
      toast.error("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }, [form, updateProfile]);

  const handleChangeEmail = useCallback(async () => {
    if (!newEmail.trim()) { toast.error("Informe o novo email"); return; }
    if (!emailConfirmPassword.trim()) { toast.error("Informe sua senha atual"); return; }
    setChangingEmail(true);
    try {
      // Re-authenticate first
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || "",
        password: emailConfirmPassword,
      });
      if (signInError) { toast.error("Senha incorreta"); return; }

      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) { toast.error(error.message); return; }
      toast.success("Email de confirmação enviado para " + newEmail.trim());
      setEmailModalOpen(false);
      setNewEmail("");
      setEmailConfirmPassword("");
    } catch {
      toast.error("Erro ao alterar email");
    } finally {
      setChangingEmail(false);
    }
  }, [newEmail, emailConfirmPassword, user?.email]);

  const handleChangePassword = useCallback(async () => {
    if (!currentPassword.trim()) { toast.error("Informe sua senha atual"); return; }
    if (newPassword.length < 6) { toast.error("Mínimo de 6 caracteres"); return; }
    if (newPassword !== confirmNewPassword) { toast.error("As senhas não coincidem"); return; }
    setChangingPassword(true);
    try {
      // Re-authenticate
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || "",
        password: currentPassword,
      });
      if (signInError) { toast.error("Senha atual incorreta"); return; }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) { toast.error(error.message); return; }
      toast.success("Senha alterada com sucesso!");
      setPasswordModalOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch {
      toast.error("Erro ao alterar senha");
    } finally {
      setChangingPassword(false);
    }
  }, [currentPassword, newPassword, confirmNewPassword, user?.email]);

  const handleLogoutEverywhere = useCallback(async () => {
    if (!confirm("Tem certeza? Todas as sessões ativas serão encerradas, incluindo esta. Você precisará fazer login novamente.")) return;
    setLoggingOutAll(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) { toast.error(error.message); return; }
      toast.success("Todas as sessões foram encerradas.");
      window.location.href = "/login";
    } catch {
      toast.error("Erro ao encerrar sessões");
    } finally {
      setLoggingOutAll(false);
    }
  }, []);

  const handleSaveTimezone = useCallback(async () => {
    setSavingTimezone(true);
    try {
      if (member) {
        await updateProfile.mutateAsync({
          ...(({ timezone: selectedTimezone }) as any),
        });
      }
      toast.success("Timezone salvo!");
    } catch {
      toast.error("Erro ao salvar timezone");
    } finally {
      setSavingTimezone(false);
    }
  }, [selectedTimezone, member, updateProfile]);

  // Unsaved changes warning
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSocialOpen(false);
        setMembershipOpen(false);
        setAdvancedOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!member || !form) {
    return (
      <div className="py-6 w-full">
        <div className="flex gap-8">
          <div className="hidden md:block w-52 shrink-0 space-y-1">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-md" />
            ))}
          </div>
          <div className="flex-1 min-w-0 max-w-2xl space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </div>
      </div>
    );
  }

  const socialCount = Object.values(form.social_links).filter(Boolean).length;

  return (
    <div className="py-6 w-full">
      <div className="flex flex-col md:flex-row gap-8">
        {/* ─── Sidebar ─── */}
        <aside className="md:w-52 shrink-0">
          <nav className="flex md:flex-col gap-0.5 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 md:sticky md:top-28">
            {SECTION_ITEMS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => handleSectionChange(id)}
                className={cn(
                  "whitespace-nowrap text-left px-4 py-2.5 rounded-md text-sm transition-colors",
                  activeSection === id
                    ? "bg-amber-100/80 text-foreground font-semibold"
                    : "text-foreground hover:bg-muted/30"
                )}
              >
                {label}
              </button>
            ))}
          </nav>
        </aside>

        {/* ─── Main Content ─── */}
        <div className="flex-1 min-w-0 max-w-2xl">

          {/* ═══ Communities ═══ */}
          {activeSection === "communities" && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-foreground mb-1">Comunidades</h2>
              <p className="text-sm text-muted-foreground mb-6">Gerencie suas participações em comunidades</p>

              {userCommunities.length === 0 ? (
                <div className="text-center py-12">
                  <User className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Você ainda não participa de nenhuma comunidade.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {userCommunities.map((c: any) => (
                    <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/20 transition-colors">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={c.icon_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                          {c.name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{c.role?.toLowerCase()}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs font-semibold"
                          onClick={() => {
                            if (c.slug) {
                              window.location.href = `/c/${c.slug}/admin`;
                            }
                          }}
                        >
                          <Settings className="h-3.5 w-3.5 mr-1" />
                          CONFIGURAÇÕES
                        </Button>
                        <button className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
                          <Pin className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* ═══ Profile ═══ */}
          {activeSection === "profile" && (
            <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Estas configurações afetam apenas seu perfil nesta comunidade.{" "}
                    <span className="font-medium">Dados financeiros e de workspace são gerenciados separadamente.</span>
                  </p>
                </div>

                {completenessScore < 100 && (
                  <Card className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Perfil completo</p>
                        <p className="text-xs text-muted-foreground">Complete para mais visibilidade</p>
                      </div>
                      <span className={cn(
                        "text-lg font-bold",
                        completenessScore >= 80 ? "text-green-500" : completenessScore >= 40 ? "text-amber-500" : "text-destructive"
                      )}>
                        {completenessScore}%
                      </span>
                    </div>
                    <Progress value={completenessScore} className="h-2 mb-3" />
                    <div className="space-y-1.5">
                      {completenessItems.filter(i => !i.done).map((item) => (
                        <button
                          key={item.field}
                          onClick={() => {
                            if (item.field === "social") setSocialOpen(true);
                            const el = document.getElementById(item.field);
                            el?.focus();
                            el?.scrollIntoView({ behavior: "smooth", block: "center" });
                          }}
                          className="flex items-center gap-2 text-xs text-primary hover:underline w-full text-left py-0.5"
                        >
                          <X className="h-3 w-3 text-muted-foreground" />
                          {item.label}
                          <span className="ml-auto text-[10px] text-muted-foreground">Completar →</span>
                        </button>
                      ))}
                    </div>
                  </Card>
                )}

                <Card className="p-6 space-y-5">
                  {!isOwnerOrAdmin ? (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="text-sm font-medium text-foreground">Sincronizar com Kivo</p>
                        <p className="text-xs text-muted-foreground">Nome e avatar seguem seu perfil global Kivo</p>
                      </div>
                      <Switch
                        checked={form.sync_with_kivo}
                        onCheckedChange={(v) => updateForm({ sync_with_kivo: v })}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
                      <Shield className="h-4 w-4 text-primary shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        Como {member.role === "OWNER" ? "dono" : "admin"}, seu perfil é sempre sincronizado com sua conta Kivo.
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Avatar className="h-20 w-20">
                        <AvatarImage src={member.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                          {(member.display_name || user?.email || "U").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {(!form.sync_with_kivo || isOwnerOrAdmin) && (
                        <button
                          onClick={() => fileRef.current?.click()}
                          disabled={uploadingAvatar || (form.sync_with_kivo && !isOwnerOrAdmin)}
                          className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                          {uploadingAvatar ? (
                            <Loader2 className="h-3.5 w-3.5 text-primary-foreground animate-spin" />
                          ) : (
                            <Camera className="h-3.5 w-3.5 text-primary-foreground" />
                          )}
                        </button>
                      )}
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarChange}
                      />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{member.display_name}</p>
                      {(member as any).username && (
                        <p className="text-sm text-muted-foreground">@{(member as any).username}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{user?.email}</p>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="display-name">Nome exibido</Label>
                      <Input
                        id="display-name"
                        value={form.display_name}
                        onChange={(e) => updateForm({ display_name: e.target.value })}
                        placeholder="Seu nome na comunidade"
                        disabled={form.sync_with_kivo && !isOwnerOrAdmin}
                        maxLength={60}
                      />
                      <p className="text-[10px] text-muted-foreground text-right">{form.display_name.length}/60</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="username">@username</Label>
                      <Input
                        id="username"
                        value={form.username}
                        onChange={(e) => updateForm({ username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                        placeholder="seu_username"
                        maxLength={30}
                      />
                      <p className="text-[10px] text-muted-foreground">Usado para @menções</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="bio">Bio</Label>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-[10px] font-medium", bioQuality.color)}>{bioQuality.label}</span>
                        <div className="flex gap-0.5">
                          {[1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className={cn(
                                "h-1.5 w-4 rounded-full transition-colors",
                                i <= bioQuality.level ? (bioQuality.level >= 3 ? "bg-green-500" : bioQuality.level >= 2 ? "bg-blue-500" : "bg-amber-500") : "bg-muted"
                              )}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <Textarea
                      id="bio"
                      value={form.bio}
                      onChange={(e) => updateForm({ bio: e.target.value })}
                      placeholder="Conte um pouco sobre você..."
                      rows={3}
                      maxLength={200}
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground italic">
                        💡 Explique quem você ajuda e o que a pessoa encontra aqui.
                      </p>
                      <p className="text-[10px] text-muted-foreground">{form.bio.length}/200</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="location">Localização</Label>
                      <Input
                        id="location"
                        value={form.location}
                        onChange={(e) => updateForm({ location: e.target.value })}
                        placeholder="São Paulo, BR"
                        maxLength={80}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="mbti">Myers Briggs</Label>
                      <Select value={form.mbti || "none"} onValueChange={(v) => updateForm({ mbti: v === "none" ? "" : v })}>
                        <SelectTrigger id="mbti"><SelectValue placeholder="Selecionar (opcional)" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Não informar</SelectItem>
                          {MBTI_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </Card>

                {/* Social Links */}
                <Collapsible open={socialOpen} onOpenChange={setSocialOpen}>
                  <Card className="overflow-hidden">
                    <CollapsibleTrigger className="flex items-center justify-between w-full px-6 py-4 hover:bg-muted/20 transition-colors">
                      <div className="flex items-center gap-2">
                        <Link2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold text-sm text-foreground">Links sociais</span>
                        {socialCount > 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {socialCount}
                          </Badge>
                        )}
                      </div>
                      <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", socialOpen && "rotate-180")} />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-6 pb-5 space-y-3 border-t border-border pt-4">
                        {SOCIAL_FIELDS.map(({ key, label, icon: Icon, placeholder }) => {
                          const val = form.social_links[key] || "";
                          return (
                            <div key={key} className="flex items-center gap-3">
                              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                              <div className="flex-1 space-y-0.5">
                                <Label className="text-xs text-muted-foreground">{label}</Label>
                                <div className="relative">
                                  <Input
                                    value={val}
                                    onChange={(e) => updateForm({
                                      social_links: { ...form.social_links, [key]: e.target.value }
                                    })}
                                    placeholder={placeholder}
                                    className="h-9 text-sm pr-8"
                                  />
                                  {val && (
                                    <button
                                      onClick={() => updateForm({ social_links: { ...form.social_links, [key]: "" } })}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive transition-colors"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Aceita @handle para Instagram e Twitter. URLs completas para os demais.
                        </p>
                      </div>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>

                {/* Membership Visibility */}
                {userCommunities.length > 0 && (
                  <Collapsible open={membershipOpen} onOpenChange={setMembershipOpen}>
                    <Card className="overflow-hidden">
                      <CollapsibleTrigger className="flex items-center justify-between w-full px-6 py-4 hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4 text-muted-foreground" />
                          <span className="font-semibold text-sm text-foreground">Visibilidade de memberships</span>
                        </div>
                        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", membershipOpen && "rotate-180")} />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-6 pb-5 border-t border-border pt-4 space-y-1">
                          <p className="text-xs text-muted-foreground mb-3">
                            Escolha quais comunidades aparecem no seu perfil público.
                          </p>
                          {userCommunities.filter((c: any) => ["OWNER", "ADMIN"].includes(c.role)).length > 0 && (
                            <div className="space-y-2 mb-4">
                              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Criador de</p>
                              {userCommunities.filter((c: any) => ["OWNER", "ADMIN"].includes(c.role)).map((c: any) => (
                                <div key={c.id} className="flex items-center justify-between py-2">
                                  <div className="flex items-center gap-2">
                                    <Avatar className="h-7 w-7">
                                      <AvatarImage src={c.icon_url || undefined} />
                                      <AvatarFallback className="bg-primary/10 text-primary text-[10px]">{c.name[0]}</AvatarFallback>
                                    </Avatar>
                                    <span className="text-sm text-foreground">{c.name}</span>
                                  </div>
                                  <Switch
                                    checked={form.membership_visibility[c.id] !== false}
                                    onCheckedChange={(v) => updateForm({
                                      membership_visibility: { ...form.membership_visibility, [c.id]: v }
                                    })}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                          {userCommunities.filter((c: any) => !["OWNER", "ADMIN"].includes(c.role)).length > 0 && (
                            <div className="space-y-2">
                              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Membro de</p>
                              {userCommunities.filter((c: any) => !["OWNER", "ADMIN"].includes(c.role)).map((c: any) => (
                                <div key={c.id} className="flex items-center justify-between py-2">
                                  <div className="flex items-center gap-2">
                                    <Avatar className="h-7 w-7">
                                      <AvatarImage src={c.icon_url || undefined} />
                                      <AvatarFallback className="bg-muted text-muted-foreground text-[10px]">{c.name[0]}</AvatarFallback>
                                    </Avatar>
                                    <span className="text-sm text-foreground">{c.name}</span>
                                  </div>
                                  <Switch
                                    checked={form.membership_visibility[c.id] !== false}
                                    onCheckedChange={(v) => updateForm({
                                      membership_visibility: { ...form.membership_visibility, [c.id]: v }
                                    })}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                )}

                {/* Advanced */}
                <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                  <Card className="overflow-hidden">
                    <CollapsibleTrigger className="flex items-center justify-between w-full px-6 py-4 hover:bg-muted/20 transition-colors">
                      <div className="flex items-center gap-2">
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold text-sm text-foreground">Avançado</span>
                      </div>
                      <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", advancedOpen && "rotate-180")} />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-6 pb-5 border-t border-border pt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-foreground">Ocultar perfil de mecanismos de busca</p>
                            <p className="text-xs text-muted-foreground">Impede que Google, Bing etc. indexem seu perfil</p>
                          </div>
                          <Switch
                            checked={form.hide_from_search}
                            onCheckedChange={(v) => updateForm({ hide_from_search: v })}
                          />
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>

                {/* Save CTA */}
                <div className={cn(
                  "flex justify-end pt-2",
                  isDirty && "sticky bottom-4 z-20"
                )}>
                  {isDirty && (
                    <div className="flex items-center gap-3 w-full md:w-auto bg-card border border-border rounded-xl px-4 py-3 shadow-lg md:shadow-md">
                      <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Alterações não salvas
                      </span>
                      <div className="flex-1" />
                      <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="min-w-[160px]"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                        {saving ? "Salvando..." : "Atualizar Perfil"}
                      </Button>
                    </div>
                  )}
                  {!isDirty && (
                    <Button disabled className="min-w-[160px] opacity-60">
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Perfil atualizado
                    </Button>
                  )}
              </div>
            </div>
          )}

          {/* ═══ Affiliates ═══ */}
          {activeSection === "affiliates" && <AffiliatesSettings />}

          {/* ═══ Payouts ═══ */}
          {activeSection === "payouts" && <PayoutsSettings />}

          {/* ═══ Account ═══ */}
          {activeSection === "account" && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-foreground mb-1">Conta</h2>
              <p className="text-sm text-muted-foreground mb-6">Gerencie as configurações da sua conta</p>

              <div className="space-y-0">
                {/* Email */}
                <div className="flex items-center justify-between py-5">
                  <div>
                    <p className="text-sm font-medium text-foreground">E-mail</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{user?.email}</p>
                  </div>
                  <Button variant="outline" size="sm" className="font-semibold" onClick={() => setEmailModalOpen(true)}>
                    ALTERAR E-MAIL
                  </Button>
                </div>
                <Separator />

                {/* Password */}
                <div className="flex items-center justify-between py-5">
                  <div>
                    <p className="text-sm font-medium text-foreground">Password</p>
                    <p className="text-sm text-muted-foreground mt-0.5">••••••••</p>
                  </div>
                  <Button variant="outline" size="sm" className="font-semibold" onClick={() => setPasswordModalOpen(true)}>
                    CHANGE PASSWORD
                  </Button>
                </div>
                <Separator />

                {/* Timezone */}
                <div className="flex items-center justify-between py-5">
                  <div className="flex-1 min-w-0 mr-4">
                    <p className="text-sm font-medium text-foreground">Timezone</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Used for event times and notifications</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={selectedTimezone} onValueChange={setSelectedTimezone}>
                      <SelectTrigger className="w-[280px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COMMON_TIMEZONES.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={handleSaveTimezone} disabled={savingTimezone} className="font-semibold">
                      {savingTimezone ? <Loader2 className="h-4 w-4 animate-spin" /> : "SAVE"}
                    </Button>
                  </div>
                </div>
                <Separator />

                {/* Log out everywhere */}
                <div className="flex items-center justify-between py-5">
                  <div>
                    <p className="text-sm font-medium text-foreground">Log out of all devices</p>
                    <p className="text-xs text-muted-foreground mt-0.5">This will end all active sessions including this one</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="font-semibold text-destructive hover:text-destructive"
                    onClick={handleLogoutEverywhere}
                    disabled={loggingOutAll}
                  >
                    {loggingOutAll ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <LogOut className="h-4 w-4 mr-1.5" />}
                    LOG OUT EVERYWHERE
                  </Button>
                </div>
                <Separator />

                {/* Leave community — danger zone */}
                <div className="flex items-center justify-between py-5">
                  <div>
                    <p className="text-sm font-medium text-destructive">Leave community</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Remove your access to feed, courses, and events</p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="font-semibold"
                    onClick={async () => {
                      if (!confirm("Tem certeza que deseja sair da comunidade?")) return;
                      await supabase.from("community_members").update({ status: "LEFT" } as any).eq("id", member.id);
                      toast.success("Você saiu da comunidade.");
                      window.location.href = "/dashboard";
                    }}
                  >
                    LEAVE
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* ── Change Email Modal ── */}
          <Dialog open={emailModalOpen} onOpenChange={(open) => { if (!open) { setNewEmail(""); setEmailConfirmPassword(""); } setEmailModalOpen(open); }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Change email</DialogTitle>
                <DialogDescription>A confirmation link will be sent to your new email address.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Current email</Label>
                  <Input value={user?.email || ""} disabled className="bg-muted" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-email">New email</Label>
                  <Input
                    id="new-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="your-new@email.com"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email-confirm-pwd">Current password</Label>
                  <Input
                    id="email-confirm-pwd"
                    type="password"
                    value={emailConfirmPassword}
                    onChange={(e) => setEmailConfirmPassword(e.target.value)}
                    placeholder="Enter your password to confirm"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEmailModalOpen(false)}>Cancel</Button>
                <Button onClick={handleChangeEmail} disabled={changingEmail || !newEmail.trim() || !emailConfirmPassword.trim()}>
                  {changingEmail ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                  {changingEmail ? "Sending..." : "Send confirmation"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ── Change Password Modal ── */}
          <Dialog open={passwordModalOpen} onOpenChange={(open) => { if (!open) { setCurrentPassword(""); setNewPassword(""); setConfirmNewPassword(""); } setPasswordModalOpen(open); }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Change password</DialogTitle>
                <DialogDescription>Your password must be at least 6 characters.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="current-pwd">Current password</Label>
                  <Input
                    id="current-pwd"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Your current password"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-pwd">New password</Label>
                  <Input
                    id="new-pwd"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                  />
                  {newPassword.length > 0 && newPassword.length < 6 && (
                    <p className="text-xs text-destructive">At least 6 characters required</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-new-pwd">Confirm new password</Label>
                  <Input
                    id="confirm-new-pwd"
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Repeat your new password"
                  />
                  {confirmNewPassword.length > 0 && confirmNewPassword !== newPassword && (
                    <p className="text-xs text-destructive">Passwords don't match</p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPasswordModalOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleChangePassword}
                  disabled={changingPassword || !currentPassword || newPassword.length < 6 || newPassword !== confirmNewPassword}
                >
                  {changingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
                  {changingPassword ? "Changing..." : "Change password"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ═══ Notifications ═══ */}
          {activeSection === "notifications" && (
            <NotificationsSection userId={user?.id || ""} userCommunities={userCommunities} />
          )}

          {/* ═══ Chat ═══ */}
          {activeSection === "chat" && (
            <ChatSection userId={user?.id || ""} userCommunities={userCommunities} />
          )}

          {activeSection === "payment-methods" && (
            <PaymentMethodsSection userId={user?.id || ""} />
          )}

          {/* ═══ Payment history ═══ */}
          {activeSection === "payment-history" && user && (
            <PaymentHistorySection userId={user.id} />
          )}

          {/* ═══ Theme ═══ */}
          {activeSection === "theme" && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-foreground mb-1">Theme</h2>
              <p className="text-sm text-muted-foreground mb-6">Customize your visual experience</p>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Theme</Label>
                  <Select value={selectedTheme} onValueChange={setSelectedTheme}>
                    <SelectTrigger className="w-full max-w-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="font-semibold"
                  onClick={() => toast.success("Theme saved!")}
                >
                  SAVE
                </Button>
              </div>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}

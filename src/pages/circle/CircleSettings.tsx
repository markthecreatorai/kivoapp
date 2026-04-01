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
  User, Bell, Shield, Camera, Save, Loader2,
  Lock, Mail, AlertTriangle, ChevronDown, AlertCircle, CheckCircle2,
  Globe, Instagram, Youtube, Linkedin, Facebook, Link2, Eye, EyeOff,
  MapPin, Trash2, X, DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import AffiliatesSettings from "@/components/circle/AffiliatesSettings";

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

export default function CircleSettings() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [searchParams] = useSearchParams();
  const initialSection = searchParams.get("section") || "profile";
  const [activeSection, setActiveSection] = useState(initialSection);
  const [socialOpen, setSocialOpen] = useState(false);
  const [membershipOpen, setMembershipOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
        .select("community_id, role, communities:community_id(id, name, icon_url)")
        .eq("user_id", user.id)
        .eq("status", "ACTIVE");
      return (data || []).map((d: any) => ({
        id: d.community_id,
        name: d.communities?.name || "Comunidade",
        icon_url: d.communities?.icon_url,
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
      toast.success("Perfil atualizado com sucesso!");
    } catch {
      toast.error("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }, [form, updateProfile]);

  const handleChangePassword = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const newPwd = fd.get("new_password") as string;
    const confirm = fd.get("confirm_password") as string;
    if (newPwd !== confirm) { toast.error("As senhas não coincidem"); return; }
    if (newPwd.length < 6) { toast.error("Mínimo de 6 caracteres"); return; }
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    if (error) toast.error(error.message);
    else toast.success("Senha alterada com sucesso!");
    (e.target as HTMLFormElement).reset();
  }, []);

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
      <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto w-full space-y-6">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
        </div>
        <Card className="p-6 space-y-5">
          <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Skeleton className="h-3 w-20" /><Skeleton className="h-10 w-full" /></div>
            <div className="space-y-1.5"><Skeleton className="h-3 w-20" /><Skeleton className="h-10 w-full" /></div>
          </div>
          <div className="space-y-1.5"><Skeleton className="h-3 w-16" /><Skeleton className="h-20 w-full" /></div>
        </Card>
      </div>
    );
  }

  const socialCount = Object.values(form.social_links).filter(Boolean).length;

  const sectionButtons = [
    { id: "profile", label: "Perfil", icon: User },
    { id: "notifications", label: "Notificações", icon: Bell },
    { id: "account", label: "Conta", icon: Shield },
  ];

  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Configurações da comunidade</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gerencie seu perfil e preferências nesta comunidade</p>
      </div>

      {/* Section nav */}
      <div className="flex gap-1.5 mb-6 bg-muted/30 p-1 rounded-lg w-fit">
        {sectionButtons.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveSection(id)}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-medium transition-all duration-200",
              activeSection === id
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ─── Profile Section ─── */}
      {activeSection === "profile" && (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Main form */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Scope indicator */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground">
                Estas configurações afetam apenas seu perfil nesta comunidade.{" "}
                <span className="font-medium">Dados financeiros e de workspace são gerenciados separadamente.</span>
              </p>
            </div>

            {/* Completeness */}
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
              {/* Sync toggle */}
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

              {/* Avatar */}
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

              {/* Core fields */}
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

            {/* Save CTA — sticky on mobile */}
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

          {/* ─── Live Preview sidebar ─── */}
          <div className="hidden lg:block w-[280px] shrink-0">
            <div className="sticky top-20">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Preview do perfil</p>
              <Card className="overflow-hidden">
                <div className="h-14 bg-gradient-to-br from-primary/20 via-primary/10 to-muted" />
                <div className="px-4 pb-4 -mt-7">
                  <Avatar className="h-14 w-14 border-4 border-card">
                    <AvatarImage src={member.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">
                      {(form.display_name || "U").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="mt-2">
                    <p className="font-semibold text-foreground text-sm">
                      {form.display_name || "Seu nome"}
                    </p>
                    {form.username && (
                      <p className="text-xs text-muted-foreground">@{form.username}</p>
                    )}
                  </div>
                  {form.bio && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-3">{form.bio}</p>
                  )}
                  {form.location && (
                    <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {form.location}
                    </p>
                  )}
                  {form.mbti && (
                    <Badge variant="secondary" className="mt-1.5 text-[10px]">{form.mbti}</Badge>
                  )}
                  {socialCount > 0 && (
                    <div className="flex items-center gap-2 mt-3">
                      {SOCIAL_FIELDS.filter(f => form.social_links[f.key]?.trim()).map(({ key, icon: Icon }) => (
                        <div key={key} className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                          <Icon className="h-3 w-3 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  )}
                  {!form.display_name && !form.bio && socialCount === 0 && (
                    <p className="text-[10px] text-muted-foreground mt-3 italic">
                      Preencha os campos para ver o preview...
                    </p>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ─── Notifications Section ─── */}
      {activeSection === "notifications" && (
        <Card className="p-6 space-y-0">
          <h3 className="font-semibold text-foreground mb-4">Preferências de notificação</h3>
          <div className="flex flex-wrap gap-2 mb-2">
            <Button
              type="button" variant="outline" size="sm"
              onClick={() => { updateForm({ notifications: { likes: true, comments: true, dms: true, events: true, announcements: true } }); }}
            >
              Ativar tudo
            </Button>
            <Button
              type="button" variant="outline" size="sm"
              onClick={() => { updateForm({ notifications: { likes: false, comments: true, dms: true, events: false, announcements: true } }); }}
            >
              Somente importantes
            </Button>
          </div>
          {([
            { key: "likes", label: "Curtidas", description: "Quando alguém curtir seus posts ou comentários" },
            { key: "comments", label: "Comentários", description: "Quando alguém comentar nos seus posts" },
            { key: "dms", label: "Mensagens diretas", description: "Quando você receber uma mensagem privada" },
            { key: "events", label: "Eventos", description: "Lembretes de eventos e novas criações" },
            { key: "announcements", label: "Anúncios", description: "Comunicados importantes do admin" },
          ] as const).map((item, i, arr) => (
            <div key={item.key}>
              <div className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium text-foreground text-sm">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                </div>
                <Switch
                  checked={form.notifications[item.key]}
                  onCheckedChange={(v) =>
                    updateForm({ notifications: { ...form.notifications, [item.key]: v } })
                  }
                />
              </div>
              {i < arr.length - 1 && <Separator />}
            </div>
          ))}
          <div className="pt-2 flex justify-end">
            <Button onClick={handleSave} disabled={saving || !isDirty}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar preferências
            </Button>
          </div>
        </Card>
      )}

      {/* ─── Account Section ─── */}
      {activeSection === "account" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
            <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground">
              Configurações de conta afetam sua conta Kivo global. Alterações aqui <span className="font-medium">não</span> concedem acesso financeiro ou de workspace.
            </p>
          </div>

          <Card className="p-6 space-y-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Mail className="h-4 w-4" /> Email da conta
            </h3>
            <p className="text-sm text-foreground bg-muted rounded-lg px-3 py-2">{user?.email}</p>
            <p className="text-xs text-muted-foreground">Para alterar seu email, entre em contato com o suporte.</p>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-foreground flex items-center gap-2 mb-4">
              <Lock className="h-4 w-4" /> Alterar senha
            </h3>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-password" className="text-sm">Nova senha</Label>
                <Input id="new-password" name="new_password" type="password" placeholder="Mínimo 6 caracteres" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password" className="text-sm">Confirmar nova senha</Label>
                <Input id="confirm-password" name="confirm_password" type="password" placeholder="Repita a senha" className="h-10" />
              </div>
              <Button type="submit" variant="outline">
                <Lock className="h-4 w-4 mr-2" /> Alterar senha
              </Button>
            </form>
          </Card>

          <Card className="p-6 border-destructive/20">
            <h3 className="font-semibold text-destructive flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4" /> Zona de perigo
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Sair da comunidade removerá seu acesso ao feed, cursos e eventos. Seus dados serão mantidos.
            </p>
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                if (!confirm("Tem certeza que deseja sair da comunidade?")) return;
                await supabase.from("community_members").update({ status: "LEFT" } as any).eq("id", member.id);
                toast.success("Você saiu da comunidade.");
                window.location.href = "/dashboard";
              }}
            >
              Sair da comunidade
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}

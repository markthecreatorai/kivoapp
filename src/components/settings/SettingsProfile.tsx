import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Upload, Check, X, Save, Loader2, ChevronDown, Lock,
  Globe, Instagram, Youtube, Linkedin, Facebook, Link2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ESTADOS_BR = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA",
  "PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

const SOCIAL_FIELDS = [
  { key: "website", label: "Website", icon: Globe, placeholder: "https://seusite.com" },
  { key: "instagram", label: "Instagram", icon: Instagram, placeholder: "@usuario ou URL" },
  { key: "twitter", label: "X / Twitter", icon: Globe, placeholder: "@usuario ou URL" },
  { key: "youtube", label: "YouTube", icon: Youtube, placeholder: "URL do canal" },
  { key: "linkedin", label: "LinkedIn", icon: Linkedin, placeholder: "URL do perfil" },
  { key: "facebook", label: "Facebook", icon: Facebook, placeholder: "URL do perfil" },
] as const;

export function SettingsProfile() {
  const { currentWorkspace, refreshWorkspaces } = useWorkspace();
  const { user } = useAuth();

  const [profile, setProfile] = useState({
    name: "",
    username: "",
    email: "",
    phone: "",
    avatar_url: "",
    bio: "",
  });
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({});
  const [address, setAddress] = useState({
    street: "",
    city: "",
    state: "",
    zip: "",
    country: "BR",
  });
  const [showKoraBadge, setShowKoraBadge] = useState(true);
  const [usernameStatus, setUsernameStatus] = useState<"checking" | "available" | "taken" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!currentWorkspace || !user) return;
    
    setProfile((p) => ({
      ...p,
      name: currentWorkspace.name || "",
      username: currentWorkspace.slug || "",
      email: user.email || "",
    }));

    supabase
      .from("storefronts")
      .select("avatar_url, bio, social_links")
      .eq("workspace_id", currentWorkspace.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfile((p) => ({
            ...p,
            avatar_url: data.avatar_url || "",
            bio: data.bio || "",
          }));
          if (data.social_links && typeof data.social_links === "object") {
            setSocialLinks(data.social_links as Record<string, string>);
          }
        }
        setLoaded(true);
      });

    const meta = (currentWorkspace as any).metadata as any;
    if (meta?.address) setAddress(meta.address);
    if (meta?.show_kora_badge !== undefined) setShowKoraBadge(meta.show_kora_badge);
    if (meta?.phone) setProfile((p) => ({ ...p, phone: meta.phone }));
  }, [currentWorkspace, user]);

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return `+55 (${digits}`;
    if (digits.length <= 7) return `+55 (${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `+55 (${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  useEffect(() => {
    if (!profile.username || profile.username === currentWorkspace?.slug) {
      setUsernameStatus(null);
      return;
    }
    if (!/^[a-z0-9_]+$/.test(profile.username)) {
      setUsernameStatus("taken");
      return;
    }
    setUsernameStatus("checking");
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("workspaces")
        .select("id")
        .eq("slug", profile.username)
        .neq("id", currentWorkspace?.id || "");
      setUsernameStatus(data && data.length > 0 ? "taken" : "available");
    }, 500);
    return () => clearTimeout(t);
  }, [profile.username, currentWorkspace]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Máximo 5MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/avatars/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("assets").upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("assets").getPublicUrl(path);
      setProfile((p) => ({ ...p, avatar_url: publicUrl }));
      setIsDirty(true);
    } catch {
      toast.error("Erro no upload");
    } finally {
      setUploading(false);
    }
  };

  const saveAll = useCallback(async () => {
    if (!currentWorkspace) return;
    if (usernameStatus === "taken") {
      toast.error("Username indisponível");
      return;
    }
    setSaving(true);
    try {
      // 1. Update workspace
      await supabase
        .from("workspaces")
        .update({
          name: profile.name,
          slug: profile.username,
          metadata: {
            ...((currentWorkspace as any).metadata || {}),
            address,
            phone: profile.phone,
            show_kora_badge: showKoraBadge,
          },
        })
        .eq("id", currentWorkspace.id);

      // 2. Update storefront
      await supabase
        .from("storefronts")
        .update({
          title: profile.name,
          avatar_url: profile.avatar_url || null,
          slug: profile.username,
          bio: profile.bio || null,
          social_links: socialLinks as any,
        })
        .eq("workspace_id", currentWorkspace.id);

      await refreshWorkspaces();
      setIsDirty(false);
      toast.success("Perfil global atualizado!");
    } catch {
      toast.error("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }, [currentWorkspace, profile, address, socialLinks, showKoraBadge, usernameStatus, refreshWorkspaces]);

  const updateProfile = (updates: Partial<typeof profile>) => {
    setProfile((p) => ({ ...p, ...updates }));
    setIsDirty(true);
  };

  if (!loaded) {
    return (
      <div className="space-y-6">
        <Card className="p-6 space-y-5">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Scope indicator */}
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
        <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
        <p className="text-xs text-muted-foreground">
          Este é seu <span className="font-medium">perfil global Kivo</span> (workspace). Perfis de comunidade são gerenciados dentro de cada comunidade.
        </p>
      </div>

      {/* Profile */}
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle className="text-lg">Perfil</CardTitle>
          <p className="text-sm text-muted-foreground">Informações básicas do seu workspace</p>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={profile.avatar_url} />
              <AvatarFallback className="bg-primary/10 text-primary text-xl">
                {profile.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <input type="file" id="settings-avatar" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              <Button variant="outline" size="sm" onClick={() => document.getElementById("settings-avatar")?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                {uploading ? "Enviando..." : "Alterar foto"}
              </Button>
              <p className="text-[10px] text-muted-foreground mt-1">JPG, PNG. Máx 5MB</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={profile.name}
                onChange={(e) => updateProfile({ name: e.target.value })}
                maxLength={60}
              />
              <p className="text-[10px] text-muted-foreground text-right">{profile.name.length}/60</p>
            </div>
            <div className="space-y-2">
              <Label>Username</Label>
              <div className="relative">
                <Input
                  value={profile.username}
                  onChange={(e) => updateProfile({ username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
                />
                {usernameStatus && profile.username !== currentWorkspace?.slug && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {usernameStatus === "checking" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {usernameStatus === "available" && <Check className="h-4 w-4 text-green-500" />}
                    {usernameStatus === "taken" && <X className="h-4 w-4 text-destructive" />}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={profile.email} disabled className="bg-muted/50" />
              <p className="text-xs text-muted-foreground">Gerenciado pela sua conta de autenticação</p>
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                value={profile.phone}
                onChange={(e) => updateProfile({ phone: formatPhone(e.target.value) })}
                placeholder="+55 (11) 99999-9999"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Bio</Label>
            <Textarea
              value={profile.bio}
              onChange={(e) => updateProfile({ bio: e.target.value })}
              placeholder="Conte sobre você ou seu negócio..."
              rows={3}
              maxLength={300}
            />
            <p className="text-[10px] text-muted-foreground text-right">{profile.bio.length}/300</p>
          </div>
        </CardContent>
      </Card>

      {/* Social Links */}
      <Collapsible open={socialOpen} onOpenChange={setSocialOpen}>
        <Card className="bg-card border border-border/50 shadow-sm rounded-xl overflow-hidden">
          <CollapsibleTrigger className="flex items-center justify-between w-full px-6 py-4 hover:bg-muted/20 transition-colors">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-foreground">Links sociais</span>
              {Object.values(socialLinks).filter(Boolean).length > 0 && (
                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                  {Object.values(socialLinks).filter(Boolean).length}
                </span>
              )}
            </div>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", socialOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-6 pb-5 space-y-3 border-t border-border pt-4">
              {SOCIAL_FIELDS.map(({ key, label, icon: Icon, placeholder }) => (
                <div key={key} className="flex items-center gap-3">
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 space-y-0.5">
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <Input
                      value={socialLinks[key] || ""}
                      onChange={(e) => {
                        setSocialLinks((p) => ({ ...p, [key]: e.target.value }));
                        setIsDirty(true);
                      }}
                      placeholder={placeholder}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Address */}
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle className="text-lg">Endereço</CardTitle>
          <p className="text-sm text-muted-foreground">Para emissão de NFS-e futura</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Rua</Label>
              <Input value={address.street} onChange={(e) => { setAddress((a) => ({ ...a, street: e.target.value })); setIsDirty(true); }} />
            </div>
            <div className="space-y-2">
              <Label>Cidade</Label>
              <Input value={address.city} onChange={(e) => { setAddress((a) => ({ ...a, city: e.target.value })); setIsDirty(true); }} />
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={address.state} onValueChange={(v) => { setAddress((a) => ({ ...a, state: v })); setIsDirty(true); }}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {ESTADOS_BR.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>CEP</Label>
              <Input value={address.zip} onChange={(e) => { setAddress((a) => ({ ...a, zip: e.target.value.replace(/\D/g, "").slice(0, 8) })); setIsDirty(true); }} placeholder="00000-000" />
            </div>
            <div className="space-y-2">
              <Label>País</Label>
              <Input value="Brasil" disabled className="bg-muted/50" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Badge toggle */}
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle className="text-lg">Outros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Badge "Feito com Kivo"</p>
              <p className="text-xs text-muted-foreground">Mostrar selo na sua loja pública</p>
            </div>
            <Switch
              checked={showKoraBadge}
              onCheckedChange={(v) => { setShowKoraBadge(v); setIsDirty(true); }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Single CTA */}
      <div className="flex justify-end pt-2 pb-6">
        <Button
          onClick={saveAll}
          disabled={saving || usernameStatus === "taken" || !isDirty}
          className={cn(
            "min-w-[180px] transition-all duration-200",
            isDirty ? "shadow-md" : "opacity-70"
          )}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          {saving ? "Salvando..." : "Atualizar Perfil"}
        </Button>
      </div>
    </div>
  );
}

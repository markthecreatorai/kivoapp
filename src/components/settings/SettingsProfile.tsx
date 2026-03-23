import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { useToast } from "@/hooks/use-toast";

const ESTADOS_BR = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA",
  "PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

export function SettingsProfile() {
  const { currentWorkspace, refreshWorkspaces } = useWorkspace();
  const { user } = useAuth();
  const { toast } = useToast();

  const [profile, setProfile] = useState({
    name: "",
    username: "",
    email: "",
    phone: "",
    avatar_url: "",
  });
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
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);

  useEffect(() => {
    if (!currentWorkspace || !user) return;
    setProfile({
      name: currentWorkspace.name || "",
      username: currentWorkspace.slug || "",
      email: user.email || "",
      phone: "",
      avatar_url: "",
    });

    // Load storefront data
    supabase
      .from("storefronts")
      .select("avatar_url")
      .eq("workspace_id", currentWorkspace.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.avatar_url) {
          setProfile((p) => ({ ...p, avatar_url: data.avatar_url || "" }));
        }
      });

    // Load metadata for address and badge
    const meta = (currentWorkspace as any).metadata as any;
    if (meta?.address) setAddress(meta.address);
    if (meta?.show_kora_badge !== undefined) setShowKoraBadge(meta.show_kora_badge);
  }, [currentWorkspace, user]);

  // Phone mask
  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return `+55 (${digits}`;
    if (digits.length <= 7) return `+55 (${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `+55 (${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  // Username check
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
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 2MB", variant: "destructive" });
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
    } catch {
      toast({ title: "Erro no upload", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async () => {
    if (!currentWorkspace) return;
    if (usernameStatus === "taken") {
      toast({ title: "Username indisponível", variant: "destructive" });
      return;
    }
    setSavingProfile(true);
    try {
      await supabase
        .from("workspaces")
        .update({ name: profile.name, slug: profile.username })
        .eq("id", currentWorkspace.id);

      await supabase
        .from("storefronts")
        .update({ title: profile.name, avatar_url: profile.avatar_url || null, slug: profile.username })
        .eq("workspace_id", currentWorkspace.id);

      await refreshWorkspaces();
      toast({ title: "Perfil atualizado!" });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  const saveAddress = async () => {
    if (!currentWorkspace) return;
    setSavingAddress(true);
    try {
      const existing = (currentWorkspace as any).metadata || {};
      await supabase
        .from("workspaces")
        .update({ metadata: { ...existing, address } })
        .eq("id", currentWorkspace.id);
      toast({ title: "Endereço atualizado!" });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSavingAddress(false);
    }
  };

  const saveBadge = async (value: boolean) => {
    if (!currentWorkspace) return;
    setShowKoraBadge(value);
    const existing = (currentWorkspace as any).metadata || {};
    await supabase
      .from("workspaces")
      .update({ metadata: { ...existing, show_kora_badge: value } })
      .eq("id", currentWorkspace.id);
  };

  return (
    <div className="space-y-6">
      {/* Profile */}
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle className="text-lg">Perfil</CardTitle>
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
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? "Enviando..." : "Alterar foto"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Username</Label>
              <div className="relative">
                <Input
                  value={profile.username}
                  onChange={(e) => setProfile((p) => ({ ...p, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
                />
                {usernameStatus && profile.username !== currentWorkspace?.slug && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {usernameStatus === "checking" && <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />}
                    {usernameStatus === "available" && <Check className="h-4 w-4 text-accent" />}
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
                onChange={(e) => setProfile((p) => ({ ...p, phone: formatPhone(e.target.value) }))}
                placeholder="+55 (11) 99999-9999"
              />
            </div>
          </div>

          <Button onClick={saveProfile} disabled={savingProfile || usernameStatus === "taken"}>
            {savingProfile ? "Salvando..." : "Atualizar Perfil"}
          </Button>
        </CardContent>
      </Card>

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
              <Input value={address.street} onChange={(e) => setAddress((a) => ({ ...a, street: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Cidade</Label>
              <Input value={address.city} onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={address.state} onValueChange={(v) => setAddress((a) => ({ ...a, state: v }))}>
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
              <Input value={address.zip} onChange={(e) => setAddress((a) => ({ ...a, zip: e.target.value.replace(/\D/g, "").slice(0, 8) }))} placeholder="00000-000" />
            </div>
            <div className="space-y-2">
              <Label>País</Label>
              <Input value="Brasil" disabled className="bg-muted/50" />
            </div>
          </div>
          <Button onClick={saveAddress} disabled={savingAddress}>
            {savingAddress ? "Salvando..." : "Atualizar Endereço"}
          </Button>
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
              <p className="text-sm font-medium">Badge "Feito com Kora"</p>
              <p className="text-xs text-muted-foreground">Mostrar selo na sua loja pública</p>
            </div>
            <Switch checked={showKoraBadge} onCheckedChange={saveBadge} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
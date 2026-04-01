import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Settings, UserPlus, Upload, Link2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface Props {
  community: any;
  member: any;
  onOpenAdmin?: () => void;
}

export default function CircleRightSidebarSkool({ community, member, onOpenAdmin }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const isAboutPage = location.pathname === `/circles/${slug}/about`;
  const isAdmin = member?.role === "OWNER" || member?.role === "ADMIN";
  const isPreviewVisitor = searchParams.get("preview") === "visitor";

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [copied, setCopied] = useState(false);
  const inviteLink = `${window.location.origin}/c/${slug}/feed`;

  // Simulated online count
  const [onlineCount, setOnlineCount] = useState(0);
  useEffect(() => {
    if (!community) return;
    const base = Math.max(1, Math.floor(community.member_count * 0.12));
    const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(base * 0.3)));
    setOnlineCount(base + jitter);
    const interval = setInterval(() => {
      const j = Math.floor(Math.random() * Math.max(1, Math.floor(base * 0.3)));
      setOnlineCount(base + j);
    }, 30000);
    return () => clearInterval(interval);
  }, [community?.member_count]);

  const { data: topMembers } = useQuery({
    queryKey: ["circle-top3", community?.id],
    queryFn: async () => {
      if (!community) return [];
      const { data } = await supabase
        .from("community_members")
        .select("id, display_name, avatar_url, total_points, role")
        .eq("community_id", community.id)
        .eq("status", "ACTIVE")
        .order("total_points", { ascending: false })
        .limit(3);
      return data || [];
    },
    enabled: !!community,
  });

  const { data: adminMembers } = useQuery({
    queryKey: ["circle-admin-members", community?.id],
    queryFn: async () => {
      if (!community) return [];
      const { data } = await supabase
        .from("community_members")
        .select("id, display_name, avatar_url, role")
        .eq("community_id", community.id)
        .eq("status", "ACTIVE")
        .in("role", ["OWNER", "ADMIN"])
        .order("role")
        .limit(10);
      return data || [];
    },
    enabled: !!community,
  });

  const { data: primaryPlan } = useQuery({
    queryKey: ["sidebar-primary-plan", community?.id],
    queryFn: async () => {
      if (!community?.id || community.access_type !== "PAID_SUBSCRIPTION") return null;
      const { data } = await supabase
        .from("circle_plans")
        .select("trial_days, price_cents, interval")
        .eq("community_id", community.id)
        .eq("is_active", true)
        .order("price_cents", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!community?.id,
  });

  const handleUploadCover = async (file: File) => {
    setUploadingCover(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${community.id}/cover-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("community").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("community").getPublicUrl(path);
      await supabase.from("communities").update({ cover_image_url: urlData.publicUrl }).eq("id", community.id);
      queryClient.invalidateQueries({ queryKey: ["community-slug", slug] });
      queryClient.invalidateQueries({ queryKey: ["community-about", slug] });
      toast.success("Foto de capa atualizada!");
    } catch {
      toast.error("Erro ao enviar imagem");
    } finally {
      setUploadingCover(false);
    }
  };

  if (!community) return null;

  const adminCount = adminMembers?.length ?? 0;
  const trialDays = (primaryPlan as any)?.trial_days || 0;
  const visitorCta = community.access_type === "PAID_SUBSCRIPTION"
    ? (trialDays > 0 ? `Iniciar ${trialDays} dias grátis` : "Assinar comunidade")
    : "Entrar no Grupo";

  return (
    <div className="p-4 space-y-4">
      {/* ── About Card ── */}
      <div className="bg-card rounded-xl shadow-sm overflow-hidden">
        {/* Cover image — admin can click to upload on about page */}
        <div className="relative group">
          {community.cover_image_url ? (
            <div className="h-40">
              <img src={community.cover_image_url} alt="" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="h-40 bg-gradient-to-b from-foreground/80 to-foreground/40" />
          )}

          {/* Upload capa — visible for admin on About page */}
          {isAdmin && isAboutPage && !isPreviewVisitor && (
            <>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={coverInputRef}
                onChange={(e) => e.target.files?.[0] && handleUploadCover(e.target.files[0])}
              />
              <button
                onClick={() => coverInputRef.current?.click()}
                className={`absolute inset-0 flex items-center justify-center gap-2 text-xs font-medium text-white bg-black/40 hover:bg-black/60 transition-colors ${!community.cover_image_url ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
              >
                {uploadingCover ? (
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <><Upload className="h-4 w-4" /> Foto de capa</>
                )}
              </button>
            </>
          )}
        </div>

        <div className="px-4 pt-4 pb-4 space-y-4">
          {/* Community name */}
          <h3 className="font-bold text-foreground text-[15px] leading-tight">
            {community.name}
          </h3>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.host}/c/${community.slug}`);
              toast.success("Link copiado!");
            }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors truncate"
            title="Copiar link"
          >
            <Link2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{window.location.host}/c/{community.slug}</span>
          </button>

          {/* Description */}
          {(community.description || community.long_description) ? (
            <p className="text-[13px] text-muted-foreground leading-relaxed line-clamp-3">
              {community.long_description || community.description}
            </p>
          ) : isAdmin && isAboutPage && !isPreviewVisitor ? (
            <p className="text-[12px] text-muted-foreground italic">
              Adicione uma descrição clicando na área à esquerda.
            </p>
          ) : null}

          {/* Featured links */}
          {(() => {
            const links = (community as any).community_links;
            if (!Array.isArray(links) || links.length === 0) return null;
            return (
              <div className="space-y-1.5">
                {links.slice(0, 5).map((link: any, i: number) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-[13px] text-foreground hover:text-primary transition-colors group"
                  >
                    <span className="text-muted-foreground group-hover:text-primary text-xs">↗️</span>
                    <span className="truncate">{link.emoji ? `${link.emoji} ` : ""}{link.label}</span>
                  </a>
                ))}
              </div>
            );
          })()}

          {/* Stats row — Members | Online | Admins */}
          <div className="flex items-center border-t border-b border-border py-3 -mx-4 px-4">
            <div className="flex-1 text-center">
              <p className="text-[15px] font-bold text-foreground">{community.member_count}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Membros</p>
            </div>
            <div className="w-px h-9 bg-border" />
            <div className="flex-1 text-center">
              <p className="text-[15px] font-bold text-foreground flex items-center justify-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                {onlineCount}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Online</p>
            </div>
            <div className="w-px h-9 bg-border" />
            <div className="flex-1 text-center">
              <p className="text-[15px] font-bold text-foreground">{adminCount}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Admins</p>
            </div>
          </div>

          {/* Admin avatars */}
          {adminMembers && adminMembers.length > 0 && (
            <div className="flex items-center">
              {adminMembers.slice(0, 8).map((m: any, i: number) => (
                <Avatar
                  key={m.id}
                  className="h-8 w-8 border-2 border-card"
                  style={{ marginLeft: i > 0 ? "-6px" : "0", zIndex: 20 - i }}
                >
                  <AvatarImage src={m.avatar_url || undefined} />
                  <AvatarFallback className="bg-muted text-muted-foreground text-[10px] font-medium">
                    {(m.display_name || "U").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ))}
              {adminMembers.length > 8 && (
                <div
                  className="h-8 w-8 rounded-full border-2 border-card bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground"
                  style={{ marginLeft: "-6px", zIndex: 10 }}
                >
                  +{adminMembers.length - 8}
                </div>
              )}
            </div>
          )}

          {/* ── CTA BUTTONS ── */}
          {member && !isPreviewVisitor ? (
            /* Member (any role): show settings (admin only) + invite */
            <div className="space-y-2">
              {isAdmin && isAboutPage && (
                <button
                  onClick={() => onOpenAdmin ? onOpenAdmin() : navigate(`/circles/${slug}/admin`)}
                  className="flex items-center justify-center gap-2 w-full rounded-lg py-2.5 px-4 font-semibold text-sm border border-foreground/20 bg-transparent hover:bg-muted transition-colors text-foreground"
                  id="sidebar-settings-btn"
                >
                  <Settings className="h-4 w-4" />
                  Configurações
                </button>
              )}
              <button
                onClick={() => setShowInviteModal(true)}
                className="flex items-center justify-center gap-2 w-full rounded-lg py-2.5 px-4 font-semibold text-sm border border-foreground/20 bg-transparent hover:bg-muted transition-colors text-foreground uppercase tracking-wide"
                id="sidebar-invite-btn"
              >
                <UserPlus className="h-4 w-4" />
                Convidar Pessoas
              </button>
            </div>
          ) : (
            /* Visitor / preview visitor: join */
            <Link
              to={`/circles/${slug}`}
              className="flex items-center justify-center w-full rounded-lg py-3 px-4 font-bold text-[15px] uppercase tracking-wide transition-opacity hover:opacity-90 bg-primary text-primary-foreground"
            >
              {visitorCta}
            </Link>
          )}
        </div>
      </div>

      {/* ── Leaderboard Card ── */}
      {topMembers && topMembers.length > 0 && (
        <div className="bg-card rounded-xl shadow-sm px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
              Ranking (30 dias)
            </h4>
            <Link to={`/circles/${slug}/leaderboard`} className="text-[12px] text-primary hover:underline font-medium">
              Ver todos
            </Link>
          </div>
          <div className="space-y-3">
            {topMembers.map((m: any, i: number) => {
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉";
              return (
                <div key={m.id} className="flex items-center gap-2.5">
                  <span className="w-5 text-center text-sm shrink-0">{medal}</span>
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarImage src={m.avatar_url || undefined} />
                    <AvatarFallback className="bg-muted text-muted-foreground text-[9px] font-medium">
                      {(m.display_name || "U").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] font-medium text-foreground block truncate">
                      {m.display_name || "Membro"}
                    </span>
                  </div>
                  <span className="text-[12px] font-semibold text-primary shrink-0">
                    +{m.total_points}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── INVITE MODAL ── */}
      <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
        <DialogContent className="sm:max-w-md p-6">
          <DialogHeader className="space-y-1.5 pb-0">
            <DialogTitle className="text-xl font-bold text-foreground">
              Convidar pessoas
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Convide seus amigos para <span className="font-medium text-foreground">{community.name}</span>
            </p>
          </DialogHeader>
          <div className="pt-4 space-y-4">
            <div className="flex">
              <input
                type="text"
                readOnly
                value={inviteLink}
                className="flex-1 min-w-0 px-3 py-2 text-sm border border-border rounded-l-lg bg-background text-primary truncate focus:outline-none select-all"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(inviteLink);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="shrink-0 px-4 py-2 rounded-r-lg font-bold text-sm uppercase tracking-wide text-primary-foreground bg-primary hover:opacity-90 transition-opacity"
              >
                {copied ? "COPIADO ✓" : "COPIAR"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="gap-2 text-sm h-10"
                onClick={() => { const t = encodeURIComponent(`Participe de ${community.name} na Kivo! ${inviteLink}`); window.open(`https://wa.me/?text=${t}`, "_blank"); }}>
                <svg className="h-4 w-4 text-[hsl(142,70%,49%)]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </Button>
              <Button variant="outline" className="gap-2 text-sm h-10"
                onClick={() => { const t = encodeURIComponent(`Participe de ${community.name} na Kivo!`); const u = encodeURIComponent(inviteLink); window.open(`https://twitter.com/intent/tweet?text=${t}&url=${u}`, "_blank"); }}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                X (Twitter)
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

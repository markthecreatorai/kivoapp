import { useMemberInvite } from "@/hooks/useMemberInvite";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Gift, Users, Star, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  communityId: string;
  memberId: string;
  slug: string;
}

export default function MyInvitesPanel({ communityId, memberId, slug }: Props) {
  const {
    inviteLink,
    inviteEvents,
    rewardConfig,
    isLoading,
    createInviteLink,
    copyLink,
    totalPointsEarned,
    totalInvited,
  } = useMemberInvite(communityId, memberId, slug);

  if (!rewardConfig?.is_active) return null;

  return (
    <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Gift className="h-4 w-4 text-primary" />
          Meus Convites
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-muted/50 rounded-lg p-2.5 text-center">
            <p className="text-xs text-muted-foreground">Convidados</p>
            <p className="text-lg font-bold text-foreground">{totalInvited}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-2.5 text-center">
            <p className="text-xs text-muted-foreground">Pontos Ganhos</p>
            <p className="text-lg font-bold text-primary">{totalPointsEarned}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-2.5 text-center">
            <p className="text-xs text-muted-foreground">Por convite</p>
            <p className="text-lg font-bold text-foreground">+{rewardConfig.points_per_invite}</p>
          </div>
        </div>

        {/* Invite link */}
        {inviteLink ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-lg truncate font-mono">
              {`${window.location.origin}/join/${slug}?ref=${inviteLink.code}`}
            </code>
            <Button size="sm" variant="outline" onClick={copyLink}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            onClick={() => createInviteLink.mutate()}
            disabled={createInviteLink.isPending || isLoading}
            className="w-full"
          >
            {createInviteLink.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Users className="h-4 w-4 mr-2" />
            )}
            Gerar meu link de convite
          </Button>
        )}

        {/* Recent invites */}
        {inviteEvents.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Últimos convites</p>
            {inviteEvents.slice(0, 5).map((evt) => (
              <div
                key={evt.id}
                className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant={evt.event_type === "reward_granted" ? "default" : "secondary"}
                    className="text-[10px] px-1.5"
                  >
                    {evt.event_type === "joined"
                      ? "Entrou"
                      : evt.event_type === "paid"
                      ? "Pagou"
                      : "Bônus"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(evt.created_at), { addSuffix: true, locale: ptBR })}
                  </span>
                </div>
                {evt.points_awarded > 0 && (
                  <span className="text-xs font-semibold text-primary flex items-center gap-0.5">
                    <Star className="h-3 w-3" />+{evt.points_awarded}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

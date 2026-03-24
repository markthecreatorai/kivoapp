import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BookOpen, Target, Users, Megaphone, Handshake } from "lucide-react";

const PLAYBOOK_DAYS = [
  {
    day: 1, phase: "Setup", icon: BookOpen,
    items: [
      { key: "define_icp", label: "Definir ICP (perfil ideal de creator)" },
      { key: "list_50_prospects", label: "Listar 50 prospects qualificados" },
      { key: "setup_templates", label: "Preparar templates de mensagem (DM/Email/WhatsApp)" },
    ],
  },
  {
    day: 2, phase: "Setup", icon: BookOpen,
    items: [
      { key: "setup_landing_utm", label: "Configurar UTMs na landing para cada canal" },
      { key: "create_lead_magnet", label: "Criar lead magnet (PDF/vídeo gratuito)" },
      { key: "setup_crm", label: "Configurar pipeline no /acquisition" },
    ],
  },
  {
    day: 3, phase: "Setup", icon: BookOpen,
    items: [
      { key: "first_content_piece", label: "Publicar 1ª peça de conteúdo" },
      { key: "join_communities", label: "Entrar em 5 comunidades de creators" },
      { key: "reach_partners", label: "Identificar 3 parceiros potenciais" },
    ],
  },
  {
    day: 4, phase: "Execução", icon: Target,
    items: [
      { key: "d4_content", label: "Publicar conteúdo educativo" },
      { key: "d4_outbound_20", label: "Enviar 20 mensagens outbound" },
      { key: "d4_partner_contact", label: "Contatar 1 parceiro" },
    ],
  },
  {
    day: 5, phase: "Execução", icon: Target,
    items: [
      { key: "d5_content", label: "Publicar conteúdo (case/prova social)" },
      { key: "d5_outbound_20", label: "Enviar 20 mensagens outbound" },
      { key: "d5_follow_up", label: "Follow-up em leads D4" },
    ],
  },
  {
    day: 6, phase: "Execução", icon: Target,
    items: [
      { key: "d6_content", label: "Publicar conteúdo (comparativo taxas)" },
      { key: "d6_outbound_20", label: "Enviar 20 mensagens outbound" },
      { key: "d6_community_engage", label: "Engajar em 3 comunidades" },
    ],
  },
  {
    day: 7, phase: "Execução", icon: Target,
    items: [
      { key: "d7_content", label: "Publicar conteúdo (tutorial rápido)" },
      { key: "d7_outbound_20", label: "Enviar 20 mensagens outbound" },
      { key: "d7_review_week1", label: "Revisar métricas da semana 1" },
    ],
  },
  {
    day: 8, phase: "Follow-up + Demo", icon: Users,
    items: [
      { key: "d8_follow_ups", label: "Follow-up em todos os leads quentes" },
      { key: "d8_schedule_demos", label: "Agendar demos com leads qualificados" },
      { key: "d8_partner_proposal", label: "Enviar proposta para parceiro" },
    ],
  },
  {
    day: 9, phase: "Follow-up + Demo", icon: Users,
    items: [
      { key: "d9_run_demos", label: "Executar demos agendadas" },
      { key: "d9_content", label: "Publicar conteúdo (depoimento/case)" },
      { key: "d9_outbound_10", label: "Enviar 10 mensagens de follow-up" },
    ],
  },
  {
    day: 10, phase: "Follow-up + Demo", icon: Users,
    items: [
      { key: "d10_run_demos", label: "Executar demos agendadas" },
      { key: "d10_nurture", label: "Enviar conteúdo de nutrição para leads mornos" },
      { key: "d10_review", label: "Revisar pipeline e priorizar" },
    ],
  },
  {
    day: 11, phase: "Fechamento", icon: Handshake,
    items: [
      { key: "d11_close_deals", label: "Fechar com leads prontos" },
      { key: "d11_offer", label: "Enviar oferta especial para leads qualificados" },
      { key: "d11_ask_referrals", label: "Pedir indicações para clientes atuais" },
    ],
  },
  {
    day: 12, phase: "Fechamento", icon: Handshake,
    items: [
      { key: "d12_close_deals", label: "Continuar fechamentos" },
      { key: "d12_collect_feedback", label: "Coletar feedback dos primeiros clientes" },
      { key: "d12_content", label: "Publicar conteúdo com resultado real" },
    ],
  },
  {
    day: 13, phase: "Fechamento", icon: Megaphone,
    items: [
      { key: "d13_testimonials", label: "Coletar depoimentos/cases" },
      { key: "d13_final_push", label: "Push final em leads pendentes" },
      { key: "d13_partner_review", label: "Revisar resultados com parceiros" },
    ],
  },
  {
    day: 14, phase: "Fechamento", icon: Megaphone,
    items: [
      { key: "d14_retrospective", label: "Retrospectiva: o que funcionou?" },
      { key: "d14_document_playbook", label: "Documentar playbook refinado" },
      { key: "d14_plan_next_sprint", label: "Planejar próximo sprint de 14 dias" },
    ],
  },
];

export default function GtmPlaybook() {
  const { currentWorkspace } = useWorkspace();
  const qc = useQueryClient();

  const { data: checklist = [] } = useQuery({
    queryKey: ["playbook-checklist", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return [];
      const { data } = await supabase.from("playbook_checklist").select("*").eq("workspace_id", currentWorkspace.id);
      return data || [];
    },
    enabled: !!currentWorkspace,
  });

  const toggleItem = useMutation({
    mutationFn: async ({ day, key, done }: { day: number; key: string; done: boolean }) => {
      if (!currentWorkspace) return;
      if (done) {
        await supabase.from("playbook_checklist").upsert({
          workspace_id: currentWorkspace.id,
          day_number: day,
          item_key: key,
          is_done: true,
          completed_at: new Date().toISOString(),
        }, { onConflict: "workspace_id,day_number,item_key" });
      } else {
        await supabase.from("playbook_checklist").delete()
          .eq("workspace_id", currentWorkspace.id)
          .eq("day_number", day)
          .eq("item_key", key);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["playbook-checklist"] }),
  });

  const isDone = (day: number, key: string) =>
    checklist.some((c: any) => c.day_number === day && c.item_key === key && c.is_done);

  const totalItems = PLAYBOOK_DAYS.reduce((acc, d) => acc + d.items.length, 0);
  const doneItems = checklist.filter((c: any) => c.is_done).length;
  const progress = totalItems > 0 ? (doneItems / totalItems) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Playbook 14 Dias</h1>
        <p className="text-sm text-muted-foreground">Checklist de execução para gerar tração inicial</p>
      </div>

      <Card className="card-radius">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Progresso geral</span>
            <span className="text-sm text-muted-foreground">{doneItems}/{totalItems} ({Math.round(progress)}%)</span>
          </div>
          <Progress value={progress} className="h-3" />
        </CardContent>
      </Card>

      <div className="space-y-4">
        {PLAYBOOK_DAYS.map((day) => {
          const Icon = day.icon;
          const dayDone = day.items.every(i => isDone(day.day, i.key));
          const dayProgress = day.items.filter(i => isDone(day.day, i.key)).length;

          return (
            <Card key={day.day} className={`card-radius ${dayDone ? "opacity-60" : ""}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon className="w-4 h-4 text-primary" />
                    Dia {day.day}
                    <Badge variant="secondary" className="text-xs">{day.phase}</Badge>
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">{dayProgress}/{day.items.length}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {day.items.map((item) => {
                  const done = isDone(day.day, item.key);
                  return (
                    <label key={item.key} className="flex items-center gap-3 cursor-pointer group">
                      <Checkbox
                        checked={done}
                        onCheckedChange={(checked) => toggleItem.mutate({ day: day.day, key: item.key, done: !!checked })}
                      />
                      <span className={`text-sm ${done ? "line-through text-muted-foreground" : "text-foreground"} group-hover:text-primary transition-colors`}>
                        {item.label}
                      </span>
                    </label>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

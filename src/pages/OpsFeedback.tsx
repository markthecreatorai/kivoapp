import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Bug, Lightbulb, HelpCircle } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "new", label: "Novo", color: "bg-primary/10 text-primary" },
  { value: "investigating", label: "Investigando", color: "bg-accent/10 text-accent" },
  { value: "fixed", label: "Corrigido", color: "bg-accent/20 text-accent" },
  { value: "wontfix", label: "Não será corrigido", color: "bg-muted text-muted-foreground" },
];

const CATEGORY_ICONS: Record<string, any> = {
  bug: Bug,
  feature: Lightbulb,
  question: HelpCircle,
  other: MessageSquare,
};

export default function OpsFeedback() {
  const { currentWorkspace } = useWorkspace();
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: feedback, refetch } = useQuery({
    queryKey: ["beta-feedback", filterStatus],
    queryFn: async () => {
      let query = (supabase.from as any)("beta_feedback")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (filterStatus !== "all") {
        query = query.eq("status", filterStatus);
      }

      const { data } = await query;
      return data || [];
    },
  });

  const updateStatus = async (id: string, status: string) => {
    await (supabase.from as any)("beta_feedback").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    refetch();
  };

  const statusCounts = (feedback || []).reduce((acc: Record<string, number>, f: any) => {
    acc[f.status] = (acc[f.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary" />
            Feedback Beta
          </h1>
          <p className="text-sm text-muted-foreground">Triagem de reports dos beta testers</p>
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {STATUS_OPTIONS.map(s => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        {STATUS_OPTIONS.map(s => (
          <Card key={s.value}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{statusCounts[s.value] || 0}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Feedback List */}
      <div className="space-y-3">
        {(feedback || []).length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum feedback encontrado.</p>
            </CardContent>
          </Card>
        ) : (
          (feedback || []).map((f: any) => {
            const Icon = CATEGORY_ICONS[f.category] || MessageSquare;
            const statusOpt = STATUS_OPTIONS.find(s => s.value === f.status);
            return (
              <Card key={f.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Icon className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{f.description}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant="outline" className="text-xs capitalize">{f.category}</Badge>
                        <Badge variant="outline" className={`text-xs ${f.severity === "critical" ? "text-destructive border-destructive/30" : f.severity === "high" ? "text-primary border-primary/30" : ""}`}>
                          {f.severity}
                        </Badge>
                        {f.page_path && <span className="text-xs text-muted-foreground">{f.page_path}</span>}
                        <span className="text-xs text-muted-foreground">{new Date(f.created_at).toLocaleString("pt-BR")}</span>
                      </div>
                    </div>
                    <Select value={f.status} onValueChange={(val) => updateStatus(f.id, val)}>
                      <SelectTrigger className="w-36 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(s => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

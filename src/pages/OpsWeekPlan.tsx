import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Plus, Bug, TrendingUp, Megaphone } from "lucide-react";

const CATEGORIES = [
  { value: "bugs", label: "Bugs", icon: Bug, color: "text-destructive" },
  { value: "conversion", label: "Conversão", icon: TrendingUp, color: "text-primary" },
  { value: "acquisition", label: "Aquisição", icon: Megaphone, color: "text-accent" },
];

const DEFAULT_PLAN = [
  { category: "bugs", title: "Corrigir erros de pagamento mais frequentes", priority: 1 },
  { category: "bugs", title: "Fix edge cases no checkout mobile", priority: 2 },
  { category: "bugs", title: "Resolver timeout em webhooks lentos", priority: 3 },
  { category: "bugs", title: "Corrigir layout quebrado em empty states", priority: 4 },
  { category: "bugs", title: "Fix validação de campos no signup", priority: 5 },
  { category: "conversion", title: "Otimizar copy do CTA principal", priority: 1 },
  { category: "conversion", title: "Adicionar trust signals no checkout", priority: 2 },
  { category: "conversion", title: "Melhorar fluxo de recovery de carrinho", priority: 3 },
  { category: "acquisition", title: "Publicar 3 peças de conteúdo educativo", priority: 1 },
  { category: "acquisition", title: "Outreach para 20 creators potenciais", priority: 2 },
  { category: "acquisition", title: "Configurar retargeting dos visitors", priority: 3 },
];

export default function OpsWeekPlan() {
  const { currentWorkspace } = useWorkspace();
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("bugs");

  const { data: planItems, refetch } = useQuery({
    queryKey: ["week1-plan", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [];
      const { data } = await supabase
        .from("week1_plan")
        .select("*")
        .eq("workspace_id", currentWorkspace.id)
        .order("priority");
      return data || [];
    },
  });

  const initPlan = async () => {
    if (!currentWorkspace?.id || (planItems && planItems.length > 0)) return;
    const rows = DEFAULT_PLAN.map(p => ({
      ...p,
      workspace_id: currentWorkspace.id,
      status: "todo",
    }));
    await supabase.from("week1_plan").insert(rows);
    refetch();
  };

  const addItem = async () => {
    if (!currentWorkspace?.id || !newTitle.trim()) return;
    await supabase.from("week1_plan").insert({
      workspace_id: currentWorkspace.id,
      category: newCategory,
      title: newTitle.trim(),
      status: "todo",
      priority: (planItems?.length || 0) + 1,
    });
    setNewTitle("");
    refetch();
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("week1_plan").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-primary" />
            Plano Semana 1
          </h1>
          <p className="text-sm text-muted-foreground">Growth + Produto — prioridades da primeira semana</p>
        </div>
      </div>

      {(!planItems || planItems.length === 0) ? (
        <Card>
          <CardContent className="p-6 text-center">
            <CalendarDays className="w-8 h-8 text-primary mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-3">Crie o plano da semana 1 com as prioridades recomendadas.</p>
            <Button onClick={initPlan}>Criar Plano Semana 1</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Add new item */}
          <Card>
            <CardContent className="p-4 flex gap-2">
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Nova tarefa..." value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} />
              <Button onClick={addItem} size="sm"><Plus className="w-4 h-4" /></Button>
            </CardContent>
          </Card>

          {/* Categories */}
          {CATEGORIES.map(cat => {
            const items = (planItems || []).filter((p: any) => p.category === cat.value);
            if (items.length === 0) return null;
            const done = items.filter((p: any) => p.status === "done").length;
            return (
              <Card key={cat.value}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <cat.icon className={`w-4 h-4 ${cat.color}`} />
                      Top {cat.label}
                    </span>
                    <Badge variant={done === items.length ? "default" : "secondary"}>{done}/{items.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {items.map((item: any) => (
                      <div key={item.id} className="flex items-center gap-3 p-2 rounded border bg-muted/20">
                        <span className="text-xs text-muted-foreground w-6">#{item.priority}</span>
                        <span className={`text-sm flex-1 ${item.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {item.title}
                        </span>
                        {item.owner && <span className="text-xs text-muted-foreground">{item.owner}</span>}
                        <Select value={item.status} onValueChange={(val) => updateStatus(item.id, val)}>
                          <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todo">To Do</SelectItem>
                            <SelectItem value="in_progress">Em progresso</SelectItem>
                            <SelectItem value="done">Feito</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}

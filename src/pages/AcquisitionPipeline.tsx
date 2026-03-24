import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Filter, Users, Phone, Mail, MessageSquare, CheckCircle, XCircle, Clock } from "lucide-react";

const CHANNELS = ["content", "outbound", "partner", "referral", "ads"] as const;
const STATUSES = ["new", "contacted", "qualified", "demo", "won", "lost"] as const;

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  contacted: "bg-yellow-100 text-yellow-800",
  qualified: "bg-purple-100 text-purple-800",
  demo: "bg-indigo-100 text-indigo-800",
  won: "bg-green-100 text-green-800",
  lost: "bg-red-100 text-red-800",
};

export default function AcquisitionPipeline() {
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filterChannel, setFilterChannel] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", channel: "outbound", notes: "" });

  const { data: leads = [] } = useQuery({
    queryKey: ["acquisition-leads", currentWorkspace?.id, filterChannel, filterStatus],
    queryFn: async () => {
      if (!currentWorkspace) return [];
      let q = supabase.from("acquisition_leads").select("*").eq("workspace_id", currentWorkspace.id).order("created_at", { ascending: false });
      if (filterChannel !== "all") q = q.eq("channel", filterChannel);
      if (filterStatus !== "all") q = q.eq("status", filterStatus);
      const { data } = await q;
      return data || [];
    },
    enabled: !!currentWorkspace,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["acquisition-tasks-today", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return [];
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase.from("acquisition_tasks").select("*, acquisition_leads(name)").eq("workspace_id", currentWorkspace.id).eq("status", "pending").lte("due_date", today).order("due_date");
      return data || [];
    },
    enabled: !!currentWorkspace,
  });

  const createLead = useMutation({
    mutationFn: async () => {
      if (!currentWorkspace) return;
      const { error } = await supabase.from("acquisition_leads").insert({
        workspace_id: currentWorkspace.id,
        name: form.name,
        email: form.email || null,
        phone: form.phone || null,
        channel: form.channel,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["acquisition-leads"] });
      setShowCreate(false);
      setForm({ name: "", email: "", phone: "", channel: "outbound", notes: "" });
      toast({ title: "Lead adicionado!" });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: Record<string, unknown> = { status };
      if (status === "won") updates.converted_at = new Date().toISOString();
      const { error } = await supabase.from("acquisition_leads").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["acquisition-leads"] }),
  });

  const completeTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from("acquisition_tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["acquisition-tasks-today"] }),
  });

  const statusCounts = STATUSES.reduce((acc, s) => {
    acc[s] = leads.filter((l: any) => l.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pipeline de Aquisição</h1>
          <p className="text-sm text-muted-foreground">{leads.length} leads no pipeline</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="pill-radius gap-2"><Plus className="w-4 h-4" /> Novo Lead</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Adicionar Lead</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-radius" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input-radius" />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input-radius" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Canal</Label>
                <Select value={form.channel} onValueChange={v => setForm({ ...form, channel: v })}>
                  <SelectTrigger className="input-radius"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notas</Label>
                <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
              <Button className="w-full pill-radius" onClick={() => createLead.mutate()} disabled={!form.name}>Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Status counters */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setFilterStatus(filterStatus === s ? "all" : s)}
            className={`p-3 rounded-lg border text-center transition-colors ${filterStatus === s ? "ring-2 ring-primary" : ""}`}>
            <p className="text-xl font-bold text-foreground">{statusCounts[s]}</p>
            <p className="text-xs text-muted-foreground capitalize">{s}</p>
          </button>
        ))}
      </div>

      {/* Today's tasks */}
      {tasks.length > 0 && (
        <Card className="card-radius border-primary/20">
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> Tarefas de hoje ({tasks.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {tasks.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                <div>
                  <p className="text-sm font-medium text-foreground">{t.title}</p>
                  <p className="text-xs text-muted-foreground">{t.acquisition_leads?.name} · {t.task_type}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => completeTask.mutate(t.id)}>
                  <CheckCircle className="w-4 h-4 text-primary" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={filterChannel} onValueChange={setFilterChannel}>
          <SelectTrigger className="w-40 input-radius"><Filter className="w-3 h-3 mr-2" /><SelectValue placeholder="Canal" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos canais</SelectItem>
            {CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Leads table */}
      <Card className="card-radius">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium text-muted-foreground">Nome</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Canal</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Contato</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead: any) => (
                  <tr key={lead.id} className="border-b hover:bg-muted/20">
                    <td className="p-3">
                      <p className="font-medium text-foreground">{lead.name}</p>
                      {lead.notes && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{lead.notes}</p>}
                    </td>
                    <td className="p-3"><Badge variant="secondary" className="text-xs capitalize">{lead.channel}</Badge></td>
                    <td className="p-3">
                      <Select value={lead.status} onValueChange={v => updateStatus.mutate({ id: lead.id, status: v })}>
                        <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        {lead.email && <Mail className="w-3.5 h-3.5 text-muted-foreground" />}
                        {lead.phone && <Phone className="w-3.5 h-3.5 text-muted-foreground" />}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        {lead.status !== "won" && lead.status !== "lost" && (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => updateStatus.mutate({ id: lead.id, status: "won" })}>
                              <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => updateStatus.mutate({ id: lead.id, status: "lost" })}>
                              <XCircle className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {leads.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhum lead ainda. Adicione seu primeiro lead!</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

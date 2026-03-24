import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Settings, Users, LayoutGrid, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";

import AdminDashboardTab from "@/components/circle/admin/AdminDashboardTab";
import AdminSettingsTab from "@/components/circle/admin/AdminSettingsTab";
import AdminMembersTab from "@/components/circle/admin/AdminMembersTab";
import AdminSpacesTab from "@/components/circle/admin/AdminSpacesTab";
import AdminSubscriptionsTab from "@/components/circle/admin/AdminSubscriptionsTab";

export default function CircleAdmin() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();

  const { data: community } = useQuery({
    queryKey: ["community", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return null;
      const { data } = await supabase.from("communities").select("*").eq("workspace_id", currentWorkspace.id).single();
      return data;
    },
    enabled: !!currentWorkspace,
  });

  const { data: member } = useQuery({
    queryKey: ["circle-member", community?.id, user?.id],
    queryFn: async () => {
      if (!community || !user) return null;
      const { data } = await supabase.from("community_members").select("*").eq("community_id", community.id).eq("user_id", user.id).single();
      return data;
    },
    enabled: !!community && !!user,
  });

  const isAdmin = member?.role === "OWNER" || member?.role === "ADMIN";

  const { data: pendingCount } = useQuery({
    queryKey: ["circle-pending-count", community?.id],
    queryFn: async () => {
      if (!community) return 0;
      const { count } = await supabase.from("community_members").select("*", { count: "exact", head: true }).eq("community_id", community.id).eq("status", "PENDING");
      return count || 0;
    },
    enabled: !!community && isAdmin,
  });

  if (!isAdmin) {
    return <div className="p-6 text-center"><p className="text-muted-foreground">Acesso restrito a administradores.</p></div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Admin da Comunidade</h1>

      <Tabs defaultValue="dashboard">
        <TabsList className="flex-wrap">
          <TabsTrigger value="dashboard"><BarChart3 className="h-4 w-4 mr-1.5" />Dashboard</TabsTrigger>
          <TabsTrigger value="settings"><Settings className="h-4 w-4 mr-1.5" />Configurações</TabsTrigger>
          <TabsTrigger value="members">
            <Users className="h-4 w-4 mr-1.5" />Membros
            {(pendingCount ?? 0) > 0 && <Badge className="ml-1.5 h-5 px-1.5 text-[10px]">{pendingCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="spaces"><LayoutGrid className="h-4 w-4 mr-1.5" />Espaços</TabsTrigger>
          <TabsTrigger value="subscriptions"><CreditCard className="h-4 w-4 mr-1.5" />Assinaturas</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          {community && <AdminDashboardTab community={community} />}
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          {community && <AdminSettingsTab community={community} />}
        </TabsContent>
        <TabsContent value="members" className="mt-4">
          {community && member && <AdminMembersTab community={community} currentMember={member} />}
        </TabsContent>
        <TabsContent value="spaces" className="mt-4">
          {community && <AdminSpacesTab community={community} />}
        </TabsContent>
        <TabsContent value="subscriptions" className="mt-4">
          {community && <AdminSubscriptionsTab community={community} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
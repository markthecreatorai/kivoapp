import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthProvider";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  currency: string;
  timezone: string;
  plan: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  user_id: string;
  workspace_id: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  created_at: string;
}

interface WorkspaceContextType {
  currentWorkspace: Workspace | null;
  userWorkspaces: Workspace[];
  workspaceMembership: WorkspaceMember | null;
  loading: boolean;
  fetchError: boolean;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  createWorkspace: (name: string) => Promise<Workspace | null>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

interface WorkspaceProviderProps {
  children: ReactNode;
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [userWorkspaces, setUserWorkspaces] = useState<Workspace[]>([]);
  const [workspaceMembership, setWorkspaceMembership] = useState<WorkspaceMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const { user, session, loading: authLoading } = useAuth();
  // Keep a ref to workspaces so switchWorkspace always sees the latest value
  const workspacesRef = useRef<Workspace[]>([]);

  const fetchUserWorkspaces = async () => {
    if (!user) {
      setUserWorkspaces([]);
      workspacesRef.current = [];
      setCurrentWorkspace(null);
      setWorkspaceMembership(null);
      setLoading(false);
      return;
    }

    try {
      const { data: memberships, error } = await supabase
        .from('workspace_members')
        .select(`
          *,
          workspaces (*)
        `)
        .eq('user_id', user.id);

      if (error) {
        console.error("Error fetching workspaces:", error);
        setFetchError(true);
        setUserWorkspaces([]);
        workspacesRef.current = [];
        setCurrentWorkspace(null);
        setWorkspaceMembership(null);
      } else if (memberships && memberships.length > 0) {
        setFetchError(false);
        const workspaces = memberships.map(m => m.workspaces).filter(Boolean);
        setUserWorkspaces(workspaces);
        workspacesRef.current = workspaces;

        // Try to restore stored workspace preference
        const storedWorkspaceId = localStorage.getItem('kivo_current_workspace');
        const preferred = storedWorkspaceId
          ? workspaces.find(w => w.id === storedWorkspaceId)
          : null;
        const target = preferred || workspaces[0];
        const membership = preferred
          ? memberships.find(m => m.workspace_id === storedWorkspaceId)
          : memberships[0];

        if (target) {
          setCurrentWorkspace(target);
          setWorkspaceMembership(membership || memberships[0]);
          localStorage.setItem('kivo_current_workspace', target.id);
        }
      } else {
        setUserWorkspaces([]);
        workspacesRef.current = [];
        setCurrentWorkspace(null);
        setWorkspaceMembership(null);
      }
    } catch (error) {
      console.error("Error fetching workspaces:", error);
      setUserWorkspaces([]);
      workspacesRef.current = [];
      setCurrentWorkspace(null);
      setWorkspaceMembership(null);
    } finally {
      setLoading(false);
    }
  };

  const switchWorkspace = async (workspaceId: string) => {
    const workspace = workspacesRef.current.find(w => w.id === workspaceId);
    if (workspace) {
      setCurrentWorkspace(workspace);
      
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('*')
        .eq('user_id', user?.id)
        .eq('workspace_id', workspaceId)
        .single();
      
      setWorkspaceMembership(membership);
      localStorage.setItem('kivo_current_workspace', workspaceId);
    }
  };

  const refreshWorkspaces = async () => {
    await fetchUserWorkspaces();
  };

  const createWorkspace = async (name: string): Promise<Workspace | null> => {
    if (!user) return null;

    try {
      const { data: slugData, error: slugError } = await supabase
        .rpc('generate_unique_slug', { base_name: name });

      if (slugError) {
        console.error("Error generating slug:", slugError);
        return null;
      }

      const { data: workspace, error: workspaceError } = await supabase
        .from('workspaces')
        .insert({
          name,
          slug: slugData,
        })
        .select()
        .single();

      if (workspaceError) {
        console.error("Error creating workspace:", workspaceError);
        return null;
      }

      const { error: memberError } = await supabase
        .from('workspace_members')
        .insert({
          user_id: user.id,
          workspace_id: workspace.id,
          role: 'OWNER',
        });

      if (memberError) {
        console.error("Error creating workspace membership:", memberError);
        return null;
      }

      await refreshWorkspaces();
      
      return workspace;
    } catch (error) {
      console.error("Error creating workspace:", error);
      return null;
    }
  };

  useEffect(() => {
    if (session) {
      setLoading(true);
      fetchUserWorkspaces();
    } else if (!session && !loading) {
      // Only clear when we're sure auth has finished loading (session is definitively null)
      // Don't clear during initial mount when auth is still resolving
    }
  }, [session]);

  // Separate effect: only clear workspace state when user is definitively logged out
  useEffect(() => {
    if (!authLoading && !user) {
      setUserWorkspaces([]);
      workspacesRef.current = [];
      setCurrentWorkspace(null);
      setWorkspaceMembership(null);
      setLoading(false);
    }
  }, [authLoading, user]);

  return (
    <WorkspaceContext.Provider value={{
      currentWorkspace,
      userWorkspaces,
      workspaceMembership,
      loading,
      fetchError,
      switchWorkspace,
      refreshWorkspaces,
      createWorkspace,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}

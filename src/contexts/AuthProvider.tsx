import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { completePendingCommunityJoin } from "@/lib/pendingCommunityJoin";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Rotas que são donas do próprio fluxo pós-login: aqui o SIGNED_IN não dispara
 * navegação automática, para não competir com o destino escolhido pela página
 * (ex: entrar em comunidade via convite).
 */
const skipRedirectPaths = ["/join", "/member/login", "/auth/callback"];

function shouldSkipAutoRedirect(pathname: string): boolean {
  if (skipRedirectPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  // /circles/:slug/about — página de entrada da comunidade
  if (/^\/circles\/[^/]+\/about$/.test(pathname)) return true;
  return false;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();


  useEffect(() => {
    const finalizeSignedIn = async (signedInUser: User) => {
      const skipRedirect = shouldSkipAutoRedirect(window.location.pathname);
      try {
        // A entrada pendente na comunidade sempre é concluída (é escrita no banco);
        // só a navegação automática é suprimida nas rotas donas do fluxo.
        const completed = await completePendingCommunityJoin(signedInUser.id);
        if (completed?.communitySlug) {
          if (skipRedirect) return;
          setTimeout(() => {
            navigate(
              completed.status === "PENDING"
                ? "/circles"
                : `/circles/${completed.communitySlug}/feed`,
              { replace: true }
            );
          }, 0);
          return;
        }
      } catch (error) {
        console.error("Error completing pending community join:", error);
      }

      if (skipRedirect) return;

      try {
        const raw = sessionStorage.getItem("kivo_nav_intent");
        if (raw) {
          const intent = JSON.parse(raw);
          sessionStorage.removeItem("kivo_nav_intent");
          if (intent.origin === "community" && intent.community_slug) {
            setTimeout(() => navigate(`/circles/${intent.community_slug}/feed`, { replace: true }), 0);
          }
        }
      } catch {}
    };


    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        if (_event === "SIGNED_OUT") {
          navigate("/login");
        }

        if (_event === "SIGNED_IN" && session?.user) {
          void finalizeSignedIn(session.user);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error("Error getting session:", error);
      }
      if (session) {
        setSession(session);
        setUser(session.user);
        supabase.auth.refreshSession().catch(() => {});
        void finalizeSignedIn(session.user);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Error signing out:", error);
      }
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

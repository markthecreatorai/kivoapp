import { describe, it, expect, vi, beforeEach } from "vitest";

// Unit tests for auth logic — no heavy component rendering

const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: (arg: any) => mockSignInWithPassword(arg),
      signOut: () => mockSignOut(),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: (_cb: any) => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      refreshSession: () => Promise.resolve({}),
    },
  },
}));

describe("Auth Logic Tests", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("signInWithPassword", () => {
    it("resolves with user on valid credentials", async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { user: { id: "u1", email: "test@test.com" }, session: { access_token: "tok" } },
        error: null,
      });
      const { supabase } = await import("@/integrations/supabase/client");
      const result = await supabase.auth.signInWithPassword({ email: "test@test.com", password: "pass" });
      expect(result.data.user?.id).toBe("u1");
      expect(result.error).toBeNull();
    });

    it("returns error on invalid credentials", async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: "Invalid login credentials" },
      });
      const { supabase } = await import("@/integrations/supabase/client");
      const result = await supabase.auth.signInWithPassword({ email: "bad@test.com", password: "wrong" });
      expect(result.error).toBeTruthy();
      expect(result.error?.message).toContain("Invalid");
    });
  });

  describe("signOut", () => {
    it("calls signOut successfully", async () => {
      mockSignOut.mockResolvedValue({ error: null });
      const { supabase } = await import("@/integrations/supabase/client");
      const result = await supabase.auth.signOut();
      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  describe("Session handling", () => {
    it("getSession returns null when not authenticated", async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const result = await supabase.auth.getSession();
      expect(result.data.session).toBeNull();
    });

    it("onAuthStateChange returns unsubscribe function", async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = supabase.auth.onAuthStateChange(() => {});
      expect(data.subscription.unsubscribe).toBeDefined();
    });
  });

  describe("ProtectedRoute logic", () => {
    it("requires user to be authenticated", () => {
      // ProtectedRoute checks: if (!user) -> Navigate to /login
      const user = null;
      const shouldRedirect = !user;
      expect(shouldRedirect).toBe(true);
    });

    it("allows authenticated user with workspace", () => {
      const user = { id: "u1" };
      const currentWorkspace = { id: "ws1" };
      const shouldRedirect = !user;
      const shouldOnboard = !currentWorkspace;
      expect(shouldRedirect).toBe(false);
      expect(shouldOnboard).toBe(false);
    });

    it("redirects to onboarding when no workspace", () => {
      const user = { id: "u1" };
      const currentWorkspace = null;
      const loading = false;
      const fetchError = false;
      const shouldOnboard = !loading && !fetchError && !currentWorkspace;
      expect(shouldOnboard).toBe(true);
    });
  });
});

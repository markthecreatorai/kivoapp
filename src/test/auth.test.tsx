import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn((_cb: any) => ({
  data: { subscription: { unsubscribe: vi.fn() } },
}));
const mockRefreshSession = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: (arg: any) => mockSignInWithPassword(arg),
      signUp: vi.fn(),
      signOut: () => mockSignOut(),
      resetPasswordForEmail: vi.fn(),
      signInWithOAuth: vi.fn(),
      getSession: () => mockGetSession(),
      onAuthStateChange: (_cb: any) => mockOnAuthStateChange(_cb),
      refreshSession: () => mockRefreshSession(),
    },
  },
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ user: null, loading: false, session: null, signOut: mockSignOut }),
}));

vi.mock("@/contexts/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    currentWorkspace: null,
    userWorkspaces: [],
    workspaceMembership: null,
    loading: false,
    fetchError: false,
    switchWorkspace: vi.fn(),
    refreshWorkspaces: vi.fn(),
    createWorkspace: vi.fn(),
  }),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe("Auth Flow Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockRefreshSession.mockResolvedValue({});
  });

  describe("Login Page", () => {
    it("renders login form with email and password fields", async () => {
      const Login = (await import("@/pages/Login")).default;
      render(<MemoryRouter><Login /></MemoryRouter>);
      expect(screen.getByLabelText("Email")).toBeInTheDocument();
      expect(screen.getByLabelText("Senha")).toBeInTheDocument();
    });

    it("calls signInWithPassword with correct credentials", async () => {
      mockSignInWithPassword.mockResolvedValue({ data: { user: { id: "1" } }, error: null });
      const Login = (await import("@/pages/Login")).default;
      render(<MemoryRouter><Login /></MemoryRouter>);
      fireEvent.change(screen.getByLabelText("Email"), { target: { value: "test@test.com" } });
      fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "password123" } });
      fireEvent.click(screen.getByRole("button", { name: /entrar/i }));
      await waitFor(() => {
        expect(mockSignInWithPassword).toHaveBeenCalledWith({
          email: "test@test.com",
          password: "password123",
        });
      });
    });

    it("shows error toast on invalid credentials", async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { message: "Invalid login credentials" },
      });
      const Login = (await import("@/pages/Login")).default;
      render(<MemoryRouter><Login /></MemoryRouter>);
      fireEvent.change(screen.getByLabelText("Email"), { target: { value: "wrong@test.com" } });
      fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "wrong" } });
      fireEvent.click(screen.getByRole("button", { name: /entrar/i }));
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
      });
    });

    it("has Google login button", async () => {
      const Login = (await import("@/pages/Login")).default;
      render(<MemoryRouter><Login /></MemoryRouter>);
      expect(screen.getByText(/google/i)).toBeInTheDocument();
    });

    it("has forgot password link", async () => {
      const Login = (await import("@/pages/Login")).default;
      render(<MemoryRouter><Login /></MemoryRouter>);
      expect(screen.getByText(/esqueci/i)).toBeInTheDocument();
    });
  });

  describe("ProtectedRoute", () => {
    it("redirects unauthenticated users (no protected content rendered)", async () => {
      const ProtectedRoute = (await import("@/components/ProtectedRoute")).default;
      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <ProtectedRoute><div>Protected Content</div></ProtectedRoute>
        </MemoryRouter>
      );
      expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    });
  });
});

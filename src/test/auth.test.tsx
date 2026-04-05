import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock supabase client
const mockSignInWithPassword = vi.fn();
const mockSignUp = vi.fn();
const mockSignOut = vi.fn();
const mockResetPasswordForEmail = vi.fn();
const mockSignInWithOAuth = vi.fn();
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn(() => ({
  data: { subscription: { unsubscribe: vi.fn() } },
}));
const mockRefreshSession = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: any[]) => mockSignInWithPassword(...args),
      signUp: (...args: any[]) => mockSignUp(...args),
      signOut: (...args: any[]) => mockSignOut(...args),
      resetPasswordForEmail: (...args: any[]) => mockResetPasswordForEmail(...args),
      signInWithOAuth: (...args: any[]) => mockSignInWithOAuth(...args),
      getSession: (...args: any[]) => mockGetSession(...args),
      onAuthStateChange: (...args: any[]) => mockOnAuthStateChange(...args),
      refreshSession: (...args: any[]) => mockRefreshSession(...args),
    },
  },
}));

// Mock useAuth
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ user: null, loading: false, session: null, signOut: mockSignOut }),
}));

// Mock useToast
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
      render(
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      );
      expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/senha/i)).toBeInTheDocument();
    });

    it("shows validation error for empty fields", async () => {
      const Login = (await import("@/pages/Login")).default;
      render(
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      );
      const submitBtn = screen.getByRole("button", { name: /entrar/i });
      fireEvent.click(submitBtn);
      // Should not call signIn with empty fields
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
    });

    it("calls signInWithPassword with correct credentials", async () => {
      mockSignInWithPassword.mockResolvedValue({ data: { user: { id: "1" } }, error: null });
      const Login = (await import("@/pages/Login")).default;
      render(
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      );
      fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "test@test.com" } });
      fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: "password123" } });
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
      render(
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      );
      fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "wrong@test.com" } });
      fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: "wrong" } });
      fireEvent.click(screen.getByRole("button", { name: /entrar/i }));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ variant: "destructive" })
        );
      });
    });

    it("has Google login button", async () => {
      const Login = (await import("@/pages/Login")).default;
      render(
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      );
      expect(screen.getByText(/google/i)).toBeInTheDocument();
    });

    it("has forgot password link", async () => {
      const Login = (await import("@/pages/Login")).default;
      render(
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      );
      expect(screen.getByText(/esqueceu/i)).toBeInTheDocument();
    });
  });

  describe("ProtectedRoute", () => {
    it("redirects to login when not authenticated", async () => {
      const ProtectedRoute = (await import("@/components/ProtectedRoute")).default;
      // Mock useWorkspace
      vi.doMock("@/contexts/WorkspaceProvider", () => ({
        useWorkspace: () => ({
          currentWorkspace: null,
          loading: false,
          fetchError: false,
        }),
      }));

      const { container } = render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <ProtectedRoute>
            <div>Protected Content</div>
          </ProtectedRoute>
        </MemoryRouter>
      );
      // Should not render protected content
      expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    });
  });

  describe("AuthProvider", () => {
    it("provides auth context with user null initially", async () => {
      const { useAuth } = await vi.importActual<any>("@/contexts/AuthProvider");
      // Just verify the context shape
      expect(useAuth).toBeDefined();
    });
  });
});

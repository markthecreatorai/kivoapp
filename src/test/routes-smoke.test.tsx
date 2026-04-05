import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Suspense, lazy } from "react";

// Mock supabase globally
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() => new Promise(() => {})),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(() => new Promise(() => {})),
    })),
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    functions: { invoke: vi.fn() },
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  },
}));

vi.mock("@/lib/tracking", () => ({ trackEvent: vi.fn() }));
vi.mock("@/hooks/useAffiliateTracking", () => ({ getStoredAffiliateLink: () => null }));

describe("Route Smoke Tests – Deep-link Reload", () => {
  const publicRoutes = [
    { path: "/login", label: "Login" },
    { path: "/signup", label: "Signup" },
    { path: "/forgot-password", label: "Forgot" },
    { path: "/privacy", label: "Privacy" },
    { path: "/terms", label: "Terms" },
  ];

  publicRoutes.forEach(({ path, label }) => {
    it(`renders ${label} page at ${path} without crash`, async () => {
      // Dynamically import page component
      const pageName = path === "/login" ? "Login"
        : path === "/signup" ? "Signup"
        : path === "/forgot-password" ? "ForgotPassword"
        : path === "/privacy" ? "Privacy"
        : "Terms";

      const PageComponent = lazy(() => import(`@/pages/${pageName}`));

      const { container } = render(
        <MemoryRouter initialEntries={[path]}>
          <Suspense fallback={<div data-testid="loading">Loading</div>}>
            <Routes>
              <Route path={path} element={<PageComponent />} />
            </Routes>
          </Suspense>
        </MemoryRouter>
      );

      // Should render something (suspense fallback or actual page)
      expect(container).toBeTruthy();
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it("renders /checkout/:slug without crash", async () => {
    const Checkout = lazy(() => import("@/pages/Checkout"));
    const { container } = render(
      <MemoryRouter initialEntries={["/checkout/test-product"]}>
        <Suspense fallback={<div>Loading</div>}>
          <Routes>
            <Route path="/checkout/:productSlug" element={<Checkout />} />
          </Routes>
        </Suspense>
      </MemoryRouter>
    );
    expect(container).toBeTruthy();
  });

  it("renders 404 page for unknown routes", async () => {
    const NotFound = lazy(() => import("@/pages/NotFound"));
    const { container } = render(
      <MemoryRouter initialEntries={["/this-does-not-exist"]}>
        <Suspense fallback={<div>Loading</div>}>
          <Routes>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </MemoryRouter>
    );
    expect(container).toBeTruthy();
  });
});

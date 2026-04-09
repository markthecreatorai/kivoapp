import { Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, keepPreviousData, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useSearchParams, useParams } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthProvider";
import { WorkspaceProvider, useWorkspace } from "@/contexts/WorkspaceProvider";
import { supabase } from "@/integrations/supabase/client";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageSkeleton } from "@/components/PageSkeleton";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SuspenseWithTimeout } from "@/components/SuspenseWithTimeout";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { clearChunkReloadFlag } from "@/lib/lazyWithRetry";

// Lazy-loaded pages
const Login = lazyWithRetry(() => import("./pages/Login"));
const Signup = lazyWithRetry(() => import("./pages/Signup"));
const ForgotPassword = lazyWithRetry(() => import("./pages/ForgotPassword"));
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"));
const VerifyEmail = lazyWithRetry(() => import("./pages/VerifyEmail"));
const AuthCallback = lazyWithRetry(() => import("./pages/AuthCallback"));
const Income = lazyWithRetry(() => import("./pages/Income"));
const Onboarding = lazyWithRetry(() => import("./pages/Onboarding"));
const Dashboard = lazyWithRetry(() => import("./pages/Dashboard"));
const Customers = lazyWithRetry(() => import("./pages/Customers"));
const Products = lazyWithRetry(() => import("./pages/Products"));
const CreateProduct = lazyWithRetry(() => import("./pages/CreateProduct"));
const NewProduct = lazyWithRetry(() => import("./pages/NewProduct"));
const ProductEditor = lazyWithRetry(() => import("./pages/ProductEditor"));
const CourseBuilder = lazyWithRetry(() => import("./pages/CourseBuilder"));
const StorefrontEditor = lazyWithRetry(() => import("./pages/StorefrontEditor"));
const Store = lazyWithRetry(() => import("./pages/Store"));
const PublicStorefront = lazyWithRetry(() => import("./pages/PublicStorefront"));
const Checkout = lazyWithRetry(() => import("./pages/Checkout"));
const OrderSuccess = lazyWithRetry(() => import("./pages/OrderSuccess"));
const Upsell = lazyWithRetry(() => import("./pages/Upsell"));
const MemberLogin = lazyWithRetry(() => import("./pages/MemberLogin"));
const MemberDashboard = lazyWithRetry(() => import("./pages/MemberDashboard"));
const MemberCourse = lazyWithRetry(() => import("./pages/MemberCourse"));
const MemberBilling = lazyWithRetry(() => import("./pages/MemberBilling"));
const MemberLibrary = lazyWithRetry(() => import("./pages/MemberLibrary"));
const MemberCertificates = lazyWithRetry(() => import("./pages/MemberCertificates"));
const Affiliates = lazyWithRetry(() => import("./pages/Affiliates"));
const ReferralsDashboard = lazyWithRetry(() => import("./pages/ReferralsDashboard"));
const AffiliateApply = lazyWithRetry(() => import("./pages/AffiliateApply"));
const AffiliateDashboard = lazyWithRetry(() => import("./pages/AffiliateDashboard"));
const Leads = lazyWithRetry(() => import("./pages/Leads"));
const LeadSegments = lazyWithRetry(() => import("./pages/LeadSegments"));
const LeadEmail = lazyWithRetry(() => import("./pages/LeadEmail"));
const Analytics = lazyWithRetry(() => import("./pages/Analytics"));
const Settings = lazyWithRetry(() => import("./pages/Settings"));
const MenuTools = lazyWithRetry(() => import("./pages/MenuTools"));
const Coupons = lazyWithRetry(() => import("./pages/Coupons"));

const Appointments = lazyWithRetry(() => import("./pages/Appointments"));
const BookAppointment = lazyWithRetry(() => import("./pages/BookAppointment"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const Pricing = lazyWithRetry(() => import("./pages/Pricing"));
const BillingSuccess = lazyWithRetry(() => import("./pages/BillingSuccess"));
const BillingCancel = lazyWithRetry(() => import("./pages/BillingCancel"));
const UpgradeFlow = lazyWithRetry(() => import("./pages/UpgradeFlow"));
const PaymentLogs = lazyWithRetry(() => import("./pages/PaymentLogs"));
const FiscalClosing = lazyWithRetry(() => import("./pages/FiscalClosing"));
const EmailCampaigns = lazyWithRetry(() => import("./pages/EmailCampaigns"));
const AnalyticsExecutive = lazyWithRetry(() => import("./pages/AnalyticsExecutive"));
const LandingPage = lazyWithRetry(() => import("./pages/LandingPage"));
const Privacy = lazyWithRetry(() => import("./pages/Privacy"));
const Terms = lazyWithRetry(() => import("./pages/Terms"));
const GtmDashboard = lazyWithRetry(() => import("./pages/GtmDashboard"));
const GtmPlaybook = lazyWithRetry(() => import("./pages/GtmPlaybook"));
const AcquisitionPipeline = lazyWithRetry(() => import("./pages/AcquisitionPipeline"));
const OpsDashboard = lazyWithRetry(() => import("./pages/OpsDashboard"));
const LaunchReadiness = lazyWithRetry(() => import("./pages/LaunchReadiness"));
const OpsFeedback = lazyWithRetry(() => import("./pages/OpsFeedback"));
const OpsWeekPlan = lazyWithRetry(() => import("./pages/OpsWeekPlan"));
const FinancialHealth = lazyWithRetry(() => import("./pages/FinancialHealth"));
const CreatorFinance = lazyWithRetry(() => import("./pages/CreatorFinance"));
const AdminPayouts = lazyWithRetry(() => import("./pages/AdminPayouts"));
const AdminRiskReview = lazyWithRetry(() => import("./pages/AdminRiskReview"));
const AdminChargebacks = lazyWithRetry(() => import("./pages/AdminChargebacks"));
const FinancialHealthDashboard = lazyWithRetry(() => import("./pages/FinancialHealthDashboard"));
const GoLiveChecklist = lazyWithRetry(() => import("./pages/GoLiveChecklist"));
const AdminSubscriptions = lazyWithRetry(() => import("./pages/AdminSubscriptions"));
const AutoDM = lazyWithRetry(() => import("./pages/AutoDM"));

const CircleLayout = lazyWithRetry(() => import("./components/circle/CircleLayout"));
const CircleFeed = lazyWithRetry(() => import("./pages/circle/CircleFeed"));
const CircleMembers = lazyWithRetry(() => import("./pages/circle/CircleMembers"));
const CircleLeaderboard = lazyWithRetry(() => import("./pages/circle/CircleLeaderboard"));
const CircleEvents = lazyWithRetry(() => import("./pages/circle/CircleEvents"));
const CircleClassroom = lazyWithRetry(() => import("./pages/circle/CircleClassroom"));

const CirclePostDetail = lazyWithRetry(() => import("./pages/circle/CirclePostDetail"));

// Redirect /c/:slug/post/:id → /c/:slug/feed?post=:id
const CirclePostRedirect = lazyWithRetry(() => import("./pages/circle/CirclePostRedirect"));

const CircleSettings = lazyWithRetry(() => import("./pages/circle/CircleSettings"));
const CircleProfile = lazyWithRetry(() => import("./pages/circle/CircleProfile"));
const MyCommunities = lazyWithRetry(() => import("./pages/circle/MyCommunities"));
const CircleAbout = lazyWithRetry(() => import("./pages/circle/CircleAbout"));
const CircleResources = lazyWithRetry(() => import("./pages/circle/CircleResources"));
const CircleTasks = lazyWithRetry(() => import("./pages/circle/CircleTasks"));
const CommunitySelectPlan = lazyWithRetry(() => import("./pages/circle/CommunitySelectPlan"));
const VerifyCertificate = lazyWithRetry(() => import("./pages/VerifyCertificate"));

// Public community pages
const CommunityDiscovery = lazyWithRetry(() => import("./pages/CommunityDiscovery"));
const JoinRedirect = lazyWithRetry(() => import("./pages/JoinRedirect"));

/** Redirect /circles/:slug → /circles/:slug/about preserving query params */
function CommunitySlugRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const qs = searchParams.toString();
  return <Navigate to={`/circles/${slug}/about${qs ? `?${qs}` : ""}`} replace />;
}

/** Redirect /circle-settings?section=X and /circle/settings?section=X → first community settings */
function CircleSettingsRedirect() {
  const [searchParams] = useSearchParams();
  const section = searchParams.get("section");
  const { currentWorkspace } = useWorkspace();

  const { data: community } = useQuery({
    queryKey: ["community-for-redirect", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return null;
      const { data } = await supabase.from("communities").select("slug").eq("workspace_id", currentWorkspace.id).maybeSingle();
      return data;
    },
    enabled: !!currentWorkspace,
  });

  if (!community?.slug) return null;
  const target = section ? `/circles/${community.slug}/settings?section=${section}` : `/circles/${community.slug}/settings`;
  return <Navigate to={target} replace />;
}

/** Legacy /c/:slug/* → /circles/:slug/* redirect */
function LegacyCRedirect() {
  const { slug, "*": rest } = useParams<{ slug: string; "*": string }>();
  const [searchParams] = useSearchParams();
  const qs = searchParams.toString();
  const target = `/circles/${slug}${rest ? `/${rest}` : ""}${qs ? `?${qs}` : ""}`;
  return <Navigate to={target} replace />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 60s default (was 2min — faster perceived freshness)
      gcTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      retry: 1,
      placeholderData: keepPreviousData, // keep previous data while refetching
    },
  },
});

// Prefetch hot routes after initial paint
function usePrefetchRoutes() {
  useEffect(() => {
    const timer = setTimeout(() => {
      // Prefetch the 4 most-visited dashboard pages
      import("./pages/Dashboard");
      import("./pages/Products");
      import("./pages/Settings");
      import("./pages/Analytics");
    }, 2000); // 2s after mount — after initial paint settles
    return () => clearTimeout(timer);
  }, []);
}

/** Persistent dashboard shell — sidebar/topbar mount once, pages swap via Outlet */
function DashboardShell() {
  usePrefetchRoutes();
  useEffect(() => { clearChunkReloadFlag(); }, []);
  return (
    <ProtectedRoute>
      <DashboardLayout>
        <ErrorBoundary isRouteLevel>
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </DashboardLayout>
    </ProtectedRoute>
  );
}

import type { ReactNode } from "react";
import { useReferralTracking } from "@/hooks/useReferralTracking";

function GlobalTrackingWrapper({ children }: { children: ReactNode }) {
  useReferralTracking();
  return <>{children}</>;
}

/** Admin-guarded shell */
function AdminShell() {
  return (
    <ProtectedRoute>
      <AdminRoute>
        <DashboardLayout>
          <ErrorBoundary isRouteLevel>
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </DashboardLayout>
      </AdminRoute>
    </ProtectedRoute>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <WorkspaceProvider>
              <SuspenseWithTimeout fallback={<PageSkeleton />}>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/billing/success" element={<ProtectedRoute><BillingSuccess /></ProtectedRoute>} />
                <Route path="/billing/cancel" element={<BillingCancel />} />
                <Route path="/billing/upgrade-flow" element={<ProtectedRoute><UpgradeFlow /></ProtectedRoute>} />
                <Route path="/resend-verification" element={<Navigate to="/verify-email" replace />} />

                {/* Onboarding */}
                <Route
                  path="/onboarding"
                  element={
                    <ProtectedRoute requireWorkspace={false} requireEmailVerification={false}>
                      <Onboarding />
                    </ProtectedRoute>
                  }
                />

                {/* ===== PERSISTENT DASHBOARD LAYOUT ===== */}
                <Route element={<DashboardShell />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/referrals" element={<ReferralsDashboard />} />
                  <Route path="/creator-finance" element={<CreatorFinance />} />
                  <Route path="/earnings" element={<Income />} />
                  <Route path="/coupons" element={<Coupons />} />
                  <Route path="/products" element={<Navigate to="/store?tab=loja" replace />} />
                  <Route path="/products/new" element={<NewProduct />} />
                  <Route path="/products/:id/edit" element={<ProductEditor />} />
                  <Route path="/store" element={<Store />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/clients" element={<Customers />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/menu-tools" element={<MenuTools />} />
                  <Route path="/affiliates" element={<Affiliates />} />
                  <Route path="/email-flows" element={<Navigate to="/email-campaigns" replace />} />
                  <Route path="/leads" element={<Leads />} />
                  <Route path="/leads/segments" element={<LeadSegments />} />
                  <Route path="/leads/email" element={<LeadEmail />} />
                  <Route path="/appointments" element={<Appointments />} />
                  <Route path="/payment-logs" element={<PaymentLogs />} />
                  <Route path="/autodm" element={<AutoDM />} />
                  <Route path="/fiscal" element={<FiscalClosing />} />
                  <Route path="/email-campaigns" element={<EmailCampaigns />} />
                </Route>

                {/* ===== ADMIN PERSISTENT LAYOUT ===== */}
                <Route element={<AdminShell />}>
                  <Route path="/analytics/executive" element={<AnalyticsExecutive />} />
                  <Route path="/gtm" element={<GtmDashboard />} />
                  <Route path="/gtm/playbook" element={<GtmPlaybook />} />
                  <Route path="/acquisition" element={<AcquisitionPipeline />} />
                  <Route path="/ops" element={<OpsDashboard />} />
                  <Route path="/ops/launch" element={<LaunchReadiness />} />
                  <Route path="/ops/feedback" element={<OpsFeedback />} />
                  <Route path="/ops/week-plan" element={<OpsWeekPlan />} />
                  <Route path="/ops/financial-health" element={<FinancialHealth />} />
                  <Route path="/admin/payouts" element={<AdminPayouts />} />
                  <Route path="/admin/risk-review" element={<AdminRiskReview />} />
                  <Route path="/admin/chargebacks" element={<AdminChargebacks />} />
                  <Route path="/admin/financial-health" element={<FinancialHealthDashboard />} />
                  <Route path="/admin/go-live" element={<GoLiveChecklist />} />
                  <Route path="/admin/subscriptions" element={<AdminSubscriptions />} />
                </Route>

                {/* Full-screen protected routes (no persistent layout) */}
                <Route path="/products/:id/course-builder" element={<ProtectedRoute><CourseBuilder /></ProtectedRoute>} />
                <Route path="/store/editor" element={<ProtectedRoute><StorefrontEditor /></ProtectedRoute>} />

                {/* ===== CIRCLE ROUTES (slug-based, Skool-style) ===== */}
                {/* Hub: all communities the user belongs to */}
                <Route path="/circles" element={<ProtectedRoute requireWorkspace={false}><MyCommunities /></ProtectedRoute>} />

                {/* Legacy redirect: /circle → /circles */}
                <Route path="/circle" element={<Navigate to="/circles" replace />} />

                {/* Redirect to about page */}
                <Route path="/circles/:slug" element={<CommunitySlugRedirect />} />
                <Route path="/circles/:slug/plans" element={<CommunitySelectPlan />} />

                {/* Authenticated circle pages — persistent CircleLayout with Outlet */}
                <Route element={<ErrorBoundary isRouteLevel><CircleLayout /></ErrorBoundary>}>
                  <Route path="/circles/:slug/feed" element={<CircleFeed />} />
                  <Route path="/circles/:slug/spaces/:spaceSlug" element={<CircleFeed />} />
                  <Route path="/circles/:slug/members" element={<CircleMembers />} />
                  <Route path="/circles/:slug/leaderboard" element={<CircleLeaderboard />} />
                  <Route path="/circles/:slug/events" element={<CircleEvents />} />
                  <Route path="/circles/:slug/classroom" element={<CircleClassroom />} />
                  <Route path="/circles/:slug/admin" element={<CircleFeed />} />
                  <Route path="/circles/:slug/messages" element={<CircleFeed />} />
                  <Route path="/circles/:slug/post/:id" element={<CirclePostRedirect />} />
                  <Route path="/circles/:slug/settings" element={<CircleSettings />} />
                  <Route path="/circles/:slug/about" element={<CircleAbout />} />
                  <Route path="/circles/:slug/resources" element={<CircleResources />} />
                  <Route path="/circles/:slug/tasks" element={<CircleTasks />} />
                  <Route path="/circles/:slug/profile" element={<CircleProfile />} />
                  <Route path="/circles/:slug/profile/:memberId" element={<CircleProfile />} />
                </Route>

                {/* Legacy redirects */}
                <Route path="/join/:slug" element={<JoinRedirect />} />
                <Route path="/c/:slug/*" element={<LegacyCRedirect />} />
                <Route path="/c/:slug" element={<LegacyCRedirect />} />
                <Route path="/circle-settings" element={<ProtectedRoute requireWorkspace={false}><CircleSettingsRedirect /></ProtectedRoute>} />
                <Route path="/circle/settings" element={<ProtectedRoute requireWorkspace={false}><CircleSettingsRedirect /></ProtectedRoute>} />

                {/* Certificate verification */}
                <Route path="/verify/:code" element={<VerifyCertificate />} />

                {/* Public community discovery */}
                <Route path="/circles/explore" element={<CommunityDiscovery />} />
                {/* Legacy redirects */}
                <Route path="/communities" element={<Navigate to="/circles/explore" replace />} />
                <Route path="/circles/discover" element={<Navigate to="/circles/explore" replace />} />

                {/* Landing page */}
                <Route path="/" element={<GlobalTrackingWrapper><LandingPage /></GlobalTrackingWrapper>} />
                <Route path="/privacy" element={<GlobalTrackingWrapper><Privacy /></GlobalTrackingWrapper>} />
                <Route path="/terms" element={<GlobalTrackingWrapper><Terms /></GlobalTrackingWrapper>} />

                {/* Public routes */}
                <Route path="/checkout/:productSlug" element={<GlobalTrackingWrapper><Checkout /></GlobalTrackingWrapper>} />
                <Route path="/order/success/:orderId" element={<GlobalTrackingWrapper><OrderSuccess /></GlobalTrackingWrapper>} />
                <Route path="/upsell/:offerId" element={<GlobalTrackingWrapper><Upsell /></GlobalTrackingWrapper>} />
                <Route path="/member/login" element={<GlobalTrackingWrapper><MemberLogin /></GlobalTrackingWrapper>} />
                <Route path="/member" element={<GlobalTrackingWrapper><MemberDashboard /></GlobalTrackingWrapper>} />
                <Route path="/member/course/:productId" element={<GlobalTrackingWrapper><MemberCourse /></GlobalTrackingWrapper>} />
                <Route path="/member/billing" element={<GlobalTrackingWrapper><MemberBilling /></GlobalTrackingWrapper>} />
                <Route path="/member/library" element={<GlobalTrackingWrapper><MemberLibrary /></GlobalTrackingWrapper>} />
                <Route path="/member/certificates" element={<GlobalTrackingWrapper><MemberCertificates /></GlobalTrackingWrapper>} />
                <Route path="/book/:productSlug" element={<GlobalTrackingWrapper><BookAppointment /></GlobalTrackingWrapper>} />
                <Route path="/affiliate/apply/:workspaceSlug" element={<GlobalTrackingWrapper><AffiliateApply /></GlobalTrackingWrapper>} />
                <Route path="/affiliate/dashboard" element={<GlobalTrackingWrapper><AffiliateDashboard /></GlobalTrackingWrapper>} />
                <Route path="/:slug" element={<ErrorBoundary isRouteLevel><GlobalTrackingWrapper><PublicStorefront /></GlobalTrackingWrapper></ErrorBoundary>} />
                <Route path="*" element={<GlobalTrackingWrapper><NotFound /></GlobalTrackingWrapper>} />
              </Routes>
              </SuspenseWithTimeout>
            </WorkspaceProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;

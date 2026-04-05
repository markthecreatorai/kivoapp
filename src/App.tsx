import { lazy, Suspense, useEffect } from "react";
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

// Lazy-loaded pages
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Income = lazy(() => import("./pages/Income"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Customers = lazy(() => import("./pages/Customers"));
const Products = lazy(() => import("./pages/Products"));
const CreateProduct = lazy(() => import("./pages/CreateProduct"));
const NewProduct = lazy(() => import("./pages/NewProduct"));
const ProductEditor = lazy(() => import("./pages/ProductEditor"));
const CourseBuilder = lazy(() => import("./pages/CourseBuilder"));
const StorefrontEditor = lazy(() => import("./pages/StorefrontEditor"));
const Store = lazy(() => import("./pages/Store"));
const PublicStorefront = lazy(() => import("./pages/PublicStorefront"));
const Checkout = lazy(() => import("./pages/Checkout"));
const OrderSuccess = lazy(() => import("./pages/OrderSuccess"));
const Upsell = lazy(() => import("./pages/Upsell"));
const MemberLogin = lazy(() => import("./pages/MemberLogin"));
const MemberDashboard = lazy(() => import("./pages/MemberDashboard"));
const MemberCourse = lazy(() => import("./pages/MemberCourse"));
const MemberBilling = lazy(() => import("./pages/MemberBilling"));
const MemberLibrary = lazy(() => import("./pages/MemberLibrary"));
const MemberCertificates = lazy(() => import("./pages/MemberCertificates"));
const Affiliates = lazy(() => import("./pages/Affiliates"));
const ReferralsDashboard = lazy(() => import("./pages/ReferralsDashboard"));
const AffiliateApply = lazy(() => import("./pages/AffiliateApply"));
const AffiliateDashboard = lazy(() => import("./pages/AffiliateDashboard"));
const Leads = lazy(() => import("./pages/Leads"));
const LeadSegments = lazy(() => import("./pages/LeadSegments"));
const LeadEmail = lazy(() => import("./pages/LeadEmail"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));
const MenuTools = lazy(() => import("./pages/MenuTools"));
const Coupons = lazy(() => import("./pages/Coupons"));
const EmailFlows = lazy(() => import("./pages/EmailFlows"));
const Appointments = lazy(() => import("./pages/Appointments"));
const BookAppointment = lazy(() => import("./pages/BookAppointment"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Pricing = lazy(() => import("./pages/Pricing"));
const BillingSuccess = lazy(() => import("./pages/BillingSuccess"));
const BillingCancel = lazy(() => import("./pages/BillingCancel"));
const UpgradeFlow = lazy(() => import("./pages/UpgradeFlow"));
const PaymentLogs = lazy(() => import("./pages/PaymentLogs"));
const FiscalClosing = lazy(() => import("./pages/FiscalClosing"));
const EmailCampaigns = lazy(() => import("./pages/EmailCampaigns"));
const AnalyticsExecutive = lazy(() => import("./pages/AnalyticsExecutive"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const GtmDashboard = lazy(() => import("./pages/GtmDashboard"));
const GtmPlaybook = lazy(() => import("./pages/GtmPlaybook"));
const AcquisitionPipeline = lazy(() => import("./pages/AcquisitionPipeline"));
const OpsDashboard = lazy(() => import("./pages/OpsDashboard"));
const LaunchReadiness = lazy(() => import("./pages/LaunchReadiness"));
const OpsFeedback = lazy(() => import("./pages/OpsFeedback"));
const OpsWeekPlan = lazy(() => import("./pages/OpsWeekPlan"));
const FinancialHealth = lazy(() => import("./pages/FinancialHealth"));
const CreatorFinance = lazy(() => import("./pages/CreatorFinance"));
const AdminPayouts = lazy(() => import("./pages/AdminPayouts"));
const AdminRiskReview = lazy(() => import("./pages/AdminRiskReview"));
const AdminChargebacks = lazy(() => import("./pages/AdminChargebacks"));
const FinancialHealthDashboard = lazy(() => import("./pages/FinancialHealthDashboard"));
const GoLiveChecklist = lazy(() => import("./pages/GoLiveChecklist"));
const AdminSubscriptions = lazy(() => import("./pages/AdminSubscriptions"));
const AutoDM = lazy(() => import("./pages/AutoDM"));

const CircleLayout = lazy(() => import("./components/circle/CircleLayout"));
const CircleFeed = lazy(() => import("./pages/circle/CircleFeed"));
const CircleMembers = lazy(() => import("./pages/circle/CircleMembers"));
const CircleLeaderboard = lazy(() => import("./pages/circle/CircleLeaderboard"));
const CircleEvents = lazy(() => import("./pages/circle/CircleEvents"));
const CircleClassroom = lazy(() => import("./pages/circle/CircleClassroom"));

const CirclePostDetail = lazy(() => import("./pages/circle/CirclePostDetail"));

// Redirect /c/:slug/post/:id → /c/:slug/feed?post=:id
const CirclePostRedirect = lazy(() => import("./pages/circle/CirclePostRedirect"));

const CircleSettings = lazy(() => import("./pages/circle/CircleSettings"));
const CircleProfile = lazy(() => import("./pages/circle/CircleProfile"));
const MyCommunities = lazy(() => import("./pages/circle/MyCommunities"));
const CircleAbout = lazy(() => import("./pages/circle/CircleAbout"));
const CircleResources = lazy(() => import("./pages/circle/CircleResources"));
const CircleTasks = lazy(() => import("./pages/circle/CircleTasks"));
const CommunitySelectPlan = lazy(() => import("./pages/circle/CommunitySelectPlan"));
const VerifyCertificate = lazy(() => import("./pages/VerifyCertificate"));

// Public community pages
const CommunityDiscovery = lazy(() => import("./pages/CommunityDiscovery"));
const JoinRedirect = lazy(() => import("./pages/JoinRedirect"));

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
  return (
    <ProtectedRoute>
      <DashboardLayout>
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
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
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </DashboardLayout>
      </AdminRoute>
    </ProtectedRoute>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <WorkspaceProvider>
            <Suspense fallback={null}>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
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
                  <Route path="/email-flows" element={<EmailFlows />} />
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
                <Route element={<CircleLayout />}>
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
                <Route path="/:slug" element={<GlobalTrackingWrapper><PublicStorefront /></GlobalTrackingWrapper>} />
                <Route path="*" element={<GlobalTrackingWrapper><NotFound /></GlobalTrackingWrapper>} />
              </Routes>
            </Suspense>
          </WorkspaceProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

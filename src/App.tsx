import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, keepPreviousData } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthProvider";
import { WorkspaceProvider } from "@/contexts/WorkspaceProvider";
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
const Income = lazy(() => import("./pages/Income"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Customers = lazy(() => import("./pages/Customers"));
const Products = lazy(() => import("./pages/Products"));
const CreateProduct = lazy(() => import("./pages/CreateProduct"));
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
const Affiliates = lazy(() => import("./pages/Affiliates"));
const AffiliateApply = lazy(() => import("./pages/AffiliateApply"));
const AffiliateDashboard = lazy(() => import("./pages/AffiliateDashboard"));
const Leads = lazy(() => import("./pages/Leads"));
const LeadSegments = lazy(() => import("./pages/LeadSegments"));
const LeadEmail = lazy(() => import("./pages/LeadEmail"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));
const Coupons = lazy(() => import("./pages/Coupons"));
const EmailFlows = lazy(() => import("./pages/EmailFlows"));
const Appointments = lazy(() => import("./pages/Appointments"));
const BookAppointment = lazy(() => import("./pages/BookAppointment"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Pricing = lazy(() => import("./pages/Pricing"));
const PaymentLogs = lazy(() => import("./pages/PaymentLogs"));
const FiscalClosing = lazy(() => import("./pages/FiscalClosing"));
const EmailCampaigns = lazy(() => import("./pages/EmailCampaigns"));
const AnalyticsExecutive = lazy(() => import("./pages/AnalyticsExecutive"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const GtmDashboard = lazy(() => import("./pages/GtmDashboard"));
const GtmPlaybook = lazy(() => import("./pages/GtmPlaybook"));
const AcquisitionPipeline = lazy(() => import("./pages/AcquisitionPipeline"));
const OpsDashboard = lazy(() => import("./pages/OpsDashboard"));
const LaunchReadiness = lazy(() => import("./pages/LaunchReadiness"));
const OpsFeedback = lazy(() => import("./pages/OpsFeedback"));
const OpsWeekPlan = lazy(() => import("./pages/OpsWeekPlan"));

// Circle pages
const CircleLayout = lazy(() => import("./components/circle/CircleLayout"));
const CircleFeed = lazy(() => import("./pages/circle/CircleFeed"));
const CircleMembers = lazy(() => import("./pages/circle/CircleMembers"));
const CircleLeaderboard = lazy(() => import("./pages/circle/CircleLeaderboard"));
const CircleEvents = lazy(() => import("./pages/circle/CircleEvents"));
const CircleClassroom = lazy(() => import("./pages/circle/CircleClassroom"));
const CircleAdmin = lazy(() => import("./pages/circle/CircleAdmin"));
const CirclePostDetail = lazy(() => import("./pages/circle/CirclePostDetail"));

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
                  <Route path="/earnings" element={<Income />} />
                  <Route path="/coupons" element={<Coupons />} />
                  <Route path="/products" element={<Products />} />
                  <Route path="/products/new" element={<CreateProduct />} />
                  <Route path="/store" element={<Store />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/clients" element={<Customers />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/affiliates" element={<Affiliates />} />
                  <Route path="/email-flows" element={<EmailFlows />} />
                  <Route path="/leads" element={<Leads />} />
                  <Route path="/leads/segments" element={<LeadSegments />} />
                  <Route path="/leads/email" element={<LeadEmail />} />
                  <Route path="/appointments" element={<Appointments />} />
                  <Route path="/payment-logs" element={<PaymentLogs />} />
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
                </Route>

                {/* Full-screen protected routes (no persistent layout) */}
                <Route path="/products/:id/course-builder" element={<ProtectedRoute><CourseBuilder /></ProtectedRoute>} />
                <Route path="/store/editor" element={<ProtectedRoute><StorefrontEditor /></ProtectedRoute>} />

                {/* Circle routes */}
                <Route path="/circle" element={<ProtectedRoute><CircleLayout><Navigate to="/circle/feed" replace /></CircleLayout></ProtectedRoute>} />
                <Route path="/circle/feed" element={<ProtectedRoute><CircleLayout><CircleFeed /></CircleLayout></ProtectedRoute>} />
                <Route path="/circle/spaces/:slug" element={<ProtectedRoute><CircleLayout><CircleFeed /></CircleLayout></ProtectedRoute>} />
                <Route path="/circle/members" element={<ProtectedRoute><CircleLayout><CircleMembers /></CircleLayout></ProtectedRoute>} />
                <Route path="/circle/leaderboard" element={<ProtectedRoute><CircleLayout><CircleLeaderboard /></CircleLayout></ProtectedRoute>} />
                <Route path="/circle/events" element={<ProtectedRoute><CircleLayout><CircleEvents /></CircleLayout></ProtectedRoute>} />
                <Route path="/circle/classroom" element={<ProtectedRoute><CircleLayout><CircleClassroom /></CircleLayout></ProtectedRoute>} />
                <Route path="/circle/admin" element={<ProtectedRoute><CircleLayout><CircleAdmin /></CircleLayout></ProtectedRoute>} />
                <Route path="/circle/post/:id" element={<ProtectedRoute><CircleLayout showRightSidebar={false}><CirclePostDetail /></CircleLayout></ProtectedRoute>} />

                {/* Landing page */}
                <Route path="/" element={<LandingPage />} />

                {/* Public routes */}
                <Route path="/checkout/:productSlug" element={<Checkout />} />
                <Route path="/order/success/:orderId" element={<OrderSuccess />} />
                <Route path="/upsell/:offerId" element={<Upsell />} />
                <Route path="/member/login" element={<MemberLogin />} />
                <Route path="/member" element={<MemberDashboard />} />
                <Route path="/member/course/:productId" element={<MemberCourse />} />
                <Route path="/member/billing" element={<MemberBilling />} />
                <Route path="/book/:productSlug" element={<BookAppointment />} />
                <Route path="/affiliate/apply/:workspaceSlug" element={<AffiliateApply />} />
                <Route path="/affiliate/dashboard" element={<AffiliateDashboard />} />
                <Route path="/:slug" element={<PublicStorefront />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </WorkspaceProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthProvider";
import { WorkspaceProvider } from "@/contexts/WorkspaceProvider";
import ProtectedRoute from "@/components/ProtectedRoute";
import { DashboardLayout } from "@/components/DashboardLayout";

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
      staleTime: 1000 * 60 * 2, // 2 minutes
      gcTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
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
            <Suspense fallback={<PageLoader />}>
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
                
                {/* Dashboard routes */}
                <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout><Dashboard /></DashboardLayout></ProtectedRoute>} />
                <Route path="/earnings" element={<ProtectedRoute><DashboardLayout><Income /></DashboardLayout></ProtectedRoute>} />
                <Route path="/coupons" element={<ProtectedRoute><DashboardLayout><Coupons /></DashboardLayout></ProtectedRoute>} />
                <Route path="/products" element={<ProtectedRoute><DashboardLayout><Products /></DashboardLayout></ProtectedRoute>} />
                <Route path="/products/new" element={<ProtectedRoute><DashboardLayout><CreateProduct /></DashboardLayout></ProtectedRoute>} />
                <Route path="/products/:id/course-builder" element={<ProtectedRoute><CourseBuilder /></ProtectedRoute>} />
                <Route path="/store" element={<ProtectedRoute><DashboardLayout><Store /></DashboardLayout></ProtectedRoute>} />
                <Route path="/store/editor" element={<ProtectedRoute><StorefrontEditor /></ProtectedRoute>} />
                <Route path="/analytics" element={<ProtectedRoute><DashboardLayout><Analytics /></DashboardLayout></ProtectedRoute>} />
                <Route path="/analytics/executive" element={<ProtectedRoute><DashboardLayout><AnalyticsExecutive /></DashboardLayout></ProtectedRoute>} />
                <Route path="/clients" element={<ProtectedRoute><DashboardLayout><Customers /></DashboardLayout></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><DashboardLayout><Settings /></DashboardLayout></ProtectedRoute>} />
                <Route path="/affiliates" element={<ProtectedRoute><DashboardLayout><Affiliates /></DashboardLayout></ProtectedRoute>} />
                <Route path="/email-flows" element={<ProtectedRoute><DashboardLayout><EmailFlows /></DashboardLayout></ProtectedRoute>} />
                <Route path="/leads" element={<ProtectedRoute><DashboardLayout><Leads /></DashboardLayout></ProtectedRoute>} />
                <Route path="/leads/segments" element={<ProtectedRoute><DashboardLayout><LeadSegments /></DashboardLayout></ProtectedRoute>} />
                <Route path="/leads/email" element={<ProtectedRoute><DashboardLayout><LeadEmail /></DashboardLayout></ProtectedRoute>} />
                <Route path="/appointments" element={<ProtectedRoute><DashboardLayout><Appointments /></DashboardLayout></ProtectedRoute>} />
                <Route path="/payment-logs" element={<ProtectedRoute><DashboardLayout><PaymentLogs /></DashboardLayout></ProtectedRoute>} />
                <Route path="/fiscal" element={<ProtectedRoute><DashboardLayout><FiscalClosing /></DashboardLayout></ProtectedRoute>} />
                <Route path="/email-campaigns" element={<ProtectedRoute><DashboardLayout><EmailCampaigns /></DashboardLayout></ProtectedRoute>} />

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
                
                {/* GTM Dashboard */}
                <Route path="/gtm" element={<ProtectedRoute><DashboardLayout><GtmDashboard /></DashboardLayout></ProtectedRoute>} />
                <Route path="/gtm/playbook" element={<ProtectedRoute><DashboardLayout><GtmPlaybook /></DashboardLayout></ProtectedRoute>} />
                <Route path="/acquisition" element={<ProtectedRoute><DashboardLayout><AcquisitionPipeline /></DashboardLayout></ProtectedRoute>} />
                <Route path="/ops" element={<ProtectedRoute><DashboardLayout><OpsDashboard /></DashboardLayout></ProtectedRoute>} />
                
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

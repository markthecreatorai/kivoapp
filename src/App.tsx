import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthProvider";
import { WorkspaceProvider } from "@/contexts/WorkspaceProvider";
import ProtectedRoute from "@/components/ProtectedRoute";
import { DashboardLayout } from "@/components/DashboardLayout";

// Pages
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import Income from "./pages/Income";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Products from "./pages/Products";
import CreateProduct from "./pages/CreateProduct";
import CourseBuilder from "./pages/CourseBuilder";
import StorefrontEditor from "./pages/StorefrontEditor";
import Store from "./pages/Store";
import PublicStorefront from "./pages/PublicStorefront";
import Checkout from "./pages/Checkout";
import OrderSuccess from "./pages/OrderSuccess";
import Upsell from "./pages/Upsell";
import MemberLogin from "./pages/MemberLogin";
import MemberDashboard from "./pages/MemberDashboard";
import MemberCourse from "./pages/MemberCourse";
import MemberBilling from "./pages/MemberBilling";
import Affiliates from "./pages/Affiliates";
import AffiliateApply from "./pages/AffiliateApply";
import AffiliateDashboard from "./pages/AffiliateDashboard";
import Leads from "./pages/Leads";
import LeadSegments from "./pages/LeadSegments";
import LeadEmail from "./pages/LeadEmail";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import Coupons from "./pages/Coupons";
import EmailFlows from "./pages/EmailFlows";
import Appointments from "./pages/Appointments";
import BookAppointment from "./pages/BookAppointment";
import NotFound from "./pages/NotFound";

// Circle pages
import CircleLayout from "./components/circle/CircleLayout";
import CircleDashboard from "./pages/circle/CircleDashboard";
import CircleClassroom from "./pages/circle/CircleClassroom";
import CircleFeed from "./pages/circle/CircleFeed";
// CircleSpaces removed — spaces are now inline pills in CircleFeed
import CircleMembers from "./pages/circle/CircleMembers";
import CircleLeaderboard from "./pages/circle/CircleLeaderboard";
import CircleEvents from "./pages/circle/CircleEvents";
import CircleAdmin from "./pages/circle/CircleAdmin";
import CirclePostDetail from "./pages/circle/CirclePostDetail";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <WorkspaceProvider>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/resend-verification" element={<Navigate to="/verify-email" replace />} />
              
              {/* Onboarding (protected but no workspace required) */}
              <Route 
                path="/onboarding" 
                element={
                  <ProtectedRoute requireWorkspace={false} requireEmailVerification={false}>
                    <Onboarding />
                  </ProtectedRoute>
                } 
              />
              
              
              {/* Dashboard routes (protected with workspace required) */}
              <Route 
                path="/dashboard" 
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <Dashboard />
                    </DashboardLayout>
                  </ProtectedRoute>
                } 
              />
              
              <Route 
                path="/earnings" 
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <Income />
                    </DashboardLayout>
                  </ProtectedRoute>
                } 
              />
              
              <Route 
                path="/coupons" 
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <Coupons />
                    </DashboardLayout>
                  </ProtectedRoute>
                } 
              />
              
              {/* Products routes */}
              <Route 
                path="/products" 
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <Products />
                    </DashboardLayout>
                  </ProtectedRoute>
                } 
              />
              
              <Route 
                path="/products/new" 
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <CreateProduct />
                    </DashboardLayout>
                  </ProtectedRoute>
                } 
              />
              
              <Route 
                path="/products/:id/course-builder" 
                element={
                  <ProtectedRoute>
                    <CourseBuilder />
                  </ProtectedRoute>
                } 
              />
              
              <Route 
                path="/store" 
                element={
                  <ProtectedRoute>
                     <DashboardLayout>
                      <Store />
                    </DashboardLayout>
                  </ProtectedRoute>
                } 
              />
              
              <Route 
                path="/store/editor" 
                element={
                  <ProtectedRoute>
                    <StorefrontEditor />
                  </ProtectedRoute>
                } 
              />
              
              <Route 
                path="/analytics" 
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <Analytics />
                    </DashboardLayout>
                  </ProtectedRoute>
                } 
              />
              
              <Route 
                path="/clients" 
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <Customers />
                    </DashboardLayout>
                  </ProtectedRoute>
                } 
              />
              
              
              <Route 
                path="/settings" 
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <Settings />
                    </DashboardLayout>
                  </ProtectedRoute>
                } 
              />
              
              {/* Affiliates — creator dashboard */}
              <Route 
                path="/affiliates" 
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <Affiliates />
                    </DashboardLayout>
                  </ProtectedRoute>
                } 
              />

              <Route 
                path="/email-flows" 
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <EmailFlows />
                    </DashboardLayout>
                  </ProtectedRoute>
                } 
              />

              {/* Leads & CRM */}
              <Route 
                path="/leads" 
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <Leads />
                    </DashboardLayout>
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/leads/segments" 
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <LeadSegments />
                    </DashboardLayout>
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/leads/email" 
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <LeadEmail />
                    </DashboardLayout>
                  </ProtectedRoute>
                } 
              />

              {/* Appointments */}
              <Route 
                path="/appointments" 
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <Appointments />
                    </DashboardLayout>
                  </ProtectedRoute>
                } 
              />

              {/* Circle routes */}
              <Route path="/circle" element={<ProtectedRoute><CircleLayout><Navigate to="/circle/feed" replace /></CircleLayout></ProtectedRoute>} />
              <Route path="/circle/feed" element={<ProtectedRoute><CircleLayout><CircleFeed /></CircleLayout></ProtectedRoute>} />
              <Route path="/circle/spaces/:slug" element={<ProtectedRoute><CircleLayout><CircleFeed /></CircleLayout></ProtectedRoute>} />
              <Route path="/circle/members" element={<ProtectedRoute><CircleLayout><CircleMembers /></CircleLayout></ProtectedRoute>} />
              <Route path="/circle/leaderboard" element={<ProtectedRoute><CircleLayout><CircleLeaderboard /></CircleLayout></ProtectedRoute>} />
              <Route path="/circle/events" element={<ProtectedRoute><CircleLayout><CircleEvents /></CircleLayout></ProtectedRoute>} />
              <Route path="/circle/classroom" element={<ProtectedRoute><CircleLayout><CircleDashboard /></CircleLayout></ProtectedRoute>} />
              <Route path="/circle/admin" element={<ProtectedRoute><CircleLayout><CircleAdmin /></CircleLayout></ProtectedRoute>} />
              <Route path="/circle/post/:id" element={<ProtectedRoute><CircleLayout showRightSidebar={false}><CirclePostDetail /></CircleLayout></ProtectedRoute>} />

              {/* Root redirect */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              
              {/* Checkout — public */}
              <Route path="/checkout/:productSlug" element={<Checkout />} />
              
              {/* Post-purchase — public */}
              <Route path="/order/success/:orderId" element={<OrderSuccess />} />
              <Route path="/upsell/:offerId" element={<Upsell />} />
              
              {/* Member area — public (has own auth) */}
              <Route path="/member/login" element={<MemberLogin />} />
              <Route path="/member" element={<MemberDashboard />} />
              <Route path="/member/course/:productId" element={<MemberCourse />} />
              <Route path="/member/billing" element={<MemberBilling />} />

              {/* Booking page — public */}
              <Route path="/book/:productSlug" element={<BookAppointment />} />

              {/* Affiliate — public pages */}
              <Route path="/affiliate/apply/:workspaceSlug" element={<AffiliateApply />} />
              <Route path="/affiliate/dashboard" element={<AffiliateDashboard />} />
              
              {/* Public storefront — must be before 404 */}
              <Route path="/:slug" element={<PublicStorefront />} />
              
              {/* 404 - Must be last */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </WorkspaceProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
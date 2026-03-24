import { User } from "@supabase/supabase-js";

const ADMIN_EMAILS = ["lucaslopescarrijo@gmail.com"];

export function isAdminUser(user: User | null): boolean {
  if (!user?.email) return false;
  return ADMIN_EMAILS.includes(user.email.toLowerCase());
}

export const ADMIN_ROUTES = [
  "/gtm",
  "/gtm/playbook",
  "/acquisition",
  "/analytics/executive",
  "/ops",
  "/ops/launch",
  "/ops/feedback",
  "/ops/week-plan",
  "/ops/financial-health",
  "/admin/payouts",
  "/admin/risk-review",
  "/admin/chargebacks",
  "/admin/financial-health",
  "/admin/go-live",
];

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";

export type PlanType = "FREE" | "CREATOR" | "CREATOR_PRO";

export interface PlanLimits {
  maxProducts: number | null; // null = unlimited
  maxCourses: number | null;
  maxAffiliates: number | null;
  maxEmailContacts: number | null;
  hasMemberArea: boolean;
  hasAffiliates: boolean;
  hasEmailMarketing: boolean;
}

export interface PlanUsage {
  products: number;
  courses: number;
  affiliates: number;
  emailContacts: number;
}

export interface PlanInfo {
  plan: PlanType;
  limits: PlanLimits;
  usage: PlanUsage;
  loading: boolean;
  canCreateProduct: boolean;
  canCreateCourse: boolean;
  canAddAffiliate: boolean;
  canAddEmailContact: boolean;
  getUsagePercent: (key: keyof PlanUsage) => number;
  isNearLimit: (key: keyof PlanUsage) => boolean;
  checkLimit: (action: "createProduct" | "createCourse" | "addAffiliate" | "addEmailContact") => boolean;
  refreshUsage: () => Promise<void>;
}

const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  FREE: {
    maxProducts: 1,
    maxCourses: 0,
    maxAffiliates: 0,
    maxEmailContacts: 0,
    hasMemberArea: false,
    hasAffiliates: false,
    hasEmailMarketing: false,
  },
  CREATOR: {
    maxProducts: 10,
    maxCourses: 1,
    maxAffiliates: 5,
    maxEmailContacts: 500,
    hasMemberArea: true,
    hasAffiliates: true,
    hasEmailMarketing: true,
  },
  CREATOR_PRO: {
    maxProducts: null,
    maxCourses: null,
    maxAffiliates: null,
    maxEmailContacts: null,
    hasMemberArea: true,
    hasAffiliates: true,
    hasEmailMarketing: true,
  },
};

export const PLAN_LABELS: Record<PlanType, string> = {
  FREE: "Gratuito",
  CREATOR: "Creator",
  CREATOR_PRO: "Creator Pro",
};

export const PLAN_UPGRADE_MAP: Record<PlanType, PlanType | null> = {
  FREE: "CREATOR",
  CREATOR: "CREATOR_PRO",
  CREATOR_PRO: null,
};

export function usePlanLimits(): PlanInfo {
  const { currentWorkspace } = useWorkspace();
  const [usage, setUsage] = useState<PlanUsage>({ products: 0, courses: 0, affiliates: 0, emailContacts: 0 });
  const [loading, setLoading] = useState(true);
  const [realPlan, setRealPlan] = useState<PlanType>("FREE");

  // SINGLE SOURCE OF TRUTH: workspaces.plan (always FREE | CREATOR | CREATOR_PRO).
  // It is written exclusively by the DB function sync_workspace_plan(), which reacts
  // to the subscription lifecycle (paid / past_due / canceled / expired).
  useEffect(() => {
    if (!currentWorkspace) return;
    let cancelled = false;

    const fetchPlan = async () => {
      const { data } = await supabase
        .from("workspaces")
        .select("plan")
        .eq("id", currentWorkspace.id)
        .maybeSingle();

      if (cancelled) return;
      const value = String(data?.plan || "FREE").toUpperCase() as PlanType;
      setRealPlan(PLAN_LIMITS[value] ? value : "FREE");
    };

    fetchPlan();

    // Keep the UI in sync when the webhook upgrades/downgrades the workspace
    const channel = supabase
      .channel(`workspace-plan-${currentWorkspace.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "workspaces", filter: `id=eq.${currentWorkspace.id}` },
        (payload) => {
          const value = String((payload.new as any)?.plan || "FREE").toUpperCase() as PlanType;
          setRealPlan(PLAN_LIMITS[value] ? value : "FREE");
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [currentWorkspace]);


  const plan = realPlan;
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.FREE;

  const fetchUsage = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);

    try {
      const [productsRes, coursesRes, affiliatesRes, leadsRes] = await Promise.all([
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", currentWorkspace.id)
          .is("deleted_at", null),
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", currentWorkspace.id)
          .in("type", ["COURSE"])
          .is("deleted_at", null),
        supabase
          .from("affiliates")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", currentWorkspace.id)
          .in("status", ["PENDING", "APPROVED"]),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", currentWorkspace.id)
          .is("unsubscribed_at", null),
      ]);

      setUsage({
        products: productsRes.count || 0,
        courses: coursesRes.count || 0,
        affiliates: affiliatesRes.count || 0,
        emailContacts: leadsRes.count || 0,
      });
    } catch (err) {
      console.error("Error fetching plan usage:", err);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const isWithinLimit = (current: number, max: number | null) => max === null || current < max;

  const canCreateProduct = isWithinLimit(usage.products, limits.maxProducts);
  const canCreateCourse = limits.hasMemberArea && isWithinLimit(usage.courses, limits.maxCourses);
  const canAddAffiliate = limits.hasAffiliates && isWithinLimit(usage.affiliates, limits.maxAffiliates);
  const canAddEmailContact = limits.hasEmailMarketing && isWithinLimit(usage.emailContacts, limits.maxEmailContacts);

  const getUsagePercent = (key: keyof PlanUsage): number => {
    const limitKey: Record<keyof PlanUsage, keyof PlanLimits> = {
      products: "maxProducts",
      courses: "maxCourses",
      affiliates: "maxAffiliates",
      emailContacts: "maxEmailContacts",
    };
    const max = limits[limitKey[key]];
    if (max === null || max === 0) return 0;
    return Math.min(100, Math.round((usage[key] / (max as number)) * 100));
  };

  const isNearLimit = (key: keyof PlanUsage): boolean => {
    const percent = getUsagePercent(key);
    return percent >= 80 && percent < 100;
  };

  const checkLimit = (action: "createProduct" | "createCourse" | "addAffiliate" | "addEmailContact"): boolean => {
    switch (action) {
      case "createProduct": return canCreateProduct;
      case "createCourse": return canCreateCourse;
      case "addAffiliate": return canAddAffiliate;
      case "addEmailContact": return canAddEmailContact;
    }
  };

  return {
    plan,
    limits,
    usage,
    loading,
    canCreateProduct,
    canCreateCourse,
    canAddAffiliate,
    canAddEmailContact,
    getUsagePercent,
    isNearLimit,
    checkLimit,
    refreshUsage: fetchUsage,
  };
}

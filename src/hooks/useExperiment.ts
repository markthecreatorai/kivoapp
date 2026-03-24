import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";

const CACHE_KEY = "kivo_experiments";

function getCachedVariant(key: string): string | null {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    return cache[key] || null;
  } catch {
    return null;
  }
}

function setCachedVariant(key: string, variant: string) {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    cache[key] = variant;
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

export function useExperiment(experimentKey: string): { variant: string; loading: boolean } {
  const { currentWorkspace } = useWorkspace();
  const [variant, setVariant] = useState<string>(() => getCachedVariant(experimentKey) || "A");
  const [loading, setLoading] = useState(!getCachedVariant(experimentKey));

  useEffect(() => {
    const cached = getCachedVariant(experimentKey);
    if (cached) {
      setVariant(cached);
      setLoading(false);
      return;
    }

    async function assign() {
      try {
        const workspaceId = currentWorkspace?.id;
        const sessionId = sessionStorage.getItem("kivo_session_id") || crypto.randomUUID();

        // Check existing assignment
        let query = supabase
          .from("experiment_assignments")
          .select("variant")
          .eq("experiment_key", experimentKey);

        if (workspaceId) {
          query = query.eq("workspace_id", workspaceId);
        } else {
          query = query.eq("session_id", sessionId);
        }

        const { data: existing } = await query.maybeSingle();

        if (existing) {
          setVariant(existing.variant);
          setCachedVariant(experimentKey, existing.variant);
          setLoading(false);
          return;
        }

        // Assign randomly
        const newVariant = Math.random() < 0.5 ? "A" : "B";

        await supabase.from("experiment_assignments").insert({
          experiment_key: experimentKey,
          workspace_id: workspaceId || null,
          session_id: workspaceId ? null : sessionId,
          variant: newVariant,
        });

        setVariant(newVariant);
        setCachedVariant(experimentKey, newVariant);
      } catch {
        // Default to A on error
        setVariant("A");
      } finally {
        setLoading(false);
      }
    }

    assign();
  }, [experimentKey, currentWorkspace?.id]);

  return { variant, loading };
}

/**
 * Lightweight variant getter for unauthenticated pages (landing).
 * Uses session-based assignment only.
 */
export function useSessionExperiment(experimentKey: string): { variant: string; loading: boolean } {
  const [variant, setVariant] = useState<string>(() => getCachedVariant(experimentKey) || "A");
  const [loading, setLoading] = useState(!getCachedVariant(experimentKey));

  useEffect(() => {
    const cached = getCachedVariant(experimentKey);
    if (cached) {
      setVariant(cached);
      setLoading(false);
      return;
    }

    const newVariant = Math.random() < 0.5 ? "A" : "B";
    setCachedVariant(experimentKey, newVariant);
    setVariant(newVariant);
    setLoading(false);
  }, [experimentKey]);

  return { variant, loading };
}

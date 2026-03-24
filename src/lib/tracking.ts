import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "kivo_session_id";

function getSessionId(): string {
  let sid = sessionStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

function getUtmData() {
  try {
    return JSON.parse(sessionStorage.getItem("kivo_utm") || "{}");
  } catch {
    return {};
  }
}

export async function trackEvent(
  eventName: string,
  props?: Record<string, unknown>,
  workspaceId?: string
) {
  try {
    const utm = getUtmData();
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    await fetch(
      `https://${projectId}.supabase.co/functions/v1/track-event`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          event_name: eventName,
          workspace_id: workspaceId || null,
          session_id: getSessionId(),
          event_props: props || null,
          utm_source: utm.utm_source || null,
          utm_medium: utm.utm_medium || null,
          utm_campaign: utm.utm_campaign || null,
          page_path: window.location.pathname,
        }),
      }
    );
  } catch {
    // Fire and forget
  }
}

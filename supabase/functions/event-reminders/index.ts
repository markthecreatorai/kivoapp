import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecret } from "../_shared/cron-auth.ts";
import { startCronRun, readJsonBody } from "../_shared/cron-run.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronDenied = requireCronSecret(req, "event-reminders");
  if (cronDenied) return cronDenied;

  const cronRun = await startCronRun(req, await readJsonBody(req));



  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();

    // Find events with remind_email_before set, starting within the reminder window
    // remind_email_before is in minutes (e.g. 1440 = 1 day)
    const { data: allEvents } = await supabase
      .from("community_events")
      .select("id, title, community_id, starts_at, remind_email_before, timezone")
      .eq("status", "UPCOMING")
      .not("remind_email_before", "is", null)
      .gt("starts_at", now.toISOString());

    if (!allEvents || allEvents.length === 0) {
      await cronRun.finish("SUCCESS", { reminders_sent: 0, events_checked: 0 });
      return new Response(
        JSON.stringify({ success: true, reminders_sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalReminders = 0;

    for (const event of allEvents) {
      const reminderMinutes = event.remind_email_before as number;
      const eventStart = new Date(event.starts_at);
      const reminderTime = new Date(eventStart.getTime() - reminderMinutes * 60 * 1000);

      // Check if reminder should fire now (within a 15-minute window to account for cron intervals)
      const diffMs = reminderTime.getTime() - now.getTime();
      if (diffMs > 15 * 60 * 1000 || diffMs < -15 * 60 * 1000) {
        continue; // Not yet time or already past the window
      }

      // Get GOING RSVPs
      const { data: rsvps } = await supabase
        .from("community_event_rsvps")
        .select("member_id")
        .eq("event_id", event.id)
        .eq("status", "GOING");

      if (!rsvps || rsvps.length === 0) continue;

      const memberIds = rsvps.map((r: any) => r.member_id);

      // Check if reminder already sent
      const { data: existingReminders } = await supabase
        .from("community_notifications")
        .select("recipient_id")
        .eq("event_id", event.id)
        .eq("type", "EVENT_REMINDER")
        .in("recipient_id", memberIds);

      const alreadyNotified = new Set(
        (existingReminders || []).map((n: any) => n.recipient_id)
      );

      const toNotify = memberIds.filter((id: string) => !alreadyNotified.has(id));
      if (toNotify.length === 0) continue;

      // Format reminder message based on time
      const hoursUntil = Math.round(reminderMinutes / 60);
      const timeLabel = hoursUntil >= 24
        ? `${Math.round(hoursUntil / 24)} dia(s)`
        : `${hoursUntil} hora(s)`;

      const notifications = toNotify.map((memberId: string) => ({
        community_id: event.community_id,
        recipient_id: memberId,
        type: "EVENT_REMINDER",
        event_id: event.id,
        title: `⏰ ${event.title} começa em ${timeLabel}!`,
        body: `Prepare-se! O evento está agendado para ${new Date(event.starts_at).toLocaleString("pt-BR", { timeZone: event.timezone || "America/Sao_Paulo" })}.`,
      }));

      await supabase.from("community_notifications").insert(notifications);

      // Also send email via send-email function for each member
      for (const memberId of toNotify) {
        // Get member's user email
        const { data: memberData } = await supabase
          .from("community_members")
          .select("user_id, display_name")
          .eq("id", memberId)
          .single();

        if (!memberData) continue;

        const { data: userData } = await supabase
          .from("auth.users" as any)
          .select("email")
          .eq("id", memberData.user_id)
          .single();

        // Fallback: try auth.users via admin API
        if (!userData) {
          const { data: authUser } = await supabase.auth.admin.getUserById(memberData.user_id);
          if (authUser?.user?.email) {
            try {
              await supabase.functions.invoke("send-email", {
                body: {
                  to: authUser.user.email,
                  subject: `⏰ ${event.title} começa em ${timeLabel}!`,
                  html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                      <h2>Lembrete de Evento</h2>
                      <p>Olá ${memberData.display_name || ""},</p>
                      <p>O evento <strong>${event.title}</strong> começa em <strong>${timeLabel}</strong>.</p>
                      <p>Data: ${new Date(event.starts_at).toLocaleString("pt-BR", { timeZone: event.timezone || "America/Sao_Paulo" })}</p>
                      <p>Não perca! 🎉</p>
                    </div>
                  `,
                },
              });
            } catch (emailErr) {
              console.error("Failed to send reminder email:", emailErr);
            }
          }
        }
      }

      totalReminders += notifications.length;
    }

    await cronRun.finish("SUCCESS", { reminders_sent: totalReminders, events_checked: allEvents.length });
    return new Response(
      JSON.stringify({ success: true, reminders_sent: totalReminders, events_checked: allEvents.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing event reminders:", error);
    await cronRun.finish("FAILED", {}, (error as Error).message);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecret } from "../_shared/cron-auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronDenied = requireCronSecret(req, "process-streaks");
  if (cronDenied) return cronDenied;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()).toISOString();
    const yesterdayEnd = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999).toISOString();

    // 1. Find active members who were active yesterday (maintain/increment streak)
    const { data: activeYesterday } = await supabase
      .from("community_members")
      .select("id, community_id, current_streak, longest_streak, total_points")
      .eq("status", "ACTIVE")
      .gte("last_active_at", yesterdayStart)
      .lte("last_active_at", yesterdayEnd);

    let streakBonusCount = 0;

    if (activeYesterday && activeYesterday.length > 0) {
      for (const member of activeYesterday) {
        const newStreak = (member.current_streak || 0) + 1;
        const newLongest = Math.max(newStreak, member.longest_streak || 0);

        const updates: any = {
          current_streak: newStreak,
          longest_streak: newLongest,
        };

        // Streak bonus every 7 days
        if (newStreak > 0 && newStreak % 7 === 0) {
          const streakBonus = 3;
          updates.total_points = (member.total_points || 0) + streakBonus;

          await supabase.from("community_points_log").insert({
            community_id: member.community_id,
            member_id: member.id,
            action: "STREAK_BONUS",
            points: streakBonus,
            description: `Bônus de streak: ${newStreak} dias consecutivos!`,
          });

          streakBonusCount++;
        }

        await supabase
          .from("community_members")
          .update(updates)
          .eq("id", member.id);
      }
    }

    // 2. Reset streaks for members who were NOT active yesterday
    const { data: inactiveMembers } = await supabase
      .from("community_members")
      .select("id")
      .eq("status", "ACTIVE")
      .gt("current_streak", 0)
      .lt("last_active_at", yesterdayStart);

    let resetCount = 0;
    if (inactiveMembers && inactiveMembers.length > 0) {
      const ids = inactiveMembers.map((m: any) => m.id);
      await supabase
        .from("community_members")
        .update({ current_streak: 0 })
        .in("id", ids);
      resetCount = ids.length;
    }

    await cronRun.finish("SUCCESS", {
      active_yesterday: activeYesterday?.length || 0,
      streak_bonuses: streakBonusCount,
      streaks_reset: resetCount,
    });
    return new Response(
      JSON.stringify({
        success: true,
        active_yesterday: activeYesterday?.length || 0,
        streak_bonuses: streakBonusCount,
        streaks_reset: resetCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing streaks:", error);
    await cronRun.finish("FAILED", {}, (error as Error).message);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

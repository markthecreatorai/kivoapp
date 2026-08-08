import { corsHeadersFor } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth client to get user
    const authClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role client for DB operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { product_id } = await req.json();
    if (!product_id) {
      return new Response(JSON.stringify({ error: "product_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get customer
    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, email")
      .eq("email", user.email!)
      .limit(1)
      .maybeSingle();

    if (!customer) {
      return new Response(JSON.stringify({ error: "Customer not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if certificate already exists
    const { data: existing } = await supabase
      .from("certificates")
      .select("*")
      .eq("customer_id", customer.id)
      .eq("product_id", product_id)
      .maybeSingle();

    if (existing) {
      // Return existing certificate data for PDF generation on client
      return new Response(JSON.stringify({ certificate: existing }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get product + workspace info
    const { data: product } = await supabase
      .from("products")
      .select("id, name, workspace_id")
      .eq("id", product_id)
      .maybeSingle();

    if (!product) {
      return new Response(JSON.stringify({ error: "Product not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify all lessons completed
    const { data: lessons } = await supabase
      .from("member_content")
      .select("id")
      .eq("product_id", product_id)
      .eq("type", "lesson");

    if (!lessons || lessons.length === 0) {
      return new Response(
        JSON.stringify({ error: "No lessons found" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: progress } = await supabase
      .from("lesson_progress")
      .select("member_content_id, completed")
      .eq("customer_id", customer.id)
      .in(
        "member_content_id",
        lessons.map((l) => l.id)
      );

    const completedCount =
      progress?.filter((p) => p.completed).length ?? 0;

    if (completedCount < lessons.length) {
      return new Response(
        JSON.stringify({
          error: "Not all lessons completed",
          completed: completedCount,
          total: lessons.length,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get creator name from workspace
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("name")
      .eq("id", product.workspace_id)
      .maybeSingle();

    const studentName = customer.name || customer.email;
    const creatorName = workspace?.name || "Kivo";

    // Create certificate record
    const { data: certificate, error: insertError } = await supabase
      .from("certificates")
      .insert({
        customer_id: customer.id,
        product_id: product_id,
        student_name: studentName,
        course_name: product.name,
        creator_name: creatorName,
        issued_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ certificate }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

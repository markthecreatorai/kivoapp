const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { api_key } = await req.json();

    if (!api_key || typeof api_key !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "API key is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Test connection by listing orders (limit 1) from Pagar.me API v5
    const response = await fetch("https://api.pagar.me/core/v5/orders?size=1", {
      headers: {
        Authorization: `Basic ${btoa(api_key + ":")}`,
        "Content-Type": "application/json",
      },
    });

    if (response.ok || response.status === 200) {
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const errorBody = await response.text();
    console.error("Pagar.me test failed:", response.status, errorBody);

    return new Response(
      JSON.stringify({ success: false, error: "Invalid API key or connection failed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Test error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Connection test failed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

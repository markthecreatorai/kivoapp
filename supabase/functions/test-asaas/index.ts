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
    const { api_key, environment } = await req.json();

    if (!api_key || typeof api_key !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "API key is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const base = environment === "production"
      ? "https://api.asaas.com/v3"
      : "https://sandbox.asaas.com/api/v3";

    const response = await fetch(`${base}/finance/balance`, {
      headers: {
        "access_token": api_key,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      return new Response(
        JSON.stringify({ success: true, balance: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const errorBody = await response.text();
    console.error("Asaas test failed:", response.status, errorBody);

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

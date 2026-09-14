import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "GET")
    return new Response(JSON.stringify({ error: "Only GET is allowed." }), {
      status: 405,
      headers: corsHeaders,
    });

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Service unavailable." }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  const client = createClient(projectUrl, serviceRoleKey);
  const { data, error } = await client.rpc("comelec_dashboard_root");
  if (error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: corsHeaders,
  });
});

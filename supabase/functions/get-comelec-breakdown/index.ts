import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const levels = new Set(["municipality", "barangay", "precinct"]);

function corsHeaders(request: Request) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  });
  headers.set("Access-Control-Allow-Origin", "*");
  return headers;
}

function respond(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(request),
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "GET")
    return respond(request, { error: "Only GET is allowed." }, 405);

  const url = new URL(request.url);
  const level = url.searchParams.get("level") || "";
  const province = url.searchParams.get("province") || "";
  const municipality = url.searchParams.get("municipality");
  const barangay = url.searchParams.get("barangay");
  if (!levels.has(level) || !province)
    return respond(request, { error: "Invalid breakdown request." }, 400);
  if ((level === "barangay" || level === "precinct") && !municipality)
    return respond(request, { error: "Municipality is required." }, 400);
  if (level === "precinct" && !barangay)
    return respond(request, { error: "Barangay is required." }, 400);

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !serviceRoleKey)
    return respond(request, { error: "Service unavailable." }, 500);
  const client = createClient(projectUrl, serviceRoleKey);

  const { count: importedReturns, error: importCountError } = await client
    .from("comelec_er_records")
    .select("precinct_id", { count: "exact", head: true });
  if (importCountError)
    return respond(request, { error: importCountError.message }, 500);

  const { data, error } = await client.rpc("comelec_breakdown", {
    p_level: level,
    p_province: province,
    p_municipality: municipality,
    p_barangay: barangay,
  });
  if (error) return respond(request, { error: error.message }, 500);

  return respond(request, {
    generated_at: new Date().toISOString(),
    level,
    province,
    municipality,
    barangay,
    imported_returns: importedReturns || 0,
    ...data,
  });
});

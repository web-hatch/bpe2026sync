const SUPABASE_BASE_URL = "https://xgurpnhsxmmfsrcnzxiw.supabase.co";
const LIVE_SNAPSHOT_URL = `${SUPABASE_BASE_URL}/functions/v1/get-comelec-snapshot`;

export async function loadDashboardSnapshot() {
  const response = await fetch(LIVE_SNAPSHOT_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load the live COMELEC results snapshot.");
  return { snapshot: await response.json(), source: "supabase" };
}

export async function loadLiveBreakdown(params) {
  const url = new URL(`${SUPABASE_BASE_URL}/functions/v1/get-comelec-breakdown`);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load the live COMELEC breakdown.");
  return await response.json();
}

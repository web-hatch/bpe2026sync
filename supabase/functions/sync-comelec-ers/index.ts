import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const COMELEC_BASE_URL = "https://barmmpelectionresults.comelec.gov.ph";
const BUCKET = "comelec-er-json";
const RETRY_DELAY_MINUTES = 5;
const RECHECK_MINUTES = 15;
const PUBLISH_INTERVAL_MINUTES = 5;

const provinceLabels: Record<string, string> = {
  "0700000": "Basilan",
  "3600000": "Lanao del Sur",
  "7000000": "Tawi-Tawi",
  "8700000": "Maguindanao del Norte",
  "8800000": "Maguindanao del Sur",
  "9900000": "Special Geographic Area",
};

const sourceHeaders = {
  Accept: "application/json, text/plain, */*",
  Origin: COMELEC_BASE_URL,
  Referer: `${COMELEC_BASE_URL}/er-result`,
  "User-Agent": "Mozilla/5.0 (compatible; BARMM-ER-Sync/1.0)",
};

type DiscoveryTask = {
  id: number;
  task_key: string;
  task_type: "province" | "municipality" | "barangay";
  province_code: string;
  locality_code: string | null;
  attempts: number;
};

type ErQueueItem = {
  precinct_id: string;
  province_code: string;
  attempts: number;
};

type OfficialEr = {
  information?: {
    location?: string;
    numberOfActuallyVoters?: number | string;
    numberOfRegisteredVoters?: number | string;
  };
  local?: Array<{
    contestName?: string;
    candidates?: {
      candidates?: Array<{ name?: string; votes?: number | string }>;
    };
  }>;
};

type ErEntry = {
  precinct_id: string;
  category_key: "party_list" | "sectoral" | "district";
  contest_name: string;
  candidate_name: string;
  ballot_order: number;
  votes: number;
};

const json = (body: unknown, status = 200) => Response.json(body, { status });

function toError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function getJson(path: string) {
  const response = await fetch(`${COMELEC_BASE_URL}${path}`, {
    headers: sourceHeaders,
  });
  if (!response.ok)
    throw new Error(`COMELEC request failed (${response.status}) for ${path}`);
  return await response.json();
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function retryAt(attempts: number) {
  return new Date(
    Date.now() +
      Math.min(60, RETRY_DELAY_MINUTES * Math.max(1, attempts)) * 60_000,
  ).toISOString();
}

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function categoryForContest(
  contestName: string,
): ErEntry["category_key"] | null {
  if (contestName === "BARMM REGIONAL PARLIAMENTARY POLITICAL PARTY")
    return "party_list";
  if (contestName.startsWith("PARLIAMENTARY SECTORAL REPRESENTATIVE"))
    return "sectoral";
  if (contestName.startsWith("LEGISLATIVE DISTRICT REPRESENTATIVE"))
    return "district";
  return null;
}

function parseOfficialEr(payload: OfficialEr, item: ErQueueItem) {
  const location = String(payload.information?.location || "");
  const locationParts = location.split(",").map((part) => part.trim());
  const entries: ErEntry[] = [];

  for (const contest of payload.local || []) {
    const contestName = String(contest.contestName || "").trim();
    const category = categoryForContest(contestName);
    if (!category) continue;

    for (const candidate of contest.candidates?.candidates || []) {
      const rawName = String(candidate.name || "").trim();
      if (!rawName) continue;
      const ballotMatch = rawName.match(/^(\d+)\.\s*/);
      entries.push({
        precinct_id: item.precinct_id,
        category_key: category,
        contest_name: contestName,
        candidate_name: rawName.replace(/^\d+\.\s*/, "").trim(),
        ballot_order: ballotMatch ? Number(ballotMatch[1]) : 9999,
        votes: toNumber(candidate.votes),
      });
    }
  }

  return {
    entries,
    province: provinceLabels[item.province_code] || "Unknown Province",
    municipality: locationParts[2] || "Unknown Municipality",
    barangay: locationParts[3] || "Unknown Barangay",
    castVotes: toNumber(payload.information?.numberOfActuallyVoters),
    registeredVoters: toNumber(payload.information?.numberOfRegisteredVoters),
  };
}

async function finishDiscovery(
  client: ReturnType<typeof createClient>,
  task: DiscoveryTask,
  error?: unknown,
) {
  const failed = Boolean(error);
  const patch = failed
    ? {
        status: task.attempts >= 4 ? "failed" : "pending",
        last_error: toError(error),
        next_attempt_at: retryAt(task.attempts),
        locked_at: null,
      }
    : {
        status: "done",
        completed_at: new Date().toISOString(),
        last_error: null,
        locked_at: null,
      };
  const { error: updateError } = await client
    .from("comelec_discovery_tasks")
    .update(patch)
    .eq("id", task.id);
  if (updateError) throw updateError;
}

async function processDiscoveryTask(
  client: ReturnType<typeof createClient>,
  task: DiscoveryTask,
) {
  try {
    if (task.task_type === "province") {
      const data = await getJson(
        `/data/regions/local/${task.province_code}.json`,
      );
      const rows = (data.regions || []).map((region: { code: string }) => ({
        task_key: `municipality:${task.province_code}:${region.code}`,
        task_type: "municipality",
        province_code: task.province_code,
        locality_code: String(region.code),
      }));
      if (rows.length) {
        const { error } = await client
          .from("comelec_discovery_tasks")
          .upsert(rows, { onConflict: "task_key", ignoreDuplicates: true });
        if (error) throw error;
      }
    } else if (task.task_type === "municipality") {
      const data = await getJson(
        `/data/regions/local/${task.locality_code}.json`,
      );
      const rows = (data.regions || []).map((region: { code: string }) => ({
        task_key: `barangay:${task.province_code}:${region.code}`,
        task_type: "barangay",
        province_code: task.province_code,
        locality_code: String(region.code),
      }));
      if (rows.length) {
        const { error } = await client
          .from("comelec_discovery_tasks")
          .upsert(rows, { onConflict: "task_key", ignoreDuplicates: true });
        if (error) throw error;
      }
    } else {
      const data = await getJson(
        `/data/regions/precinct/${task.province_code.slice(0, 2)}/${task.locality_code}.json`,
      );
      const rows = (data.regions || []).map((region: { code: string }) => ({
        precinct_id: String(region.code),
        province_code: task.province_code,
      }));
      if (rows.length) {
        const { error } = await client
          .from("comelec_er_queue")
          .upsert(rows, { onConflict: "precinct_id", ignoreDuplicates: true });
        if (error) throw error;
      }
    }
    await finishDiscovery(client, task);
    return { ok: true };
  } catch (error) {
    await finishDiscovery(client, task, error);
    return { ok: false, error: toError(error) };
  }
}

async function processEr(
  client: ReturnType<typeof createClient>,
  item: ErQueueItem,
) {
  const url = `${COMELEC_BASE_URL}/data/er/${item.precinct_id.slice(0, 3)}/${item.precinct_id}.json`;
  try {
    const response = await fetch(url, { headers: sourceHeaders });
    if (!response.ok)
      throw new Error(`COMELEC ER request failed (${response.status})`);
    const payload = await response.text();
    const officialEr = JSON.parse(payload) as OfficialEr;
    const parsedEr = parseOfficialEr(officialEr, item);
    const contentHash = await sha256(payload);
    const storagePath = `er/${item.precinct_id.slice(0, 3)}/${item.precinct_id}.json`;

    const { data: existing, error: existingError } = await client
      .from("comelec_er_queue")
      .select("content_hash")
      .eq("precinct_id", item.precinct_id)
      .single();
    if (existingError) throw existingError;

    if (existing?.content_hash !== contentHash) {
      const { error: uploadError } = await client.storage
        .from(BUCKET)
        .upload(storagePath, payload, {
          contentType: "application/json",
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { error: recordError } = await client
        .from("comelec_er_records")
        .upsert({
          precinct_id: item.precinct_id,
          content_hash: contentHash,
          source_url: url,
          storage_path: storagePath,
          payload_bytes: new TextEncoder().encode(payload).byteLength,
          province: parsedEr.province,
          municipality: parsedEr.municipality,
          barangay: parsedEr.barangay,
          cast_votes: parsedEr.castVotes,
          registered_voters: parsedEr.registeredVoters,
          fetched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      if (recordError) throw recordError;

      const { error: deleteError } = await client
        .from("comelec_er_entries")
        .delete()
        .eq("precinct_id", item.precinct_id);
      if (deleteError) throw deleteError;

      if (parsedEr.entries.length) {
        const { error: entriesError } = await client
          .from("comelec_er_entries")
          .insert(parsedEr.entries);
        if (entriesError) throw entriesError;
      }
    }

    const { error: queueError } = await client
      .from("comelec_er_queue")
      .update({
        status: "ready",
        content_hash: contentHash,
        storage_path: storagePath,
        last_checked_at: new Date().toISOString(),
        last_downloaded_at:
          existing?.content_hash === contentHash
            ? undefined
            : new Date().toISOString(),
        next_check_at: new Date(
          Date.now() + RECHECK_MINUTES * 60_000,
        ).toISOString(),
        last_error: null,
        locked_at: null,
      })
      .eq("precinct_id", item.precinct_id);
    if (queueError) throw queueError;
    return { changed: existing?.content_hash !== contentHash };
  } catch (error) {
    const { error: queueError } = await client
      .from("comelec_er_queue")
      .update({
        status: item.attempts >= 4 ? "failed" : "pending",
        last_error: toError(error),
        next_check_at: retryAt(item.attempts),
        locked_at: null,
      })
      .eq("precinct_id", item.precinct_id);
    if (queueError) throw queueError;
    return { error: toError(error) };
  }
}

async function publishDashboardIfDue(
  client: ReturnType<typeof createClient>,
  changedCount: number,
) {
  if (!changedCount) return false;

  const { data: state, error: stateError } = await client
    .from("comelec_publication_state")
    .select("last_attempted_at")
    .eq("id", true)
    .single();
  if (stateError) throw stateError;

  const lastAttempted = state?.last_attempted_at
    ? new Date(state.last_attempted_at).getTime()
    : 0;
  if (Date.now() - lastAttempted < PUBLISH_INTERVAL_MINUTES * 60_000)
    return false;

  const { error: attemptError } = await client
    .from("comelec_publication_state")
    .update({
      last_attempted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (attemptError) throw attemptError;

  const { data: snapshot, error: snapshotError } = await client.rpc(
    "comelec_dashboard_root",
  );
  if (snapshotError) throw snapshotError;
  if (!snapshot?.complete) return false;

  const { error: uploadError } = await client.storage
    .from("comelec-dashboard-public")
    .upload("dashboard-snapshot.json", JSON.stringify(snapshot), {
      contentType: "application/json",
      cacheControl: "60",
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { error: updateError } = await client
    .from("comelec_publication_state")
    .update({
      last_published_at: new Date().toISOString(),
      last_attempted_at: new Date().toISOString(),
      published_returns: snapshot.processed_files,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (updateError) throw updateError;
  return true;
}

Deno.serve(async (request) => {
  const syncSecret = Deno.env.get("COMELEC_SYNC_SECRET");
  if (
    !syncSecret ||
    request.headers.get("x-comelec-sync-secret") !== syncSecret
  ) {
    return json({ error: "Unauthorized" }, 401);
  }

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !serviceRoleKey)
    return json(
      { error: "Supabase service credentials are unavailable." },
      500,
    );
  const client = createClient(projectUrl, serviceRoleKey);

  const body =
    request.method === "POST" ? await request.json().catch(() => ({})) : {};
  const discoveryLimit = Math.min(
    Math.max(Number(body.discovery_limit) || 8, 1),
    20,
  );
  const erLimit = Math.min(Math.max(Number(body.er_limit) || 25, 1), 50);

  if (body.enable_schedule === true) {
    const { error } = await client.rpc("configure_comelec_er_sync_schedule", {
      p_sync_secret: syncSecret,
    });
    if (error) return json({ error: error.message }, 500);
  }

  await client.rpc("requeue_comelec_discovery_if_due");
  await client.rpc("requeue_failed_comelec_ers_if_due");
  const { data: discoveryTasks, error: discoveryError } = await client.rpc(
    "claim_comelec_discovery_tasks",
    { p_limit: discoveryLimit },
  );
  if (discoveryError) return json({ error: discoveryError.message }, 500);
  const discoveryResults = await Promise.all(
    (discoveryTasks || []).map((task: DiscoveryTask) =>
      processDiscoveryTask(client, task),
    ),
  );

  const { data: erItems, error: erError } = await client.rpc(
    "claim_comelec_er_batch",
    { p_limit: erLimit },
  );
  if (erError) return json({ error: erError.message }, 500);
  const erResults = await Promise.all(
    (erItems || []).map((item: ErQueueItem) => processEr(client, item)),
  );
  const changedCount = erResults.filter((result) => result.changed).length;
  const published = await publishDashboardIfDue(client, changedCount);

  return json({
    discovery: {
      processed: discoveryResults.length,
      failed: discoveryResults.filter((result) => !result.ok).length,
    },
    er: {
      processed: erResults.length,
      changed: changedCount,
      failed: erResults.filter((result) => result.error).length,
    },
    published,
    schedule_enabled: body.enable_schedule === true,
  });
});

import { createClient } from "@supabase/supabase-js";
import {
  fetchQiPriceHistoryFromRpc,
  type QiHistoryRange,
} from "../src/services/qiHistoryServer.js";

interface SimpleRequest {
  method?: string;
  query?: Record<string, string | string[]>;
}

interface SimpleResponse {
  status: (code: number) => SimpleResponse;
  setHeader: (name: string, value: string) => void;
  send: (body: string) => void;
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.warn(
    "Supabase environment variables are not set. /api/qi-history will fail until SUPABASE_URL and SUPABASE_SERVICE_ROLE are configured."
  );
}

function createSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    return null;
  }

  try {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { persistSession: false },
    });
  } catch (error) {
    console.error("Failed to instantiate Supabase client:", error);
    return null;
  }
}

const VALID_RANGES: QiHistoryRange[] = ["1h", "24h", "7d", "30d", "6m"];

function normalizeRange(value: string | null): QiHistoryRange {
  if (value && VALID_RANGES.includes(value as QiHistoryRange)) {
    return value as QiHistoryRange;
  }
  return "24h";
}

function freshnessWindow(range: QiHistoryRange) {
  switch (range) {
    case "1h":
      return 5 * 60 * 1000; // 5 minutes
    case "24h":
      return 10 * 60 * 1000; // 10 minutes
    case "7d":
      return 30 * 60 * 1000; // 30 minutes
    case "30d":
      return 60 * 60 * 1000; // 1 hour
    case "6m":
      return 6 * 60 * 60 * 1000; // 6 hours
    default:
      return 15 * 60 * 1000;
  }
}

function respond(res: SimpleResponse, status: number, payload: unknown) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.send(JSON.stringify(payload));
}

export default async function handler(req: SimpleRequest, res: SimpleResponse) {
  try {
  const query = req?.query ?? {};
  const supabase = createSupabaseClient();

  if (req?.method !== "GET") {
    res.setHeader("Allow", "GET");
    return respond(res, 405, { error: "Method not allowed" });
  }

  const rangeParam =
    typeof query.range === "string"
      ? query.range
      : Array.isArray(query.range)
        ? query.range[0] ?? null
        : null;
  const range = normalizeRange(rangeParam);

  if (!supabase) {
    return respond(res, 500, { error: "Supabase is not configured on the server." });
  }

  const { data: cached, error: cachedError } = await supabase
    .from("qi_price_history")
    .select("timestamp_ms, price, block_number_hex")
    .eq("range", range)
    .order("timestamp_ms", { ascending: true });

  if (cachedError) {
    console.error("Supabase read error:", cachedError);
  }

  const now = Date.now();
  const latestCached = cached && cached.length > 0 ? Number(cached[cached.length - 1].timestamp_ms) : 0;
  const isFresh = cached && cached.length > 0 && now - latestCached < freshnessWindow(range);

  if (isFresh) {
    return respond(res, 200, { data: cached, source: "cache" });
  }

  try {
    const history = await fetchQiPriceHistoryFromRpc(range);

    if (history.length > 0) {
      const upsertPayload = history.map(point => ({
        range,
        timestamp_ms: point.timestamp,
        price: point.price,
        block_number_hex: point.blockNumberHex,
        fetched_at: new Date().toISOString(),
      }));

      const { error: upsertError } = await supabase
        .from("qi_price_history")
        .upsert(upsertPayload, { onConflict: "range,timestamp_ms" });

      if (upsertError) {
        console.error("Supabase upsert error:", upsertError);
      }

      return respond(res, 200, { data: upsertPayload, source: "rpc" });
    }

    if (cached && cached.length > 0) {
      return respond(res, 200, { data: cached, source: "cache", stale: true });
    }

    return respond(res, 503, { error: "Unable to retrieve QI price history." });
  } catch (error) {
    console.error("Failed to refresh QI history:", error);
    if (cached && cached.length > 0) {
      return respond(res, 200, { data: cached, source: "cache", stale: true });
    }
    return respond(res, 502, { error: "RPC request failed and no cached data is available." });
  }
  } catch (error) {
    console.error("Unhandled error in qi-history handler:", error);
    return respond(res, 500, { error: "Internal server error" });
  }
}

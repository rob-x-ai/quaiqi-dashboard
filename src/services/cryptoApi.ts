import { toast } from "sonner";
import { hexlify } from "ethers";

interface QuaiResponse {
  jsonrpc: string;
  id: number;
  result: string;
}

interface CoinGeckoResponse {
  'quai-network': {
    usd: number;
  };
}

interface ConversionResult {
  amountOut: string;
  effectiveRate: string;
  slippage: string;
}

interface ConversionOptions {
  direction: 'quaiToQi' | 'qiToQuai';
  slippage?: number;
}

interface FlowData {
  quaiToQiVolume: number;
  qiToQuaiVolume: number;
  timestamp: number;
}

// Last known values to use as fallbacks
let lastQiToQuaiRate: string | null = null;
let lastQuaiToQiRate: string | null = null;
let lastQuaiUsdPrice: number | null = null;
let lastQiUsdPrice: number | null = null;
let lastUpdatedTimestamp: number = Date.now();

// Separate price history for QI and QUAI
let qiPriceHistory: Array<{ timestamp: number; price: number }> = [];
let quaiPriceHistory: Array<{ timestamp: number; price: number }> = [];

// Maintain a small buffer of raw QI/USD samples to smooth spikes
let qiRawBuffer: number[] = [];
const MAX_RAW_BUFFER = 5;

// --- Persistence helpers (localStorage) ---
const isBrowser = typeof window !== 'undefined' && !!window.localStorage;
const STORAGE_KEYS = {
  qi: 'quaiqi:qiPriceHistory',
  quai: 'quaiqi:quaiPriceHistory',
  lastQiUsd: 'quaiqi:lastQiUsdPrice',
  lastQuaiUsd: 'quaiqi:lastQuaiUsdPrice',
  lastUpdated: 'quaiqi:lastUpdatedTs',
  version: 'quaiqi:storageVersion',
} as const;

const STORAGE_VERSION = '2';

// Keep at most this much history by timestamp (30 days)
const MAX_HISTORY_AGE_MS = 30 * 24 * 60 * 60 * 1000;
// Only persist a new point if at least this much time passed since last saved (1 minute)
const MIN_SAMPLE_INTERVAL_MS = 60 * 1000;

function loadArrayFromStorage(key: string): Array<{ timestamp: number; price: number }> {
  if (!isBrowser) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{ timestamp: number; price: number }>;
    const now = Date.now();
    // Filter out anything older than MAX_HISTORY_AGE_MS or malformed
    const filtered = (Array.isArray(parsed) ? parsed : []).filter(p => {
      return (
        p && typeof p.timestamp === 'number' && typeof p.price === 'number' &&
        now - p.timestamp <= MAX_HISTORY_AGE_MS && p.timestamp <= now
      );
    });
    return filtered;
  } catch {
    return [];
  }
}

function saveArrayToStorage(key: string, arr: Array<{ timestamp: number; price: number }>) {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(arr));
  } catch {
    // Ignore storage errors (quota, etc.)
  }
}

function maybePersistLastValues() {
  if (!isBrowser) return;
  try {
    // Only persist QI after we have at least 2 raw samples to avoid storing a bad first tick
    if (typeof lastQiUsdPrice === 'number' && qiRawBuffer.length >= 2) {
      window.localStorage.setItem(STORAGE_KEYS.lastQiUsd, String(lastQiUsdPrice));
    }
    if (typeof lastQuaiUsdPrice === 'number') {
      window.localStorage.setItem(STORAGE_KEYS.lastQuaiUsd, String(lastQuaiUsdPrice));
    }
    window.localStorage.setItem(STORAGE_KEYS.lastUpdated, String(lastUpdatedTimestamp));
    window.localStorage.setItem(STORAGE_KEYS.version, STORAGE_VERSION);
  } catch {
    // ignore
  }
}

function addHistoryPoint(
  kind: 'qi' | 'quai',
  point: { timestamp: number; price: number }
) {
  const now = Date.now();
  const arr = kind === 'qi' ? qiPriceHistory : quaiPriceHistory;

  // Keep only last MAX_HISTORY_AGE_MS window
  const minTs = now - MAX_HISTORY_AGE_MS;
  const trimmed = arr.filter(p => p.timestamp >= minTs);

  // Only sample if last point was older than MIN_SAMPLE_INTERVAL_MS or price changed significantly
  const last = trimmed[trimmed.length - 1];
  const shouldAppend = !last || (
    (point.timestamp - last.timestamp) >= MIN_SAMPLE_INTERVAL_MS ||
    Math.abs(point.price - last.price) / (last.price || 1) >= 0.01 // 1% change forces a sample
  );

  const updated = shouldAppend ? [...trimmed, point] : trimmed;

  if (kind === 'qi') {
    qiPriceHistory = updated;
    saveArrayToStorage(STORAGE_KEYS.qi, qiPriceHistory);
  } else {
    quaiPriceHistory = updated;
    saveArrayToStorage(STORAGE_KEYS.quai, quaiPriceHistory);
  }
}

// Initialize from localStorage on module load (browser only)
if (isBrowser) {
  // Simple versioned init: if structure changes, clear stale keys once
  try {
    const ver = window.localStorage.getItem(STORAGE_KEYS.version);
    if (ver !== STORAGE_VERSION) {
      window.localStorage.removeItem(STORAGE_KEYS.qi);
      window.localStorage.removeItem(STORAGE_KEYS.quai);
      window.localStorage.removeItem(STORAGE_KEYS.lastQiUsd);
      window.localStorage.removeItem(STORAGE_KEYS.lastQuaiUsd);
      window.localStorage.removeItem(STORAGE_KEYS.lastUpdated);
      window.localStorage.setItem(STORAGE_KEYS.version, STORAGE_VERSION);
    }
  } catch {}

  qiPriceHistory = loadArrayFromStorage(STORAGE_KEYS.qi);
  quaiPriceHistory = loadArrayFromStorage(STORAGE_KEYS.quai);
  try {
    const lastQi = window.localStorage.getItem(STORAGE_KEYS.lastQiUsd);
    const lastQuai = window.localStorage.getItem(STORAGE_KEYS.lastQuaiUsd);
    const lastTs = window.localStorage.getItem(STORAGE_KEYS.lastUpdated);
    lastQiUsdPrice = lastQi !== null ? Number(lastQi) : lastQiUsdPrice;
    lastQuaiUsdPrice = lastQuai !== null ? Number(lastQuai) : lastQuaiUsdPrice;
    lastUpdatedTimestamp = lastTs !== null ? Number(lastTs) : lastUpdatedTimestamp;
  } catch {
    // ignore
  }
}

// Conversion flow tracking
let flowHistory: FlowData[] = [];

// Record conversion flows for slippage calculation
export function recordConversionFlow(direction: 'quaiToQi' | 'qiToQuai', amount: number) {
  const now = Date.now();

  flowHistory.push({
    quaiToQiVolume: direction === 'quaiToQi' ? amount : 0,
    qiToQuaiVolume: direction === 'qiToQuai' ? amount : 0,
    timestamp: now
  });

  // Keep only last 24 hours of data
  flowHistory = flowHistory.filter(f => now - f.timestamp < 86400000);
}

// Get flow data for graphs
export function getFlowHistory() {
  return flowHistory;
}

export async function fetchConversionAmountAfterSlip(amount: string, direction: string): Promise<string> {
  try {

    const quaiAddress = "0x0000000000000000000000000000000000000000"
    const qiAddress = "0x0090000000000000000000000000000000000000"

    var from;
    var to;
    if (direction === "quaiToQi") {
      from = quaiAddress
      to = qiAddress
    } else {
      from = qiAddress
      to = quaiAddress
    }

    var txArgs = {
      from: from,
      to: to,
      value: amount,
    }

    const response = await fetch("https://rpc.quai.network/cyprus1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "quai_calculateConversionAmount",
        params: [txArgs],
      }),
    });

    if (!response.ok) {
      console.log("response was not okay")
      throw new Error("Network response was not ok");
    }

    const data: QuaiResponse = await response.json();
    return data.result;
  } catch (error) {
    console.error("Error fetching QI to QUAI rate:", error);
    return lastQiToQuaiRate || "0";
  }
}

export async function fetchQiToQuai(amount = "0x3E8"): Promise<string> {
  try {
    const response = await fetch("https://rpc.quai.network/cyprus1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "quai_qiToQuai",
        params: [amount, "latest"],
      }),
    });

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const data: QuaiResponse = await response.json();
    lastQiToQuaiRate = data.result;
    lastUpdatedTimestamp = Date.now();
    return data.result;
  } catch (error) {
    console.error("Error fetching QI to QUAI rate:", error);
    return lastQiToQuaiRate || "0";
  }
}

export async function fetchQuaiToQi(amount = "0xDE0B6B3A7640000"): Promise<string> {
  try {
    const response = await fetch("https://rpc.quai.network/cyprus1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: 2,
        jsonrpc: "2.0",
        method: "quai_quaiToQi",
        params: [amount, "latest"],
      }),
    });

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const data: QuaiResponse = await response.json();
    lastQuaiToQiRate = data.result;
    lastUpdatedTimestamp = Date.now();
    return data.result;
  } catch (error) {
    console.error("Error fetching QUAI to QI rate:", error);
    return lastQuaiToQiRate || "0";
  }
}

export async function fetchQuaiUsdPrice(): Promise<number> {
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=quai-network&vs_currencies=usd"
    );

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const data: CoinGeckoResponse = await response.json();
    lastQuaiUsdPrice = data["quai-network"].usd;
    lastUpdatedTimestamp = Date.now();

    // Add to QUAI history and persist
    addHistoryPoint('quai', { timestamp: lastUpdatedTimestamp, price: lastQuaiUsdPrice });
    maybePersistLastValues();

    return lastQuaiUsdPrice;
  } catch (error) {
    console.error("Error fetching QUAI USD price:", error);
    return lastQuaiUsdPrice || 0.068177;
  }
}

export async function calculateQiUsdPrice(
  qiToQuaiRate: string,
  quaiUsdPrice: number
): Promise<number> {
  try {
    const hadLastBefore = typeof lastQiUsdPrice === 'number' && lastQiUsdPrice > 0;

    // Parse QI->QUAI rate
    const rateHex = (qiToQuaiRate || '').toString();
    const rateNum = Number.parseInt(rateHex, 16);
    const qiToQuaiDecimal = Number.isFinite(rateNum) ? rateNum / 1e18 : NaN;

    // Parse QUAI->QI rate (from last known state)
    const q2qHex = (lastQuaiToQiRate || '').toString();
    const q2qNum = Number.parseInt(q2qHex, 16);
    const quaiToQiDecimal = Number.isFinite(q2qNum) ? q2qNum / 1e18 : NaN;

    // Basic sanity on inputs
    const quaiOk = Number.isFinite(quaiUsdPrice) && quaiUsdPrice > 0;
    const rateOkA = Number.isFinite(qiToQuaiDecimal) && qiToQuaiDecimal > 0 && qiToQuaiDecimal < 1e12;
    const rateOkB = Number.isFinite(quaiToQiDecimal) && quaiToQiDecimal > 0 && quaiToQiDecimal < 1e12;

    if (quaiOk && (rateOkA || rateOkB)) {
      // Compute candidates from both directions when available
      const candFromA = rateOkA ? quaiUsdPrice * qiToQuaiDecimal : NaN;
      const candFromB = rateOkB ? (quaiUsdPrice / quaiToQiDecimal) : NaN;

      let raw: number | null = null;
      if (Number.isFinite(candFromA) && Number.isFinite(candFromB)) {
        const minv = Math.min(candFromA as number, candFromB as number);
        const maxv = Math.max(candFromA as number, candFromB as number);
        // If disagreement > 50%, pick conservative (lower) to avoid overshoot
        if (maxv / minv > 1.5) {
          raw = minv;
        } else {
          raw = (candFromA as number + candFromB as number) / 2;
        }
      } else if (Number.isFinite(candFromA)) {
        raw = candFromA as number;
      } else if (Number.isFinite(candFromB)) {
        raw = candFromB as number;
      }

      if (!raw || !(raw > 0)) {
        // fall back to last good if raw is unusable
        if (hadLastBefore) return lastQiUsdPrice as number;
        return quaiUsdPrice || 0;
      }

      // Push to raw buffer
      qiRawBuffer.push(raw);
      if (qiRawBuffer.length > MAX_RAW_BUFFER) qiRawBuffer = qiRawBuffer.slice(-MAX_RAW_BUFFER);

      // Robust estimator: median of buffer (no hard clamp, to prevent getting stuck)
      const median = (vals: number[]) => {
        const a = [...vals].sort((a, b) => a - b);
        const mid = Math.floor(a.length / 2);
        return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
      };
      let candidate = median(qiRawBuffer);

      lastQiUsdPrice = candidate;

      // Add to QI history and persist.
      // Avoid adding unstable initial samples; wait for at least 2 raw points.
      if (hadLastBefore || qiRawBuffer.length >= 2) {
        addHistoryPoint('qi', { timestamp: Date.now(), price: candidate });
      }
      maybePersistLastValues();

      return candidate;
    }

    // Fallbacks: prefer last good price; otherwise try reconstructing from last known pieces
    if (typeof lastQiUsdPrice === 'number' && lastQiUsdPrice > 0) {
      return lastQiUsdPrice;
    }
    if (lastQuaiUsdPrice && lastQiToQuaiRate) {
      const lr = Number.parseInt(lastQiToQuaiRate, 16);
      if (Number.isFinite(lr) && lr > 0) {
        return lastQuaiUsdPrice * (lr / 1e18);
      }
    }
    // Final hard fallback: return QUAI price (rough lower bound) to avoid spikes
    return quaiUsdPrice || 0;
  } catch (error) {
    console.error("Error calculating QI USD price:", error);
    return lastQiUsdPrice || (lastQuaiUsdPrice && lastQiToQuaiRate
      ? lastQuaiUsdPrice * (Number.parseInt(lastQiToQuaiRate, 16) / 1e18)
      : (quaiUsdPrice || 0));
  }
}

export async function calculateConversionAmount(
  tokenIn: string,
  amountIn: bigint,
): Promise<ConversionResult> {
  try {
    const direction = tokenIn.toUpperCase() === "QUAI" ? 'quaiToQi' : 'qiToQuai';

    // convert the bigint amount to hex value for all the apis
    var amountInHex = '0x' + amountIn.toString(16);

    var amountWithoutSlip;
    if (direction === "quaiToQi") {
      amountWithoutSlip = await fetchQuaiToQi(amountInHex);
    } else {
      amountWithoutSlip = await fetchQiToQuai(amountInHex);
    }

    // Calculate dynamic slippage
    const amountLeftAfterSlip = await fetchConversionAmountAfterSlip(amountInHex, direction);

    function computeSlipPercent(
      amountWithoutSlipHex: string,
      amountLeftAfterSlipHex: string
    ): number {
      // 1) parse your hex strings into BigNumber
      const withoutSlip = BigInt(amountWithoutSlipHex);
      const leftAfter = BigInt(amountLeftAfterSlipHex);
      
      // 2) diff = withoutSlip - leftAfter
      const diff = withoutSlip - leftAfter;

      // 3) compute basis points = diff * 10000 / withoutSlip
      //    (basis points = percent * 100)
      const slipBp = diff * BigInt(10_000) / (withoutSlip);

      // 4) convert basis points back into a JS number with two decimals:
      return parseFloat(slipBp.toString()) / parseFloat(BigInt(100).toString());  // e.g. 1234 bp → 12.34%
    }

    // example usage:
    const slip = computeSlipPercent(
      amountWithoutSlip,    // e.g. "0x2386f26fc10000"  ( = 0.01×1e18 )
      amountLeftAfterSlip   // e.g. "0x2308c5d4a10000"
    );


    var amountLeft;
    if (direction === "quaiToQi") {
      // convert the hex number into quai or qi uints by removing 18 decimals for quai and 3 for qi
      amountLeft = parseInt(amountLeftAfterSlip, 16) / 10 ** 3;
    } else {
      amountLeft = parseInt(amountLeftAfterSlip, 16) / 10 ** 18;
    }
      

    return {
      amountOut: amountLeft,
      effectiveRate: "0",
      slippage: `${slip.toString()}%`
    };
  } catch (error) {
    console.error("Error calculating conversion amount:", error);
    toast.error("Failed to calculate conversion. Please try again.");
    return {
      amountOut: "0",
      effectiveRate: "0",
      slippage: "0%"
    };
  }
}

export function getPriceHistory() {
  // Do not synthesize bootstrap points; require at least 2 real samples
  if (qiPriceHistory.length < 2) return [];
  return qiPriceHistory;
}

export function getQuaiPriceHistory() {
  return quaiPriceHistory;
}

export function getLastUpdatedTime(): number {
  return lastUpdatedTimestamp;
}

// Expose whether QI price has at least two raw samples (for UI gating)
export function isQiPriceStable(): boolean {
  return qiRawBuffer.length >= 2 && typeof lastQiUsdPrice === 'number' && lastQiUsdPrice > 0;
}

// Expose last persisted QI price (may come from localStorage on load)
export function getLastQiUsdPrice(): number | null {
  return typeof lastQiUsdPrice === 'number' && lastQiUsdPrice > 0 ? lastQiUsdPrice : null;
}

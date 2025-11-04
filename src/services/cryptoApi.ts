import { toast } from "sonner";

interface QuaiResponse {
  jsonrpc: string;
  id: number;
  result: string;
}

interface PriceProviderResponse {
  coins?: Record<string, { price?: number }>;
  'quai-network'?: {
    usd?: number;
  };
}

const LLAMA_PRICE_URL = "https://coins.llama.fi/prices/current/coingecko:quai-network";

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

interface QuaiBlockResponse {
  jsonrpc: string;
  id: number;
  result: {
    woHeader?: {
      number?: string;
      timestamp?: string;
    };
  } | null;
}

interface BlockInfo {
  number: bigint;
  timestampMs: number;
}

const QUAI_RPC_URL = "https://rpc.quai.network/cyprus1";

const blockCache = new Map<string, BlockInfo>();

export function normalizeBlockParam(
  block: bigint | number | string | Array<string | number | bigint | null | undefined> | null | undefined
): string {
  if (block === null || block === undefined) {
    return "latest";
  }
  if (Array.isArray(block)) {
    const candidate = block.find(value => value !== null && value !== undefined);
    return normalizeBlockParam(candidate ?? "latest");
  }
  if (typeof block === "string") {
    if (block.trim().length === 0) {
      return "latest";
    }
    const lowered = block.toLowerCase();
    if (["latest", "earliest", "pending", "safe", "finalized"].includes(lowered)) {
      return lowered;
    }
    if (lowered.length >= 2 && lowered[0] === "0" && lowered[1] === "x") {
      const trimmed = lowered.replace(/^0x0*/, "");
      return trimmed.length ? `0x${trimmed}` : "0x0";
    }
    try {
      const asBigInt = BigInt(block);
      if (asBigInt < 0n) throw new Error();
      return `0x${asBigInt.toString(16)}`;
    } catch {
      throw new Error(`Invalid block identifier: ${block}`);
    }
  }

  const asBigInt = typeof block === "number" ? BigInt(Math.max(0, block)) : block;
  if (asBigInt < 0n) {
    throw new Error("Block number cannot be negative");
  }
  return `0x${asBigInt.toString(16)}`;
}

export async function fetchBlockInfo(block: bigint | number | string = "latest"): Promise<BlockInfo | null> {
  const param = normalizeBlockParam(block);
  const cacheKey =
    typeof param === "string" && param.length >= 2 && param[0] === "0" && param[1] === "x"
      ? param
      : null;

  if (cacheKey && blockCache.has(cacheKey)) {
    return blockCache.get(cacheKey)!;
  }

  const response = await fetch(QUAI_RPC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: 99,
      jsonrpc: "2.0",
      method: "quai_getBlockByNumber",
      params: [param, false],
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch block metadata");
  }

  const data: QuaiBlockResponse = await response.json();
  const blockResult = data.result?.woHeader;

  if (!blockResult?.timestamp || !blockResult?.number) {
    return null;
  }

  const number = BigInt(blockResult.number);
  const timestampMs = Number.parseInt(blockResult.timestamp, 16) * 1000;

  const info: BlockInfo = { number, timestampMs };
  const numberKey = normalizeBlockParam(blockResult.number);

  if (
    typeof numberKey === "string" &&
    numberKey.length >= 2 &&
    numberKey[0] === "0" &&
    numberKey[1] === "x"
  ) {
    blockCache.set(numberKey, info);
  }
  blockCache.set(number.toString(), info);

  return info;
}

export async function getBlockTimestamp(block: bigint | number | string = "latest"): Promise<number | null> {
  const info = await fetchBlockInfo(block);
  return info ? info.timestampMs : null;
}

async function resolveBlockNumber(block: bigint | number | string | null | undefined): Promise<bigint> {
  if (block === null || block === undefined) {
    const latest = await fetchBlockInfo("latest");
    if (!latest) throw new Error("Unable to resolve latest block number");
    return latest.number;
  }
  if (typeof block === "bigint") {
    if (block < 0n) throw new Error("Block number cannot be negative");
    return block;
  }
  if (typeof block === "number") {
    if (!Number.isFinite(block)) throw new Error(`Invalid block identifier: ${block}`);
    if (block < 0) throw new Error("Block number cannot be negative");
    return BigInt(Math.floor(block));
  }
  const trimmed = block.trim();
  const lowered = trimmed.toLowerCase();
  if (["latest", "pending", "safe", "finalized", "earliest"].includes(lowered)) {
    const info = await fetchBlockInfo(lowered);
    if (!info) {
      throw new Error(`Failed to resolve block reference: ${block}`);
    }
    return info.number;
  }
  try {
    const value = lowered.length >= 2 && lowered[0] === "0" && lowered[1] === "x"
      ? BigInt(lowered)
      : BigInt(lowered);
    if (value < 0n) throw new Error();
    return value;
  } catch {
    throw new Error(`Invalid block identifier: ${block}`);
  }
}

function toStepBigInt(step?: bigint | number | string): bigint {
  if (step === undefined) return 1n;
  if (typeof step === "bigint") {
    return step === 0n ? 1n : (step > 0n ? step : -step);
  }
  if (typeof step === "number") {
    if (!Number.isFinite(step)) return 1n;
    const value = BigInt(Math.floor(Math.abs(step)));
    return value === 0n ? 1n : value;
  }
  const trimmed = step.trim().toLowerCase();
  try {
    const value = trimmed.length >= 2 && trimmed[0] === "0" && trimmed[1] === "x"
      ? BigInt(trimmed)
      : BigInt(trimmed);
    if (value === 0n) return 1n;
    return value > 0n ? value : -value;
  } catch {
    return 1n;
  }
}

export function formatBlockHex(num: bigint): string {
  return `0x${num.toString(16)}`;
}

function formatHexAmount(hexValue: string, decimals: number): string {
  try {
    const raw = BigInt(hexValue);
    if (decimals <= 0) {
      return raw.toString();
    }

    const base = BigInt(10) ** BigInt(decimals);
    const integerPart = raw / base;
    const fractionPart = raw % base;

    if (fractionPart === 0n) {
      return integerPart.toString();
    }

    const fraction = fractionPart
      .toString()
      .padStart(decimals, "0")
      .replace(/0+$/, "");

    return fraction.length
      ? `${integerPart.toString()}.${fraction}`
      : integerPart.toString();
  } catch {
    return "0";
  }
}

export interface QiToQuaiSnapshot {
  blockNumber: string;
  blockNumberHex: string;
  timestamp: number;
  isoTimestamp: string;
  rate: string;
}

export interface QiToQuaiSnapshotsOptions {
  startBlock: bigint | number | string;
  endBlock: bigint | number | string;
  blockInterval?: bigint | number | string;
  amount?: string;
  maxSamples?: number;
  concurrency?: number;
}

export async function fetchQiToQuaiSnapshots(options: QiToQuaiSnapshotsOptions): Promise<QiToQuaiSnapshot[]> {
  const {
    startBlock,
    endBlock,
    blockInterval,
    amount = "0x3E8",
    maxSamples = 1000,
    concurrency = 8,
  } = options;

  if (maxSamples <= 0) {
    throw new Error("maxSamples must be greater than zero");
  }

  const start = await resolveBlockNumber(startBlock);
  const end = await resolveBlockNumber(endBlock);
  const step = toStepBigInt(blockInterval);
  const forward = start <= end;

  const blockTargets: bigint[] = [];
  let iterations = 0;

  for (
    let current = start;
    forward ? current <= end : current >= end;
    current = forward ? current + step : current - step
  ) {
    if (iterations++ >= maxSamples) {
      break;
    }
    blockTargets.push(current);
  }

  const snapshots: QiToQuaiSnapshot[] = [];
  const chunkSize = Math.max(1, Math.floor(concurrency));

  for (let i = 0; i < blockTargets.length; i += chunkSize) {
    const chunk = blockTargets.slice(i, i + chunkSize);
    const batch = await Promise.all(
      chunk.map(async (blockNumber) => {
        const blockInfo = await fetchBlockInfo(blockNumber);
        if (!blockInfo) return null;
        const rate = await fetchQiToQuai(amount, blockInfo.number);
        const timestamp = blockInfo.timestampMs;
        return {
          blockNumber: blockInfo.number.toString(),
          blockNumberHex: formatBlockHex(blockInfo.number),
          timestamp,
          isoTimestamp: new Date(timestamp).toISOString(),
          rate,
        } as QiToQuaiSnapshot;
      })
    );
    for (const snapshot of batch) {
      if (snapshot) snapshots.push(snapshot);
    }
  }

  if (!forward) {
    snapshots.reverse();
  }

  return snapshots;
}

// Last known values to use as fallbacks
let lastQiToQuaiRate: string | null = null;
let lastQuaiToQiRate: string | null = null;
let lastQuaiUsdPrice: number | null = null;
let lastQiUsdPrice: number | null = null;
let lastUpdatedTimestamp: number = Date.now();

// Maintain a small buffer of raw QI/USD samples to smooth spikes
let qiRawBuffer: number[] = [];
const MAX_RAW_BUFFER = 5;

// Keep at most this much history by timestamp (30 days) for in-memory smoothing
const MAX_HISTORY_AGE_MS = 30 * 24 * 60 * 60 * 1000;
// Only record a new point if at least this much time passed since the last saved (1 minute)
const MIN_SAMPLE_INTERVAL_MS = 60 * 1000;

type PriceHistoryPoint = { timestamp: number; price: number };

let qiPriceHistory: PriceHistoryPoint[] = [];
let quaiPriceHistory: PriceHistoryPoint[] = [];

function maybePersistLastValues() {
  // Persistence disabled per requirements; we keep runtime values only.
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
  } else {
    quaiPriceHistory = updated;
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

    const [from, to] = direction === "quaiToQi"
      ? [quaiAddress, qiAddress]
      : [qiAddress, quaiAddress];

    const txArgs = {
      from,
      to,
      value: amount,
    }

    const response = await fetch(QUAI_RPC_URL, {
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

export async function fetchQiToQuai(
  amount = "0x3E8",
  block: bigint | number | string = "latest"
): Promise<string> {
  try {
    const blockParam = normalizeBlockParam(block);
    const response = await fetch(QUAI_RPC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "quai_qiToQuai",
        params: [amount, blockParam],
      }),
    });

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const data: QuaiResponse = await response.json();
    if (blockParam === "latest" || blockParam === "pending") {
      lastQiToQuaiRate = data.result;
      lastUpdatedTimestamp = Date.now();
    }
    return data.result;
  } catch (error) {
    console.error("Error fetching QI to QUAI rate:", error);
    return lastQiToQuaiRate || "0";
  }
}

export async function fetchQuaiToQi(
  amount = "0xDE0B6B3A7640000",
  block: bigint | number | string = "latest"
): Promise<string> {
  try {
    const blockParam = normalizeBlockParam(block);
    const response = await fetch(QUAI_RPC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: 2,
        jsonrpc: "2.0",
        method: "quai_quaiToQi",
        params: [amount, blockParam],
      }),
    });

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const data: QuaiResponse = await response.json();
    if (blockParam === "latest" || blockParam === "pending") {
      lastQuaiToQiRate = data.result;
      lastUpdatedTimestamp = Date.now();
    }
    return data.result;
  } catch (error) {
    console.error("Error fetching QUAI to QI rate:", error);
    return lastQuaiToQiRate || "0";
  }
}

export async function fetchQuaiUsdPrice(): Promise<number> {
  try {
    const response = await fetch(LLAMA_PRICE_URL, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const data: PriceProviderResponse = await response.json();

    const priceFromCoins = data.coins?.["coingecko:quai-network"]?.price;
    const priceFromLegacy = data["quai-network"]?.usd;
    const price = typeof priceFromCoins === "number" && priceFromCoins > 0
      ? priceFromCoins
      : (typeof priceFromLegacy === "number" && priceFromLegacy > 0 ? priceFromLegacy : NaN);

    if (!Number.isFinite(price) || price <= 0) {
      throw new Error("Price provider returned no price");
    }

    lastQuaiUsdPrice = price;
    lastUpdatedTimestamp = Date.now();

    // Add to QUAI history and persist
    addHistoryPoint('quai', { timestamp: lastUpdatedTimestamp, price: lastQuaiUsdPrice });
    maybePersistLastValues();

    return lastQuaiUsdPrice;
  } catch (error) {
    console.error("Error fetching QUAI USD price:", error);
    if (!lastQuaiUsdPrice) {
      // Fallback to CoinGecko once if we haven't cached anything yet
      try {
        const response = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=quai-network&vs_currencies=usd",
          {
            method: "GET",
            headers: {
              "Accept": "application/json",
            },
            cache: "no-store",
          }
        );
        if (response.ok) {
          const data: PriceProviderResponse = await response.json();
          const price = data["quai-network"]?.usd;
          if (typeof price === "number" && price > 0) {
            lastQuaiUsdPrice = price;
            lastUpdatedTimestamp = Date.now();
            addHistoryPoint('quai', { timestamp: lastUpdatedTimestamp, price });
            maybePersistLastValues();
            return price;
          }
        }
      } catch (fallbackError) {
        console.error("CoinGecko fallback failed:", fallbackError);
      }
    }
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
      const candidate = median(qiRawBuffer);

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
    const amountInHex = `0x${amountIn.toString(16)}`;

    const amountWithoutSlip = direction === "quaiToQi"
      ? await fetchQuaiToQi(amountInHex)
      : await fetchQiToQuai(amountInHex);

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

    const formattedAmountOut = formatHexAmount(amountLeftAfterSlip, direction === "quaiToQi" ? 3 : 18);


    return {
      amountOut: formattedAmountOut,
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

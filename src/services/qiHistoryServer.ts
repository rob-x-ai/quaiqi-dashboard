import {
  fetchBlockInfo,
  fetchQiToQuaiSnapshots,
  fetchQuaiUsdPrice,
} from "./cryptoApi.js";

// Configuration constants
const QI_HISTORY_RANGE_CONFIG = {
  "1h": { durationMs: 60 * 60 * 1000, samples: 240 },
  "24h": { durationMs: 24 * 60 * 60 * 1000, samples: 288 },
  "7d": { durationMs: 7 * 24 * 60 * 60 * 1000, samples: 336 },
  "30d": { durationMs: 30 * 24 * 60 * 60 * 1000, samples: 180 },
  "6m": { durationMs: 182 * 24 * 60 * 60 * 1000, samples: 186 },
} as const;

// Minimal bucketing - only aggregate when necessary
const RANGE_BUCKET_MS: Record<QiHistoryRange, number> = {
  "1h": 15_000,       // 15 seconds
  "24h": 90_000,      // 1.5 minutes
  "7d": 600_000,      // 10 minutes
  "30d": 3_600_000,   // 1 hour
  "6m": 14_400_000,   // 4 hours
};

// Only remove extreme outliers (likely bad data)
const OUTLIER_THRESHOLD: Record<QiHistoryRange, number> = {
  "1h": 0.20,   // 20% instant jump
  "24h": 0.25,  // 25%
  "7d": 0.35,   // 35%
  "30d": 0.50,  // 50%
  "6m": 0.70,   // 70% - only obvious errors
};

const CONCURRENCY_LIMIT: Record<QiHistoryRange, number> = {
  "1h": 32,
  "24h": 28,
  "7d": 20,
  "30d": 16,
  "6m": 12,
};

export type QiHistoryRange = keyof typeof QI_HISTORY_RANGE_CONFIG;

export interface QiPriceHistoryPoint {
  timestamp: number;
  price: number;
  blockNumberHex: string;
}

interface BlockInfo {
  number: bigint;
  timestampMs: number;
}

/**
 * Binary search to find the block at or before a target timestamp
 */
async function findBlockAtOrBeforeTimestamp(
  targetMs: number
): Promise<BlockInfo | null> {
  const latest = await fetchBlockInfo("latest");
  if (!latest) return null;

  if (targetMs >= latest.timestampMs) {
    return latest;
  }

  let highInfo = latest;
  let lowInfo: BlockInfo | null = null;
  let step = 1n;

  while (highInfo.number > 0n) {
    const candidateNumber = highInfo.number > step ? highInfo.number - step : 0n;
    const candidateInfo = await fetchBlockInfo(candidateNumber);
    
    if (!candidateInfo) break;

    if (candidateInfo.timestampMs <= targetMs || candidateNumber === 0n) {
      lowInfo = candidateInfo;
      break;
    }

    highInfo = candidateInfo;
    step *= 2n;
  }

  if (!lowInfo) return highInfo;

  let lowNum = lowInfo.number;
  let highNum = highInfo.number;

  while (highNum - lowNum > 1n) {
    const midNum = lowNum + (highNum - lowNum) / 2n;
    const midInfo = await fetchBlockInfo(midNum);
    
    if (!midInfo) {
      highNum = midNum;
      continue;
    }

    if (midInfo.timestampMs <= targetMs) {
      lowInfo = midInfo;
      lowNum = midNum;
    } else {
      highInfo = midInfo;
      highNum = midNum;
    }
  }

  return highInfo.timestampMs <= targetMs ? highInfo : lowInfo;
}

/**
 * Main function to fetch and process Qi price history
 */
export async function fetchQiPriceHistoryFromRpc(
  range: QiHistoryRange
): Promise<QiPriceHistoryPoint[]> {
  const config = QI_HISTORY_RANGE_CONFIG[range];
  const latestInfo = await fetchBlockInfo("latest");
  if (!latestInfo) return [];

  const targetStart = Math.max(0, latestInfo.timestampMs - config.durationMs);
  const startInfo = await findBlockAtOrBeforeTimestamp(targetStart);
  if (!startInfo) return [];

  const samples = Math.max(2, Math.min(config.samples, 500));
  const totalBlocks = latestInfo.number > startInfo.number 
    ? latestInfo.number - startInfo.number 
    : 0n;
  
  const rawInterval = samples > 1 ? totalBlocks / BigInt(samples - 1) : 0n;
  const blockInterval = rawInterval < 1n ? 1n : rawInterval;

  // Fetch snapshots
  const snapshots = await fetchQiToQuaiSnapshots({
    startBlock: startInfo.number,
    endBlock: latestInfo.number,
    blockInterval,
    maxSamples: samples + 5,
    concurrency: CONCURRENCY_LIMIT[range],
  });

  if (!snapshots.length) return [];

  // Convert to price points
  const quaiUsdPrice = await fetchQuaiUsdPrice();
  let points = convertSnapshotsToPricePoints(snapshots, quaiUsdPrice);
  
  if (points.length === 0) return [];

  // Minimal processing pipeline
  points = bucketPoints(points, RANGE_BUCKET_MS[range]);
  
  // Only remove obvious bad data
  if (points.length >= 3) {
    points = removeExtremeOutliers(range, points);
  }

  return points;
}

/**
 * Convert raw snapshots to price points with validation
 */
type SnapshotPoint = {
  timestamp: number;
  rate: string;
  blockNumberHex: string;
};

function convertSnapshotsToPricePoints(
  snapshots: SnapshotPoint[],
  quaiUsdPrice: number
): QiPriceHistoryPoint[] {
  const seen = new Set<number>();
  const points: QiPriceHistoryPoint[] = [];

  for (const snapshot of snapshots) {
    if (seen.has(snapshot.timestamp)) continue;
    seen.add(snapshot.timestamp);

    const rateNum = Number.parseInt(snapshot.rate, 16);
    if (!Number.isFinite(rateNum) || rateNum <= 0) continue;

    const rateDecimal = rateNum / 1e18;
    if (rateDecimal <= 0) continue;

    points.push({
      timestamp: snapshot.timestamp,
      price: rateDecimal * quaiUsdPrice,
      blockNumberHex: snapshot.blockNumberHex,
    });
  }

  return points.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Bucket points - use median to avoid outlier influence
 */
function bucketPoints(
  points: QiPriceHistoryPoint[],
  bucketSize: number
): QiPriceHistoryPoint[] {
  if (points.length === 0) return [];

  const bucketed: QiPriceHistoryPoint[] = [];
  let currentBucket: {
    key: number;
    prices: number[];
    timestamps: number[];
    blocks: string[];
  } | null = null;

  const flushBucket = () => {
    if (!currentBucket || currentBucket.prices.length === 0) return;
    
    // Use median price and median timestamp for stability
    const sortedPrices = currentBucket.prices.slice().sort((a, b) => a - b);
    const sortedTimes = currentBucket.timestamps.slice().sort((a, b) => a - b);
    const midIdx = Math.floor(sortedPrices.length / 2);
    
    const medianPrice = sortedPrices.length % 2 === 0
      ? (sortedPrices[midIdx - 1] + sortedPrices[midIdx]) / 2
      : sortedPrices[midIdx];
    
    const medianTime = sortedTimes.length % 2 === 0
      ? (sortedTimes[midIdx - 1] + sortedTimes[midIdx]) / 2
      : sortedTimes[midIdx];
    
    bucketed.push({
      timestamp: Math.round(medianTime),
      price: medianPrice,
      blockNumberHex: currentBucket.blocks[currentBucket.blocks.length - 1],
    });
    currentBucket = null;
  };

  for (const point of points) {
    const bucketKey = Math.floor(point.timestamp / bucketSize) * bucketSize;
    
    if (!currentBucket || bucketKey !== currentBucket.key) {
      flushBucket();
      currentBucket = {
        key: bucketKey,
        prices: [point.price],
        timestamps: [point.timestamp],
        blocks: [point.blockNumberHex],
      };
    } else {
      currentBucket.prices.push(point.price);
      currentBucket.timestamps.push(point.timestamp);
      currentBucket.blocks.push(point.blockNumberHex);
    }
  }
  
  flushBucket();
  return bucketed;
}

/**
 * Remove only extreme outliers - obvious bad data
 */
function removeExtremeOutliers(
  range: QiHistoryRange,
  points: QiPriceHistoryPoint[]
): QiPriceHistoryPoint[] {
  if (points.length < 3) return points;

  const threshold = OUTLIER_THRESHOLD[range];
  const result: QiPriceHistoryPoint[] = [];

  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    
    // Get surrounding points for context
    const prevIdx = Math.max(0, i - 1);
    const nextIdx = Math.min(points.length - 1, i + 1);
    const prev = points[prevIdx];
    const next = points[nextIdx];

    // Calculate expected range based on neighbors
    const neighborAvg = (prev.price + next.price) / 2;
    const neighborMax = Math.max(prev.price, next.price);
    const neighborMin = Math.min(prev.price, next.price);
    const neighborSpread = neighborMax - neighborMin;
    
    // Calculate how much current point deviates
    const deviation = Math.abs(current.price - neighborAvg);
    const relativeDeviation = deviation / Math.max(1e-9, neighborAvg);

    // Only remove if:
    // 1. Deviation is extreme (above threshold)
    // 2. Neighbors are relatively stable (spread is small)
    const isStableNeighborhood = neighborSpread / Math.max(1e-9, neighborAvg) < threshold / 2;
    const isExtremeDeviation = relativeDeviation > threshold;

    if (isExtremeDeviation && isStableNeighborhood && i !== 0 && i !== points.length - 1) {
      // Replace with neighbor average
      result.push({
        ...current,
        price: neighborAvg,
      });
    } else {
      result.push(current);
    }
  }

  return result;
}

/**
 * Very light smoothing for 1h only - just remove jitter
 */
function lightSmooth(points: QiPriceHistoryPoint[]): QiPriceHistoryPoint[] {
  if (points.length < 5) return points;

  const smoothed: QiPriceHistoryPoint[] = [];
  const windowSize = 3; // Very small window

  for (let i = 0; i < points.length; i++) {
    if (i === 0 || i === points.length - 1) {
      // Keep first and last points unchanged
      smoothed.push(points[i]);
      continue;
    }

    // Simple 3-point weighted average
    const weights = [0.25, 0.50, 0.25]; // Center-weighted
    const start = Math.max(0, i - 1);
    const end = Math.min(points.length, i + 2);
    
    let sum = 0;
    let weightSum = 0;
    
    for (let j = start; j < end; j++) {
      const weight = weights[j - start];
      sum += points[j].price * weight;
      weightSum += weight;
    }

    const smoothedPrice = weightSum > 0 ? sum / weightSum : points[i].price;

    smoothed.push({
      timestamp: points[i].timestamp,
      price: smoothedPrice,
      blockNumberHex: points[i].blockNumberHex,
    });
  }

  return smoothed;
}

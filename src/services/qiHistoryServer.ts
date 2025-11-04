import {
  fetchBlockInfo,
  fetchQiToQuaiSnapshots,
  fetchQuaiUsdPrice,
} from "./cryptoApi.js";

const QI_HISTORY_RANGE_CONFIG = {
  "1h": { durationMs: 60 * 60 * 1000, samples: 60 },
  "24h": { durationMs: 24 * 60 * 60 * 1000, samples: 96 },
  "7d": { durationMs: 7 * 24 * 60 * 60 * 1000, samples: 168 },
  "30d": { durationMs: 30 * 24 * 60 * 60 * 1000, samples: 180 },
  "6m": { durationMs: 182 * 24 * 60 * 60 * 1000, samples: 186 },
} as const;

const RANGE_BUCKET_MS: Record<QiHistoryRange, number> = {
  "1h": 60 * 1000, // 1 minute
  "24h": 10 * 60 * 1000, // 10 minutes
  "7d": 60 * 60 * 1000, // 1 hour
  "30d": 6 * 60 * 60 * 1000, // 6 hours
  "6m": 24 * 60 * 60 * 1000, // 1 day
};

const RANGE_SMOOTHING_WINDOW: Partial<Record<QiHistoryRange, number>> = {
  "1h": 3,
  "24h": 5,
};

export type QiHistoryRange = keyof typeof QI_HISTORY_RANGE_CONFIG;

export interface QiPriceHistoryPoint {
  timestamp: number;
  price: number;
  blockNumberHex: string;
}

async function findBlockAtOrBeforeTimestamp(targetMs: number) {
  const latest = await fetchBlockInfo("latest");
  if (!latest) return null;

  if (targetMs >= latest.timestampMs) {
    return latest;
  }

  let highInfo = latest;
  let lowInfo: Awaited<ReturnType<typeof fetchBlockInfo>> = null;
  let step = 1n;

  while (true) {
    if (highInfo.number === 0n) {
      lowInfo = highInfo;
      break;
    }

    const candidateNumber = highInfo.number > step ? highInfo.number - step : 0n;
    const candidateInfo = await fetchBlockInfo(candidateNumber);
    if (!candidateInfo) {
      break;
    }

    if (candidateInfo.timestampMs <= targetMs || candidateNumber === 0n) {
      lowInfo = candidateInfo;
      break;
    }

    highInfo = candidateInfo;
    step *= 2n;
  }

  if (!lowInfo) {
    return highInfo;
  }

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

  if (highInfo.timestampMs <= targetMs) {
    return highInfo;
  }

  return lowInfo;
}

function normalizeSamples(required: number) {
  return Math.max(2, Math.min(required, 500));
}

export async function fetchQiPriceHistoryFromRpc(range: QiHistoryRange): Promise<QiPriceHistoryPoint[]> {
  const config = QI_HISTORY_RANGE_CONFIG[range];
  const latestInfo = await fetchBlockInfo("latest");
  if (!latestInfo) return [];

  const targetStart = Math.max(0, latestInfo.timestampMs - config.durationMs);
  const startInfo = await findBlockAtOrBeforeTimestamp(targetStart);
  if (!startInfo) return [];

  const samples = normalizeSamples(config.samples);
  const totalBlocks = latestInfo.number > startInfo.number ? latestInfo.number - startInfo.number : 0n;
  const rawInterval = samples > 1 ? totalBlocks / BigInt(samples - 1) : 0n;
  const blockInterval = rawInterval < 1n ? 1n : rawInterval;

  const snapshots = await fetchQiToQuaiSnapshots({
    startBlock: startInfo.number,
    endBlock: latestInfo.number,
    blockInterval,
    maxSamples: samples + 5,
  });

  if (!snapshots.length) {
    return [];
  }

  const quaiUsdPrice = await fetchQuaiUsdPrice();
  const seen = new Set<number>();
  const points: QiPriceHistoryPoint[] = [];

  for (const snapshot of snapshots) {
    if (seen.has(snapshot.timestamp)) continue;
    seen.add(snapshot.timestamp);

    const rateNum = Number.parseInt(snapshot.rate, 16);
    if (!Number.isFinite(rateNum)) continue;
    const rateDecimal = rateNum / 1e18;
    if (!(rateDecimal > 0)) continue;

    points.push({
      timestamp: snapshot.timestamp,
      price: rateDecimal * quaiUsdPrice,
      blockNumberHex: snapshot.blockNumberHex,
    });
  }

  points.sort((a, b) => a.timestamp - b.timestamp);

  const bucketSize = RANGE_BUCKET_MS[range];
  const bucketed: QiPriceHistoryPoint[] = [];
  let currentBucket: { key: number; sum: number; count: number; lastTimestamp: number; lastBlock: string } | null = null;

  const flushBucket = () => {
    if (!currentBucket || currentBucket.count === 0) return;
    bucketed.push({
      timestamp: currentBucket.lastTimestamp,
      price: currentBucket.sum / currentBucket.count,
      blockNumberHex: currentBucket.lastBlock,
    });
    currentBucket = null;
  };

  for (const point of points) {
    const bucketKey = Math.floor(point.timestamp / bucketSize) * bucketSize;
    if (!currentBucket || bucketKey !== currentBucket.key) {
      flushBucket();
      currentBucket = {
        key: bucketKey,
        sum: point.price,
        count: 1,
        lastTimestamp: point.timestamp,
        lastBlock: point.blockNumberHex,
      };
    } else {
      currentBucket.sum += point.price;
      currentBucket.count += 1;
      currentBucket.lastTimestamp = point.timestamp;
      currentBucket.lastBlock = point.blockNumberHex;
    }
  }
  flushBucket();

  let workingPoints = smoothPoints(range, bucketed);

  if (workingPoints.length > samples) {
    const stride = Math.ceil(workingPoints.length / samples);
    const reduced: QiPriceHistoryPoint[] = [];
    for (let i = 0; i < workingPoints.length; i += stride) {
      reduced.push(workingPoints[i]);
    }
    const lastPoint = workingPoints[workingPoints.length - 1];
    if (!reduced.length || reduced[reduced.length - 1].timestamp !== lastPoint.timestamp) {
      reduced.push(lastPoint);
    }
    workingPoints = reduced;
  }

  return workingPoints;
}
function smoothPoints(range: QiHistoryRange, points: QiPriceHistoryPoint[]): QiPriceHistoryPoint[] {
  const windowSize = RANGE_SMOOTHING_WINDOW[range];
  if (!windowSize || windowSize <= 1 || points.length <= windowSize) {
    return points;
  }

  const halfWindow = Math.floor(windowSize / 2);
  const smoothed: QiPriceHistoryPoint[] = [];

  for (let i = 0; i < points.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - halfWindow; j <= i + halfWindow; j++) {
      if (j < 0 || j >= points.length) continue;
      sum += points[j].price;
      count += 1;
    }
    smoothed.push({
      timestamp: points[i].timestamp,
      price: sum / Math.max(1, count),
      blockNumberHex: points[i].blockNumberHex,
    });
  }

  return smoothed;
}

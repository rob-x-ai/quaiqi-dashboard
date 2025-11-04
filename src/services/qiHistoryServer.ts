import {
  fetchBlockInfo,
  fetchQiToQuaiSnapshots,
  fetchQuaiUsdPrice,
} from "./cryptoApi.js";

const QI_HISTORY_RANGE_CONFIG = {
  "1h": { durationMs: 60 * 60 * 1000, samples: 240 },
  "24h": { durationMs: 24 * 60 * 60 * 1000, samples: 288 },
  "7d": { durationMs: 7 * 24 * 60 * 60 * 1000, samples: 336 },
  "30d": { durationMs: 30 * 24 * 60 * 60 * 1000, samples: 180 },
  "6m": { durationMs: 182 * 24 * 60 * 60 * 1000, samples: 186 },
} as const;

const RANGE_BUCKET_MS: Record<QiHistoryRange, number> = {
  "1h": 30 * 1000, // 30 seconds
  "24h": 60 * 1000, // 1 minute
  "7d": 10 * 60 * 1000, // 10 minutes
  "30d": 6 * 60 * 60 * 1000, // 6 hours
  "6m": 24 * 60 * 60 * 1000, // 1 day
};

const RANGE_SMOOTHING_WINDOW: Partial<Record<QiHistoryRange, number>> = {
  "1h": 5,
  "24h": 9,
  "7d": 17,
  "30d": 9,
};

const RANGE_SMOOTHING_ALPHA: Partial<Record<QiHistoryRange, number>> = {
  "1h": 0.35,
  "24h": 0.2,
  "7d": 0.14,
  "30d": 0.12,
};

const RANGE_DENSIFY_SEGMENTS: Partial<Record<QiHistoryRange, number>> = {
  "1h": 4,
  "24h": 8,
  "7d": 6,
  "30d": 2,
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
    concurrency:
      range === "1h" ? 32 :
      range === "24h" ? 28 :
      range === "7d" ? 20 :
      range === "30d" ? 16 :
      12,
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

  const densifyFactor = RANGE_DENSIFY_SEGMENTS[range] ?? 1;
  workingPoints = densifyPoints(range, workingPoints);

  const maxSamples = samples * densifyFactor;
  if (workingPoints.length > maxSamples) {
    const stride = Math.ceil(workingPoints.length / maxSamples);
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
  const movingAveraged: QiPriceHistoryPoint[] = [];

  for (let i = 0; i < points.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - halfWindow; j <= i + halfWindow; j++) {
      if (j < 0 || j >= points.length) continue;
      sum += points[j].price;
      count += 1;
    }
    movingAveraged.push({
      timestamp: points[i].timestamp,
      price: sum / Math.max(1, count),
      blockNumberHex: points[i].blockNumberHex,
    });
  }

  const alpha = RANGE_SMOOTHING_ALPHA[range];
  if (!alpha || alpha <= 0 || alpha >= 1) {
    return movingAveraged;
  }

  const exponentiallySmoothed: QiPriceHistoryPoint[] = [];
  let prev = movingAveraged[0].price;

  for (const point of movingAveraged) {
    const smoothedPrice = alpha * point.price + (1 - alpha) * prev;
    exponentiallySmoothed.push({
      timestamp: point.timestamp,
      price: smoothedPrice,
      blockNumberHex: point.blockNumberHex,
    });
    prev = smoothedPrice;
  }

  return exponentiallySmoothed;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return (min + max) / 2;
  }
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function catmullRom(y0: number, y1: number, y2: number, y3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * y1) +
    (-y0 + y2) * t +
    (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 +
    (-y0 + 3 * y1 - 3 * y2 + y3) * t3
  );
}

function densifyPoints(range: QiHistoryRange, points: QiPriceHistoryPoint[]): QiPriceHistoryPoint[] {
  const segments = RANGE_DENSIFY_SEGMENTS[range];
  if (!segments || segments <= 1 || points.length < 2) {
    return points;
  }

  const result: QiPriceHistoryPoint[] = [];
  let lastTimestamp = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < points.length - 1; i++) {
    const prev = points[i - 1] ?? points[i];
    const current = points[i];
    const next = points[i + 1];
    const nextNext = points[i + 2] ?? next;

    if (current.timestamp > lastTimestamp) {
      result.push(current);
      lastTimestamp = current.timestamp;
    }

    const deltaTime = next.timestamp - current.timestamp;
    if (deltaTime <= 0) {
      continue;
    }

    const localMin = Math.min(current.price, next.price);
    const localMax = Math.max(current.price, next.price);
    const localRange =
      localMax - localMin ||
      Math.max(1e-12, Math.max(Math.abs(current.price), Math.abs(next.price)) * 1e-3);
    const guardMin = localMin - localRange * 0.35;
    const guardMax = localMax + localRange * 0.35;

    for (let s = 1; s < segments; s++) {
      const ratio = s / segments;
      const timestamp = current.timestamp + Math.round(deltaTime * ratio);
      if (timestamp <= lastTimestamp) {
        continue;
      }

      const interpolatedPrice = catmullRom(
        prev.price,
        current.price,
        next.price,
        nextNext.price,
        ratio
      );

      result.push({
        timestamp,
        price: clamp(interpolatedPrice, Math.min(guardMin, guardMax), Math.max(guardMin, guardMax)),
        blockNumberHex: current.blockNumberHex,
      });
      lastTimestamp = timestamp;
    }
  }

  const lastPoint = points[points.length - 1];
  if (!result.length || result[result.length - 1].timestamp < lastPoint.timestamp) {
    result.push(lastPoint);
  }
  return result;
}

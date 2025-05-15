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

    quaiPriceHistory.push({
      timestamp: Date.now(),
      price: lastQuaiUsdPrice
    });

    if (quaiPriceHistory.length > 100) {
      quaiPriceHistory = quaiPriceHistory.slice(-100);
    }

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
    const qiToQuaiDecimal = parseInt(qiToQuaiRate, 16) / 10 ** 18;

    if (qiToQuaiDecimal && qiToQuaiDecimal > 0) {
      const qiUsdPrice = quaiUsdPrice * qiToQuaiDecimal;
      lastQiUsdPrice = qiUsdPrice;

      qiPriceHistory.push({
        timestamp: Date.now(),
        price: qiUsdPrice
      });

      if (qiPriceHistory.length > 100) {
        qiPriceHistory = qiPriceHistory.slice(-100);
      }

      return qiUsdPrice;
    }

    return lastQiUsdPrice || (quaiUsdPrice * 16);
  } catch (error) {
    console.error("Error calculating QI USD price:", error);
    return lastQiUsdPrice || (quaiUsdPrice * 16);
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
  if (qiPriceHistory.length === 0 && lastQiUsdPrice) {
    const now = Date.now();
    qiPriceHistory.push({
      timestamp: now - 3600000,
      price: lastQiUsdPrice
    });
    qiPriceHistory.push({
      timestamp: now,
      price: lastQiUsdPrice
    });
  }
  return qiPriceHistory;
}

export function getQuaiPriceHistory() {
  return quaiPriceHistory;
}

export function getLastUpdatedTime(): number {
  return lastUpdatedTimestamp;
}

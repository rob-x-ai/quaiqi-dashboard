
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format } from "date-fns";
import type { TooltipProps } from "recharts";

interface ChartData {
  timestamp: number;
  price: number;
}

type QiHistoryRange = "1h" | "24h" | "7d" | "30d" | "6m";

const REQUEST_TIMEOUT_MS = 20000;
const MAX_RETRIES = 2;

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES,
  externalController?: AbortController
): Promise<Response> {
  const maxAttempts = externalController ? 1 : retries + 1;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = externalController ?? new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      clearTimeout(timeout);
      return response;
    } catch (error) {
      lastError = error;
      clearTimeout(timeout);
      const isAbortError = error instanceof DOMException && error.name === "AbortError";
      const isLastAttempt = attempt === maxAttempts - 1;

      if (isLastAttempt || (externalController && isAbortError)) {
        throw error;
      }
      // brief backoff before retrying a timeout
      await new Promise(resolve => setTimeout(resolve, 750 * (attempt + 1)));
    }
  }
  throw lastError ?? new Error("Unable to fetch data");
}

export function PriceChart() {
  const [priceData, setPriceData] = useState<ChartData[]>([]);
  const [timeRange, setTimeRange] = useState<QiHistoryRange>("1h");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let activeController: AbortController | null = null;

    const load = async () => {
      // Cancel any in-flight request before starting a new one
      if (activeController) {
        activeController.abort();
      }
      const controller = new AbortController();
      activeController = controller;

      setIsLoading(true);
      setError(null);
      try {
        const response = await fetchWithRetry(
          `/api/qi-history?range=${timeRange}`,
          {
            method: "GET",
            headers: {
              "Accept": "application/json",
            },
            cache: "no-store",
          },
          MAX_RETRIES,
          controller
        );

        const payload = await response.json();
        const history = Array.isArray(payload?.data) ? payload.data : [];

        if (!cancelled) {
          setPriceData(
            history
              .map((point: { timestamp_ms?: number; timestamp?: number; price?: number }) => ({
                timestamp: Number(point.timestamp_ms ?? point.timestamp),
                price: Number(point.price ?? 0),
              }))
              .filter(item => Number.isFinite(item.timestamp) && Number.isFinite(item.price) && item.price > 0)
              .sort((a, b) => a.timestamp - b.timestamp)
          );
        }
      } catch (err: unknown) {
        const controllerWasReplaced = activeController !== null && activeController !== controller;
        const abortedByNewLoad =
          controllerWasReplaced || (controller.signal.aborted && !cancelled);

        if (abortedByNewLoad) {
          return;
        }

        console.error("Failed to fetch QI price history:", err);
        if (!cancelled) {
          setError("Unable to load historical data. Retrying shortly…");
        }
      } finally {
        if (activeController === controller) {
          activeController = null;
        }
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      activeController?.abort();
      clearInterval(interval);
    };
  }, [timeRange]);

  // Function to format timestamps on X axis
  const formatXAxis = (timestamp: number) => {
    if (timeRange === "1h") {
      return format(new Date(timestamp), "HH:mm");
    }
    if (timeRange === "24h") {
      return format(new Date(timestamp), "HH:mm");
    }
    if (timeRange === "7d") {
      return format(new Date(timestamp), "MMM dd");
    }
    if (timeRange === "30d") {
      return format(new Date(timestamp), "MMM dd");
    }
    return format(new Date(timestamp), "MMM yy");
  };
  
  // Colors derived from CSS variables so they adapt to theme
  const lineColor = "hsl(var(--primary))";
  const gridColor = "hsl(var(--border))";
  const axisColor = "hsl(var(--muted-foreground))";

  // Custom tooltip content
  const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    const entry = payload && payload.length > 0 ? payload[0] : null;
    const priceValue = typeof entry?.value === "number"
      ? entry.value
      : Number(entry?.value ?? Number.NaN);
    const labelValue = typeof label === "number" ? label : Number(label);

    if (active && entry && Number.isFinite(priceValue) && Number.isFinite(labelValue)) {
      return (
        <div className="bg-popover border border-border p-2 rounded-md shadow-md text-sm">
          <p className="font-medium">{format(new Date(labelValue), "MMM dd, HH:mm")}</p>
          <p className="text-primary">QI Price: ${priceValue.toFixed(6)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="w-full h-[400px] card-glow">
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold">QI Price History</CardTitle>
          <div className="flex space-x-2">
            <Button active={timeRange === "1h"} onClick={() => setTimeRange("1h")}>1H</Button>
            <Button active={timeRange === "24h"} onClick={() => setTimeRange("24h")}>24H</Button>
            <Button active={timeRange === "7d"} onClick={() => setTimeRange("7d")}>7D</Button>
            <Button active={timeRange === "30d"} onClick={() => setTimeRange("30d")}>30D</Button>
            <Button active={timeRange === "6m"} onClick={() => setTimeRange("6m")}>6M</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4 h-[340px]">
        {error && (
          <div className="mb-2 text-center text-xs text-muted-foreground">{error}</div>
        )}
        {priceData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={priceData} margin={{ top: 12, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid stroke={gridColor} strokeOpacity={0.3} />
              <XAxis
                dataKey="timestamp"
                tickFormatter={formatXAxis}
                stroke={gridColor}
                tick={{ fontSize: 12, fill: axisColor }}
                tickLine={{ stroke: gridColor, strokeOpacity: 0.4 }}
                axisLine={{ stroke: gridColor, strokeOpacity: 0.4 }}
              />
              <YAxis
                domain={["auto", "auto"]}
                stroke={gridColor}
                tick={{ fontSize: 12, fill: axisColor }}
                tickLine={{ stroke: gridColor, strokeOpacity: 0.4 }}
                axisLine={{ stroke: gridColor, strokeOpacity: 0.4 }}
                tickFormatter={(value) => `$${value.toFixed(2)}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="price"
                strokeWidth={2.5}
                stroke={lineColor}
                dot={false}
                activeDot={{ r: 6, stroke: lineColor, strokeWidth: 2, fill: "hsl(var(--background))" }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">
              {isLoading ? "Fetching QI price history…" : "No data available for this range yet."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Button({ children, active, onClick }: { children: React.ReactNode, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`px-3 py-1 text-xs rounded-md transition-colors ${
        active 
          ? "bg-primary text-primary-foreground" 
          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
      }`}
    >
      {children}
    </button>
  );
}

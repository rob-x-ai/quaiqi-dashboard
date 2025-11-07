import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { PriceCard } from "@/components/PriceCard";
import { CurrencyConverter } from "@/components/CurrencyConverter";
import { PriceChart } from "@/components/PriceChart";
import { Footer } from "@/components/Footer";
import { KipperChip } from "@/components/KipperChip";
import {
  fetchQiToQuai,
  fetchQuaiToQi,
  fetchQuaiUsdPrice,
  calculateQiUsdPrice,
} from "@/services/cryptoApi";

const Index = () => {
  const [qiToQuaiRate, setQiToQuaiRate] = useState<string>("0");
  const [quaiToQiRate, setQuaiToQiRate] = useState<string>("0");
  const [quaiUsdPrice, setQuaiUsdPrice] = useState<number>(0);
  const [qiUsdPrice, setQiUsdPrice] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [qiLoading, setQiLoading] = useState<boolean>(true);
  
  const [lastValidQuaiUsd, setLastValidQuaiUsd] = useState<string>("");
  const [lastValidQiUsd, setLastValidQiUsd] = useState<string>("");

  const formatRate = (rate: string, inverse = false): string => {
    try {
      const decimal = parseInt(rate, 16) / 10 ** 18;
      return inverse
        ? decimal > 0
          ? (1 / decimal).toFixed(6)
          : "0.000000"
        : decimal.toFixed(6);
    } catch (error) {
      console.error("Error formatting rate:", error);
      return "0.000000";
    }
  };

  const calculateRates = async () => {
    try {
      setIsLoading(true);
      
      const [qiToQuaiResult, quaiToQiResult, quaiUsd] = await Promise.all([
        fetchQiToQuai(),
        fetchQuaiToQi(),
        fetchQuaiUsdPrice(),
      ]);

      setQiToQuaiRate(qiToQuaiResult);
      setQuaiToQiRate(quaiToQiResult);
      setQuaiUsdPrice(quaiUsd);

      if (quaiUsd > 0) {
        const formatted = `$${quaiUsd.toFixed(6)} USD`;
        setLastValidQuaiUsd(formatted);
      }

      // Calculate QI price based on the QI to QUAI rate and QUAI price
      const qiUsd = await calculateQiUsdPrice(qiToQuaiResult, quaiUsd);
      // Only expose QI price to UI once stable to prevent first-sample spikes
      const { isQiPriceStable } = await import("@/services/cryptoApi");
      if (isQiPriceStable()) {
        setQiUsdPrice(qiUsd);
        setQiLoading(false);
        if (qiUsd > 0) {
          const formatted = `$${qiUsd.toFixed(6)} USD`;
          setLastValidQiUsd(formatted);
        }
      } else {
        setQiLoading(true);
      }
    } catch (error) {
      console.error("Error calculating rates:", error);
    } finally {
      // General loading ends after first fetch completes
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Seed UI from persisted last QI price if available to avoid showing 0
    (async () => {
      const { getLastQiUsdPrice } = await import("@/services/cryptoApi");
      const last = getLastQiUsdPrice();
      if (last && last > 0) {
        setQiUsdPrice(last);
        setLastValidQiUsd(`$${last.toFixed(6)} USD`);
        setQiLoading(true); // still waiting for fresh stable samples
      }
    })();

    calculateRates();
    
    const intervalId = setInterval(calculateRates, 30000);
    
    return () => clearInterval(intervalId);
  }, []);

  const quaiUsdDisplay =
    quaiUsdPrice > 0
      ? `$${quaiUsdPrice.toFixed(6)}`
      : lastValidQuaiUsd.replace(" USD", "") || "$0.000000";
  const qiUsdDisplay =
    qiUsdPrice > 0
      ? `$${qiUsdPrice.toFixed(6)}`
      : lastValidQiUsd.replace(" USD", "") || "$0.000000";

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      
      <main className="flex-1 space-y-16 pb-16 pt-28">
        <section id="metrics" className="container space-y-6">
          <div className="flex flex-col gap-2">
            <p className="section-label text-muted-foreground">Telemetry Panel</p>
            <h2 className="font-display text-3xl uppercase tracking-[0.2em]">Live Metrics</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Cards stream raw conversion data, USD anchors, and signal quality so you can act faster.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <PriceCard
              title="1 QUAI = QI"
              value={formatRate(qiToQuaiRate, true)}
              subValue="Live conversion rate"
              isLoading={isLoading}
              tooltip="Absolute on-chain conversion rate between QUAI and QI."
            />
            <PriceCard
              title="1 QI = QUAI"
              value={formatRate(qiToQuaiRate)}
              subValue="Live conversion rate"
              isLoading={isLoading}
              tooltip="Absolute on-chain conversion rate between QI and QUAI."
            />
            <PriceCard
              title="QUAI Price"
              value={`$${quaiUsdPrice.toFixed(6)} USD`}
              subValue="CoinGecko data"
              isLoading={isLoading}
              fallbackValue={lastValidQuaiUsd}
            />
            <PriceCard
              title="QI Price"
              value={`$${qiUsdPrice.toFixed(6)} USD`}
              subValue="Calculated from QUAI price"
              isLoading={qiLoading}
              fallbackValue={lastValidQiUsd}
            />
          </div>
        </section>

        <section
          id="converter"
          className="container grid gap-6 lg:grid-cols-2"
        >
          <div className="space-y-3">
            <p className="section-label text-muted-foreground">Swap Estimator</p>
            <h2 className="text-2xl font-semibold uppercase tracking-[0.2em]">
              Conversion Calculator
            </h2>
            <p className="text-sm text-muted-foreground">
              Calculate how much you receive swapping between QI and QUAI including slippage and fees.
            </p>
            <CurrencyConverter
              qiToQuaiRate={qiToQuaiRate}
              quaiToQiRate={quaiToQiRate}
            />
          </div>
          
          <div className="space-y-3" id="history">
            <p className="section-label text-muted-foreground">History Stream</p>
            <h2 className="text-2xl font-semibold uppercase tracking-[0.2em]">
              QI Price Chart
            </h2>
            <p className="text-sm text-muted-foreground">
              Historical price data for QI in USD, refreshed every few minutes directly from the api.
            </p>
            <PriceChart />
          </div>
        </section>
      </main>
      <Footer />
      <KipperChip />
    </div>
  );
};

export default Index;

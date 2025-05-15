import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { PriceCard } from "@/components/PriceCard";
import { CurrencyConverter } from "@/components/CurrencyConverter";
import { PriceChart } from "@/components/PriceChart";
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
      setQiUsdPrice(qiUsd);
      
      if (qiUsd > 0) {
        const formatted = `$${qiUsd.toFixed(6)} USD`;
        setLastValidQiUsd(formatted);
      }
    } catch (error) {
      console.error("Error calculating rates:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    calculateRates();
    
    const intervalId = setInterval(calculateRates, 30000);
    
    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 container pt-24 pb-16">
        <div className="space-y-10">
          <section>
            <h1 className="text-3xl font-bold mb-2">QUAI/QI Conversion Dashboard</h1>
            <p className="text-muted-foreground mb-8">
              Real-time conversion rates and USD prices for QUAI and QI
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <PriceCard
                title="1 QUAI = QI"
                value={formatRate(qiToQuaiRate, true)}
                subValue="Live conversion rate"
                isLoading={isLoading}
                className="bg-gradient-to-br from-background to-background/90"
                tooltip="This is the absolute conversion rate without considering slippage. Actual rate may be lower due to slippage and fees."
              />
              <PriceCard
                title="1 QI = QUAI"
                value={formatRate(qiToQuaiRate)}
                subValue="Live conversion rate"
                isLoading={isLoading}
                className="bg-gradient-to-br from-background to-background/90"
                tooltip="This is the absolute conversion rate without considering slippage. Actual rate may be lower due to slippage and fees."
              />
              <PriceCard
                title="QUAI Price"
                value={`$${quaiUsdPrice.toFixed(6)} USD`}
                subValue="CoinGecko data"
                isLoading={isLoading}
                className="bg-gradient-to-br from-background to-background/90"
                fallbackValue={lastValidQuaiUsd}
              />
              <PriceCard
                title="QI Price"
                value={`$${qiUsdPrice.toFixed(6)} USD`}
                subValue="Calculated from QUAI price"
                isLoading={isLoading}
                className="bg-gradient-to-br from-background to-background/90"
                fallbackValue={lastValidQiUsd}
              />
            </div>
          </section>
          
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold mb-4">Conversion Calculator</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Calculate how much you would receive when swapping between QI and QUAI, 
                including slippage and fees.
              </p>
              <CurrencyConverter
                qiToQuaiRate={qiToQuaiRate}
                quaiToQiRate={quaiToQiRate}
              />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold mb-4">QI Price Chart</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Historical price data for QI in USD
              </p>
              <PriceChart />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default Index;

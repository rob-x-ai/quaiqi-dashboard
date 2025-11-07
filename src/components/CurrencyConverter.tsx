import { useState, useEffect } from "react";
import { ArrowDownUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateConversionAmount } from "@/services/cryptoApi";
import { parseUnits } from "ethers";

interface CurrencyConverterProps {
  qiToQuaiRate?: string;
  quaiToQiRate?: string;
}

// Slippage configuration
const SLIPPAGE_CONFIG = {
  QI_TO_QUAI: 1.5, // Higher slippage for QI → QUAI
  QUAI_TO_QI: 0.5, // Lower slippage for QUAI → QI
};

export function CurrencyConverter({
  qiToQuaiRate,
  quaiToQiRate,
}: CurrencyConverterProps) {
  const [fromCurrency, setFromCurrency] = useState<"QI" | "QUAI">("QI");
  const [toCurrency, setToCurrency] = useState<"QI" | "QUAI">("QUAI");
  const [amount, setAmount] = useState<string>("1");
  const [result, setResult] = useState<{
    amountOut: string;
    effectiveRate: string;
    slippage: string;
  }>({
    amountOut: "0",
    effectiveRate: "0",
    slippage: "0%",
  });
  const [isCalculating, setIsCalculating] = useState(false);

  // Calculate conversion when amount or currencies change
  useEffect(() => {
    const calculateConversion = async () => {
      if (amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0) {
        setIsCalculating(true);

        // Get conversion direction and slippage
        const direction = fromCurrency === "QUAI" ? "quaiToQi" : "qiToQuai";

        let amountForSlipCalculation;
        if (direction === "quaiToQi") {
          amountForSlipCalculation = parseUnits(amount, 18);
        } else {
          amountForSlipCalculation = parseUnits(amount, 3);
        }

        // Call API with direction and slippage info
        const conversionResult = await calculateConversionAmount(
          fromCurrency,
          amountForSlipCalculation,
        );

        // Update result with direction-specific slippage
        setResult({
          ...conversionResult,
        });

        setIsCalculating(false);
      } else {
        setResult({
          amountOut: "0",
          effectiveRate: "0",
          slippage: "0%",
        });
      }
    };

    const timeoutId = setTimeout(calculateConversion, 500);
    return () => clearTimeout(timeoutId);
  }, [amount, fromCurrency, toCurrency]);

  const handleSwapCurrencies = () => {
    setFromCurrency(toCurrency as "QI" | "QUAI");
    setToCurrency(fromCurrency as "QI" | "QUAI");
  };

  return (
    <Card className="w-full card-glow futuristic-card backdrop-blur">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">
          Currency Converter
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-col space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <div className="flex space-x-2">
              <Input
                id="amount"
                type="number"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1"
                min="0"
              />
              <Button
                variant="outline"
                className="min-w-[80px]"
                onClick={() => {
                  setFromCurrency("QI");
                  setToCurrency("QUAI");
                }}
              >
                {fromCurrency}
              </Button>
            </div>
          </div>

          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSwapCurrencies}
              className="rounded-full my-2"
            >
              <ArrowDownUp className="h-4 w-4" />
              <span className="sr-only">Swap currencies</span>
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="result">You Receive</Label>
            <div className="flex space-x-2">
              <Input
                id="result"
                type="text"
                value={isCalculating ? "Calculating..." : result.amountOut}
                readOnly
                className="flex-1"
              />
              <Button
                variant="outline"
                className="min-w-[80px]"
                onClick={() => {
                  setFromCurrency("QUAI");
                  setToCurrency("QI");
                }}
              >
                {toCurrency}
              </Button>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t">
            <div className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Slippage:</span>
                <span className="font-medium">
                  {result.slippage} ({fromCurrency} → {toCurrency})
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

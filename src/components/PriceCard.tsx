import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PriceCardProps {
  title: string;
  value: string;
  subValue?: string;
  className?: string;
  isLoading?: boolean;
  fallbackValue?: string;
  tooltip?: string;
}

export function PriceCard({
  title,
  value,
  subValue,
  className,
  isLoading = false,
  fallbackValue = "",
  tooltip,
}: PriceCardProps) {
  // If the value is "$0.000000 USD" and we have a fallback, use the fallback
  const displayValue = value === "$0.000000 USD" && fallbackValue ? fallbackValue : value;
  
  return (
    <Card
      className={cn(
        "futuristic-card card-glow relative overflow-hidden border border-black/10 bg-transparent dark:border-white/10",
        className
      )}
      >
        <span className="grid-overlay opacity-10 dark:opacity-20" aria-hidden="true" />
      <CardHeader className="pb-1">
        <div className="flex items-center gap-2">
          <CardTitle className="text-[0.65rem] font-normal uppercase tracking-[0.4em] text-muted-foreground">
            {title}
          </CardTitle>
          {tooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground transition-colors hover:text-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-[220px] text-xs">{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardHeader>
      <CardContent className="relative space-y-3">
        <div
          className={cn(
            "price-card-value font-display text-3xl leading-tight tracking-[0.08em] transition-opacity lg:text-4xl",
            isLoading ? "animate-pulse-gentle text-muted-foreground" : "text-foreground"
          )}
        >
          {displayValue}
        </div>
        {subValue && (
          <p className="text-xs text-muted-foreground">{subValue}</p>
        )}
        <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-[0.35em] text-muted-foreground">
          <span>{isLoading ? "Sync Sequence" : "Realtime Feed"}</span>
          <span className="inline-flex items-center gap-1 font-semibold text-primary">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isLoading ? "animate-pulse bg-muted-foreground" : "bg-primary"
              )}
            />
            {isLoading ? "Calibrating" : "Live"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

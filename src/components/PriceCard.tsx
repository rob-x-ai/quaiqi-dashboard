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
    <Card className={cn(
      "overflow-hidden card-glow relative",
      "before:absolute before:inset-0 before:-z-10 before:rounded-lg before:bg-quai-red/20",
      "shadow-[0_0_15px_rgba(226,41,1,0.3)]",
      className
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          {tooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-[200px]">{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "text-2xl font-bold transition-opacity",
            isLoading ? "animate-pulse-gentle" : ""
          )}
        >
          {displayValue}
        </div>
        {subValue && (
          <p className="mt-1 text-xs text-muted-foreground">{subValue}</p>
        )}
      </CardContent>
    </Card>
  );
}

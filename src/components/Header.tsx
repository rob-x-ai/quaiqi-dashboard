import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getLastUpdatedTime } from "@/services/cryptoApi";
import { RefreshCw, Github } from "lucide-react";
import { format } from "date-fns";

export function Header() {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    // Initial update
    updateTimestamp();
    
    // Set up interval to check for updates every 10 seconds
    const intervalId = setInterval(updateTimestamp, 10000);
    
    return () => clearInterval(intervalId);
  }, []);

  const updateTimestamp = () => {
    const timestamp = getLastUpdatedTime();
    setLastUpdated(new Date(timestamp));
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-20 items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/80 shadow-lg shadow-black/10 dark:bg-black/40">
            <img
              src="/Logo.png"
              alt="quai.red logo"
              className="h-10 w-10 object-contain"
            />
          </div>
          <div className="space-y-1">
            <p className="text-[0.65rem] uppercase tracking-[0.4em] text-muted-foreground">
              Quai.red{" "}
              {/* <span className="ml-2 inline-flex items-center rounded-full border border-white/20 px-2 py-0.5 text-[0.55rem] tracking-[0.3em]">
                beta
              </span> */}
            </p>
            <p className="font-display text-2xl uppercase tracking-[0.2em] text-foreground">
              Dashboard
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <div className="hidden items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[0.7rem] uppercase tracking-[0.3em] text-muted-foreground shadow-sm dark:bg-black/30 md:inline-flex">
              <RefreshCw className="h-4 w-4 text-primary" />
              <span>{format(lastUpdated, "HH:mm:ss")} UTC</span>
            </div>
          )}
          <a
            href="https://github.com/rob-x-ai/quai.red"
            target="_blank"
            rel="noreferrer"
            aria-label="View source on GitHub"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/10 text-muted-foreground backdrop-blur transition hover:border-white/30 hover:text-foreground dark:bg-black/30"
          >
            <Github className="h-5 w-5" />
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

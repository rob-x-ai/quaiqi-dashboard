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
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-background/85 backdrop-blur-xl">
      <div className="container flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap sm:py-4">
        <div className="flex min-w-[160px] items-center gap-3 sm:gap-4">
          <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/80 shadow-lg shadow-black/10 dark:bg-black/40 sm:h-16 sm:w-16">
            <img
              src="/Logo.png"
              alt="quai.red logo"
              className="h-8 w-8 object-contain sm:h-12 sm:w-12"
            />
          </div>
          <div className="space-y-0.5">
            <p className="text-[0.55rem] uppercase tracking-[0.2em] text-muted-foreground sm:text-[0.65rem] sm:tracking-[0.4em]">
              Quai.red
            </p>
            <p className="font-display text-lg uppercase tracking-[0.12em] text-foreground sm:text-2xl sm:tracking-[0.2em]">
              Dashboard
            </p>
          </div>
        </div>

        <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
          <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
            {lastUpdated && (
              <div className="flex min-w-[150px] flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[0.58rem] uppercase tracking-[0.25em] text-muted-foreground shadow-sm dark:bg-black/30 sm:min-w-[200px] sm:flex-none sm:px-4 sm:py-2 sm:text-[0.7rem]">
                <RefreshCw className="h-4 w-4 text-primary" />
                <span>{format(lastUpdated, "HH:mm:ss")} UTC</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <a
                href="https://github.com/rob-x-ai/quai.red"
                target="_blank"
                rel="noreferrer"
                aria-label="View source on GitHub"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-muted-foreground backdrop-blur transition hover:border-white/30 hover:text-foreground dark:bg-black/30"
              >
                <Github className="h-5 w-5" />
              </a>
              <ThemeToggle className="h-11 w-11" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

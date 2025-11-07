import { useState } from "react";

export function KipperChip({ defaultVisible = true }: { defaultVisible?: boolean }) {
  const [visible, setVisible] = useState(defaultVisible);
  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-full border border-black/10 bg-white/80 px-3 py-2 text-xs uppercase tracking-[0.25em] text-foreground shadow-xl backdrop-blur-md dark:border-white/15 dark:bg-background/90">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setVisible(false)}
          aria-label="Dismiss Kipper CTA"
          className="rounded-full border border-black/10 px-2 py-0.5 text-[0.6rem] transition hover:border-black/30 dark:border-white/20 dark:hover:border-white/40"
        >
          x
        </button>
        <img src="/kipper-logo.png" alt="Kipper" className="h-6 w-6 rounded-full border border-black/10 object-cover dark:border-white/20" />
        <div className="flex flex-col leading-tight">
          <span className="text-[0.55rem] text-muted-foreground">Signal</span>
          <span className="font-semibold tracking-[0.32em]">Kipper</span>
        </div>
      </div>
      <a
        href="https://kipper.money/r/cmevbba2a0001ky04elop2ekn"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[0.55rem] font-semibold tracking-[0.4em] text-primary transition hover:bg-primary/15"
      >
        Engage
      </a>
    </div>
  );
}

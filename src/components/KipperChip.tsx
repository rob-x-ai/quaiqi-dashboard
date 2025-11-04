import { useState } from "react";

export function KipperChip({ defaultVisible = true }: { defaultVisible?: boolean }) {
  const [visible, setVisible] = useState(defaultVisible);
  if (!visible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex max-w-xs items-center gap-3 rounded-full border border-primary/20 bg-gradient-to-r from-primary/90 via-primary to-primary/80 px-4 py-3 text-primary-foreground shadow-2xl">
      <button
        onClick={() => setVisible(false)}
        aria-label="Dismiss Kipper CTA"
        className="rounded-full bg-primary/40 px-2 text-xs font-semibold text-primary-foreground/80 hover:bg-primary/60"
      >
        ×
      </button>
      <img src="/kipper-logo.png" alt="Kipper" className="h-8 w-8" />
      <div className="flex flex-col text-left">
        <span className="text-xs uppercase tracking-wide text-primary-foreground/70">Powered by Quai Network</span>
        <a
          href="https://kipper.money/r/cmevbba2a0001ky04elop2ekn"
          target="_blank"
          className="text-sm font-semibold text-primary-foreground underline-offset-2 hover:underline"
        >
          Earn free QUAI on Kipper
        </a>
      </div>
    </div>
  );
}

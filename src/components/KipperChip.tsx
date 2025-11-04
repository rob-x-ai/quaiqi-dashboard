import { useState } from "react";

export function KipperChip({ defaultVisible = true }: { defaultVisible?: boolean }) {
  const [visible, setVisible] = useState(defaultVisible);
  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 rounded-full border border-primary/30 bg-gradient-to-r from-primary/90 to-primary/70 px-2.5 py-1.5 text-primary-foreground shadow-lg">
      <button
        onClick={() => setVisible(false)}
        aria-label="Dismiss Kipper CTA"
        className="rounded-full bg-primary/40 px-[6px] text-[9px] font-semibold text-primary-foreground/80 transition hover:bg-primary/60"
      >
        ×
      </button>
      <img src="/kipper-logo.png" alt="Kipper" className="h-5 w-5" />
      <a
        href="https://kipper.money/r/cmevbba2a0001ky04elop2ekn"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-foreground underline-offset-2 hover:underline"
      >
        Earn QUAI on Kipper on 𝕏
        <span aria-hidden>→</span>
      </a>
    </div>
  );
}

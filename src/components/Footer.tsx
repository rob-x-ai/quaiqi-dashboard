export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-background/70 py-8">
      <div className="container flex flex-col gap-3 text-center text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:text-left">
        <p className="max-w-2xl">
          quai.red delivers real-time QUAI and QI conversion rates, USD prices, and historical analytics powered by Quai Network.
        </p>
        <p className="text-xs uppercase tracking-[0.3em]">
          © {new Date().getFullYear()} · Maintained by the Quai Network community
        </p>
      </div>
    </footer>
  );
}

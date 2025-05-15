export function Footer() {
  return (
    <footer className="border-t py-6 md:py-0">
      <div className="container flex flex-col md:flex-row items-center justify-between gap-4 md:h-16">
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} QUAI/QI. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

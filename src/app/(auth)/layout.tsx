export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex items-center justify-center overflow-hidden bg-ink-1">
      <div className="w-full max-w-md px-4">
        <div className="flex items-center justify-center mb-8">
          <span className="font-display font-bold text-2xl tracking-tight text-ink-9">Peek &amp; Poke</span>
        </div>
        {children}
      </div>
    </div>
  );
}

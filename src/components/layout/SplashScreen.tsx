/** Splash plein ecran — affiche pendant la restauration de session. */
export function SplashScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink-950">
      <div className="flex animate-fade-in items-center gap-3">
        <span className="h-3 w-3 animate-pulse rounded-full bg-accent" />
        <span className="text-lg font-semibold tracking-[0.35em] text-fg">IPTV</span>
      </div>
    </div>
  );
}

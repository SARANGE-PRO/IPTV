import { BrandLogo } from '@/components/shared/BrandLogo';

/** Splash plein ecran — affiche pendant la restauration de session. */
export function SplashScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink-950">
      <BrandLogo
        className="animate-fade-in"
        markClassName="h-12 w-12"
        textClassName="text-2xl"
        pulse
      />
    </div>
  );
}

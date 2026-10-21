import { BrandLogo } from '@/components/shared/BrandLogo';

/**
 * Splash plein ecran — affiche pendant la restauration de session. `hint` :
 * message d'attente explicite (mise a jour du stockage, onglet bloquant…) pour
 * que l'utilisateur sache que l'app travaille et quoi faire.
 */
export function SplashScreen({ hint }: { hint?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-ink-950 px-6">
      <BrandLogo
        className="animate-fade-in"
        markClassName="h-12 w-12"
        textClassName="text-2xl"
        pulse
      />
      {hint !== undefined && (
        <p className="max-w-sm animate-fade-in text-center text-sm leading-relaxed text-fg-muted">{hint}</p>
      )}
    </div>
  );
}

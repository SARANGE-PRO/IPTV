'use client';

import { useLowBandwidth } from '@/hooks/useLowBandwidth';

/**
 * Mode « connexion faible » : proposition (lecture vraiment degradee) ou
 * rappel qu'il est actif, avec sortie en un tap. En haut de page, jamais sur
 * la video (lecteur natif) ; masque en paysage plein ecran.
 */
export function LowBandwidthBanner() {
  const { enabled, proposed, setEnabled, decline } = useLowBandwidth();
  if (!enabled && !proposed) return null;

  if (proposed) {
    return (
      <div role="status" className="mx-4 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-amber-400/10 px-4 py-2 phone-land:hidden md:mx-8">
        <span className="min-w-0 flex-1 text-xs text-amber-200">
          La lecture a du mal. Le mode connexion faible réserve le réseau à la vidéo.
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => setEnabled(true)} className="relative hit-44 px-2 text-xs font-semibold text-amber-300">
            Activer
          </button>
          <button type="button" onClick={decline} className="relative hit-44 px-2 text-xs font-medium text-fg-muted">
            Non merci
          </button>
        </span>
      </div>
    );
  }

  return (
    <div role="status" className="mx-4 mt-3 flex items-center gap-3 rounded-xl bg-sky-400/10 px-4 py-2 phone-land:hidden md:mx-8">
      <span className="min-w-0 flex-1 text-xs text-sky-200">
        Connexion faible : seule la lecture utilise le réseau.
      </span>
      <button type="button" onClick={() => setEnabled(false)} className="relative hit-44 shrink-0 text-xs font-semibold text-sky-300">
        Désactiver
      </button>
    </div>
  );
}

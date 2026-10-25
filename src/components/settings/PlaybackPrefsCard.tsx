'use client';

import { SettingsCard, SettingsRow, Switch } from '@/components/settings/SettingsCard';
import { useUiSettingsStore, type PreferredLanguage } from '@/stores/uiSettingsStore';
import { useLowBandwidth } from '@/hooks/useLowBandwidth';

const LANGUAGES: { value: PreferredLanguage; label: string }[] = [
  { value: 'VF', label: 'VF (français)' },
  { value: 'VOSTFR', label: 'VOSTFR' },
  { value: 'MULTI', label: 'MULTI' },
  { value: 'EN', label: 'Anglais' },
  { value: 'ES', label: 'Espagnol' },
  { value: 'DE', label: 'Allemand' },
  { value: 'IT', label: 'Italien' },
  { value: 'PT', label: 'Portugais' },
];

const SELECT_CLASS =
  'h-10 w-full rounded-xl border border-ink-600 bg-ink-800 px-3 text-sm text-fg outline-none focus:border-accent/70';

export function PlaybackPrefsCard() {
  const preferredLanguage = useUiSettingsStore((s) => s.preferredLanguage);
  const setPreferredLanguage = useUiSettingsStore((s) => s.setPreferredLanguage);
  const regrouping = useUiSettingsStore((s) => s.regrouping);
  const showVlcButton = useUiSettingsStore((s) => s.showVlcButton);
  const showCastButton = useUiSettingsStore((s) => s.showCastButton);
  const pipEnabled = useUiSettingsStore((s) => s.pipEnabled);
  const setPipEnabled = useUiSettingsStore((s) => s.setPipEnabled);
  const setShowCastButton = useUiSettingsStore((s) => s.setShowCastButton);
  const setShowVlcButton = useUiSettingsStore((s) => s.setShowVlcButton);
  const lowBandwidth = useLowBandwidth();

  return (
    <SettingsCard title="Lecture et langue">
      <div className="flex flex-col gap-5">
        <SettingsRow
          stacked
          label="Langue préférée"
          hint={
            regrouping
              ? 'Réorganisation des versions en cours…'
              : 'Version choisie par défaut quand un film ou une série existe en plusieurs langues.'
          }
        >
          <select
            value={preferredLanguage}
            onChange={(e) => void setPreferredLanguage(e.target.value as PreferredLanguage)}
            className={SELECT_CLASS}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </SettingsRow>
        <SettingsRow
          label="Image dans l’image (PiP)"
          hint="Bouton PiP sur la vidéo. En plein écran, l’iPhone passe aussi en PiP quand tu quittes l’app (Réglages iOS › Général › Image dans l’image)."
        >
          <Switch checked={pipEnabled} onChange={(v) => void setPipEnabled(v)} label="Image dans l’image" />
        </SettingsRow>
        <SettingsRow
          label="Mode connexion faible"
          hint="Métro, campagne : seule la lecture utilise le réseau (guide, scores, synchro, recommandations et défilement des images en pause) ; le direct est un peu décalé pour moins couper. S’éteint seul après 3 h sans lecture."
        >
          <Switch checked={lowBandwidth.enabled} onChange={(v) => lowBandwidth.setEnabled(v)} label="Mode connexion faible" />
        </SettingsRow>
        <SettingsRow label="Bouton « Diffuser sur la TV »" hint="Ouvre la vidéo dans VLC, qui la diffuse sur ta TV (Android TV, Chromecast).">
          <Switch checked={showCastButton} onChange={(v) => void setShowCastButton(v)} label="Bouton Diffuser sur la TV" />
        </SettingsRow>
        <SettingsRow label="Bouton « Lire dans VLC »" hint="Recours si un flux ne se lit pas dans l’app.">
          <Switch checked={showVlcButton} onChange={(v) => void setShowVlcButton(v)} label="Bouton Lire dans VLC" />
        </SettingsRow>
      </div>
    </SettingsCard>
  );
}

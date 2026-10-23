'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { launchVlc } from '@/components/player/ExternalPlayer';
import { IconCast } from '@/components/ui/actionIcons';
import { cn } from '@/lib/cn';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';
import { isAndroid, isIOS } from '@/utils/externalPlayer';

const VLC_STORE_URL = 'https://apps.apple.com/app/vlc-media-player/id650377962';

/**
 * « Diffuser sur la TV », facon bouton Cast de YouTube. Une app web ne peut pas
 * caster elle-meme (le kit Google Cast est reserve aux apps natives) : le flux
 * s'ouvre dans VLC, qui sait le diffuser sur une Android TV / un Chromecast du
 * meme wifi. La lecture de l'app s'arrete (une seule connexion au compte).
 * Premier usage : petit guide en 3 etapes, ensuite ouverture directe.
 */
export function CastButton({
  streamUrl,
  title,
  className,
}: {
  /** URL DIRECTE du flux Xtream (comme pour VLC), null = rien a diffuser. */
  streamUrl: string | null;
  title: string;
  className?: string;
}) {
  const showCastButton = useUiSettingsStore((s) => s.showCastButton);
  const castHintSeen = useUiSettingsStore((s) => s.castHintSeen);
  const [mobile, setMobile] = useState(false);
  const [guide, setGuide] = useState(false);

  // VLC (et son Cast) n'existe que sur telephone / tablette.
  useEffect(() => setMobile(isIOS() || isAndroid()), []);

  if (!showCastButton || !mobile || streamUrl === null) return null;

  const cast = () => {
    setGuide(false);
    void useUiSettingsStore.getState().markCastHintSeen();
    launchVlc(streamUrl);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Diffuser sur la TV"
        title="Diffuser sur la TV"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (castHintSeen) cast();
          else setGuide(true);
        }}
        className={cn(
          'relative hit-44 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black/50 text-fg-muted backdrop-blur transition-colors hover:text-fg',
          className,
        )}
      >
        <IconCast className="h-[18px] w-[18px]" />
      </button>
      {guide && <CastGuide title={title} onCast={cast} onClose={() => setGuide(false)} />}
    </>
  );
}

function CastGuide({ title, onCast, onClose }: { title: string; onCast: () => void; onClose: () => void }) {
  const steps: { n: number; text: ReactNode }[] = [
    { n: 1, text: 'La vidéo s’ouvre dans VLC.' },
    {
      n: 2,
      text: (
        <>
          Touche l’icône <IconCast className="mx-0.5 inline h-4 w-4 -translate-y-px" /> de VLC.
        </>
      ),
    },
    { n: 3, text: 'Choisis ta TV (même wifi que le téléphone).' },
  ];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Diffuser sur la TV"
      onClick={onClose}
      className="fixed inset-0 z-[80] flex animate-fade-in items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md animate-modal-rise rounded-t-3xl border-t border-ink-700/70 bg-ink-900 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl shadow-black/60 sm:rounded-3xl sm:border sm:pb-5"
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-ink-600 sm:hidden" />
        <div className="flex items-center gap-3 px-5 pt-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent">
            <IconCast className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold text-fg">Diffuser sur la TV</span>
            {title !== '' && <span className="block truncate text-xs text-fg-muted">{title}</span>}
          </span>
        </div>

        <ol className="mt-4 flex flex-col gap-3 px-5">
          {steps.map((s) => (
            <li key={s.n} className="flex items-start gap-3 text-sm text-fg">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-700 text-xs font-semibold text-fg-muted">
                {s.n}
              </span>
              <span className="pt-0.5 leading-relaxed">{s.text}</span>
            </li>
          ))}
        </ol>

        <p className="mt-4 px-5 text-[11px] leading-relaxed text-fg-faint">
          La lecture s’arrête ici pendant la diffusion (une seule connexion au compte). Pas encore VLC ?{' '}
          <a href={VLC_STORE_URL} target="_blank" rel="noreferrer" className="font-medium text-fg-muted underline">
            Il est gratuit
          </a>
          .
        </p>

        <div className="mt-5 flex gap-2 px-5">
          <button
            type="button"
            onClick={onClose}
            className="h-12 flex-1 rounded-xl bg-ink-700 text-sm font-medium text-fg hover:bg-ink-600"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onCast}
            className="h-12 flex-[2] rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-hover"
          >
            Ouvrir dans VLC
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

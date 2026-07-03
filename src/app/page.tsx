import { Button } from '@/components/ui/Button';

const steps: { n: number; label: string; done?: boolean }[] = [
  { n: 0, label: 'Fondations — Next.js, TS strict, Tailwind, thème', done: true },
  { n: 1, label: 'Base de données Dexie & types' },
  { n: 2, label: 'Auth & session persistante' },
  { n: 3, label: 'Diagnostic Xtream anonymisé' },
  { n: 4, label: 'Synchronisation catalogue' },
  { n: 5, label: 'Live TV' },
  { n: 6, label: 'Lecteur vidéo' },
  { n: 7, label: 'Films VOD' },
  { n: 8, label: 'Séries' },
  { n: 9, label: 'Enrichissement TMDB' },
  { n: 10, label: 'Accueil' },
  { n: 11, label: 'Favoris · Recherche · Réglages' },
  { n: 12, label: 'PWA — manifest & service worker' },
  { n: 13, label: 'Durcissement & performances' },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl animate-fade-in flex-col justify-center px-6 py-16">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
        <span className="text-xs font-medium uppercase tracking-[0.22em] text-fg-faint">
          IPTV PWA · fondations
        </span>
      </div>

      <h1 className="text-4xl font-semibold tracking-tight text-fg">Le squelette est prêt.</h1>
      <p className="mt-3 max-w-lg text-fg-muted">
        Next.js App Router · TypeScript strict · Tailwind · thème sombre premium. Architecture
        validée, mode diagnostic anonymisé inclus.
      </p>

      <ol className="mt-10 space-y-1">
        {steps.map((s) => (
          <li key={s.n} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm">
            <span
              className={
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ' +
                (s.done ? 'bg-accent text-white' : 'bg-ink-700 text-fg-faint')
              }
            >
              {s.done ? '✓' : s.n}
            </span>
            <span className={s.done ? 'text-fg' : 'text-fg-muted'}>
              Étape {s.n} — {s.label}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex flex-wrap gap-3">
        <Button size="lg">Continuer vers l’étape 1</Button>
        <Button size="lg" variant="secondary">
          Voir l’architecture
        </Button>
      </div>
    </main>
  );
}

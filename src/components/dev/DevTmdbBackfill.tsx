'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { runCatalogBackfill } from '@/services/tmdb/tmdbEnrichmentService';
import { ensureAllGenres } from '@/services/tmdb/tmdbGenreService';
import { useAuthStore } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';

/**
 * ⚠️ COMPOSANT TEMPORAIRE (dev) — refonte VOD, validation étape 1.
 * À SUPPRIMER avant la mise en production de l'étape 2.
 *
 * Force une resync du catalogue (repeuple les tables v8 purgées à la montée de
 * version) puis lance le backfill TMDB, avec des console.log explicites de
 * progression pour surveiller le débit (quota proxy = 60 req/min/IP) et repérer
 * d'éventuels 429. Ne modifie aucune logique métier : c'est juste un déclencheur.
 */
export function DevTmdbBackfill() {
  const credentials = useAuthStore((s) => s.credentials);
  const sync = useCatalogStore((s) => s.sync);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string>('');

  const run = async () => {
    if (running) return;
    if (credentials === null) {
      console.warn('[DEV TMDB] Aucune session — connecte-toi d’abord.');
      setStatus('Aucune session active.');
      return;
    }
    setRunning(true);
    const t0 = Date.now();
    try {
      console.log(
        '%c[DEV TMDB] ===== Force resync + backfill TMDB =====',
        'color:#e11d48;font-weight:bold',
      );

      // 1) Resync complète (repeuple les lignes v8 avec tmdbState=0).
      setStatus('Resynchronisation du catalogue…');
      console.time('[DEV TMDB] resync');
      const ok = await sync(credentials, { force: true });
      console.timeEnd('[DEV TMDB] resync');
      console.log('[DEV TMDB] resync terminée — ok =', ok);

      // 2) Table des genres TMDB (id -> nom) — visible dans IndexedDB > tmdb_genres.
      setStatus('Chargement des genres TMDB…');
      await ensureAllGenres();
      console.log('[DEV TMDB] genres TMDB chargés (table tmdb_genres)');

      // 3) Backfill silencieux, avec journalisation du débit par lot.
      setStatus('Backfill TMDB en cours…');
      let lastProcessed = 0;
      let lastTick = Date.now();
      await runCatalogBackfill({
        onProgress: (p) => {
          const now = Date.now();
          const delta = p.processed - lastProcessed;
          const dtSec = Math.max((now - lastTick) / 1000, 0.001);
          const perMin = Math.round((delta / dtSec) * 60);
          const left = p.moviesLeft + p.seriesLeft;
          lastProcessed = p.processed;
          lastTick = now;
          console.log(
            `[DEV TMDB] +${delta} | traités=${p.processed} | reste=${left} ` +
              `(films=${p.moviesLeft}, séries=${p.seriesLeft}) | ~${perMin} items/min | ` +
              `${((now - t0) / 1000).toFixed(0)}s écoulées`,
          );
          setStatus(`Backfill : ${p.processed} traités · ${left} restants`);
        },
      });

      const total = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(
        `%c[DEV TMDB] ===== Terminé en ${total}s — vérifie IndexedDB > xtream_vod_streams =====`,
        'color:#16a34a;font-weight:bold',
      );
      setStatus(`Terminé (${total}s). Inspecte tmdbGenreIds / tmdbYear / tmdbState.`);
    } catch (error) {
      console.error('[DEV TMDB] échec du backfill', error);
      setStatus('Erreur — voir la console.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="rounded-2xl border border-dashed border-rose-500/50 bg-rose-500/[0.06] p-4">
      <h2 className="text-sm font-semibold text-rose-300">🚧 Dev — Backfill TMDB (temporaire)</h2>
      <p className="mt-1 text-xs text-fg-muted">
        Resync forcée du catalogue puis enrichissement TMDB de toute la base. Ouvre la console
        pour suivre le débit (objectif : rester sous 60 req/min, aucun 429).
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={() => void run()} disabled={running || credentials === null}>
          {running ? 'En cours…' : 'Dev: Force TMDB Sync'}
        </Button>
        {status !== '' && <span className="text-xs text-fg-muted">{status}</span>}
      </div>
    </section>
  );
}

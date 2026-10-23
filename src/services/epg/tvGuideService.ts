import * as settingsRepository from '@/db/repositories/settingsRepository';
import { apiUrl } from '@/services/apiBase';
import type { TvSchedule } from '@/types/tvGuide';

/**
 * Programme TV des chaines FR (liste Live) : UN appel `/api/tvguide` pour
 * toute la grille, garde en memoire 30 min et sur l'appareil (affichage
 * immediat au lancement suivant). Jamais bloquant : null si indisponible.
 */

const SETTING_KEY = 'tvSchedule';
const FRESH_MS = 30 * 60_000;
/** Au-dela, un guide memorise ne sert plus (programme depasse). */
const MAX_AGE_MS = 20 * 3_600_000;

let memory: TvSchedule | null = null;
let inflight: Promise<TvSchedule | null> | null = null;

function usable(s: TvSchedule | null | undefined): s is TvSchedule {
  return s != null && Date.now() - s.fetchedAt < MAX_AGE_MS;
}

/** Dernier guide connu (memoire puis appareil), sans reseau. */
export async function getCachedTvSchedule(): Promise<TvSchedule | null> {
  if (usable(memory)) return memory;
  const stored = await settingsRepository.getSetting<TvSchedule>(SETTING_KEY).catch(() => undefined);
  if (usable(stored)) memory = stored;
  return usable(memory) ? memory : null;
}

/**
 * Guide a jour : reseau si le guide connu a plus de 30 min. `loading` : le
 * serveur construit le guide (demarrage a froid) — reessayer un peu plus tard.
 */
export async function refreshTvSchedule(): Promise<{ schedule: TvSchedule | null; loading: boolean }> {
  const cached = await getCachedTvSchedule();
  if (cached !== null && Date.now() - cached.fetchedAt < FRESH_MS) return { schedule: cached, loading: false };
  let loading = false;
  inflight ??= (async () => {
    try {
      const res = await fetch(apiUrl('/api/tvguide'));
      if (!res.ok) return null;
      const body = (await res.json()) as Partial<TvSchedule> & { ok?: boolean; loading?: boolean };
      if (body.ok !== true || body.channels === undefined || body.fetchedAt === undefined) {
        loading = body.loading === true;
        return null;
      }
      const schedule: TvSchedule = { fetchedAt: body.fetchedAt, channels: body.channels };
      memory = schedule;
      void settingsRepository.setSetting(SETTING_KEY, schedule).catch(() => undefined);
      return schedule;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  const fresh = await inflight;
  return { schedule: fresh ?? cached, loading };
}

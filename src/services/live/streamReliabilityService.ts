import * as settingsRepository from '@/db/repositories/settingsRepository';
import type { StreamStat } from '@/utils/versionRanking';

/**
 * Fiabilite APPRISE des flux Live (succes / echecs definitifs par version),
 * stockee sur l'appareil uniquement (reglage local, jamais envoye). Sert a
 * lancer d'abord la version qui marche (utils/versionRanking).
 */

const SETTING_KEY = 'liveReliability';
/** Borne : les flux les moins recemment vus sont oublies au-dela. */
const MAX_ENTRIES = 600;
const PERSIST_DELAY_MS = 2000;

const stats = new Map<string, StreamStat>();
const listeners = new Set<() => void>();
let loaded: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let version = 0;

function notify(): void {
  version += 1;
  for (const listener of listeners) listener();
}

/** Charge l'historique (une fois). */
export function loadReliability(): Promise<void> {
  loaded ??= settingsRepository
    .getSetting<Record<string, StreamStat>>(SETTING_KEY)
    .then((saved) => {
      if (saved == null) return;
      for (const [id, stat] of Object.entries(saved)) if (!stats.has(id)) stats.set(id, stat);
      notify();
    })
    .catch(() => undefined);
  return loaded;
}

function lastSeen(s: StreamStat): number {
  return Math.max(s.lastOkAt ?? 0, s.lastFailAt ?? 0);
}

function schedulePersist(): void {
  if (persistTimer !== null) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const entries = [...stats.entries()].sort((a, b) => lastSeen(b[1]) - lastSeen(a[1])).slice(0, MAX_ENTRIES);
    void settingsRepository.setSetting(SETTING_KEY, Object.fromEntries(entries)).catch(() => undefined);
  }, PERSIST_DELAY_MS);
}

function update(id: string, change: (s: StreamStat) => StreamStat): void {
  const current = stats.get(id) ?? { ok: 0, fail: 0, lastOkAt: null, lastFailAt: null };
  stats.set(id, change(current));
  notify();
  schedulePersist();
}

/** Le flux a reellement demarre (image a l'ecran). */
export function recordStreamSuccess(id: string): void {
  update(id, (s) => ({ ...s, ok: s.ok + 1, lastOkAt: Date.now() }));
}

/** Echec DEFINITIF (apres les relances automatiques du lecteur). */
export function recordStreamFailure(id: string): void {
  update(id, (s) => ({ ...s, fail: s.fail + 1, lastFailAt: Date.now() }));
}

export function streamStat(id: string): StreamStat | undefined {
  return stats.get(id);
}

export function subscribeReliability(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reliabilityVersion(): number {
  return version;
}

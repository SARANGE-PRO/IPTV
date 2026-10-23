import { unstable_cache } from 'next/cache';
import { COMPETITION_BY_CODE } from '@/config/footballCompetitions';
import type { FootballFeed, FootballMatch, GuideStatus } from '@/types/football';
import { addProbableBroadcasts, attachBroadcasts } from './broadcasts';
import { fetchEspnMatches } from './espn';
import { fetchFootballDataMatches, footballDataAvailable } from './footballData';
import { fetchFootballGuide, type GuideData } from './tvGuide';

/**
 * Orchestration du flux foot (SERVEUR) : matchs (ESPN, secours football-data)
 * + diffusions FR (guide TV, droits appris, table 2026-27).
 *
 * Guide : analyse lourde (~5-10 s) -> cache serveur 3 h (unstable_cache,
 * persistant entre invocations sur Vercel). Au demarrage a froid, la reponse
 * n'attend pas plus de GUIDE_WAIT_MS : les matchs partent avec les chaines
 * « probables », le guide finit de se construire en tache de fond (`after`),
 * et la requete suivante a les chaines exactes.
 */

/** Fenetre servie : 36 h dans le passe (resultats d'hier) a 9 jours. */
const PAST_MS = 36 * 3_600_000;
const FUTURE_MS = 9 * 86_400_000;
const GUIDE_REVALIDATE_S = 3 * 3600;
const GUIDE_WAIT_MS = 7_000;
/** Apres un echec de telechargement, on ne reessaie pas avant 10 min (memoire d'instance). */
const GUIDE_FAILURE_BACKOFF_MS = 10 * 60_000;

const cachedGuide = unstable_cache(
  async (): Promise<GuideData> => {
    const guide = await fetchFootballGuide();
    // Un echec ne doit PAS etre mis en cache 3 h : on jette (non cache).
    if (!guide.ok) throw new Error('guide unavailable');
    return guide;
  },
  ['fr-tv-guide-v2'],
  { revalidate: GUIDE_REVALIDATE_S },
);

let lastFailureAt = 0;
let inFlight: Promise<GuideData | null> | null = null;

/** Guide (depuis le cache serveur, sinon construit). null si indisponible. */
export function loadGuide(): Promise<GuideData | null> {
  if (Date.now() - lastFailureAt < GUIDE_FAILURE_BACKOFF_MS) return Promise.resolve(null);
  if (inFlight !== null) return inFlight;
  inFlight = cachedGuide()
    .catch(() => {
      lastFailureAt = Date.now();
      return null;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

async function loadCompetition(code: string, from: number, to: number): Promise<FootballMatch[] | null> {
  const espn = await fetchEspnMatches(code, from, to);
  if (espn !== null) return espn;
  if (footballDataAvailable(code)) return fetchFootballDataMatches(code, from, to);
  return null;
}

export interface FeedOptions {
  codes: string[];
  /** Appele avec la promesse du guide si elle n'a pas abouti a temps (`after`). */
  onPendingGuide?: (pending: Promise<unknown>) => void;
}

export async function buildFootballFeed({ codes, onPendingGuide }: FeedOptions): Promise<FootballFeed> {
  const now = Date.now();
  const from = now - PAST_MS;
  const to = now + FUTURE_MS;
  const valid = [...new Set(codes)].filter((c) => COMPETITION_BY_CODE.has(c));

  const guidePromise = loadGuide();
  const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), GUIDE_WAIT_MS));

  const [results, guideOrTimeout] = await Promise.all([
    Promise.all(valid.map(async (code) => ({ code, matches: await loadCompetition(code, from, to) }))),
    Promise.race([guidePromise, timeout]),
  ]);

  let guide: GuideData | null = null;
  let status: GuideStatus;
  if (guideOrTimeout === 'timeout') {
    status = 'loading';
    onPendingGuide?.(guidePromise);
  } else if (guideOrTimeout === null) {
    status = 'unavailable';
  } else {
    guide = guideOrTimeout;
    status = 'ready';
  }

  const failed = results.filter((r) => r.matches === null).map((r) => r.code);
  const all = results.flatMap((r) => r.matches ?? []).sort((a, b) => a.start - b.start);
  const attached = guide !== null ? attachBroadcasts(all, guide.programmes) : { matches: all, learned: new Map() };
  return {
    matches: addProbableBroadcasts(attached.matches, attached.learned),
    guide: status,
    guideAt: guide?.fetchedAt ?? null,
    failed,
  };
}

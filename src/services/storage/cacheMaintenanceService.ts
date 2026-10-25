import { CACHE_TTL } from '@/config/constants';
import * as tmdbRepository from '@/db/repositories/tmdbRepository';
import { purgeEpgOlderThan } from '@/services/epg/epgService';

/**
 * Menage des caches locaux perimes. Sur iOS le quota est PARTAGE avec le
 * catalogue : un cache qui gonfle sans fin rapproche l'eviction de toute la
 * base (donc une resynchro complete).
 *
 * - TMDB : au-dela de son TTL une entree serait de toute facon redemandee au
 *   reseau -> la supprimer ne coute aucune requete de plus.
 * - EPG : programmes de plus de 48 h = passes, inutiles meme hors ligne.
 */
const EPG_MAX_AGE_MS = 48 * 60 * 60 * 1000;

export async function purgeStaleCaches(now: number = Date.now()): Promise<void> {
  await Promise.allSettled([
    tmdbRepository.purgeTmdbOlderThan(now - CACHE_TTL.tmdb),
    purgeEpgOlderThan(now - EPG_MAX_AGE_MS),
  ]);
}

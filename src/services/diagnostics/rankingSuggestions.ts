import type { RankingSuggestion } from '@/types/advancedDiagnostics';

/**
 * Suggestions de rails d'accueil facon Netflix — RECOMMANDATIONS uniquement,
 * aucune implementation ici. `dataAvailable` indique si le signal existe deja.
 */

export interface RankingSignals {
  hasFavorites: boolean;
  hasPlaybackHistory: boolean;
  hasFrenchMovies: boolean;
  hasFrenchSeries: boolean;
  hasRecentDates: boolean;
  tmdbConfigured: boolean;
}

export function buildRankingSuggestions(signals: RankingSignals): RankingSuggestion[] {
  return [
    { rail: 'Continuer à regarder', rationale: 'Reprise depuis playback_history (position non terminée).', dataAvailable: signals.hasPlaybackHistory },
    { rail: 'Chaînes FR favorites', rationale: 'favorites (type live) filtrés sur isFrench.', dataAvailable: signals.hasFavorites },
    { rail: 'Films FR à la une', rationale: 'xtream_vod_streams où isFrench=1, triés par note TMDB si disponible.', dataAvailable: signals.hasFrenchMovies },
    { rail: 'Films récemment ajoutés', rationale: 'Tri par addedAt décroissant (index existant).', dataAvailable: signals.hasRecentDates },
    { rail: 'Séries FR', rationale: 'xtream_series où isFrench=1.', dataAvailable: signals.hasFrenchSeries },
    { rail: 'Populaires (TMDB)', rationale: 'Enrichissement TMDB à la demande, tri par popularité/vote.', dataAvailable: signals.tmdbConfigured },
    { rail: 'Sports en direct', rationale: 'xtream_live_streams où theme=sport (index v3).', dataAvailable: true },
    { rail: 'Enfants', rationale: 'theme=kids (Live) + catégories enfants (VOD/Séries).', dataAvailable: true },
  ];
}

/** Recommandation technique pour un "Top 10" personnel (non implemente). */
export const TOP10_RECOMMENDATION =
  "Top 10 personnel (approximation, pas le vrai Top 10 Netflix) : calculer un score local par titre = " +
  "0.4·tendance_TMDB (si configuré) + 0.25·récence_ajout (addedAt) + 0.2·présence_favoris + 0.15·historique_lecture, " +
  "restreint au catalogue FR, recalculé côté client une fois par jour et mis en cache dans Dexie. " +
  "Ne pas appeler TMDB en masse : n'enrichir que les ~40 candidats les mieux classés localement.";

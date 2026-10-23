import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { isNetworkConstrained, subscribeNetworkQuality } from '@/services/player/networkQualityService';
import {
  loadReliability,
  reliabilityVersion,
  streamStat,
  subscribeReliability,
} from '@/services/live/streamReliabilityService';
import { rankVersions, type RankableVersion } from '@/utils/versionRanking';

/**
 * Classe les versions d'une chaine (fiabilite apprise + reseau). `rank` change
 * d'identite quand l'historique ou le reseau changent : les listes se remettent
 * a jour toutes seules.
 */
export function useVersionRanking(): {
  rank: <T extends RankableVersion>(versions: readonly T[]) => T[];
  constrained: boolean;
} {
  useEffect(() => {
    void loadReliability();
  }, []);
  const revision = useSyncExternalStore(subscribeReliability, reliabilityVersion, () => 0);
  const constrained = useSyncExternalStore(subscribeNetworkQuality, isNetworkConstrained, () => false);
  // Horodatage fige par revision (pas de Date.now() a chaque rendu).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => setNow(Date.now()), [revision, constrained]);

  const rank = useCallback(
    <T extends RankableVersion>(versions: readonly T[]) =>
      rankVersions(versions, streamStat, { constrained, now }),
    // `revision` : nouvelles stats (streamStat lit l'etat courant).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [constrained, now, revision],
  );
  return { rank, constrained };
}

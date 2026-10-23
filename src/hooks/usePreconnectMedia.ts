import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { mediaOrigin } from '@/utils/secureUrl';

/**
 * Prepare la connexion (DNS + TCP + TLS) vers le serveur de flux des la
 * connexion a l'app : le 1er lancement d'une chaine gagne ~100-300 ms. Aucune
 * requete video n'est faite — compte a connexion unique sans risque.
 * Deux liens : <video> charge sans CORS, hls.js avec (connexions distinctes).
 */
export function usePreconnectMedia(): void {
  const serverUrl = useAuthStore((s) => s.credentials?.serverUrl ?? null);

  useEffect(() => {
    const origin = mediaOrigin(serverUrl);
    if (origin === null || origin === window.location.origin) return;
    const links = [
      { rel: 'preconnect', crossOrigin: null },
      { rel: 'preconnect', crossOrigin: 'anonymous' },
      { rel: 'dns-prefetch', crossOrigin: null },
    ].map(({ rel, crossOrigin }) => {
      const link = document.createElement('link');
      link.rel = rel;
      link.href = origin;
      if (crossOrigin !== null) link.crossOrigin = crossOrigin;
      document.head.appendChild(link);
      return link;
    });
    return () => {
      for (const link of links) link.remove();
    };
  }, [serverUrl]);
}

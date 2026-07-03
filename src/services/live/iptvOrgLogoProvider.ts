/**
 * Fallback logo IPTV-Org — POINT D'EXTENSION conservateur.
 *
 * Le dataset iptv-org (`https://iptv-org.github.io/api/logos.json`) est
 * volumineux ; le charger cote client au scroll fragiliserait l'app (perf,
 * fiabilite mobile). On garde donc ce provider desactive par defaut : il ne
 * fait AUCUN reseau et renvoie null. Il pourra plus tard etre branche sur une
 * carte curatee (cle canonique -> URL logo stable) ou un index cache Dexie
 * charge une seule fois, uniquement pour les chaines FR principales.
 *
 * Tant qu'il renvoie null, la chaine de resolution passe directement au
 * fallback Clearbit cible puis au monogramme — l'app reste 100 % fonctionnelle
 * sans dependance externe.
 */

// Carte curatee optionnelle (vide par defaut — a etendre prudemment).
const CURATED: Record<string, string> = {};

export function iptvOrgLogo(canonicalKey: string): string | null {
  return CURATED[canonicalKey] ?? null;
}

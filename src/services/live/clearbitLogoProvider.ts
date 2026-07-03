/**
 * Fallback logo Clearbit — CIBLE et maintenable : uniquement pour les grandes
 * chaines FR dont le domaine est connu. Aucune recherche automatique hasardeuse.
 * C'est une simple URL d'image ; si Clearbit est indisponible, le <img> tombe
 * en erreur et le monogramme prend le relais (l'app n'en depend jamais).
 */

// Cle canonique (voir channelNormalizer.canonicalChannelKey) -> domaine fiable.
const DOMAINS: Record<string, string> = {
  tf1: 'tf1.fr',
  tmc: 'tf1.fr',
  tfx: 'tf1.fr',
  'tf1 series films': 'tf1.fr',
  lci: 'lci.fr',
  'france 2': 'france.tv',
  'france 3': 'france.tv',
  'france 4': 'france.tv',
  'france 5': 'france.tv',
  franceinfo: 'francetvinfo.fr',
  'france 24': 'france24.com',
  m6: 'm6.fr',
  w9: 'w9.fr',
  '6ter': '6ter.fr',
  gulli: 'gulli.fr',
  arte: 'arte.tv',
  'canal plus': 'canalplus.com',
  'canal plus sport': 'canalplus.com',
  'canal plus foot': 'canalplus.com',
  'canal plus cinema': 'canalplus.com',
  c8: 'c8.fr',
  cstar: 'cstar.fr',
  cnews: 'cnews.fr',
  bfmtv: 'bfmtv.com',
  rmc: 'rmc.fr',
  'rmc decouverte': 'rmcbfmplay.com',
  'rmc story': 'rmcbfmplay.com',
  'bein sports': 'beinsports.com',
  eurosport: 'eurosport.fr',
  lequipe: 'lequipe.fr',
  nrj12: 'nrj12.fr',
  'cherie 25': 'cherie25.fr',
};

/** Retire un numero de declinaison en fin de nom ("bein sports 1" -> "bein sports"). */
function baseKey(key: string): string {
  return key.replace(/\s+\d+$/, '').trim();
}

/** URL de logo Clearbit si le domaine de la chaine est connu, sinon null. */
export function clearbitLogo(canonicalKey: string): string | null {
  const domain = DOMAINS[canonicalKey] ?? DOMAINS[baseKey(canonicalKey)];
  return domain !== undefined ? `https://logo.clearbit.com/${domain}` : null;
}

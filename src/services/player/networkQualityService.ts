/**
 * Qualite reseau PERCUE par le lecteur (en memoire, le temps de la session).
 * iOS n'expose pas le debit (Network Information API absente de Safari) :
 * on se fie a ce que vit la lecture — pauses sur tampon vide, gels relances.
 * Deux incidents en 10 min = reseau « contraint » : les versions HD passent
 * devant FHD/4K et la page Live propose de basculer.
 * Ailleurs (Chrome/Android), `navigator.connection` complete le signal.
 */

const WINDOW_MS = 10 * 60_000;
const INCIDENTS_FOR_CONSTRAINED = 2;

const incidents: number[] = [];
const listeners = new Set<() => void>();
let constrained = false;

interface NetworkInformationLike {
  effectiveType?: string;
  downlink?: number;
  saveData?: boolean;
}

function connectionSaysSlow(): boolean {
  if (typeof navigator === 'undefined') return false;
  const c = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  if (c === undefined) return false;
  if (c.saveData === true) return true;
  if (c.effectiveType !== undefined && /(^|-)2g$|^3g$/.test(c.effectiveType)) return true;
  return c.downlink !== undefined && c.downlink > 0 && c.downlink < 3;
}

function evaluate(): void {
  const now = Date.now();
  while (incidents.length > 0 && now - incidents[0]! > WINDOW_MS) incidents.shift();
  const next = incidents.length >= INCIDENTS_FOR_CONSTRAINED || connectionSaysSlow();
  if (next === constrained) return;
  constrained = next;
  for (const listener of listeners) listener();
}

/** Le tampon s'est vide (pause subie, gel relance) : signe de reseau faible. */
export function noteStarvation(): void {
  incidents.push(Date.now());
  evaluate();
}

export function isNetworkConstrained(): boolean {
  evaluate();
  return constrained;
}

export function subscribeNetworkQuality(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

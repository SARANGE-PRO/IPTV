import * as catalogRepository from '@/db/repositories/catalogRepository';
import { findChannelVersions } from '@/services/live/channelGroupingService';
import { cleanChannelDisplay, isSeparatorOrEvent } from '@/services/live/channelNormalizer';
import { ensureFrenchLineup, getLineupEntries, getLineupGroups, getLineupVersions } from '@/services/live/frenchLineupService';
import type { ChannelVersion } from '@/types/liveGrouping';
import type { LiveChannel } from '@/types/models';
import { loadReliability, streamStat } from '@/services/live/streamReliabilityService';
import { isNetworkConstrained } from '@/services/player/networkQualityService';
import type { LineupGroup, LiveLineupEntry } from '@/types/liveLineup';
import { rankVersionLogos } from '@/utils/channelLogos';
import { rankVersions } from '@/utils/versionRanking';

/**
 * Zapping Live : chaines voisines JOUABLES et versions (HD/FHD/4K…) d'une
 * chaine, sans relire des milliers de lignes Dexie a chaque changement de
 * chaine (sur iPhone, ca retardait le demarrage du flux suivant).
 */

/** Meme borne que les vues FR de la page Live : jamais les 55k en memoire. */
export const FRENCH_POOL_CAP = 4000;
/** Cache court : le pool ne change qu'a la synchro (qui l'invalide aussi). */
const POOL_TTL_MS = 3 * 60_000;
/** Chaines lues de chaque cote pour sauter separateurs et evenements vides. */
const NEIGHBOR_WINDOW = 12;

let pool: { at: number; rows: Promise<LiveChannel[]> } | null = null;

/** Pool FR borne, partage par la liste Live et le lecteur. */
export function getFrenchLivePool(): Promise<LiveChannel[]> {
  const now = Date.now();
  if (pool === null || now - pool.at > POOL_TTL_MS) {
    const rows = catalogRepository.getLiveChannelsPage({ kind: 'french' }, 0, FRENCH_POOL_CAP);
    const entry = { at: now, rows };
    pool = entry;
    // Un echec de lecture (stockage) ne doit pas rester en cache.
    rows.catch(() => {
      if (pool === entry) pool = null;
    });
  }
  return pool.rows;
}

/** Le catalogue Live vient de changer (synchro) : le pool est perime. */
export function invalidateLivePool(): void {
  pool = null;
}

/**
 * Versions de la chaine (FR uniquement : l'international reste « en vrac »).
 * Source : la grille FR (toutes les versions, sans plafond) ; repli sur le
 * pool borne tant que la grille n'est pas construite.
 */
export async function getChannelVersions(channel: LiveChannel): Promise<ChannelVersion[]> {
  if (channel.isFrench !== 1) return [];
  const lineup = await getLineupVersions(channel.id).catch(() => []);
  if (lineup.length > 0) {
    const rows = await catalogRepository.getLiveChannelsByIds(lineup.map((v) => v.id));
    const byId = new Map(rows.map((c) => [c.id, c] as const));
    return lineup.flatMap((v) => {
      const row = byId.get(v.id);
      return row !== undefined ? [{ channel: row, quality: v.quality, label: v.qualityLabel, score: v.qualityScore }] : [];
    });
  }
  return findChannelVersions(await getFrenchLivePool(), channel);
}

// --- Contexte de zapping ------------------------------------------------------

/** Liste parcourue par ⏮ ⏭ : la vue Live d'ou la chaine a ete lancee. */
export interface ZapContext {
  /** « TNT », « Sport », nom d'onglet… (affiche sous le lecteur). */
  label: string;
  /** Chaines dans l'ordre de la vue ; `groupKey` = retrouver une autre version. */
  entries: { id: string; groupKey: string | null }[];
}

let zapContext: ZapContext | null = null;

/** Appele au tap sur une chaine de la page Live (null = pas de contexte). */
export function setZapContext(context: ZapContext | null): void {
  zapContext = context !== null && context.entries.length > 1 ? context : null;
}

export function getZapContextLabel(): string | null {
  return zapContext?.label ?? null;
}

/** Chaine de la liste laterale (iPad) : nom, numero, logos, version a lancer. */
export interface ZapListItem {
  id: string;
  groupKey: string | null;
  name: string;
  lcn: number | null;
  logos: string[];
  isFrench: boolean;
}

/**
 * Liste parcourue par le zapping, prete a afficher : le contexte d'ou l'on
 * vient (vue Live, onglet…) sinon toute la grille FR. Version lancee = la
 * mieux classee (fiabilite apprise, reseau) pour les chaines de la grille.
 */
export async function getZapList(): Promise<{ label: string; items: ZapListItem[] }> {
  await ensureFrenchLineup().catch(() => undefined);
  await loadReliability();
  const groups = await getLineupGroups().catch(() => [] as LineupGroup[]);
  const byKey = new Map(groups.map((g) => [g.key, g] as const));
  const constrained = isNetworkConstrained();
  const now = Date.now();
  const fromGroup = (g: LineupGroup, id?: string): ZapListItem => ({
    id: id ?? rankVersions(g.versions, streamStat, { constrained, now })[0]!.id,
    groupKey: g.key,
    name: g.name,
    lcn: g.lcn,
    logos: rankVersionLogos(g.versions),
    isFrench: g.country === null,
  });
  const context = zapContext;
  if (context === null) return { label: 'Chaînes françaises', items: groups.map((g) => fromGroup(g)) };

  const loose = context.entries.filter((e) => e.groupKey === null || !byKey.has(e.groupKey)).map((e) => e.id);
  const rows = loose.length > 0 ? await catalogRepository.getLiveChannelsByIds(loose) : [];
  const rowById = new Map(rows.map((c) => [c.id, c] as const));
  const items = context.entries.flatMap((e): ZapListItem[] => {
    const group = e.groupKey !== null ? byKey.get(e.groupKey) : undefined;
    if (group !== undefined) return [fromGroup(group, e.id)];
    const row = rowById.get(e.id);
    if (row === undefined) return [];
    return [
      {
        id: row.id,
        groupKey: null,
        name: cleanChannelDisplay(row.name) || row.name,
        lcn: null,
        logos: row.logoUrl !== null ? [row.logoUrl] : [],
        isFrench: row.isFrench === 1,
      },
    ];
  });
  return { label: context.label, items };
}

/** `label` : liste parcourue (« TNT », nom d'onglet…), null = categorie fournisseur. */
type Neighbors = { previous: LiveChannel | null; next: LiveChannel | null; label: string | null };

async function neighborsByIds(
  previousId: string | null,
  nextId: string | null,
  label: string,
): Promise<Neighbors | null> {
  const ids = [previousId, nextId].filter((id): id is string => id !== null);
  if (ids.length === 0) return null;
  const byId = new Map((await catalogRepository.getLiveChannelsByIds(ids)).map((c) => [c.id, c] as const));
  const previous = previousId !== null ? (byId.get(previousId) ?? null) : null;
  const next = nextId !== null ? (byId.get(nextId) ?? null) : null;
  return previous === null && next === null ? null : { previous, next, label };
}

/** Voisins dans le contexte de zapping (la version jouee peut differer). */
async function contextNeighbors(channel: LiveChannel): Promise<Neighbors | null> {
  const context = zapContext;
  if (context === null) return null;
  let index = context.entries.findIndex((e) => e.id === channel.id);
  if (index === -1) {
    const [entry] = await getLineupEntries([channel.id]);
    if (entry === undefined) return null;
    index = context.entries.findIndex((e) => e.groupKey === entry.groupKey);
    if (index === -1) return null;
  }
  const n = context.entries.length;
  return neighborsByIds(context.entries[(index - 1 + n) % n]!.id, context.entries[(index + 1) % n]!.id, context.label);
}

/** Voisins dans la grille FR : TF1 -> France 2 -> France 3… comme une telecommande. */
async function lineupNeighbors(channel: LiveChannel): Promise<Neighbors | null> {
  if (channel.isFrench !== 1) return null;
  await ensureFrenchLineup();
  const [entry] = await getLineupEntries([channel.id]);
  if (entry === undefined) return null;
  const groups = await getLineupGroups();
  const index = groups.findIndex((g) => g.key === entry.groupKey);
  if (index === -1 || groups.length < 2) return null;
  const n = groups.length;
  await loadReliability();
  const best = (versions: LiveLineupEntry[]) =>
    rankVersions(versions, streamStat, { constrained: isNetworkConstrained(), now: Date.now() })[0]!.id;
  return neighborsByIds(best(groups[(index - 1 + n) % n]!.versions), best(groups[(index + 1) % n]!.versions), 'Chaînes françaises');
}

function playable(candidate: LiveChannel, currentId: string): boolean {
  return candidate.id !== currentId && !isSeparatorOrEvent(candidate.name);
}

/**
 * Chaine precedente / suivante : dans la vue Live d'ou l'on vient (contexte),
 * sinon dans la grille FR, sinon dans la categorie fournisseur — en sautant
 * les separateurs (« ----- FRANCE ----- ») et les evenements vides ; en bout
 * de liste on reboucle, comme une telecommande.
 */
export async function getZapNeighbors(channel: LiveChannel): Promise<Neighbors> {
  const fromContext = await contextNeighbors(channel).catch(() => null);
  if (fromContext !== null) return fromContext;
  const fromLineup = await lineupNeighbors(channel).catch(() => null);
  if (fromLineup !== null) return fromLineup;
  return categoryNeighbors(channel);
}

async function categoryNeighbors(channel: LiveChannel): Promise<Neighbors> {
  const { before, after } = await catalogRepository.getLiveChannelsAround(
    channel.categoryId,
    channel.sortOrder,
    NEIGHBOR_WINDOW,
  );
  let previous = before.find((c) => playable(c, channel.id)) ?? null;
  let next = after.find((c) => playable(c, channel.id)) ?? null;
  if (previous === null) {
    const tail = await catalogRepository.getLiveCategoryEdge(channel.categoryId, 'end', NEIGHBOR_WINDOW);
    previous = tail.find((c) => playable(c, channel.id)) ?? null;
  }
  if (next === null) {
    const head = await catalogRepository.getLiveCategoryEdge(channel.categoryId, 'start', NEIGHBOR_WINDOW);
    next = head.find((c) => playable(c, channel.id)) ?? null;
  }
  return { previous, next, label: null };
}

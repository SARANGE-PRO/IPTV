import { isGatewayConfigured, isGatewayHealthy } from '@/services/player/mediaGatewayService';
import { classifyContainer } from '@/utils/playerSupport';

/**
 * Comment lire un VOD / episode sur l'appareil courant (decision partagee par
 * `usePlaybackPlan` et l'enchainement d'episodes du mini-lecteur) :
 *  - 'direct'     : conteneur natif (MP4/MOV) -> lecture in-app sans passerelle.
 *  - 'direct-mkv' : MKV sur page HTTP (coquille infra/http-shell) avec
 *                   MediaSource dispo -> remux in-app, sans passerelle.
 *  - 'gateway'    : conteneur non-natif (MKV/AVI) MAIS passerelle joignable
 *                   -> transcodage in-app.
 *  - 'vlc-only'   : conteneur non-natif ET pas de passerelle joignable
 *                   -> seul VLC (natif) peut le lire.
 */
export type ResolvedPlaybackMode = 'direct' | 'direct-mkv' | 'gateway' | 'vlc-only';

/** Page HTTP (pas de mixed-content) + MediaSource : le remux MKV direct est tentable. */
function canDirectMkv(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.protocol === 'https:') return false;
  const w = window as unknown as Record<string, unknown>;
  return 'ManagedMediaSource' in w || 'MediaSource' in w;
}

/**
 * Decision IMMEDIATE quand elle ne depend pas de la passerelle ; 'probe' :
 * il faut sonder la passerelle (isGatewayHealthy) pour trancher.
 */
export function immediatePlaybackMode(
  containerExtension: string | null | undefined,
  directMkvAllowed: boolean,
): ResolvedPlaybackMode | 'probe' {
  // Conteneur natif (ou inconnu -> tentative directe) : lisible in-app.
  if (classifyContainer(containerExtension) !== 'transcode') return 'direct';
  const isMkv = (containerExtension ?? '').trim().toLowerCase() === 'mkv';
  // MKV + coquille HTTP + MediaSource : remux direct, sans sonde passerelle.
  if (isMkv && directMkvAllowed && canDirectMkv()) return 'direct-mkv';
  // Non-natif sans passerelle configuree : inutile de sonder, VLC direct.
  if (!isGatewayConfigured()) return 'vlc-only';
  return 'probe';
}

/** Decision complete (sonde la passerelle si besoin). */
export async function resolvePlaybackMode(
  containerExtension: string | null | undefined,
  directMkvAllowed = true,
): Promise<ResolvedPlaybackMode> {
  const mode = immediatePlaybackMode(containerExtension, directMkvAllowed);
  if (mode !== 'probe') return mode;
  return (await isGatewayHealthy()) ? 'gateway' : 'vlc-only';
}

/** Champs du lecteur qui dependent du plan de lecture (film, episode, enchainement). */
export interface PlanSourceProps {
  transcode: boolean;
  directMkv: boolean;
  preferHls: boolean;
  startAt: number;
  startOffset: number;
}

/**
 * Traduit un plan en props de lecteur. Passerelle + HLS natif (Safari) : le
 * flux transcode n'est pas seekable -> la reprise passe par un OFFSET serveur
 * (`startOffset`) ; partout ailleurs, par un seek (`startAt`).
 */
export function planSourceProps(mode: ResolvedPlaybackMode, from: number, nativeHls: boolean): PlanSourceProps {
  const gatewayHls = mode === 'gateway' && nativeHls;
  return {
    transcode: mode === 'gateway',
    directMkv: mode === 'direct-mkv',
    preferHls: gatewayHls,
    startAt: gatewayHls ? 0 : from,
    startOffset: gatewayHls ? from : 0,
  };
}

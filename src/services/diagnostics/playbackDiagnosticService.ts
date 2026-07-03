import { isGatewayConfigured, isGatewayHealthy } from '@/services/player/mediaGatewayService';
import { supportsNativeHls } from '@/utils/playerSupport';
import { redactText } from '@/utils/redaction';
import { assertReportSafe } from '@/utils/sensitiveDataGuards';
import type {
  PlaybackContext,
  PlaybackDiagnostic,
  PlaybackFailure,
} from '@/types/playbackDiagnostics';

/**
 * Construit et met en forme un diagnostic de lecture PRECIS et ANONYMISE.
 * Aucune URL de flux, aucun identifiant : uniquement le conteneur, la cause
 * mappee, l'etat passerelle et l'environnement.
 */

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mm = window.matchMedia?.('(display-mode: standalone)').matches === true;
  // iOS expose navigator.standalone (hors typings standard).
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return mm || iosStandalone;
}

/** Resume l'User-Agent en OS + navigateur (rapport "anonymise" : on evite le
 *  fingerprint UA complet). Best-effort, suffit au diagnostic. */
function summarizeUa(ua: string): string {
  const os = /iphone|ipad|ipod/i.test(ua)
    ? 'iOS'
    : /android/i.test(ua)
      ? 'Android'
      : /mac os x|macintosh/i.test(ua)
        ? 'macOS'
        : /windows/i.test(ua)
          ? 'Windows'
          : /linux/i.test(ua)
            ? 'Linux'
            : 'inconnu';
  const engine = /edg/i.test(ua)
    ? 'Edge'
    : /crios|chrome|chromium/i.test(ua)
      ? 'Chrome'
      : /fxios|firefox/i.test(ua)
        ? 'Firefox'
        : /safari/i.test(ua)
          ? 'Safari'
          : 'inconnu';
  const iosMajor = ua.match(/OS (\d+)_/)?.[1];
  return `${os}${iosMajor !== undefined ? ` ${iosMajor}` : ''} · ${engine}`;
}

function detectConnection(): string | null {
  if (typeof navigator === 'undefined') return null;
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
  return conn?.effectiveType ?? null;
}

function via(context: PlaybackContext): PlaybackDiagnostic['content']['via'] {
  if (context.transcode) return 'gateway';
  const ext = context.container?.toLowerCase() ?? '';
  if (ext === 'm3u8' || context.type === 'live') return 'hls-natif';
  return 'direct';
}

export async function buildPlaybackDiagnostic(
  failure: PlaybackFailure,
  context: PlaybackContext,
): Promise<PlaybackDiagnostic> {
  const configured = isGatewayConfigured();
  let healthy: boolean | null = null;
  if (configured) {
    try {
      healthy = await isGatewayHealthy();
    } catch {
      healthy = null;
    }
  }
  return {
    generatedAt: Date.now(),
    content: { type: context.type, container: context.container, via: via(context) },
    failure,
    env: {
      userAgent: typeof navigator !== 'undefined' ? summarizeUa(navigator.userAgent) : 'inconnu',
      standalone: detectStandalone(),
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      connection: detectConnection(),
      nativeHls: supportsNativeHls(),
    },
    gateway: { configured, healthy },
  };
}

/** Cause probable en langage clair, par code (+ signaux http/media). */
function likelyCause(f: PlaybackFailure): string {
  if (f.httpStatus === 458 || f.httpStatus === 429) {
    return 'Limite de connexions du compte atteinte (trop de flux simultanes). Ferme les autres lectures et attends 1-2 min.';
  }
  if (f.httpStatus === 456) {
    return 'IP bloquee par le CDN du fournisseur (frequent depuis un datacenter). La passerelle (IP residentielle) contourne ca.';
  }
  if (f.httpStatus === 403) return 'Acces refuse par le serveur (identifiants, autorisation ou hotlink).';
  if (f.httpStatus === 404) return 'Flux introuvable cote serveur (chaine/film retire ou identifiant invalide).';
  if (f.httpStatus === 401) return 'Non authentifie (identifiants refuses).';
  switch (f.code) {
    case 'invalid_url':
      return 'URL de flux invalide (probleme de construction cote app).';
    case 'unsupported_container':
      return 'Conteneur non decodable par le navigateur (MKV/AVI...). Passe par la passerelle ou VLC.';
    case 'load_timeout':
      return 'Le flux ne demarre pas dans le temps imparti : serveur lent, flux hors service, ou passerelle injoignable.';
    case 'hls_network':
      return 'Erreur reseau HLS (segments/playlist injoignables) : coupure reseau, limite de connexions, ou CDN.';
    case 'hls_media':
      return 'Erreur de decodage HLS (flux corrompu ou codec non supporte).';
    case 'hls_unsupported':
      return 'HLS non supporte par ce navigateur.';
    case 'hls_module_failed':
      return 'Le module de lecture HLS n a pas pu se charger (reseau/blocage de script).';
    case 'native_error':
      if (f.mediaErrorCode === 4)
        return 'Format/codec non supporte par le navigateur (ex. MKV, HEVC 10-bit, audio AC3/DTS).';
      if (f.mediaErrorCode === 2) return 'Erreur reseau pendant la lecture (flux interrompu).';
      if (f.mediaErrorCode === 3) return 'Erreur de decodage (flux corrompu ou codec non gere).';
      if (f.mediaErrorCode === 1) return 'Lecture interrompue.';
      return 'Le lecteur natif a echoue sans code precis.';
    default:
      return 'Cause indeterminee.';
  }
}

export function formatPlaybackDiagnostic(d: PlaybackDiagnostic): string {
  const L: string[] = [];
  L.push('=== ZiBTV — Diagnostic de lecture ===');
  L.push(`Contenu   : ${d.content.type} · conteneur ${d.content.container ?? '?'} · via ${d.content.via}`);
  L.push(`Erreur    : ${d.failure.code}`);
  if (d.failure.httpStatus != null) L.push(`HTTP amont: ${d.failure.httpStatus}`);
  if (d.failure.mediaErrorCode != null) L.push(`MediaError: ${d.failure.mediaErrorCode}`);
  if (d.failure.detail != null && d.failure.detail !== '') L.push(`Detail    : ${d.failure.detail}`);
  L.push(`Cause probable : ${likelyCause(d.failure)}`);
  L.push('--- Passerelle ---');
  L.push(`Configuree: ${d.gateway.configured ? 'oui' : 'non'}`);
  L.push(`Joignable : ${d.gateway.healthy === null ? 'n/a' : d.gateway.healthy ? 'oui' : 'NON'}`);
  L.push('--- Environnement ---');
  L.push(`PWA installee : ${d.env.standalone ? 'oui' : 'non'} · en ligne : ${d.env.online ? 'oui' : 'NON'}`);
  L.push(`HLS natif : ${d.env.nativeHls ? 'oui' : 'non'} · reseau : ${d.env.connection ?? '?'}`);
  L.push(`UA : ${d.env.userAgent}`);

  // Filet anti-fuite (invariant #4) — comme les autres exports de diagnostic :
  // redaction systematique + verification finale. `detail` ne porte aujourd'hui
  // que des enums, mais un futur champ texte (ex. detail: error.message avec une
  // URL ...?username=...&password=...) ne pourra jamais atteindre le presse-papier.
  const safe = redactText(L.join('\n'));
  try {
    assertReportSafe(safe);
  } catch {
    return '=== ZiBTV — Diagnostic de lecture ===\n(Rapport masqué : données sensibles détectées.)';
  }
  return safe;
}

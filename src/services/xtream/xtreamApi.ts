import type {
  XtreamAuthResponse,
  XtreamCategory,
  XtreamCredentials,
  XtreamLiveStream,
  XtreamSeries,
  XtreamSeriesInfo,
  XtreamShortEpg,
  XtreamVodInfo,
  XtreamVodStream,
} from '@/types/xtream';
import { callXtream } from './xtreamClient';

/** Appels types a player_api.php via le proxy /api/xtream (metadonnees uniquement). */

export function authenticate(creds: XtreamCredentials): Promise<XtreamAuthResponse> {
  return callXtream<XtreamAuthResponse>(creds);
}

export function getLiveCategories(creds: XtreamCredentials): Promise<XtreamCategory[]> {
  return callXtream<XtreamCategory[]>(creds, 'get_live_categories');
}

export function getVodCategories(creds: XtreamCredentials): Promise<XtreamCategory[]> {
  return callXtream<XtreamCategory[]>(creds, 'get_vod_categories');
}

export function getSeriesCategories(creds: XtreamCredentials): Promise<XtreamCategory[]> {
  return callXtream<XtreamCategory[]>(creds, 'get_series_categories');
}

export function getLiveStreams(creds: XtreamCredentials, categoryId?: string): Promise<XtreamLiveStream[]> {
  return callXtream<XtreamLiveStream[]>(
    creds,
    'get_live_streams',
    categoryId !== undefined ? { category_id: categoryId } : undefined,
  );
}

export function getVodStreams(creds: XtreamCredentials, categoryId?: string): Promise<XtreamVodStream[]> {
  return callXtream<XtreamVodStream[]>(
    creds,
    'get_vod_streams',
    categoryId !== undefined ? { category_id: categoryId } : undefined,
  );
}

export function getSeries(creds: XtreamCredentials, categoryId?: string): Promise<XtreamSeries[]> {
  return callXtream<XtreamSeries[]>(
    creds,
    'get_series',
    categoryId !== undefined ? { category_id: categoryId } : undefined,
  );
}

export function getSeriesInfo(creds: XtreamCredentials, seriesId: string): Promise<XtreamSeriesInfo> {
  return callXtream<XtreamSeriesInfo>(creds, 'get_series_info', { series_id: seriesId });
}

export function getVodInfo(creds: XtreamCredentials, vodId: string): Promise<XtreamVodInfo> {
  return callXtream<XtreamVodInfo>(creds, 'get_vod_info', { vod_id: vodId });
}

/** EPG court d'une chaine (programme actuel + suivants). Metadonnees uniquement. */
export function getShortEpg(
  creds: XtreamCredentials,
  streamId: string,
  limit = 6,
): Promise<XtreamShortEpg> {
  return callXtream<XtreamShortEpg>(creds, 'get_short_epg', { stream_id: streamId, limit });
}

/** EPG COMPLET d'une chaine (plusieurs jours). Meme forme que short_epg.
 *  Metadonnees uniquement — pour la detection des evenements sportifs 7 jours. */
export function getFullEpg(creds: XtreamCredentials, streamId: string): Promise<XtreamShortEpg> {
  return callXtream<XtreamShortEpg>(creds, 'get_simple_data_table', { stream_id: streamId });
}

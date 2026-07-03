import type { XtreamCredentials } from '@/types/xtream';

/**
 * Client bas niveau vers le proxy /api/xtream (metadonnees uniquement).
 * Toute erreur devient une XtreamApiError avec un code stable, exploitable
 * par l'UI. Ne jamais logger les identifiants.
 */

export type XtreamErrorCode =
  | 'invalid_request'
  | 'invalid_url'
  | 'unreachable'
  | 'timeout'
  | 'upstream'
  | 'invalid_response'
  | 'unknown';

export class XtreamApiError extends Error {
  constructor(
    public readonly code: XtreamErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'XtreamApiError';
  }
}

interface ProxyEnvelope {
  ok: boolean;
  data?: unknown;
  error?: { code?: string; message?: string };
}

const KNOWN_CODES: ReadonlySet<string> = new Set([
  'invalid_request',
  'invalid_url',
  'unreachable',
  'timeout',
  'upstream',
  'invalid_response',
]);

export async function callXtream<T>(
  credentials: XtreamCredentials,
  action?: string,
  params?: Record<string, string | number>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/xtream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...credentials, action, params }),
    });
  } catch {
    throw new XtreamApiError('unreachable', 'Impossible de joindre le proxy API.');
  }

  let payload: ProxyEnvelope | null = null;
  try {
    payload = (await response.json()) as ProxyEnvelope;
  } catch {
    // payload reste null -> erreur normalisee ci-dessous
  }

  if (payload !== null && payload.ok === true) return payload.data as T;

  const rawCode = payload?.error?.code;
  const code: XtreamErrorCode =
    rawCode !== undefined && KNOWN_CODES.has(rawCode) ? (rawCode as XtreamErrorCode) : 'unknown';
  throw new XtreamApiError(code, payload?.error?.message ?? `Erreur proxy (HTTP ${response.status}).`);
}

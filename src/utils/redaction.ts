/**
 * Redaction de donnees sensibles dans les textes destines a l'export
 * (rapport diagnostic). Complementaire de sensitiveDataGuards (verification
 * finale avant export).
 */

const URL_RE = /https?:\/\/[^\s"'<>]+/gi;
const CRED_PARAM_RE = /(username|password|token)=[^&\s"'<>]*/gi;
const STREAM_FILE_RE = /\S*\.(?:m3u8|ts|mp4|mkv|avi)\b/gi;
// UUID (v1-v5) : format d'identifiant courant pour tokens/sessions.
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
// Sequence alphanumerique longue : quasi jamais un vrai titre/label, souvent un token.
const LONG_TOKEN_RE = /\b[a-zA-Z0-9]{20,}\b/g;

export function redactText(input: string): string {
  return input
    .replace(URL_RE, '[url-supprimee]')
    .replace(CRED_PARAM_RE, '$1=[supprime]')
    .replace(STREAM_FILE_RE, '[flux-supprime]')
    .replace(UUID_RE, '[token-supprime]')
    .replace(LONG_TOKEN_RE, '[token-supprime]');
}

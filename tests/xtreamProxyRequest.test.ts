import { describe, expect, it } from 'vitest';
import { buildApiUrl, isBlockedHost, parseRequest, type ProxyRequest } from '@/server/xtream/proxyRequest';

const hostOf = (url: string): string => new URL(url).hostname;

const req = (serverUrl: string, extra: Partial<ProxyRequest> = {}): ProxyRequest => ({
  serverUrl,
  username: 'u',
  password: 'p',
  params: {},
  ...extra,
});

describe('isBlockedHost (anti-SSRF)', () => {
  it.each([
    'http://127.0.0.1/',
    'http://10.1.2.3/',
    'http://172.20.0.1/',
    'http://192.168.1.1/',
    'http://169.254.169.254/',
    'http://100.64.0.1/',
    'http://0.0.0.0/',
    'http://224.0.0.1/',
    'http://255.255.255.255/',
    'http://2130706433/', // 127.0.0.1 en decimal, normalise par URL
    'http://0x7f.1/',
    'http://localhost:8080/',
    'http://box.local/',
    'http://metadata.google.internal/',
  ])('refuse %s', (url) => {
    expect(isBlockedHost(hostOf(url))).toBe(true);
  });

  // URL garde les crochets IPv6 dans `hostname` : c'etait le trou du filtre.
  it.each([
    'http://[::1]:8080/',
    'http://[::]/',
    'http://[fd00::1]/',
    'http://[fc12:3456::1]/',
    'http://[fe80::1]/',
    'http://[ff02::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:a9fe:a9fe]/', // 169.254.169.254
    'http://[::127.0.0.1]/',
    'http://[64:ff9b::a00:1]/', // NAT64 -> 10.0.0.1
    'http://[2002:c0a8:101::1]/', // 6to4 -> 192.168.1.1
  ])('refuse IPv6 %s', (url) => {
    expect(isBlockedHost(hostOf(url))).toBe(true);
  });

  it.each([
    'http://exemple.com:8080/',
    'http://8.8.8.8/',
    'http://[2001:4860:4860::8888]/',
    'http://[::ffff:8.8.8.8]/',
    'http://[2002:808:808::1]/',
  ])('accepte %s', (url) => {
    expect(isBlockedHost(hostOf(url))).toBe(false);
  });
});

describe('parseRequest', () => {
  it('accepte une action metadonnee et ses parametres', () => {
    expect(
      parseRequest({ serverUrl: 'http://a.b', username: 'u', password: 'p', action: 'get_vod_info', params: { vod_id: 3 } }),
    ).toEqual({ serverUrl: 'http://a.b', username: 'u', password: 'p', action: 'get_vod_info', params: { vod_id: '3' } });
  });

  it('refuse une action ou un parametre hors liste blanche', () => {
    expect(parseRequest({ serverUrl: 'http://a.b', username: 'u', password: 'p', action: 'get_live_stream_url' })).toBeNull();
    expect(parseRequest({ serverUrl: 'http://a.b', username: 'u', password: 'p', params: { url: 'x' } })).toBeNull();
  });

  it('refuse des identifiants manquants ou vides', () => {
    expect(parseRequest({ serverUrl: 'http://a.b', username: '', password: 'p' })).toBeNull();
    expect(parseRequest({ serverUrl: 'http://a.b', username: 'u' })).toBeNull();
    expect(parseRequest(null)).toBeNull();
  });
});

describe('buildApiUrl', () => {
  it('ne construit QUE player_api.php, chemin du serveur conserve', () => {
    const url = buildApiUrl(req('http://exemple.com:8080/sub/', { action: 'get_series', params: { category_id: '7' } }));
    expect(url?.toString()).toBe(
      'http://exemple.com:8080/sub/player_api.php?username=u&password=p&action=get_series&category_id=7',
    );
  });

  it('refuse les schemas non HTTP et les hotes internes', () => {
    expect(buildApiUrl(req('ftp://exemple.com/'))).toBeNull();
    expect(buildApiUrl(req('http://[::1]/'))).toBeNull();
    expect(buildApiUrl(req('pas une url'))).toBeNull();
  });

  it('applique la liste blanche XTREAM_ALLOWED_HOSTS si elle est fournie', () => {
    const allowed = new Set(['exemple.com']);
    expect(buildApiUrl(req('http://exemple.com:8080'), allowed)).not.toBeNull();
    expect(buildApiUrl(req('http://EXEMPLE.com'), allowed)).not.toBeNull();
    expect(buildApiUrl(req('http://autre.com'), allowed)).toBeNull();
  });
});

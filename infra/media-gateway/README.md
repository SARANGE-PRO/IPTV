# Passerelle média auto-hébergée (maison)

Résout les deux blocages des providers IPTV grand public :

1. **CDN qui bloque les IP datacenter** (Cloudflare/Vercel/VPS → HTTP 456). Ici
   les requêtes sortantes partent de **l'IP de ta machine (résidentielle)**, que
   le CDN accepte (206).
2. **Conteneurs illisibles en navigateur** (MKV/AVI, HEVC-en-MKV…) : **remux /
   transcodage ffmpeg à la volée** vers du fMP4 fragmenté lisible par `<video>`.

Exposée en **HTTPS via Cloudflare Tunnel** — aucun port à ouvrir sur ta box.

## Ce qu'il te faut
- Une machine allumée chez toi (PC, NAS, Raspberry Pi…) avec **Docker**.
- Un domaine géré dans **Cloudflare** (gratuit) pour le tunnel.

## Étapes

1. **Créer le tunnel** : Cloudflare → *Zero Trust* → *Networks* → *Tunnels* →
   *Create a tunnel* (type *Cloudflared*). Copie le **token** affiché.
   - Ajoute un *Public hostname* : ex. `media.tondomaine.com` →
     **Service** `HTTP` → `gateway:8080`.

2. **Configurer** :
   ```bash
   cd infra/media-gateway
   cp .env.example .env
   # renseigne UPSTREAM_ORIGIN (ton serveur Xtream) et TUNNEL_TOKEN
   ```

3. **Lancer** :
   ```bash
   docker compose up -d --build
   ```
   Vérifie : `https://media.tondomaine.com/_health` doit répondre `ok`.

4. **Brancher l'app** (Vercel → *Settings* → *Environment Variables*, Production) :
   ```
   NEXT_PUBLIC_MEDIA_GATEWAY_URL=https://media.tondomaine.com
   NEXT_PUBLIC_MEDIA_GATEWAY_TRANSCODE=1
   ```
   Puis redéploie l'app. (`NEXT_PUBLIC_MEDIA_GATEWAY_TRANSCODE=1` dit à l'app de
   ne plus bloquer les MKV : la passerelle les transcode.)

## Notes
- **Codec vidéo** : `VIDEO_CODEC=copy` (défaut) = remux léger, parfait pour
  **iPhone/iPad** (Safari décode H.264 **et** HEVC). Pour Chrome/Firefox sur du
  HEVC, passe à `VIDEO_CODEC=libx264` (plus gourmand en CPU).
- **Seek** : en transcodage, la lecture est progressive (l'avance rapide peut
  être limitée). Le passthrough (MP4/HLS natif) garde le seek complet.
- **Sécurité** : seul le 1er hôte doit être allowlisté (anti-SSRF) ; les
  redirections CDN (IP changeante) sont suivies automatiquement. Garde l'URL du
  tunnel privée, ou protège-la via *Cloudflare Access*.
- **Connexions** : si ton compte Xtream est limité à `max_connections: 1`, ne
  lance qu'une lecture à la fois.
- Les identifiants Xtream ne sont jamais stockés côté passerelle : ils restent
  dans les URL de lecture générées par l'app. Aucune URL n'est journalisée.

## Variante VPS + Caddy
Un VPS avec domaine dédié + Caddy (TLS) est possible, mais un VPS a une **IP
datacenter souvent bloquée par le CDN** (retour du 456). L'hébergement
**résidentiel** (tunnel ci-dessus) est le seul qui garantit le 206.

Test local du moteur (sans Docker) : `node test.mjs`.

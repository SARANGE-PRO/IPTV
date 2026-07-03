# Passerelle gratuite Cloudflare

## Déploiement actif (Pages Functions)

La passerelle de ce projet est publiée sur :

`https://zibtv-gateway.pages.dev`

L'origine autorisée est stockée comme secret Cloudflare Pages. Pour republier :

1. `node pages-build.mjs`
2. `npx wrangler pages deploy --config wrangler.pages.jsonc --branch main`

Pour remplacer l'origine :

`npx wrangler pages secret put UPSTREAM_ORIGIN --project-name zibtv-gateway`

Dans Vercel, utiliser :

`NEXT_PUBLIC_MEDIA_GATEWAY_URL=https://zibtv-gateway.pages.dev`

## Variante Workers

Cette variante remplace le VPS pour un usage personnel ou une petite audience.
Elle diffuse les corps vidéo sans buffering, conserve les requêtes `Range` et
réécrit les playlists HLS vers l'URL HTTPS du Worker.

## Déploiement

Depuis ce dossier :

1. Se connecter : `npx wrangler login`
2. Déployer : `npx wrangler deploy`
3. Enregistrer l'origine Xtream HTTP : `npx wrangler secret put UPSTREAM_ORIGIN`
4. Si les playlists utilisent d'autres hôtes, les autoriser avec
   `npx wrangler secret put ALLOWED_HOSTS` (liste `host:port,host2`).
5. Redéployer si Wrangler le demande, puis vérifier
   `https://iptv-media-gateway.<compte>.workers.dev/_health`.
6. Dans Vercel, ajouter :
   `NEXT_PUBLIC_MEDIA_GATEWAY_URL=https://iptv-media-gateway.<compte>.workers.dev`
7. Redéployer l'application Vercel.

Ne jamais ajouter les identifiants Xtream dans Wrangler : ils restent dans les
URL de lecture générées par l'application. Le Worker ne journalise aucune URL.

Test local du moteur : `node test.mjs`.

## Cloudflare Pages sur un autre compte

Si le compte refuse d'initialiser `workers.dev`, la même passerelle peut être
publiée gratuitement sur `pages.dev` :

1. `node pages-build.mjs`
2. `npx wrangler pages deploy --config wrangler.pages.jsonc --branch main`
3. `npx wrangler pages secret put UPSTREAM_ORIGIN --project-name zibtv-gateway`

L'URL publique est alors `https://zibtv-gateway.pages.dev`.

## Limite connue : CDN qui bloque les IP datacenter (HTTP 456)

Diagnostic constaté sur le provider `absuqvet.top` :

- l'API `player_api.php` répond **200** à Cloudflare (le panel n'est pas bloqué) ;
- une requête de film redirige (302) vers un **CDN tokenisé sur une autre IP**
  (`http://<ip>:80/live/play/<token>/…`) ;
- ce CDN renvoie **456** aux IP **datacenter/Cloudflare** (anti-partage), alors
  qu'il renvoie **206** à une IP résidentielle normale ;
- le serveur annonce `https_port: 443` mais le TLS ne répond pas (pas de vrai HTTPS) ;
- beaucoup de VOD sont en **MKV**, non décodable par les navigateurs.

Conséquence : **aucune passerelle hébergée sur une IP datacenter (Cloudflare,
Vercel, la plupart des VPS) ne pourra relayer ces flux** — elle recevra 456.

### Solutions qui fonctionnent vraiment

1. **Proxy hébergé sur une IP résidentielle** (maison / NAS / Raspberry Pi via
   `infra/media-gateway`, exposé en HTTPS par un Cloudflare Tunnel). Les requêtes
   sortantes vers le CDN partent alors de l'IP résidentielle → 206.
2. **Transcodage** (ffmpeg → HLS/MP4) sur ce même proxy pour rendre les MKV/AVI
   lisibles en navigateur. Sans transcodage, seuls MP4 et HLS compatibles passent.
3. **En développement local** (`npm run dev`, page HTTP), l'app lit le flux en
   **direct** sans passerelle : idéal pour valider le pipeline sur un film MP4.

Tant qu'aucun de ces proxys n'est en place, sur un déploiement HTTPS ce provider
ne pourra streamer que depuis un point de sortie non bloqué.

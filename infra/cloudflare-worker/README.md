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

# Coquille HTTP pure — lecture directe SANS passerelle

## Pourquoi

La passerelle (`infra/media-gateway`) existe pour trois raisons, dont deux
disparaissent si l'app est servie en **HTTP pur** au lieu de HTTPS :

| Verrou | Page HTTPS (Vercel) | Page HTTP (cette coquille) |
|---|---|---|
| Contenu mixte (flux HTTP sur page HTTPS) | Bloqué → passerelle obligatoire | **N'existe pas** : flux HTTP lu en direct |
| CDN qui refuse les IP datacenter (456) | Passerelle sur IP résidentielle | **Sans objet** : le flux part de l'IP du téléphone |
| MKV/AVI illisibles par Safari | Transcodage passerelle | Passerelle **si allumée**, sinon VLC (inchangé) |

Résultat : **films MP4, séries MP4 et Live HLS se lisent dans l'app sans aucune
passerelle allumée.** Seuls les MKV gardent besoin de la passerelle ou de VLC.

Le conteneur ne fait que servir la page et le proxy métadonnées (`/api/*`).
**Aucun flux vidéo ne le traverse** (invariant #2 inchangé).

## Ce que ça change dans le code

- `NEXT_PUBLIC_PLAIN_HTTP=1` (build) : `secureMediaUrl` lit en direct sauf si le
  lecteur demande un transcodage (`transcode`) et qu'une passerelle est
  configurée ; `secureImageSrc` ne force plus les logos HTTP en HTTPS ; la CSP
  perd `upgrade-insecure-requests`.
- `NEXT_OUTPUT=standalone` (build) : serveur Next.js autonome pour Docker.
- Le déploiement Vercel n'est **pas** affecté (aucune de ces variables n'y est
  définie).

## Ce qu'on perd en HTTP

- Pas de service worker : pas de cache hors ligne ni de rappels par notification.
  L'app reste installable sur l'écran d'accueil (meta `apple-mobile-web-app-capable`).
- Identifiants Xtream en clair sur le réseau (c'était déjà le cas vers le serveur
  Xtream lui-même, qui est HTTP-only).
- La page ne doit **jamais** répondre en HTTPS sur le même hôte : Safari tenterait
  l'upgrade et retomberait dans le contenu mixte.

## Hébergement : trois pièges à éviter

1. **Domaine préchargé HSTS.** `*.vercel.app`, `*.pages.dev`, `*.workers.dev`,
   `*.github.io` sont forcés en HTTPS par le navigateur lui-même : impossible d'y
   servir du HTTP. Utiliser une **IP brute** ou un **sous-domaine à toi** (sans
   HSTS). Pour un domaine de PaaS (`*.fly.dev`…), vérifier sur
   <https://hstspreload.org> avant de compter dessus.
2. **Redirection HTTP → HTTPS de l'hébergeur.** Désactiver toute option « force
   HTTPS » ; mieux, ne pas ouvrir le port 443 du tout.
3. **iCloud Private Relay** (iPhone) fait sortir le HTTP de Safari par des IP
   datacenter → 456 possible. Le désactiver pour ce site (Réglages → identifiant
   Apple → iCloud → Relais privé) ou globalement.

## Option A — Docker sur un VPS / VM gratuite (recommandé pour commencer)

Oracle Cloud *Always Free* (VM ARM, IP publique fixe) ou n'importe quel petit VPS
à 3 €/mois. Il faut Docker et le port 80 ouvert dans le pare-feu.

```bash
git clone <repo> zibtv && cd zibtv/infra/http-shell
cp ../../.env.example .env        # TMDB_API_KEY, FOOTBALL_API_KEY… (clés serveur)
docker compose up -d --build
curl -I http://<ip>/              # doit répondre 200, sans Location: https://…
```

Puis sur l'iPhone : Safari → `http://<ip>/` → Partager → **Sur l'écran d'accueil**.

Pour le transcodage MKV quand le PC est allumé, passer la passerelle au build :
`NEXT_PUBLIC_MEDIA_GATEWAY_URL=https://… docker compose up -d --build`.

## Option B — Fly.io (sans serveur à gérer, ~2 à 4 $/mois)

Depuis la **racine** du dépôt, avec [flyctl](https://fly.io/docs/flyctl/) :

```bash
fly launch --no-deploy --copy-config -c infra/http-shell/fly.toml
fly secrets set TMDB_API_KEY=… FOOTBALL_API_KEY=… -c infra/http-shell/fly.toml
fly deploy -c infra/http-shell/fly.toml
curl -I http://zibtv-http.fly.dev/     # 200 attendu, pas de redirection
```

`fly.toml` n'expose que le port 80 (handler `http`, `force_https = false`) : ne
pas ajouter de bloc 443. Si `fly.dev` s'avère préchargé HSTS, brancher un
sous-domaine à toi (`fly certs` **non** nécessaire, c'est justement le but) via un
enregistrement A/AAAA vers l'IP de l'app.

## Validation (étape 1 du plan)

1. `http://<hôte>/` s'ouvre sur l'iPhone, l'app s'installe sur l'écran d'accueil
   et se lance en plein écran.
2. Connexion Xtream OK (le proxy `/api/xtream` tourne sur le conteneur).
3. Un **film MP4** se lit in-app, PC et passerelle **éteints**.
4. Une chaîne **Live** se lit in-app (HLS natif Safari, direct).
5. Un MKV propose VLC (passerelle éteinte) ou se transcode (passerelle allumée).

Si le point 3 échoue avec une erreur réseau, vérifier Private Relay, puis que
la page n'a pas été ouverte en `https://`.

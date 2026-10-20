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

## Option 0 — GitHub Pages, 100 % gratuit, sans serveur (recommandé)

La coquille est exportée en **statique** (`npm run build:static` → `out/`) et
publiée sur la branche **`gh-pages`** par GitHub Actions
(`.github/workflows/pages.yml`) à chaque push sur `main`. Les routes `/api/*`
(proxy Xtream, TMDB, foot, EPG) restent sur **Vercel** : la page HTTP les
appelle en cross-origin (une page HTTP peut appeler une API HTTPS). Aucune
vidéo ne transite ni par GitHub ni par Vercel.

Il faut un **nom de domaine à toi** pour servir du HTTP : `*.github.io` est
forcé en HTTPS par les navigateurs (HSTS préchargé). Nom gratuit retenu :
**`zibtv.duckdns.org`** ([DuckDNS](https://www.duckdns.org)). Un sous-domaine
d'un domaine à toi (ex. `tv.sarange.fr`) marche aussi : il suffit de changer la
valeur aux deux endroits ci-dessous.

### État de la configuration (fait / à faire)

| Où | Quoi | État |
|---|---|---|
| Dépôt | `infra/http-shell/pages.env` : origine API `https://iptv-zib.vercel.app`, domaine `zibtv.duckdns.org` | ✅ versionné |
| Dépôt | Workflow `pages.yml` → branche `gh-pages` + `CNAME` | ✅ versionné |
| Vercel (projet `iptv`, Production) | `CORS_ALLOWED_ORIGIN=http://zibtv.duckdns.org` | ✅ posé |
| DuckDNS | créer `zibtv` et pointer sur `185.199.108.153` | ⬜ **toi** (compte requis) |
| GitHub → Settings → Pages | vérifier Source = branche `gh-pages`, domaine `zibtv.duckdns.org`, **Enforce HTTPS décoché** | ⬜ **toi** (API bloquée depuis la session) |

### 1. DuckDNS (2 minutes)

1. <https://www.duckdns.org> → se connecter (GitHub/Google).
2. *sub domain* : `zibtv` → **add domain**. Si le nom est pris, en choisir un
   autre et changer `PAGES_CUSTOM_DOMAIN` dans `pages.env` **et**
   `CORS_ALLOWED_ORIGIN` sur Vercel.
3. Dans *current ip*, mettre **`185.199.108.153`** (IP de GitHub Pages ; DuckDNS
   n'accepte qu'un seul enregistrement A, c'est suffisant) → **update ip**.

Avec un domaine à toi : enregistrements **A** vers `185.199.108.153`,
`185.199.109.153`, `185.199.110.153`, `185.199.111.153`, **sans** proxy
Cloudflare (nuage orange), qui imposerait sa politique HTTPS.

### 2. GitHub → Settings → Pages (1 minute, à vérifier)

La branche `gh-pages` contient `CNAME`, GitHub la publie normalement tout seul.
Vérifier dans **Settings → Pages** :

- *Build and deployment* → Source **Deploy from a branch**, branche **`gh-pages`**
  (dossier `/ (root)`).
- *Custom domain* = `zibtv.duckdns.org` (pré-rempli par `CNAME`).
- **« Enforce HTTPS » DÉCOCHÉ.** C'est tout l'intérêt. Si la case est grisée,
  c'est que le certificat n'est pas encore émis : laisser tel quel.

### 3. Vercel

Déjà fait : `CORS_ALLOWED_ORIGIN=http://zibtv.duckdns.org` (origine HTTP
exacte, une seule, jamais `*` : le proxy relaie des identifiants). La variable
est lue au **build** (`next.config.mjs`) : tout déploiement de `main` postérieur
l'embarque et ajoute les en-têtes CORS sur `/api/*`, preflight `OPTIONS`
compris.

### 4. Vérifier

```bash
curl -I http://zibtv.duckdns.org/        # 200, pas de Location: https://…
curl -I -X OPTIONS -H "Origin: http://zibtv.duckdns.org" \
     -H "Access-Control-Request-Method: POST" https://iptv-zib.vercel.app/api/xtream
#  -> 204 + Access-Control-Allow-Origin: http://zibtv.duckdns.org
```

Sur l'iPhone : Safari → `http://zibtv.duckdns.org/` (bien taper `http://`) →
Partager → **Sur l'écran d'accueil**. Si la page s'ouvre quand même en
`https://`, `public/plain-http.js` la rebascule en `http://` automatiquement.
Pour republier à la main : Actions → « Pages (coquille HTTP) » → Run workflow.

### Ce que ça change dans le code (en plus du mode HTTP)

- **Aucune route dynamique** (`/movies/[id]`…) : un export statique ne sait
  pas les générer. Film/série s'ouvrent via `?vod=<id>` / `?series=<id>`
  (modal par-dessus la page courante, `DetailModalHost`), le Live via
  `/live/watch?id=<id>`. Liens centralisés dans `utils/appRoutes.ts`.
- `src/app/api` est écarté le temps du build statique
  (`scripts/build-static.mjs`), les types partagés vivent dans `src/types/`.
- `services/apiBase.ts` préfixe les appels `/api/*` par
  `NEXT_PUBLIC_API_BASE_URL`.

Test local : `set -a; . infra/http-shell/pages.env; set +a; npm run build:static`
puis `cd out && python3 -m http.server 8080` → `http://localhost:8080/`.

## Option A — Docker sur une VM gratuite (Oracle Cloud Always Free)

Seul hébergeur connu qui donne **gratuitement et sans limite de durée** une VM
avec IP publique fixe et port 80 ouvert (offre *Always Free* : VM ARM ou micro
AMD, 10 To de sortie/mois). L'inscription demande une carte bancaire pour
vérifier l'identité, sans prélèvement ; rester sur le compte « Always Free ».
Choisir une région européenne (Paris, Marseille, Francfort). Ouvrir le port 80
dans la *Security List* du VCN **et** dans le pare-feu de la VM (`iptables`).

Les PaaS « gratuits » (Render, Koyeb, Cloud Run…) ne conviennent pas : ils
forcent la redirection vers HTTPS ou leur domaine est préchargé HSTS.

```bash
git clone <repo> zibtv && cd zibtv/infra/http-shell
cp ../../.env.example .env        # TMDB_API_KEY, FOOTBALL_API_KEY… (clés serveur)
docker compose up -d --build
curl -I http://<ip>/              # doit répondre 200, sans Location: https://…
```

Puis sur l'iPhone : Safari → `http://<ip>/` → Partager → **Sur l'écran d'accueil**.

Pour le transcodage MKV quand le PC est allumé, passer la passerelle au build :
`NEXT_PUBLIC_MEDIA_GATEWAY_URL=https://… docker compose up -d --build`.

## Option B — Fly.io (payant, ~2 à 4 $/mois, sans serveur à gérer)

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

# Architecture — IPTV PWA

Document de référence validé (v1, avec amendements). Toute implémentation doit
s'y conformer. Voir aussi [`../CLAUDE.md`](../CLAUDE.md) pour les invariants.

---

## 0. Résumé

PWA IPTV premium (Live TV · Films VOD · Séries) consommant une API Xtream Codes
**personnelle**. Priorité technique : Safari iOS/iPadOS en PWA installée. Déploiement
Vercel. UX inspirée Apple TV (sobriété, fluidité), palette Netflix (noir profond,
rouge accent, gris anthracite). Usage strictement légitime.

**Stack** : Next.js (App Router) · TypeScript strict · Tailwind · Zustand · Dexie.js
(IndexedDB) · HLS natif + fallback hls.js · TMDB. Paquets : **npm**.
Animations : keyframes Tailwind + CSS + gestes écrits à la main (pas de Framer Motion).

---

## 1. Arborescence

```
src/
├── app/
│   ├── (auth)/login/          # écran de connexion (sans navigation)
│   ├── (app)/                 # shell : accueil, live, movies, series, favorites,
│   │                          #         search, settings + layout avec nav
│   └── api/{xtream,tmdb}/      # Route Handlers = proxy (métadonnées uniquement)
├── components/{ui,layout,shared,live,movies,series,player}/
├── stores/                    # 12 stores Zustand séparés
├── services/
│   ├── xtream/                # client + api typée + urls vidéo + normalize
│   ├── tmdb/                  # client + matcher (nettoyage titres) + cache
│   ├── session/               # secureSessionService
│   ├── sync/                  # catalogSyncService (fetch -> Dexie)
│   ├── cache/                 # invalidation
│   └── diagnostics/           # deepPlaylistDiagnosticService ← mode diagnostic
├── db/                        # Dexie : database.ts + repositories/
├── hooks/                     # useDebounce, useMediaQuery, useVirtualList…
├── lib/                       # cn(), registerServiceWorker…
├── types/                     # models, xtream, tmdb, deepDiagnostics
├── utils/                     # titleCleaner, frenchDetection, countryDetection,
│                              # redaction, sensitiveDataGuards
└── config/                    # constants, env
```

**Sens des dépendances (strict)** : `components → hooks → stores → services → db/api`.
Jamais l'inverse. Les composants n'accèdent jamais directement à fetch/Dexie.

---

## 2. Sécurité (déploiement Vercel personnel)

### Comparaison des approches

| Approche | Avantages | Limites |
|---|---|---|
| 1. Identifiants saisis puis stockés localement | Flexible, multi-appareils, simple | Présents dans le stockage navigateur |
| 2. Identifiants en variables d'env Vercel | Jamais exposés client, idéal compte unique fixe | Redeploy pour changer, pas d'UI login |
| 3. Session locale persistante (IndexedDB) | Reconnexion auto, gros volumes | Non chiffré ; iOS peut purger |
| 4. Proxy Route Handlers Next.js | Règle le CORS, cache, timeouts, cache la clé TMDB | Passe par Vercel → **jamais la vidéo** |

**Choix retenu = 1 + 3 + 4.** Login UI → validation via proxy → session locale
(`secureSessionService` → Dexie) → restauration auto.

### Séparation métadonnées / vidéo (critique)
- **Métadonnées** → proxy `/api/xtream` (les serveurs Xtream n'envoient quasi jamais
  les en-têtes CORS ; un fetch navigateur direct échoue).
- **Flux vidéo** (`.m3u8` / `.ts` / `.mp4`) → **URL directe** vers Xtream, jamais via
  Vercel, jamais mis en cache par le service worker.

### Deux cibles de déploiement (même code)
| Cible | Page | Flux HTTP du Xtream | MKV |
|---|---|---|---|
| **Vercel** (routes `/api` ; app HTTPS non utilisée en prod) | HTTPS | Bloqué par le mixed-content → **passerelle** `infra/media-gateway` obligatoire | Passerelle (transcodage) sinon VLC |
| **Coquille HTTP** `infra/http-shell` (`NEXT_PUBLIC_PLAIN_HTTP=1`) : statique sur GitHub Pages (`build:static`, `/api` restant sur Vercel + CORS) ou Docker | HTTP pur | **Direct** depuis l'IP du client, sans passerelle | **Remux navigateur** (`services/player/mkvDirectEngine.ts` : fetch Range → `utils/matroska` → `utils/fmp4` → MediaSource) si codecs décodables, sinon passerelle si joignable, sinon VLC |

La coquille HTTP supprime le besoin de passerelle pour tout ce qui est MP4/HLS :
le flux part du téléphone (IP résidentielle/mobile acceptée par le CDN). Elle
perd le service worker (hors ligne, notifications) mais reste installable sur
l'écran d'accueil. La logique est centralisée dans `utils/secureUrl.ts` (option
`transcode` de `secureMediaUrl`), `services/apiBase.ts` (origine des routes
`/api`) et `next.config.mjs` (CSP sans `upgrade-insecure-requests`, CORS).

### Routage sans route dynamique (export statique)
Aucun segment `[id]` : film et série s'ouvrent via `?vod=<id>` / `?series=<id>`
(lien **relatif**, donc modal `DetailModalHost` par-dessus la page courante qui
reste montée : liste, scroll et filtres préservés), le Live via
`/live/watch?id=<id>`. Tous les liens passent par `utils/appRoutes.ts`. Les
types partagés client/serveur des routes API vivent dans `src/types/`, jamais
dans `app/api`.

### Stockage de session — forme minimale (amendement)
Table `sessions`, un seul enregistrement actif :

```ts
{
  serverUrl: string;
  username: string;
  password?: string;        // UNIQUEMENT si « Se souvenir de moi » activé
  createdAt: number;
  lastValidatedAt: number;
  sessionStatus: 'valid' | 'invalid' | 'unknown';
}
```

`secureSessionService` : `saveSession()` · `getSession()` · `validateSession()` ·
`clearSession()`. Seule couche qui manipule les identifiants.

### Limites de sécurité (assumées)
Une PWA n'a pas d'équivalent au **Keychain iOS** ; IndexedDB n'est pas chiffré de
façon comparable ; iOS peut purger le stockage (pression / inactivité). Un chiffrement
Web Crypto sans passphrase serait cosmétique. Pour un usage perso : stockage local
assumé + bouton **« Supprimer la session »** dans les réglages.

---

## 3. Connexion persistante (iPhone / iPad / PC)

```
Démarrage → authStore.restoreSession()
  └─ secureSessionService.getSession()
       ├─ aucune → /login
       └─ session → testConnection() silencieux (proxy, user_info)
            ├─ valide   → Accueil (hydratation Dexie en parallèle)
            └─ invalide → clearSession() + /login + message clair
```

Premier lancement : login → `testConnection()` **avant** sauvegarde → `saveSession()`.
Déconnexion : `clearSession()` + purge des caches liés au compte.

---

## 4. Stores Zustand (12)

Sélecteurs fins, persistance déléguée aux services, séparation données brutes /
filtrées / préférences.

- **authStore** — status, isRestoring, error, rememberMe · login/logout/
  restoreSession/testConnection/refreshSessionStatus. Aucune logique lourde.
- **catalogStore** — **catégories** + métadonnées de sync uniquement (jamais les
  milliers de flux/films en RAM) · hydrateFromDb, syncSection, invalidate.
- **filterStore** — query/debouncedQuery, country (défaut FR), language,
  selectedCategories, blacklist (`Set`), hide/unhide, resetFilters.
- **favoritesStore** — live/vod/series (`Set`), isFavorite O(1), toggle, hydrate,
  onglets perso (`tabs`, `tabItems`, `membership`), ordre manuel, retrait annulable.
  `favoritesUiStore` : feuille « Ranger dans un onglet » + toast (globaux, layout).
- **liveLineupStore** — statut/révision de la grille Live FR (jamais les chaînes).
- **playbackStore** — continueWatching, recentChannels, get/saveProgress
  (throttlé → Dexie), markFinished, clearHistory.
- **uiSettingsStore** — langue préférée, PiP / Cast / VLC, regroupement en cours.
- **vodFilterStore** — tri, langue, genres, années, note de Films / Séries.
- **liveUiStore** — vue, recherche et défilement de la page Live (retour).
- **playerStore** — session du lecteur unique, `<video>`, échec.
- **footballStore** — compétitions et équipes suivies.
- Enrichissement TMDB : état dans **catalogStore** (`backfill`), cache dans Dexie
  (`tmdbCacheService`). Non bloquant.

---

## 5. Dexie.js / IndexedDB

```
sessions                 id
xtream_live_categories   id, name, isFrench
xtream_live_streams      id, categoryId, name, isFrench
xtream_vod_categories    id, name, isFrench
xtream_vod_streams       id, categoryId, addedAt, isFrench, tmdbState, variant, groupKey,
                         [groupRank+variant+addedAt|ratingSort|yearSort], [groupRank+titleKey],
                         [laneRank+lane+addedAt|ratingSort|yearSort], [laneRank+lane+titleKey],
                         [tmdbState+variant+addedAt], *searchTokens, *tmdbGenreIds
xtream_series_categories id, name, isFrench
xtream_series            idem (lastModifiedAt a la place d'addedAt)
xtream_series_details    seriesId
tmdb_cache               key, type, fetchedAt
favorites                [type+itemId], type, addedAt   (position non indexée = ordre manuel)
favorite_tabs            id, position                    (v11, onglets perso)
favorite_tab_items       [tabId+type+itemId], tabId, [type+itemId]
live_lineup              id, sortKey, groupKey           (v11, grille Live FR rangée)
playback_history         [type+itemId], type, updatedAt, finished
hidden_categories        [section+categoryId], section
settings                 key
sync_metadata            section
search_index             token                           (déclarée, inutilisée)
epg_cache                id, fetchedAt                   (EPG Xtream, purgé > 48 h)
reminders                id …                            (rappels foot)
tmdb_genres              [type+id], type, fetchedAt
```

> **Pas de table `diagnostic_reports`** (amendement) : les rapports diagnostic sont
> générés à la demande et jamais persistés.

Invalidation : `sync_metadata.lastFetch` + TTL par section (voir `CACHE_TTL`).
Stratégie stale-while-revalidate : hydratation immédiate depuis Dexie puis
revalidation réseau en arrière-plan.

---

## 6. Priorité France + sélecteur pays

Au moment de la normalisation, chaque catégorie/flux reçoit un flag `isFrench`
(voir `FRENCH_KEYWORDS`). **Tri par pertinence, pas suppression** : le FR remonte,
les autres pays restent accessibles via `filterStore.country`. La **blacklist**
(`hidden_categories`) est un masquage durable et réactivable, distinct du sélecteur.

### 6 ter. Grille Live FR (page Live, zapping)

- **Construite une fois** (`services/live/frenchLineupService.ensureFrenchLineup`)
  depuis les flux `isFrench = 1` déjà en base : après chaque synchro Live
  (empreinte `lastFetchAt` + nombre de flux) ou si `LINEUP_VERSION` change.
  Aucune resynchronisation nécessaire. ~200 ms pour 12 000 flux (Mac).
- **Classeur pur** `frenchLineupClassifier` : exclut séparateurs, événements
  PPV vides et adultes ; regroupe les versions (HD/FHD/4K…) par clé canonique ;
  pays francophone étranger (BE/CH/CA/LU/Afrique) = entrée distincte en
  « Francophonie » ; sinon référentiel > catégorie régionale > 24/7 > thème.
- **Référentiel** `utils/frenchChannelReference` (motifs sur une clé compacte) :
  TNT dans l'ordre Arcom 2025 (France 4 en 4, LCP 8, bloc info 13-16, T18,
  Novo19…), toute la famille Canal+, beIN / RMC Sport / DAZN / Ligue 1+ /
  Eurosport, Ciné+ / OCS, jeunesse, découverte, musique, régions, francophonie.
- **Vues** (`services/live/liveViews`, pur) : France (sections), TNT, Canal+,
  Sport, Foot, Info… ; Favoris et onglets perso ; International / Tous restent
  en pagination Dexie. Catégories masquées retirées à la lecture.
- **Zapping** (`liveZappingService`) : la vue d'où la chaîne a été lancée
  (contexte), sinon l'ordre de la grille, sinon la catégorie fournisseur.

### 6 bis. Langue et versions des films / séries (fondation langue)

- **Parseur unique** `utils/mediaTitle.ts` (pur, testé en Node) : titre propre,
  année, **variante** `VF | MULTI | VOSTFR | VO | OTHER` (tags du titre, sinon
  catégorie fournisseur), qualité, clé titre+année. `cleanTitle` (TMDB) et
  `displayTitle` (affichage) en dérivent : même titre partout.
- **Persisté et indexé** sur `Movie`/`Series` (`variant`, `lane`, `groupKey`,
  `groupRank`, `laneRank`, `ratingSort`, `yearSort`), jamais recalculé à
  l'affichage. `isFrench` VOD = variante regardable en français (VF/MULTI/VOSTFR).
- **Regroupement des versions** (`services/catalog/catalogGroupingService.ts`) :
  `groupKey` = `t:<tmdbId>` sinon `k:<titre> #<année>`. `groupRank = 0` = version
  représentative selon la **préférence de langue** (`uiSettingsStore.preferredLanguage`,
  ordre dans `utils/variantPreference.ts`) ; `laneRank = 0` = meilleure version de
  son couloir (`fr` / `vost` / `vo` / `other`). Score : variante ≫ conteneur MP4 ≫
  qualité. Passe complète après sync et au changement de préférence ; incrémental
  à l'enrichissement TMDB (une ligne change de groupe).
- **Navigation** (`getAllMoviesPage`) : curseur multi-tiers `{tier, offset}` —
  pill « Tout » = un tier par variante dans l'ordre de préférence (VF d'abord),
  pills VF / VOSTFR / VO = plage `[laneRank+lane+…]`. Recherche et rails
  dédoublonnent par `groupKey`. Les tris « Mieux notés » / « Année » utilisent
  `ratingSort` / `yearSort` (TMDB sinon fournisseur) : rien n'est exclu.
- **Enrichissement TMDB** : lancé par `catalogStore.startBackfill()` à chaque
  ouverture (et après sync), file priorisée `[tmdbState+variant+…]` (VF puis
  récents), mode allégé (recherche seule, cache `partial` complété à l'ouverture
  de la fiche), ~214 req/min côté client / 240 req/min côté proxy.

---

## 7. Performance (gros volumes)

- Jamais des milliers d'items d'un coup → **virtualisation** + pagination Dexie.
- Listes lourdes **hors Zustand** (catalogStore ne garde que les catégories).
- Sélecteurs fins ; `Set` pour favoris/blacklist (test O(1)).
- Recherche : **debounce** + index `*searchTokens` des tables catalogue.
- Sync par section, écritures Dexie en **bulk**, barre de progression.
- Lazy-load posters (IntersectionObserver) et composants lourds (player, hls.js).
- TMDB **non bloquant** : l'UI ne dépend jamais de TMDB pour fonctionner.

### Lecteur vidéo (piège Safari)
Safari iOS lit le **HLS `.m3u8` nativement** (aucun CORS requis pour `<video>`),
mais **pas** le MPEG-TS `.ts` brut. → l'URL builder demande `.m3u8` pour le Live.
hls.js seulement si HLS natif absent (pas de mpegts.js). Le player
abstrait la détection de format et gère flux mort / timeout / format non supporté.

### Lecteur : découpage (oct. 2026)
`VideoPlayer` ne fait que brancher ; la logique est dans des services testés
(`tests/playbackSession.test.ts`, fausse `<video>` + horloge simulée) :
- `services/player/playbackSession` — supervision d'UN flux : relances
  (`playbackRecoveryPolicy`), anti-gel, pause subie, hors-ligne (rattrapé même
  sans évènement `online`), autoplay refusé, rejoindre le direct ;
- `streamSource` — branchement natif / hls.js / MKV direct (générations) ;
- `progressTracker` — progression (rappels figés pour l'ancien titre au
  zapping) et reprise par seek ; `playbackMessages` — messages d'échec ;
- `components/player/PlayerOverlay` (spinner, hors-ligne, échec) et
  `hooks/usePipPolicy`.
Sans session, la `<video>` reste montée (src vide) : la lecture suivante garde
l'autorisation son d'iOS. La langue préférée est lue au lancement d'un flux,
jamais en cours de lecture.

### Fiches film / série
Données par hooks (`useMovieDetail`, `useSeriesDetail` : `error` + `retry`),
plan de lecture par `useVodPlayback` ; blocs communs `DetailHero`,
`DetailHeader`, `PlaybackPlanPanel` (VLC seul / sonde / lecteur),
`SeasonEpisodes`. Plan → props du lecteur : `planSourceProps` (pur, partagé
avec l'enchaînement d'épisodes). Frontières d'erreur locales autour des fiches
et du lecteur (montés dans le layout, hors de portée de `(app)/error.tsx`).

---

## 8. Mode diagnostic anonymisé (amendement — important)

Analyse le catalogue Xtream **sans jamais exposer les accès**.

**`services/diagnostics/`**
- `deepPlaylistDiagnosticService.ts` — rapport unique (Live FR, langues films/
  séries, formats de lecture, EPG), exporté depuis Réglages › Avancé.
  Les diagnostics rapide / avancé / pistes (ffprobe) et le listing FR ont été
  retirés (oct. 2026) : outils de mise au point devenus inutiles.

**`utils/`** — `redaction.ts`, `sensitiveDataGuards.ts` (vérifie l'absence de
données sensibles avant export), `countryDetection.ts`.

**Garanties** : rapport **généré à la demande, jamais persisté**. Ne contient
JAMAIS username, password, URL complète, liens `.m3u8`/`.ts`/`.mp4`, ni tokens.
Types : `src/types/deepDiagnostics.ts`. Export : `redactText` puis
`assertReportSafe` (bloque l'export si une donnée sensible subsiste).

---

## 9. Plan de développement

| Étape | Contenu |
|---|---|
| **0 ✅** | Fondations : Next.js, TS strict, Tailwind, thème, structure, primitives UI |
| **1** | Dexie : schéma complet, repositories, types Xtream/TMDB/modèles |
| **2** | Auth & session : proxy `/api/xtream`, xtreamClient/api, secureSessionService, authStore, écran Login, bootstrap |
| **3** | **Diagnostic Xtream anonymisé** : stats, détection FR/étranger, suggestions blacklist, échantillons titres, rapport JSON anonymisé (aucune donnée sensible) |
| **4** | Sync catalogue : catalogSyncService, hydratation Dexie, catalogStore, progression |
| **5** | Live TV : catégories, liste virtualisée, recherche debounce, sélecteur pays, blacklist |
| **6** | Lecteur vidéo : composant isolé (HLS natif + fallback), erreurs, reprise, playbackStore |
| **7** | Films VOD : grille virtualisée, détail animé, favoris, progress bar |
| **8** | Séries : détail, saisons/épisodes, marquage vu/en cours/terminé |
| **9** | TMDB : proxy, matcher (nettoyage titres), cache Dexie, retry, fallback |
| **10** | Accueil : rails Continuer / favoris / récents / populaires |
| **11** | Favoris · Recherche · Réglages (blacklist UI, déconnexion) |
| **12** | PWA : manifest, service worker (assets oui / vidéo non), icônes, splash iOS |
| **13** | Durcissement : états loading/empty/error partout, perfs iPhone, flux morts |

Règle : avancer module par module ; à chaque étape, fichiers créés/modifiés + choix
techniques justifiés.

---

## 10. Football (refonte oct. 2026)

```
/api/football?comps=…  ──►  server/football/feed.ts
                               ├─ espn.ts          matchs + scores live (ESPN, sans clé)
                               ├─ footballData.ts  secours (FOOTBALL_API_KEY)
                               ├─ tvGuide.ts       guide XMLTV FR en flux, cache 3 h
                               └─ broadcasts.ts    chaîne exacte / multiplex / probable
client : useFootballFeed (polling 30 s live / 2 min) → services/football/*
         (channelIndex : chaîne TV → chaîne du bouquet ; EPG Xtream en complément)
UI : bandeau d'accueil (FootballHeader, lien « Tous les matchs »), page /football
     (hors navigation), fiche FootballMatchModal
```

- **Fiabilité des chaînes** : `confirmed` = le guide TV FR montre CE match sur
  cette chaîne au coup d'envoi (attribution gloutonne : un créneau = un match) ;
  `probable` = droits observés dans le guide (≥ 2 occurrences), sinon table
  2026-27. Les chaînes à numéro d'événement (Canal+ Live N, beIN MAX N,
  Ligue 1+ N) ne sont jamais « probables ».
- **Source vérifiée** (oct. 2026) : sur 4 jours, ~80 % des matchs ont leur
  chaîne exacte (100 % Europa/Conférence/Premier League), aucun sans diffusion.
- Cron Vercel `/api/football?warm=1` : préchauffe le guide.

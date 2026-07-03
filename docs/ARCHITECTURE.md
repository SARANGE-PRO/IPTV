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
(IndexedDB) · Framer Motion · HLS natif + fallback hls.js · TMDB. Paquets : **npm**.

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
├── stores/                    # 7 stores Zustand séparés
├── services/
│   ├── xtream/                # client + api typée + urls vidéo + normalize
│   ├── tmdb/                  # client + matcher (nettoyage titres) + cache
│   ├── session/               # secureSessionService
│   ├── sync/                  # catalogSyncService (fetch -> Dexie)
│   ├── cache/                 # invalidation
│   └── diagnostics/           # catalogDiagnosticService, anonymizeReport,
│                              # blacklistSuggestions   ← mode diagnostic
├── db/                        # Dexie : database.ts + repositories/
├── hooks/                     # useDebounce, useMediaQuery, useVirtualList…
├── lib/                       # cn(), registerServiceWorker…
├── types/                     # models, xtream, tmdb, diagnostics
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

## 4. Stores Zustand (7)

Sélecteurs fins, persistance déléguée aux services, séparation données brutes /
filtrées / préférences.

- **authStore** — status, isRestoring, error, rememberMe · login/logout/
  restoreSession/testConnection/refreshSessionStatus. Aucune logique lourde.
- **catalogStore** — **catégories** + métadonnées de sync uniquement (jamais les
  milliers de flux/films en RAM) · hydrateFromDb, syncSection, invalidate.
- **filterStore** — query/debouncedQuery, country (défaut FR), language,
  selectedCategories, blacklist (`Set`), hide/unhide, resetFilters.
- **favoritesStore** — live/vod/series (`Set`), isFavorite O(1), toggle, hydrate.
- **playbackStore** — continueWatching, recentChannels, get/saveProgress
  (throttlé → Dexie), markFinished, clearHistory.
- **settingsStore** — pays/langue par défaut, prefs lecteur/UI/blacklist.
- **tmdbStore** — statut d'enrichissement ; cache réel dans Dexie via
  `tmdbCacheService`. Enrichissement non bloquant.

---

## 5. Dexie.js / IndexedDB

```
sessions                 id
xtream_live_categories   id, name, isFrench
xtream_live_streams      id, categoryId, name, isFrench
xtream_vod_categories    id, name, isFrench
xtream_vod_streams       id, categoryId, name, added, isFrench
xtream_series_categories id, name, isFrench
xtream_series            id, categoryId, name, isFrench
xtream_series_details    seriesId
tmdb_cache               key, type, fetchedAt
favorites                [type+itemId], type, addedAt
playback_history         [type+itemId], type, updatedAt, finished
hidden_categories        [section+categoryId], section
settings                 key
sync_metadata            section
search_index             token
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

---

## 7. Performance (gros volumes)

- Jamais des milliers d'items d'un coup → **virtualisation** + pagination Dexie.
- Listes lourdes **hors Zustand** (catalogStore ne garde que les catégories).
- Sélecteurs fins ; `Set` pour favoris/blacklist (test O(1)).
- Recherche : **debounce** + index inversé local (`search_index`).
- Sync par section, écritures Dexie en **bulk**, barre de progression.
- Lazy-load posters (IntersectionObserver) et composants lourds (player, hls.js).
- TMDB **non bloquant** : l'UI ne dépend jamais de TMDB pour fonctionner.

### Lecteur vidéo (piège Safari)
Safari iOS lit le **HLS `.m3u8` nativement** (aucun CORS requis pour `<video>`),
mais **pas** le MPEG-TS `.ts` brut. → l'URL builder demande `.m3u8` pour le Live.
hls.js seulement si HLS natif absent ; `mpegts.js` en option pour `.ts`. Le player
abstrait la détection de format et gère flux mort / timeout / format non supporté.

---

## 8. Mode diagnostic anonymisé (amendement — important)

Analyse le catalogue Xtream **sans jamais exposer les accès**.

**`services/diagnostics/`**
- `catalogDiagnosticService.ts` — stats Live/VOD/Séries, détection catégories FR
  vs étrangères, échantillons de nettoyage de titres pour TMDB.
- `blacklistSuggestions.ts` — suggestions de blacklist initiale (réactivables).
- `anonymizeReport.ts` — produit un `DiagnosticReport` JSON exportable.

**`utils/`** — `redaction.ts`, `sensitiveDataGuards.ts` (vérifie l'absence de
données sensibles avant export), `countryDetection.ts`.

**Garanties** : rapport **généré à la demande, jamais persisté**. Ne contient
JAMAIS username, password, URL complète, liens `.m3u8`/`.ts`/`.mp4`, ni tokens.
Types : `src/types/diagnostics.ts`.

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

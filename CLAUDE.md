# CLAUDE.md — IPTV PWA

Règles et invariants du projet. Détail complet dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Nature du projet
PWA IPTV premium (Live TV · Films · Séries) sur API Xtream Codes personnelle.
Cible prioritaire : Safari iOS/iPadOS installé en PWA. Déploiement Vercel.
Usage personnel légitime — aucune solution de contournement DRM/piratage.

## Stack
Next.js App Router · TypeScript **strict** · Tailwind · Zustand (stores séparés)
· Dexie.js/IndexedDB · Framer Motion · HLS natif + fallback hls.js · TMDB.
Gestionnaire de paquets : **npm**.

## Invariants non négociables
1. **Sens des dépendances** : `components → hooks → stores → services → db/api`.
   Jamais l'inverse. Les composants n'appellent jamais fetch/Dexie directement.
2. **Proxy `/api/xtream` = MÉTADONNÉES uniquement.** Aucun flux vidéo
   (`.m3u8` / `.ts` / `.mp4`) ne transite par Vercel — coût, latence, blocages.
   La vidéo utilise l'URL directe du serveur Xtream, jamais mise en cache SW.
   Deux cibles : Vercel (HTTPS → passerelle `infra/media-gateway` pour les flux
   HTTP) et coquille HTTP pure (`infra/http-shell`, `NEXT_PUBLIC_PLAIN_HTTP=1`
   → flux directs sans passerelle). Toute logique de schéma vit dans
   `utils/secureUrl.ts`, jamais dans les composants.
8. **Export statique possible** : aucune route dynamique `[id]`. Détail film/
   série = `?vod=` / `?series=` (modal `DetailModalHost`), Live =
   `/live/watch?id=`. Liens uniquement via `utils/appRoutes.ts`. Les appels
   `/api/*` passent par `services/apiBase.ts`. Jamais d'import depuis `app/api`
   hors des routes (types partagés dans `src/types/`).
3. **Session locale minimale** (table `sessions`) : `serverUrl`, `username`,
   `password` **seulement si « Se souvenir de moi »**, `createdAt`,
   `lastValidatedAt`, `sessionStatus`. Manipulée uniquement via
   `secureSessionService`. Limites PWA assumées (pas de Keychain).
4. **Mode diagnostic anonymisé** : rapports générés **à la demande**, **jamais
   persistés**. Un rapport ne contient JAMAIS username/password/URL complète/
   liens de flux/tokens. Voir `utils/redaction.ts` + `utils/sensitiveDataGuards.ts`.
5. **Priorité France** : tri par pertinence (flag `isFrench`), pas de suppression.
   Les autres pays restent accessibles via le sélecteur. Blacklist = masquage
   durable et réactivable, distinct du sélecteur pays. Films/séries : la
   **variante de langue** (`VF|MULTI|VOSTFR|VO|OTHER`) est calculée UNE fois à
   la normalisation par `utils/mediaTitle.ts` (parseur unique, pur) et
   persistée/indexée ; jamais recalculée à l'affichage. Une carte par titre :
   versions regroupées par `groupKey` (`groupRank`/`laneRank`, service
   `catalogGroupingService`), représentant choisi selon la préférence de langue.
6. **Performance gros volumes** : les listes lourdes (chaînes/films) vivent dans
   **Dexie**, lues paginées/virtualisées — **jamais** en masse dans Zustand.
   Sélecteurs fins, `Set` pour favoris/blacklist, debounce sur la recherche.
7. **Lecteur** : préférer `.m3u8` (compat Safari natif) ; hls.js seulement si
   nécessaire ; `mpegts.js` en option pour flux MPEG-TS bruts. Toujours gérer
   flux mort / timeout / format non supporté sans crash. MKV sur coquille HTTP :
   remux navigateur (`utils/matroska.ts`, `utils/fmp4.ts`, `utils/mkvRemuxer.ts`
   = briques PURES, imports relatifs, testables en Node avec ffmpeg ;
   `services/player/mkvDirectEngine.ts` = liaison MediaSource). Jamais de
   décodage en JS. **Lecteur unique** : une seule `<video>` pour toute l'app
   (`components/player/host/PlayerHost`, monté dans le layout (app)). Les pages
   n'utilisent JAMAIS `VideoPlayer` directement mais `PlayerSlot` (mêmes props
   + `media`) : quitter la page laisse la lecture continuer en mini-lecteur.
   État dans `stores/playerStore`. La MÊME `<video>` enchaîne les flux (pas de
   `key` par session : iOS n'autorise le son qu'après un geste sur l'élément).
   Échecs transitoires relancés par le lecteur selon
   `services/player/playbackRecoveryPolicy.ts` (gel, coupure du direct,
   hors-ligne, autoplay refusé) ; `onError` = échec DÉFINITIF seulement.
   VLC : dernier recours, affiché uniquement si activé dans les Réglages.

## Football (refonte oct. 2026)
- Matchs/scores : API publique ESPN (`src/server/football/espn.ts`, sans clé,
  1 appel/compétition/mois) ; football-data.org = secours si clé configurée.
- Chaîne FR EXACTE : guide XMLTV xmltvfr.fr lu EN FLUX côté serveur
  (`tvGuide.ts`, client HTTP natif Node — jamais le `fetch` de Next sur ce
  fichier de 16 Mo), cache 3 h (`unstable_cache`), rattaché match par match
  (`broadcasts.ts` : affiche « A / B » ±30 min du coup d'envoi, noms EN↔FR
  dans `utils/footballMatch.ts`). Sinon « probable » : droits APPRIS du guide,
  puis table 2026-27 de `config/footballCompetitions.ts`. Jamais de certitude
  affichée sans le guide (ou l'EPG Xtream, confirmé côté client).
- Guide → bouquet : `services/football/tvChannels.ts` (`tvChannelKey`) +
  `channelIndex.ts`. Liste blanche de chaînes nationales (pas de régionales).

## Méthode de travail
- Avancer **module par module**, jamais tout d'un coup. Indiquer les fichiers
  créés/modifiés et justifier les choix.
- TypeScript strict : pas de `any` implicite, composants petits, logique métier
  hors composants.
- Toujours prévoir les états loading / empty / error / retry.

## Commandes
```bash
npm run dev        # dev
npm run build      # build prod (type-check TS inclus)
npm run typecheck  # tsc --noEmit
```

## Plan (état)
Étape 0 ✅ Fondations · 1 Dexie · 2 Auth · 3 Diagnostic · 4 Sync · 5 Live ·
6 Player · 7 VOD · 8 Séries · 9 TMDB · 10 Accueil · 11 Favoris/Recherche/Réglages
· 12 PWA · 13 Durcissement.
Chantier « niveau Netflix » (oct. 2026) : P1 ✅ fondation langue · P2 ✅ dédup
versions · P3 ✅ enrichissement TMDB fiable · P4 ✅ accueil (`services/home/*`,
`useHomeFeed`, lecture directe `?play=1&ep=`) · P5 ✅ fiches/séries (épisode
suivant auto, épisodes riches, vu/non vu, bande-annonce, saga, similaires) ·
P6 ✅ lecteur NATIF conservé + Media Session (écran verrouillé, épisode suivant) —
jamais d'overlay maison · P7 ✅ recherche (titres, genres, acteurs TMDB, récentes)
· P8 abandonné. Schéma Dexie v10 = purge
films/séries + resync.

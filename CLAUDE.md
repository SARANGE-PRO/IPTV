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
   **Live FR** : grille rangée UNE fois (après synchro / montée de
   `LINEUP_VERSION`) dans `live_lineup` par `services/live/frenchLineupService`
   (classeur pur `frenchLineupClassifier` + référentiel `utils/frenchChannelReference`,
   numérotation TNT Arcom 2025) ; la page Live et le zapping la lisent telle
   quelle. Toucher au référentiel ou aux sections = incrémenter `LINEUP_VERSION`.
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
   `services/player/playbackRecoveryPolicy.ts` (gel, coupure du direct, pause subie tampon vide,
   hors-ligne, autoplay refusé) ; `onError` = échec DÉFINITIF seulement.
   Supervision dans `services/player/playbackSession.ts` (testée) — `VideoPlayer`
   ne fait que brancher ; sans session la `<video>` reste montée (src vide).
   VLC : dernier recours, affiché uniquement si activé dans les Réglages.
   **PiP** (`services/player/pictureInPicture`, `PipButton`, interrupteur
   Réglages) : iOS n'ouvre le PiP QUE dans un tap (jamais à la mise en
   arrière-plan) ; pendant le PiP la surface est FIGÉE (`setSurfaceFrozen` :
   déplacer la `<video>` fermerait le PiP), sauf si sa page se ferme.
   Exception : bouton **« Diffuser sur la TV »** (`components/player/CastButton`,
   icône Cast dans l'en-tête du lecteur / des fiches, visible par défaut,
   désactivable) — une PWA ne peut pas caster (kit Google Cast natif) : il
   ouvre le flux dans VLC, qui caste vers Android TV / Chromecast.

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
- La MÊME analyse du guide produit le programme 24 h des chaînes du
  référentiel FR (`parseGuide` → `/api/tvguide`, clé = nom du référentiel =
  `LineupGroup.name`) : « en cours » sous chaque chaîne Live (`useTvNow`).

## Méthode de travail
- Avancer **module par module**, jamais tout d'un coup. Indiquer les fichiers
  créés/modifiés et justifier les choix.
- TypeScript strict : pas de `any` implicite, composants petits, logique métier
  hors composants.
- Toujours prévoir les états loading / empty / error / retry.
- Tactile d'abord (iPhone) : cibles ≥ 44 px (classe `hit-44` si le visuel est
  plus petit), `hover:` réservé à la souris (`hoverOnlyWhenSupported`), jamais
  d'action accessible seulement au survol. Gestes : glisser la vidéo vers le
  bas = réduire (seulement page en haut), swipe ← → sur la vidéo Live = zapper,
  fiche tirée vers le bas = fermer, appui long (`useLongPress`) = options.

## Commandes
```bash
npm run dev        # dev
npm run build      # build prod (type-check TS inclus)
npm run typecheck  # tsc --noEmit
npm run lint       # eslint . (flat config, `next lint` deprecie)
npm test           # vitest : briques PURES (tests/*.test.ts)
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
films/séries + resync. v11 = tables additives (grille Live FR, onglets de
favoris), sans resync. Live : grille FR + onglets de favoris + 10 récents ✅.
Live intelligent (oct. 2026) ✅ : versions apprises (`streamReliabilityService`
+ `utils/versionRanking`, local), réseau faible → HD (`networkQualityService`),
épisode suivant hors fiche (`seriesAutoplayService`, `PlayerHandlers.next`),
« Nouveaux épisodes » (`newEpisodesService`), liste latérale iPad, synchro
auto > 7 j (`useAutoSync`), preconnect flux (`mediaOrigin`).
Ergonomie (oct. 2026) ✅ : barre du bas avec Recherche (Réglages = engrenage de
l'accueil), lecteur (paysage plein écran partout, actions sur l'écran d'échec,
mini-lecteur annulable), Live (swipe, chaîne précédente, état conservé),
fiches (en-tête collant, glisser pour fermer), accueil réordonné.

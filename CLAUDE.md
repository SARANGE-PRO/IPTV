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
3. **Session locale minimale** (table `sessions`) : `serverUrl`, `username`,
   `password` **seulement si « Se souvenir de moi »**, `createdAt`,
   `lastValidatedAt`, `sessionStatus`. Manipulée uniquement via
   `secureSessionService`. Limites PWA assumées (pas de Keychain).
4. **Mode diagnostic anonymisé** : rapports générés **à la demande**, **jamais
   persistés**. Un rapport ne contient JAMAIS username/password/URL complète/
   liens de flux/tokens. Voir `utils/redaction.ts` + `utils/sensitiveDataGuards.ts`.
5. **Priorité France** : tri par pertinence (flag `isFrench`), pas de suppression.
   Les autres pays restent accessibles via le sélecteur. Blacklist = masquage
   durable et réactivable, distinct du sélecteur pays.
6. **Performance gros volumes** : les listes lourdes (chaînes/films) vivent dans
   **Dexie**, lues paginées/virtualisées — **jamais** en masse dans Zustand.
   Sélecteurs fins, `Set` pour favoris/blacklist, debounce sur la recherche.
7. **Lecteur** : préférer `.m3u8` (compat Safari natif) ; hls.js seulement si
   nécessaire ; `mpegts.js` en option pour flux MPEG-TS bruts. Toujours gérer
   flux mort / timeout / format non supporté sans crash.

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

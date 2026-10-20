# ZiBTV

Progressive Web App IPTV premium (Live TV · Films · Séries) consommant une API
Xtream Codes personnelle. Pensée mobile-first pour Safari iOS/iPadOS, installable
sur l'écran d'accueil, déployable sur Vercel.

> Usage strictement personnel avec des identifiants Xtream légitimes.

## Stack

Next.js (App Router) · TypeScript strict · Tailwind CSS · Zustand · Dexie.js
(IndexedDB) · Framer Motion · HLS natif + fallback hls.js · TMDB.

## Démarrer

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # build production
npm run typecheck
```

Copier `.env.example` en `.env.local` et renseigner les variables (TMDB à
l'étape 9). Les identifiants Xtream ne sont pas des variables d'env : ils sont
saisis dans l'interface puis stockés localement.

## Déploiement

- **Vercel** (HTTPS) : cible par défaut. Un Xtream HTTP-only y impose la passerelle
  média (`infra/media-gateway`) pour relayer les flux.
- **Coquille HTTP pure** (`infra/http-shell`) : sert l'app en HTTP, donc les
  flux MP4/HLS se lisent **en direct sans passerelle**. Gratuit en statique sur
  GitHub Pages (`npm run build:static`, routes `/api` laissées sur Vercel), ou
  en Docker sur une VM. Voir le README du dossier pour les pièges (HSTS,
  redirections, Private Relay).

## Documentation

Architecture complète, décisions de sécurité et plan de développement :
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## État

Cœur fonctionnel en place : authentification Xtream, synchronisation du
catalogue dans Dexie, Live TV (bouquet FR éditorial, EPG, logos), Films et
Séries avec métadonnées TMDB, lecteur (HLS natif Safari + fallback hls.js,
reprise de lecture, PiP, lecteur externe VLC), accueil éditorialisé (Top 10
recommandé, rails FR/récents/populaires), recherche globale, favoris, réglages
et mode diagnostic anonymisé.

En cours de durcissement : robustesse du lecteur (flux mort/timeout), PWA
offline, et perfs gros volumes. Voir le plan détaillé et les invariants dans
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) et [`CLAUDE.md`](CLAUDE.md).

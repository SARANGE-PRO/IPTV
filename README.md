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

## Documentation

Architecture complète, décisions de sécurité et plan de développement :
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## État

Étape 0 — Fondations. Voir le plan dans la doc d'architecture.

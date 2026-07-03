# Passerelle média HTTPS

> Variante sans VPS : voir `../cloudflare-worker/README.md`. Le déploiement
> Docker reste préférable au-delà des quotas gratuits du Worker.

Cette passerelle est destinée à un serveur Xtream disponible uniquement en
HTTP. Caddy termine TLS et renouvelle automatiquement le certificat. Le service
Node diffuse les réponses avec backpressure, conserve les requêtes `Range` et
réécrit toutes les URI des playlists HLS vers la passerelle HTTPS.

## Déploiement

1. Préparer un VPS Linux avec Docker et Docker Compose. Ouvrir les ports 80/443.
2. Faire pointer le DNS de `MEDIA_DOMAIN` vers l'IP du VPS.
3. Copier ce dossier sur le VPS, puis copier `.env.example` vers `.env`.
4. Renseigner `MEDIA_DOMAIN`, `UPSTREAM_ORIGIN` et les éventuels `ALLOWED_HOSTS`.
5. Lancer `docker compose up -d --build`.
6. Vérifier `https://MEDIA_DOMAIN/_health` (réponse `ok`).
7. Dans Vercel, ajouter `NEXT_PUBLIC_MEDIA_GATEWAY_URL=https://MEDIA_DOMAIN`,
   puis redéployer l'application.

La passerelle n'est pas un proxy ouvert : seules les origines listées sont
acceptées. Elle ne journalise volontairement pas les URL, car les chemins
Xtream contiennent les identifiants de l'abonnement.

Test local du moteur (sans Docker) : `node test.mjs`.

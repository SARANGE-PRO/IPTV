# Passerelle média auto-hébergée (maison)

Elle résout les deux blocages des providers IPTV grand public :

1. **CDN qui bloque les IP datacenter** (Cloudflare/Vercel/VPS → HTTP 456). Ici les
   requêtes sortantes partent de **l'IP de ta machine (résidentielle)**, que le CDN
   accepte (206).
2. **Conteneurs illisibles en navigateur** (MKV/AVI, HEVC-en-MKV…) : **remux /
   transcodage ffmpeg à la volée** vers du fMP4 fragmenté lisible par `<video>` —
   donc lisible **dans l'app sur iPhone/iPad, sans VLC**.

> **Une seule connexion Xtream.** La passerelle centralise : elle tire **1** flux
> du serveur et le sert à l'app. Ne lance qu'**une lecture à la fois** si ton
> compte est en `max_connections: 1`.

L'app détecte automatiquement si la passerelle répond (`/_health`) : elle n'y
route les MKV que si elle est joignable, sinon elle bascule proprement sur VLC.
**Côté app, il suffit donc de renseigner `NEXT_PUBLIC_MEDIA_GATEWAY_URL`** — aucun
autre flag n'est nécessaire.

---

## Méthode A — Windows + Tailscale Funnel (recommandée, sans domaine)

C'est ce que fait `start-windows.bat`. Aucun domaine ni Docker requis.

1. **Installer** [Tailscale pour Windows](https://tailscale.com/download/windows)
   et s'y connecter (compte gratuit). Installer ffmpeg : `winget install Gyan.FFmpeg`.
2. **Configurer** : `cp .env.example .env`, puis renseigner `UPSTREAM_ORIGIN`
   (ton serveur Xtream). `PORT` par défaut : 3000.
3. **Lancer** : double-clic sur `start-windows.bat`, accepter l'UAC. Le lanceur
   vérifie Tailscale, active le **Funnel public**, trouve ffmpeg, **bloque la mise
   en veille du PC automatiquement** (tant que la fenêtre reste ouverte) et démarre
   la passerelle en la relançant si besoin.
4. **URL publique** : le lanceur affiche ton URL Funnel
   (`https://<machine>.<tailnet>.ts.net`). Colle-la dans **Vercel → Settings →
   Environment Variables (Production)** :
   ```
   NEXT_PUBLIC_MEDIA_GATEWAY_URL=https://<machine>.<tailnet>.ts.net
   ```
   puis redéploie l'app.

Garde la fenêtre **ZiBTV - GARDER CETTE FENETRE OUVERTE** ouverte. L'écran peut
s'éteindre ; la veille système est empêchée automatiquement. Pour tout arrêter :
ferme la fenêtre.

---

## Méthode B — Docker + Cloudflare Tunnel (serveur toujours-ON)

Idéale sur un appareil **basse conso allumé en permanence** (Raspberry Pi, NAS…) :
c'est le vrai chemin « ça marche même en 5G loin de chez moi » sans dépendre d'un
PC de bureau. Nécessite un domaine géré dans Cloudflare (gratuit).

1. **Créer le tunnel** : Cloudflare → *Zero Trust* → *Networks* → *Tunnels* →
   *Create a tunnel* (type *Cloudflared*). Copie le **token**. Ajoute un
   *Public hostname* : `media.tondomaine.com` → **Service** `HTTP` → `gateway:8080`.
2. **Configurer** : `cp .env.example .env`, renseigne `UPSTREAM_ORIGIN` et
   `TUNNEL_TOKEN`.
3. **Lancer** : `docker compose up -d --build`. Vérifie :
   `https://media.tondomaine.com/_health` doit répondre `ok`.
4. **Brancher l'app** (Vercel, Production) :
   `NEXT_PUBLIC_MEDIA_GATEWAY_URL=https://media.tondomaine.com`, puis redéploie.

> ⚠️ Un **VPS** (IP datacenter) réintroduit le blocage 456. L'hébergement
> **résidentiel** (tunnel ci-dessus) est le seul qui garantit le 206.

---

## Notes

- **Codec vidéo** : `VIDEO_CODEC=copy` (défaut) = remux léger, parfait pour
  **iPhone/iPad** (Safari décode H.264 **et** HEVC). Pour Chrome/Firefox sur du
  HEVC, passe à `VIDEO_CODEC=libx264` (plus gourmand en CPU).
- **Seek** : en transcodage la lecture est progressive (l'avance rapide peut être
  limitée). Le passthrough (MP4/HLS natif, sans passerelle) garde le seek complet.
- **Veille** : plus besoin d'y penser sous Windows — `start-windows.bat` bloque la
  veille système via `keep-awake.ps1` (état libéré à la fermeture). En Docker, la
  machine hôte doit simplement rester allumée.
- **Sécurité** : seul le 1er hôte est allowlisté (anti-SSRF) ; les redirections CDN
  (IP changeante) sont suivies automatiquement. Garde l'URL du tunnel privée ou
  protège-la via *Cloudflare Access*. Aucune URL ni aucun identifiant n'est
  journalisé ; les identifiants restent dans les URL générées par l'app.

Test local du moteur (sans Docker ni tunnel) : `node test.mjs`.

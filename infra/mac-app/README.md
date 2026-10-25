# Coquille Mac native

Fenêtre WKWebView (moteur Safari) qui charge la coquille HTTP, sans barre
d'adresse ni bandeau « Non sécurisé ». HLS natif, PiP, plein écran, touches
multimédia : identiques à Safari. Aucune logique métier ici.

```bash
./build.sh                                # → build/IPTV.app
APP_URL=http://192.168.1.10/ ./build.sh   # autre coquille
cp -R build/IPTV.app /Applications/
```

- Changer l'URL sans recompiler : `defaults write fr.sarange.iptv url http://…/`
- Données (IndexedDB, session) propres à l'app : se reconnecter une fois.
- `vlc-x-callback://` / `vlc://` et liens externes → ouverts par macOS.
- Web Inspector : Safari → Développement → IPTV.
- Signature ad hoc : si Gatekeeper bloque sur un autre Mac, clic droit → Ouvrir.

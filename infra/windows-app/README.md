# Coquille Windows native (Tauri)

Fenêtre WebView2 (moteur Edge/Chromium) qui charge la coquille HTTP, sans
barre d'adresse ni « Non sécurisé ». Lecture identique à Chrome (hls.js,
remux MKV). Pendant de `infra/mac-app`. Aucune logique métier ici.

## Récupérer l'installateur
Compilé par GitHub Actions (`.github/workflows/windows-app.yml`) à chaque
push touchant ce dossier, ou à la main (Actions → Windows app → Run workflow).
Télécharger l'artefact `IPTV-windows` → `IPTV_x.y.z_x64-setup.exe`.
App non signée : SmartScreen → « Informations complémentaires » →
« Exécuter quand même ».

## Compiler en local (sous Windows)
Rust + Visual Studio Build Tools, puis :
```bash
npm install && npm run icon && npm run build
# autre coquille : set IPTV_APP_URL=http://192.168.1.10/ avant le build
```

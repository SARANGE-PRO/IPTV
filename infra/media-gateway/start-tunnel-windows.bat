@echo off
REM ============================================================================
REM  Tunnel Cloudflare -> passerelle locale (port 3000) = HTTPS stable, gratuit.
REM
REM  1. Cree un tunnel : Cloudflare > Zero Trust > Networks > Tunnels > Create
REM       - type "Cloudflared", copie le TOKEN affiche.
REM       - Public hostname : media.tondomaine.com  ->  Service HTTP  ->  localhost:3000
REM  2. Colle le token dans un fichier "tunnel-token.txt" a cote de ce .bat.
REM  3. Lance d'abord start-windows.bat (la passerelle), puis double-clique celui-ci.
REM ============================================================================
cd /d "%~dp0"
if not exist tunnel-token.txt (
  echo [ERREUR] Cree un fichier "tunnel-token.txt" contenant uniquement ton token Cloudflare.
  pause
  exit /b 1
)
set /p TUNNEL_TOKEN=<tunnel-token.txt
echo Tunnel en cours... (Ctrl+C pour arreter)
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --no-autoupdate run --token %TUNNEL_TOKEN%
pause

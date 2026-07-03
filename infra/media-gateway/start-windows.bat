@echo off
REM ============================================================================
REM  ZiBTV - LA SEULE FENETRE A GARDER OUVERTE POUR REGARDER HORS DE CHEZ SOI
REM ============================================================================

REM Tailscale sous Windows protege son API locale : elevation UAC automatique.
fltmc >nul 2>nul
if errorlevel 1 (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

title ZiBTV - GARDER CETTE FENETRE OUVERTE
cd /d "%~dp0"

REM Les valeurs privees sont dans .env (ignore par Git), jamais dans ce script.
if not exist ".env" (
  echo [ERREUR] Configuration locale absente : infra\media-gateway\.env
  echo Copie .env.example vers .env puis renseigne UPSTREAM_ORIGIN.
  pause
  exit /b 1
)
for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do set "%%A=%%B"

if not defined UPSTREAM_ORIGIN (
  echo [ERREUR] UPSTREAM_ORIGIN est absent de .env.
  pause
  exit /b 1
)
if not defined PORT set "PORT=3000"
if not defined VIDEO_CODEC set "VIDEO_CODEC=libx264"
if not defined TRANSCODE set "TRANSCODE=1"

REM La production Vercel utilise le Funnel Tailscale public de CE PC.
set "TAILSCALE_EXE=%ProgramFiles%\Tailscale\tailscale.exe"
set "TAILSCALE_IPN=%ProgramFiles%\Tailscale\tailscale-ipn.exe"
if not exist "%TAILSCALE_EXE%" (
  echo [ERREUR] Tailscale est absent. Installe-le depuis https://tailscale.com/download/windows
  pause
  exit /b 1
)

"%TAILSCALE_EXE%" status >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ACTION REQUISE] Tailscale est deconnecte.
  if exist "%TAILSCALE_IPN%" start "" "%TAILSCALE_IPN%"
  echo 1. Clique l'icone Tailscale pres de l'horloge.
  echo 2. Clique Log in / Se connecter et valide dans le navigateur.
  echo 3. Reviens ici puis appuie sur une touche.
  pause
  "%TAILSCALE_EXE%" status >nul 2>nul
  if errorlevel 1 (
    echo [ERREUR] Tailscale est toujours deconnecte. Reconnecte-le puis relance ce fichier.
    pause
    exit /b 1
  )
)

echo Verification du Funnel Tailscale vers le port %PORT%...
"%TAILSCALE_EXE%" funnel --bg --yes %PORT%
if errorlevel 1 (
  echo [ERREUR] Impossible d'activer le Funnel Tailscale.
  echo Verifie la connexion Tailscale puis relance ce fichier en acceptant la fenetre UAC.
  pause
  exit /b 1
)

echo.
echo  Ton URL publique HTTPS - a coller dans NEXT_PUBLIC_MEDIA_GATEWAY_URL cote Vercel :
"%TAILSCALE_EXE%" funnel status

REM Un double-clic ne doit pas echouer si la passerelle tourne deja.
set "GATEWAY_HEALTH="
for /f "delims=" %%H in ('curl.exe --silent --fail "http://127.0.0.1:%PORT%/_health" 2^>nul') do set "GATEWAY_HEALTH=%%H"
if /I "%GATEWAY_HEALTH%"=="ok" (
  echo.
  echo  ================================================================
  echo   ZiBTV est DEJA ACTIF sur le port %PORT%.
  echo   Le Funnel Tailscale est actif. Tu peux fermer CETTE nouvelle fenetre.
  echo   La fenetre d'origine deja ouverte bloque la veille du PC.
  echo  ================================================================
  echo.
  pause
  exit /b 0
)

REM Trouve ffmpeg automatiquement : PATH, puis installation Winget.
if not defined FFMPEG_PATH (
  where ffmpeg.exe >nul 2>nul && set "FFMPEG_PATH=ffmpeg.exe"
)
if not defined FFMPEG_PATH (
  if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe" set "FFMPEG_PATH=%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe"
)
if not defined FFMPEG_PATH (
  echo [ERREUR] ffmpeg est introuvable. Installe-le avec : winget install Gyan.FFmpeg
  pause
  exit /b 1
)

echo.
echo  ================================================================
echo   ZiBTV est ACTIF. Garde cette fenetre ouverte.
echo   Funnel Tailscale public : actif.
echo   La mise en veille est BLOQUEE automatiquement tant que cette
echo   fenetre est ouverte. L'ecran, lui, peut s'eteindre sans risque.
echo   Pour arreter la lecture distante : ferme cette fenetre.
echo  ================================================================
echo   Sante locale : http://localhost:%PORT%/_health
echo.
REM Lance node via un superviseur PowerShell qui (1) empeche la veille du PC
REM tant que la fenetre est ouverte et (2) relance la passerelle si elle quitte.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0keep-awake.ps1"
echo.
echo [ARRET] La passerelle ZiBTV n'est plus active.
pause

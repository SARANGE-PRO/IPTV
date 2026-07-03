@echo off
REM ============================================================================
REM  ZiBTV - LA SEULE FENETRE A GARDER OUVERTE POUR REGARDER HORS DE CHEZ SOI
REM ============================================================================
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
if not defined VIDEO_CODEC set "VIDEO_CODEC=copy"
if not defined TRANSCODE set "TRANSCODE=1"

REM Le tunnel est relance automatiquement s'il n'est pas deja actif.
tasklist /FI "IMAGENAME eq cloudflared.exe" 2>nul | find /I "cloudflared.exe" >nul
if errorlevel 1 if exist "tunnel-token.txt" start "ZiBTV Tunnel" /min "%~dp0start-tunnel-windows.bat"

REM Un double-clic ne doit pas echouer si la passerelle tourne deja.
set "GATEWAY_HEALTH="
for /f "delims=" %%H in ('curl.exe --silent --fail "http://127.0.0.1:%PORT%/_health" 2^>nul') do set "GATEWAY_HEALTH=%%H"
if /I "%GATEWAY_HEALTH%"=="ok" (
  echo.
  echo  ================================================================
  echo   ZiBTV est DEJA ACTIF sur le port %PORT%.
  echo   Le tunnel est lance. Tu peux fermer CETTE nouvelle fenetre.
  echo   Ne mets pas le PC en veille pendant une lecture distante.
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
echo   Tu peux eteindre l'ecran, mais ne mets pas le PC en veille.
echo   Pour arreter la lecture distante : ferme cette fenetre.
echo  ================================================================
echo   Sante locale : http://localhost:%PORT%/_health
echo.
node server.mjs
echo.
echo [ARRET] La passerelle ZiBTV n'est plus active.
pause

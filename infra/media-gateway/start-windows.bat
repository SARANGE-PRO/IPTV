@echo off
REM ============================================================================
REM  Passerelle media ZiBTV — lancement local (Windows)
REM  Prerequis : Node 18+  et  ffmpeg  ( winget install Gyan.FFmpeg )
REM  Double-clique ce fichier pour demarrer le proxy sur le port 3000.
REM ============================================================================

REM --- Origine HTTP de ton serveur Xtream (host + port, SANS chemin final) ---
set "UPSTREAM_ORIGIN=http://absuqvet.top"

REM --- Port local ecoute par la passerelle (a rediriger depuis la box) -------
set "PORT=3000"

REM --- Transcodage : copy = remux leger (Safari lit H.264 + HEVC).
REM     Mets libx264 si tu veux la compat Chrome/Firefox sur du HEVC (CPU +). -
set "VIDEO_CODEC=copy"
set "TRANSCODE=1"

REM Chemin ffmpeg installe via winget (Gyan.FFmpeg). Si tu mets a jour ffmpeg,
REM ajuste le numero de version dans le chemin, ou laisse vide si ffmpeg est sur le PATH.
set "FFMPEG_PATH=C:\Users\anged\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"

cd /d "%~dp0"
echo.
echo  Passerelle sur http://localhost:%PORT%   (Ctrl+C pour arreter)
echo  Test sante :  http://localhost:%PORT%/_health   =^> doit afficher : ok
echo.
node server.mjs
pause

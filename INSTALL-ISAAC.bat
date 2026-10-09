@echo off
chcp 65001 >nul
title Installation Isaac IA Juniors v2
cd /d "%~dp0"
set "PROJ=%~dp0"

echo.
echo   ============================================================
echo     ISAAC IA JUNIORS — Installation
echo     L'equipe d'Isaac : Aelyra, Jeanette, Onyx, Aegis
echo   ============================================================
echo.

REM --- 1. Node.js : verifier, sinon proposer le telechargement ---
where node >nul 2>&1
if errorlevel 1 (
  echo   [!] Node.js n'est pas installe. Il est indispensable.
  echo.
  choice /C ON /M "  Telecharger et installer Node.js maintenant (O) ou quitter (N)"
  if errorlevel 2 (
    echo   Installez Node.js sur https://nodejs.org puis relancez ce fichier.
    pause
    exit /b 1
  )
  echo   Telechargement de Node.js LTS...
  powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/latest-v20.x/node-v20.18.1-x64.msi' -OutFile \"$env:TEMP\node-lts.msi\""
  if errorlevel 1 (
    echo   [ERREUR] Telechargement impossible. Installez Node.js manuellement.
    pause
    exit /b 1
  )
  echo   Installation de Node.js...
  msiexec /i "%TEMP%\node-lts.msi" /qn /norestart
  echo   [OK] Node.js installe. Relancez ce fichier pour continuer.
  pause
  exit /b 0
)
for /f "tokens=*" %%v in ('node --version') do set NODEV=%%v
echo   [OK] Node.js %NODEV% detecte.

REM --- 2. Port 3777 libre ? ---
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 3777 -State Listen -ErrorAction SilentlyContinue; if ($c) { exit 1 } else { exit 0 }"
if errorlevel 1 (
  echo   [!] Le port 3777 est deja utilise — Isaac tourne peut-etre deja.
  echo       Fermez l'autre instance avant de continuer.
  pause
)

REM --- 3. Raccourcis + demarrage auto (PowerShell) ---
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJ%install-step.ps1"
if errorlevel 1 (
  echo   [ERREUR] L'installation PowerShell a echoue.
  pause
  exit /b 1
)
echo   [OK] Demarrage automatique avec Windows
echo   [OK] Raccourci Bureau : "Isaac IA Juniors"
echo   [OK] Lanceur silencieux : isaac-launch.vbs

REM --- 4. Adresse du compagnon mobile (Wi-Fi local) ---
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=*" %%b in ("%%a") do set "IP=%%b" & goto :ipok
)
:ipok
echo.
echo   [OK] Compagnon mobile : sur votre telephone (meme Wi-Fi),
echo       ouvrez http://%IP%:3777/compagnon.html

echo.
echo   Isaac s'eveille maintenant...
timeout /t 2 /nobreak >nul
start "" wscript "%PROJ%isaac-launch.vbs"

echo.
echo   ============================================================
echo     Termine ! Isaac est dans votre systeme.
echo.
echo     - Au demarrage du PC, il se reveille seul.
echo     - Double-cliquez "Isaac IA Juniors" (Bureau) pour le reveiller.
echo     - Cliquez une fois dans la fenetre, puis dites "Isaac, ..."
echo     - Telephone : http://%IP%:3777/compagnon.html (meme Wi-Fi)
echo.
echo     Pour le retirer : supprimez "Isaac IA Juniors" du dossier
echo     Demarrage (Win+R, tapez shell:startup) et du Bureau.
echo   ============================================================
echo.
pause

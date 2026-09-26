@echo off
chcp 65001 >nul
title Installer Isaac IA Juniors dans le systeme
cd /d "%~dp0"
set "PROJ=%~dp0"

echo.
echo   ==================================================
echo    INSTALLATION D'ISAAC IA JUNIORS DANS LE SYSTEME
echo   ==================================================
echo.

REM --- 1. Verifier que Node.js est la ---
where node >nul 2>&1
if errorlevel 1 (
  echo   [ERREUR] Node est introuvable dans le chemin Windows.
  echo   Installez-le d'abord sur https://nodejs.org puis relancez ce fichier.
  echo.
  pause
  exit /b 1
)
echo   [OK] Node.js detecte.

REM --- 2. Detecter le navigateur + creer les raccourcis (via PowerShell) ---
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJ%install-step.ps1"
if errorlevel 1 (
  echo   [ERREUR] L'installation PowerShell a echoue.
  echo.
  pause
  exit /b 1
)
echo   [OK] Navigateur enregistre + demarrage auto avec Windows installe
echo   [OK] Raccourci Bureau : "Isaac IA Juniors"

echo.
echo   [OK] Lanceur silencieux : isaac-launch.vbs
echo.
echo   Isaac s'eveille maintenant...
echo.
timeout /t 2 /nobreak >nul
start "" wscript "%PROJ%isaac-launch.vbs"

echo.
echo   ==================================================
echo    Terminee ! Isaac est desormais dans votre systeme.
echo.
echo    - A chaque demarrage du PC, il se reveillera seul.
echo    - Double-cliquez sur "Isaac IA Juniors" (Bureau)
echo      pour le reveiller a tout moment.
echo    - Dans la fenetre : cliquez une fois, puis dites
echo      "Isaac, ..." pour lui parler.
echo.
echo    Pour le retirer du systeme : supprimez le raccourci
echo    "Isaac IA Juniors" dans le dossier Demarrage
echo    (Win+R, tapez shell:startup) et sur le Bureau.
echo   ==================================================
echo.
pause

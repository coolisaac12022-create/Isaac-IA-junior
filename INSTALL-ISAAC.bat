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

REM --- 2. Detecter Edge ou Chrome et le memoriser ---
set "BROWSER="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER set "BROWSER=msedge"
echo   [OK] Navigateur configure : %BROWSER%
setx ISAAC_BROWSER "%BROWSER%" >nul

REM --- 3. Raccourci dans le dossier Demarrage de Windows (auto-start) ---
powershell -NoProfile -Command "$ws=New-Object -ComObject WScript.Shell; $s=[Environment]::GetFolderPath('Startup'); $lnk=$ws.CreateShortcut($s+'\Isaac IA Juniors.lnk'); $lnk.TargetPath='wscript.exe'; $lnk.Arguments='\"%PROJ%isaac-launch.vbs\"'; $lnk.WorkingDirectory='%PROJ%'; $lnk.Description='Isaac IA Juniors - demarrage automatique'; $lnk.IconLocation='shell32.dll,137'; $lnk.Save()" >nul 2>&1
if errorlevel 1 (
  echo   [!] Raccourci Demarrage non cree (PowerShell refuse).
) else (
  echo   [OK] Demarrage automatique avec Windows : installe
)

REM --- 4. Raccourci sur le Bureau ---
powershell -NoProfile -Command "$ws=New-Object -ComObject WScript.Shell; $d=[Environment]::GetFolderPath('Desktop'); $lnk=$ws.CreateShortcut($d+'\Isaac IA Juniors.lnk'); $lnk.TargetPath='wscript.exe'; $lnk.Arguments='\"%PROJ%isaac-launch.vbs\"'; $lnk.WorkingDirectory='%PROJ%'; $lnk.Description='Reveiller Isaac IA Juniors'; $lnk.IconLocation='shell32.dll,137'; $lnk.Save()" >nul 2>&1
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

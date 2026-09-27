@echo off
rem ============================================================
rem  ISAAC IA JUNIORS - Cerveau avec auto-restart
rem  Si node plante, il repart tout seul au bout de 5 secondes.
rem  Utilise par isaac-launch.vbs (fenetre cachee) et ISAAC-IJ.bat.
rem ============================================================
title Isaac IA Juniors - Cerveau
cd /d "%~dp0"

:loop
node server.js
echo.
echo [ISAAC] Mon cerveau s'est arrete. Redemarrage dans 5 secondes...
echo         (Fermez cette fenetre ou redemarrez le PC pour arreter Isaac.)
timeout /t 5 /nobreak >nul
goto loop

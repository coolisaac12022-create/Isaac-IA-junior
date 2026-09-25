@echo off
title ISAAC IA JUNIORS - Serveur
cd /d %~dp0
echo.
echo   ============================================
echo    ISAAC IA JUNIORS demarre...
echo    Ne fermez pas cette fenetre.
echo   ============================================
echo.
timeout /t 2 /nobreak >nul
start "" http://localhost:3777
node server.js
pause

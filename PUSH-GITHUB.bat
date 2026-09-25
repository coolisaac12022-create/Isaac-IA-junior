@echo off
title Deploy Isaac IA Juniors sur GitHub
cd /d %~dp0
echo.
echo   ==================================================
echo    DEPLOIEMENT GITHUB - ISAAC IA JUNIORS
echo   ==================================================
echo.
echo   Etape 1 : une page GitHub va s'ouvrir.
echo   - Nom du depot : isaac-ia-juniors
echo   - Choisis PUBLIC
echo   - NE COCHE rien (ni README, ni .gitignore, ni licence)
echo   - Clique "Create repository"
echo.
start "" https://github.com/new
echo   Etape 2 : apres avoir cree le depot, presse une touche ici.
echo.
pause
git remote remove origin 2>nul
git remote add origin https://github.com/coolisaac12022-create/isaac-ia-juniors.git
echo   Envoi du code vers GitHub (une fenetre de connexion GitHub
echo   peut s'ouvrir : connecte-toi, c'est securise)...
git push -u origin main
if errorlevel 1 (
  echo.
  echo   Le depot distant contenait peut-etre deja un fichier.
  echo   Nouvelle tentative avec recuperation...
  git pull --rebase origin main
  git push -u origin main
)
echo.
echo   termine ! Verifie sur https://github.com/coolisaac12022-create/isaac-ia-juniors
pause

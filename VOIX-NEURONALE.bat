@echo off
rem ==========================================================================
rem  VOIX-NEURONALE.BAT - installe le moteur de voix neuronal LOCAL d'Aelyra
rem --------------------------------------------------------------------------
rem  Ce que fait ce fichier, et rien d'autre :
rem    1) pose Piper (piper.exe + ses DLL + espeak-ng-data) dans jarvis\tts\piper
rem    2) pose les modeles de voix francaises dans jarvis\tts\voix
rem    3) verifie ce qu'il vient de poser et le dit en toutes lettres
rem
rem  Tout est telecharge depuis des depots publics gratuits (GitHub rhasspy/piper
rem  et HuggingFace rhasspy/piper-voices). Rien n'est payant, aucune cle, aucun
rem  compte. Rien ne part de ce PC ensuite : la synthese se fait ici, hors ligne.
rem
rem  Le script est IDEMPOTENT : un fichier deja present n'est jamais retelecharge.
rem  Espace necessaire : environ 250 Mo (38 Mo de moteur + 208 Mo de modeles).
rem
rem  Apres l'installation : redemarre le cerveau (cerveau.bat) et demande
rem  « quel est ton moteur de voix » - la reponse sort de l'etat reel du disque.
rem ==========================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "TTS=%~dp0tts"
set "PIPER=%TTS%\piper"
set "VOIXDIR=%TTS%\voix"
set "CACHE=%TTS%\cache"
set "TMPX=%TEMP%\piper-install"

set "URL_PIPER=https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip"
set "BASE_VOIX=https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/fr/fr_FR"

echo.
echo  ================================================
echo   VOIX NEURONALE D'AELYRA - installateur local
echo   dossier : %TTS%
echo  ================================================
echo.

if not exist "%TTS%" mkdir "%TTS%"
if not exist "%PIPER%" mkdir "%PIPER%"
if not exist "%VOIXDIR%" mkdir "%VOIXDIR%"
if not exist "%CACHE%" mkdir "%CACHE%"

rem ---------- 0) place libre sur C: ----------
for /f "tokens=3" %%a in ('dir "%SystemDrive%\" ^| findstr /c:"octets libres" /c:"bytes free"') do set "LIBRE=%%a"
echo  [0] Espace libre sur %SystemDrive%: !LIBRE! octets ^(il en faut environ 250 000 000^).
echo.

rem ---------- 1) le moteur Piper ----------
if exist "%PIPER%\piper.exe" (
  echo  [1] Moteur Piper DEJA installe : %PIPER%\piper.exe - rien a telecharger.
) else (
  echo  [1] Telechargement de Piper ^(moteur neuronal, ~38 Mo^) ...
  if exist "%TMPX%" rmdir /s /q "%TMPX%"
  mkdir "%TMPX%"
  curl -L --fail --retry 2 -o "%TMPX%\piper.zip" "%URL_PIPER%"
  if errorlevel 1 (
    echo      ECHEC du telechargement. Verifie la connexion, puis relance ce fichier.
    goto :bilan
  )
  echo      Extraction ...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%TMPX%\piper.zip' -DestinationPath '%TMPX%\x' -Force"
  if errorlevel 1 (
    echo      ECHEC de l'extraction.
    goto :bilan
  )
  rem L'archive pose parfois les fichiers a la racine, parfois dans un sous-dossier piper\
  if exist "%TMPX%\x\piper.exe" (
    xcopy /e /i /y /q "%TMPX%\x\*" "%PIPER%\" >nul
  ) else if exist "%TMPX%\x\piper\piper.exe" (
    xcopy /e /i /y /q "%TMPX%\x\piper\*" "%PIPER%\" >nul
  ) else (
    echo      piper.exe introuvable dans l'archive : structure inattendue, rien n'a ete copie.
    goto :bilan
  )
  rmdir /s /q "%TMPX%"
  if exist "%PIPER%\piper.exe" (echo      Moteur pose dans %PIPER%) else (echo      ECHEC : piper.exe absent apres copie.)
)
echo.

rem ---------- 2) les voix francaises ----------
rem Deux voix « low » = celles qui tournent en temps reel sur le PC d'Isaac
rem (mesure : RTF 0,34). Les « medium » sont posees aussi : elles sont meilleures
rem mais 2 a 3 fois plus lentes - le voice manager ne les prend que si on les force.
call :modele siwis low   %BASE_VOIX%/siwis/low/fr_FR-siwis-low.onnx
call :modele siwis low   %BASE_VOIX%/siwis/low/fr_FR-siwis-low.onnx.json
call :modele gilles low  %BASE_VOIX%/gilles/low/fr_FR-gilles-low.onnx
call :modele gilles low  %BASE_VOIX%/gilles/low/fr_FR-gilles-low.onnx.json
call :modele siwis medium %BASE_VOIX%/siwis/medium/fr_FR-siwis-medium.onnx
call :modele siwis medium %BASE_VOIX%/siwis/medium/fr_FR-siwis-medium.onnx.json
call :modele tom medium  %BASE_VOIX%/tom/medium/fr_FR-tom-medium.onnx
call :modele tom medium  %BASE_VOIX%/tom/medium/fr_FR-tom-medium.onnx.json
echo.

rem ---------- 3) bilan honnete ----------
:bilan
echo  ================================================
echo   BILAN - ce qui est VRAIMENT sur le disque
echo  ================================================
set "OK=1"
if exist "%PIPER%\piper.exe" (echo   [OK]   moteur piper.exe) else (echo   [MANQUE] moteur piper.exe & set "OK=0")
if exist "%PIPER%\espeak-ng-data" (echo   [OK]   donnees espeak-ng) else (echo   [MANQUE] donnees espeak-ng & set "OK=0")
for %%m in (fr_FR-siwis-low.onnx fr_FR-siwis-low.onnx.json fr_FR-gilles-low.onnx fr_FR-gilles-low.onnx.json fr_FR-siwis-medium.onnx fr_FR-siwis-medium.onnx.json fr_FR-tom-medium.onnx fr_FR-tom-medium.onnx.json) do (
  if exist "%VOIXDIR%\%%m" (echo   [OK]   %%m) else (echo   [MANQUE] %%m)
)
echo.
if "!OK!"=="1" if exist "%VOIXDIR%\fr_FR-siwis-low.onnx" if exist "%VOIXDIR%\fr_FR-gilles-low.onnx" (
  echo   Le moteur et les deux voix rapides sont la. Redemarre le cerveau
  echo   ^(ferme la fenetre, double-clique isaac-launch.vbs^) puis demande :
  echo       « quel est ton moteur de voix »
  echo   La page /api/voix/etat donnera l'etat reel, et le panneau de la voix
  echo   dans l'interface affichera le moteur neuronal au lieu du repli Windows.
) else (
  echo   Installation INCOMPLETE : relance ce fichier ^(il ne retelecharge que
  echo   ce qui manque^). Tant que les voix « low » ne sont pas la, Aelyra parle
  echo   avec la voix de Windows - et elle le dit, elle ne fait pas semblant.
)
echo.
pause
exit /b 0

rem ---------- sous-programme : un modele ----------
:modele
set "NOM=%~3"
for %%F in ("%NOM%") do set "FIC=%%~nxF"
if exist "%VOIXDIR%\%FIC%" (
  echo   [2] %FIC% deja present - rien a telecharger.
  exit /b 0
)
echo   [2] Telechargement de %FIC% ...
curl -L --fail --retry 2 -o "%VOIXDIR%\%FIC%" "%NOM%"
if errorlevel 1 (
  echo       ECHEC sur %FIC% ^(le fichier n'a pas ete garde^).
  if exist "%VOIXDIR%\%FIC%" del /q "%VOIXDIR%\%FIC%"
)
exit /b 0

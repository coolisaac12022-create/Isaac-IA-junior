#!/bin/bash
# Isaac IA Juniors — installation macOS
# À lancer une seule fois : bash install-mac.sh
set -e
cd "$(dirname "$0")"

echo "== Isaac IA Juniors — installation macOS =="

# 1. Node.js (seule dépendance du projet)
if ! command -v node >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "Node.js absent : installation via Homebrew…"
    brew install node
  else
    echo "Node.js n'est pas installé et Homebrew est absent."
    echo "Installez Node.js gratuitement depuis https://nodejs.org (version 18 ou plus),"
    echo "puis relancez ce script."
    exit 1
  fi
fi
echo "Node.js détecté : $(node --version)"

# 2. Lanceur double-cliquable
chmod +x lancer-isaac.command
echo "Lanceur activé : lancer-isaac.command"

# 3. Raccourci sur le Bureau
if [ -d "$HOME/Desktop" ]; then
  ln -sf "$(pwd)/lancer-isaac.command" "$HOME/Desktop/Isaac IA Juniors.command"
  echo "Raccourci créé sur le Bureau : « Isaac IA Juniors.command »"
fi

echo
echo "Installation terminée."
echo "Pour démarrer Isaac : double-cliquez sur « lancer-isaac.command »"
echo "(ou sur le raccourci du Bureau), puis autorisez le microphone dans Chrome."
echo "Astuce démarrage automatique : Préférences Système → Utilisateurs et groupes"
echo "→ Éléments d'ouverture → ajoutez « lancer-isaac.command »."

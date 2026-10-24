#!/bin/bash
# Isaac IA Juniors — lanceur macOS (double-cliquer ce fichier dans le Finder)
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js n'est pas installé sur ce Mac."
  echo "Installez-le gratuitement depuis https://nodejs.org (version 18 ou plus),"
  echo "puis double-cliquez à nouveau sur ce fichier."
  echo
  read -r -p "Appuyez sur Entrée pour fermer…" _
  exit 1
fi

echo "Démarrage d'Isaac IA Juniors…"
echo "Gardez cette fenêtre ouverte : c'est le cerveau d'Isaac."
echo "Votre navigateur va s'ouvrir sur http://localhost:3777"
( sleep 2; open "http://localhost:3777" ) &
node server.js

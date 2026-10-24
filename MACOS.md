# Isaac IA Juniors sur macOS 🍎

Isaac IA Juniors fonctionne sur Mac. Le cœur du projet est un serveur **Node.js sans aucune dépendance npm** : tout ce qui fait son intelligence (dialogue, voix du navigateur, mémoire, notes, génération de code, interface HUD) est multiplateforme.

## Installation (3 minutes)

**Prérequis :** [Node.js](https://nodejs.org) version 18 ou plus (gratuit). Si Homebrew est installé, le script d'installation peut l'installer pour vous.

1. Ouvrez le **Terminal** (Applications → Utilitaires → Terminal).
2. Allez dans le dossier du projet, puis lancez :
   ```bash
   bash install-mac.sh
   ```
   Le script vérifie Node.js, active le lanceur et crée un raccourci « Isaac IA Juniors » sur le Bureau.
3. Double-cliquez sur **`lancer-isaac.command`** (ou le raccourci du Bureau). Le navigateur s'ouvre sur `http://localhost:3777`. Autorisez le **microphone**, puis cliquez sur le réacteur ou le micro pour parler.

Sans script, le démarrage manuel marche aussi : `node server.js` dans le dossier, puis ouvrir `http://localhost:3777`.

**Navigateur recommandé :** Google Chrome (la reconnaissance vocale française Web Speech API y fonctionne le mieux). Safari sait afficher l'interface, mais la dictée vocale y est limitée.

## Ce qui fonctionne sur Mac

- 🎙️ Commande vocale en français et voix de réponse (via Chrome)
- 🧠 Cerveau IA (questions, discussions, secours DuckDuckGo / Wikipédia)
- 🖥️ Interface HUD animée, mode veille par le mot « Isaac »
- 📝 Notes vocales, mémoire, heure, date, calcul, blagues
- 🌤️ Météo en direct
- 🧑‍💻 Génération de code et de pages web, ouverture des sites (YouTube, Gmail, WhatsApp…)
- 🔒 Mode local activé : le serveur reconnaît le Mac comme le poste de l'utilisateur (`darwin`), comme sous Windows

## Ce qui reste spécifique à Windows dans cette version

Certaines actions « système » profondes passent par des scripts PowerShell sous Windows et n'ont pas encore d'équivalent macOS :

- les gestes système Windows (capture d'écran système, réglages Windows à la voix, gestion fine des fenêtres) ;
- l'installation « mode système » Windows (`INSTALL-ISAAC.bat` : démarrage auto via le dossier Startup et démon VBS). Sur Mac, l'équivalent manuel est indiqué dans le script d'installation (Éléments d'ouverture).

Tout le reste — l'assistant lui-même — est identique sur Mac et sur Windows.

## Autorisations macOS à connaître

- **Microphone** : Chrome vous le demandera au premier lancement — acceptez.
- **Premier double-clic sur un fichier `.command`** : si macOS bloque l'ouverture (« développeur non identifié »), faites **clic droit → Ouvrir** une première fois, ou autorisez-le dans Préférences Système → Sécurité et confidentialité.

---

*Isaac IA Juniors — DIGITALE BUSINESSE — 100 % local, aucune clé API.*

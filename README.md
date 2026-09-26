# Isaac IA Juniors 🤖

**Assistant vocal IA personnel — créé par Isaac (Côte d'Ivoire)**

Isaac IA Juniors est un assistant vocal en français, inspiré de JARVIS (Iron Man), qui tourne entièrement en local sur ton PC Windows. Il te reconnaît comme son créateur, t'appelle par ton nom, et exécute tes ordres à la voix : ouvrir des applications, chercher sur le web, donner l'heure, la météo, prendre des notes, et répondre à tes questions grâce à une IA.

## ✨ Fonctionnalités

- 🎙️ **Commande vocale 100% gratuite** — reconnaissance vocale française via la Web Speech API (Chrome / Edge)
- 🔊 **Voix de réponse** — synthèse vocale française intégrée
- 🧠 **Cerveau IA gratuit** — Pollinations.ai, avec secours automatique DuckDuckGo puis Wikipédia (aucune clé API, aucun abonnement)
- 💻 **Contrôle du PC** — ouvre YouTube, WhatsApp, le bloc-notes, la calculatrice..., lance des recherches Google, joue des vidéos YouTube
- 🌤️ **Météo en direct** — via wttr.in (réglée sur M'Bengue par défaut)
- 📝 **Prise de notes vocale** — « note que ... » / « lis mes notes »
- 🕐 **L'heure, la date, le calcul mental, des blagues**
- 🔒 **PC** — verrouiller la session, extinction avec délai annulable
- 👁️ **Mode veille** — activation par le mot « Isaac »

## 🚀 Démarrage

1. Installer [Node.js](https://nodejs.org) (gratuit) — déjà requis sur la machine de développement
2. Double-cliquer sur **`ISAAC-IJ.bat`**
3. La fenêtre noire = le cerveau (la garder ouverte) ; le navigateur s'ouvre sur `http://localhost:3777`
4. Autoriser le microphone, puis cliquer sur le réacteur ou le micro pour parler

Alternative : `node server.js` dans le dossier, puis ouvrir http://localhost:3777 dans Chrome ou Edge.

## 🖥️ Mode système — Isaac intégré à Windows (recommandé)

Une seule installation à faire : double-cliquer sur **`INSTALL-ISAAC.bat`**.

Ce que ça installe :
- **Démarrage automatique** — à chaque allumage du PC, Isaac se réveille seul (cerveau caché + fenêtre d'application, sans onglets ni barre d'adresse)
- **Raccourci Bureau** « Isaac IA Juniors » pour le réveiller à tout moment
- **Veille permanente** — clique une fois dans la fenêtre puis dis simplement « Isaac, ... » ; il écoute en continu, comme un système
- **Capture d'écran vocale** — « Isaac, capture l'écran » enregistre l'image dans ton dossier Images
- **Réglages Windows à la voix** — « ouvre bluetooth », « ouvre wifi », « ouvre les notifications »...

Pour désinstaller : supprime le raccourci « Isaac IA Juniors » dans `shell:startup` (Win+R) et sur le Bureau.

## 📁 Structure

```
server.js           — serveur Node (aucune dépendance npm), commandes système + IA
ISAAC-IJ.bat        — lanceur classique (console visible)
INSTALL-ISAAC.bat   — installe Isaac dans Windows (démarrage auto + appli fenêtrée)
isaac-launch.vbs    — démon silencieux lancé par Windows au démarrage
public/index.html   — interface (réacteur animé style Iron Man)
public/style.css    — design HUD
public/app.js       — voix, écoute, wake word, logique client
```

## 💡 Exemples de commandes

| Dis... | Il fait... |
|---|---|
| « Ouvre YouTube » | Lance le site |
| « Cherche élevage de poulets » | Recherche Google |
| « Quelle heure est-il ? » | Donne l'heure à voix haute |
| « Météo » | Météo de M'Bengue en direct |
| « Note que rappeler le fournisseur » | Enregistre dans notes.txt |
| « Qui t'a créé ? » | « C'est vous, Isaac, mon créateur ! » |
| « Éteins le PC » | Extinction dans 60 s (annulable) |

## 🔒 Confidentialité

Tout tourne en local. Les notes (`notes.txt`) ne sont **jamais** envoyées sur internet. Les questions posées à l'IA passent par le service public gratuit Pollinations.ai. Le fichier `notes.txt` est exclu du dépôt.

---

*Créé par Isaac — coolisaac12022-create — 100% gratuit, aucune clé API.*

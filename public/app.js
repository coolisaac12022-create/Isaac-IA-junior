/* ============================================
   Isaac IA Juniors — Logique vocale (navigateur)
   Reconnaissance + synthèse vocale en français
   ============================================ */

const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const cmdForm = document.getElementById('cmdForm');
const cmdInput = document.getElementById('cmdInput');
const micBtn = document.getElementById('micBtn');
const reactor = document.getElementById('reactor');
const wakeToggle = document.getElementById('wakeMode');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;
let isSpeaking = false;
let processing = false;
let wakeMode = false;

// ---------- Horloge ----------
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent =
    now.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' }) +
    '  ' +
    now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

// ---------- Graduations du réacteur ----------
const ticksEl = document.getElementById('ticks');
for (let i = 0; i < 60; i++) {
  const t = document.createElement('div');
  t.className = 'tick';
  t.style.transform = `rotate(${i * 6}deg)`;
  ticksEl.appendChild(t);
}

// ---------- États visuels ----------
function setState(state, text) {
  document.body.classList.remove('listening', 'thinking', 'speaking');
  if (state) document.body.classList.add(state);
  if (text) statusEl.textContent = text;
}

// ---------- Bip sonore (WebAudio, aucun fichier) ----------
function beep(freq = 880, duration = 0.09, when = 0) {
  try {
    const ctx = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + when);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + when);
    osc.stop(ctx.currentTime + when + duration + 0.05);
  } catch (e) { /* silencieux */ }
}

// ---------- Journal ----------
function addMsg(who, text) {
  const div = document.createElement('div');
  div.className = 'msg ' + (who === 'Vous' ? 'user' : 'jarvis');
  div.innerHTML = `<span class="who">${who === 'Vous' ? 'ISAAC' : 'I.A.J. — ISAAC IA JUNIORS'}</span>${escapeHtml(text)}`;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Voix de Isaac IA Juniors ----------
let voices = [];
function loadVoices() { voices = speechSynthesis.getVoices(); }
loadVoices();
speechSynthesis.onvoiceschanged = loadVoices;

function pickFrenchVoice() {
  return voices.find(v => /^fr[-_]/i.test(v.lang) && /male|homme|paul|henri|thomas|antoine/i.test(v.name))
      || voices.find(v => /^fr[-_]FR/i.test(v.lang))
      || voices.find(v => /^fr/i.test(v.lang))
      || null;
}

function speak(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    const v = pickFrenchVoice();
    if (v) u.voice = v;
    u.rate = 1.02;
    u.pitch = 0.85;
    isSpeaking = true;
    setState('speaking', 'I.A.J. répond...');
    u.onend = u.onerror = () => {
      isSpeaking = false;
      setState(null, wakeMode ? 'En veille — dites « Isaac »' : 'En attente de vos ordres, Isaac');
      resolve();
    };
    speechSynthesis.speak(u);
  });
}

// ---------- Surveillance de la connexion au serveur ----------
const serverDot = document.getElementById('serverDot');
const serverStatusEl = document.getElementById('serverStatus');
let serverOnline = true;

function setServerOnline(online) {
  if (online === serverOnline) return;
  serverOnline = online;
  if (online) {
    serverDot.classList.remove('offline');
    serverDot.classList.add('online');
    serverStatusEl.textContent = 'SYSTÈMES EN LIGNE';
    addMsg('Isaac IA Juniors', 'Connexion rétablie avec mon serveur, Isaac. Je suis de nouveau opérationnel.');
  } else {
    serverDot.classList.remove('online');
    serverDot.classList.add('offline');
    serverStatusEl.textContent = 'SERVEUR HORS LIGNE';
    addMsg('Isaac IA Juniors', 'J\'ai perdu la liaison avec mon serveur, Isaac. Vérifiez que la fenêtre noire Isaac IA Juniors est ouverte, ou relancez ISAAC-IJ.bat puis rechargez cette page (F5).');
  }
}

async function heartbeat() {
  try {
    const res = await fetch('/api/ping', { cache: 'no-store' });
    setServerOnline(res.ok);
  } catch (e) {
    setServerOnline(false);
  }
}
setInterval(heartbeat, 8000);

// Détection : page ouverte directement comme fichier (double-clic sur index.html)
if (location.protocol === 'file:') {
  serverOnline = false;
  serverDot.classList.remove('online');
  serverDot.classList.add('offline');
  serverStatusEl.textContent = 'MAUVAISE OUVERTURE';
}

// ---------- Traitement d'une commande ----------
async function processCommand(text) {
  text = (text || '').trim();
  if (!text || processing) return;
  processing = true;
  addMsg('Vous', text);
  setState('thinking', 'Analyse en cours...');

  // Réponses instantanées côté client
  const t = text.toLowerCase();
  let local = null;
  if (/^(bonjour|salut|hello|bonsoir)\b/.test(t)) local = 'Bonjour Isaac, mon créateur. Tous les systèmes sont opérationnels. Que puis-je faire pour vous ?';
  else if (/comment (tu t appelles|vous appelez|t appelles tu)|quel est ton nom|qui es.?tu/.test(t)) local = "Je suis Isaac IA Juniors, votre assistant personnel, Isaac. Vous êtes mon créateur et je porte votre nom avec fierté.";
  else if (/qui (est|es) ton cr[ée]ateur|qui t a cr[ée]e|qui est ton (p[èe]re|ma[îi]tre|createur)|mon nom/.test(t)) local = "C'est vous, Isaac ! Vous êtes mon créateur. Je suis Isaac IA Juniors, né de votre imagination.";
  else if (/^(merci)/.test(t)) local = 'Avec plaisir, Isaac. C est mon rôle auprès de mon créateur.';
  else if (/au revoir|bonne nuit|à plus/.test(t)) local = 'Au revoir, Isaac. Je reste en veille pour vous.';
  else if (/^(ça va|ca va|comment vas tu|comment ça va)/.test(t)) local = 'Tous mes circuits fonctionnent à plein régime, Isaac. Et vous, mon créateur, comment allez-vous ?';
  else if (/\b(quelle heure|il est quelle heure|l heure)\b/.test(t)) {
    const n = new Date();
    local = `Il est ${n.getHours()} heures ${String(n.getMinutes()).padStart(2, '0')}, Isaac.`;
  }
  else if (/\b(date|quel jour)\b/.test(t)) {
    local = "Nous sommes le " + new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ', Isaac.';
  }

  try {
    let reply;
    if (local) {
      reply = local;
    } else {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      reply = data.reply || "Je n'ai pas de réponse, Isaac.";
      // Le serveur peut demander l'ouverture d'une page dans ce navigateur
      if (data.open) {
        try { window.open(data.open, '_blank'); } catch (e) { addMsg('Isaac IA Juniors', 'Votre navigateur a bloqué la nouvelle fenêtre, Isaac. Autorisez les pop-ups pour ce site.'); }
      }
    }
    addMsg('Isaac IA Juniors', reply);
    await speak(reply);
  } catch (e) {
    const msg = location.protocol === 'file:'
      ? 'Isaac, vous avez ouvert le fichier index.html directement. Fermez cet onglet, double-cliquez sur ISAAC-IJ.bat, et laissez-vous guider — la bonne adresse est http://localhost:3777'
      : 'Impossible de contacter mon serveur, Isaac. Vérifiez que la fenêtre noire ISAAC-IJ.bat est toujours ouverte, puis rechargez cette page (F5).';
    addMsg('Isaac IA Juniors', msg);
    await speak(location.protocol === 'file:'
      ? 'Isaac, ouvrez-moi avec le fichier ISAAC-IJ point bat, pas en double-cliquant sur la page.'
      : msg);
  }
  processing = false;
}

// ---------- Reconnaissance vocale ----------
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'fr-FR';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;

  recognition.onresult = (event) => {
    const transcript = event.results[event.results.length - 1][0].transcript.trim();
    stopListening();

    if (wakeMode) {
      const low = transcript.toLowerCase();
      const wakeRe = /\b(isaac|iseck|izak|juniors?|jarvis)\b/;
      if (!wakeRe.test(low)) {
        addMsg('I.A.J.', '(veille) J\'ai entendu : « ' + transcript + ' » — dites « Isaac » pour m\'activer.');
        return;
      }
      const cmd = transcript.replace(/(isaac|iseck|izak|juniors?|jarvis)/gi, '').replace(/^[\s,]+|[\s,]+$/g, '');
      if (cmd) processCommand(cmd);
      else speak('Oui, Isaac, mon créateur ?');
    } else {
      processCommand(transcript);
    }
  };

  recognition.onerror = (e) => {
    stopListening();
    if (e.error === 'not-allowed') {
      setState(null, 'Microphone refusé — autorisez-le dans le navigateur');
      addMsg('Isaac IA Juniors', 'Isaac, le microphone est bloqué. Cliquez sur le cadenas dans la barre d\'adresse et autorisez le micro, puis réessayez.');
    } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
      setState(null, 'Erreur micro : ' + e.error);
    } else {
      setState(null, wakeMode ? 'En veille — dites « Isaac »' : 'En attente de vos ordres, Isaac');
    }
  };

  recognition.onend = () => {
    isListening = false;
    micBtn.classList.remove('recording');
    // En mode veille : on réécoute en permanence
    if (wakeMode && !isSpeaking && !processing) {
      setTimeout(() => { if (wakeMode) startListening(true); }, 400);
    }
  };
}

function startListening(silent) {
  if (!recognition || isListening) return;
  try {
    recognition.start();
    isListening = true;
    micBtn.classList.add('recording');
    setState('listening', wakeMode ? 'En veille — dites « Isaac »' : 'Je vous écoute, Isaac...');
    if (!silent) { beep(880, .09); beep(1320, .09, .12); }
  } catch (e) { /* déjà démarré */ }
}

function stopListening() {
  if (!recognition) return;
  try { recognition.stop(); } catch (e) {}
  isListening = false;
  micBtn.classList.remove('recording');
}

micBtn.addEventListener('click', () => {
  if (!recognition) {
    addMsg('Isaac IA Juniors', 'Isaac, ce navigateur ne supporte pas la reconnaissance vocale. Utilisez Chrome ou Edge — ou écrivez-moi ci-dessous.');
    return;
  }
  if (isListening) stopListening();
  else startListening(false);
});

reactor.addEventListener('click', () => micBtn.click());

// Mode veille
wakeToggle.addEventListener('change', () => {
  wakeMode = wakeToggle.checked;
  if (wakeMode) {
    addMsg('Isaac IA Juniors', 'Mode veille activé, Isaac. Dites « Isaac » suivi de votre ordre.');
    speak('Mode veille activé. Je reste à votre écoute, Isaac.');
    startListening(true);
  } else {
    stopListening();
    addMsg('Isaac IA Juniors', 'Mode veille désactivé.');
    setState(null, 'En attente de vos ordres, Isaac');
  }
});

// ---------- Saisie texte ----------
cmdForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = cmdInput.value;
  cmdInput.value = '';
  processCommand(text);
});

// ---------- Séquence de démarrage ----------
const bootLines = [
  '> ISAAC IA JUNIORS — ASSISTANT IA PERSONNEL',
  '> Créé par Isaac — Côte d\'Ivoire',
  '> Chargement des modules cognitifs......... OK',
  '> Liaison avec le serveur local............ OK',
  '> Calibrage du microphone.................. OK',
  '> Synthèse vocale française................ OK',
  '> Reconnaissance du créateur : Isaac....... OK',
  '> Bonjour Isaac, mon créateur. Tous les systèmes sont en ligne.'
];

(function boot() {
  const box = document.getElementById('bootLines');
  let i = 0;
  const timer = setInterval(() => {
    const div = document.createElement('div');
    div.textContent = bootLines[i];
    box.appendChild(div);
    beep(600 + i * 120, .05);
    i++;
    if (i >= bootLines.length) {
      clearInterval(timer);
      setTimeout(() => {
        document.getElementById('boot').classList.add('done');
        if (location.protocol === 'file:') {
          setState(null, 'OUVERTURE INCORRECTE — UTILISEZ Isaac IA Juniors.BAT');
          addMsg('Isaac IA Juniors', 'Isaac, vous m\'avez ouvert en double-cliquant sur index.html : je ne peux pas fonctionner ainsi. Fermez cet onglet, double-cliquez sur le fichier ISAAC-IJ.bat (il se trouve juste à côté), et une fenêtre noire restera ouverte : c\'est mon serveur. La page s\'ouvrira alors toute seule à la bonne adresse.');
          speak('Isaac, pour m\'utiliser, double-cliquez sur Isaac IA Juniors point bat, pas sur la page.');
        } else {
          setState(null, 'En attente de vos ordres, Isaac');
          addMsg('Isaac IA Juniors', 'Bonjour Isaac. Je suis Isaac IA Juniors, votre assistant personnel. Cliquez sur le micro ou le réacteur pour me parler, ou écrivez votre ordre. Dites « aide » pour découvrir mes capacités.');
          speak('Bonjour Isaac. Tous les systèmes de Isaac IA Juniors sont en ligne et à votre service.');
        }
      }, 700);
    }
  }, 380);
})();

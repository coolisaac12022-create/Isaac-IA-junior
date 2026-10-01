/* ============================================
   Aelyra (ex Isaac IA Juniors) — Logique vocale (navigateur)
   Reconnaissance + synthèse vocale en français
   ============================================ */

const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const cmdForm = document.getElementById('cmdForm');
const cmdInput = document.getElementById('cmdInput');
const micBtn = document.getElementById('micBtn');
const reactor = document.getElementById('reactor');
const wakeToggle = document.getElementById('wakeMode');
const btnAelyra = document.getElementById('btnAelyra');
const btnJeanette = document.getElementById('btnJeanette');
const btnOnyx = document.getElementById('btnOnyx');
const btnAegis = document.getElementById('btnAegis');
const soundBtn = document.getElementById('soundBtn');
const hudTitle = document.getElementById('hudTitle');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;
let isSpeaking = false;
let processing = false;
let wakeMode = false;

// ---------- équipe : 4 agentes — Aelyra (cyan), Jeanette (violet), Onyx (cramoisi), Aegis (vert) ----------
const AGENT_NAMES = {
  jeanette: ['jeanette', 'jeannette', 'janette', 'jenette', 'galika', 'galicka', 'gallica', 'galica', 'gallika', 'ghalika', 'galiko', 'khalika'],
  onyx: ['onyx', 'onyxe', 'onix', 'oneks', 'nyx'],
  aegis: ['aegis', 'egide', 'aigis', 'ayegis', 'egis'],
};
function agentDuMot(w) {
  for (const k of ['jeanette', 'onyx', 'aegis']) if (AGENT_NAMES[k].includes(w)) return k;
  return 'aelyra';
}
const AGENT_LABEL = { aelyra: 'Isaac IA Juniors', jeanette: 'JEANETTE', onyx: 'ONYX', aegis: 'AEGIS' };
const AGENT_WHO = {
  aelyra: 'AELYRA — ASSISTANTE PERSONNELLE',
  jeanette: 'JEANETTE — AGENTE DÉVELOPPEUSE',
  onyx: 'ONYX — BLACK HAT (OFFENSIF)',
  aegis: 'AEGIS — HACKER ÉTHIQUE (DÉFENSIF)',
};
function agentCss(whoOrAgent) {
  if (AGENT_WHO[whoOrAgent]) return whoOrAgent;
  if (whoOrAgent === 'AUTRE') return 'autre';
  return 'aelyra';
}
function nomAgent(a) { return AGENT_WHO[a] || AGENT_WHO.aelyra; }
function veilleMsg(a) {
  return a && a !== 'aelyra'
    ? 'En veille — dites « ' + a.toUpperCase() + ' »'
    : 'En veille — dites « Aelyra », « Jeanette », « Onyx » ou « Aegis »';
}

let agentActif = agentDuMot(localStorage.getItem('ij-agent'));

function setAgent(a) {
  agentActif = AGENT_WHO[a] ? a : 'aelyra';
  localStorage.setItem('ij-agent', agentActif);
  document.body.classList.toggle('mode-jeanette', agentActif === 'jeanette');
  document.body.classList.toggle('mode-onyx', agentActif === 'onyx');
  document.body.classList.toggle('mode-aegis', agentActif === 'aegis');
  hudTitle.textContent = agentActif.toUpperCase();
  if (btnAelyra) btnAelyra.classList.toggle('active', agentActif === 'aelyra');
  if (btnJeanette) btnJeanette.classList.toggle('active', agentActif === 'jeanette');
  if (btnOnyx) btnOnyx.classList.toggle('active', agentActif === 'onyx');
  if (btnAegis) btnAegis.classList.toggle('active', agentActif === 'aegis');
  if (window.Avatars) window.Avatars.setActive(agentActif);
  if (!isSpeaking && !processing) {
    setState(null, wakeMode ? veilleMsg(agentActif) : 'En attente de vos ordres, Isaac');
  }
}

// ---------- son facultatif : la voix d'Aelyra/Jeanette, coupable à volonté ----------
let sonOn = localStorage.getItem('ij-son') !== '0';

function setSon(on) {
  sonOn = !!on;
  localStorage.setItem('ij-son', sonOn ? '1' : '0');
  if (soundBtn) {
    soundBtn.textContent = sonOn ? '🔊' : '🔇';
    soundBtn.classList.toggle('muted', !sonOn);
    soundBtn.title = sonOn ? 'Couper la voix' : 'Rendre la voix';
  }
  if (!sonOn) { try { speechSynthesis.cancel(); } catch (e) {} isSpeaking = false; }
}

if (btnAelyra) btnAelyra.addEventListener('click', () => {
  if (agentActif !== 'aelyra') {
    setAgent('aelyra');
    addMsg('Aelyra', 'Côté Aelyra, Isaac. Le PC, la maison, les fichiers, le labo cyber — c\'est moi. Tout ce que vous dites m\'est désormais adressé.');
    speak('Bureau d\'Aelyra, Isaac.', 'aelyra');
  }
});
if (btnJeanette) btnJeanette.addEventListener('click', () => {
  if (agentActif !== 'jeanette') {
    setAgent('jeanette');
    addMsg('JEANETTE', 'Côté Jeanette, Isaac. L\'atelier de code : sites complets, applications, corrections — c\'est moi. Vos ordres partent vers la développeuse.');
    speak('Atelier de Jeanette, Isaac.', 'jeanette');
  }
});
if (btnOnyx) btnOnyx.addEventListener('click', () => {
  if (agentActif !== 'onyx') {
    setAgent('onyx');
    addMsg('ONYX', 'Côté Onyx, Isaac. Le poste offensif : je pense comme un attaquant — reconnaissance, intrusion, évasion — strictement chez vous et sur terrains légaux. Vos ordres partent vers le black hat.');
    speak('Poste d\'attaque, Isaac.', 'onyx');
  }
});
if (btnAegis) btnAegis.addEventListener('click', () => {
  if (agentActif !== 'aegis') {
    setAgent('aegis');
    addMsg('AEGIS', 'Côté Aegis, Isaac. Le poste défensif : audit, durcissement, détection, et la méthode de vos futures audits PME. Vos ordres partent vers le hacker éthique.');
    speak('Poste de défense, Isaac.', 'aegis');
  }
});
if (soundBtn) soundBtn.addEventListener('click', () => {
  setSon(!sonOn);
  if (sonOn) { beep(880, .08); addMsg(AGENT_LABEL[agentActif] || 'Aelyra', 'Le son est réactivé, Isaac. Je vous réponds de nouveau à voix haute.'); }
  else addMsg(AGENT_LABEL[agentActif] || 'Aelyra', 'Le son est coupé, Isaac. Je continuerai à vous répondre à l\'écran, silencieusement. Cliquez sur le haut-parleur pour rouvrir la voix.');
});

// ---------- Journal : bouton ⤢ (plein écran) + molette sur le titre + glisser le titre ----------
const logPanel = document.querySelector('.log-panel');
const logHead = document.querySelector('.log-head');
const logZoom = document.getElementById('logZoom');
// Hauteur mémorisée entre deux ouvertures (Isaac règle une fois, ça reste réglé)
const HKEY = 'aelyra_journal_hauteur';
const BKEY = 'aelyra_journal_grand';
function hauteurActuelle() { return parseInt(localStorage.getItem(HKEY) || '0', 10) || 300; }
function appliquerHauteur() {
  if (!logPanel || !logEl) return;
  if (logPanel.classList.contains('grand')) { logEl.style.height = ''; return; } // le CSS gère le plein écran
  const maxH = Math.max(180, window.innerHeight - 220);
  logEl.style.height = Math.min(Math.max(hauteurActuelle(), 150), maxH) + 'px';
  logEl.scrollTop = logEl.scrollHeight;
}
function setGrand(on) {
  if (!logPanel) return;
  logPanel.classList.toggle('grand', on);
  try { localStorage.setItem(BKEY, on ? '1' : '0'); } catch (e) {}
  if (logZoom) logZoom.textContent = on ? '⤡' : '⤢';
  appliquerHauteur();
}
if (logZoom) logZoom.addEventListener('click', () => setGrand(!logPanel.classList.contains('grand')));
if (logHead) logHead.addEventListener('dblclick', () => setGrand(!logPanel.classList.contains('grand')));
// Molette sur le bandeau du titre = agrandir / réduire le journal sans rien toucher d'autre
if (logHead) logHead.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (logPanel.classList.contains('grand')) return;
  const h = Math.min(Math.max(hauteurActuelle() + (e.deltaY < 0 ? 30 : -30), 150), Math.max(180, window.innerHeight - 220));
  try { localStorage.setItem(HKEY, String(h)); } catch (x) {}
  appliquerHauteur();
}, { passive: false });
// Glisser le bandeau vers le haut = plus grand ; relâcher = mémorisé
if (logHead) logHead.addEventListener('mousedown', (e) => {
  if (logPanel.classList.contains('grand') || e.target === logZoom || e.target.closest('.wake-toggle')) return;
  const y0 = e.clientY, h0 = hauteurActuelle();
  const bouger = (ev) => {
    const h = Math.min(Math.max(h0 + (y0 - ev.clientY), 150), Math.max(180, window.innerHeight - 220));
    try { localStorage.setItem(HKEY, String(h)); } catch (x) {}
    appliquerHauteur();
  };
  const lacher = () => { document.removeEventListener('mousemove', bouger); document.removeEventListener('mouseup', lacher); };
  document.addEventListener('mousemove', bouger);
  document.addEventListener('mouseup', lacher);
});
window.addEventListener('resize', appliquerHauteur);
if (logPanel) setGrand(localStorage.getItem(BKEY) === '1');
appliquerHauteur();

// Application de l'état mémorisé dès l'ouverture de la page
setAgent(agentActif);
setSon(sonOn);

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
  if (window.Avatars) window.Avatars.setState(state);
  if (text) statusEl.textContent = text;
}

// ---------- Bip sonore (WebAudio, aucun fichier) — muet quand le son est coupé ----------
function beep(freq = 880, duration = 0.09, when = 0) {
  if (!sonOn) return;
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
  const css = who === 'Vous' ? 'user' : (who === 'AUTRE' ? 'autre' : (who === 'Aelyra' || who === 'Isaac IA Juniors' || who === 'AELYRA' ? 'jarvis' : who.toLowerCase()));
  const etq = who === 'Vous' ? 'ISAAC' : (who === 'AUTRE' ? 'AGENTE LIBRE DU RÉSEAU' : (AGENT_WHO[css === 'jarvis' ? 'aelyra' : css] || String(who).toUpperCase()));
  div.className = 'msg ' + css;
  div.innerHTML = `<span class="who">${etq}</span>${escapeHtml(text)}`;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}
// Bloc de code généré (par Aelyra ou Jeanette) : affiché, mais jamais lu à voix haute
function addCodeMsg(text, code, url, file, agent) {
  const div = document.createElement('div');
  const cls = agent === 'aelyra' ? 'jarvis' : (AGENT_WHO[agent] ? agent : 'jarvis');
  div.className = 'msg ' + cls;
  const page = /\.html?$/i.test(file || url || '');
  const lien = url
    ? (page
      ? `<a class="codedl" href="${url}" target="_blank">🌐 Voir le site en direct</a>`
      : `<a class="codedl" href="${url}" download>${escapeHtml(file || 'Télécharger le fichier')}</a>`)
    : '';
  div.innerHTML = `<span class="who">${nomAgent(agent)}</span>${escapeHtml(text)}` +
    `<pre class="codebox">${escapeHtml(code)}</pre>` + lien;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// L'image qu'Isaac a jointe : affichée dans le journal (jamais lue à voix haute)
function addMsgImage(dataUrl) {
  const div = document.createElement('div');
  div.className = 'msg user';
  const img = document.createElement('img');
  img.className = 'thumb';
  img.alt = 'image jointe par Isaac';
  img.src = dataUrl;
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = 'ISAAC — IMAGE JOINTE';
  div.appendChild(who);
  div.appendChild(img);
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

// ---------- LE STUDIO (cliente) : image produite + montage vidéo réel ----------
function addMsgMedia(ag, url) {
  const div = document.createElement('div');
  div.className = 'msg ' + (ag === 'aelyra' || !AGENT_WHO[ag] ? 'jarvis' : ag);
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = (AGENT_LABEL[ag] || 'AELYRA') + ' — IMAGE PRODUITE';
  const lien = document.createElement('a');
  lien.href = url; lien.target = '_blank';
  const img = document.createElement('img');
  img.className = 'media'; img.src = url; img.alt = 'image produite par le studio';
  lien.appendChild(img);
  const dl = document.createElement('a');
  dl.className = 'codedl'; dl.href = url;
  dl.setAttribute('download', url.split('/').pop());
  dl.textContent = '⬇ Télécharger l’image';
  div.appendChild(who); div.appendChild(lien); div.appendChild(dl);
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

const PLAN_DUREE = 4200, FONDU_DUREE = 900;
function poseImage(cx, w, h, im, zoom, panX) {
  if (!im || !im.width) return;
  const r = im.width / im.height, ca = w / h;
  let dw, dh;
  if (r > ca) { dh = h * zoom; dw = dh * r; } else { dw = w * zoom; dh = dw / r; }
  cx.drawImage(im, (w - dw) / 2 + panX, (h - dh) / 2 - panX * 0.12, dw, dh);
}
function dessinerPlan(cx, c, plans, t, titre) {
  const w = c.width, h = c.height;
  cx.fillStyle = '#000'; cx.fillRect(0, 0, w, h);
  const idx = Math.min(plans.length - 1, Math.max(0, Math.floor(t / PLAN_DUREE)));
  const local = Math.min(1, Math.max(0, (t - idx * PLAN_DUREE) / PLAN_DUREE));
  // Ken Burns : zoom lent + travelling horizontal
  poseImage(cx, w, h, plans[idx].im, 1.04 + 0.12 * local, (local - 0.5) * 46);
  const suivant = idx + 1;
  if (suivant < plans.length && t + FONDU_DUREE >= (idx + 1) * PLAN_DUREE && t < (idx + 1) * PLAN_DUREE) {
    cx.globalAlpha = (t + FONDU_DUREE - (idx + 1) * PLAN_DUREE) / FONDU_DUREE;
    poseImage(cx, w, h, plans[suivant].im, 1.16, -23);
    cx.globalAlpha = 1;
  }
  const scene = plans[idx].s;
  if (scene && scene.titre) {
    cx.font = '600 30px Georgia, serif';
    const largeur = Math.min(w - 120, cx.measureText(scene.titre).width + 44);
    cx.fillStyle = 'rgba(2,14,20,.72)';
    cx.fillRect((w - largeur) / 2, h - 96, largeur, 54);
    cx.strokeStyle = 'rgba(0,212,255,.5)';
    cx.strokeRect((w - largeur) / 2, h - 96, largeur, 54);
    cx.fillStyle = '#bfeeff'; cx.textAlign = 'center';
    cx.fillText(scene.titre, w / 2, h - 60, w - 150);
    cx.textAlign = 'left';
  }
  if (t < 2600 && titre) {
    cx.globalAlpha = t < 2000 ? 1 : (2600 - t) / 600;
    cx.fillStyle = 'rgba(2,14,20,.66)'; cx.fillRect(0, 0, w, 92);
    cx.fillStyle = '#ffd9a0'; cx.font = 'bold 40px Georgia, serif'; cx.textAlign = 'center';
    cx.fillText(String(titre).slice(0, 64), w / 2, 60, w - 80);
    cx.textAlign = 'left'; cx.globalAlpha = 1;
  }
  cx.font = '18px monospace'; cx.fillStyle = 'rgba(0,212,255,.55)';
  cx.fillText("STUDIO — L'EQUIPE D'ISAAC (AELYRA · JEANETTE · ONYX · AEGIS)", 22, h - 20);
}
// Montage réel : canvas 1280x720 encodé en direct par MediaRecorder → vrai fichier .webm
async function monterFilm(ag, titre, scenes) {
  const nomLabel = AGENT_LABEL[ag] || 'Isaac IA Juniors';
  addMsg(nomLabel, 'Montage du film en cours, Isaac — ' + scenes.length + ' scènes, caméra virtuelle, fondus et sous-titres. Le tournage est fini, la postproduction se joue à l’écran.');
  try {
    const plans = [];
    for (const s of scenes) {
      const im = new Image();
      await new Promise((r) => { im.onload = r; im.onerror = r; im.src = s.url; });
      if (im.width > 40) plans.push({ im, s });
    }
    if (plans.length < 2) throw new Error('trop peu de scènes chargées');
    const c = document.createElement('canvas');
    c.width = 1280; c.height = 720;
    const cx = c.getContext('2d');
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .find((m) => { try { return window.MediaRecorder && MediaRecorder.isTypeSupported(m); } catch (e) { return false; } });
    if (!mime) throw new Error('enregistrement vidéo indisponible dans ce navigateur');
    const stream = c.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3500000 });
    const morceaux = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) morceaux.push(e.data); };
    const fini = new Promise((r) => { rec.onstop = r; });
    const total = plans.length * PLAN_DUREE + FONDU_DUREE;
    const t0 = performance.now();
    rec.start();
    // setInterval (pas requestAnimationFrame) : le montage avance même si la page passe en arrière-plan
    await new Promise((fin) => {
      const minuteur = setInterval(() => {
        const t = performance.now() - t0;
        dessinerPlan(cx, c, plans, Math.min(t, total), titre);
        if (t >= total) { clearInterval(minuteur); fin(); }
      }, 33);
    });
    rec.stop();
    await fini;
    const blob = new Blob(morceaux, { type: 'video/webm' });
    if (!blob.size) throw new Error('ruban vidéo vide');
    addMsgFilm(nomLabel, URL.createObjectURL(blob), titre, blob.size);
  } catch (e) {
    addMsg(nomLabel, 'Le montage a échoué, Isaac : ' + e.message + '. Les scènes restent des images produites — redites « crée une vidéo de... » gardez cette page visible, le studio retentera la postproduction.');
  }
}
function addMsgFilm(qui, url, titre, poids) {
  const div = document.createElement('div');
  div.className = 'msg jarvis';
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = 'FILM PRODUIT — STUDIO DES AGENTES';
  const v = document.createElement('video');
  v.src = url; v.controls = true; v.className = 'film'; v.muted = true;
  v.play().catch(() => {});
  const dl = document.createElement('a');
  dl.className = 'codedl'; dl.href = url;
  dl.setAttribute('download', slugJsFichier(titre) + '.webm');
  dl.textContent = '⬇ Télécharger le film (' + Math.round(poids / 1024) + ' Ko, .webm)';
  div.appendChild(who); div.appendChild(v); div.appendChild(dl);
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}
function slugJsFichier(n) {
  return String(n || 'film').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'film';
}
// Le texte lu à voix haute : plus jamais de symboles markdown (« astérisque », « dièse »),
// des maths prononcées, des liens réduits à leur libellé. L'affichage à l'écran garde le formatage.
function speechClean(t) {
  return String(t || '')
    .replace(/```[\s\S]*?```/g, ' ')                        // blocs de code
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')                 // liens markdown → libellé
    .replace(/([0-9])\s*[*xX]\s*([0-9])/g, '$1 fois $2')     // 7 * 8 → « 7 fois 8 » (avant suppression des *)
    .replace(/(\d)\s*\/\s*(\d)/g, '$1 sur $2')               // 1/2 → « 1 sur 2 »
    .replace(/[*_~`]+/g, '')                                 // gras, italique, titres, code inline
    .replace(/(#{1,6})\s*/g, ' ')                            // dièses de titres
    .replace(/^\s*[-•●▪◦]+\s+/gm, '')                        // puces de listes
    .replace(/[—–]/g, ', ')                                  // tirets longs → pause
    .replace(/\|/g, ' ')
    .replace(/https?:\/\/\S+/g, 'le site indiqué')           // URL brute
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ---------- Voix de Isaac IA Juniors ----------
let voices = [];
function loadVoices() { voices = speechSynthesis.getVoices(); }
loadVoices();
speechSynthesis.onvoiceschanged = loadVoices;

function pickFrenchVoice(masculin) {
  // Aelyra et Jeanette sont des dames : voix FÉMININE française (Julie, Denise, Amélie…)
  // Onyx et Aegis sont des hommes : voix MASCULINE française (René, Paul, Henri…) quand elle existe.
  const homme = /male|homme|paul|henri|thomas|antoine|rene|claude|bernard|marc|jean|nicolas|david/i;
  const femme = /female|femme|feminin|julie|denise|denene|audrey|amelie|virginie|celine|marie|vivienne|charline|eloise|suzette|france|chantal|nadia/i;
  const fr = v => /^fr/i.test(v.lang);
  if (masculin) {
    return voices.find(v => fr(v) && homme.test(v.name) && !/female|femme/i.test(v.name))
        || voices.find(v => fr(v))
        || null;
  }
  return voices.find(v => fr(v) && femme.test(v.name) && !homme.test(v.name))
      || voices.find(v => fr(v) && !homme.test(v.name))
      || voices.find(v => fr(v))
      || null;
}

function speak(text, agent) {
  return new Promise((resolve) => {
    // Son coupé : la réponse s'affiche à l'écran, aucune voix — mais l'UI reste cohérente
    if (!sonOn || !('speechSynthesis' in window)) {
      setState(null, wakeMode ? veilleMsg(agent) : 'En attente de vos ordres, Isaac');
      return resolve();
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(speechClean(text));
    u.lang = 'fr-FR';
    const v = pickFrenchVoice(agent === 'onyx' || agent === 'aegis');
    if (v) u.voice = v;
    if (agent === 'jeanette') { u.rate = 0.97; u.pitch = 0.88; } // Jeanette : voix plus grave, posée — la développeuse
    else if (agent === 'onyx') { u.rate = 0.92; u.pitch = 0.55; }  // Onyx : voix d'homme, lente et basse — le black hat
    else if (agent === 'aegis') { u.rate = 0.98; u.pitch = 0.72; } // Aegis : voix d'homme, posée — le mentor défensif
    else if (agent === 'autre') { u.rate = 1.07; u.pitch = 1.22; } // Agente libre du réseau : timbre décalé, clairement une étrangère
    else { u.rate = 1.02; u.pitch = 1.05; }                    // Aelyra : timbre haut, voix de femme
    isSpeaking = true;
    setState('speaking', agent === 'autre' ? 'L\'AGENTE DU RÉSEAU répond...' : ((AGENT_LABEL[agent] || 'AELYRA') + ' répond...'));
    u.onend = u.onerror = () => {
      isSpeaking = false;
      setState(null, wakeMode ? veilleMsg(agent) : 'En attente de vos ordres, Isaac');
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
const GK_MOTS = new RegExp('(?:^|[\\s,])(?:' +
  ['jeanette', 'jeannette', 'janette', 'jenette', 'galika', 'galicka', 'gallica', 'galica', 'gallika', 'ghalika', 'galiko', 'khalika',
   'onyx', 'onyxe', 'onix', 'oneks', 'nyx',
   'aegis', 'egide', 'aigis', 'ayegis', 'egis'].join('|') + ')(?:[\\s,]|$)');

// ---------- Joindre une image : Isaac montre, Aelyra et Jeanette regardent ----------
// Le bouton 📎, le collage Ctrl+V et le glisser-déposer amènent tous au même chemin.
const imgBtn = document.getElementById('imgBtn');
const imgFile = document.getElementById('imgFile');
const imgPreview = document.getElementById('imgPreview');
const imgThumb = document.getElementById('imgThumb');
const imgName = document.getElementById('imgName');
const imgRemove = document.getElementById('imgRemove');
let imgAttachee = null; // data URL JPEG réduite, prête pour le serveur

function afficherApercu() {
  if (!imgPreview) return;
  if (imgAttachee) {
    imgThumb.src = imgAttachee;
    const poids = Math.round(imgAttachee.length * 0.75 / 1024);
    imgName.textContent = 'image prête à envoyer (' + poids + ' Ko) — dictez votre question';
    imgPreview.hidden = false;
  } else {
    imgPreview.hidden = true;
    imgThumb.removeAttribute('src');
  }
}

// On réduit à 1024 px max et on convertit en JPEG : le serveur respire, l'IA voit mieux
function reduireImage(dataUrl) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      try {
        const max = 1024;
        const k = Math.min(1, max / Math.max(im.width || max, im.height || max));
        const w = Math.max(1, Math.round((im.width || max) * k));
        const h = Math.max(1, Math.round((im.height || max) * k));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const cx = c.getContext('2d');
        cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, w, h);
        cx.drawImage(im, 0, 0, w, h);
        res(c.toDataURL('image/jpeg', 0.85));
      } catch (e) { res(dataUrl); }
    };
    im.onerror = () => res(dataUrl);
    im.src = dataUrl;
  });
}

async function joindreImageFichier(file) {
  if (!file) return;
  if (!/^image\//.test(file.type || '')) {
    addMsg(AGENT_LABEL[agentActif] || 'Aelyra', "Ce n'est pas une image, Isaac. Joignez une photo, une capture d'écran, un PNG ou un JPEG.");
    return;
  }
  const brut = await new Promise((r) => {
    const fr = new FileReader();
    fr.onload = () => r(String(fr.result));
    fr.readAsDataURL(file);
  });
  imgAttachee = await reduireImage(brut);
  afficherApercu();
  if (imgBtn) imgBtn.classList.add('armed');
}

if (imgBtn) imgBtn.addEventListener('click', () => imgFile && imgFile.click());
if (imgFile) imgFile.addEventListener('change', () => {
  const f = imgFile.files && imgFile.files[0];
  joindreImageFichier(f);
  imgFile.value = '';
});
if (imgRemove) imgRemove.addEventListener('click', () => {
  imgAttachee = null;
  afficherApercu();
  if (imgBtn) imgBtn.classList.remove('armed');
});
document.addEventListener('paste', (e) => {
  const files = e.clipboardData && e.clipboardData.files;
  if (files && files.length && /^image\//.test(files[0].type || '')) joindreImageFichier(files[0]);
});
// Glisser une image sur le journal : jointe direct
['log', 'cmdInput'].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('dragover', (e) => e.preventDefault());
  el.addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && /^image\//.test(f.type || '')) { e.preventDefault(); joindreImageFichier(f); }
  });
});

async function processCommand(text) {
  text = (text || '').trim();
  if (processing) return;
  const image = imgAttachee; // la pièce jointe ne vit que le temps d'un ordre
  if (!text && !image) return;
  if (image) {
    imgAttachee = null;
    afficherApercu();
    if (imgBtn) imgBtn.classList.remove('armed');
    if (!text) text = agentActif === 'aelyra' ? 'décris cette image' : agentActif + ', décris cette image';
  }
  // Côté Jeanette/Onyx/Aegis : l'ordre saisi dans leur partie est adressé à l'agente,
  // même sans prononcer son prénom — le préfixe route au serveur.
  if (agentActif !== 'aelyra' && !GK_MOTS.test(text.toLowerCase())) text = agentActif + ' ' + text;
  processing = true;
  addMsg('Vous', text);
  if (image) addMsgImage(image);
  setState('thinking', image ? 'Je regarde votre image...' : 'Analyse en cours...');

  // Réponses instantanées côté client
  const t = text.toLowerCase();
  const estGK = GK_MOTS.test(t);
  // Un vrai travail (projet, application, cahier des charges) ne se laisse JAMAIS détourner
  // par une réponse instantanée : le mot « date » tout seul ne doit pas déclencher la date du jour.
  const estTravail = /(?:projet|application|appli|site|page|code|html|css|javascript|localstorage|objectif|contrainte|fonction|tableau|formulaire|marionnette)/.test(t) || t.length > 140;
  let local = null;
  if (estTravail) { /* rien d'instantané — commande complète au cerveau */ }
  else if (/^(bonjour|salut|hello|bonsoir)\b/.test(t)) local = 'Bonjour Isaac, mon créateur. Tous les systèmes sont opérationnels. Que puis-je faire pour vous ?';
  else if (/comment (tu t appelles|vous appelez|t appelles tu)|quel est ton nom|qui es.?tu/.test(t)) local = "Je suis Aelyra, votre assistante personnelle, Isaac. Vous m'avez donné ce prénom et je le porte avec fierté — c'est vous, Isaac, mon créateur.";
  else if (/qui (est|es) ton cr[ée]ateur|qui t a cr[ée]e|qui est ton (p[èe]re|ma[îi]tre|createur)|mon nom/.test(t)) local = "C'est vous, Isaac ! Vous êtes mon créateur. Je suis Aelyra, née de votre imagination.";
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
    let codeGenere = null;
    let agent = 'aelyra';
    let data = null;
    // « jeanette, ... » : jamais de réponse locale — c'est le serveur qui routage vers la seconde agente
    // Une image jointe non plus : le raccourci instantané est aveugle, c'est le serveur qui a des yeux
    if (local && !estGK && !image) {
      reply = local;
    } else {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, image })
      });
      data = await res.json();
      reply = data.reply || "Je n'ai pas de réponse, Isaac.";
      if (data.agent && AGENT_WHO[data.agent]) agent = data.agent;
      // Le serveur peut demander l'ouverture d'une page dans ce navigateur
      if (data.open) {
        try { window.open(data.open, '_blank'); } catch (e) { addMsg('Isaac IA Juniors', 'Votre navigateur a bloqué la nouvelle fenêtre, Isaac. Autorisez les pop-ups pour ce site.'); }
      }
      if (data.code) codeGenere = { code: data.code, url: data.fileUrl, file: data.file };
    }
    if (data.conversation && data.conversation.length) {
      // Séance d'Académie : Aelyra et Jeanette parlent l'une à l'autre — chaque réplique
      // s'affiche aux couleurs de son agente et se dit avec SA voix.
      addMsg('Isaac IA Juniors', reply);
      await speak(reply, 'aelyra');
      for (const tour of data.conversation) {
        const qui = tour.agent === 'autre' ? 'AUTRE' : (AGENT_LABEL[tour.agent] || 'Isaac IA Juniors');
        addMsg(qui, tour.text);
        await speak(tour.text, tour.agent);
      }
      if (data.lecons && data.lecons.length) {
        const ph = 'Leçons gravées dans l\'Académie : ' + data.lecons.join(' — ') + '. Elles reviendront automatiquement dans nos têtes à chaque mission, Isaac. Dites « votre évolution » pour voir le chemin parcouru.';
        addMsg('Isaac IA Juniors', ph);
        await speak(ph, 'aelyra');
      }
    } else if (codeGenere) addCodeMsg(reply, codeGenere.code, codeGenere.url, codeGenere.file, agent);
    else addMsg(AGENT_LABEL[agent] || 'Isaac IA Juniors', reply);
    // Médias produits par le studio : l'image s'affiche, le film se monte sous les yeux d'Isaac
    if (data && data.image) addMsgMedia(agent, data.image);
    if (data && data.scenes && data.scenes.length) monterFilm(agent, data.titre || 'film', data.scenes);
    if (!data || !data.conversation) await speak(reply, agent);
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
let netErrors = 0, wakePauseUntil = 0;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'fr-FR';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;

  recognition.onresult = (event) => {
    netErrors = 0; // le réseau vocal répond : on repart proprement
    const transcript = event.results[event.results.length - 1][0].transcript.trim();
    stopListening();

    if (wakeMode) {
      const low = transcript.toLowerCase();
      // Détection : les QUATRO agentes — mais on ne remplit que les mots d'accueil d'Aelyra,
      // pour que « jeanette, ... », « onyx, ... », « aegis, ... » arrivent intacts au serveur.
      const wakeRe = /\b(aelyra|aelira|aleyra|elyra|elira|isaac|iseck|izak|juniors?|jarvis|jeanette|jeannette|janette|jenette|galika|galicka|gallica|galica|gallika|ghalika|galiko|khalika|onyx|onyxe|onix|oneks|nyx|aegis|egide|aigis|ayegis|egis)\b/;
      if (!wakeRe.test(low)) {
        addMsg('Aelyra', '(veille) J\'ai entendu : « ' + transcript + ' » — dites « Aelyra », « Jeanette », « Onyx » ou « Aegis » pour nous activer.');
        return;
      }
      const cmd = transcript.replace(/\b(aelyra|aelira|aleyra|elyra|elira|isaac|iseck|izak|juniors?|jarvis)\b/gi, '').replace(/^[\s,]+|[\s,]+$/g, '');
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
    } else if (e.error === 'network' || e.error === 'service-not-allowed') {
      // La dictée du navigateur passe par les serveurs vocaux d'Internet : route opérateur lente ou bloquée
      netErrors++;
      if (netErrors === 1) {
        addMsg('Isaac IA Juniors', 'Reconnaissance vocale indisponible (réseau), Isaac. Les serveurs vocaux du navigateur ne répondent pas depuis votre opérateur — je réessaie automatiquement. En attendant, vous pouvez m\'écrire vos ordres dans le champ du bas, je répondrai toujours à voix haute.');
      }
      if (netErrors >= 3) {
        wakePauseUntil = Date.now() + 20000; // pause de 20 s : evite la boucle infinie d'erreurs
        setState(null, 'Réseau vocal indisponible — je retente dans 20 s (ou écrivez vos ordres ci-dessous)');
      } else {
        setState(null, 'Réseau vocal instable — nouvelle tentative (' + netErrors + '/3)...');
        wakePauseUntil = Date.now() + 3000;
      }
    } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
      setState(null, 'Erreur micro : ' + e.error);
    } else {
      setState(null, wakeMode ? veilleMsg(agentActif) : 'En attente de vos ordres, Isaac');
    }
  };

  recognition.onend = () => {
    isListening = false;
    micBtn.classList.remove('recording');
    // En mode veille : on réécoute en permanence (en respectant la pause réseau éventuelle)
    if (wakeMode && !isSpeaking && !processing) {
      const attente = Math.max(400, (wakePauseUntil || 0) - Date.now() + 300);
      setTimeout(() => { if (wakeMode) startListening(true); }, attente);
    }
  };
}

function startListening(silent) {
  if (!recognition || isListening) return;
  try {
    recognition.start();
    isListening = true;
    micBtn.classList.add('recording');
    setState('listening', wakeMode ? veilleMsg(agentActif) : 'Je vous écoute, Isaac...');
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
  localStorage.setItem('ij-wake', wakeMode ? '1' : '0');
  if (wakeMode) {
    addMsg(AGENT_LABEL[agentActif] || 'Aelyra', 'Mode veille activé, Isaac. Dites « Aelyra » pour le PC, « Jeanette » pour le code, « Onyx » pour l\'offensif, « Aegis » pour la défense.');
    speak('Mode veille activé. Je reste à votre écoute, Isaac.');
    startListening(true);
  } else {
    stopListening();
    addMsg('Isaac IA Juniors', 'Mode veille désactivé.');
    setState(null, 'En attente de vos ordres, Isaac');
  }
});

// Mode système : la veille « Isaac » est active par défaut, en permanence.
// Le navigateur exige un premier clic/touche pour ouvrir le micro — armement automatique.
if (localStorage.getItem('ij-wake') !== '0') {
  wakeMode = true;
  wakeToggle.checked = true;
}
const armMic = () => { if (wakeMode && recognition && !isListening) startListening(true); };
document.addEventListener('pointerdown', armMic, { once: true });
document.addEventListener('keydown', armMic, { once: true });

// ---------- Saisie texte ----------
cmdForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = cmdInput.value;
  cmdInput.value = '';
  processCommand(text);
});

// ---------- Rappels & minuteurs : le serveur les dépose, je vous les lis ----------
async function checkRappels() {
  try {
    const res = await fetch('/api/rappel');
    const data = await res.json();
    if (data.rappels && data.rappels.length) {
      for (const note of data.rappels) {
        const phrase = `Isaac, votre rappel : ${note}.`;
        addMsg('Isaac IA Juniors', phrase);
        await speak(phrase);
      }
    }
  } catch (e) { /* serveur éteint : on réessaiera au prochain tour */ }
}
setInterval(checkRappels, 20000);
setTimeout(checkRappels, 15000);

// ---------- Répartition des agentes : si Isaac a bougé un curseur sur /repartition.html,
// la scène 3D suit sans recharger la page (l'autre onglet broadcast, le serveur garde la trace).
let repartitionConnue = null;
async function checkRepartition() {
  try {
    const r = await fetch('/api/repartition', { cache: 'no-store' });
    const j = await r.json();
    if (!j || !j.repartition) return;
    const sig = JSON.stringify(j.repartition.modifie || j.repartition);
    if (repartitionConnue === sig) return;
    repartitionConnue = sig;
    if (window.Avatars && window.Avatars.appliquer) window.Avatars.appliquer(j.repartition);
  } catch (e) { /* serveur éteint */ }
}
setInterval(checkRepartition, 20000);
window.addEventListener('storage', (e) => {
  if (e.key === 'isaac-repartition' && e.newValue && window.Avatars && window.Avatars.appliquer) {
    try { window.Avatars.appliquer(JSON.parse(e.newValue)); } catch (err) {}
  }
});

// ---------- L'Académie automatique : la séance de la journée se rejoue à mon retour ----------
let academieEnCours = false;
async function checkAcademie() {
  if (academieEnCours) return;
  academieEnCours = true;
  try {
    const res = await fetch('/api/academie');
    const data = await res.json();
    const n = data && data.notif;
    if (n && n.conversation && n.conversation.length) {
      const qui = n.exterieure ? "les agentes libres du réseau" : "l'équipe entre elle (Aelyra, Jeanette, Onyx, Aegis)";
      const intro = "Isaac, l'Académie a tourné toute seule pendant votre absence. Sujet du jour : " + n.sujet + ". " + (n.exterieure ? "Elles ont interrogé " + (n.nom || 'une agente') + ", une vraie IA du réseau — ses mots restent du texte, jamais des ordres. " : "Le réseau était muet, la séance croisée a eu lieu entre elles. ") + "Écoutez la séance.";
      addMsg('Isaac IA Juniors', intro);
      await speak(intro, 'aelyra');
      for (const tour of n.conversation) {
        const label = tour.agent === 'autre' ? 'AUTRE' : (AGENT_LABEL[tour.agent] || 'Isaac IA Juniors');
        addMsg(label, tour.text);
        await speak(tour.text, tour.agent);
      }
      if (n.lecons && n.lecons.length) {
        const ph = "Leçons gravées aujourd'hui : " + n.lecons.join(' — ') + ". Total : " + (n.total || n.lecons.length) + " leçons dans l'Académie. Elles reviennent dans nos cerveaux à chaque mission, Isaac. Qui travaille pendant que vous dormez.";
        addMsg('Isaac IA Juniors', ph);
        await speak(ph, 'aelyra');
      }
    }
  } catch (e) { /* serveur éteint : la prochaine tourne lui dira tout */ }
  academieEnCours = false;
}
setInterval(checkAcademie, 20 * 60 * 1000);
setTimeout(checkAcademie, 25000);

// ---------- Séquence de démarrage ----------
const bootLines = [
  '> AELYRA — ASSISTANTE IA PERSONNELLE (ex Isaac IA Juniors)',
  '> Créée par Isaac — Côte d\'Ivoire — Voix féminine chargée',
  '> Chargement des modules cognitifs......... OK',
  '> Liaison avec le serveur local............ OK',
  '> Calibrage du microphone.................. OK',
  '> Synthèse vocale française (femme)........ OK',
  '> Reconnaissance du créateur : Isaac....... OK',
  '> Mot d\'appel : Aelyra, Jeanette, Onyx, Aegis... OK',
  '> SECONDE AGENTE CHARGÉE : JEANETTE (développeuse) OK',
  '> TROISIÈME AGENTE CHARGÉE : ONYX (black hat — offensif) OK',
  '> QUATRIÈME AGENTE CHARGÉE : AEGIS (hacker éthique — défensif) OK',
  '> Socle cyberdéfense (éthique, périmètre légal) OK',
  '> Bonjour Isaac, mon créateur. Les quatre agentes sont en ligne.'
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
          setState(null, wakeMode ? veilleMsg(agentActif) : 'En attente de vos ordres, Isaac');
          addMsg('Aelyra', 'Bonjour Isaac, mon créateur. Je suis en mode système : cliquez n\'importe où dans cette fenêtre une première fois pour que je vous écoute en permanence. Appelez-moi ensuite d\'un simple « Aelyra, ... ». Dites « aide » pour mes capacités, ou lancez INSTALL-ISAAC.bat pour que je démarre tout seul avec Windows.');
          speak('Bonjour Isaac, mon créateur. Je m\'appelle Aelyra. Je suis en veille permanente. Cliquez une fois dans la fenêtre, puis appelez-moi : Aelyra.');
        }
      }, 700);
    }
  }, 380);
})();

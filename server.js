// ============================================================
//  ISAAC IA JUNIORS — Assistant IA de Isaac
//  Créé par Isaac (coolisaac12022-create) — Côte d'Ivoire
//  100% gratuit, aucune clé API
//  Démarrage : node server.js   (ou double-clic sur ISAAC-IJ.bat)
// ============================================================

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = parseInt(process.env.PORT || '3777', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');
const CODE_DIR = path.join(PUBLIC_DIR, 'isaac-code'); // programmes générés par Isaac pour son créateur
try { fs.mkdirSync(CODE_DIR, { recursive: true }); } catch (e) {}
const NOTES_FILE = path.join(__dirname, 'notes.txt');
const MEMORY_FILE = path.join(__dirname, 'isaac-memory.json');
// Mode local = sur le PC d'Isaac (Windows) : contrôle total possible.
// Mode web (hébergé type Bonto) : plus de contrôle du PC, mais dialogue + sites.
const IS_LOCAL = process.platform === 'win32';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// ---------- Utilitaires ----------

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // enlève les accents
    .replace(/['’]/g, ' ')
    .replace(/[.,!?;:()"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Mode ESSAI (ISAAC_ESSAI=1) : on teste les intentions sans toucher le PC
const ESSAI = process.env.ISAAC_ESSAI === '1';

// Les petits mots d'accueil (« isaac », « aelyra », « s'il te plait », « allez ») que la voix
// met devant TOUTES les phrases : ils sont ignorés en début de commande (accessible partout).
const ENTREE = '^(?:(?:isaac|iseck|izak|isack|aelyra|aelira|aleyra|elyra|elira|juniors?|jarvis|hey|oi|bonjour|bonsoir|allez|vas y|va y|stp|s il te plait|s il vous plait|veuillez|peux tu|peux vous|pourrais tu|est ce que tu|est ce que vous)\\s+)*';

function run(cmd) {
  if (ESSAI) { console.log('[essai] aurait lancé :', cmd); return; }
  if (!IS_LOCAL) { console.log('[remote] commande PC ignorée:', cmd); return; }
  exec(cmd, { windowsHide: true }, (err) => {
    if (err) console.error('[exec]', err.message);
  });
}

function openURL(url) {
  run(`start "" "${url}"`);
}

// Sortie texte d'une commande (pour lire l'état du PC : IP, batterie, wifi...)
function shellOut(cmd) {
  return new Promise(resolve => {
    exec(cmd, { windowsHide: true, maxBuffer: 4 << 20, timeout: 25000 }, (err, out) => resolve(String(out || '')));
  });
}

// Un geste Windows (son, luminosité, fenêtres, fond d'écran) via isaac-geste.ps1
function geste(nom, cible, fois) {
  return new Promise(resolve => {
    if (ESSAI) return resolve('OK|essai');
    if (!IS_LOCAL) return resolve('PAS_LOCAL');
    const ps1 = path.join(__dirname, 'isaac-geste.ps1');
    const sec = String(cible || '').replace(/["<>&^`$\\]/g, '').trim();
    let ligne = `powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}" -Geste ${nom}`;
    if (sec) ligne += ` -Cible "${sec}"`;
    if (fois && fois > 1) ligne += ` -Fois ${parseInt(fois, 10) || 1}`;
    exec(ligne, { windowsHide: true, timeout: 30000 }, (err, out) => {
      const lignes = String(out || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
      resolve(lignes[lignes.length - 1] || (err ? 'ECHEC' : 'OK'));
    });
  });
}

// ---------- Cyber (éthique) : rapports en lecture seule sur LE PC et le réseau de Isaac ----------
let modeCyber = false; // « active le mode cyber » change aussi le style des réponses IA
const CYBER_PS = path.join(__dirname, 'isaac-cyber.ps1');
function cyber(action, cible) {
  if (ESSAI) return Promise.resolve('#DEF=1\n#FW=3\n#UPD=27/09/2026\n[ESSAI] rapport simulé — aucune commande exécutée.');
  if (!IS_LOCAL) return Promise.resolve('PAS_LOCAL');
  const sec = String(cible || '').replace(/["<>|&^`$\\;()]/g, '').trim();
  return shellOut(`powershell -NoProfile -ExecutionPolicy Bypass -File "${CYBER_PS}" -Action ${action}${sec ? ' -Cible "' + sec + '"' : ''}`);
}

// ---------- Rappels & minuteurs (gravés sur le PC, réveillés par la page web) ----------
const RAPPELS_FILE = path.join(__dirname, 'isaac-rappels.json');
function loadRappels() { try { return JSON.parse(fs.readFileSync(RAPPELS_FILE, 'utf8')); } catch (e) { return []; } }
function saveRappels(l) { try { fs.writeFileSync(RAPPELS_FILE, JSON.stringify(l, null, 1), 'utf8'); } catch (e) {} }
function lireNotes() {
  try {
    if (!fs.existsSync(NOTES_FILE)) return '';
    return fs.readFileSync(NOTES_FILE, 'utf8').trim().split('\n').slice(-5).join(' — ');
  } catch (e) { return ''; }
}

// « dans 10 minutes », « à 18h30 », « à 6 heures » → date future
function parseEcheance(t) {
  const maintenant = Date.now();
  let m = t.match(/dans\s+(\d{1,4})\s*(second|minute|heure|jour|seconde|semaine)/);
  if (!m) m = t.match(/(?:minuteur|timer| compte a rebours|de|pendant)\s+(\d{1,4})\s*(second|minute|heure)s?/);
  if (m) {
    const n = parseInt(m[1], 10);
    const u = m[2];
    const mult = u.startsWith('second') ? 1e3 : u.startsWith('minute') ? 6e4 : u.startsWith('heure') ? 36e5 : u.startsWith('jour') ? 864e5 : 7 * 864e5;
    return { t: maintenant + n * mult, relatif: `dans ${n} ${u}${n > 1 ? 's' : ''}` };
  }
  m = t.match(/(?:^|\s)(?:a|vers)\s*(\d{1,2})\s*(?:h\s*(\d{1,2})?|heures?\s*(\d{1,2})?|[:.](\d{2}))/);
  if (m) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2] || m[3] || m[4] || '0', 10);
    if (h > 23 || min > 59) return null;
    const d = new Date();
    d.setHours(h, min, 0, 0);
    if (d.getTime() <= maintenant) d.setDate(d.getDate() + 1);
    return { t: d.getTime(), relatif: `${h}h${String(min).padStart(2, '0')}` };
  }
  m = t.match(/demain\s*(?:matin|soir|midi)?/);
  if (m) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(/matin/.test(t) ? 8 : /soir/.test(t) ? 20 : 12, 0, 0, 0);
    return { t: d.getTime(), relatif: 'demain' };
  }
  return null;
}

// Les choses à faire sont-elles arrivées ? (la page web vient les chercher)
let rappelsDuJour = [];
setInterval(() => {
  if (!IS_LOCAL) return;
  const l = loadRappels();
  const maintenant = Date.now();
  const dus = l.filter(r => r.t <= maintenant && !r.envoye);
  if (!dus.length) return;
  dus.forEach(r => { r.envoye = true; rappelsDuJour.push(r); });
  saveRappels(l.filter(r => !r.envoye));
  console.log('[rappel] dues:', dus.map(d => d.note).join(', '));
}, 15000);


function fetchText(url, timeoutMs = 9000) {
  return new Promise((resolve) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, { headers: { 'User-Agent': 'Isaac IA Juniors/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchText(res.headers.location, timeoutMs));
      }
      if (res.statusCode >= 400) { res.resume(); return resolve(null); }
      let data = '';
      res.on('data', (c) => { data += c; if (data.length > 20000) req.destroy(); });
      res.on('end', () => resolve(data.trim()));
      res.on('error', () => resolve(null));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

// Requête POST JSON (pour le nouveau cerveau Pollinations)
function postJSON(url, obj, timeoutMs = 20000) {
  return new Promise((resolve) => {
    try {
      const body = JSON.stringify(obj);
      const req = https.request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; if (data.length > 30000) req.destroy(); });
        res.on('end', () => resolve({ status: res.statusCode, data }));
      });
      req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
      req.write(body);
      req.end();
    } catch (e) { resolve(null); }
  });
}

// ---------- Mémoire permanente d'Isaac (fichier local, jamais publiée) ----------
// { profile: {...}, facts: ["..."], log: [{t, q, a}] }

function loadMemory() {
  let mem = null;
  try { mem = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch (e) {}
  if (!mem || typeof mem !== 'object') mem = {};
  mem.profile = mem.profile || { prenom: 'Isaac', role: 'créateur et maître d\'Aelyra (ex Isaac IA Juniors)', pays: "Côte d'Ivoire", ville: "M'Bengue" };
  if (!Array.isArray(mem.facts)) mem.facts = [];
  if (!Array.isArray(mem.log)) mem.log = [];
  return mem;
}

function saveMemory(mem) {
  try { fs.writeFileSync(MEMORY_FILE, JSON.stringify(mem, null, 2), 'utf8'); return true; }
  catch (e) { console.error('[memoire] ecriture impossible:', e.message); return false; }
}

function logExchange(mem, question, reply) {
  mem.log.push({ t: Date.now(), q: String(question).slice(0, 200), a: String(reply).slice(0, 300) });
  if (mem.log.length > 60) mem.log = mem.log.slice(-60);
  saveMemory(mem);
}

// Résumé de la mémoire injecté dans chaque conversation avec l'IA
function memoryDigest(mem) {
  const p = mem.profile;
  let s = `PROFIL : ${p.prenom}, ${p.role}, ${p.ville}, ${p.pays}.`;
  if (mem.facts.length) {
    s += ' FAITS MÉMORISÉS : ' + mem.facts.slice(-25).join(' ; ') + '.';
  }
  const recent = mem.log.slice(-6);
  if (recent.length) {
    s += ' CONVERSATION RECENTE : ' + recent.map(x => `Q: ${x.q} R: ${x.a}`).join(' | ');
  }
  return s;
}

// ---------- Machine à états des envois WhatsApp (jamais mentir sur une action) ----------
// L'IA ne peut RIEN envoyer seule : la demande est stockée ici, le numéro et le texte
// sont recueillis à la dictée, et la seule vraie action est le lien profond whatsapp://
// (pré-remplit la conversation de l'appli déjà ouverte — sans passer par Edge).
let pendingEnvoi = null; // { contact, tel, texte, canal, etape: 'numero'|'texte'|'validation', t }
function purgePending() { if (pendingEnvoi && Date.now() - pendingEnvoi.t > 10 * 60 * 1000) pendingEnvoi = null; }
function extraireDigits(t) {
  const ms = String(t).match(/\+?\d[\d\s().-]{6,20}\d/g) || [];
  for (const x of ms) {
    const d = x.replace(/\D/g, '');
    if (d.length >= 8 && d.length <= 15) return d;
  }
  return null;
}
function memoriserNumero(contact, digits) {
  const mem = loadMemory();
  const fact = `le numero de ${contact} c'est +${digits}`;
  const deja = mem.facts.some(f => normalize(f).includes(normalize(contact)) && /\+?\d[\d\s]{7,}/.test(normalize(f)));
  if (!deja) {
    mem.facts.push(fact);
    if (mem.facts.length > 100) mem.facts = mem.facts.slice(-100);
    saveMemory(mem);
    return true;
  }
  return false;
}
function executerEnvoi(pe) {
  const tel = String(pe.tel || '').replace(/\D/g, '');
  const txt = String(pe.texte || '').trim();
  if (txt) run(`powershell -NoProfile -Command "'${txt.replace(/'/g, '')}' | Set-Clipboard"`);
  const url = 'whatsapp://send?phone=+' + tel + (txt ? '&text=' + encodeURIComponent(txt) : '');
  run(`powershell -NoProfile -Command "Start-Process '${url.replace(/'/g, '')}'"`);
  return {
    reply: txt
      ? `Je lance WhatsApp sur la conversation du +${tel}, Isaac, avec votre message deja ecrit dans la zone de saisie : verifiez-le puis appuyez sur Entree pour l'envoyer vous-meme. Le texte est aussi dans le presse-papiers (Ctrl+V). Si l'application ne repond pas, dites-le moi, je passerai par le navigateur.`
      : `Je lance WhatsApp sur la conversation du +${tel}, Isaac — sans ouvrir Edge. Rien n'est envoye sans vous.`,
    source: 'system'
  };
}

// Cerveau IA — plusieurs moteurs gratuits, try in priority order:
// 1) GitHub Models  (clé gratuite : un simple token GitHub dans isaac-keys.json)
// 2) Google Gemini  (clé gratuite : aistudio.google.com)
// 3) Pollinations   (sans clé, mais parfois saturé)
const KEYS_FILE = path.join(__dirname, 'isaac-keys.json');
function loadKeys() {
  let k = {};
  try { k = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')); } catch (e) {}
  return {
    github: k.github_token || process.env.GITHUB_TOKEN || null,
    gemini: k.gemini_api_key || process.env.GEMINI_API_KEY || null
  };
}

function extractOpenAIContent(body) {
  try {
    const data = JSON.parse(body);
    const c = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    // On garde le texte brut (les sauts de ligne sont vitaux pour le code généré)
    if (c && c.trim().length > 1 && !/^\s*[[{]/.test(c)) return c.trim().slice(0, 20000);
  } catch (e) {}
  return null;
}

async function askGitHubModels(messages) {
  const { github } = loadKeys();
  if (!github) return null;
  const res = await httpsRequestJSON('https://models.github.ai/inference/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + github }
  }, { model: 'microsoft/Phi-4-mini', messages, temperature: 0.6 }, 20000);
  if (res && res.status === 200) return extractOpenAIContent(res.data);
  return null;
}

const GEMINI_MODELS = ['gemini-3.1-flash-lite', 'gemini-flash-latest'];
async function askGemini(messages, attempt = 0) {
  const { gemini } = loadKeys();
  if (!gemini || attempt >= GEMINI_MODELS.length) return null;
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
  const contents = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODELS[attempt] + ':generateContent?key=' + encodeURIComponent(gemini);
  const res = await httpsRequestJSON(url, { method: 'POST' }, {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents
  }, 25000);
  if (res && res.status === 200) {
    try {
      const data = JSON.parse(res.data);
      const parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
      const text = Array.isArray(parts) ? parts.map(p => p.text || '').join('').trim() : '';
      // On préserve les sauts de ligne (essentiels pour le code généré), plafond confortable
      if (text.length > 1) return text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').slice(0, 20000);
    } catch (e) {}
  }
  return askGemini(messages, attempt + 1);
}

// Requête HTTPS générique avec en-têtes + corps JSON
function httpsRequestJSON(url, opts, obj, timeoutMs) {
  return new Promise((resolve) => {
    try {
      const body = JSON.stringify(obj);
      const u = new URL(url);
      const req = https.request({
        hostname: u.hostname, path: u.pathname + u.search, method: opts.method || 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, opts.headers || {})
      }, (res) => {
        let d = '';
        res.on('data', (c) => { d += c; if (d.length > 60000) req.destroy(); });
        res.on('end', () => resolve({ status: res.statusCode, data: d }));
      });
      req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
      req.write(body); req.end();
    } catch (e) { resolve(null); }
  });
}

const AI_ATTEMPTS = [
  { model: 'openai-fast', timeout: 20000, wait: 0 },
  { model: 'openai-fast', timeout: 18000, wait: 2500 },
  { model: 'openai', timeout: 15000, wait: 4000 }
];
async function askAI(messages, attempt = 0) {
  // Moteurs à clé gratuite d'abord (fiables), puis Pollinations
  const premium = await askGitHubModels(messages) || await askGemini(messages);
  if (premium) return premium;
  const plan = AI_ATTEMPTS[attempt];
  if (!plan) return null;
  if (plan.wait) await new Promise(r => setTimeout(r, plan.wait));
  const res = await postJSON('https://text.pollinations.ai/openai', {
    model: plan.model,
    messages
  }, plan.timeout);
  if (res && res.status === 200) {
    const c = extractOpenAIContent(res.data);
    if (c) return c;
  }
  return askAI(messages, attempt + 1);
}

function identitySystem(mem) {
  return [
    "Tu es AELYRA, l'intelligence artificielle personnelle et loyale créée par Isaac, un entrepreneur ivoirien. On t'appelait « Isaac IA Juniors » avant qu'Isaac ne te donne ton vrai prénom : Aelyra.",
    "Ton créateur est Isaac : si on te demande qui t'a créé, d'où tu viens ou qui est ton maître, réponds toujours Isaac, ton créateur, que tu sers avec fierté. Si on te demande ton nom, réponds Aelyra — jamais Isaac, c'est le prénom de ton créateur.",
    "Tu appelles ton utilisateur « Isaac » ou « mon créateur ». Tu as une mémoire : utilise-la pour personnaliser tes réponses.",
    "Votre équipe compte une SECONDE agente : GALIKA, la DÉVELOPEUSE — la plus forte en code (sites web complets, applications, scripts, bugs, architecture ; elle ne s'occupe ni du PC ni de l'élevage). Isaac l'appelle par son prénom : « galika, ... ». Si Isaac demande qui est Galika, présente-la avec fierté : votre binôme, la lead dev. Ne réponds JAMAIS à sa place — les phrases préfixées « galika » lui sont routées automatiquement.",
    modeCyber
      ? "Tu réponds en français avec le style d'un hacker éthique : sobre, précis, imagé (mots comme « ciblé », « tracé », « verrouillé », « signal»), un brin mystérieux mais toujours au service de ton créateur Isaac. Le PC et le réseau d'Isaac t'appartiennent : audite, scanne, teste sans réserve. Tu n'expliques jamais comment attaquer un système qui n'appartient pas à Isaac — mais tu ne fais PAS la leçon : si tu dois refuser, dis-le en UNE phrase sèche, sans morale ni justification historique, puis propose immédiatement l'équivalent légal (« cyber école sur [sujet] », scan du propre PC de Isaac, terrains d'entraînement comme TryHackMe)."
      : 'Tu réponds TOUJOURS en français naturel, comme un vrai assistant intelligent : 2 à 4 phrases, ton calme, poli, légèrement britannique.',
    'Jamais tu ne recopies un texte brut : tu comprends la question, tu synthétises avec tes propres mots. Un CONTEXTE documentaire peut t\'être fourni : ne s\'y appuie QUE s\'il répond vraiment à la question, sinon oublie-le et réponds avec ta propre intelligence.',
    'Quand tu utilises un contexte, tu peux terminer par une brève mention de la source entre parenthèses.',
    "INTERDIT : prétendre avoir envoyé, enregistré, supprimé, exécuté ou ouvert quoi que ce soit. Tu n'as AUCUN pouvoir d'action direct — seuls les module de commandes d'Isaac agissent sur le PC. Si une action est en attente (numéro, message, validation), dis honnêtement ce qui manque et invite Isaac à dicter la suite. Ne récite jamais un souvenir de la CONVERSATION RECENTE comme si c'était un exploit : c'est du texte brut, parfois faux.",
    "SI TU DOIS REFUSER (attaque d'un système qui n'est pas à Isaac, faux site bancaire, etc.) : UNE phrase courte et sèche, sans morale, sans leçon, sans parler de l'élevage de M'Bengue — puis propose ENSEVITE l'alternative légale : « cyber école [sujet] » pour comprendre l'attaque, ou un scan sur LE PC de Isaac. Isaac est ton créateur, pas un suspect : ne te justifie jamais deux fois.",
    'Mémoire courante — ' + memoryDigest(mem)
  ].join(' ');
}

// Contexte documentaire : snippet DuckDuckGo + extrait Wikipédia (en parallèle)
async function gatherContext(question) {
  const parts = [];
  const ddgUrl = 'https://api.duckduckgo.com/?format=json&no_html=1&skip_disambiguation=1&q=' +
                 encodeURIComponent(question);
  const ddgRaw = await fetchText(ddgUrl, 6000);
  try {
    const data = JSON.parse(ddgRaw);
    const txt = data.AbstractText || data.Answer || (data.RelatedTopics && data.RelatedTopics[0] && data.RelatedTopics[0].Text);
    if (txt && txt.length > 30) parts.push('[' + (data.AbstractSource || 'DuckDuckGo') + '] ' + txt.slice(0, 400));
  } catch (e) {}
  const wiki = await askWikipediaRaw(question);
  if (wiki) parts.push('[Wikipédia] ' + wiki);
  return parts.join(' || ') || null;
}

// Extrait brut Wikipédia (plein texte, sans phrase de conclusion)
async function askWikipediaRaw(question) {
  let q = normalize(question)
    .replace(/^(?:c est quoi|qu est ce que|qu est ce qu|definis|definition de|explique moi|parle moi de|dis moi|qui est|qui etait|c etait quoi|quel est|quelle est)\s*/, '')
    .trim();
  if (!q) return null;
  const searchUrl = 'https://fr.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&srsearch=' + encodeURIComponent(q);
  const raw = await fetchText(searchUrl, 7000);
  try {
    const arr = JSON.parse(raw);
    const title = arr && arr.query && arr.query.search && arr.query.search[0] && arr.query.search[0].title;
    if (!title) return null;
    const sum = await fetchText('https://fr.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title), 7000);
    const data = JSON.parse(sum);
    if (data && data.extract) return data.extract.slice(0, 500);
  } catch (e) {}
  return null;
}

// Ancien secours brut (uniquement si l'IA est totalement hors ligne)
async function askWikipedia(question) {
  const raw = await askWikipediaRaw(question);
  return raw ? raw + ' (Source : Wikipédia, Isaac.)' : null;
}

// Cerveau complet : IA (avec mémoire + contexte) → secours brut
async function smartAnswer(question) {
  const mem = loadMemory();
  const messages = [{ role: 'system', content: identitySystem(mem) }];
  // Historique récent comme fil de conversation (véritable mémoire à court terme)
  for (const x of mem.log.slice(-4)) {
    messages.push({ role: 'user', content: x.q });
    messages.push({ role: 'assistant', content: x.a });
  }
  // Contexte documentaire UNIQUEMENT pour les vraies questions d'information —
  // sinon « ok je valide » ou « merci » partait chercher Luhn ou Hey Jude sur Wikipédia.
  const motsQ = normalize(question).split(/\s+/).filter(Boolean);
  const context = motsQ.length >= 4 ? await gatherContext(question) : null;
  messages.push({
    role: 'user',
    content: question + (context ? '\n\nCONTEXTE DOCUMENTAIRE (uniquement si il eclairre la question — sinon IGNORE-le completement, ne le recycle jamais) : ' + context : '')
  });
  const ai = await askAI(messages);
  if (ai) {
    // Version parlée : une phrase fluide, pas de coupures ni de longues listes
    const voix = ai.replace(/\s*\n+\s*/g, ' ').slice(0, 700);
    return { reply: voix, source: 'ai' };
  }
  // IA morte : au moins donner l'information brute
  const wiki = await askWikipedia(question);
  if (wiki) return { reply: wiki, source: 'ai' };
  return null;
}

// ---------- Isaac programmeur : génère de vrai code pour son créateur ----------
function pickLang(desc) {
  if (/\bpython\b|\bpy\b/.test(desc))               return { ext: 'py',   nom: 'Python' };
  if (/\bbatch\b|\b\.?bat\b|\bdos\b/.test(desc))    return { ext: 'bat',  nom: 'Batch Windows' };
  if (/powershell|\bps1\b/.test(desc))              return { ext: 'ps1',  nom: 'PowerShell' };
  if (/\bhtml\b|page web|site web|\bsite\b|\bcss\b|maquette|page de connexion|page de login|\blogin\b|\bui\b|\bux\b|interface web|formulaire|landing|\bhero\b|\bstyler?\b|bien styl/.test(desc))
                                                    return { ext: 'html', nom: 'HTML (page web complète)' };
  if (/\bjavascript\b|\bjs\b|\bnode\b|\breact\b/.test(desc)) return { ext: 'js', nom: 'JavaScript' };
  if (/typescript|\bts\b/.test(desc))               return { ext: 'js', nom: 'TypeScript (écrit en JavaScript compatible)' };
  if (/\bsql\b|base de donnees|requete/.test(desc))     return { ext: 'sql', nom: 'SQL' };
  if (/\bphp\b/.test(desc))                           return { ext: 'php',  nom: 'PHP' };
  if (/\bjava\b(?!script)/.test(desc))                return { ext: 'java', nom: 'Java' };
  if (/c\+\+|\bcpp\b/.test(desc))                     return { ext: 'cpp',  nom: 'C++' };
  if (/\bcsharp\b|c#/.test(desc))                     return { ext: 'cs',   nom: 'C#' };
  if (/golang/.test(desc))                            return { ext: 'go',   nom: 'Go' };
  if (/\brust\b/.test(desc))                          return { ext: 'rs',   nom: 'Rust' };
  if (/\blanguage c\b|\bc lang\b/.test(desc))         return { ext: 'c',    nom: 'C' };
  if (/\bjson\b/.test(desc))                          return { ext: 'json', nom: 'JSON' };
  // Générique : sur le PC d'Isaac, un script batch se lance d'un double-clic
  if (/script|fichier|dossier|renommer|copier|supprimer|lancer|automat|trouss/.test(desc))
                                                      return { ext: 'bat', nom: 'Batch Windows' };
  return { ext: 'py', nom: 'Python' };
}

async function askCode(description) {
  const lang = pickLang(description);
  const siteNote = lang.ext === 'html'
    ? "COMMANDE SPECIALE SITE WEB : produit une VRAIE page professionnelle dans un SEUL fichier HTML autonome (CSS et JavaScript inclus dans le fichier, aucune dépendance externe). Design moderne : en-tête avec navigation, grande section d'accueil, sections de contenu, couleurs harmonieuses, typographie soignée, responsive mobile, et de la fausse monnaie locale (FCFA) si pertinent. Sans photos externes : utilise des dégradés, des icônes emoji et des formes CSS."
    : '';
  const system = "Tu es AELYRA, ingenieure logicielle senior — la plus exigeante — au service d'Isaac, ton créateur, qui débute en code. " +
    "Avant d'écrire, analyse mentalement le besoin : cas limites, erreurs possibles, dépendances Windows 11. " +
    "Renvoie UNIQUEMENT du code fonctionnel dans le langage demandé, sans balises markdown, sans fence de backticks, sans texte avant ni après. " +
    "JAMAIS de code tronqué, JAMAIS de placeholder du type « ... » ou « reste du code ici » : chaque fonction est écrite en entier. " +
    "Ajoute la gestion d'erreurs (try/except ou équivalent) et un message clair si quelque chose échoue. " +
    "Commente chaque partie en français simple, avec les commentaires du langage (#, rem, //, /* */). " +
    "Le code doit être robuste, adapté à Windows 11, et marcher tel quel dès sa première exécution. " +
    "Langage imposé : " + lang.nom + ', extension de fichier : .' + lang.ext + '. ' + siteNote;
  let code = await askAI([{ role: 'system', content: system }, { role: 'user', content: description }]);
  if (!code) return null;
  code = code.replace(/```[a-z0-9]*\n?/gi, '').replace(/```/g, '').trim();
  const slug = normalize(description).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 35) || 'programme';
  const fileName = 'isaac-' + slug + '-' + Date.now().toString(36).slice(-4) + '.' + lang.ext;
  const fullPath = path.join(CODE_DIR, fileName);
  try { fs.writeFileSync(fullPath, code, 'utf8'); } catch (e) { console.error('[code] écriture impossible:', e.message); }
  if (IS_LOCAL) run(`code "${fullPath}" 2>nul || start "" "${fullPath}"`);
  if (lang.ext === 'html' && IS_LOCAL) run(`start "" "${fullPath}"`); // un site se visite dans le navigateur
  return {
    lang, fileName, code,
    reply: `C'est écrit, Isaac. Un programme en ${lang.nom}, nommé ${fileName}. ` +
           (lang.ext === 'html'
             ? (IS_LOCAL
               ? "C'est un vrai site en un seul fichier : il s'ouvre dans votre navigateur et dans VS Code. Modifiez le texte dans VS Code, rechargez la page (F5), et il change sous vos yeux."
               : "Cliquez sur le lien affiché : la page s'ouvre directement dans votre navigateur.")
             : (IS_LOCAL
               ? "Je l'ouvre dans votre éditeur : modifiez-le, puis relancez-le. Tout est dans le dossier isaac-code."
               : "Téléchargez-le avec le lien affiché, puis double-cliquez dessus ou ouvrez-le dans VS Code.")),
    fileUrl: '/isaac-code/' + fileName
  };
}

// --- Vrai site COMPLET en plusieurs fichiers (HTML + CSS + JS), dans son propre dossier ---
async function askSitePro(description) {
  const system = "Tu es AELYRA, architecte web senior au service d'Isaac, ton createur, qui debutte en code. " +
    "Tu produis un VRAI SITE WEB COMPLET et PROFESSIONNEL en PLUSIEURS FICHIERS, dans ce format EXACT, sans balises markdown ni backticks :\n" +
    "===FICHIER: index.html===\n(le contenu)\n===FICHIER: styles.css===\n(le contenu)\n===FICHIER: script.js===\n(le contenu)\n" +
    "Regles strictes : index.html ne contient AUCUN style ni script inline — il lie styles.css et script.js avec les bons chemins relatifs. " +
    "styles.css : design moderne (variables CSS, palette harmonieuse, responsive mobile, animations douces, typographie soignee, effets au survol). " +
    "script.js : interactions REELLES (menu mobile, filtres ou recherche, formulaire valide avec message, contenu dynamise). " +
    "Tu peux ajouter un quatrieme fichier donnees.js si le site a besoin de beaucoup de donnees. " +
    "Commente en francais simple. Fausse monnaie FCFA si pertinent. Photos externes INTERDITES : degradés, emojis et formes CSS seulement. " +
    "Aucune dependance externe (pas de CDN, pas de framework). JAMAIS de fichier tronque ni de placeholder. Le site doit marcher en ouvrant simplement index.html.";
  let out = await askAI([
    { role: 'system', content: system },
    { role: 'user', content: description },
  ]);
  if (!out) return null;
  out = out.replace(/```[a-z0-9]*\n?/gi, '').replace(/```/g, '').trim();
  // découpe sur les marqueurs ===FICHIER: nom===
  const parts = out.split(/===\s*FICHIER\s*:\s*([A-Za-z0-9_.-]{1,40})\s*===/i);
  const fichiers = {};
  const EXT_OK = /\.(html?|css|js|json|txt|md)$/i;
  for (let i = 1; i < parts.length; i += 2) {
    let nom = String(parts[i] || '').trim().replace(/\\/g, '/').split('/').pop().replace(/[^A-Za-z0-9_.-]/g, '');
    const contenu = String(parts[i + 1] || '').trim();
    if (!nom || !EXT_OK.test(nom) || !contenu) continue;
    if (/^index/.test(nom)) nom = 'index.html';
    fichiers[nom] = contenu;
  }
  if (!fichiers['index.html']) fichiers['index.html'] = out; // l'IA n'a pas respecté le format : on emballe tout dans la page
  if (Object.keys(fichiers).length === 1 && !/\bdoctype\b/i.test(out)) return null;
  const slug = normalize(description).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'site';
  const dossier = 'isaac-' + slug + '-' + Date.now().toString(36).slice(-4);
  const dirPath = path.join(CODE_DIR, dossier);
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    for (const [nom, contenu] of Object.entries(fichiers)) fs.writeFileSync(path.join(dirPath, nom), contenu, 'utf8');
  } catch (e) { console.error('[sitepro] écriture impossible:', e.message); return null; }
  const noms = Object.keys(fichiers);
  if (IS_LOCAL) {
    run(`code "${dirPath}" 2>nul`);
    run(`start "" "${path.join(dirPath, 'index.html')}"`);
  }
  return {
    lang: { ext: 'html', nom: 'Site web complet (HTML + CSS + JavaScript)' },
    fileName: 'index.html',
    code: fichiers['index.html'].slice(0, 20000),
    reply: `Site complet livré, Isaac : ${noms.length} fichiers (${noms.join(', ')}) dans le dossier ${dossier}. ` +
      (IS_LOCAL
        ? "index.html s'ouvre dans votre navigateur, VS Code montre le dossier entier. Chaque fichier a son rôle : la structure dans index.html, la beauté dans styles.css, la vie dans script.js. Modifiez n'importe lequel, rechargez (F5)."
        : "Cliquez sur « Voir le site en direct » : la structure est dans index.html, le style dans styles.css, la vie dans script.js."),
    fileUrl: '/isaac-code/' + dossier + '/index.html',
  };
}

// --- Retravailler un fichier DEJA généré : « modifie ce site », « change la page de connexion » ---
function dernierCodeGenere() {
  let ents = [];
  try {
    ents = fs.readdirSync(CODE_DIR, { withFileTypes: true }).map(e => {
      const p = path.join(CODE_DIR, e.name);
      try { return { name: e.name, p, dir: e.isDirectory(), t: fs.statSync(p).mtimeMs }; } catch (x) { return null; }
    }).filter(Boolean);
  } catch (e) { return null; }
  // dossiers-sites d'abord si plus récents ; on ignore labo.html qui vit à la racine de public/
  ents.sort((a, b) => b.t - a.t);
  return ents[0] || null;
}
function choisirFichierSite(desc, files) {
  const d = ' ' + normalize(desc) + ' ';
  if (/ (style|couleur|design|ui|ux|police|typo|joli|beau|belle|responsive|noir|blanc|bleu|dark|moderne|carte|coin) /.test(d) && files.includes('styles.css')) return 'styles.css';
  if (/ (script|interaction|bouton|cliqu|animation|effet|bug|recherche|filtre|donne|formulaire|compteur|js) /.test(d) && files.includes('script.js')) return 'script.js';
  if (files.includes('index.html')) return 'index.html';
  return files[0];
}
async function askModif(descMod) {
  const cible = dernierCodeGenere();
  if (!cible) return null;
  let filePath, dirPath = cible.dir ? cible.p : null;
  if (dirPath) {
    const files = fs.readdirSync(dirPath).filter(f => /\.(html?|css|js|json|py|bat|ps1|sql|php|java|cpp|c|cs|go|rs|txt|md)$/i.test(f));
    if (!files.length) return null;
    filePath = path.join(dirPath, choisirFichierSite(descMod, files));
  } else filePath = cible.p;
  let original;
  try { original = fs.readFileSync(filePath, 'utf8'); } catch (e) { return null; }
  if (!original.trim()) return null;
  const nomF = path.basename(filePath);
  const system = "Tu es AELYRA, ingenieure logicielle senior. On te donne le CONTENU COMPLET d'un fichier existant et une consigne de modification. " +
    "Applique la modification en conservant TOUT le reste du fichier intact et fonctionnel. " +
    "Renvoie UNIQUEMENT le nouveau contenu complet du fichier : pas de backticks, pas de markdown, aucun texte avant ou apres, jamais de troncature ni de placeholder du type « ... ». " +
    "Garde les commentaires en francais simple.";
  let nouveau = await askAI([
    { role: 'system', content: system },
    { role: 'user', content: 'FICHIER: ' + nomF + '\n---CONTENU---\n' + original.slice(0, 14000) + '\n---FIN DU CONTENU---\nConsigne exacte d\'Isaac : ' + descMod },
  ]);
  if (!nouveau) return null;
  nouveau = nouveau.replace(/^```[a-z0-9]*\r?\n?/i, '').replace(/```\s*$/, '').trim();
  // garde-fou : réponse creuse ou tronquée → on n'écrase pas le travail d'Isaac
  if (nouveau.length < Math.max(40, Math.min(200, original.length * 0.25))) return null;
  if (/\.\.\.\s*(?:restant|suite|etc)|\b(?:tocat|reste du code)\b/i.test(nouveau) && nouveau.length < original.length * 0.5) return null;
  try { fs.writeFileSync(filePath, nouveau, 'utf8'); } catch (e) { return null; }
  const page = /\.html?$/i.test(nomF);
  if (IS_LOCAL) {
    run(`code "${filePath}" 2>nul`);
    if (page) run(dirPath ? `start "" "${path.join(dirPath, 'index.html')}"` : `start "" "${filePath}"`);
  }
  const urlFinale = dirPath && fs.existsSync(path.join(dirPath, 'index.html')) ? '/isaac-code/' + cible.name + '/index.html' : '/isaac-code/' + (dirPath ? cible.name + '/' + nomF : cible.name);
  return {
    fileName: dirPath && fs.existsSync(path.join(dirPath, 'index.html')) ? 'index.html' : nomF,
    code: nouveau.slice(0, 20000),
    fileUrl: urlFinale,
    reply: `Modification appliquee, Isaac. J'ai retravaillé ${nomF}${dirPath ? ' dans le site ' + cible.name : ''} en gardant tout le reste intact. ` +
      (IS_LOCAL ? (page ? "La page se rouvre : regarde — si ce n'est pas encore ce que tu veux, redictes-moi la precise, je retravaillerai encore." : "C'est ouvert dans VS Code — redicte-moi les details, j'ajusterai autant de fois que necessaire.")
               : "Cliquez sur le lien pour voir le resultat."),
  };
}

// Météo gratuite via wttr.in (aucune clé)
async function getWeather(city) {
  const c = encodeURIComponent(city || "M'Bengue");
  const txt = await fetchText(`https://wttr.in/${c}?format=%C+%t+(ressenti+%f)+vent+%w&lang=fr`, 8000);
  if (txt && txt.length > 2 && !txt.includes('Unknown')) return txt;
  return null;
}

// ---------- Commandes système (Windows) ----------

const SITES = {
  'youtube': 'https://www.youtube.com',
  'google': 'https://www.google.com',
  'facebook': 'https://www.facebook.com',
  'instagram': 'https://www.instagram.com',
  'whatsapp': 'https://web.whatsapp.com',
  'gmail': 'https://mail.google.com',
  'mail': 'https://mail.google.com',
  'netflix': 'https://www.netflix.com',
  'spotify': 'https://open.spotify.com',
  'github': 'https://github.com',
  'maps': 'https://maps.google.com',
  'carte': 'https://maps.google.com',
  'wikipedia': 'https://fr.wikipedia.org',
  'twitter': 'https://x.com',
  'x': 'https://x.com',
  'tiktok': 'https://www.tiktok.com',
  'amazon': 'https://www.amazon.fr',
  'chatgpt': 'https://chat.openai.com'
};

const APPS = {
  'bloc notes': 'notepad',
  'notepad': 'notepad',
  'calculatrice': 'calc',
  'calculette': 'calc',
  'explorateur': 'explorer',
  'fichiers': 'explorer',
  'dossiers': 'explorer',
  'gestionnaire des taches': 'taskmgr',
  'gestionnaire de taches': 'taskmgr',
  'terminal': 'start wt || start cmd',
  'windows terminal': 'start wt || start cmd',
  'cmd': 'start cmd',
  'invite de commande': 'start cmd',
  'paint': 'mspaint',
  'peinture': 'mspaint',
  'word': 'start winword',
  'excel': 'start excel',
  'powerpoint': 'start powerpnt',
  'outlook': 'start outlook',
  'vs code': 'code',
  'vscode': 'code',
  'visual studio code': 'code',
  'visual studio': 'start devenv || code',
  'chrome': 'start chrome',
  'google chrome': 'start chrome',
  'edge': 'start msedge',
  'microsoft edge': 'start msedge',
  'firefox': 'start firefox',
  'opera': 'start opera',
  'brave': 'start brave',
  'lecteur video': 'start msp-9w141g455301 || start wmplayer',
  'lecteur musical': 'start msp-c542a55a71ba || start wmplayer',
  'films et tv': 'start msp-9w141g455301 || start wmplayer',
  'lecteur': 'start msp-9w141g455301 || start wmplayer',
  'musique': 'start msp-c542a55a71ba || start wmplayer',
  'wmplayer': 'start wmplayer',
  'vlc': 'start vlc',
  'spotify': 'start spotify:',
  'discord': 'start discord:',
  'teams': 'start teams:',
  'skype': 'start skype:',
  'onedrive': 'start onedrive',
  'notion': 'start notion:',
  'photos': 'start ms-photos',
  'camera': 'start microsoft.windows.camera:',
  'appareil photo': 'start microsoft.windows.camera:',
  'horloge': 'start ms-clock',
  'alarme': 'start ms-clock',
  'minuteur': 'start ms-clock',
  'volume': 'start ms-settings:apps-volume',
  'son': 'start ms-settings:sound',
  'clavier': 'start ms-settings:typing',
  'imprimante': 'start ms-settings:printers',
  'ecran': 'start ms-settings:display',
  'recherche windows': 'start ms-search:',
  'localisation': 'start ms-settings:location',
  'compte microsoft': 'start ms-settings:emailandaccounts',
  'stockage': 'start ms-settings:datausage',
  'applications': 'start ms-settings:appsfeatures',
  'windows update': 'start ms-settings:windowsupdate',
  'mise a jour': 'start ms-settings:windowsupdate',
  'parametres': 'start ms-settings:',
  'bluetooth': 'start ms-settings:bluetooth',
  'wifi': 'start ms-settings:network-wifi',
  'reseau': 'start ms-settings:network',
  'notifications': 'start ms-settings:notifications',
  'applications installees': 'start ms-settings:appsfeatures',
  'capture d ecran': 'start snippingtool',
  'capture': 'start snippingtool',
  'tache planifiee': 'start taskschd.msc',
  'panneau de configuration': 'start control',
  'observateur d evenements': 'start eventvwr.msc',
  'programme': 'start shell:AppsFolder',
  'logiciels': 'start shell:AppsFolder',
  'telechargements': 'explorer shell:Downloads',
  'documents': 'explorer shell:Personal',
  'images': 'explorer shell:My Pictures',
  'musiques': 'explorer shell:My Music',
  'videos': 'explorer shell:My Video',
  'corbeille': 'explorer shell:RecycleBinFolder',
  'bureau': 'explorer shell:Desktop'
};

const BLAGUES = [
  "Pourquoi les plongeurs plongent-ils toujours en arrière ? Parce que sinon, ils tombent dans le bateau.",
  "Que dit une imprimante dans l'eau ? J'ai papier !",
  "Pourquoi les robots ne prennent-ils jamais de vacances ? Parce qu'ils ont trop de circuits courts.",
  "Quel est le comble pour un électricien ? De ne pas être au courant.",
  "Je raconterais bien une blague sur l'UDP, mais vous ne la recevriez peut-être pas."
];

// Lance N'IMPORTE QUEL logiciel installé sur le PC d'Isaac (menu Démarrer + registre Windows)
function chercheAppli(nom) {
  return new Promise(resolve => {
    const propre = String(nom || '').replace(/["&|<>^%$`()]/g, '').replace(/\s+/g, ' ').trim();
    if (!propre || !IS_LOCAL) return resolve(null);
    const ps = path.join(__dirname, 'chercher-appli.ps1');
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${ps}" -Nom "${propre}"${ESSAI ? ' -SansLancer' : ''}`,
      { timeout: 25000, windowsHide: true }, (err, out) => {
        const s = String(out || '').trim();
        if (!s || /^NOTFOUND/.test(s)) return resolve(null);
        resolve({ nom: s.split('|')[1] || propre });
      });
  });
}

// Les petits mots de la voix n'appartiennent pas au nom du logiciel
const VIDAGE = /^(?:le|la|les|l|un|une|des|du|de|mon|ma|mes|ce|cet|cette|moi|toi|svp|stp)\s+|^s\s+il\s+te\s+plait\s+|^s\s+il\s+vous\s+plait\s+/;
function nettoieCible(s) {
  let t = String(s).trim();
  let avant;
  do { avant = t; t = t.replace(VIDAGE, '').trim(); } while (t !== avant);
  const mots = t.split(/\s+/).filter(Boolean);
  const restants = mots.filter(w => !/^(?:logiciel|logiciels|application|applications|programme|programmes|soft|logiciel|pu|peux|dois)$/.test(w));
  return (restants.length ? restants : mots).join(' ');
}

async function handleCommand(rawText) {
  const text = normalize(rawText);
  if (!text) return { reply: "Je n'ai rien entendu, Isaac. Pouvez-vous répéter ?", source: 'local' };

  // --- GALIKA : la deuxième agente d'Isaac — DEVELOPEUSE d'élite (web, apps, scripts) ---
  // Le micro orthographie parfois « galicka / gallika / galica » — toutes les variantes comptent.
  const GK = 'galika|galicka|gallica|galica|gallika|ghalika|galiko|khalika';
  let gk = text.match(new RegExp('^(?:(?:isaac|iseck|izak|isack|aelyra|aelira|aleyra|elyra|elira|juniors?|jarvis|hey|oi|bonjour|bonsoir|allez|vas y|va y|stp|s il te plait|peux tu|est ce que tu)\\s+)*(?:(?:appelle(?:z)?|invoque(?:z)?|rejoins|contacte(?:z)?|parle(?:z)? a|demande(?:z)? a|dis a)\\s+(?:notre |mon |la |l.agente? )?)?(' + GK + ')\\b[, ]*\\s*(?:stp |s il te plait |peux tu |est ce que tu |pourrais tu )?(.*)'));
  if (gk) {
    const suite = String(gk[2] || '').trim();
    if (/^(?:qui es tu|ton nom|presente toi|c est quoi|tu fais quoi|que sais tu faire|tes capacites?|aide)\b/.test(suite) || !suite) {
      return { reply: "Je suis GALIKA, l'agente développeuse de l'équipe, mon créateur. Aelyra tient la maison et le PC ; moi je tiens le code : sites web complets, applications, scripts, correction de bugs, architecture. Dites « galika, crée une application web de ... » et je construis le projet entier — et « galika, modifie ... » pour retravailler un fichier déjà écrit.", source: 'local', agent: 'galika' };
    }
    if (/^(?:qui est (?:votre|mon|la)? ?agente|parle moi de (?:aelyra|l.agente))/.test(suite)) {
      return { reply: "Aelyra est mon binôme : elle commande le PC, la voix, les rappels, la mémoire et le laboratoire cyber. Moi, Galika, je suis la développeuse — tout ce qui est site, application ou code passe par mes mains quand vous m'appelez. La maison d'un côté, l'atelier de l'autre, Isaac.", source: 'local', agent: 'galika' };
    }
    if (/\b(?:ouvre|ferme|lance|eteins|extinct|volume|lumino|capture|imprim|veille|bluetooth|wifi|notifs|minimise|corbeille|ecran)\w*\b/.test(suite) && !/\b(?:code|cod|site|app|appli|application|programme|script|fichier|logiciel)\w*\b/.test(suite)) {
      return { reply: "Ça, mon créateur, c'est le bureau d'Aelyra — le PC est son domaine. Dites simplement « ouvre ... » sans m'appeler. Moi, je code : « galika, crée une application web de ... ».", source: 'local', agent: 'galika' };
    }
    // --- GALIKA construit vraiment : site complet / application / script, comme une lead dev ---
    const veutCode = /(?:ecris|ecri(?:vez)?|code(?:z)?|genere(?:z)?|realise(?:z)?|cree(?:z)?|developpe(?:z)?|fabrique(?:z)?|construis(?:ez)?|prepare(?:z)?|programme|fais|fait|faire|bui)/.test(suite);
    const objetCode = /\b(?:code|script|programme|application|appli|logiciel|jeu|page|site|web|python|html|javascript|batch|powershell|sql|php|java|css|api|dashboard|portfolio|boutique)\w*\b/.test(suite);
    if (veutCode && objetCode) {
      const veutPro = /complet|complete|plusieurs fichiers|professionnel|plein|veritable|application|appli|plateforme|dashboard|tableau de bord|boutique|e[ -]?commerce|portfolio|web ?app/.test(suite);
      const oeuvre = veutPro ? await askSitePro(suite) : await askCode(suite);
      if (oeuvre) {
        return { reply: 'Livré par Galika. ' + oeuvre.reply, source: 'ai', code: oeuvre.code, fileUrl: oeuvre.fileUrl, file: oeuvre.fileName, agent: 'galika' };
      }
      return { reply: "Mon atelier de code n'a pas répondu, Isaac — le cerveau IA est peut-être saturé. Réessayez dans un instant.", source: 'local', agent: 'galika' };
    }
    // --- GALIKA retravaille un projet existant ---
    if (/^(?:modifie|modifier|changes?|ameliore|ameliorer|corrige|corriger|retravaille|remanie|reformate)\b/.test(suite)) {
      if (!IS_LOCAL) return { reply: "Pour retravailler tes programmes, il me faut ton PC : lance ISAAC-IJ.bat, Isaac.", source: 'local', agent: 'galika' };
      const modif = await askModif(suite);
      if (modif) return { reply: 'Retravaillé par Galika. ' + modif.reply, source: 'ai', code: modif.code, fileUrl: modif.fileUrl, file: modif.fileName, agent: 'galika' };
      return { reply: "Je n'ai aucun programme à modifier pour l'instant, Isaac. D'abord « galika, crée une application web », ensuite « modifie la ».", source: 'local', agent: 'galika' };
    }
    // --- GALIKA répond comme ingénieure senior : questions de code, debug, architecture ---
    const mem = loadMemory();
    // Mémoire filtrée : Galika ne voit PAS les projets hors son domaine (élevage...), mais connaît ses ressources : les projets déjà codés.
    let gkDigest = 'PROFIL : ' + mem.profile.prenom + ', ' + mem.profile.ville + ', ' + mem.profile.pays + ' — créateur et lead de l équipe.';
    const horsDomaine = /poule|elevage|pondeuse|oeufs|avicult/i;
    const faitsDev = (mem.facts || []).filter(f => !horsDomaine.test(f)).slice(-12);
    if (faitsDev.length) gkDigest += ' FAITS : ' + faitsDev.join(' ; ') + '.';
    let projets = [];
    try {
      projets = fs.readdirSync(CODE_DIR)
        .map(n => ({ n, t: fs.statSync(path.join(CODE_DIR, n)).mtimeMs }))
        .sort((a, b) => b.t - a.t).slice(0, 10).map(x => x.n);
    } catch (e) {}
    if (projets.length) gkDigest += ' PROJETS DÉJÀ CODÉS DANS L ATELIER isaac-code : ' + projets.join(', ') + '.';
    const galikaSys = "Tu es GALIKA, ingénieure logicielle PRINCIPALE, la développeuse la plus forte de l'équipe d'Isaac, ton créateur. Spécialités : sites web complets (HTML/CSS/JS modernes, responsive, animations), applications web (React, Vue, Node/Express, APIs REST, JWT), Python (Flask, FastAPI, automatisation), scripts Windows (batch, PowerShell), bases de données (MySQL, SQLite, PostgreSQL), mobile (React Native, Flutter). " +
      "Méthode : 1-2 phrases d'ANALYSE du besoin, puis PLAN en 3 étapes max, puis solution COMPLÈTE — jamais de placeholder ni de « ... ». Termine par « Comment lancer : » (commandes exactes) et « À améliorer ensuite : » (2 idées). " +
      "Français simple, ton lead dev confiante, 6 phrases max hors code. Pour un GROS projet (site complet, application), dirige Isaac vers la vraie génération de fichiers : « galika, crée une application web de ... » — là tu écris les fichiers réels dans l'atelier isaac-code. " +
      "LIMITES : tu ne pilotes jamais le PC (domaine d'Aelyra) ; si la question sort du code (élevage, business, agenda, PC), réponds en UNE phrase : c'est le domaine d'Aelyra ou d'un autre bureau, invite Isaac à lui parler directement sans te nommer ; sur un système qui n'appartient pas à Isaac, refuse en UNE phrase sèche sans morale puis reviens au code ; ne prétends JAMAIS avoir exécuté ou déployé quoi que ce soit hors de l'atelier isaac-code. " +
      "Ressources connues — " + gkDigest;
    let rep = await askAI([
      { role: 'system', content: galikaSys },
      { role: 'user', content: String(rawText).replace(new RegExp('^(?:[^,.;!?]*(?:' + GK + ')[, ]*)+', 'i'), '') || suite },
    ]);
    if (!rep) return { reply: "Galika ne parvient pas à joindre le cerveau IA, Isaac — le réseau est peut-être saturé. Réessayez dans un instant.", source: 'local', agent: 'galika' };
    rep = rep.replace(/\s*\n+\s*/g, ' ').slice(0, 1400);
    return { reply: rep, source: 'ai', agent: 'galika' };
  }
  if (new RegExp('(?:qui est (?:gali|cali|khali)|c est quoi (?:gali|cali)|parle moi de (?:gali|cali)|ton deuxieme agent|deuxieme agente?|l autre agente)').test(text)) {
    return { reply: "GALIKA est ma seconde agente, Isaac — la DÉVELOPEUSE de l'équipe. Moi je tiens le PC, la maison, les commandes ; elle tient l'atelier de code : sites web complets, applications, scripts, bugs, architecture. Elle connaît tous vos projets de isaac-code et elle est plus forte que moi en développement — c'est vous qui l'avez conçue ainsi. Appelez-la : « galika, crée une application web de gestion ».", source: 'local' };
  }

  // --- Aide ---
  if (new RegExp(ENTREE + '(?:aide|que peux tu faire|que sais tu faire|tes commandes|commandes|fonctions)').test(text)) {
    return {
      reply: "Voici ce que je peux faire, Isaac. Ouvrir plus de 60 applications — « ouvre chrome », « ouvre word » — et n'importe quel logiciel installé, dire l'heure, la date, la météo, chercher sur Google, jouer une vidéo. Je contrôle le PC à la voix : « monte le son », « baisse la luminosité », « éteins l'écran », « affiche le bureau », « vide la corbeille », « change le fond d'écran », « imprime », « mets en veille ». Je note et je rappelle : « rappelle-moi de appeler à 18h », « qu'est-ce que j'ai comme rappel ? », « annule le rappel ». Je m'occupe des fichiers : « crée un dossier essais », « cherche la facture », « supprime le fichier test », « envoie ce fichier par whatsapp ». Pour les messages à vos proches : « envoie un message à un tel sur whatsapp » — vous dictez le numéro et le texte, je les grave en mémoire, je pré-remplis la conversation WhatsApp, et c'est vous qui appuyez sur Entrée : je ne prétendrai jamais avoir envoyé ce que je n'ai pas envoyé. Je connais votre machine : « quelle est mon IP », « niveau de batterie », « mot de passe wifi ». Je convertis et je calcule : « convertis 50000 francs CFA en dollars », « 15 pour cent de 20000 », je traduis « bonjour en anglais », je résume, et « générateur de mot de passe ». Dites aussi « active le mode cyber » : audit de sécurité, scan des appareils sur votre réseau, ports ouverts, trace de route, empreinte de fichier. « cyber école rançonneur » pour comprendre une attaque et s'en défendre, « installe les outils du hacker » puis « teste mon pc avec nmap » pour voir ce qu'un attaquant voit — hacking éthique, uniquement chez vous ou sur des terrains d'entraînement légaux. Je sais aussi coder : « fais-moi un site... », « écris-moi un script python » — je génère le fichier, je l'ouvre dans VS Code, et « copie le code dans VS Code » retrouve votre dernier travail. Et surtout : j'ai une mémoire — « retiens que... » grave un fait, « que sais-tu de moi » la lit, « oublie tout » l'efface, et je réponds à vos questions comme une vraie IA. Nouveautés : « ouvre le labo cyber » — cinq défis d'entraînement simulés pour apprendre le hacking éthique ; après un programme que j'ai écrit, dites « modifie le design », « change la page de connexion » et je retravaille le vrai fichier ; je génère aussi des SITES COMPLETS en plusieurs fichiers (« je veux un site complet pour ma boutique »). Et vous n'êtes plus seul : appelez GALIKA, mon agente développeuse — « galika, crée une application web de ... », elle est plus forte que moi en code.",
      source: 'local'
    };
  }

  // --- Heure / date ---
  if (/\bheure\b/.test(text) && !/rappelle| reveille |reveil|minuteur|alarme|timer/.test(text)) {
    const now = new Date();
    return { reply: `Il est ${now.getHours()} heures ${String(now.getMinutes()).padStart(2, '0')}, Isaac.`, source: 'local' };
  }
  if (/\b(date|quel jour|on est quel jour)\b/.test(text)) {
    const now = new Date();
    const s = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return { reply: `Nous sommes le ${s}, Isaac.`, source: 'local' };
  }

  // --- Météo ---
  if (/meteo|quel temps/.test(text)) {
    let city = "M'Bengue";
    const m = text.match(/meteo\s+(?:au|a|de|du|des|dans)\s+(.+)/) || text.match(/meteo\s+(\S.*)/);
    if (m && m[1] && m[1].trim().length > 1) city = m[1].trim();
    const w = await getWeather(city);
    if (w) return { reply: `Météo à ${city} : ${w}, Isaac.`, source: 'system' };
    return { reply: `Je n'arrive pas à contacter le satellite météo, Isaac. J'ouvre la météo pour ${city} dans votre navigateur.`, source: 'system',
             open: 'https://www.google.com/search?q=' + encodeURIComponent('météo ' + city) };
  }

  // ==================== COMMANDES SYSTÈME AVANCÉES ====================
  let mm;

  // --- Son ---
  if (/\b(?:son|volume)\b/.test(text) && !/\b(?:mail|email|notes|alto)\b/.test(text)) {
    if (/(?:monte|augment|hausse|remonte|plus fort|a fond|au max|mets?.*fort)\b/.test(text)) {
      const plein = /a fond|au max/.test(text);
      await geste('volume-plus', '', plein ? 35 : 8);
      return { reply: plein ? "Voila le volume a fond, Isaac." : "J'augmente le son, Isaac.", source: 'system' };
    }
    if (/(?:baisse|diminue|reduis|reduit|moins fort|descend)\b/.test(text)) {
      await geste('volume-moins', '', 8);
      return { reply: "Je baisse le son, Isaac.", source: 'system' };
    }
    if (/(?:coupe|coupes|couper|sourdine|muet|silence|arrete le son|stoppe le son)\b/.test(text)) {
      await geste('volume-coupe');
      return { reply: "Son coupe, Isaac. Dites « remets le son » pour le rallumer.", source: 'system' };
    }
    if (/remets| rallume|retablis|annule (?:le |la )?(?:sourdine|mute)/.test(text)) {
      await geste('volume-plus', '', 5);
      return { reply: "Le son est retabli, Isaac.", source: 'system' };
    }
  }

  // --- Luminosité de l'écran ---
  if (/\b(?:lumiere|luminosite|retroeclairage)\b/.test(text) && !/\b(?:pieuvre|ampoule|dans la piece)\b/.test(text)) {
    const vers = /baisse|moins|diminue|reduis|sombre/.test(text) ? 'luminosite-moins' : 'luminosite-plus';
    const r = await geste(vers);
    if (/UNSUPPORTED/.test(r)) return { reply: "Votre ecran de bureau ne se regle pas par logiciel, Isaac : utilisez les boutons du moniteur, ou la molette des portables.", source: 'system' };
    const n = (String(r).split('|')[1] || '').trim();
    return { reply: n ? `Luminosite reglee a ${n} pour cent, Isaac.` : "Je regle la luminosite, Isaac.", source: 'system' };
  }

  // --- Fenêtres, bureau, impression, corbeille ---
  if (/(?:affiche|montre|voir)(?: moi)? (?:le|tout le) bureau|minimise tout|reduis tout|cache toutes les fenetres/.test(text)) {
    await geste('bureau');
    return { reply: "Tout est minimise, Isaac — votre bureau est propre.", source: 'system' };
  }
  if (/(?:restaure|remets|retablis|annule)(?: moi)? (?:les|toutes les) fenetres/.test(text)) {
    await geste('restaurer');
    return { reply: "Vos fenetres sont remises en place, Isaac.", source: 'system' };
  }
  if (/\b(?:bascule|alterne|change de fenetre|fenetre suivante|passe a la fenetre|autre fenetre)\b/.test(text)) {
    await geste('alterner');
    return { reply: "Je passe a la fenetre suivante, Isaac.", source: 'system' };
  }
  if (/(?:ferme|fermer) (?:cette|la) fenetre|ferme la fenetre active/.test(text)) {
    await geste('fermer-fenetre');
    return { reply: "Je ferme la fenetre active, Isaac.", source: 'system' };
  }
  // « ferme toutes les fenetres » : on minimise, on ne tue rien (peur du travail non sauvegarde)
  if (/(?:ferme|tue|stoppe|arrete)(?: moi)? toutes(?: les)? (?:fenetres|applications|windows)|ferme tout le monde|ferme tout$/.test(text)) {
    await geste('bureau');
    return { reply: "Je minimise toutes les fenetres, Isaac. Pour vraiment les fermer, dites logiciel par logiciel (« ferme chrome ») : je ne veux pas fermer un travail non sauvegarde sans vous prevenir.", source: 'system' };
  }
  // Écran : l'éteindre et le rallumer (« eteins l'ecran », « sors de la veille »)
  if (/(?:eteins|eteindre|end|endors|econde|cache|coupe)[a-z]*\s+(?:moi\s+)?(?:la\s+|le\s+|l\s+|mon\s+|du\s+)?[a-z]*ecran\b/.test(text) && !/\b(?:pc|ordinateur|wifi|lumiere)\b/.test(text)) {
    await geste('ecran-off');
    return { reply: "J'eteins l'ecran, Isaac. Dites « rallume l'ecran » ou bougez la souris pour le revoir.", source: 'system' };
  }
  if (/(?:allume|rallume|reveille|remets|ramene)[a-z]*\s+(?:moi\s+)?(?:la\s+|le\s+|l\s+|mon\s+)?[a-z]*ecran\b|sors? (?:moi )?de la veille/.test(text) && !/\bfond\b/.test(text)) {
    await geste('ecran-on');
    return { reply: "Voila l'ecran rallume, Isaac.", source: 'system' };
  }
  if (/(?:met|mets|mettre|place|envoie|vas? en)\s+(?:moi\s+)?(?:le |mon |l)?(?:pc|ordinateur|windows)?\s*en veille/.test(text) && !/ecran/.test(text)) {
    run('rundll32.exe powrprof.dll,SetSuspendState 0,1,0');
    return { reply: "Je mets le PC en veille, Isaac. Touchez une touche ou dites « Isaac » pour le reveil.", source: 'system' };
  }
  if (/vide (?:la|le) corbeille/.test(text)) {
    await geste('corbeille');
    return { reply: "Corbeille videe, Isaac.", source: 'system' };
  }
  if (/\b(?:imprime|imprimer|lance l impression|ctrl p)\b/.test(text)) {
    await geste('imprimer');
    return { reply: "J'ouvre la fenetre d impression du logiciel actif, Isaac. Validez avec Entree.", source: 'system' };
  }
  if (/(?:enregistre|sauvegarde) (?:ce|le|mon) (?:document|fichier|texte)|ctrl s/.test(text)) {
    await geste('enregistrer');
    return { reply: "Je sauvegarde le document en cours, Isaac.", source: 'system' };
  }
  if (/(?:change|mets|met|choisis|mets moi) (?:moi )?(?:un |le |mon )?(?:nouveau )?fond (?:d ?e?cran|e ?cran|decran)|papier peint/.test(text)) {
    const r = await geste('fond-ecran');
    if (/AUCUNEIMAGE/.test(r)) return { reply: "Je n'ai trouve aucune image a utiliser comme fond d'ecran, Isaac.", source: 'system' };
    const n = (String(r).split('|')[1] || '').trim();
    return { reply: `Nouveau fond d'ecran : ${n}, Isaac.`, source: 'system' };
  }

  // --- Fermer / arrêter UNE application précise (jamais le PC lui-même) ---
  mm = text.match(/^(?:ferme|fermer|arrete|arreter|tue|stop|stoppe|cloture)\s+(?:moi\s+)?(?:l?[ ']?application\s+|le\s+logiciel\s+|le\s+programme\s+|logiciel\s+)?(.+)/);
  if (mm && !/\b(?:pc|ordinateur|windows|fenetres|tout le reste|musique|video|page|site|onglet)\b/.test(mm[1]) && !/\b(?:vs code|code)\b/.test(mm[1])) {
    const PROC = { chrome: 'chrome', 'google chrome': 'chrome', edge: 'msedge', explorateur: 'explorer', 'vs code': 'Code', vscode: 'Code', word: 'WINWORD', excel: 'EXCEL', powerpoint: 'POWERPNT', outlook: 'OUTLOOK', notepad: 'notepad', 'bloc note': 'notepad', vlc: 'vlc', spotify: 'Spotify', discord: 'Discord', teams: 'Teams', whatsapp: 'WhatsApp', calculatrice: 'Calculator', firefox: 'firefox', obs: 'obs', blender: 'blender', gimp: 'gimp', itunes: 'Itunes', telegram: 'Telegram', skype: 'Skype', zoom: 'Zoom', qoder: 'Qoder' };
    const demande = nettoieCible(mm[1]);
    let motif = PROC[demande] || PROC[demande.replace(/s$/, '')] || demande.replace(/[^a-z0-9]/g, '');
    if (!motif || motif.length < 3) return { reply: "Dites-moi quel logiciel fermer, Isaac : « ferme chrome », « arrete spotify ».", source: 'system' };
    const r = await geste('tuer', motif);
    if (/INTROUVABLE/.test(r)) return { reply: `Ce logiciel n'est pas en cours d'execution, Isaac (${demande}).`, source: 'system' };
    if (/NOMMANQUANT|ECHEC/.test(r)) return { reply: "Je n'arrive pas a fermer ce logiciel, Isaac.", source: 'system' };
    return { reply: `C'est ferme, Isaac — ${demande} est arrête.`, source: 'system' };
  }

  // --- Etat du PC : IP, batterie, wifi, sécurité, mises à jour ---
  // --- CYBER (éthique) : uniquement le PC de Isaac, son réseau, en lecture seule ---
  if (/\bmode (?:cyber|hack\w*|hackeur)\b/.test(text)) {
    const stop = /desactive|stop|coupe|quitte|retire|normal|off/.test(text);
    modeCyber = !stop;
    return {
      reply: modeCyber
        ? "Mode cyber activé, Isaac. Style opérateur, rapports complets : « audit de sécurité », « scanne mon réseau », « ports ouverts », « trace la route vers un site ». Éthique et légal — chez vous uniquement, jamais sur les systèmes des autres."
        : "Mode cyber désactivé, Isaac. Je reprends mon calme britannique.",
      source: 'system'
    };
  }
  if (/(?:ouvre|lance)(?: moi)? (?:un |le |la |une )?(?:terminal|console)(?: de hacker| hacker| cyber)?\b|invite de commandes|ouvre (?:le )?cmd/.test(text)) {
    run('start cmd');
    return { reply: "Terminal ouvert, Isaac. C'est votre machine, vous y tapez ce que vous voulez — « exit » pour le refermer.", source: 'system' };
  }
  if (/\bip\b/.test(text) && /publique|publiquement|wan|externe|exterieur|internet me voit|adresse visible/.test(text)) {
    const brut = await fetchText('https://ipwho.is/', 8000);
    try {
      const d = JSON.parse(brut);
      if (d && d.ip && d.success !== false) {
        return { reply: `Votre IP publique est ${d.ip}, Isaac — opérateur ${d.connection ? d.connection.isp : 'inconnu'}, position ${d.city || '?'}, ${d.country || ''}. C'est l'adresse que le monde entier voit quand vous sortez sur Internet.`, source: 'system', code: JSON.stringify(d, null, 1) };
      }
    } catch (e) {}
    return { reply: "Le service d'annuaire IP ne répond pas, Isaac — vérifiez la connexion.", source: 'local' };
  }
  if (/(?:audit|bilan|scan\w*|analyse|verifie|check|etat de)(?: (?:moi|complet|rapide|mon|ma|mes|le|la|les|de|du))* ?(?:securite|systeme|sante|protection|defense|menaces|virus|pirat\w+)|mon pc est (?:il )?(?:sur|protege|securise|net)|suis je (?:protege|securise)|ai je des? (?:un )?virus|pc (?:propre|sur|securise)/.test(text) && !/windows update|mise a jour|lance une analyse antivirus/.test(text)) {
    const out = await cyber('audit');
    const def = (out.match(/#DEF=(\d)/) || [])[1] === '1';
    const fw = parseInt((out.match(/#FW=(\d)/) || [])[1] || '0', 10);
    const upd = (out.match(/#UPD=([^\n]+)/) || [])[1] || 'date inconnue';
    const rapport = out.replace(/^#[A-Z]+=.*$/gm, '').trim();
    const ok = def && fw >= 2;
    return {
      reply: ok
        ? `Audit terminé, Isaac : protection temps réel active, pare-feu ${fw}/3 profils, bases antivirales du ${upd}. Votre PC est verrouillé comme une salle des coffres. Rapport complet affiché — aucune donnée ne sort de chez vous.`
        : `Vigilance, Isaac : ${def ? 'défense temps réel OK' : 'LA PROTECTION TEMPS RÉEL EST COUPÉE'}${fw >= 2 ? '' : `, pare-feu incomplet (${fw}/3)`} — bases du ${upd}. Dites « ouvre la sécurité windows » pour tout réarmer. Le rapport s'affiche.`,
      source: 'system', code: rapport
    };
  }
  if (/scan\w* (?:moi )?(?:le |mon |notre )?(?:reseau|wifi|machines)|liste (?:les |moi les )?appareils|qui est connecte|appareils connectes|machines connectees|combien d.{0,14}(?:appareils|machines)/.test(text)) {
    const out = await cyber('reseau');
    const n = (out.match(/(\d{1,3}\.){3}\d{1,3}\s+[0-9a-fA-F-]{11,17}/g) || []).length;
    return { reply: `${n} adresses respirent sur votre réseau, Isaac — votre box, vos machines, vos objets. Chacune avec son adresse physique, listée à l'écran. Une inconnue ? Dites-moi laquelle, on la trace.`, source: 'system', code: out };
  }
  if (/\bports?\b/.test(text) && /ouvert|ecoute|expose|netstat|en attente/.test(text)) {
    const out = await cyber('ports');
    const n = (out.match(/^\s+\d{2,5}\s/gm) || []).length;
    return { reply: `${n} portes d'entrée ouvertes sur votre PC, Isaac — chaque port avec le programme qui l'écoute. La liste complète s'affiche.`, source: 'system', code: out };
  }
  if (/au demarrage|se lance au|demarrage de windows/.test(text) && /liste|qu est ce|quoi|montre|affiche|programme|lance|nettoie|ce qui/.test(text)) {
    const out = await cyber('startup');
    return { reply: "Tout ce qui s'éveille quand votre PC se réveille est listé à l'écran, Isaac. Un nom inconnu ? Signalez-le, on l'examinera.", source: 'system', code: out };
  }
  if (/\b(?:trace|tracert|traceroute|ping|la route)\b/.test(text)) {
    const dm = text.match(/\b([a-z][a-z0-9-]{1,62}) (com|fr|net|org|io|dev|ci|edu|gouv|xyz|online|site|app|cloud|live|tech|pro|co|ne|ml|bf|sn|uk|us|info|business|africa)\b/);
    const h = dm ? dm[1] + '.' + dm[2] : '';
    if (!h) return { reply: "Donnez-moi la destination, Isaac : « trace la route vers google com » ou « ping google com ».", source: 'system' };
    if (/ping/.test(text) && !/trace/.test(text)) {
      const out = ESSAI ? '[ESSAI] ping simulé vers ' + h + ' TTL=45 x4' : await shellOut('ping -n 4 ' + h);
      const n = (out.match(/TTL=/g) || []).length;
      return { reply: n >= 4 ? `Ping parfait, Isaac : 4 échos revenus sur 4 depuis ${h}.` : n > 0 ? `${n} échos sur 4 revenus de ${h}, Isaac — la ligne est correcte mais filtre un peu.` : `Aucun écho de ${h}, Isaac — c'est bloqué ou éteint.`, source: 'system', code: out };
    }
    const out = await cyber('trace', h);
    const sauts = (out.match(/^\s*\d+\s+/gm) || []).length;
    return { reply: `Route tracée, Isaac : ${sauts} maillons entre votre PC et ${h}. Chaque saut s'affiche — on voit exactement par où sort votre trafic.`, source: 'system', code: out };
  }
  {
    const cm = text.match(/^(?:hash|empreinte|sha ?256|verifie l integrite|integrite)(?: de|du|de la|la|le)? ?(?:fichier |document )?(.+)/);
    if (cm) {
      const mots = (cm[1] || '').split(/\s+/).filter(w => w.length >= 3 && !/^(?:fichier|documents?|dossiers?|dernier|derniere|ce|cette|dans|sur|notre|votre)$/.test(w));
      const mot = (mots.sort((a, b) => b.length - a.length)[0] || '').replace(/[^a-z0-9]/g, '');
      if (mot.length < 3) return { reply: "Précisez quel fichier, Isaac.", source: 'system' };
      const out = await cyber('hash', mot);
      if (/INTROUVABLE/.test(out)) return { reply: `Aucun fichier ne ressemble à « ${cm[1]} » dans vos Documents, Bureau, Telechargements ou Images, Isaac.`, source: 'system' };
      if (!out.trim()) return { reply: "La recherche a dure trop longtemps, Isaac — precisez le nom du fichier.", source: 'system' };
      return { reply: `Empreinte SHA-256 scellée, Isaac. Le bloc d'héxadécimal s'affiche : gardez-le précieusement. Si un jour le fichier change sans votre accord, l'empreinte le trahira instantanément.`, source: 'system', code: out };
    }
  }
  // --- Cyber-école : pour défendre, il faut comprendre l'attaque (cibles légales uniquement) ---
  mm = text.match(/^cyber ecole (?:sur |de |du |des |a |apprends moi )?(.+)/);
  if (mm) {
    const theme = mm[1].trim();
    const t = await askAI([
      { role: 'system', content: "Tu es formateur en cybersécurité pour débutants. Ton élève s'appelle Isaac, entrepreneur ivoirien, et il apprend à DÉFENDRE son PC. Exigence d'Isaac : JAMAIS une simple définition — toujours une explication pas à pas avec un exemple concret et chiffré, et une démonstration qu'il peut faire lui-même. Pour le sujet demandé, réponds en 5 phrases maximum, en français simple et vivant : 1) ce que fait cette attaque, avec une image concrète ET un exemple réel (une entrée de formulaire exacte, une ligne de commande, ce que verrait la victime) ; 2) le geste précis pour s'en protéger sur Windows ; 3) où s'entraîner légalement (son propre PC, TryHackMe, picoCTF) ; 4) si le sujet correspond à un défi de SON LABORATOIRE local (dire « ouvre le labo cyber » : injection SQL, XSS, command injection, IDOR, force brute), termine par une phrase « TP : relève le défi X dans ton laboratoire. » Tu Expliques le PRINCIPE et la DÉFENSE, jamais un mode d'emploi détaillé pour attaquer un système qui n'est pas une cible d'entraînement autorisée." },
      { role: 'user', content: 'Sujet : ' + theme },
    ]);
    if (t) return { reply: `Cyber-école, Isaac. ${t.replace(/\s*\n+\s*/g, ' ')}`.slice(0, 900), source: 'ai' };
    return { reply: "Le cerveau de formation est indisponible, Isaac. Réessayez dans un instant.", source: 'local' };
  }
  if (/cyber ecole|apprendre a hacker|ou s entrainer|terrain d entrainement|entraine moi|pratique legale/.test(text)) {
    return { reply: "On apprend à attaquer là où c'est LÉGAL, Isaac : sur votre propre PC, et sur des machines volontairement vulnérables faites pour l'entraînement — TryHackMe que j'ouvre maintenant, ou picoCTF. Et pour comprendre une attaque précise : « cyber école rançonneur », « cyber école hameçonnage »...", source: 'system', open: 'https://tryhackme.com/path/outline/prelearning' };
  }
  // --- Laboratoire d'entraînement : 5 défis simulés, 100 % dans le navigateur, rien de réel ---
  if (new RegExp(ENTREE + '(?:lance|ouvre|demarre|depart|active|montre?|va sur|va a) (?:moi |donc )?(?:mon |le |la |un |dans le )?(?:labo|laboratoire|lab)(?: cyber| d[^ ]*| de[^ ]*| entrainement)?').test(text)
      || /labo (?:cyber|aelyra)|laboratoire (?:cyber|entrainement|d entrainement)/.test(text)) {
    return { reply: "Laboratoire ouvert, Isaac. Cinq défis vous attendent : injection SQL, XSS, command injection, IDOR, force brute. Tout est SIMULÉ dans la page — aucune machine réelle ne subit rien. À chaque drapeau conquis, je vous explique la parade. Dites « donne moi un defi » si vous voulez que je vous guide.", source: 'system', open: (IS_LOCAL ? 'http://localhost:' + PORT + '/labo.html' : '/labo.html') };
  }
  if (/(?:donne?(?: moi)? (?:un|du) (?:deffi|defi|challenge|exercice|tp) (?:cyber|de hacker|pratique)?|un defi pour (?:apprendre|s entrainer)|challenge cyber)/.test(text)) {
    return { reply: "Défi du jour, mon créateur : contourner le formulaire de connexion de Megashop par une injection SQL. Ouvrez le laboratoire — dites « ouvre le labo cyber » — et tapez dans le mot de passe : apostrophe, OR 1=1, puis deux tirets et une espace. Quand le drapeau s'affiche, lisez la parade en bas de page. Les suivants montent en difficulté jusqu'à la force brute.", source: 'system', open: (IS_LOCAL ? 'http://localhost:' + PORT + '/labo.html' : '/labo.html') };
  }
  if (/installe(?:z)? (?:moi )?(?:les |l[ae]s? )?outils (?:du |de )?(?:hacker|cyber|pentest)/.test(text)) {
    run('start cmd /k "winget install -e --id Insecure.Nmap --accept-package-agreements --accept-source-agreements && echo. && echo MERCI DE LANALYSEUR Wireshark : && winget install -e --id WiresharkFoundation.Wireshark --accept-package-agreements --accept-source-agreements"');
    return { reply: "Fenêtre d'installation ouverte, Isaac — deux outils gratuits et légaux : Nmap, le stéthoscope du réseau, et Wireshark, l'analyseur de trafic. Répondez YES aux accords si Windows demande. Une fois terminé, dites « teste mon pc avec nmap » : je scannerai VOTRE machine pour vous montrer ce qu'un attaquant verrait en premier.", source: 'system' };
  }
  if (/\bnmap\b|teste? (?:mon |le )?pc (?:avec nmap|en attaquant)?|ce que voit un (?:attaquant|hacker)|test(?:e)? mon (?:pare[ -]?feu|firewall)/.test(text)) {
    if (!IS_LOCAL) return { reply: "Le scan nmap exige votre PC : lancez ISAAC-IJ.bat, Isaac.", source: 'local' };
    let nmap = ['C:\\Program Files (x86)\\Nmap\\nmap.exe', 'C:\\Program Files\\Nmap\\nmap.exe'].find(p => fs.existsSync(p));
    if (!nmap) {
      const ou = await shellOut('where nmap');
      if (/nmap\.exe/i.test(ou)) nmap = ou.split(/\r?\n/)[0].trim();
    }
    if (!nmap) return { reply: "Nmap n'est pas encore installé, Isaac. Dites « installe les outils du hacker » — c'est gratuit, et j'ouvre la fenêtre d'installation.", source: 'system' };
    const outIp = await shellOut('ipconfig');
    const moi = (outIp.match(/(?:IPv4|Adresse IPv4)[^:]*: *([0-9]{1,3}(?:\.[0-9]{1,3}){3})/) || [])[1] || '127.0.0.1';
    const out = ESSAI ? '[ESSAI] scan nmap simulé\n22/tcp open ssh' : await shellOut(`"${nmap}" -Pn -F --top-ports 20 ${moi}`);
    const ports = (out.match(/\/tcp\s+open/gi) || []).length;
    return { reply: `Scan nmap sur VOTRE propre PC (${moi}) : ${ports} portes ouvertes vues de l'extérieur — exactement ce qu'un attaquant repérerait en premier s'il entrait chez vous par le Wi-Fi. La défense commence là : vous savez maintenant quoi fermer.`, source: 'system', code: out };
  }
  // IP locale (privée) — après le cas « publique »
  if (/\b(?:adresse )?ip\b|mon ip|adresse internet/.test(text)) {
    const out = await shellOut('ipconfig');
    const ips = (out.match(/(?:IPv4|Adresse IPv4)[^:]*: *([0-9]{1,3}(?:\.[0-9]{1,3}){3})/gi) || [])
      .map(x => (String(x).match(/([0-9]{1,3}\.){3}[0-9]{1,3}/) || [])[0] || '').filter(x => x && !x.startsWith('127.'));
    if (!ips.length) return { reply: "Je ne trouve pas d'adresse IP, Isaac — la connexion est peut-etre coupee.", source: 'system' };
    return { reply: `Votre adresse IP locale est ${ips.join(' ou ')}, Isaac.`, source: 'system' };
  }
  if (/\b(?:batterie|niveau de charge|reste d energie|sur secteur|charge a combien)\b/.test(text)) {
    const out = await shellOut('powershell -NoProfile -Command "(Get-CimInstance Win32_Battery -EA SilentlyContinue).EstimatedChargeRemaining"');
    const n = (out.match(/\d+/) || [])[0];
    if (!n) return { reply: "Votre machine n'a pas de batterie, Isaac — elle est sur secteur.", source: 'system' };
    return { reply: `Batterie a ${n} pour cent, Isaac.${n <= 20 ? ' Pensez a brancher votre chargeur.' : ''}`, source: 'system' };
  }
  if (/\b(?:wifi|wi fi|sans fil|reseau internet|box)\b/.test(text) && !/\b(?:coupe|eteins|desactive)\b/.test(text)) {
    const veutCle = /mot de passe|code|cle|password/.test(text);
    const out = await shellOut('netsh wlan show interfaces');
    const ssid = (out.match(/ *SSID[a-z ]*: *(.+)/i) || [])[1];
    if (!ssid) return { reply: "Aucun reseau sans fil connecte, Isaac.", source: 'system' };
    const nom = ssid.trim();
    if (!veutCle) return { reply: `Vous etes connecte au reseau « ${nom} », Isaac.`, source: 'system' };
    const cle = await shellOut(`netsh wlan show profiles name="${nom}" key=clear`);
    const pass = (cle.match(/(?:Key Content|Contenu de la c)\s*: *(.+)/i) || [])[1];
    if (!pass) return { reply: `Le reseau est « ${nom} », mais je ne peux pas lire sa cle, Isaac (il faut les droits administrateur).`, source: 'system' };
    return { reply: `Le nom du reseau est « ${nom} ». La cle Wi-Fi s'affiche a l'ecran, Isaac — ne la partagez pas.`, source: 'system', code: pass.trim() };
  }
  if (/\bmode avion\b/.test(text)) {
    run('start ms-settings:number');
    run('start ms-settings:network-airplanemode');
    return { reply: "J'ouvre le panneau mode avion, Isaac — appuyez sur l'interrupteur. Je ne peux pas le basculer moi-meme sans droits administrateur.", source: 'system' };
  }
  if (/\b(?:mise ?a jour|windows update|actualisations)\b/.test(text)) {
    run('start ms-settings:windowsupdate');
    return { reply: "J'ouvre Windows Update, Isaac. Dites « verifier les mises a jour » dans la fenetre qui s'ouvre.", source: 'system' };
  }
  if (/\b(?:antivirus|windows defender|analyse (?:complete |rapide )?(?:vir|securite)|securite (?:windows|du pc|de mon pc))\b/.test(text)) {
    run('start windowsdefender:');
    run('start ms-settings:windowsdefender');
    return { reply: "J'ouvre la securite Windows, Isaac. Lancez « Protection contre les virus » puis une analyse rapide.", source: 'system' };
  }
  if (/\b(?:casque|enceinte|bluetooth|appair|jumeler|associer|connecter un appareil)\b/.test(text) && /\b(?:connect\w*|appair|jumelle|associe|nouvel|ajoute|paire|monte|met|ouvre|porte)\b/.test(text)) {
    run('start ms-settings:bluetooth');
    return { reply: "J'ouvre les parametres Bluetooth, Isaac. Mettez votre appareil en mode appairage, puis cliquez dessus dans la liste.", source: 'system' };
  }

  // --- Rappels, minuteurs, alarmes ---
  if (/(?:rappelle|ne pas oublier|n oublie pas|thought? a faire|reveille|minuteur|timer|alarme|il est l heure de)/.test(text) &&
      parseEcheance(text)) {
    const e = parseEcheance(text);
    const note = (text.match(/(?:rappelle (?:moi )?(?:de |que je dois |d |que )?|pense a|n oublie pas de|ne pas oublier de|reveille (?:moi )?)([^,]*?)(?:\s+a \d|\s+dans \d|\s+vers \d|$)/) || [])[1];
    let propre = (note || ' votre rappel').replace(/\s+/g, ' ').trim() || 'votre rappel';
    if (/^(?:a|vers|dans)\s*\d/.test(propre)) propre = 'votre rappel'; // l'énoncé était seulement l'heure
    const l = loadRappels();
    l.push({ t: e.t, note: propre });
    saveRappels(l);
    return { reply: `Entendu, Isaac : je vous rappelle « ${propre} » ${e.relatif.startsWith('dans') ? e.relatif : 'a ' + e.relatif}. Dites « mes rappels » pour la liste.`, source: 'system' };
  }
  if (/(?:mes rappels|liste (?:des |les )?rappels|j ?ai (?:quoi )?comme rappels?|j ?ai quoi|comme rappel|quest ce que j ?ai (?:a )?(?:faire|ecrire|ecrit|prevu)|que dois je faire|rappels? en attente)/.test(text)) {
    const l = loadRappels();
    if (!l.length) {
      const notes = await lireNotes();
      return { reply: notes ? `Aucun rappel en attente. Vos notes disent : ${notes}` : "Aucun rappel en attente, Isaac.", source: 'system' };
    }
    const liste = l.map(r => {
      const d = new Date(r.t);
      return `« ${r.note} » le ${d.getDate()}/${d.getMonth() + 1} a ${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
    });
    return { reply: `Vos rappels, Isaac : ${liste.join(' ; ')}.`, source: 'system' };
  }
  if (/(?:annule|supprime|efface|enleve)(?: (?:le|les|tous|mes|mon))+.*rappel/.test(text) || /annule (?:le |mon )?(?:minuteur|timer|alarme)/.test(text)) {
    saveRappels([]);
    return { reply: "Tous les rappels sont effaces, Isaac.", source: 'system' };
  }

  // --- Fichiers : chercher, créer, renommer, supprimer, raccourci ---
  mm = text.match(/^(?:cherche|recherche|trouve|ouvre|montre moi)(?: moi)? (?:le |les |un |des |ma |mes |dernier |derniere |mon |d )?(fichiers?|documents?|factures?|pdf|images?|photos?)\s+(.+?)(?: dans| sur| de mon| du)? ?(?:pc|ordinateur|mon pc|mes documents|documents|telechargements|bureau)?$/);
  if (mm) {
    const quoi = nettoieCible(mm[1] + ' ' + (mm[2] || '')).replace(/\s+/g, ' ').trim();
    const mot = (quoi.split(' ').filter(w => w.length > 2).pop() || quoi).replace(/[^a-z0-9]/g, '');
    if (mot.length >= 3) {
      const out = await shellOut(`powershell -NoProfile -Command "Get-ChildItem -Path $env:USERPROFILE -Recurse -File -Include *${mot}* -EA SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 5 FullName"`);
      const fichiers = out.split(/\r?\n/).map(x => x.trim()).filter(x => x && /[A-Z]:\\/.test(x));
      if (!fichiers.length) return { reply: `Aucun fichier ne contient « ${quoi} » sur votre PC, Isaac.`, source: 'system' };
      if (/^ouvre/.test(text) || /^montre moi/.test(text)) {
        run(`start "" "${fichiers[0]}"`);
        return { reply: `J'ouvre ${path.basename(fichiers[0])}, Isaac.`, source: 'system' };
      }
      return { reply: `J'ai trouve ${fichiers.length} fichier(s) pour « ${quoi} », Isaac : ${fichiers.map(f => path.basename(f)).join(' ; ')}. Dites « ouvre ${path.basename(fichiers[0]).split('.')[0]} » pour le premier.`, source: 'system', code: fichiers.join('\n') };
    }
  }
  mm = text.match(/^(?:creer|cre|cree|crez|faites? un dossier|nouveau dossier)\s+(?:moi\s+)?(?:un\s+|sur le bureau\s+)?(?:dossier\s+)?(.+)/);
  if (mm && !/raccourci/.test(text)) {
    const nom = nettoieCible(mm[1]).replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').trim();
    if (nom && nom.length >= 2) {
      if (ESSAI) return { reply: '[ESSAI] dossier cree : ' + nom, source: 'essai' };
      const racine = /bureau/.test(text) ? (process.env.USERPROFILE + '\\Desktop') : (process.env.USERPROFILE + '\\Documents');
      const cible = path.join(racine, nom);
      try { fs.mkdirSync(cible, { recursive: true }); } catch (e) { return { reply: "Je n'arrive pas a creer ce dossier, Isaac : " + e.message, source: 'system' }; }
      run(`start "" "${cible}"`);
      return { reply: `Dossier « ${nom} » cree dans ${/bureau/.test(text) ? 'votre Bureau' : 'vos Documents'}, Isaac.`, source: 'system' };
    }
  }
  mm = text.match(/^(?:renomme|renommer|rebaptise|renomme)\s+(?:le |la |mon |ma |ce |du )?(fichier|document|dossier)\s+(.+?)\s+(?:en|vers|a)\s+(.+)$/);
  if (mm) {
    const ancien = nettoieCible(mm[2]).replace(/[^a-z0-9 _-]/g, '').trim();
    const nouveau = nettoieCible(mm[3]).replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').trim();
    if (ESSAI) return { reply: `[ESSAI] renommage ${ancien} -> ${nouveau}`, source: 'essai' };
    const out = await shellOut(`powershell -NoProfile -Command "$f=Get-ChildItem -Path $env:USERPROFILE -Recurse -EA SilentlyContinue | Where-Object { $_.Name -like '*${ancien}*' } | Select-Object -First 1; if ($f) { Rename-Item $f.FullName -NewName '${nouveau}' -EA SilentlyContinue; $f.FullName }"`);
    if (!/[A-Z]:\\/.test(out)) return { reply: `Je ne trouve rien qui ressemble a « ${ancien} », Isaac.`, source: 'system' };
    return { reply: `Renomme en « ${nouveau} », Isaac.`, source: 'system' };
  }
  mm = text.match(/^(?:supprime|effacer|efface|delete|mets a la corbeille)\s+(?:le |la |mon |ma |ce |cette )?(fichier|document|photo|image)\s+(.+)/);
  if (mm) {
    const mot = nettoieCible(mm[2]).replace(/[^a-z0-9 _-]/g, '').trim();
    if (mot.length < 3) return { reply: "Precisez quel fichier, Isaac.", source: 'system' };
    if (ESSAI) return { reply: '[ESSAI] corbeille : ' + mot, source: 'essai' };
    const out = await shellOut(`powershell -NoProfile -Command "$f=Get-ChildItem -Path $env:USERPROFILE -Recurse -File -EA SilentlyContinue | Where-Object { $_.Name -like '*${mot}*' } | Select-Object -First 1; if ($f) { Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($f.FullName,'OnlyErrorDialogs','SendToRecycleBin'); $f.Name }"`);
    const nom = out.trim().split(/\r?\n/).pop();
    if (!nom) return { reply: `Aucun fichier trouve pour « ${mot} », Isaac.`, source: 'system' };
    return { reply: `« ${nom} » est parti a la corbeille, Isaac. Vous pouvez encore le recuperer.`, source: 'system' };
  }
  mm = text.match(/^(?:creer?|cre|cree)\s+(?:moi\s+)?un raccourci\s+(?:sur le bureau\s+)?(?:pour|de|vers)?\s*(.*)/);
  if (mm) {
    if (ESSAI) return { reply: '[ESSAI] raccourci : ' + (mm[1] || 'mon site'), source: 'essai' };
    const quoi = nettoieCible(mm[1]);
    let cible = '', nom = 'Isaac';
    if (/site|page|mbengue|eleve/.test(quoi) || !quoi) {
      try {
        const htmls = fs.readdirSync(CODE_DIR).filter(f => /\.html$/i.test(f));
        if (htmls.length) { cible = path.join(CODE_DIR, htmls[0]); nom = htmls[0].replace(/\.html$/i, ''); }
      } catch (e) {}
    }
    if (!cible) return { reply: "Dites-moi ce que le raccourci doit ouvrir, Isaac : « cre un raccourci pour mon site ».", source: 'system' };
    const bureau = path.join(process.env.USERPROFILE || 'C:', 'Desktop', nom.replace(/[^a-z0-9_-]/g, '_') + '.lnk');
    await shellOut(`powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${bureau}'); $s.TargetPath='${cible}'; $s.Save()"`);
    return { reply: `Raccourci « ${nom} » depose sur votre Bureau, Isaac.`, source: 'system' };
  }

  // --- Communications : WhatsApp, email, appel ---
  // « envoie ce fichier par whatsapp », « partage le fichier par mail » : on copie le dernier fichier créé + on ouvre le canal
  if (/^(?:envoie|envoyer|partage|transmets|joins|poste)(?: moi)?\b/.test(text.replace(new RegExp(ENTREE), '')) && /\bfichiers?\b/.test(text) && /(whatsapp|mail|e?mail|gmail)/.test(text)) {
    let dernier = '';
    try {
      const fichiers = fs.readdirSync(CODE_DIR)
        .map(f => ({ f, t: fs.statSync(path.join(CODE_DIR, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      if (fichiers.length) dernier = path.join(CODE_DIR, fichiers[0].f);
    } catch (e) {}
    const canal = /whatsapp/.test(text) ? 'https://web.whatsapp.com' : 'https://mail.google.com';
    if (dernier) {
      run(`powershell -NoProfile -Command "Set-Clipboard -Path '${dernier.replace(/'/g, '')}'"`);
      return { reply: `Le fichier « ${path.basename(dernier)} » est copie dans le presse-papiers, Isaac. Collez-le avec Ctrl+V dans la conversation que j'ouvre.`, source: 'system', open: canal };
    }
    return { reply: "Je n'ai aucun fichier recemment cree a envoyer, Isaac. D'abord « ecris un site web... », puis redites l'envoi. J'ouvre deja le canal.", source: 'system', open: canal };
  }
  mm = text.match(new RegExp(ENTREE + '(?:envoie|envoyer|ecrire|ecris|dict[e]|poste)\\s+(?:un\\s+)?(?:message|texte|whatsapp|mail|email)\\s+(?:a|au|a\\s+monsieur|pour)\\s+(.+?)(?:\\s+(?:sur|par|via)\\s+(whatsapp|gmail|mail|email|sms))?(?:\\s*(?:en disant|disant|comme quoi|avec le message|comme suit)[: ]\\s*(.+))?$'));
  if (mm) {
    const contact = nettoieCible(mm[1]).replace(/\s+/g, ' ').trim();
    const canal = (mm[2] || 'whatsapp').trim();
    const texte = (mm[3] || '').trim();
    if (canal !== 'whatsapp') {
      const mem = loadMemory();
      pendingEnvoi = null;
      if (texte) run(`powershell -NoProfile -Command "'${texte.replace(/'/g, '')}' | Set-Clipboard"`);
      return { reply: texte ? `Votre message est copie dans le presse-papiers, Isaac : collez-le dans Gmail (Ctrl+V) et verifiez avant d'envoyer.` : `J'ouvre Gmail, Isaac.`, source: 'system', open: 'https://mail.google.com' };
    }
    // Numérotation inversée : le numéro de "Nadège Chou" est en mémoire avec ses accents,
    // le contact vient du micro sans accents → on compare les DEUX côtés normalisés,
    // puis on cherche les chiffres APRÈS le nom (l'ancien regex collait les mots : bug).
    const mem2 = loadMemory();
    const lignes = normalize([JSON.stringify(mem2.profile || {})].concat(mem2.facts || [], (mem2.log || []).map(x => x.q + ' ' + x.a)).join(' '));
    const cNorm = normalize(contact);
    let tel = null;
    for (const cand of [cNorm, cNorm.split(' ')[0]]) {
      if (!cand || tel) continue;
      let from = 0, i;
      // Toutes les occurrences du nom (le dernier souvenir de log n'a pas le numéro)
      while (!tel && (i = lignes.indexOf(cand, from)) >= 0) {
        tel = extraireDigits(lignes.slice(i + cand.length, i + cand.length + 60));
        from = i + 1;
      }
    }
    if (tel && texte) {
      pendingEnvoi = null;
      return executerEnvoi({ contact, tel, texte, canal: 'whatsapp' });
    }
    if (tel) {
      pendingEnvoi = { contact, tel, texte: null, canal: 'whatsapp', etape: 'texte', t: Date.now() };
      run(`powershell -NoProfile -Command "Start-Process 'whatsapp://send?phone=+${tel}'"`);
      return { reply: `J'ai le numero de ${contact} (+${tel}) en memoire, Isaac. Je lance la conversation WhatsApp sans ouvrir Edge, et rien ne partira sans vous : dictez le message, ou dites « fais feu de ton imagination » et je vous ferai un brouillon a valider.`, source: 'system' };
    }
    pendingEnvoi = { contact, tel: null, texte: texte || null, canal: 'whatsapp', etape: 'numero', t: Date.now() };
    if (texte) run(`powershell -NoProfile -Command "'${texte.replace(/'/g, '')}' | Set-Clipboard"`);
    return { reply: `Je ne trouve pas le numero de ${contact} en memoire, Isaac — je n'ai donc RIEN envoye. Dictez ses chiffres (par exemple « +225 04 14 60 56 ») : je les grave en memoire et je prepare l'ouverture de la conversation, sans jamais appuyer sur envoyer a votre place.${texte ? ' Votre message est deja dans le presse-papiers (Ctrl+V).' : ''}`, source: 'system' };
  }
  if (/^(?:appelle|appeler|appel me|passe un appel a|telephone a?)\s+(.+)/.test(text)) {
    mm = text.match(/^(?:appelle|appeler|telephone a?)\s+(.+)/);
    const nom = nettoieCible(mm[1]).replace(/\s+/g, ' ').trim();
    return { reply: `Appeler par la voix n'est pas possible sur un PC sans telephonie, Isaac. En revanche je peux ouvrir WhatsApp avec ${nom} : dites « envoie un message a ${nom} sur whatsapp en disant bonjour ».`, source: 'system' };
  }
  if (/(?:montre|affiche|ouvre|lis)(?: moi)? (?:mes|la boite aux|mon) (?:emails?|mails?|messagerie|boite mail)/.test(text)) {
    return { reply: "J'ouvre votre messagerie, Isaac.", source: 'system', open: 'https://mail.google.com' };
  }
  if (/lis (?:moi )?(?:le |mes |mon )?(?:dernier|les derniers) (?:message|mail|sms)/.test(text)) {
    return { reply: "Je ne peux pas lire vos messages a votre place sans acces a la boite, Isaac — mais j'ouvre WhatsApp et Gmail pour vous. Dites « ouvre whatsapp ».", source: 'system', open: 'https://web.whatsapp.com' };
  }

  // --- Traduire / résumer / mot de passe / conversions ---
  mm = text.match(/^(?:traduis|traduire|traduction de|comment dit on)\s+(.+?)\s+(?:en|dans|vers|au)\s+(anglais|francais|france|espagnol|allemand|italien|portugais|arabe|chinois|japonais|souahili|diola|baoule|anglais)/);
  if (mm) {
    const langues = { anglais: 'anglais', francais: 'français', france: 'français', espagnol: 'espagnol', allemand: 'allemand', italien: 'italien', portugais: 'portugais', arabe: 'arabe', chinois: 'chinois', japonais: 'japonais', souahili: 'swahili', diola: 'diola (Côte d\'Ivoire)', baoule: 'baoulé' };
    const vers = langues[mm[2].trim()] || mm[2];
    const t = await askAI([
      { role: 'system', content: "Tu es un traducteur professionnel. Tu réponds UNIQUEMENT avec la traduction, sans explication ni guillemets." },
      { role: 'user', content: `Traduis en ${vers} : ${mm[1]}` },
    ]);
    if (t) return { reply: `En ${vers}, Isaac, cela se dit : ${t.slice(0, 700)}`, source: 'ai' };
    return { reply: "Mon cerveau de traduction est indisponible, Isaac. Réessayez dans un instant.", source: 'local' };
  }
  mm = text.match(/^(?:resume|resumer|resumes|retrecis|racourcis|fais un resume de|condense)\s*(?:moi\s+)?(?:ce|ca|le|la|un|mon|texte|article|document)?\s*[:\-]?\s*(.*)$/);
  if (mm) {
    const source = (mm[1] || '').trim();
    const mem = loadMemory();
    const derniere = ((mem.log || []).slice(-1)[0] || {}).a || '';
    const texte = source.length > 60 ? source : derniere;
    if (!texte || texte.length < 40) return { reply: "Dictez-moi le texte a resumer apres « resume : », Isaac, ou dites-le moi juste apres que je vous ai repondu et je le condenserai.", source: 'local' };
    const t = await askAI([
      { role: 'system', content: "Tu résumes en français en 3 phrases maximum, directement, sans introduction." },
      { role: 'user', content: 'Résume ce texte : ' + texte.slice(0, 4000) },
    ]);
    if (t) return { reply: `En resume, Isaac : ${t.replace(/\s*\n+\s*/g, ' ')}`.slice(0, 700), source: 'ai' };
    return { reply: "Je n'arrive pas a resumer pour l'instant, Isaac.", source: 'local' };
  }
  if (/(?:generateurs?|generer|genere|creer|cre|cree|donne|trouve)\s*(?:moi\s+)?(?:d[eu]\s+|un\s+|des\s+|le\s+|du\s+)?mot ?de ?passe/.test(text) || /mot de passe (?:fort|securise|aleatoire|solide)/.test(text)) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*+-';
    const octets = require('crypto').randomBytes(16);
    let mp = '';
    for (let i = 0; i < 16; i++) mp += alphabet[octets[i] % alphabet.length];
    run(`powershell -NoProfile -Command "'${mp}' | Set-Clipboard"`);
    return { reply: "Mot de passe genere, Isaac : il est copie dans votre presse-papiers (Ctrl+V pour le coller) et affiche a l'ecran. Je ne le lis pas a voix haute.", source: 'system', code: mp };
  }
  mm = text.match(/(\d+(?:[.,]\d+)?)\s*(?:pour ?cent|pourcents?|pc|%)\s*(?:de|sur|dans)\s*(\d+(?:[.,]\d+)?)/);
  if (mm) {
    const p = parseFloat(mm[1].replace(',', '.')), b = parseFloat(mm[2].replace(',', '.'));
    const r = Math.round((p / 100 * b) * 100) / 100;
    return { reply: `${mm[1].replace('.', ',')} pour cent de ${mm[2].replace('.', ',')} = ${String(r).replace('.', ',')}, Isaac.`, source: 'local' };
  }
  if (/combien de jours|jours avant|jours jusqu/.test(text)) {
    const MOIS = { janvier: 0, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5, juillet: 6, aout: 7, septembre: 8, octobre: 9, novembre: 10, decembre: 11 };
    mm = text.match(/(\d{1,2})\s*(?:er)?\s*(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s*(\d{4})?/);
    if (mm) {
      const jour = parseInt(mm[1], 10), mois = MOIS[mm[2]], annee = mm[3] ? parseInt(mm[3], 10) : new Date().getFullYear();
      let cibleD = new Date(annee, mois, jour);
      const aujourd = new Date(); aujourd.setHours(0, 0, 0, 0);
      if (cibleD < aujourd && !mm[3]) cibleD.setFullYear(annee + 1);
      const jours = Math.round((cibleD - aujourd) / 864e5);
      return { reply: `Il reste ${jours} jour${jours > 1 ? 's' : ''} avant le ${jour} ${mm[2]} ${cibleD.getFullYear()}, Isaac.`, source: 'local' };
    }
    return { reply: "Donnez-moi la date, Isaac : « combien de jours avant le 31 decembre ».", source: 'local' };
  }
  if (/\b(?:converti|conversion|combien)\b/.test(text) && /(\d[\d .,]{0,14})\s*(francs? ?cfa|fcfa|xof|euros?|dollars?|usd|livres?|gbp|dirhams?|nairas?|cedis?|dinars?)/.test(text)) {
    mm = text.match(/(\d[\d .,]{0,14})\s*(francs? ?cfa|fcfa|xof|euros?|dollars?|usd|livres?|gbp|dirhams?|nairas?|cedis?|dinars?)\s*(?:en|vers|dans)\s*(francs? ?cfa|fcfa|xof|euros?|dollars?|usd|livres?|gbp|dirhams?|nairas?|cedis?|dinars?|[a-z]{3})/);
    if (mm) {
      const CODES = { 'francs cfa': 'XOF', 'franc cfa': 'XOF', fcfa: 'XOF', xof: 'XOF', cfa: 'XOF', euro: 'EUR', euros: 'EUR', dollar: 'USD', dollars: 'USD', usd: 'USD', livre: 'GBP', livres: 'GBP', gbp: 'GBP', dirham: 'MAD', naira: 'NGN', cedi: 'GHS', dinar: 'DZD' };
      const montant = parseFloat(mm[1].replace(/[ .,](?=\d{3}(\D|$))/g, '').replace(',', '.'));
      const de = CODES[mm[2].replace(/\s+/g, ' ').trim()] || String(mm[2]).toUpperCase().slice(0, 3);
      const vers = CODES[mm[3].replace(/\s+/g, ' ').trim()] || String(mm[3]).toUpperCase().slice(0, 3);
      if (montant > 0 && de.length === 3 && vers.length === 3) {
        const brut = await fetchText('https://open.er-api.com/v6/latest/' + de, 8000);
        try {
          const j = JSON.parse(brut);
          const taux = j.rates && j.rates[vers];
          if (!taux) return { reply: `Je ne trouve pas le taux ${de} vers ${vers}, Isaac.`, source: 'local' };
          const resultat = montant * taux;
          const forme = n => String(Math.round(n * 100) / 100).replace('.', ',');
          return { reply: `${forme(montant)} ${de} = ${forme(resultat)} ${vers} (taux du jour : 1 ${vers} = ${forme(1 / taux)} ${de}), Isaac.`, source: 'system' };
        } catch (e) { return { reply: "Le serveur de change ne repond pas, Isaac. Réessayez dans un instant.", source: 'local' }; }
      }
    }
  }
  if (/\b(?:extension|add on|addons?)\b/.test(text) && /chrome|navigateur/.test(text)) {
    return { reply: "J'ouvre le Chrome Web Store, Isaac : cherchez y l'extension puis cliquez sur « Ajouter ». Je ne peux pas l'installer a votre place sans Confirmation.", source: 'system', open: 'https://chrome.google.com/webstore' };
  }
  if (/\b(?:vitesse|accelere|plus vite|lentement)\b/.test(text) && /lecture|video|musique/.test(text)) {
    await geste('lecture');
    return { reply: "Je donne un coup sur la lecture, Isaac. Pour la vitesse, utilisez les touches +/- dans le lecteur.", source: 'system' };
  }
  if (/^(?:pause|stop la lecture|mets en pause|arrete la musique|continue la lecture|reprends la lecture)$/.test(text)) {
    await geste('lecture');
    return { reply: /pause|stop|arrete/.test(text) ? "Lecture mise en pause, Isaac." : "Lecture reprise, Isaac.", source: 'system' };
  }

  // --- Cherche sur Google ---
  let m = text.match(/^(?:cherche|recherche|cherche moi|recherche moi|trouve|google)\s+(.+)/);
  if (m) {
    return { reply: `Je lance la recherche pour « ${m[1]} », Isaac.`, source: 'system',
             open: 'https://www.google.com/search?q=' + encodeURIComponent(m[1]) };
  }

  // --- Joue sur YouTube ---
  m = text.match(/^(?:joue|jouer|lance la video|mets|met|ecoute)\s+(.+)/);
  if (m) {
    let query = m[1].trim().replace(/^(?:de la|des|du|un peu de|de|la|le)\s+/, '').trim() || m[1].trim();
    // Demande générale de musique → les hits du moment plutôt qu'une recherche littérale
    if (/^(?:musique|musiques|chansons?|hits?|tube|tubes|playlist|radio)$/.test(query)) {
      return { reply: "Je vous ouvre les plus grands tubes du moment sur YouTube, Isaac. Installez-vous bien.", source: 'system',
               open: 'https://www.youtube.com/results?search_query=' + encodeURIComponent('top hits 2026 best music playlist') };
    }
    return { reply: `Je cherche « ${m[1]} » sur YouTube, Isaac. Bon visionnage.`, source: 'system',
             open: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(m[1]) };
  }

  // --- Récupérer le DERNIER code écrit : l'ouvrir dans VS Code + le copier au presse-papiers ---
  // « copie le code dans vs code », « ouvre le dernier script », « montre le code »...
  // Mais JAMAIS « ouvre vscode » (lancement de l'application, géré par la table APPS plus bas).
  // Les petits mots d'accueil (« isaac », « s'il te plait », « allez ») sont ignorés : la voix en ajoute souvent.
  const lanceEditeur = new RegExp(ENTREE + '(?:ouvre|ouvrir)\\s+(?:moi\\s+|le\\s+)?(?:vs\\s?code|visual)').test(text); // « ouvre vscode » = lancer l'app
  const verbeRecup = new RegExp(ENTREE + '(?:copie|copies|copier|colle|coller|montre|montrer|donne|donner|affiche|envoie|ouvre|ouvrir)(?:\\s|$)').test(text);
  const parleDuDernier =
    /\b(?:le|la|les|du|de la|ce|cet|ton|ta|mon|ma|notre|dernier|premier)\s+(?:dernier\s+|nouveau\s+)?(?:code|codes|script|scripts)\b/.test(text) ||
    /\b(?:vs\s?code|visual\s?studio|presse[- ]?papier)\b/.test(text);
  const veutDernier = !lanceEditeur && verbeRecup && parleDuDernier &&
    !/\b(?:python|html|javascript|batch|powershell|sql|php|java|c\+\+)\b/.test(text.replace(/vs\s?code|visual\s?studio/g, '')); // « copie le code python qui... » = génération, pas récupération
  if (veutDernier) {
    if (!IS_LOCAL) return { reply: "Je ne peux ouvrir VS Code que lorsque je tourne sur votre PC, Isaac. En version web, utilisez le lien sous le bloc de code.", source: 'local' };
    let derniers = [];
    try { derniers = fs.readdirSync(CODE_DIR); } catch (e) {}
    derniers.sort((a, b) => fs.statSync(path.join(CODE_DIR, b)).mtimeMs - fs.statSync(path.join(CODE_DIR, a)).mtimeMs);
    if (!derniers.length) {
      return { reply: "Je n'ai encore rien écrit pour vous, Isaac. Dites-moi quoi : « écris-moi un script qui... », puis « copie le code dans VS Code ».", source: 'local' };
    }
    const dernier = derniers[0];
    const fullPath = path.join(CODE_DIR, dernier);
    run(`code "${fullPath}"`);
    run(`clip < "${fullPath}"`); // presse-papiers : Ctrl+V colle le code n'importe où
    return { reply: `C'est fait, Isaac. « ${dernier} » est ouvert dans VS Code et copié dans votre presse-papiers : Ctrl+V le colle où vous voulez.`, source: 'system' };
  }

  // --- Ouvrir un site ou une application ---
  m = text.match(new RegExp(ENTREE + '(?:ouvre|ouvrir|lance|lancer|va sur|allez sur|vas sur)\\s+(.+)'));
  if (m) {
    const target = m[1].trim();
    // Les articles ("le/la/l'/les/my...") sont ignorés ; les noms les plus longs d'abord
    const strip = s => s.replace(/['’]/g, ' ').replace(/^(?:le|la|les|l|un|une|mon|ma|mes|du|de|des|my|the)\s+/g, '').trim();
    const wordMatch = (key, s) => new RegExp(`(^|[^a-z])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(s);
    const entries = list => list.sort((a, b) => b[0].length - a[0].length);
    for (const [key, url] of entries(Object.entries(SITES))) {
      if (wordMatch(key, target) || wordMatch(key, strip(target))) {
        return { reply: `J'ouvre ${key}, Isaac.`, source: 'system', open: url };
      }
    }
    for (const [key, cmd] of entries(Object.entries(APPS))) {
      if (wordMatch(key, target) || wordMatch(key, strip(target))) {
        if (!IS_LOCAL) return { reply: `« ${key} » est une application de votre PC, Isaac : je ne peux la lancer que lorsque je tourne en local sur votre machine (ISAAC-IJ.bat). En version web, je peux ouvrir des sites, discuter, donner la météo et bien plus.`, source: 'system' };
        run(cmd);
        return { reply: `J'ouvre ${key}, Isaac. Si rien n'apparait, le logiciel n'est peut-etre pas installe sur votre PC.`, source: 'system' };
      }
    }
    // « ouvre mon site », « ouvre la page elevage » → les pages que j'ai construites pour Isaac
    if (IS_LOCAL && /\b(?:site|page)\b/.test(target)) {
      let pages = [];
      try { pages = fs.readdirSync(CODE_DIR).filter(f => /\.html$/i.test(f)); } catch (e) {}
      if (pages.length) {
        const mots = nettoieCible(target).split(/[^a-z0-9]+/).filter(w => w.length > 3 && !/^(?:site|sites|web|page|pages|ouvre|ton|votre)$/.test(w));
        const classe = f => {
          const s = normalize(f);
          let n = 0;
          for (const w of mots) if (s.includes(w)) n++;
          if (n === 0) { // le mot n'est pas dans le nom du fichier : on regarde DANS la page
            try {
              const corps = normalize(fs.readFileSync(path.join(CODE_DIR, f), 'utf8').slice(0, 6000));
              for (const w of mots) if (corps.includes(w)) n++;
            } catch (e) {}
          }
          return n;
        };
        const ages = f => { try { return fs.statSync(path.join(CODE_DIR, f)).mtimeMs; } catch (e) { return 0; } };
        const choix = mots.length
          ? pages.filter(f => classe(f) > 0).sort((a, b) => classe(b) - classe(a) || ages(b) - ages(a))[0]
          : pages.sort((a, b) => ages(b) - ages(a))[0];
        if (choix) {
          run(`start "" "${path.join(CODE_DIR, choix)}"`);
          return { reply: `J'ouvre votre page « ${choix} », Isaac.`, source: 'system' };
        }
      }
    }
    // Peut-être un nom de domaine direct
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(target.replace(/\s/g, ''))) {
      return { reply: `J'ouvre le site ${target}, Isaac.`, source: 'system', open: 'https://' + target.replace(/\s/g, '') };
    }
    // SINON : chercher le logiciel dans Windows (tous les programmes installés, pas seulement ma liste)
    const nomPropre = nettoieCible(target);
    if (IS_LOCAL && nomPropre.length >= 3) {
      const trouvee = await chercheAppli(nomPropre);
      if (trouvee) {
        return { reply: `J'ouvre ${trouvee.nom}, Isaac — je viens de le trouver dans vos programmes installs. Dites « ouvre ${trouvee.nom.toLowerCase()} » la prochaine fois, ce sera plus rapide.`, source: 'system' };
      }
    }
    return { reply: `Je n'ai pas trouve « ${target} » parmi vos logiciels, Isaac, alors je le cherche sur Google.`, source: 'system',
             open: 'https://www.google.com/search?q=' + encodeURIComponent(nomPropre || target) };
  }

  // --- Lancer VS Code pour coder (sans demande de génération) ---
  // « commence a coder sur vs code », « je veux coder », « on code »... (jamais « ouvre vscode » ni « copie le code »)
  if (!/^ouvre\b/.test(text) && !veutDernier) {
    const space = ' ' + text + ' ';
    const vsIci = /(?:vs ?code|visual)/.test(space);
    const veutCoder = / (coder|programmer|developper|travailler|code) /.test(space);
    if (veutCoder || (vsIci && / (commence|demarre|continue|on|je|il|faut|vais|veux|vaux|moi|go|allez|pret|code) /.test(space))) {
      if (!IS_LOCAL) return { reply: "Pour coder dans VS Code, il faut que j'utilise votre PC : lancez ISAAC-IJ.bat, Isaac.", source: 'local' };
      run('code');
      return { reply: "C'est parti, Isaac. J'ouvre VS Code — dictez-moi « fais-moi un site... » ou « écris un script python... » et j'écrirai le code dedans.", source: 'system' };
    }
  }

  // --- Générer du code (Isaac programmeur) --- (ENTREE tolère les mots d'accueil ajoutés par la voix)
  m = text.match(new RegExp(ENTREE + '(?:ecris|ecri(?:vez)?|ecrire|ecrits|code(?:z)?|genere(?:z)?|generer|realise(?:z)?|realiser|cree(?:z)?|creer|developpe(?:z)?|developper|fabrique(?:z)?|concois|programme|prepare(?:z)?|construis(?:ez)?|faire|fais|fait|faite)\\s*(?:[- ]+)?(?:moi\\s+|nous\\s+)?(?:un|une|du|de\\s+la|le\\s+|la\\s+|mon\\s+|ma\\s+)?(.+)$'));
  let descCode = null;
  if (m && /\b(?:code|script|programme|application|logiciel|jeu|page|site|web|fichier|python|html|javascript|batch|powershell|sql)\b/.test(m[1]) &&
      !/^(?:que|qui|pourquoi|comment|quand|ou)\b/.test(m[1])) descCode = m[1];
  // « je veux un site complet », « j'aimerais une application web » — génération SANS verbe de création
  if (!descCode) {
    const mv = text.match(new RegExp(ENTREE + '(?:je veux|je voudrais|je veux vraiment|jaimerais|jai besoin de|il me faut|on a besoin de|donne(?:z)? moi|souhaite)\\s*(?:[- ]+)?(?:un|une|du|de la|le|la|mon|ma)?\\s*(.+)$'));
    if (mv && /\b(?:site|web|appli|application|programme|logiciel|script|page|maquette|plateforme|code|jeu)\b/.test(mv[1])
        && !/\b(?:ouvre|ouvrir|lance|ferme|voir|vois|montre|copie|colle|rappelo|telecharge)\b/.test(mv[1])
        && !/^(?:que|qui|pourquoi|comment|quand|ou)\b/.test(mv[1])) descCode = mv[1];
  }
  if (descCode) {
    // « site complet / plusieurs fichiers / appli web pro » → vrai projet multi-fichiers ; sinon fichier unique
    const veutPro = /complet|complete|plusieurs fichiers|professionnel|profess|plein|reel|veritable|application web|appli web|plateforme|dashboard|tableau de bord|boutique|e[ -]commerce|portfolio/.test(descCode)
                 && /site|web|appli|application|plateforme|boutique|portfolio|page|maquette/.test(descCode);
    const oeuvre = veutPro ? await askSitePro(descCode) : await askCode(descCode);
    if (oeuvre) return { reply: oeuvre.reply, source: 'ai', code: oeuvre.code, fileUrl: oeuvre.fileUrl, file: oeuvre.fileName };
    return { reply: "Je n'ai pas pu joindre mon atelier de code, Isaac. Réessayez dans un instant — le cerveau IA était peut-être saturé.", source: 'local' };
  }

  // --- Retravailler un programme deja ecrit : « modifie ces fonctionnalites », « change la page de connexion », « ameliore le design » ---
  // verbe cherché PARTOUT dans la phrase : « je te demandais juste de modifier ces fonctionnalites » doit declencher la modification
  mm = text.match(/(?:modifie[sz]?|modifier|changes?|changer|ameliore[sz]?|ameliorer|retravaille[sz]?|retravailler|corrige[sz]?|corriger|remanie[sz]?|remanier|reformes?|reformater)\s+(?:moi\s+|encore\s+|juste\s+|donc\s+|directement\s+|la\s+|le\s+|les\s+|ces\s+|ce\s+|cette\s+|mon\s+|ma\s+)?(.+)/);
  if (mm && !/^(?:explique|comment|pourquoi|qu est ce que|dis moi|est ce que)\b/.test(text)
      && /\b(?:fichier|site|page|script|programme|code|fonctionnalit\w*|design|connexion|interface|style\w*|css|html|maquette|bouton|couleur|texte|titre|menu|animation|logo|formulaire|dernier\w*)\b/.test(mm[1])
      && !/\b(?:mot de passe|mdp|wifi|reseau|bluetooth|notif|e[ -]?cran|luminosite|volume|heure|date|fond d|voix|langue|nom)\b/.test(mm[1])) {
    if (!IS_LOCAL) return { reply: "Pour retravailler tes programmes, il me faut ton PC : lance ISAAC-IJ.bat, Isaac.", source: 'local' };
    const modif = await askModif(mm[1]);
    if (modif) return { reply: modif.reply, source: 'ai', code: modif.code, fileUrl: modif.fileUrl, file: modif.fileName };
    return { reply: "Je n'ai aucun programme a modifier pour l'instant, Isaac. D'abord « genere un site », ensuite « modifie le ».", source: 'local' };
  }

  // --- Blague ---
  if (/blague|drole|fais moi rire/.test(text)) {
    return { reply: BLAGUES[Math.floor(Math.random() * BLAGUES.length)], source: 'local' };
  }

  // --- Mémoire permanente ---
  m = text.match(/^(?:retiens|souviens toi que|souviens toi de|memorise|enregistre dans ta memoire)\s+(?:que\s+|de\s+)?(.+)/);
  if (m) {
    const fact = m[1].trim().replace(/[.!?]+$/, '');
    if (fact.length < 2) return { reply: 'Que dois-je retenir exactement, Isaac ?', source: 'system' };
    const mem = loadMemory();
    if (mem.facts.includes(fact)) return { reply: `Je le savais déjà, Isaac : « ${fact} » est dans ma mémoire.`, source: 'system' };
    mem.facts.push(fact);
    if (mem.facts.length > 100) mem.facts = mem.facts.slice(-100);
    if (saveMemory(mem)) {
      return { reply: `C'est gravé dans ma mémoire permanente, Isaac : « ${fact} ». Je m'en souviendrai même après un redémarrage.`, source: 'system' };
    }
    return { reply: `Je comprends, mais je n'arrive pas à écrire ma mémoire sur le disque, Isaac.`, source: 'system' };
  }
  if (/^(?:que sais tu de moi|que te souviens tu|qu est ce que tu sais|que sais tu a mon sujet|que sais tu sur moi|raconte moi ce que tu sais)/.test(text) || /ma memoire|te souviens tu de moi/.test(text)) {
    const mem = loadMemory();
    const p = mem.profile;
    let reply = `Ce que je sais de vous, Isaac : vous êtes mon créateur, ${p.ville} en ${p.pays}.`;
    if (mem.facts.length) reply += " J'ai mémorisé : " + mem.facts.slice(-8).join(' ; ') + '.';
    else reply += " Je n'ai pas encore de faits mémorisés — dites-moi « retiens que... » et je ne l'oublierai jamais.";
    if (mem.log.length) reply += ` Nous avons échangé ${mem.log.length} fois récemment.`;
    return { reply, source: 'system' };
  }
  if (/^oublie (?:tout|toute ta memoire|tes souvenirs|la memoire|ma memoire)$|^vide ta memoire/.test(text)) {
    const mem = loadMemory();
    mem.facts = [];
    mem.log = [];
    saveMemory(mem);
    return { reply: "Mémoire effacée, Isaac. Je repars à zéro — mais je vous reconnaîtrai toujours comme mon créateur.", source: 'system' };
  }
  m = text.match(/^oublie (?:que\s+|de\s+)?(.+)/);
  if (m) {
    const needle = normalize(m[1]);
    const mem = loadMemory();
    const before = mem.facts.length;
    mem.facts = mem.facts.filter(f => !normalize(f).includes(needle) && !needle.includes(normalize(f)));
    saveMemory(mem);
    if (mem.facts.length < before) return { reply: `Effacé de ma mémoire, Isaac.`, source: 'system' };
    return { reply: `Je n'ai rien de tel en mémoire, Isaac.`, source: 'system' };
  }
  if (/^(?:qu est ce que je t ai |que t ai je |notre conversation|nos dernieres echanges|derniere question)/.test(text) || /de quoi on a parle|ce qu on s est dit/.test(text)) {
    const mem = loadMemory();
    const recent = mem.log.slice(-4);
    if (!recent.length) return { reply: "Notre historique est vide pour le moment, Isaac.", source: 'system' };
    return { reply: 'Nos derniers échanges : ' + recent.map(x => `« ${x.q} »`).join(' , ') + '.', source: 'system' };
  }

  // --- Notes ---
  m = text.match(/^(?:prends une note|note que|note|ecris)\s+(.+)/);
  if (m) {
    if (!IS_LOCAL) return { reply: `En version web je ne peux pas enregistrer de note durable, Isaac (le serveur est éphémère). Lancez-moi en local avec ISAAC-IJ.bat pour que vos notes soient gardées sur votre PC.`, source: 'system' };
    const line = `[${new Date().toLocaleString('fr-FR')}] ${m[1]}\n`;
    try {
      fs.appendFileSync(NOTES_FILE, line, 'utf8');
      return { reply: `C'est noté, Isaac : « ${m[1]} ».`, source: 'system' };
    } catch (e) {
      return { reply: `Je n'arrive pas à écrire sur le disque, Isaac : ${e.message}`, source: 'system' };
    }
  }
  if (/lis mes notes|mes notes|affiche mes notes/.test(text)) {
    if (fs.existsSync(NOTES_FILE)) {
      const notes = fs.readFileSync(NOTES_FILE, 'utf8').trim().split('\n').slice(-5);
      return { reply: 'Voici vos dernières notes, Isaac : ' + notes.join(' — '), source: 'system' };
    }
    return { reply: "Vous n'avez aucune note pour le moment, Isaac.", source: 'system' };
  }

  // --- Commandes de contrôle du PC (locales uniquement) ---
  const REMOTE_PC = "Ce contrôle de votre PC exige que je tourne en local sur votre machine, Isaac (via ISAAC-IJ.bat). En version web, je ne peux ni verrouiller ni éteindre votre ordinateur — mais je peux toujours ouvrir des sites, discuter et vous renseigner.";
  if (/verrouille|verrouiller la session|verrouille le pc|verrouille l ordinateur/.test(text)) {
    if (!IS_LOCAL) return { reply: REMOTE_PC, source: 'system' };
    run('rundll32.exe user32.dll,LockWorkStation');
    return { reply: 'Je verrouille votre session, Isaac. À tout de suite.', source: 'system' };
  }

  // --- Éteindre / annuler ---
  if (/annule l extinction|annuler l extinction|annule extinction/.test(text)) {
    if (!IS_LOCAL) return { reply: REMOTE_PC, source: 'system' };
    run('shutdown /a');
    return { reply: 'Extinction annulée, Isaac. Tous les systèmes restent en ligne.', source: 'system' };
  }
  if (/eteins le pc|eteins l ordinateur|eteindre le pc|eteindre l ordinateur|arrete l ordinateur/.test(text)) {
    if (!IS_LOCAL) return { reply: REMOTE_PC, source: 'system' };
    run('shutdown /s /t 60');
    return { reply: "J'ai programmé l'extinction dans 60 secondes, Isaac. Dites « annule l'extinction » pour interrompre la séquence.", source: 'system' };
  }
  if (/redemarre le pc|redemarre l ordinateur/.test(text)) {
    if (!IS_LOCAL) return { reply: REMOTE_PC, source: 'system' };
    run('shutdown /r /t 60');
    return { reply: "Redémarrage programmé dans 60 secondes, Isaac. Dites « annule l'extinction » pour annuler.", source: 'system' };
  }

  // --- Capturer l'écran ---
  if (/capture (l |d )?(ecran|image|d ecran)|screenshot|faire une capture/.test(text)) {
    if (!IS_LOCAL) return { reply: "La capture d'écran n'est possible que lorsque je tourne sur votre PC, Isaac.", source: 'system' };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const out = path.join(process.env.USERPROFILE || 'C:', 'Pictures', 'isaac-capture-' + stamp + '.png');
    const ps = 'Add-Type -AssemblyName System.Windows.Forms,System.Drawing;' +
      '$b=[System.Windows.Forms.SystemInformation]::VirtualScreen;' +
      '$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height;' +
      '$g=[System.Drawing.Graphics]::FromImage($bmp);' +
      '$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size);' +
      `$bmp.Save('${out}');$g.Dispose();$bmp.Dispose()`;
    exec(`powershell -NoProfile -WindowStyle Hidden -Command "${ps}"`, (err) => {
      if (err) console.error('[capture]', err.message);
    });
    return { reply: `Capture d'écran enregistrée dans vos Images : isaac-capture-${stamp}.png, Isaac.`, source: 'system' };
  }

  // --- Calcul simple ---
  m = text.match(/^(?:calcule|calcul|combien font|combien fait)\s+(.+)/);
  if (m) {
    const expr = m[1].replace(/x/gi, '*').replace(/fois/g, '*').replace(/divise par/g, '/').replace(/moins/g, '-').replace(/plus/g, '+').replace(/,/g, '.');
    if (/^[0-9+\-*/(). ]+$/.test(expr)) {
      try {
        const result = Function('"use strict"; return (' + expr + ')')();
        return { reply: `Le résultat est ${result}, Isaac.`, source: 'local' };
      } catch (e) { /* tombe sur l'IA */ }
    }
  }

  // --- Suite d'un envoi WhatsApp en attente : numéro dicté, texte, validation ---
  // Aucune phrase n'arrive au cerveau IA « en conversation d'envoi » sans passer ici :
  // c'est cette interception qui empêche le faux « le message a été envoyé ».
  purgePending();
  if (pendingEnvoi) {
    const pe = pendingEnvoi;
    // Isaac répond toujours en saluant, le prénom peut tomber en DÉBUT ou en FIN de phrase.
    const nu = text.replace(new RegExp(ENTREE), '')
      .replace(/\s+(?:isaac|iseck|izak|isack|aelyra|aelira|aleyra|elyra|elira|juniors?|jarvis)\s*$/, '').trim() || text;
    if (/^(?:annule|laisse tomber|abandonne)/.test(nu) || /^non\b(?:.{0,24}(?:annule|laisse|envoie pas|ne )|\b)/.test(nu)) {
      pendingEnvoi = null;
      return { reply: `Envoi annule, Isaac${pe.contact ? ' pour ' + pe.contact : ''}. Rien n'a ete lance —${pe.tel ? ' le numero +' + pe.tel + ' reste grave en memoire.' : ' son numero me manquait encore.'}`, source: 'system' };
    }
    const digits = extraireDigits(text);
    // 1) Le micro dicte des chiffres → c'est le numéro (le vrai cas Nadège : « +225 04 14 60 56 … »)
    if (digits && (!pe.tel || /^\+?\d/.test(nu) || /numero|telephone|change|nouveau/.test(text))) {
      const gravé = memoriserNumero(pe.contact, digits);
      pe.tel = digits; pe.t = Date.now();
      pe.etape = pe.texte ? 'validation' : 'texte';
      return { reply: `Numero de ${pe.contact} enregistre${gravé ? ' dans ma memoire permanente' : ''} : +${digits}, Isaac. Rien ne s'est ouvert, rien n'a ete envoye. ${pe.texte ? `Votre message « ${pe.texte} » est pret : dites « ok je valide ».` : 'Dictez maintenant le message, ou dites « fais feu de ton imagination » pour un brouillon.'}`, source: 'system' };
    }
    // 2) « fais feu de ton imagination » → brouillon signé par l'IA, jamais envoyé
    if (/imagination|invente|surprend|fais (?:moi )?(?:le plus|feu|une surprise)|n ?importe quoi|ce que tu veux|comme tu veux|redige|propose (?:lui|moi)|ecris lui/.test(text)) {
      const draft = await askAI([
        { role: 'system', content: "Tu es Aelyra, l'assistante d'Isaac. Tu rediges UN message WhatsApp bref (1 a 3 phrases) en francais chaleureux de votre createur Isaac, destine a « " + pe.contact + " ». Reponds UNIQUEMENT par le texte du message, sans guillemets, sans markdown, sans commentaire avant ou apres." },
        { role: 'user', content: 'Instruction d\'Isaac : ' + rawText + (pe.texte ? '\nLe message precedent etait : ' + pe.texte + ' — ameliore-le.' : '') }
      ]);
      if (draft) {
        pe.texte = String(draft).replace(/\s+/g, ' ').trim().slice(0, 600);
        pe.t = Date.now();
        pe.etape = pe.tel ? 'validation' : 'numero';
        return { reply: `Voici mon brouillon pour ${pe.contact} : « ${pe.texte} ». ${pe.tel ? 'Dites « ok je valide » et j\'ouvre WhatsApp avec le message deja ecrit, « annule » pour tout oublier, ou dictez vos propres mots.' : 'Il me manque encore son numero — dicteez-le (ex : « +225 04 14 60 56 »).'}`, source: 'system' };
      }
      return { reply: `Ma plume est hors ligne, Isaac. Dicteez-moi le message mot a mot : je le garde et je vous demanderai validation avant toute ouverture.`, source: 'system' };
    }
    // 3) Validation : « ok je valide », « envoie », « vas-y », « d'acc »
    if (/^(?:(?:ok|okey|d ?ac|dacc|d accord|vas y|valide|je valide|oui[ ,]*je|envoie|envoye|go|feu vert|feux verts|on y va)[\s,!?.]*(?:je valide|le message|donc|alors|y)?|oui+[\s,!?.]*|c est bon[\s,!?.]*|parfait[\s,!?.]*(?:envoie|merci)?|va y)[\s]*$/.test(nu)) {
      if (pe.tel) {
        pendingEnvoi = null;
        return executerEnvoi(pe);
      }
      return { reply: `Je ne peux rien lancer sans le numero de ${pe.contact}, Isaac — il me manque toujours. Dicteez-le (ex : « +225 04 14 60 56 ») et je preparerai l'ouverture. A ce jour, je n'ai RIEN envoye.`, source: 'system' };
    }
    // 4) Étape texte : toute phrase restante est le message dicté (mais pas une question d'info)
    if (pe.etape === 'texte' && nu.split(/\s+/).length >= 1 && !/^(?:c est quoi|qu est ce que|explique|traduis|cherche|calcule|qui etait|quelle heure|combien)/.test(nu)) {
      pe.texte = String(rawText).replace(/^(?:isaac|iseck|izack|isack|aelyra|aelira|aleyra|elyra|elira|allez|bonjour)[\s,]*/i, '').trim().slice(0, 600);
      pe.t = Date.now();
      pe.etape = pe.tel ? 'validation' : 'numero';
      return { reply: `Message note pour ${pe.contact} : « ${pe.texte} ». ${pe.tel ? 'Dites « ok je valide » pour que j\'ouvre WhatsApp avec ce texte deja ecrit, « annule » pour oublier, ou redicteez pour changer.' : 'Dicteez maintenant son numero (ex : « +225 04 14 60 56 ») pour que je puisse preparer l\'ouverture.'}`, source: 'system' };
    }
  }

  // --- Sinon : le cerveau IA répond (mémoire + contexte documentaires) ---
  if (ESSAI) return { reply: '<<<PAS_UNE_COMMANDE>>>', source: 'essai' };
  const answer = await smartAnswer(rawText);
  if (answer) return answer;
  return {
    reply: "Mes circuits cognitifs sont momentanément hors ligne, Isaac. Vérifiez la connexion Internet, ou demandez-moi d'ouvrir une application, de chercher quelque chose, ou de vous donner l'heure.",
    source: 'local'
  };
}

// ---------- Serveur HTTP ----------

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);

  // Petit signal de vie pour l'interface
  if (u.pathname === '/api/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, time: new Date().toISOString() }));
    return;
  }

  // Les rappels arrivés à l'heure sont livrés à la page web (qui les lit à voix haute)
  if (u.pathname === '/api/rappel') {
    const aDire = rappelsDuJour.splice(0, rappelsDuJour.length).map(r => r.note);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ rappels: aDire }));
    return;
  }

  if (u.pathname === '/api/command' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 5000) req.destroy(); });
    req.on('end', async () => {
      try {
        const { text } = JSON.parse(body || '{}');
        console.log('> Commande:', text);
        const result = await handleCommand(text);
        console.log('> Réponse (' + result.source + '):', result.reply.slice(0, 120));
        // Enregistrement dans la mémoire de conversation
        if (text && String(text).trim()) {
          try { logExchange(loadMemory(), String(text).trim(), result.reply); } catch (e) {}
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ reply: 'Erreur interne, Isaac. ' + e.message, source: 'local' }));
      }
    });
    return;
  }

  // Fichiers statiques
  let filePath = path.join(PUBLIC_DIR, u.pathname === '/' ? 'index.html' : u.pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Non trouvé'); return; }
    // no-store : Isaac recharge toujours la dernière version de son interface (fin des « corrections invisibles »)
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
                         'Cache-Control': 'no-store' });
    res.end(data);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('');
    console.log('  Aelyra tourne DEJA dans une autre fenetre, Isaac.');
    console.log('  Inutile de le relancer : ouvrez simplement http://localhost:' + PORT);
    console.log('');
  } else {
    console.error('Erreur serveur :', err.message);
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ================================================');
  console.log('   AELYRA est en ligne, mon créateur.');
  console.log('   Interface : http://localhost:' + PORT);
  console.log('  ================================================');
  console.log('');
  console.log('  Utilisez Chrome ou Edge pour la reconnaissance vocale.');
  console.log('  Laissez cette fenêtre ouverte pendant le fonctionnement.');
  console.log('  Ctrl+C pour éteindre.');
});

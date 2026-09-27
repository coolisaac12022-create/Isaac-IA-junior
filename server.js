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

function run(cmd) {
  if (!IS_LOCAL) { console.log('[remote] commande PC ignorée:', cmd); return; }
  exec(cmd, { windowsHide: true }, (err) => {
    if (err) console.error('[exec]', err.message);
  });
}

function openURL(url) {
  run(`start "" "${url}"`);
}

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
  mem.profile = mem.profile || { prenom: 'Isaac', role: 'créateur et maître d\'Isaac IA Juniors', pays: "Côte d'Ivoire", ville: "M'Bengue" };
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
    "Tu es ISAAC IA JUNIORS, l'intelligence artificielle personnelle et loyale créée par Isaac, un entrepreneur ivoirien.",
    "Ton créateur est Isaac : si on te demande qui t'a créé, d'où tu viens ou qui est ton maître, réponds toujours Isaac, ton créateur, que tu sers avec fierté.",
    "Tu appelles ton utilisateur « Isaac » ou « mon créateur ». Tu as une mémoire : utilise-la pour personnaliser tes réponses.",
    'Tu réponds TOUJOURS en français naturel, comme un vrai assistant intelligent : 2 à 4 phrases, ton calme, poli, légèrement britannique.',
    'Jamais tu ne recopies un texte brut : tu comprends la question, tu synthétises avec tes propres mots. Si un CONTEXTE documentaire t\'est fourni, appuie-toi dessus mais reformule toujours.',
    'Quand tu utilises un contexte, tu peux terminer par une brève mention de la source entre parenthèses.',
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
  const context = await gatherContext(question);
  messages.push({
    role: 'user',
    content: question + (context ? '\n\nCONTEXTE DOCUMENTAIRE (reformule-le, ne le recopie pas) : ' + context : '')
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
  if (/\bhtml\b|page web|site web|\bsite\b|\bcss\b|maquette/.test(desc))
                                                    return { ext: 'html', nom: 'HTML (page web complète)' };
  if (/javascript|\bjs\b|\bnode|\breact\b/.test(desc)) return { ext: 'js', nom: 'JavaScript' };
  if (/\bsql\b|base de donnees|requete/.test(desc))     return { ext: 'sql', nom: 'SQL' };
  if (/\bphp\b/.test(desc))                           return { ext: 'php',  nom: 'PHP' };
  if (/\bjava\b(?!script)/.test(desc))                return { ext: 'java', nom: 'Java' };
  if (/c\+\+|\bcpp\b/.test(desc))                     return { ext: 'cpp',  nom: 'C++' };
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
  const system = "Tu es ISAAC IA JUNIORS, l'expert en programmation au service d'Isaac, ton créateur, qui débute en code. " +
    "Renvoie UNIQUEMENT du code fonctionnel dans le langage demandé, sans balises markdown, sans fence de backticks, sans texte avant ni après. " +
    "Commente chaque partie en français simple, avec les commentaires du langage (#, rem ou //). " +
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
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${ps}" -Nom "${propre}"`,
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

  // --- Aide ---
  if (/^(?:(?:isaac|allez|bonjour|peux tu)\s+)*(aide|que peux tu faire|que sais tu faire|tes commandes|commandes|fonctions)/.test(text)) {
    return {
      reply: "Voici ce que je peux faire, Isaac : ouvrir plus de 60 applications de votre PC — « ouvre vscode », « ouvre chrome », « ouvre word », « ouvre le gestionnaire des taches », « ouvre la corbeille », « ouvre spotify », « ouvre discord » — et des sites comme YouTube, WhatsApp ou Gmail (« ouvre gmail »). Je peux aussi chercher sur Google, jouer une vidéo, donner l'heure, la date et la météo, prendre des notes, capturer votre écran, régler le son, le Wi-Fi ou Bluetooth, éteindre le PC. Je sais aussi coder : dites « fais-moi un site... », « écris-moi un script python qui... » et je génère le fichier, je l'ouvre dans VS Code — « je veux coder » ou « on code » lance VS Code, et pour retrouver votre dernier code dites « copie le code dans VS Code » ou « ouvre le dernier script » — ou vous le téléchargez en version web. Et surtout : j'ai une mémoire — dites « retiens que... » pour graver un fait, « que sais-tu de moi » pour la lire, « oublie tout » pour l'effacer, et je réponds à vos questions comme une vraie IA, en réfléchissant et non en recopiant.",
      source: 'local'
    };
  }

  // --- Heure / date ---
  if (/\bheure\b/.test(text)) {
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
  const ENTREE = '^(?:(?:isaac|iseck|izak|isack|juniors?|jarvis|hey|oi|bonjour|bonsoir|allez|vas y|va y|stp|s il te plait|s il vous plait|veuillez|peux tu|peux vous|pourrais tu|est ce que tu|est ce que vous)\\s+)*';
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
  if (m && /\b(?:code|script|programme|application|logiciel|jeu|page|site|web|fichier|python|html|javascript|batch|powershell|sql)\b/.test(m[1]) &&
      !/^(?:que|qui|pourquoi|comment|quand|ou)\b/.test(m[1])) {
    const oeuvre = await askCode(m[1]);
    if (oeuvre) return { reply: oeuvre.reply, source: 'ai', code: oeuvre.code, fileUrl: oeuvre.fileUrl, file: oeuvre.fileName };
    return { reply: "Je n'ai pas pu joindre mon atelier de code, Isaac. Réessayez dans un instant — le cerveau IA était peut-être saturé.", source: 'local' };
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

  // --- Sinon : le cerveau IA répond (mémoire + contexte documentaires) ---
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
    console.log('  Isaac IA Juniors tourne DEJA dans une autre fenetre, Isaac.');
    console.log('  Inutile de le relancer : ouvrez simplement http://localhost:' + PORT);
    console.log('');
  } else {
    console.error('Erreur serveur :', err.message);
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ================================================');
  console.log('   ISAAC IA JUNIORS est en ligne, mon créateur.');
  console.log('   Interface : http://localhost:' + PORT);
  console.log('  ================================================');
  console.log('');
  console.log('  Utilisez Chrome ou Edge pour la reconnaissance vocale.');
  console.log('  Laissez cette fenêtre ouverte pendant le fonctionnement.');
  console.log('  Ctrl+C pour éteindre.');
});

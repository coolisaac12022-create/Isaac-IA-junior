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
    if (c && c.trim().length > 1 && !/^\s*[[{]/.test(c)) return c.trim().replace(/\s*\n+\s*/g, ' ').slice(0, 700);
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
      const text = Array.isArray(parts) ? parts.map(p => p.text || '').join(' ').trim() : '';
      if (text.length > 1) return text.replace(/\s*\n+\s*/g, ' ').slice(0, 700);
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
  if (ai) return { reply: ai, source: 'ai' };
  // IA morte : au moins donner l'information brute
  const wiki = await askWikipedia(question);
  if (wiki) return { reply: wiki, source: 'ai' };
  return null;
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
  'terminal': 'start cmd',
  'cmd': 'start cmd',
  'invite de commande': 'start cmd',
  'paint': 'mspaint',
  'peinture': 'mspaint',
  'word': 'start winword',
  'excel': 'start excel',
  'parametres': 'start ms-settings:',
  'bluetooth': 'start ms-settings:bluetooth',
  'wifi': 'start ms-settings:network-wifi',
  'reseau': 'start ms-settings:network',
  'notifications': 'start ms-settings:notifications',
  'applications installees': 'start ms-settings:appsfeatures',
  'spotify': 'start spotify:',
  'telechargements': 'explorer shell:Downloads',
  'bureau': 'explorer shell:Desktop'
};

const BLAGUES = [
  "Pourquoi les plongeurs plongent-ils toujours en arrière ? Parce que sinon, ils tombent dans le bateau.",
  "Que dit une imprimante dans l'eau ? J'ai papier !",
  "Pourquoi les robots ne prennent-ils jamais de vacances ? Parce qu'ils ont trop de circuits courts.",
  "Quel est le comble pour un électricien ? De ne pas être au courant.",
  "Je raconterais bien une blague sur l'UDP, mais vous ne la recevriez peut-être pas."
];

async function handleCommand(rawText) {
  const text = normalize(rawText);
  if (!text) return { reply: "Je n'ai rien entendu, Isaac. Pouvez-vous répéter ?", source: 'local' };

  // --- Aide ---
  if (/^(aide|que peux tu faire|que sais tu faire|tes commandes|commandes|fonctions)/.test(text)) {
    return {
      reply: "Voici ce que je peux faire, Isaac : ouvrir des applications et des sites (YouTube, WhatsApp, calculatrice...), chercher sur Google, jouer une vidéo, donner l'heure, la date et la météo, prendre des notes, capturer votre écran, ouvrir Bluetooth ou Wi-Fi, éteindre le PC. Et surtout : j'ai une mémoire — dites « retiens que... » pour graver un fait, « que sais-tu de moi » pour la lire, « oublie tout » pour l'effacer, et je réponds à vos questions comme une vraie IA, en réfléchissant et non en recopiant.",
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
    return { reply: `Je cherche « ${m[1]} » sur YouTube, Isaac. Bon visionnage.`, source: 'system',
             open: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(m[1]) };
  }

  // --- Ouvrir un site ou une application ---
  m = text.match(/^(?:ouvre|ouvrir|lance|lancer|va sur|allez sur|vas sur)\s+(.+)/);
  if (m) {
    const target = m[1].trim();
    for (const [key, url] of Object.entries(SITES)) {
      if (target === key || target.includes(key)) {
        return { reply: `J'ouvre ${key}, Isaac.`, source: 'system', open: url };
      }
    }
    for (const [key, cmd] of Object.entries(APPS)) {
      if (target === key || target.includes(key)) {
        if (!IS_LOCAL) return { reply: `« ${key} » est une application de votre PC, Isaac : je ne peux la lancer que lorsque je tourne en local sur votre machine (ISAAC-IJ.bat). En version web, je peux ouvrir des sites, discuter, donner la météo et bien plus.`, source: 'system' };
        run(cmd);
        return { reply: `J'ouvre ${key}, Isaac.`, source: 'system' };
      }
    }
    // Peut-être un nom de domaine direct
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(target.replace(/\s/g, ''))) {
      return { reply: `J'ouvre le site ${target}, Isaac.`, source: 'system', open: 'https://' + target.replace(/\s/g, '') };
    }
    return { reply: `Je ne connais pas « ${target} » directement, alors je le recherche sur Google, Isaac.`, source: 'system',
             open: 'https://www.google.com/search?q=' + encodeURIComponent(target) };
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
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
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

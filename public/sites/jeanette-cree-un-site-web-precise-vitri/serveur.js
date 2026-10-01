'use strict';
// ============================================================
//  SERVEUR — la CUISINE de ce site (backend + base SQL + comptes)
//  Livré par Jeanette. Zéro installation : Node.js suffit.
//  Démarrer : double-cliquez demarrer.bat, puis ouvrez http://localhost:3830
// ============================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

// --- Configuration (les secrets vivent dans .env, jamais dans le code) ---
const env = { PORT: 3830, ADMIN_KEY: '' };
try {
  for (const ligne of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m) env[m[1]] = m[2];
  }
} catch (e) { console.log('[env] .env absent : valeurs par defaut.'); }
const PORT = Number(env.PORT) || 3830;

// --- Base de données SQL (le stock : messages + utilisateurs + jetons) ---
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
const db = new DatabaseSync(path.join(__dirname, 'data', 'stock.db'));
db.exec('CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT, email TEXT, texte TEXT, recu_le INTEGER);' +
        'CREATE TABLE IF NOT EXISTS utilisateurs (pseudo TEXT PRIMARY KEY, sel TEXT, hachage TEXT, cree_le INTEGER);' +
        'CREATE TABLE IF NOT EXISTS jetons (jeton TEXT PRIMARY KEY, pseudo TEXT, cree_le INTEGER);');

// --- Aides : rien ne rentre sans être vérifié ---
function chaine(v, min, max) { if (typeof v !== 'string') return null; const s = v.trim(); return (s.length >= min && s.length <= max) ? s : null; }
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function hacher(mdp, sel) { return crypto.scryptSync(mdp, sel, 64).toString('hex'); }
function verifierMdp(mdp, sel, hachage) {
  const a = Buffer.from(hacher(mdp, sel), 'hex'), b = Buffer.from(hachage, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function corpsJson(req) {
  return new Promise((res, rej) => {
    let data = '', taille = 0;
    req.on('data', c => { taille += c.length; if (taille > 20000) { rej(new Error('corps trop lourd')); req.destroy(); } data += c; });
    req.on('end', () => { try { res(data ? JSON.parse(data) : {}); } catch (e) { rej(new Error('JSON invalide')); } });
    req.on('error', rej);
  });
}
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(obj)); }
function quiEstLa(req) {
  const t = (req.headers['x-jeton'] || '').trim();
  if (!t) return null;
  const r = db.prepare('SELECT pseudo FROM jetons WHERE jeton=? AND cree_le>?').get(t, Date.now() - 7 * 86400000);
  return r ? r.pseudo : null;
}
function nouveauJeton(pseudo) {
  const jeton = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO jetons (jeton, pseudo, cree_le) VALUES (?,?,?)').run(jeton, pseudo, Date.now());
  return jeton;
}

// --- Le serveur : API d'abord, puis les fichiers de la salle ---
const serveur = http.createServer(async (req, res) => {
  const p = new URL(req.url, 'http://localhost').pathname;
  try {
    if (p === '/api/sante') return json(res, 200, { ok: true });

    if (p === '/api/contact' && req.method === 'POST') {
      const b = await corpsJson(req);
      const nom = chaine(b.nom, 2, 40), email = chaine(b.email, 6, 80), texte = chaine(b.texte, 5, 1200);
      if (!nom || !email || !texte || !EMAIL_OK.test(email)) return json(res, 400, { erreur: 'Nom (2+), email valide et message (5+) sont obligatoires.' });
      db.prepare('INSERT INTO messages (nom, email, texte, recu_le) VALUES (?,?,?,?)').run(nom, email, texte, Date.now());
      return json(res, 200, { ok: true, merci: 'Message enregistré dans la base du site.' });
    }

    if (p === '/api/inscription' && req.method === 'POST') {
      const b = await corpsJson(req);
      const pseudo = chaine(b.pseudo, 3, 20), mdp = chaine(b.motdepasse, 6, 100);
      if (!pseudo || !mdp) return json(res, 400, { erreur: 'Pseudo (3 à 20) et mot de passe (6 minimum) obligatoires.' });
      if (db.prepare('SELECT pseudo FROM utilisateurs WHERE pseudo=?').get(pseudo)) return json(res, 409, { erreur: 'Ce pseudo est déjà pris.' });
      const sel = crypto.randomBytes(16).toString('hex');
      db.prepare('INSERT INTO utilisateurs (pseudo, sel, hachage, cree_le) VALUES (?,?,?,?)').run(pseudo, sel, hacher(mdp, sel), Date.now());
      return json(res, 200, { ok: true, pseudo, jeton: nouveauJeton(pseudo) });
    }

    if (p === '/api/connexion' && req.method === 'POST') {
      const b = await corpsJson(req);
      const pseudo = chaine(b.pseudo, 3, 20), mdp = chaine(b.motdepasse, 1, 100);
      if (!pseudo || !mdp) return json(res, 400, { erreur: 'Pseudo et mot de passe obligatoires.' });
      const u = db.prepare('SELECT * FROM utilisateurs WHERE pseudo=?').get(pseudo);
      if (!u || !verifierMdp(mdp, u.sel, u.hachage)) return json(res, 401, { erreur: 'Pseudo ou mot de passe incorrect.' });
      return json(res, 200, { ok: true, pseudo, jeton: nouveauJeton(pseudo) });
    }

    if (p === '/api/messages' && req.method === 'GET') {
      if (!env.ADMIN_KEY || (req.headers['x-admin'] || '') !== env.ADMIN_KEY) return json(res, 403, { erreur: 'Cle administrateur manquante ou fausse.' });
      return json(res, 200, { messages: db.prepare('SELECT id, nom, email, texte, recu_le FROM messages ORDER BY id DESC LIMIT 100').all() });
    }

    // Fichiers de la salle (frontend)
    let fichier = p === '/' ? '/index.html' : p;
    const cible = path.normalize(path.join(__dirname, fichier));
    if (!cible.startsWith(__dirname)) return json(res, 403, { erreur: 'interdit' });
    if (!fs.existsSync(cible) || !fs.statSync(cible).isFile()) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
    }
    const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(cible)] || 'application/octet-stream' });
    res.end(fs.readFileSync(cible));
  } catch (e) { json(res, 400, { erreur: 'Requête refusée : ' + e.message }); }
});
serveur.on('error', (e) => { console.log(e.code === 'EADDRINUSE' ? '[ERREUR] Port ' + PORT + ' deja pris, fermez une autre fenetre du site.' : '[ERREUR] ' + e.message); process.exit(1); });
serveur.listen(PORT, '127.0.0.1', () => {
  console.log('==================================================');
  console.log('  Site Jeanette EN LIGNE chez vous : http://localhost:' + PORT);
  console.log('  Base de données : data/stock.db — Arrêt : fermer la fenêtre');
  console.log('==================================================');
});

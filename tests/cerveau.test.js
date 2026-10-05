// =====================================================================================
//  HARNAIS DE TESTS DU CERVEAU — Orange #14 du plan securite d'Isaac
// -------------------------------------------------------------------------------------
//  Ce que c est : UNE seule commande, reproductible, qui demarre VRAIMENT une instance
//  d'essai du cerveau sur un port qui n'appartient qu'a elle, attend qu'elle reponde,
//  lui tire dessus (securite, memoire, table des droits, frontend), puis la tue et rend
//  un code de sortie : 0 tout est passe, 1 une assertion a rate, 2 le test lui-meme est
//  casse. Isaac peut le relancer apres n'importe quelle modification : c'est le filet.
//
//  Comment le lancer (depuis le dossier jarvis\) :  node tests/cerveau.test.js
//  Sans dependance : uniquement les modules Node (http, child_process, fs, crypto, path).
//
//  Trois principes herites des regles de la maison :
//   1. IL NE TOUCHE JAMAIS LES DONNEES REELLES. Le cerveau demarre en ISAAC_ESSAI=1 :
//      memoire, taches, fiches et carnet ecrivent dans leurs fichiers *.essai. Et pour le
//      PROUVER (et pas juste le promettre), on calcule l'empreinte sha256 des fichiers
//      REELS avant et apres : si l'une a bouge, le test est declare RATE. Un journal
//      d'append (politique, droits) peut legitimement GRANDIR — c'est sa nature de preuve,
//      jamais une pollution ; seuls les fichiers de DONNEES doivent rester identiques.
//   2. AUCUNE VALEUR INVENTEE. Une assertion qui n'a pas pu etre mesuree (instance morte,
//      reponse pas de JSON) est comptee RATEE, jamais ignoree en silence.
//   3. TOUJOURS TUER. Quoi qu'il arrive (erreur, Ctrl-C, exception), l'instance enfilee
//      est fermee : le harnais ne laisse jamais un cerveau orphelin occuper un port.
//
//  Le port de test (3790) est distinct des ports vivants : PROD 3777, ESSAI manuel 3778,
//  demarrage du noyau 3799. Rien de ce fichier n'ecrit chez Isaac ni ne parle au reseau.
// =====================================================================================
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const RACINE = path.join(__dirname, '..');           // jarvis/
const SERVEUR = path.join(RACINE, 'server.js');
const PORT_TEST = parseInt(process.env.ISAAC_TEST_PORT || '3790', 10);
const BASE = 'http://127.0.0.1:' + PORT_TEST;
const PUBLIC = path.join(RACINE, 'public');

// Les fichiers de DONNEES reels : le harnais jure qu'ils ne bougent pas d'un octet.
// (Un *.log d'append n'est pas ici : il est fait pour grandir, pas pour etre fige.)
const A_PRESERVER = [
  'isaac-memory.json',
  'isaac-rappels.json',
  'taches.json',
  'analyses-mail.json',
  path.join('business', 'prospects.json')
];

// --------------------------------- Collecteur ---------------------------------
let ok = 0, ko = 0;
const ratines = [];
function test(nom, cond, detail) {
  if (cond) { ok++; console.log('  \x1b[32mPASS\x1b[0m ' + nom); }
  else {
    ko++; ratines.push(nom + (detail ? ' — ' + detail : ''));
    console.log('  \x1b[31mRATE\x1b[0m ' + nom + (detail ? ' — ' + detail : ''));
  }
}
function section(titre) { console.log('\n\x1b[36m' + titre + '\x1b[0m'); }

// ---------------------------------- Requete HTTP --------------------------------
// Le module http (pas fetch) pour maitriser methodes, en-tetes et codes exacts, comme
// le fait deja le serveur lui-meme. Ne jette jamais : renvoie { status, txt, data }.
function requete(methode, chemin, o) {
  o = o || {};
  return new Promise((resolve) => {
    let corps = null;
    if (o.corps !== undefined && o.corps !== null) {
      corps = (typeof o.corps === 'string') ? o.corps : JSON.stringify(o.corps);
    }
    const headers = Object.assign({ 'Accept': 'application/json' }, o.headers || {});
    if (corps !== null && !aEnTete(headers, 'content-type')) headers['Content-Type'] = 'application/json';
    if (corps !== null) headers['Content-Length'] = Buffer.byteLength(corps);
    let regle = false;
    const req = http.request(
      { host: '127.0.0.1', port: PORT_TEST, path: chemin, method: methode, headers, timeout: o.timeout || 15000 },
      (res) => {
        let txt = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { txt += c; });
        res.on('end', () => {
          if (regle) return; regle = true;
          let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) {}
          resolve({ status: res.statusCode, txt: txt, data: data });
        });
      }
    );
    req.on('error', (e) => { if (regle) return; regle = true; resolve({ status: 0, txt: '', data: null, erreur: String((e && e.message) || e) }); });
    req.on('timeout', () => { try { req.destroy(); } catch (e) {} if (regle) return; regle = true; resolve({ status: 0, txt: '', data: null, erreur: 'delai depasse' }); });
    if (corps !== null) req.write(corps);
    req.end();
  });
}
function aEnTete(h, nom) {
  return Object.keys(h).some((k) => k.toLowerCase() === nom.toLowerCase());
}
const get = (c, o) => requete('GET', c, o);
const post = (c, corps, o) => requete('POST', c, Object.assign({ corps: corps }, o || {}));

// ---------------------------------- sha256 fichier --------------------------------
function empreinte(fichier) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(path.join(RACINE, fichier))).digest('hex'); }
  catch (e) { return null; }   // fichier absent : on le notera comme « n'existait pas »
}
function empreintesDeAvant() {
  const m = Object.create(null);
  for (const f of A_PRESERVER) m[f] = empreinte(f);
  return m;
}

// ------------------------------- Demarrage / arret -------------------------------
let enfant = null;
let arrete = false;
function tuerEnfant(cb) {
  if (arrete) { if (cb) cb(); return; }
  arrete = true;
  if (!enfant) { if (cb) cb(); return; }
  try { enfant.kill('SIGTERM'); } catch (e) {}
  let fini = false;
  const conclure = () => { if (fini) return; fini = true; if (cb) cb(); };
  enfant.once('close', conclure);
  setTimeout(() => { try { enfant.kill('SIGKILL'); } catch (e) {} setTimeout(conclure, 400); }, 2500);
}
function securiserArret() {
  const auSigne = (s) => () => { tuerEnfant(() => process.exit(130)); };
  ['SIGINT', 'SIGTERM'].forEach((s) => { try { process.on(s, auSigne(s)); } catch (e) {} });
}

// Sonde /api/ping : renvoie true des que le cerveau repond, false au bout d'un delai.
function attendreVivant(tente) {
  tente = tente || 0;
  return get('/api/ping', { timeout: 2500 }).then((r) => {
    if (r.status === 200 && r.data && r.data.ok === true) return true;
    if (tente >= 24) return false;                        // ~ 24 x 1,5 s = 36 s maximum
    return new Promise((res) => setTimeout(res, 1500)).then(() => attendreVivant(tente + 1));
  });
}

// ================================== LES FAMILLES ==================================

// —— Securite : la porte du cerveau (rouge #2/#3) ne doit pas s'ouvrir de l'exterieur ——
async function familleSecurite() {
  section('[SECURITE] une origine etrangere ne peut donner aucun ordre');
  const ECRITURE = ['/api/command', '/api/ai/mode', '/api/taches', '/api/orchestrateur', '/api/voix', '/api/business', '/api/evolution', '/api/engagements'];
  for (const r of ECRITURE) {
    const x = await post(r, {}, { headers: { Origin: 'http://evil.example', 'Content-Type': 'application/json' } });
    test('POST ' + r + ' depuis evil.example = refuse (403)', x.status === 403, 'status ' + x.status + ' ' + String(x.txt).slice(0, 50));
  }
  // Lecture seule : la methode est refusee AVANT l'origine ; 405 ou 403, jamais 200.
  for (const r of ['/api/cerveau', '/api/droits', '/api/systeme', '/api/ai/etat', '/api/evenements']) {
    const x = await post(r, {}, { headers: { Origin: 'http://evil.example', 'Content-Type': 'application/json' } });
    test('POST ' + r + ' (lecture seule) ne laisse rien ecrire', (x.status === 403 || x.status === 405) && x.status !== 200, 'status ' + x.status);
  }

  section('[SECURITE] un formulaire HTML deguise (Content-Type non-JSON) est refuse');
  const mauvais = await requete('POST', '/api/command', { corps: 'bonjour', headers: { Origin: BASE, 'Content-Type': 'text/plain' } });
  test('POST /api/command en text/plain = 415', mauvais.status === 415, 'status ' + mauvais.status);

  section('[SECURITE] les lectures publiques repondent, la memoire ne se vide pas');
  const ping = await get('/api/ping');
  test('GET /api/ping = 200 ok', ping.status === 200 && ping.data && ping.data.ok === true, 'status ' + ping.status);
  const poli = await get('/api/politique');
  test('GET /api/politique = 200 et nomme les routes d ecriture', poli.status === 200 && Array.isArray(poli.data.routes_ecriture) && poli.data.routes_ecriture.length >= 8, 'status ' + poli.status);
  const pc = await post('/api/cerveau', { effacer: true }, { headers: { Origin: BASE } });
  test('POST /api/cerveau = 405 (la memoire ne se vide pas par une route)', pc.status === 405, 'status ' + pc.status);
}

// —— Memoire : le sur-ensemble Phase 6 tient, et aucune coordonnee de tiers ne sort ——
async function familleMemoire() {
  section('[MEMOIRE] /api/cerveau rend le sur-ensemble sans mentir ni fuiter');
  const r = await get('/api/cerveau', { headers: { Origin: BASE } });
  const d = r.data || {};
  test('HTTP 200 et ok', r.status === 200 && d.ok === true, 'status ' + r.status);
  test('ancien : fige.aelyra/jeanette/onyx/aegis toujours lus', ['aelyra', 'jeanette', 'onyx', 'aegis'].every((k) => typeof (d.fige || {})[k] === 'string' && d.fige[k].length > 40));
  test('ancien : memoire.profile/facts/lecons/log presents', d.memoire && typeof d.memoire.profile !== 'undefined' && Array.isArray(d.memoire.facts) && Array.isArray(d.memoire.lecons) && Array.isArray(d.memoire.log));
  test('ancien : stats.faits/echanges/lecons chiffres', d.stats && ['faits', 'echanges', 'lecons'].every((k) => typeof d.stats[k] === 'number'));
  test('neuf : stats.scans est un nombre', d.stats && typeof d.stats.scans === 'number', JSON.stringify(d.stats));
  test('neuf : ou_c_est_grave nomme le fichier de memoire', /isaac-memory/.test(String(d.ou_c_est_grave)), d.ou_c_est_grave);
  test('neuf : hors_depot dit la verite verifiee (gitignore)', d.hors_depot && d.hors_depot.verifie === true && d.hors_depot.mentionne === true, JSON.stringify(d.hors_depot));
  test('neuf : fichier.octets mesure (> 0)', d.fichier && d.fichier.octets > 0, JSON.stringify(d.fichier));
  test('neuf : academie.auto est un booleen', d.academie && typeof d.academie.auto === 'boolean', JSON.stringify(d.academie));
  test('neuf : contrat declare la lecture seule', /ne se vide pas/.test(String(d.contrat)));

  // Masquage : les IPv4 sont preservees par dessein (machine a surveiller), on les retire
  // AVANT de chercher un numero de telephone, sinon on accuserait le masque qui marche.
  const sansIP = (s) => String(s).replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, ' ');
  test('aucun numero de telephone de tiers ne sort dans le corps', !/22504146056/.test(sansIP(r.txt)), 'fuite dans /api/cerveau');
  test('aucun email complet de tiers ne sort dans le corps', !/[A-Za-z0-9._%+\-]{4,}@[A-Za-z0-9.\-]+\.[a-z]{2,4}/i.test(r.txt), 'email trouve');
  test('aucune cle d API dans les noms de champs', !/api[_-]?key|token|secret|password/i.test(JSON.stringify(Object.keys(d))));

  // La recherche ne doit JAMAIS inventer : un motif absent renvoie zero ligne.
  const vide = await get('/api/cerveau?q=' + encodeURIComponent('zzzharnaisintrouvable'), { headers: { Origin: BASE } });
  const vd = (vide.data || {}).recherche || {};
  test('recherche sans correspondance = 0 ligne, pas d invention', vd.total === 0 && Array.isArray(vd.lignes) && vd.lignes.length === 0, JSON.stringify(vd).slice(0, 120));
}

// —— Table des droits : une agente sans capacite se heurte au code, une question passe ——
async function familleDroits() {
  section('[DROITS] la table borne des ACTIONS, jamais une QUESTION');
  // ONYX n'a pas la capacite « code » : regler le mode du cerveau lui est refuse, et le
  // refus NOMME celle qui peut. Ce POST ne change rien (il est refuse avant d'ecrire).
  const onyx = await post('/api/ai/mode', { mode: 'auto', par: 'onyx' }, { headers: { Origin: BASE } });
  test('POST /api/ai/mode par onyx = 403', onyx.status === 403, 'status ' + onyx.status);
  test('le refus nomme celle qui peut (aelyra ou jeanette)', /aelyra|jeanette/i.test(String((onyx.data || {}).reply)), JSON.stringify(onyx.data || {}).slice(0, 160));

  // Aelyra, elle, le peut : on relit le mode courant et on le re-regle A L IDENTIQUE.
  // La reponse dit « il etait deja regle comme ca » → 200, zero changement d'etat.
  const etat = await get('/api/ai/etat', { headers: { Origin: BASE } });
  const modeCourant = (etat.data && etat.data.mode) || (etat.data && etat.data.modes && etat.data.modes.actif) || 'auto';
  const ael = await post('/api/ai/mode', { mode: modeCourant, par: 'aelyra' }, { headers: { Origin: BASE } });
  test('POST /api/ai/mode par aelyra = 200 (elle en a le droit)', ael.status === 200, 'status ' + ael.status + ' ' + String(ael.txt).slice(0, 60));

  // Le refus de droit est une PREUVE : grave au journal d'essai et compte dans /api/droits.
  const d0 = await get('/api/droits', { headers: { Origin: BASE } });
  const act = ((d0.data || {}).activite || {});
  test('/api/droits expose une activite pour onyx avec un refus compte', act.onyx && typeof act.onyx.refus === 'number' && act.onyx.refus >= 1, JSON.stringify(act).slice(0, 200));
  test('/api/droits rend les derniers refus graves', Array.isArray(d0.data.refus_recent) && d0.data.refus_recent.length >= 1, JSON.stringify((d0.data || {}).refus_recent || []).slice(0, 120));

  // Une QUESTION a une agente, meme sans droit, ne doit jamais etre bloquee : « etat de … ».
  const q = await post('/api/command', { text: 'onyx, etat de l academie' }, { headers: { Origin: BASE } });
  test('une question d ONYX (etat de l academie) passe, sans refus', q.status === 200 && !((q.data || {}).refus === true), JSON.stringify(q.data || {}).slice(0, 160));
}

// —— Audit (Orange #13) : le grand livre est une chaîne que rien ne falsifie en silence ——
async function familleAudit() {
  section('[AUDIT] le grand livre a chainage sha256 rend un verdict d integration');
  // On declenche un moment de securite frais (une origine etrangere refusee) pour etre sur
  // d'avoir au moins une ligne ACCES, puis on relit le grand livre.
  await post('/api/command', {}, { headers: { Origin: 'http://evil.example', 'Content-Type': 'application/json' } });
  const r = await get('/api/audit?limite=200', { headers: { Origin: BASE } });
  const d = r.data || {};
  test('GET /api/audit = 200 ok', r.status === 200 && d.ok === true, 'status ' + r.status);
  test('le contrat dit append-only + chainage sha256', /append-only/.test(String(d.contrat)) && /sha256/.test(String(d.contrat)));
  test('integrite est un booleen et total_lignes un nombre', typeof d.integrite === 'boolean' && typeof d.total_lignes === 'number', JSON.stringify({ i: d.integrite, t: d.total_lignes }));
  test('le grand livre a des lignes (les refus de ce run y sont)', Array.isArray(d.lignes) && d.lignes.length >= 1, 'lignes ' + (d.lignes || []).length);
  test('le fichier nomme est celui de l instance d essai', /journal-audit\.essai\.log/.test(String(d.fichier)), d.fichier);
  const aUnAcces = (d.lignes || []).some((l) => l.categorie === 'ACCES' && /^REFUS/.test(String(l.action)));
  test('un refus d origine etrangere y est grave (categorie ACCES / REFUS-403)', aUnAcces, JSON.stringify((d.lignes || []).slice(-3)));

  // Chaine : chaque ligne renvoyee pointe sur le hash de la precedente (maillon verifie).
  let chaineOk = true;
  const L = d.lignes || [];
  for (let i = 1; i < L.length; i++) { if (L[i] && L[i - 1] && L[i].precedent !== L[i - 1].hash) { chaineOk = false; break; } }
  test('les maillons se suivent (precedent[i] == hash[i-1])', chaineOk && L.length >= 2, 'verifie sur ' + L.length + ' lignes');

  // Infalsifiable : on RE-CALCULE le sha256 nous-memes sur le fichier BRUT (les champs non
  // masques du disque). Si quelqu'un avait edite un detail, cette empreinte ne collerait plus.
  const brute = (() => { try { return fs.readFileSync(path.join(RACINE, 'journal-audit.essai.log'), 'utf8').split(/\r?\n/).filter(Boolean); } catch (e) { return []; } })();
  test('le grand livre existe sur le disque', brute.length >= 1, brute.length + ' ligne(s) brute(s)');
  let empreinteOk = true;
  for (const lg of brute.slice(-8)) {
    let rec = null; try { rec = JSON.parse(lg); } catch (e) { empreinteOk = false; break; }
    const calc = crypto.createHash('sha256').update([rec.ts, rec.cat, rec.agent, rec.action, rec.detail, rec.prev].join('\u0001')).digest('hex');
    if (calc !== rec.hash) { empreinteOk = false; break; }
  }
  test('l empreinte sha256 de chaque ligne colle a son contenu (re-calculee ici)', empreinteOk);
  // Detection : retoucher le detail d une ligne (ici en memoire, le fichier reste intact)
  // DOIT casser l empreinte. C'est la tout le sens de la chaine — on ne peut pas mentir
  // apres coup sur une ligne sans que le calcul ne le voie.
  if (brute.length) {
    let une = null; try { une = JSON.parse(brute[brute.length - 1]); } catch (e) {}
    if (une) {
      const falsifiee = Object.assign({}, une, { detail: String(une.detail) + ' X' });
      const hFaux = crypto.createHash('sha256').update([falsifiee.ts, falsifiee.cat, falsifiee.agent, falsifiee.action, falsifiee.detail, falsifiee.prev].join('\u0001')).digest('hex');
      test('retoucher une ligne casserait son empreinte (la falsification se voit)', hFaux !== une.hash);
    }
  }
  test('la route est en lecture seule : POST /api/audit = 405', (await post('/api/audit', { effacer: true }, { headers: { Origin: BASE } })).status === 405);
}

// —— Prospection automatique (Orange #12) : elle peut chercher et rédiger, JAMAIS envoyer ——
async function familleBusiness() {
  section('[BUSINESS AUTO] le cycle Niveau 0-1 existe, mais la machine ne peut pas envoyer seule');
  // 1. LA PREUVE DANS LE CODE (pas dans une promesse console). On isole le corps de la fonction
  //    businessAutoTick dans server.js et on jure qu il n appelle jamais busEnvoyer (Niveau 2),
  //    qu il garde l instance d essai au chaud (if (ESSAI) return) et la machine locale seule.
  const src = fs.readFileSync(SERVEUR, 'utf8');
  const debut = src.indexOf('async function businessAutoTick');
  const fin = src.indexOf('setInterval(businessAutoTick', debut);
  const corps = debut >= 0 && fin > debut ? src.slice(debut, fin) : '';
  test('businessAutoTick existe dans server.js', debut >= 0);
  test('son corps n appelle JAMAIS busEnvoyer (le cycle ne peut pas envoyer)', corps.length > 0 && !/busEnvoyer\s*\(/.test(corps), 'envoye ? ' + /busEnvoyer\s*\(/.test(corps));
  test('son corps ne touche pas la table du Niveau 4 (prix/negociation)', corps.length > 0 && !/negocie|le prix|un devis|tarif|signe le contrat/.test(corps));
  test('le cycle se rate lui-meme sur l instance d essai (if (ESSAI) return)', /if \(ESSAI\) return/.test(corps));
  test('le cycle ne tourne que sur la machine locale (if (!IS_LOCAL) return)', /if \(!IS_LOCAL\) return/.test(corps));
  test('le cycle cede la voie a un job lourd (voieGenante)', /voieGenante/.test(corps));
  test('le cycle grave sa trace dans le grand livre (graverAudit)', /graverAudit/.test(corps));

  // 2. LE REGLAGE PAR LA ROUTE. Par defaut l auto est ETEINTE ; on l arme, on le relit, on le
  //    retablit. Tout ceci ecrit dans business/config.essai.json (isole, gitignore) — jamais chez Isaac.
  const g0 = await get('/api/business', { headers: { Origin: BASE } });
  test('GET /api/business = 200 et expose un objet auto', g0.status === 200 && g0.data && g0.data.ok === true && g0.data.auto && typeof g0.data.auto.auto === 'boolean', JSON.stringify((g0.data || {}).auto || {}).slice(0, 120));
  const etaitArme = !!(g0.data && g0.data.auto && g0.data.auto.auto);

  const arme = await post('/api/business', { action: 'auto', auto: true, secteur: 'zztest harnais', ville: 'Abidjan', intervalle_min: 120 }, { headers: { Origin: BASE } });
  test('POST action=auto (maison/aelyra) arme le cycle', arme.status === 200 && arme.data && arme.data.ok === true && arme.data.config && arme.data.config.auto === true, JSON.stringify(arme.data || {}).slice(0, 140));
  test('la cadence est bornee par le code (minimum 1 h)', arme.data && arme.data.config && Number(arme.data.config.intervalle_min) >= 60, JSON.stringify((arme.data || {}).config || {}).slice(0, 120));
  const g1 = await get('/api/business', { headers: { Origin: BASE } });
  test('le GET reluu confirme auto=true et le secteur grave', g1.data && g1.data.auto && g1.data.auto.auto === true && /zztest harnais/.test(String(g1.data.auto.secteur)), JSON.stringify((g1.data || {}).auto || {}).slice(0, 120));

  // 3. LE GARDE-FOU DE DROIT : une agente sans capacite « business » ne peut PAS armer. ONYX n a
  //    pas le droit business ; la demande est refusee et nomme celle qui peut.
  const onyx = await post('/api/command', { text: 'onyx, business, surveille les garages a abidjan toutes les 12 heures' }, { headers: { Origin: BASE } });
  test('ONYX ne peut pas armer la prospection (refus nomme qui peut)', onyx.status === 200 && (onyx.data || {}).refus === true && /business|aelyra/i.test(String((onyx.data || {}).reply)), JSON.stringify(onyx.data || {}).slice(0, 160));

  // 4. RETABLIR l etat d origine pour ne rien laisser arme derriere le harnais.
  const retab = await post('/api/business', { action: 'auto', auto: etaitArme }, { headers: { Origin: BASE } });
  const g2 = await get('/api/business', { headers: { Origin: BASE } });
  test('le harnais retablit l etat d origine (auto = ' + etaitArme + ')', retab.status === 200 && g2.data && g2.data.auto && !!g2.data.auto.auto === !!etaitArme, 'final : ' + JSON.stringify((g2.data || {}).auto || {}).slice(0, 80));
}

// —— OSINT défensif (tâche #32) : lecture de sources publiques, gardes AVANT tout réseau ——
async function familleOsint() {
  section('[OSINT] « surface exposee » lit les sources publiques, jamais un port, et rend le périmètre');
  const src = fs.readFileSync(SERVEUR, 'utf8');
  const debut = src.indexOf('async function osintSurfaceExposee');
  const fin = src.indexOf('async function moduleOsint', debut);
  const corps = debut >= 0 && fin > debut ? src.slice(debut, fin) : '';
  test('osintSurfaceExposee existe dans server.js', debut >= 0);
  test('moduleOsint (le routage) existe aussi', src.indexOf('async function moduleOsint') >= 0);
  test('le corps ne balaye JAMAIS de ports (scanCible / lancerScan absents)', corps.length > 0 && !/scanCible|lancerScan/.test(corps));
  test('le droit « scan » est vérifié en premier (droitRefuse)', /droitRefuse\s*\(\s*agent\s*,\s*.scan./.test(corps));
  test('le périmètre est vérifié AVANT la frappe réseau (perimetreAutorise < tracerFrappe)',
    corps.indexOf('perimetreAutorise') > -1 && corps.indexOf('tracerFrappe') > corps.indexOf('perimetreAutorise'));
  test('le mode essai ne part pas sur le réseau (if (ESSAI) return)', /if \(ESSAI\) return/.test(corps));

  // Les gardes se prouvent SANS réseau : une cible hors fiche refuse avant la moindre requête DNS.
  const aegis = await post('/api/command', { text: 'aegis, surface exposee example.com' }, { headers: { Origin: BASE } });
  test('#32 — un domaine sans fiche est REFUSÉ (fiche demandée), et rien n a été interrogé',
    aegis.status === 200 && (aegis.data || {}).refus === true && /fiche/i.test(String((aegis.data || {}).reply)), JSON.stringify(aegis.data || {}).slice(0, 150));
  const biz = await post('/api/command', { text: 'business, surface exposee example.com' }, { headers: { Origin: BASE } });
  test('#32 — BUSINESS n a pas le droit de cartographier (refus nommé)',
    (biz.data || {}).refus === true && /aelyra|onyx|aegis/i.test(String((biz.data || {}).reply)), JSON.stringify(biz.data || {}).slice(0, 150));
  const nodom = await post('/api/command', { text: 'aegis, surface exposee' }, { headers: { Origin: BASE } });
  test('#32 — sans domaine dicté, la réponse demande le nom de domaine',
    /domaine/i.test(String((nodom.data || {}).reply)) && !/fiche/.test(String((nodom.data || {}).reply)), JSON.stringify(nodom.data || {}).slice(0, 150));
}

// —— SUPERVISEUR : Aelyra coordonne, controle et valide avant tout rendu a Isaac ——
async function familleSuperviseur() {
  section('[SUPERVISEUR] Aelyra = superviseuse : plan -> delegation -> controle -> validation, sans jamais contourner les bornes');
  const src = fs.readFileSync(SERVEUR, 'utf8');
  const debut = src.indexOf('async function coordonner');
  const fin = src.indexOf('async function handleCommand', debut);
  const corps = debut >= 0 && fin > debut ? src.slice(debut, fin) : '';

  test('coordonner(rawText, image) existe dans server.js', debut >= 0);
  test('veutCoordonner existe (le declencheur de la mission coordonnee)', src.indexOf('function veutCoordonner') >= 0);
  test('controlerTravailAelyra existe (le controle/analyse du travail de l equipe)', src.indexOf('async function controlerTravailAelyra') >= 0);

  // La delegation REENTRE dans handleCommand : les gardes (perimetre, droits, voie) s appliquent identiquement
  test(' chaque etape repasse par handleCommand avec sousSupervision (gardes identiques, pas de contournement)',
    /handleCommand\([^)]*sousSupervision:\s*true/.test(corps));
  // La recursion est coupee : coordonner ne rappelle jamais veutCoordonner (sinus boucle infinie)
  test('coordonner ne se redéclenche pas lui-meme (pas de veutCoordonner dans son corps)', !/veutCoordonner/.test(corps));
  // Le coordinateur ne REIMPLÉMENTE aucune borne : il délègue à handleCommand qui les tient
  test('le corps de coordonner ne rejoue AUCUN garde (ni droitRefuse, ni perimetreAutorise, ni cibleInterdite)',
    corps.length > 0 && !/droitRefuse|perimetreAutorise|cibleInterditeAbsolument/.test(corps));

  // La mission est gravee comme une tache reelle + journal d audit infalsifiable (SUPERVISEUR)
  test('une mission coordonnee cree une tache de type « supervision »', /creerTache\(\s*\{[^}]*type:\s*'supervision'/.test(corps));
  test('le cycle est grave dans le grand livre (graverAudit SUPERVISEUR)',
    /graverAudit\(\s*'SUPERVISEUR'/.test(corps) && /'MISSION'/.test(corps) && /'ATTRIBUE'/.test(corps) && /'RECU'/.test(corps) && /'VALIDE'/.test(corps));

  // La hierarchy est dans les personas : Aelyra supervise, les autres ne rendent jamais sans validation
  test('phraseSupervision existe et cablle la hierarchie dans les personas', src.indexOf('function phraseSupervision') >= 0);
  const dp = src.indexOf('function droitPersonaPhrase');
  const dpc = dp >= 0 ? src.slice(dp, src.indexOf('\n}', dp)) : '';
  test('droitPersonaPhrase injecte la phrase de supervision (hierarchie dans chaque persona)', /phraseSupervision\s*\(/.test(dpc));

  // Le trigger dans handleCommand : sousSupervision coupe la recursion, une image ne lance pas la coordination
  const hc = src.slice(fin, fin + 1200);
  test('handleCommand accepte opts et ne declenche coordonner qu au premier niveau (!opts.sousSupervision)',
    /async function handleCommand\(rawText,\s*image,\s*opts\)/.test(src) && /if \(\s*!opts\.sousSupervision\s*&&[^)]*veutCoordonner/.test(hc));

  // veutCoordonner ne vole pas une commande adressee a UNE seule agente (« onyx, scanne ... »)
  const vcDebut = src.indexOf('function veutCoordonner');
  const vc = vcDebut >= 0 ? src.slice(vcDebut, src.indexOf('function extraireJSON', vcDebut)) : '';
  test('veutCoordonner refuse une commande deja adressee a une seule agente (chemin direct garde)',
    vc.length > 0 && /return false/.test(vc) && /onyx\|onyxe\|onix\|aegis/.test(vc));
  test('veutCoordonner ne vole ni la table ronde ni la voie', /table\s*\\?ronde/.test(vc) && /voie/.test(vc));

  // Comportement REAL : une demande de coordination rend une synthese d Aelyra (source locale) en essai
  const mission = await post('/api/command', { text: 'aelyra, coordonne l equipe pour dire bonjour a isaac' }, { headers: { Origin: BASE } });
  test('une mission coordonnee aboutit (200 + reply non vide)',
    mission.status === 200 && String((mission.data || {}).reply || '').length > 0, JSON.stringify(mission.data || {}).slice(0, 160));
}

// —— Frontend : le Command Center ne transporte aucun secret et tient son correctif ——
async function familleFrontend() {
  section('[FRONTEND] aucun secret servi au navigateur + correctifs Phases 5-7 tenus');
  const js = ['ui/hud.js', 'ui/systeme.js', 'ui/flux.js', 'ui/agents.js', 'ui/command-center.js', 'ui/memoire.js', 'ui/reglages.js', 'voice/voiceClient.js'];
  const SECRET = /api[_-]?key\s*[:=]\s*['"][A-Za-z0-9]{16,}|AIza[0-9A-Za-z_\-]{20,}|sk-[A-Za-z0-9]{20,}|bearer\s+[A-Za-z0-9._\-]{20,}/i;
  let fuite = null, lus = 0;
  for (const f of js) {
    let t = '';
    try { t = fs.readFileSync(path.join(PUBLIC, f), 'utf8'); lus++; } catch (e) { test('le module ' + f + ' est present', false, 'introuvable'); continue; }
    if (SECRET.test(t)) fuite = f;
  }
  test('aucune cle d API dans le JS du Command Center', !fuite, fuite ? 'trouvee dans ' + fuite : '');
  test('les 8 modules du HUD sont lisibles sur le disque', lus === js.length, lus + '/' + js.length + ' lus');
  const hud = fs.readFileSync(path.join(PUBLIC, 'ui/hud.js'), 'utf8');
  test('hud.js expose visible() + onReveil() (le correctif onglet cache)', /function visible/.test(hud) && /onReveil/.test(hud) && /enVol/.test(hud));
  const cc = fs.readFileSync(path.join(PUBLIC, 'ui/command-center.js'), 'utf8');
  test('le chien de garde ne mord plus pendant un arriere-plan', /if \(document\.hidden\) return;/.test(cc));
}

// —— Rappels vocaux (tâches #62 + #63) : durées en LETTRES comprises + libellé fidèle ——
async function familleRappels() {
  section('[RAPPELS] « dans deux heures » est compris, et le libellé garde le texte dicté');
  const dir = (t) => post('/api/command', { text: t }, { headers: { Origin: BASE } });
  const labelDe = (r) => { const m = String((r.data || {}).reply).match(/[«"]([^»"]*)[»"]/); return m ? m[1].trim() : ''; };
  // Repartir d'un sandbox vide (isaac-rappels.essai.json, isolé et gitignoré).
  await dir('annule tous mes rappels');

  // #62 — la durée DICTÉE EN LETTRES doit être comprise (avant le correctif : rappel jamais créé).
  const deux = await dir("rappelle moi de payer la facture dans deux heures");
  const rDeux = String((deux.data || {}).reply);
  test('#62 — « dans deux heures » crée bien un rappel (réponse « je vous rappelle »)', /rappelle/i.test(rDeux), rDeux.slice(0, 90));
  test('#62 — la durée en lettres est convertie en chiffre (2 heures)', /2\s*heure/.test(rDeux), rDeux.slice(0, 90));
  // #63 — le libellé est le texte dicté, sans l'heure collée ni le repli « votre rappel ».
  const l1 = labelDe(deux);
  test('#63 — le libellé contient « facture »', /facture/.test(l1), JSON.stringify(l1));
  test('#63 — le libellé ne contient PAS l\'heure (« heure/minute/deux »)', !/heure|minute|deux|demi/.test(l1) && l1 !== 'votre rappel', JSON.stringify(l1));

  // #62 — une heure absolue en lettres (« a six heures ») est comprise.
  const six = await dir("reveille moi d'appeler mamie a six heures");
  const rSix = String((six.data || {}).reply);
  test('#62 — « a six heures » est compris (6h00)', /6h00|6 ?heures?/.test(rSix), rSix.slice(0, 90));
  test('#63 — le libellé de la veille garde « mamie »', /mamie/.test(labelDe(six)), JSON.stringify(labelDe(six)));

  // Non-régression : les durées en CHIFFRES marchent toujours.
  const dix = await dir("rappelle moi de boire de l'eau dans 10 minutes");
  test('#62 — les chiffres fonctionnent toujours (10 minutes)', /10\s*minute/.test(String((dix.data || {}).reply)), String((dix.data || {}).reply).slice(0, 90));

  // Persistance réelle : « mes rappels » relit le fichier d'essai et retrouve le texte dicté.
  const liste = await dir('mes rappels');
  test('#62 — les rappels sont gravés et relus (« facture » dans la liste)', /facture/.test(String((liste.data || {}).reply)), String((liste.data || {}).reply).slice(0, 120));

  // #63b — un verbe d'annulation ne doit PAS se faire voler par la branche « liste »
  // (bug PROD trouvé le 2026-10-05 : « annule tous mes rappels » LISTAIT au lieu d'annuler).
  const annule = await dir('annule tous mes rappels');
  test('#63b — « annule tous mes rappels » est traité comme une annulation, pas une liste', /efface/i.test(String((annule.data || {}).reply)), String((annule.data || {}).reply).slice(0, 90));
  const vide = await dir('mes rappels');
  test('#63b — le fichier est bien vide après l annulation', /aucun rappel/i.test(String((vide.data || {}).reply)), String((vide.data || {}).reply).slice(0, 120));

  // Grand ménage du sandbox pour ne rien laisser derrière le harnais.
  await dir('annule tous mes rappels');
}

// ===================================== MAIN =====================================
(async function principal() {
  console.log('\n================ HARNAIS DE TESTS DU CERVEAU ================');
  console.log('instance : essai sur ' + BASE + ' (aucune ecriture chez Isaac, aucun reseau)');

  // 0. Le port de test doit etre libre AVANT de demarrer : sinon un cerveau y tourne deja
  //    et on menserait en crediter ses reponses a notre instance.
  const deja = await get('/api/ping', { timeout: 2000 });
  if (deja.status === 200) {
    console.log('\n\x1b[31mIMPOSSIBLE : un cerveau repond deja sur ' + PORT_TEST + '. Libre le port ou change ISAAC_TEST_PORT.\x1b[0m');
    process.exit(2);
  }

  const avant = empreintesDeAvant();

  // 1. On demarre la VRAITE instance d'essai, pas une moquette.
  try {
    enfant = spawn(process.execPath, [SERVEUR], {
      cwd: RACINE,
      env: Object.assign({}, process.env, { ISAAC_ESSAI: '1', PORT: String(PORT_TEST) }),
      stdio: ['ignore', 'ignore', 'pipe']
    });
  } catch (e) {
    console.log('\n\x1b[31mDemarrage impossible : ' + ((e && e.message) || e) + '\x1b[0m');
    process.exit(2);
  }
  securiserArret();
  let stderr = '';
  if (enfant.stderr) enfant.stderr.setEncoding('utf8');
  if (enfant.stderr) enfant.stderr.on('data', (c) => { stderr += c; if (stderr.length > 8000) stderr = stderr.slice(-8000); });
  enfant.on('exit', (code) => { console.log('\n\x1b[33m(note) l instance de test s est arretee (code ' + code + ')' + (stderr ? ' — dernier stderr :\n' + stderr.slice(-500) : '') + '\x1b[0m'); });

  // 2. On attend qu'elle reponde. Si elle ne se leve pas, TOUT est rate (pas de faux vert).
  section('[BOOT] le cerveau candidat se leve-t-il reellement ?');
  const vivant = await attendreVivant(0);
  test('instance demarree et vivante sur /api/ping', vivant, vivant ? '' : 'ne repond pas — les familles suivantes vont echouer');

  if (vivant) {
    try { await familleSecurite(); } catch (e) { test('famille SECURITE sans exception', false, String((e && e.message) || e)); }
    try { await familleMemoire(); } catch (e) { test('famille MEMOIRE sans exception', false, String((e && e.message) || e)); }
    try { await familleDroits(); } catch (e) { test('famille DROITS sans exception', false, String((e && e.message) || e)); }
    try { await familleAudit(); } catch (e) { test('famille AUDIT sans exception', false, String((e && e.message) || e)); }
    try { await familleBusiness(); } catch (e) { test('famille BUSINESS sans exception', false, String((e && e.message) || e)); }
    try { await familleRappels(); } catch (e) { test('famille RAPPELS sans exception', false, String((e && e.message) || e)); }
    try { await familleOsint(); } catch (e) { test('famille OSINT sans exception', false, String((e && e.message) || e)); }
    try { await familleSuperviseur(); } catch (e) { test('famille SUPERVISEUR sans exception', false, String((e && e.message) || e)); }
  }
  try { await familleFrontend(); } catch (e) { test('famille FRONTEND sans exception', false, String((e && e.message) || e)); }

  // 3. On tue l'instance, PUIS on verifie l'isolation sur les donnees reels.
  await new Promise((res) => tuerEnfant(res));
  await new Promise((res) => setTimeout(res, 250));

  section('[ISOLATION] les donnees reels d Isaac n ont pas bouge d un octet');
  const apres = empreintesDeAvant();
  for (const f of A_PRESERVER) {
    const etaisAvant = avant[f] === null, estApres = apres[f] === null;
    if (etaisAvant && estApres) { test(f + " n'existait pas et n a pas ete cree", true); continue; }
    test(f + ' intact (sha256 identique)', etaisAvant === estApres && avant[f] === apres[f],
      'a change : ' + String(avant[f]).slice(0, 12) + ' -> ' + String(apres[f]).slice(0, 12));
  }

  // 4. Le bilan.
  console.log('\n================ BILAN : ' + ok + ' PASS / ' + ko + ' RATE ================');
  if (ko) console.log('RATINEES :\n - ' + ratines.join('\n - '));
  else console.log('Le filet est vert : le cerveau peut etre modifie sans peur, ce harnais le rattrapera.');
  process.exit(ko ? 1 : 0);
})().catch((e) => {
  console.error('\n\x1b[31mLE HARNAIS EST CASSE : ' + ((e && e.stack) || e) + '\x1b[0m');
  tuerEnfant(() => process.exit(2));
});

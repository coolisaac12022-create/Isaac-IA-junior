// ============================================================================
// VOIX-MANAGER.JS — le VOICE MANAGER d'Isaac (2026-10-02)
// ----------------------------------------------------------------------------
// L'architecture qu'Isaac a dessinée :
//   ISAAC -> (reconnaissance vocale | IA texte) -> VOICE MANAGER -> TTS neuronal -> voix
//
// Ce fichier EST le voice manager. Il ne promet rien qu'il ne puisse prouver :
//  - le neuronal n'est annoncé QUE si piper.exe et les modèles .onnx sont sur le disque ;
//  - un processus chaud par modèle : le chargement (4 à 6 s mesurées ici) ne se paie qu'une fois ;
//  - une file stricte : un seul texte en cours de synthèse par modèle, au-delà la page parle
//    avec les voix Windows — une voix qui prend du retard ne remplace pas une voix ;
//  - un cache content-addressable (sha256 texte+modèle+réglage) : la même phrase n'est
//    jamais synthétisée deux fois ;
//  - un journal : chaque chauffe, synthèse, cache, repli et refus est écrit dans
//    journal-voix.log (journal-voix.essai.log sur l'instance d'essai) ;
//  - LOCAL-FIRST : le texte ne quitte pas le PC. Aucun appel réseau, aucune clé, aucune
//    écriture hors jarvis/tts/cache ;
//  - un garde-fou machine : le PC d'Isaac est un i5 double cœur. Si la mémoire libre tombe
//    sous le seuil, le moteur neuronal s'efface de lui-même et rend la voix à Windows, pour
//    ne jamais geler l'écran d'Isaac ;
//  - si le moteur tombe deux fois de suite, il est mis au repos cinq minutes : Isaac entend
//    quand même ses agentes, et le journal dit pourquoi.
// Zéro dépendance npm : node seul + le binaire Piper posé par VOIX-NEURONALE.bat.
// ============================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const RACINE = __dirname;                          // jarvis/tts/
const PIPER_EXE = path.join(RACINE, 'piper', 'piper.exe');
const ESPEAK_DATA = path.join(RACINE, 'piper', 'espeak-ng-data');
const MODELES_DIR = path.join(RACINE, 'voix');
const CACHE_DIR = path.join(RACINE, 'cache');

const IDLE_MS = 3 * 60 * 1000;                     // un modèle muet depuis 3 min rend la RAM
const CHAUFFE_TL_MS = 60 * 1000;                   // modèle non chargé au bout de 60 s : échec
const SYN_TL_MS = 60 * 1000;                       // texte sans WAV au bout de 60 s : échec
const MAX_FILE = 6;                                // plus de 6 phrases en file = repli Windows
const CACHE_MAX_OCTETS = 120 * 1024 * 1024;        // 120 Mo de voix, puis on ménage les plus anciennes
const REPOS_APRES_ECHECS = 2;                      // deux échecs de suite = moteur au repos
const DUREE_REPOS_MS = 5 * 60 * 1000;
// Garde-fou mémoire, réglé sur la machine MESURÉE d'Isaac (8 Go, 440 à 600 Mo libres en
// permanence avec deux navigateurs ouverts). Deux seuils, parce que le coût réel n'est pas le
// même selon l'état du moteur :
//   - charger un modèle (.onnx) prend ~250 Mo d'un coup : il faut de la marge, sinon Windows
//     se met à paginer et l'écran d'Isaac gèle — c'est le seuil strict ;
//   - une phrase sur un moteur DÉJÀ CHAUD ne coûte presque rien en mémoire : un seuil bas
//     suffit, sinon le neuronal ne parlerait jamais sur ce PC (mesuré : 443 Mo libres juste
//     après une chauffe réussie — un seuil unique à 550 Mo tuait la fonction).
// Sous le seuil, le manager rend la voix à Windows et l'écrit au journal : il s'efface, il ne
// ment pas.
const RAM_MIN_FROID_MO = 320;                      // pour démarrer un modèle qui n'est pas chargé
const RAM_MIN_CHAUD_MO = 140;                      // pour une phrase sur un moteur déjà chaud
const RAM_MIN_MO = RAM_MIN_FROID_MO;               // seuil affiché dans /api/voix/etat
const FILS_ORT = process.env.ISAAC_TTS_THREADS || '2';  // on laisse des coeurs a son PC

// Ce que le manager sait faire. Deux niveaux réels, mesurés sur la machine d'Isaac :
//   rapide  = modèles « low »  : ~0,8 a 1,4 fois la duree de la phrase  -> suit la voix
//   qualite = modèles « medium »: 1,5 a 2,5 fois la duree               -> trop lent sur ce PC,
//             laisse sur le disque seulement s'ils sont installes.
const CARTE = {
  aelyra: { rapide: 'fr_FR-siwis-low.onnx', qualite: 'fr_FR-siwis-medium.onnx', longueur: 1.00, genre: 'femme', titre: 'Aelyra — la maison, le PC' },
  jeanette: { rapide: 'fr_FR-siwis-low.onnx', qualite: 'fr_FR-siwis-medium.onnx', longueur: 0.93, genre: 'femme', titre: 'Jeanette — le code' },
  onyx: { rapide: 'fr_FR-gilles-low.onnx', qualite: 'fr_FR-tom-medium.onnx', longueur: 1.08, genre: 'homme', titre: 'Onyx — le poste d attaque' },
  aegis: { rapide: 'fr_FR-gilles-low.onnx', qualite: 'fr_FR-tom-medium.onnx', longueur: 0.97, genre: 'homme', titre: 'Aegis — la defense' },
  business: { rapide: 'fr_FR-siwis-low.onnx', qualite: 'fr_FR-siwis-medium.onnx', longueur: 1.05, genre: 'femme', titre: 'Business — la prospection' },
  autre: { rapide: 'fr_FR-gilles-low.onnx', qualite: 'fr_FR-gilles-low.onnx', longueur: 1.00, genre: 'homme', titre: 'Cerveau invite — la table ronde' }
};
// Une langue = un modèle. Seul le français est installé ici : une voix neuronale française
// qui lirait de l'anglais parlerait mal — mieux vaut laisser la voix Windows de cette langue.
const LANGUES_NEURONALES = { fr: true };

function borner(v, a, b, d) {
  const n = Number(v);
  return (typeof n === 'number' && isFinite(n)) ? Math.max(a, Math.min(b, n)) : d;
}

function creerVoixManager(depsBruts) {
  const deps = Object.assign({ ESSAI: false, voieGenante: () => null }, depsBruts || {});
  const JOURNAL = path.join(RACINE, '..', deps.ESSAI ? 'journal-voix.essai.log' : 'journal-voix.log');
  const decisions = [];

  function journal(ligne, pourquoi) {
    const entree = new Date().toISOString().slice(11, 19) + ' ' + ligne + (pourquoi ? ' — ' + pourquoi : '');
    decisions.push(entree);
    if (decisions.length > 40) decisions.shift();
    try { fs.appendFileSync(JOURNAL, new Date().toISOString() + ' ' + ligne + (pourquoi ? ' | ' + pourquoi : '') + '\n'); } catch (e) {}
    try { console.log('[voix] ' + entree); } catch (e) {}
  }

  function modeleLa(fichier) {
    return fs.existsSync(path.join(MODELES_DIR, fichier)) && fs.existsSync(path.join(MODELES_DIR, fichier + '.json'));
  }
  function binaireLa() { return fs.existsSync(PIPER_EXE) && fs.existsSync(ESPEAK_DATA); }
  function tousModeles() {
    const s = new Set();
    for (const k of Object.keys(CARTE)) { s.add(CARTE[k].rapide); if (CARTE[k].qualite) s.add(CARTE[k].qualite); }
    return [...s];
  }
  function installe() { return binaireLa() && tousModeles().some(modeleLa); }
  function ramLibreMo() { try { return Math.round(os.freemem() / 1048576); } catch (e) { return 9999; } }

  function raisonAbsence() {
    if (!binaireLa()) return "moteur Piper absent — lance VOIX-NEURONALE.bat";
    const la = tousModeles().filter(modeleLa);
    if (!la.length) return "aucune voix neuronale sur le disque — lance VOIX-NEURONALE.bat";
    return '';
  }

  // ------------------- processus chauds, un par modèle -------------------
  const PROCS = new Map();   // modele -> ent
  const REPOS = new Map();   // modele -> { echecs, jusqua }
  const compteurs = { phrases: 0, caches: 0, replis: 0, echecs: 0, chauffes: 0, msSynthese: 0 };

  function auRepos(modele) {
    const r = REPOS.get(modele);
    if (!r) return null;
    if (Date.now() > r.jusqua) { REPOS.delete(modele); return null; }
    return r.jusqua - Date.now();
  }

  function tuerProc(modele, motif) {
    const ent = PROCS.get(modele);
    if (!ent) return;
    PROCS.delete(modele);
    for (const t of ent.attente.slice()) echouer(modele, t, motif);
    try { if (ent.p) { ent.p.removeAllListeners('exit'); ent.p.kill(); } } catch (e) {}
    try { if (ent.p && ent.p.stdin) ent.p.stdin.end(); } catch (e) {}
  }

  function demarrer(modele) {
    const ent = PROCS.get(modele);
    if (ent && ent.chauffee) return Promise.resolve(ent);
    if (ent && ent.pret) return ent.pret;

    const nouveau = { modele, p: null, attente: [], chauffee: false, pret: null, dernier: Date.now() };
    PROCS.set(modele, nouveau);
    compteurs.chauffes++;

    nouveau.pret = new Promise((resolve, reject) => {
      let p;
      try {
        p = spawn(PIPER_EXE, ['-m', path.join(MODELES_DIR, modele), '--json-input', '-d', CACHE_DIR,
          '--espeak_data', ESPEAK_DATA], {
          windowsHide: true, cwd: RACINE,
          env: Object.assign({}, process.env, { OMP_NUM_THREADS: FILS_ORT })
        });
      } catch (e) {
        PROCS.delete(modele);
        journal('ECHEC chauffe ' + modele, 'binaire injouable');
        return reject(new Error('piper injouable'));
      }
      nouveau.p = p;
      let annonce = '';
      let regle = false;
      const garde = setTimeout(() => {
        if (!regle) { PROCS.delete(modele); journal('ECHEC chauffe ' + modele, 'toujours muet après ' + (CHAUFFE_TL_MS / 1000) + ' s'); reject(new Error('chargement trop lent')); }
      }, CHAUFFE_TL_MS);

      p.stderr.on('data', d => {
        const s = String(d);
        const c = s.match(/Loaded voice in ([\d.]+)/);
        if (c && !regle) {
          regle = true; clearTimeout(garde);
          nouveau.chauffee = true; nouveau.dernier = Date.now();
          journal('CHAUFFE ' + modele, 'pret en ' + Math.round(parseFloat(c[1]) * 1000) + ' ms');
          resolve(nouveau);
        }
        const rt = s.match(/Real-time factor: ([\d.]+)/);
        if (rt) journal('RTF ' + modele, parseFloat(rt[1]).toFixed(2) + ' (1.00 = la vitesse exacte de la voix)');
        const er = s.match(/\[(error|warning)\]\s?(.{0,90})/i);
        if (er) journal('MOTEUR ' + modele, er[1].toUpperCase() + ' ' + er[2].trim());
      });
      p.stdout.on('data', d => {
        annonce += String(d);
        let i;
        while ((i = annonce.indexOf('\n')) >= 0) {
          const ligne = annonce.slice(0, i).trim();
          annonce = annonce.slice(i + 1);
          if (/\.wav$/i.test(ligne)) associerFichier(modele, ligne);
        }
      });
      p.on('error', e => journal('ECHEC process ' + modele, String((e && e.message) || e).slice(0, 70)));
      p.on('exit', code => {
        clearTimeout(garde);
        if (PROCS.get(modele) === nouveau) {
          PROCS.delete(modele);
          for (const t of nouveau.attente.slice()) echouer(modele, t, 'moteur arrete');
          if (!regle) reject(new Error('piper mort code ' + code + ' avant chargement'));
          else journal('MORT ' + modele, 'code ' + (code === null ? 'tue' : code) + ' — il repartira a la prochaine phrase');
        }
      });
    });
    return nouveau.pret;
  }

  // Piper annonce le chemin du WAV AVANT de l'avoir fini d'écrire : on attend la taille stable.
  function associerFichier(modele, chemin) {
    const ent = PROCS.get(modele);
    if (!ent || !ent.attente.length) return;
    const t = ent.attente[0];
    if (t.annonce) return;                 // annonce déjà prise : on ne mélange pas les fichiers
    t.annonce = chemin;
  }

  function echouer(modele, t, motif) {
    if (!t || t.regle) return;
    t.regle = true;
    const ent = PROCS.get(modele);
    if (ent) ent.attente = ent.attente.filter(x => x !== t);
    compteurs.echecs++;
    const r = REPOS.get(modele) || { echecs: 0, jusqua: 0 };
    r.echecs++;
    if (r.echecs >= REPOS_APRES_ECHECS) {
      r.jusqua = Date.now() + DUREE_REPOS_MS;
      journal('REPOS ' + modele, motif + ' — neuronal écarté 5 min, voix Windows pendant ce temps');
    }
    REPOS.set(modele, r);
    try { t.rejeter(new Error(motif)); } catch (e) {}
  }

  function finir(modele, t, chemin) {
    if (t.regle) { try { fs.unlinkSync(chemin); } catch (e) {} return; }
    t.regle = true;
    const ent = PROCS.get(modele);
    if (ent) ent.attente = ent.attente.filter(x => x !== t);
    REPOS.delete(modele);
    try {
      const octets = fs.statSync(chemin).size;
      try { fs.renameSync(chemin, t.cible); }
      catch (e) { fs.copyFileSync(chemin, t.cible); try { fs.unlinkSync(chemin); } catch (e2) {} }
      compteurs.phrases++;
      const ms = Date.now() - t.depuis;
      compteurs.msSynthese += ms;
      t.resoudre({ octets, ms });
    } catch (e) {
      compteurs.echecs++;
      try { t.rejeter(new Error('fichier WAV illisible')); } catch (e2) {}
    }
  }

  function surveiller(modele, t) {
    let taillePrecedente = -1;
    const sonde = setInterval(() => {
      let taille = 0;
      if (t.annonce) { try { taille = fs.statSync(t.annonce).size; } catch (e) { taille = 0; } }
      if (taille > 44 && taille === taillePrecedente) { clearInterval(sonde); finir(modele, t, t.annonce); return; }
      taillePrecedente = taille;
      if (Date.now() - t.depuis > SYN_TL_MS) {
        clearInterval(sonde);
        tuerProc(modele, 'aucun fichier au bout de ' + (SYN_TL_MS / 1000) + ' s');
      }
    }, 120);
  }

  setInterval(() => {
    const maintenant = Date.now();
    for (const [modele, ent] of PROCS) {
      if (ent.chauffee && !ent.attente.length && maintenant - ent.dernier > IDLE_MS) {
        tuerProc(modele, 'idle');
        journal('ETEINT ' + modele, 'silence depuis ' + Math.round(IDLE_MS / 60000) + ' min — RAM rendue a ton PC');
      }
    }
  }, 15 * 1000).unref();

  // ------------------------- le cache -------------------------
  function cleCache(texte, modele, longueur) {
    return crypto.createHash('sha256').update('piper1|' + modele + '|' + longueur.toFixed(3) + '|' + texte).digest('hex');
  }
  function cheminCache(cle) { return path.join(CACHE_DIR, cle + '.wav'); }
  function listeCache() {
    try { return fs.readdirSync(CACHE_DIR).filter(f => /^[0-9a-f]{64}\.wav$/.test(f)); } catch (e) { return []; }
  }
  function etatCache() {
    let nb = 0, octets = 0;
    for (const f of listeCache()) { nb++; try { octets += fs.statSync(path.join(CACHE_DIR, f)).size; } catch (e) {} }
    return { nb, octets };
  }
  function menageCache() {
    const fichiers = listeCache().map(f => {
      try { const s = fs.statSync(path.join(CACHE_DIR, f)); return { f, taille: s.size, age: s.mtimeMs }; } catch (e) { return null; }
    }).filter(Boolean).sort((a, b) => a.age - b.age);
    let total = fichiers.reduce((s, x) => s + x.taille, 0), supprimes = 0;
    for (const x of fichiers) {
      if (total <= CACHE_MAX_OCTETS) break;
      try { fs.unlinkSync(path.join(CACHE_DIR, x.f)); total -= x.taille; supprimes++; } catch (e) {}
    }
    if (supprimes) journal('MENAGE cache', supprimes + ' ancien(s) WAV effaces, ' + Math.round(total / 1048576) + ' Mo restants');
    return supprimes;
  }

  // ---------------------- la demande de voix ----------------------
  // dire({ texte, parlence, langue, hauteur, debit, qualite })
  //   hauteur : multiplicateur de timbre demandé (le curseur du panneau 🗣)
  //   debit   : multiplicateur de vitesse demandé
  // Le modèle ne sait pas changer sa propre hauteur : on allonge la synthèse
  // (length_scale = hauteur / debit) et on la rejoue plus vite (lecture = hauteur).
  // Les deux effets se compensent : Isaac entend exactement le timbre et le débit réglés.
  function modelePour(parlence, qualite) {
    const regle = CARTE[parlence];
    if (!regle) return null;
    if (qualite === 'qualite' && modeleLa(regle.qualite)) return regle.qualite;
    return modeleLa(regle.rapide) ? regle.rapide : (modeleLa(regle.qualite) ? regle.qualite : null);
  }

  function dire(o) {
    return new Promise(resolve => {
      const recu = o || {};
      const texte = String(recu.texte || '').replace(/\s+/g, ' ').trim();
      const parlence = String(recu.parlence || 'aelyra').toLowerCase();
      const langue = String(recu.langue || 'fr').toLowerCase().slice(0, 2);
      const t0 = Date.now();
      const repli = (raison, extra) => {
        compteurs.replis++;
        journal('REPLI ' + parlence, raison);
        resolve(Object.assign({ moteur: 'repli', raison }, extra || {}));
      };
      if (!installe()) return repli(raisonAbsence() || 'moteur neuronal absent');
      if (texte.length < 2) return repli('rien a dire');
      if (texte.length > 1200) return repli('phrase trop longue pour le neuronal (' + texte.length + ' caracteres)');
      if (!CARTE[parlence]) return repli('agente inconnue (' + parlence.slice(0, 16) + ')');
      if (!LANGUES_NEURONALES[langue]) return repli('pas de modele neuronal en ' + langue + ' — la voix Windows de cette langue lit mieux');
      const regle = CARTE[parlence];
      const modele = modelePour(parlence, recu.qualite);
      if (!modele) return repli('voix neuronale de ' + regle.titre.split(' —')[0] + ' pas installee');

      const hauteur = borner(recu.hauteur, 0.7, 1.6, 1);
      const debit = borner(recu.debit, 0.7, 1.6, 1);
      const longueur = borner(hauteur / debit * regle.longueur, 0.6, 1.8, 1);
      const cle = cleCache(texte, modele, longueur);
      const cible = cheminCache(cle);

      const reponse = r => resolve(Object.assign({
        moteur: 'neuronal', url: '/voix/' + cle + '.wav', modele, longueur: +longueur.toFixed(3),
        lecture: hauteur, parlence, langue: 'fr', qualite: recu.qualite === 'qualite' ? 'qualite' : 'rapide'
      }, r));

      // 1) LE CACHE D'ABORD. Une phrase déjà synthétisée ne coûte ni CPU ni mémoire : la servir
      //    n'a aucune raison d'être refusée, même pendant un scan ou avec peu de RAM libre.
      //    (Première version : le cache était vérifié APRÈS les gardes — une phrase en cache
      //    se faisait refuser pour 443 Mo libres. C'était un refus imaginaire.)
      try {
        const s = fs.statSync(cible);
        if (s.size > 44) {
          compteurs.caches++;
          journal('CACHE ' + parlence, texte.slice(0, 48));
          return reponse({ octets: s.size, cache: true, ms: Date.now() - t0 });
        }
      } catch (e) {}

      // 2) La voie : un balayage de 65 535 ports sature le CPU, la synthèse passe après.
      const genante = (typeof deps.voieGenante === 'function') ? deps.voieGenante() : null;
      if (genante) return repli('la voie tient ' + genante + ' — le neuronal cede le CPU au scan', { voie: genante });

      const deja = PROCS.get(modele);
      const chaud = !!(deja && deja.chauffee);
      if (chaud && deja.attente.length >= MAX_FILE) return repli('le neuronal a deja ' + deja.attente.length + ' phrases en file');

      // 3) La mémoire : seuil strict pour une CHAUFFE (le modèle prend ~250 Mo d'un coup),
      //    seuil bas pour une phrase sur un moteur déjà chaud (coût réel quasi nul).
      const libre = ramLibreMo();
      const seuil = chaud ? RAM_MIN_CHAUD_MO : RAM_MIN_FROID_MO;
      if (libre < seuil) return repli('memoire libre ' + libre + ' Mo sous les ' + seuil + ' Mo ' +
        (chaud ? 'demands' : 'demands pour charger un modele') + ' — le neuronal s efface pour ne pas geler ton ecran', { ram_libre_mo: libre, seuil_ram_mo: seuil });

      // 4) Le repos : deux échecs de suite, le modèle attend cinq minutes.
      const repos = auRepos(modele);
      if (repos) return repli('moteur neuronal au repos (' + Math.ceil(repos / 60000) + ' min) apres des echecs', { repos_ms: repos });

      try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (e) {}

      demarrer(modele).then(processus => {
        const t = { texte, longueur, cle, cible, depuis: Date.now(), annonce: null, regle: false };
        const attente = new Promise((res, rej) => { t.resoudre = res; t.rejeter = rej; });
        processus.attente.push(t);
        processus.dernier = Date.now();
        const ligne = JSON.stringify({ text: texte, length_scale: +longueur.toFixed(3) });
        try { processus.p.stdin.write(ligne + '\n'); } catch (e) {
          processus.attente = processus.attente.filter(x => x !== t);
          return t.rejeter(new Error('envoi au moteur refuse'));
        }
        surveiller(modele, t);
        return attente;
      }).then(r => {
        journal('NEURONAL ' + parlence, r.ms + ' ms pour ' + Math.round(r.octets / 1024) + ' Ko — ' + texte.slice(0, 48));
        reponse({ octets: r.octets, ms: r.ms, total_ms: Date.now() - t0, cache: false });
      }).catch(err => {
        const pourquoi = String((err && err.message) || err || 'erreur inconnue').slice(0, 90);
        compteurs.replis++;
        journal('ECHEC ' + parlence, pourquoi);
        resolve({ moteur: 'repli', raison: 'neuronal indisponible (' + pourquoi + ')' });
      });
    });
  }

  function etat() {
    const attendus = tousModeles();
    const c = etatCache();
    const chauds = [];
    for (const [modele, ent] of PROCS) chauds.push({ modele, charge: !!ent.chauffee, en_file: ent.attente.length });
    return {
      ok: true,
      installe: installe(),
      raison: raisonAbsence(),
      moteur: 'Piper — reseau de neurones, 100 % local',
      binaire: binaireLa(),
      repertoire: RACINE,
      langues: Object.keys(LANGUES_NEURONALES),
      modeles_attendus: attendus,
      modeles_installes: attendus.filter(modeleLa),
      ram_libre_mo: ramLibreMo(),
      seuil_ram_mo: RAM_MIN_MO,
      seuils_ram_mo: { chauffe: RAM_MIN_FROID_MO, moteur_chaud: RAM_MIN_CHAUD_MO },
      fils_cpu: FILS_ORT,
      agentes: Object.keys(CARTE).map(k => ({
        parlence: k, titre: CARTE[k].titre, genre: CARTE[k].genre, longueur: CARTE[k].longueur,
        modele_rapide: CARTE[k].rapide, modele_qualite: CARTE[k].qualite,
        installee: !!modelePour(k, 'rapide'), au_repos: !!auRepos(CARTE[k].rapide)
      })),
      processus: chauds,
      cache: { nb: c.nb, octets: c.octets, limite: CACHE_MAX_OCTETS },
      compteurs: {
        phrases: compteurs.phrases, caches: compteurs.caches, replis: compteurs.replis,
        echecs: compteurs.echecs, chauffes: compteurs.chauffes,
        ms_moyen_par_phrase: compteurs.phrases ? Math.round(compteurs.msSynthese / compteurs.phrases) : 0
      },
      decisions: decisions.slice(-12),
      instance: deps.ESSAI ? 'essai' : 'prod'
    };
  }

  function resume() {
    const e = etat();
    if (!e.installe) return "Voix : " + (e.raison || "moteur neuronal absent") + ". En attendant, c est la voix de Windows qui parle — elle fonctionne, elle n est simplement pas neuronale.";
    const moy = e.compteurs.ms_moyen_par_phrase;
    return "Voice manager en marche, Isaac : Piper, un reseau de neurones qui tourne ici. " +
      e.modeles_installes.length + " modele(s) neural(aux) installe(s), francais seulement. " +
      (e.processus.length ? e.processus.length + " moteur(s) chaud(s), " + e.processus[0].en_file + " phrase(s) en file. " : "Aucun moteur chaud pour l instant : il se recharge a la premiere phrase. ") +
      e.cache.nb + " phrase(s) deja synthetisees en cache, " + moy + " ms en moyenne par phrase. " +
      "Memoire libre : " + e.ram_libre_mo + " Mo — il en faut " + e.seuils_ram_mo.chauffe + " pour charger une voix, " + e.seuils_ram_mo.moteur_chaud + " seulement ensuite. " +
      "Une phrase deja en cache passe toujours : elle ne coute ni CPU ni memoire. Rien ne quitte ton PC : la synthese se fait ici.";
  }

  journal(binaireLa() ? 'MOTEUR PRET' : 'MOTEUR ABSENT',
    binaireLa() ? ('modeles : ' + (tousModeles().filter(modeleLa).join(', ') || 'aucun')) : 'piper.exe absent — voix Windows par defaut');

  return { dire, etat, resume, menageCache, installe, compteurs, deps: { ESSAI: !!deps.ESSAI } };
}

module.exports = creerVoixManager;

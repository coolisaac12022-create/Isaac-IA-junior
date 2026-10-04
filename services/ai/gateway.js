// ============================================================================
//  AI GATEWAY — l'arbitre des cerveaux du cerveau
// ----------------------------------------------------------------------------
//  Phase 4 du JARVIS COMMAND CENTER (2026-10-04). Avant ce fichier, server.js
//  appelait chaque moteur « à la main » : askGitHubModels(), puis askGemini(),
//  puis une échelle Pollinations écrite en dur. Ça marchait, et ça a été gardé
//  tel quel (règle n°20 d'Isaac : ne pas réécrire, déplacer). Ce qui manquait :
//    - un QUATRIÈME cerveau réellement branchable (NVIDIA NIM, clé côté serveur),
//    - un MODE (AUTO / un cerveau en premier) qui se lise et se change,
//    - un JOURNAL qui dise lequel a répondu, en combien de temps, et pourquoi
//      les autres se sont tus.
//
//  L'ordre AUTO, et pourquoi :
//    1. github      — la clé gratuite d'Isaac, texte + vision, 0 euro, TANT QUE
//       le service vivait. GitHub Models a été retiré le 30 juillet 2026 :
//       le connecteur reste, mais dispo = false, donc l'ordre AUTO le saute et
//       le HUD dit « retiré », jamais « aucune clé » ;
//    2. gemini      — la première clé qui répond vraiment ici (prouvé le
//       2026-10-04 : 5 343 ms, gemini-3.1-flash-lite, 203 caractères) ;
//    3. nvidia      — seulement si une clé NVIDIA_API_KEY est posée côté serveur.
//       Un compte NIM est compté à la requête : il ne passe jamais devant ce qui
//       est gratuit sans qu'Isaac l'ait décidé ;
//    4. pollinations — aucune clé, dernier recours, souvent saturé CHEZ EUX.
//
//  Trois invariants de la maison, écrits dans ce code et pas seulement dans la prose :
//    - une clé ne sort jamais : les compteurs et l'état n'exposent que « présente /
//      absente » ; le serveur ne renvoie aucune route qui montre une valeur ;
//    - un cerveau éteint ne compte pas : sans clé, aucun appel part, donc aucun
//      compteur ne bouge, donc le HUD ne peut pas afficher un faux succès ;
//    - un mode forcé ne rend pas muet : le cerveau demandé passe en premier, et
//      s'il refuse, la maison retombe sur l'ordre AUTO en gravant le repli.
// ============================================================================
'use strict';

const fs = require('fs');
const path = require('path');

const NOMS = ['github', 'gemini', 'nvidia', 'pollinations'];
const MODES = ['auto'].concat(NOMS);

function creerAIGateway(depsBruts) {
  const deps = Object.assign({ ESSAI: false, cles: () => ({}) }, depsBruts || {});
  const http = require('./http.js');
  const RACINE = path.join(__dirname, '..', '..');
  const JOURNAL = path.join(RACINE, deps.ESSAI ? 'journal-ai.essai.log' : 'journal-ai.log');
  const NOM_JOURNAL = deps.ESSAI ? 'journal-ai.essai.log' : 'journal-ai.log';

  function journal(ligne, pourquoi) {
    const entree = new Date().toISOString().slice(11, 19) + ' ' + ligne + (pourquoi ? ' — ' + pourquoi : '');
    try { fs.appendFile(JOURNAL, entree + '\n', function () {}); } catch (e) {}
  }

  // ---- Les connecteurs, chargés un par un ---------------------------------
  // Un connecteur qui ne se charge pas n'éteint pas la maison : il est absent de
  // l'ordre, avec sa vraie raison dans l'état.
  const FOURS = {};
  const ERREUR_CHARGE = {};
  for (const n of NOMS) {
    try { FOURS[n] = require('./providers/' + n + '.js')({ http, cles: deps.cles }); }
    catch (e) { ERREUR_CHARGE[n] = String((e && e.message) || e).slice(0, 120); }
  }

  function etatFour(n) {
    if (!FOURS[n]) {
      return { nom: n, titre: n, priorite: 99, cle_serveur: 'inconnu', dispo: false, modeles: [], vision: false,
        raison: 'le connecteur ne s est pas charge dans ce cerveau : ' + (ERREUR_CHARGE[n] || 'raison inconnue') };
    }
    try { return FOURS[n].etat(); }
    catch (e) { return { nom: n, titre: n, priorite: 99, cle_serveur: 'illisible', dispo: false, modeles: [], vision: false, raison: 'etat illisible : ' + String(e.message || e).slice(0, 90) }; }
  }
  function fournisseurs() {
    return NOMS.map(etatFour).sort(function (a, b) { return a.priorite - b.priorite; });
  }

  // ---- Les compteurs : qui a VRAIMENT répondu ------------------------------
  const COMPTEURS = {};
  for (const n of NOMS) COMPTEURS[n] = { appels: 0, succes: 0, echecs: 0, dernier: null, ms_total: 0 };
  function noter(nom, ok, ms, raison) {
    const c = COMPTEURS[nom];
    if (!c) return;
    c.appels++;
    if (ok) { c.succes++; c.dernier = Date.now(); c.ms_total += Math.max(0, Math.round(ms || 0)); }
    else c.echecs++;
    // Le Command Center montre QUI a réellement répondu — pas un nom de modèle décoratif.
    try {
      deps.noterEvenement('IA', nom + (ok ? ' a repondu en ' + Math.round(ms || 0) + ' ms'
        : ' a echoue (repli sur le suivant)' + (raison ? ' — ' + String(raison).slice(0, 90) : '')));
    } catch (e) {}
  }

  // ---- Le mode -------------------------------------------------------------
  function lireMode(v, parDefaut) {
    const m = String(v || '').toLowerCase().trim();
    return MODES.indexOf(m) !== -1 ? m : (MODES.indexOf(String(parDefaut || '').toLowerCase()) !== -1 ? String(parDefaut).toLowerCase() : 'auto');
  }
  let MODE = lireMode(process.env.ISAAC_AI_PROVIDER, 'auto');
  let MODE_VENU_DE = process.env.ISAAC_AI_PROVIDER ? 'ISAAC_AI_PROVIDER' : 'defaut (auto)';

  function ordre(mode) {
    const fs2 = fournisseurs();
    if (!mode || mode === 'auto') return fs2;
    return fs2.filter(function (f) { return f.nom === mode; })
      .concat(fs2.filter(function (f) { return f.nom !== mode; }));
  }
  function moteurActif() {
    const f = fournisseurs().filter(function (x) { return x.dispo; })[0];
    return f ? f.nom : 'aucun (tous les cerveaux sont eteints)';
  }
  // Un cerveau hors course n'est pas toujours un cerveau sans clé : GitHub a une clé
  // valide et un service retiré chez lui. Le HUD doit pouvoir les distinguer.
  function marque(f) {
    if (f.dispo) return '';
    return f.retire ? '(retire)' : '(eteint)';
  }
  function ordreReel() {
    const fs2 = fournisseurs();
    const tries = fs2.filter(function (f) { return f.dispo; }).map(function (f) { return f.nom; });
    const hors = fs2.filter(function (f) { return !f.dispo; });
    return (tries.length ? tries.join(' → ') : 'aucun cerveau disponible') +
      (hors.length ? ' · hors course : ' + hors.map(function (f) {
        return f.nom + (f.retire ? ' (service retire chez eux)' : ' (aucune cle cote serveur)');
      }).join(', ') : '');
  }

  let DERNIER = null;            // {fournisseur, modele, ms, quand, pour}
  let DERNIERE_RAISON = null;    // pourquoi la dernière demande n'a pas abouti
  const DIAGNOSTIC_LIBRE = [];   // dernier diagnostic de la porte publique (cerveau invité)

  // La première ligne du journal se grave au démarrage, pas à la première demande :
  // le HUD lit journal-ai.log dès l'ouverture, et « ce fichier existe » doit être vrai.
  journal('BOOT ' + (deps.ESSAI ? 'instance d essai' : 'instance prod') + ' — mode ' + MODE,
    'cerveaux tries : ' + fournisseurs().map(function (f) { return f.nom + marque(f); }).join(' > ') +
    ' | venu de ' + MODE_VENU_DE);

  // ---- demander() : l'arbitrage d'une demande de texte ---------------------
  // o = { timeout, moteur, pour, max_tokens, modele } — retourne du TEXTE ou null,
  // exactement comme l'ancien askAI, pour que les trente appels existants de
  // server.js n'aient pas à changer d'un caractère.
  async function demander(messages, o) {
    const recu = o || {};
    const force = recu.moteur ? lireMode(recu.moteur) : null;
    const mode = force || MODE;
    if (force && force !== MODE && force !== 'auto') {
      // Mode forcé à la volée (cerveau invité, génération) : c'est une décision
      // du code, pas un réglage persistant — elle se grave mais ne change pas MODE.
      journal('FORCE ' + force, recu.pour || 'demande ponctuelle');
    }
    const liste = ordre(mode);
    journal('DEPART ' + (recu.pour || 'demande') + ' — mode ' + mode,
      'essai dans l ordre : ' + liste.map(function (x) { return x.nom + marque(x); }).join(' > '));
    for (const f of liste) {
      if (!f.dispo) {
        // aucune clé, ou service retiré chez lui : aucun appel part, aucun compteur
        // ne bouge. Mais si Isaac a NOMMÉ ce cerveau, sauter en silence serait un
        // demi-mensonge — la raison vraie se grave et le HUD la montre.
        if (mode === f.nom) journal('SAUT ' + f.nom, String(f.raison || 'cerveau hors course').slice(0, 220));
        continue;
      }
      const fo = FOURS[f.nom];
      if (!fo) continue;
      // Pollinations garde SA propre échelle de délais : ne pas écraser ses
      // timeouts par un timeout de génération, ça avait été calibré sur place.
      const opts = f.nom === 'pollinations' ? { modele: recu.modele } : recu;
      let r = null;
      try { r = await fo.demander(messages, opts); }
      catch (e) { r = { ok: false, raison: 'exception ' + String((e && e.message) || e).slice(0, 90) }; }
      const ok = !!(r && r.ok && r.texte);
      noter(f.nom, ok, r && r.ms, r && r.raison);
      if (ok) {
        DERNIER = { fournisseur: f.nom, modele: r.modele || null, ms: r.ms || null, quand: Date.now(), pour: recu.pour || 'demande' };
        DERNIERE_RAISON = null;
        journal('REPONSE ' + f.nom + ' — ' + (r.modele || 'modele par defaut'),
          (r.ms || 0) + ' ms, ' + String(r.texte).length + ' caracteres');
        return r.texte;
      }
      DERNIERE_RAISON = String((r && r.raison) || ('rien de la part de ' + f.nom)).slice(0, 220);
      journal('ECHEC ' + f.nom, DERNIERE_RAISON);
    }
    journal('REPLI AUCUN CERVEAU', 'mode ' + mode + ' — les cerveaux tries ont tous refuse');
    return null;
  }

  // Un seul cerveau, sans échelle : c'est ce que la table ronde extérieure
  // utilisait en appelant askGitHubModels / askGemini directement.
  async function demanderUn(nom, messages, o) {
    const recu = o || {};
    const f = etatFour(nom);
    if (!f.dispo) {
      DERNIERE_RAISON = String(f.raison || 'cerveau eteint');
      return null;
    }
    let r = null;
    try { r = await FOURS[nom].demander(messages, recu); }
    catch (e) { r = { ok: false, raison: 'exception ' + String((e && e.message) || e).slice(0, 90) }; }
    const ok = !!(r && r.ok && r.texte);
    noter(nom, ok, r && r.ms, r && r.raison);
    if (!ok) { DERNIERE_RAISON = String((r && r.raison) || 'pas de texte').slice(0, 220); return null; }
    DERNIER = { fournisseur: nom, modele: r.modele || null, ms: r.ms || null, quand: Date.now(), pour: recu.pour || 'demande ciblee' };
    DERNIERE_RAISON = null;
    journal('REPONSE CIBLEE ' + nom + ' — ' + (r.modele || '?'), (r.ms || 0) + ' ms');
    return r.texte;
  }

  // La porte publique pour un cerveau INVITÉ : échelle courte, et le diagnostic
  // (code HTTP traduit) remonte pour que le message de repli cite le vrai motif.
  async function inviterLibre(messages) {
    const f = etatFour('pollinations');
    if (!FOURS.pollinations || !FOURS.pollinations.inviter) {
      return { texte: null, diagnostic: ['pollinations: connecteur absent'] };
    }
    let r = null;
    try { r = await FOURS.pollinations.inviter(messages); }
    catch (e) { r = { ok: false, diagnostic: ['pollinations: exception ' + String((e && e.message) || e).slice(0, 80)] }; }
    noter('pollinations', !!(r && r.ok && r.texte), r && r.ms, r && (r.raison || (r.diagnostic || []).join(' ; ')));
    const d = (r && r.diagnostic) || [];
    DIAGNOSTIC_LIBRE.length = 0;
    Array.prototype.push.apply(DIAGNOSTIC_LIBRE, d.map(function (x) { return 'reseau-libre(' + x + ')'; }));
    if (r && r.ok && r.texte) {
      DERNIER = { fournisseur: 'pollinations', modele: r.modele || null, ms: r.ms || null, quand: Date.now(), pour: 'cerveau invite' };
      journal('REPONSE invite — pollinations', 'cerveau exterieur nomme d apres ce moteur');
      return { texte: r.texte, diagnostic: DIAGNOSTIC_LIBRE.slice() };
    }
    return { texte: null, diagnostic: DIAGNOSTIC_LIBRE.slice() };
  }
  function diagnosticLibre() { return DIAGNOSTIC_LIBRE.slice(); }

  // ---- visionner() : les moteurs qui ont des yeux --------------------------
  // Le message d'Isaac peut porter une image. Seuls les cerveaux encore VIVANTS
  // sont essayés (github, retiré chez lui, est sauté : avant, chaque regard
  // perdait jusqu à trois fois 50 s sur un endpoint qui rend « OK »).
  // Ordre réel : Gemini (inline_data) puis Pollinations (une tentative).
  // NVIDIA est texte seulement ici — rien n'a été vérifié en vision de son côté,
  // donc rien n'est promis.
  async function visionner(dataUrl, question, system) {
    const m = String(dataUrl || '').match(/^data:([^;,]+)[^,]*,(.*)$/);
    if (!m || m[1].indexOf('image/') !== 0) return null;
    const mime = m[1], b64 = m[2];
    const o = { urlImage: 'data:' + mime + ';base64,' + b64, mime, b64, question, system };
    journal('DEPART vision', 'image ' + mime + ' — ' + Math.round(b64.length * 0.75 / 1024) + ' Ko');
    for (const f of fournisseurs()) {
      if (!f.dispo || !f.vision || !FOURS[f.nom]) continue;
      let r = null;
      try { r = await FOURS[f.nom].visionner(o); }
      catch (e) { r = { ok: false, raison: 'exception ' + String((e && e.message) || e).slice(0, 90) }; }
      const ok = !!(r && r.ok && r.texte);
      noter(f.nom, ok, r && r.ms, r && r.raison);
      if (ok) {
        DERNIER = { fournisseur: f.nom, modele: r.modele || null, ms: r.ms || null, quand: Date.now(), pour: 'vision' };
        DERNIERE_RAISON = null;
        journal('REPONSE VISION ' + f.nom + ' — ' + (r.modele || '?'), (r.ms || 0) + ' ms');
        return r.texte;
      }
      DERNIERE_RAISON = String((r && r.raison) || 'regard refuse par ' + f.nom).slice(0, 220);
      journal('ECHEC VISION ' + f.nom, DERNIERE_RAISON);
    }
    return null;
  }

  // ---- Le mode, lu et réglable ---------------------------------------------
  function mode() { return { mode: MODE, modes: MODES.slice(), vient_de: MODE_VENU_DE, moteur_actif: moteurActif() }; }
  function reglerMode(v) {
    const demande = String(v || '').toLowerCase().trim();
    if (MODES.indexOf(demande) === -1) {
      return { ok: false, mode: MODE, erreur: 'cerveau inconnu : « ' + demande.slice(0, 16) + ' » — les reglages reels sont ' + MODES.join(', ') };
    }
    const avant = MODE;
    MODE = demande;
    MODE_VENU_DE = 'regle a chaud le ' + new Date().toISOString().slice(11, 19);
    journal('MODE ' + avant + ' -> ' + MODE, 'decision prise cote serveur');
    try { deps.noterEvenement('IA', 'Mode IA change : ' + avant + ' -> ' + MODE); } catch (e) {}
    const e = etatFour(MODE);
    let avertissement = null;
    if (MODE !== 'auto' && !e.dispo) {
      // La raison se cite jusqu'à sa première phrase : une réponse coupée en plein
      // milieu (« Ce n est pas  La maison… ») est exactement le genre de phrase
      // bancale qu'Isaac relève dans la transcription vocale.
      const courte = String(e.raison || 'cerveau hors course').split(' — ')[0].slice(0, 160);
      avertissement = e.retire
        ? 'le cerveau que tu as nomme est retire chez eux (' + courte + '). La maison gardera l ordre auto, et la decision est gravee.'
        : 'le cerveau demande n a pas de cle cote serveur : la maison retombera sur l ordre auto, et ce repli sera grave';
    }
    return { ok: true, mode: MODE, avant, avertissement };
  }

  // Une phrase courte et VRAIE par cerveau, pour la voix comme pour le HUD.
  // Quatre cas, pas deux : une clé absente, une clé qui n'est pas demandée
  // (pollinations), une clé présente sur un service retiré, un cerveau vivant.
  function court(f) {
    const cle = String(f.cle_serveur || '');
    const yeux = f.vision ? ', avec les yeux' : ', texte seul';
    if (cle.indexOf('aucune') === 0) return 'sans cle — et il n en faut pas' + yeux;
    if (!f.dispo) return f.retire ? 'cle presente mais service retire chez eux' : 'eteint — aucune cle cote serveur';
    return 'cle presente' + yeux;
  }

  // ---- etat() : le sur-ensemble de l'ancien /api/ai/etat -------------------
  function etat() {
    const fs2 = fournisseurs();
    const dernier = fs2.filter(function (f) { return COMPTEURS[f.nom].dernier; })
      .sort(function (a, b) { return COMPTEURS[b.nom].dernier - COMPTEURS[a.nom].dernier; })[0];
    return {
      ok: true,
      engine: 'aiGateway — arbitre des cerveaux (Phase 4)',
      mode: MODE,
      modes_possibles: MODES.slice(),
      mode_vient_de: MODE_VENU_DE,
      ordre_reel: ordreReel(),
      moteur_actif: moteurActif(),
      fournisseurs: fs2.map(function (f) {
        const c = COMPTEURS[f.nom];
        return {
          nom: f.nom,
          configure: !!f.dispo,
          modele: f.dispo ? (f.modeles || []).join(' · ') : null,
          // Un cerveau hors course n'est pas forcément un cerveau sans clé : la
          // raison du connecteur passe avant toute formule toute faite.
          note: f.dispo ? (f.raison || null)
            : (f.raison || ('cerveau indisponible — ' + (f.cle_serveur === 'absente' ? 'aucune cle cote serveur' : 'raison non precisee'))),
          priorite: f.priorite,
          cle_serveur: f.cle_serveur || 'inconnue',
          retire: !!f.retire,
          court: court(f),
          protocole: f.protocole || null,
          vision: !!f.vision,
          compteurs: {
            appels: c.appels,
            succes: c.succes,
            echecs: c.echecs,
            ms_moyen: c.succes ? Math.round(c.ms_total / c.succes) : null,
            dernier: c.dernier
          }
        };
      }),
      dernier_fournisseur: dernier ? dernier.nom : null,
      derniere_reponse: DERNIER,
      derniere_raison: DERNIERE_RAISON,
      vision: {
        github: !!etAt('github', 'vision'), gemini: !!etAt('gemini', 'vision'),
        pollinations: !!etAt('pollinations', 'vision'), nvidia: false
      },
      journal: NOM_JOURNAL,
      total: NOMS.reduce(function (t, n) {
        t.appels += COMPTEURS[n].appels; t.succes += COMPTEURS[n].succes; t.echecs += COMPTEURS[n].echecs; return t;
      }, { appels: 0, succes: 0, echecs: 0 }),
      note_nvidia: 'NVIDIA NIM est un connecteur REEL (HTTPS/JSON compatible OpenAI, vérifié le 2026-10-04 : /v1/models répond 200, 81 modèles). Sans clé NVIDIA_API_KEY côté serveur il reste éteint et le HUD dit « non configuré » — jamais actif. La clé ne quitte jamais le serveur : seule sa présence est exposée.'
    };
  }
  function etAt(nom, champ) {
    const f = etatFour(nom);
    return !!(f.dispo && f[champ]);
  }

  // Une phrase vraie pour la voix : « quel cerveau t'a répondu », « état du cerveau IA ».
  function resume() {
    const e = etat();
    const qui = e.derniere_reponse
      ? 'Le dernier a avoir parlé est ' + e.derniere_reponse.fournisseur + (e.derniere_reponse.modele ? ' sur le modele ' + e.derniere_reponse.modele : '') +
        ', en ' + (e.derniere_reponse.ms || 0) + ' ms, pour ' + e.derniere_reponse.pour + '.'
      : 'Aucun cerveau n a encore répondu depuis le demarrage de cette instance.';
    const tries = e.fournisseurs.map(function (f) { return f.nom + (f.configure ? '' : (f.retire ? '(retire)' : '(eteint)')); }).join(' > ');
    return 'Mode ' + e.mode + '. Cerveaux tries dans l ordre : ' + tries + '. ' + qui +
      ' Depuis le demarrage : ' + e.total.appels + ' appel(s), ' + e.total.succes + ' reponse(s), ' + e.total.echecs + ' echec(s).' +
      (e.derniere_raison ? ' Dernier refus : ' + e.derniere_raison + '.' : '') +
      ' Journal : ' + e.journal + '.';
  }

  return {
    fournisseurs, demander, demanderUn, inviterLibre, diagnosticLibre, visionner,
    mode, reglerMode, etat, resume, moteurActif,
    compteurs: COMPTEURS, journal: NOM_JOURNAL, noms: NOMS
  };
}

module.exports = creerAIGateway;

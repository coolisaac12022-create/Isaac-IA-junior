// ============================================================================
//  VOICE ENGINE — l'arbitre des fournisseurs de voix du cerveau
// ----------------------------------------------------------------------------
//  Phase 3 du JARVIS COMMAND CENTER (2026-10-03). Avant ce fichier, server.js
//  parlait DIRECTEMENT au manager Piper : un seul fournisseur, choisi en dur.
//  Le spec d'Isaac demande un moteur MODULAIRE : des connecteurs, un arbitrage
//  AUTO, et jamais une promesse que le code ne tient pas.
//
//  L'ordre AUTO, et pourquoi :
//    1. nvidia_nim  — SEULEMENT si un pont HTTP local (ISAAC_NEMO_URL) existe :
//       la voix NIM hébergée est en gRPC, hors de portée d'un cerveau zéro
//       dépendance (voir nemoVoice.js). Sans pont, ce fournisseur est absent et
//       l'état le dit avec la vraie raison ;
//    2. piper_local — le réseau de neurones qui tourne sur ce PC, 100 % hors
//       ligne : c'est lui le moteur PRINCIPAL depuis le 2026-10-02 ;
//    3. navigateur  — le repli, côté page. Ce n'est pas un fournisseur du
//       serveur : quand tout refuse, la réponse porte {moteur:'repli', raison}
//       et c'est la page qui lit avec SA voix, en affichant la raison.
//
//  Contrat de sortie IDENTIQUE à l'ancien manager, en plus du champ
//  `fournisseur` : les deux pages (index.html et command-center.html) et
//  l'intent « quel est ton moteur de voix » continuent de marcher tels quels.
//  Rien n'est annoncé comme neuronal sans un WAV réel derrière.
// ============================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CACHE_DIR = path.join(__dirname, '..', '..', 'tts', 'cache');

function creerVoiceEngine(depsBruts) {
  const deps = Object.assign({ ESSAI: false, voieGenante: () => null }, depsBruts || {});
  const JOURNAL = path.join(__dirname, '..', '..', deps.ESSAI ? 'journal-voix.essai.log' : 'journal-voix.log');

  function journal(ligne, pourquoi) {
    const entree = new Date().toISOString().slice(11, 19) + ' ' + ligne + (pourquoi ? ' — ' + pourquoi : '');
    try { fs.appendFile(JOURNAL, entree + '\n', function () {}); } catch (e) {}
  }

  // ---- Fournisseur 1 : Piper, local, déjà prouvé ---------------------------
  let piper = null;
  let piperErreur = null;
  try {
    const creerVoixManager = require('../../tts/voix-manager.js');
    piper = creerVoixManager({ ESSAI: deps.ESSAI, voieGenante: deps.voieGenante });
  } catch (e) {
    piperErreur = String((e && e.message) || e).slice(0, 120);
  }

  // ---- Fournisseur 2 : NVIDIA NIM, honnête sur son absence ------------------
  let nemo = null;
  try {
    const creerNemoVoice = require('./nemoVoice.js');
    nemo = creerNemoVoice({ journal: journal });
  } catch (e) {
    nemo = null;
  }

  function fournisseurPiper() {
    if (!piper) {
      return { nom: 'piper_local', titre: 'Piper — reseau de neurones, 100 % local', priorite: 2, dispo: false, raison: 'le manager Piper ne s est pas charge dans ce cerveau : ' + (piperErreur || 'raison inconnue') };
    }
    let installe = false, raison = '';
    try { const e = piper.etat(); installe = !!e.installe; raison = String(e.raison || ''); } catch (e) { raison = 'etat Piper illisible : ' + e.message; }
    return { nom: 'piper_local', titre: 'Piper — reseau de neurones, 100 % local', priorite: 2, dispo: installe, raison: installe ? null : (raison || 'modeles ou binaire absents du disque') };
  }
  function fournisseurNemo() {
    if (!nemo) return { nom: 'nvidia_nim', titre: 'NVIDIA NIM (Riva / Nemotron TTS)', priorite: 1, dispo: false, raison: 'le connecteur NVIDIA ne s est pas charge dans ce cerveau' };
    const e = nemo.etat();
    return { nom: e.nom, titre: e.titre, priorite: 1, dispo: !!e.dispo, raison: e.raison, pont_http: e.pont_http, cle_serveur: e.cle_serveur, protocole_reel: e.protocole_reel };
  }
  function fournisseurs() {
    return [fournisseurNemo(), fournisseurPiper()].sort(function (a, b) { return a.priorite - b.priorite; });
  }
  function moteurActif() {
    const dispo = fournisseurs().filter(function (f) { return f.dispo; })[0];
    return dispo ? dispo.nom : 'navigateur (repli cote page)';
  }

  // ---- Le cache content-addressable, partagé avec Piper --------------------
  // Le WAV rendu par un pont NVIDIA y entre sous sa propre empreinte : le nom
  // EST le contenu, la route /voix/<64 hex>.wav n'a pas besoin de changer.
  function ecrireAuCache(prefixe, voix, longueur, texte, wav) {
    const cle = crypto.createHash('sha256').update(prefixe + '|' + voix + '|' + longueur + '|' + texte).digest('hex');
    const cible = path.join(CACHE_DIR, cle + '.wav');
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(cible, wav);
      return cle;
    } catch (e) {
      throw new Error('cache vocal inaccessible : ' + e.message);
    }
  }

  // ---- dire() : l'arbitrage --------------------------------------------------
  let derniereRaison = null;

  // o = { texte, parlence, langue, hauteur, debit, qualite, moteur? }
  // `moteur` permet de FORCER un fournisseur ('piper_local' | 'nvidia_nim') ;
  // 'auto' ou absent = l'ordre ci-dessus. Un fournisseur qui refuse passe la
  // main au suivant avec SA raison gravée au journal — jamais un silence.
  function dire(o) {
    const recu = o || {};
    const force = String(recu.moteur || 'auto');
    const ordre = fournisseurs().filter(function (f) { return force === 'auto' ? true : f.nom === force; });
    if (force !== 'auto' && !ordre.length) {
      return Promise.resolve({ moteur: 'repli', raison: 'fournisseur de voix inconnu : ' + force.slice(0, 24) + ' — les fournisseurs reels sont listes dans /api/voix/etat' });
    }
    return ordre.reduce(function (chaine, f) {
      return chaine.then(function (r) {
        if (r) return r;
        if (f.nom === 'nvidia_nim') return direNemo(recu);
        if (f.nom === 'piper_local') return direPiper(recu);
        return Promise.resolve(null);
      });
    }, Promise.resolve(null)).then(function (r) {
      if (r) return r;
      // Tout le monde a refuse : le repli navigateur, avec la derniere vraie raison.
      return { moteur: 'repli', raison: derniereRaison || 'aucun fournisseur de voix neuronal n a pu synthetiser cette phrase', fournisseurs: fournisseurs().map(function (f) { return f.nom; }) };
    });
  }

  function direPiper(recu) {
    if (!piper) { derniereRaison = 'manager Piper absent de ce cerveau'; return Promise.resolve(null); }
    return piper.dire(recu).then(function (r) {
      if (r && r.moteur === 'neuronal') r.fournisseur = 'piper_local';
      else if (r && r.moteur === 'repli') derniereRaison = String(r.raison || '');
      return (r && r.moteur === 'neuronal') ? r : null;
    }).catch(function (e) {
      derniereRaison = 'Piper en erreur : ' + String((e && e.message) || e).slice(0, 90);
      journal('ECHEC moteur piper_local', derniereRaison);
      return null;
    });
  }

  function direNemo(recu) {
    if (!nemo || !nemo.dispo()) {
      const r = nemo ? nemo.raison() : 'connecteur NVIDIA absent';
      if (String(recu.moteur || 'auto') === 'nvidia_nim') derniereRaison = r;   // forcé : la raison doit se voir
      return Promise.resolve(null);
    }
    const hauteur = Math.max(0.7, Math.min(1.6, Number(recu.hauteur) || 1));
    return nemo.synthetiser({ texte: recu.texte, voix: recu.parlence, langue: recu.langue }).then(function (wav) {
      const cle = ecrireAuCache('nemo1', String(recu.parlence || 'aelyra'), hauteur.toFixed(2), String(recu.texte || ''), wav);
      journal('NEURONAL nvidia_nim', wav.length + ' octets via le pont HTTP — ' + String(recu.texte || '').slice(0, 48));
      return {
        moteur: 'neuronal', fournisseur: 'nvidia_nim', url: '/voix/' + cle + '.wav',
        lecture: hauteur, modele: 'nemo-' + String(recu.parlence || 'aelyra'),
        parlence: recu.parlence, langue: 'fr', octets: wav.length, cache: false
      };
    }).catch(function (e) {
      derniereRaison = 'pont NVIDIA : ' + String((e && e.message) || e).slice(0, 90);
      journal('ECHEC moteur nvidia_nim', derniereRaison);
      return null;
    });
  }

  // ---- etat() : un sur-ensemble de l'ancien, pour que rien ne casse ---------
  function etat() {
    let base = null;
    if (piper) {
      try { base = piper.etat(); } catch (e) { base = { ok: false, installe: false, raison: 'etat Piper illisible : ' + e.message }; }
    } else {
      base = { ok: false, installe: false, raison: 'le manager Piper ne s est pas charge dans ce cerveau : ' + (piperErreur || 'raison inconnue'), moteur: 'voix Windows du navigateur' };
    }
    const fs2 = fournisseurs();
    return Object.assign({}, base, {
      engine: 'voiceEngine — arbitre des fournisseurs (Phase 3)',
      fournisseurs: fs2,
      moteur_actif: moteurActif(),
      instance: deps.ESSAI ? 'essai' : 'prod'
    });
  }

  function resume() {
    if (piper) { try { return piper.resume(); } catch (e) {} }
    const e = etat();
    return 'Voix : ' + (e.raison || 'aucun fournisseur neuronal') + '. En attendant, c est la voix du navigateur qui parle.';
  }

  return { dire: dire, etat: etat, resume: resume, fournisseurs: fournisseurs, moteurActif: moteurActif };
}

module.exports = creerVoiceEngine;

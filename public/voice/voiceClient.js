// ============================================================================
//  VOICE CLIENT — le client voix partagé du JARVIS COMMAND CENTER
// ----------------------------------------------------------------------------
//  Isaac a dessiné l'architecture :  ISAAC -> (voix | texte) -> VOICE MANAGER
//  -> TTS neuronal -> haut-parleur. Ce fichier est le bout « ISAAC » : il ne
//  choisit JAMAIS une voix dans son coin, il demande au Voice Manager du
//  cerveau (POST /api/voix) et joue ce qui revient.
//
//  Règle de la maison, celle qui a coûté le plus cher à apprendre :
//    1. le neuronal local (Piper) est le moteur PRINCIPAL — speechSynthesis
//       n'est plus que le repli, et quand il prend le relais la raison réelle
//       est affichée, jamais cachée ;
//    2. les personnalités ne se simulent PAS avec le pitch du navigateur :
//       chaque agente parle avec un VRAI modèle de voix (siwis = femme,
//       gilles/tom = homme), le pitch et le débit ne font que l'ajuster ;
//    3. les morsceaux sont courts (130 caractères) : 8 s de silence avant le
//       premier son avec 210 caractères, 1,3 s avec 130. Mesuré, pas deviné ;
//    4. playbackRate = lecture ET preservesPitch = false — sinon la
//       compensation du serveur annule le réglage et le timbre ne fait rien.
//
//  Les réglages de timbre/débit/langue sont LUS dans la même clé localStorage
//  que l'interface historique ('ij-voix') : une seule source de vérité pour les
//  deux pages. Les champs propres au Command Center (volume, interruption,
//  parole automatique, moteur préféré) vivent dans 'ij-voix-profil'.
// ============================================================================
(function () {
  'use strict';

  const CLE_CONF = 'ij-voix';           // partagée avec l'interface historique
  const CLE_PROFIL = 'ij-voix-profil';  // propre au Command Center
  const AGENTS = ['aelyra', 'jeanette', 'onyx', 'aegis', 'business', 'autre'];
  const GENRE_ATTENDU = { aelyra: 'f', jeanette: 'f', onyx: 'm', aegis: 'm', business: 'f', autre: '?' };

  // Profil par agente : ce que le spec demande, champ par champ.
  // PHASE 6 — deux regles separees, parce que le serveur en distingue deux :
  //   `fournisseur` = QUI synthetise (auto / piper_local / nvidia_nim) -> champ `moteur` du POST ;
  //   `qualite`     = LE MODELE utilise (rapide = petit, qualite = grand) -> champ `qualite`.
  // L ancien champ `moteur` du profil valait « qualite » : il est migré a la lecture,
  // un profil grave hier continue de parler comme hier.
  const FOURNISSEURS_CLIENT = ['auto', 'piper_local', 'nvidia_nim'];
  const PROFIL_DEFAUT = {
    aelyra:   { volume: 1, hauteur: 1.05, debit: 1.04, langue: 'auto', interruptible: true, autoParle: true, fournisseur: 'auto', qualite: 'rapide', voixNavigateur: '' },
    jeanette: { volume: 1, hauteur: 0.95, debit: 0.99, langue: 'auto', interruptible: true, autoParle: true, fournisseur: 'auto', qualite: 'rapide', voixNavigateur: '' },
    onyx:     { volume: 1, hauteur: 0.85, debit: 0.90, langue: 'auto', interruptible: true, autoParle: true, fournisseur: 'auto', qualite: 'rapide', voixNavigateur: '' },
    aegis:    { volume: 1, hauteur: 0.95, debit: 0.98, langue: 'auto', interruptible: true, autoParle: true, fournisseur: 'auto', qualite: 'rapide', voixNavigateur: '' },
    business: { volume: 1, hauteur: 1.00, debit: 1.06, langue: 'auto', interruptible: true, autoParle: true, fournisseur: 'auto', qualite: 'rapide', voixNavigateur: '' },
    autre:    { volume: 1, hauteur: 1.18, debit: 1.08, langue: 'auto', interruptible: true, autoParle: true, fournisseur: 'auto', qualite: 'rapide', voixNavigateur: '' }
  };

  let profils = {};
  try {
    const lu = JSON.parse(localStorage.getItem(CLE_PROFIL) || '{}');
    AGENTS.forEach(function (a) { profils[a] = Object.assign({}, PROFIL_DEFAUT[a], lu[a] || {}); });
  } catch (e) {
    AGENTS.forEach(function (a) { profils[a] = Object.assign({}, PROFIL_DEFAUT[a]); });
  }
  function sauverProfils() { try { localStorage.setItem(CLE_PROFIL, JSON.stringify(profils)); } catch (e) {} }

  // Timbre/débit/langue réglés depuis l'interface historique : on les respecte.
  function confPartagee(agent) {
    try {
      const c = JSON.parse(localStorage.getItem(CLE_CONF) || '{}');
      return c[agent] || null;
    } catch (e) { return null; }
  }
  function profilEffectif(agent) {
    const a = profils[agent] ? agent : 'aelyra';
    const p = Object.assign({}, profils[a]);
    // Migration du vieux champ `moteur` (il valait le niveau de qualite) : un profil
    // grave avant la Phase 6 continue de donner exactement la meme voix.
    if (p.moteur === 'qualite' && !p.qualite) p.qualite = 'qualite';
    if (p.moteur && FOURNISSEURS_CLIENT.indexOf(p.moteur) >= 0 && p.moteur !== 'auto' && !p.fournisseur) p.fournisseur = p.moteur;
    if (!p.fournisseur) p.fournisseur = 'auto';
    if (p.qualite !== 'qualite') p.qualite = 'rapide';
    const c = confPartagee(a);
    if (c) {
      if (typeof c.hauteur === 'number' && isFinite(c.hauteur)) p.hauteur = c.hauteur;
      if (typeof c.debit === 'number' && isFinite(c.debit)) p.debit = c.debit;
      if (c.langue) p.langue = c.langue;
      if (c.voix) p.voixNavigateur = c.voix;
    }
    p.agent = a;
    return p;
  }

  // ------------------------------ État du moteur ---------------------------
  let MOTEUR = null;          // dernier /api/voix/etat connu
  let MOTEUR_LU = 0;
  let echecs = 0;             // échecs neuronaux consécutifs
  let derniereRaison = null;  // la VRAIE raison du dernier repli
  const abonnesEtat = [];

  async function moteurEtat(force) {
    if (!force && MOTEUR && (Date.now() - MOTEUR_LU) < 120000) return MOTEUR;
    try {
      const r = await fetch('api/voix/etat', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      MOTEUR = await r.json();
      MOTEUR_LU = Date.now();
      echecs = 0;
    } catch (e) {
      // Un état illisible n'est PAS « le neuronal marche » : on le dit tel quel.
      MOTEUR = { ok: false, installe: false, raison: 'etat du moteur illisible : ' + (e && e.message || e) };
    }
    publierEtat();
    return MOTEUR;
  }

  function neuronalDispo() {
    return !!(MOTEUR && MOTEUR.installe && echecs < 3);
  }

  function publierEtat() {
    const snap = {
      neuronal: !!(MOTEUR && MOTEUR.installe),
      moteur: (MOTEUR && (MOTEUR.moteur || (MOTEUR.installe ? 'Piper (neuronal local)' : 'voix du navigateur'))) || 'inconnu',
      modeles: (MOTEUR && MOTEUR.modeles_installes) || [],
      raisonRepli: derniereRaison,
      echecsConsecutifs: echecs,
      ramLibreMo: (MOTEUR && MOTEUR.ram_libre_mo) || null,
      cache: (MOTEUR && MOTEUR.cache && MOTEUR.cache.nb) || 0,
      // Phase 6 : ce que le cerveau ARBITRE, pas ce qu on souhaite. Le panneau Reglages
      // ne propose que ces noms-la, et il dit franchement si celui choisi est eteint.
      fournisseurs: (MOTEUR && MOTEUR.fournisseurs) || [],
      moteurActif: (MOTEUR && MOTEUR.moteur_actif) || null,
      instance: (MOTEUR && MOTEUR.instance) || null
    };
    abonnesEtat.forEach(function (f) { try { f(snap); } catch (e) {} });
  }

  // --------------------------------- Découpe -------------------------------
  // ------------------- Ce qui doit être PRONONCÉ, pas affiché ---------------
  // Porté tel quel de l'interface historique (app.js, prouvé le 2026-10-02) :
  // une IP se lit par blocs, un port sans « /tcp », une empreinte jamais lettre
  // par lettre. Avant la Phase 3, seule index.html en bénéficiait : le Command
  // Center lisait les adresses brut. Un seul moteur de voix = un seul shaping.
  function speechClean(t) {
    return String(t || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/([0-9])\s*[*xX]\s*([0-9])/g, '$1 fois $2')
      .replace(/(\d)\s*\/\s*(\d)/g, '$1 sur $2')
      .replace(/[*_~`]+/g, '')
      .replace(/(#{1,6})\s*/g, ' ')
      .replace(/^\s*[-•●▪◦]+\s+/gm, '')
      .replace(/[—–]/g, ', ')
      .replace(/\|/g, ' ')
      .replace(/https?:\/\/\S+/g, 'le site indiqué')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  function textePrononçable(t) {
    let s = speechClean(t);
    s = s.replace(/\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/gi, function () { return 'une adresse reseau'; });
    s = s.replace(/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g, '$1, $2, $3, $4');
    s = s.replace(/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g, '$1, $2, $3');
    s = s.replace(/\b\d+[-.]\d+[-.]\d+\.\d+\b/g, 'une plage d adresses');
    s = s.replace(/\b(\d+)\/(?:tcp|udp)\b/gi, '$1');
    s = s.replace(/sha-?\s?256/gi, 'cha');
    s = s.replace(/\b([0-9a-f]{12,})\b/gi, 'une empreinte');
    s = s.replace(/\b(\d+),(\d+)\b/g, '$1 virgule $2');
    s = s.replace(/[«»]/g, ' ');
    s = s.replace(/\\/g, ' ');
    s = s.replace(/\blocalhost\b/gi, 'lo kal host');
    s = s.replace(/\s{2,}/g, ' ').trim();
    return s;
  }

  // ------------------------- La langue, PAR PHRASE -------------------------
  // Un rapport peut mêler français et anglais : chaque phrase est lue dans SA
  // langue, jamais un paragraphe anglais noyé dans une voix française.
  const MOTS_LANGUE = {
    'fr-FR': ['le', 'la', 'les', 'des', 'une', 'un', 'est', 'sont', 'vous', 'nous', 'pour', 'avec', 'sur', 'dans', 'votre', 'notre', 'cette', 'ce', 'je', 'que', 'qui', 'quoi', 'comment', 'voici', 'apres', 'avant', 'tres', 'bien', 'aussi', 'toujours', 'jamais', 'fait', 'porte', 'adresse', 'fiche', 'scan', 'rapport', 'd’Isaac', 'Isaac'],
    'en-US': ['the', 'and', 'is', 'are', 'you', 'your', 'with', 'for', 'that', 'this', 'from', 'have', 'has', 'not', 'will', 'would', 'could', 'about', 'there', 'their', 'which', 'what', 'when', 'where', 'please', 'report', 'server', 'found', 'risk', 'open', 'host'],
    'es-ES': ['el', 'los', 'las', 'una', 'que', 'por', 'con', 'para', 'esta', 'son', 'muy', 'como', 'tiene', 'nuestro', 'gracias'],
    'de-DE': ['der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'auch', 'werden', 'kann', 'dieses', 'sie'],
    'it-IT': ['il', 'gli', 'che', 'per', 'con', 'questa', 'sono', 'molto', 'come', 'grazie'],
    'pt-BR': ['uma', 'que', 'com', 'para', 'esta', 'sao', 'muito', 'como', 'nao', 'obrigado']
  };
  function detecterLangue(t) {
    const mots = String(t || '').toLowerCase().split(/[^a-zà-ÿ’]+/).filter(Boolean);
    if (!mots.length) return 'fr-FR';
    const scores = {};
    for (const code in MOTS_LANGUE) scores[code] = 0;
    for (const w of mots) { for (const code in MOTS_LANGUE) { if (MOTS_LANGUE[code].indexOf(w) !== -1) scores[code]++; } }
    let best = 'fr-FR', bestN = scores['fr-FR'] || 0;
    for (const code in scores) {
      if (code === 'fr-FR') continue;
      if (scores[code] >= 3 && scores[code] > bestN) { best = code; bestN = scores[code]; }
    }
    return best;
  }

  // ------------------------------- Découpe ---------------------------------
  // Découpe sur les vraies respirations, jamais au milieu d'un mot, et jamais
  // une phrase d'une langue collée à une phrase d'une autre. Porté de app.js :
  // c'est ce qui a remplacé la lecture coupée nette au bout de quinze secondes.
  function decouper(t, max) {
    const phrases = String(t).match(/[^.!?…\n]+[.!?…]*/g) || [];
    const out = [];
    let courant = '';
    let langueCourante = null;
    const pousser = function () { if (courant) { out.push(courant); courant = ''; langueCourante = null; } };
    for (let ph of phrases) {
      ph = String(ph || '').trim();
      if (!ph) continue;
      const languePhrase = detecterLangue(ph);
      if (courant && langueCourante && languePhrase !== langueCourante) pousser();
      let garde = 0;
      while (ph.length > max && garde++ < 40) {
        let coupe = ph.lastIndexOf(',', max);
        if (coupe < Math.floor(max * 0.45)) coupe = ph.lastIndexOf(' ', max);
        if (coupe < Math.floor(max * 0.45)) coupe = max;
        const tete = ph.slice(0, coupe + 1).trim();
        pousser();
        if (tete) out.push(tete);
        ph = ph.slice(coupe + 1).trim();
      }
      if (!ph) continue;
      if (courant && (courant + ' ' + ph).length > max) pousser();
      courant = (courant ? courant + ' ' : '') + ph;
      if (!langueCourante) langueCourante = languePhrase;
    }
    pousser();
    return out.length ? out : [String(t)];
  }

  // ------------------------------- Lecture ---------------------------------
  let audio = null;
  let session = 0;
  let enTrain = false;
  let agentEnTrain = null;
  const abonnesParole = [];

  function publierParole() {
    const snap = { parle: enTrain, agent: agentEnTrain };
    abonnesParole.forEach(function (f) { try { f(snap); } catch (e) {} });
  }

  function couper() {
    session++;
    enTrain = false; agentEnTrain = null;
    if (audio) { try { audio.pause(); audio.src = ''; } catch (e) {} audio = null; }
    if ('speechSynthesis' in window) { try { window.speechSynthesis.cancel(); } catch (e) {} }
    publierParole();
  }

  async function demanderNeuronal(morceau, agent, p) {
    const r = await fetch('api/voix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texte: morceau,
        parlence: agent,
        langue: p.langue === 'auto' ? undefined : p.langue,
        hauteur: p.hauteur,
        debit: p.debit,
        qualite: (p.qualite === 'qualite' || p.moteur === 'qualite') ? 'qualite' : 'rapide',
        // Phase 6 : le fournisseur PREFERE de l agente (regle dans Settings) est envoye
        // sous le nom reel que le serveur connait. « auto » = ne rien forcer, laisse le
        // cerveau arbitrer — et un nom que le serveur ne connait pas ne part jamais d ici.
        moteur: (p.fournisseur && p.fournisseur !== 'auto' && FOURNISSEURS_CLIENT.indexOf(p.fournisseur) >= 0)
          ? p.fournisseur : undefined
      })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  function jouerWav(rep, p, maSession) {
    return new Promise(function (resolve) {
      if (maSession !== session) return resolve('coupe');
      if (!rep || rep.moteur !== 'neuronal' || !rep.url) return resolve('repli');
      const a = new Audio(rep.url);
      audio = a;
      // Le serveur a déjà compensé la durée : on joue à la vitesse demandée SANS
      // conserver la hauteur, sinon le timbre réglé par Isaac ne s'entend pas.
      try { a.playbackRate = Number(rep.lecture) || 1; } catch (e) {}
      try { a.preservesPitch = false; } catch (e) {}
      try { a.mozPreservesPitch = false; } catch (e) {}
      try { a.volume = Math.max(0, Math.min(1, Number(p.volume) || 1)); } catch (e) {}
      let fini = false;
      const terminer = function (pourquoi) { if (fini) return; fini = true; clearTimeout(chien); audio = null; resolve(pourquoi); };
      const chien = setTimeout(function () { terminer('erreur'); }, 90000);
      a.onended = function () { terminer('fini'); };
      a.onerror = function () { terminer('erreur'); };
      const demarrer = a.play();
      if (demarrer && demarrer.catch) demarrer.catch(function () { terminer('erreur'); });
    });
  }

  // Le saut de qualité s'appelle « natural » : les voix neuronales de
  // Windows/Edge portent ce mot dans leur nom. Rien n'est inventé — si aucune
  // n'est là, on prend la mieux notée des voix locales. GENRE : Onyx et Aegis
  // sont des hommes, Aelyra et Jeanette des femmes ; une voix ne porte son
  // genre que dans son nom, et si le navigateur n'a qu'une voix de femme on le
  // DIT (infoVoixRetenue) au lieu de faire semblant.
  const GENRE_MASCU = /(?:^|[^\p{L}])(paul|henri|thomas|antoine|rene|renee|claude|bernard|marc|jean|nicolas|david|mark|james|daniel|georges?|fred|conrad|erwan|matteo|diego|carlos|michel|pablo|remy|male|homme|man|guy)(?![\p{L}])/iu;
  const GENRE_FEMIN = /(?:^|[^\p{L}])(julie|denise|audrey|amelie|virginie|celine|marie|vivienne|charline|eloise|suzette|chantal|nadia|hortense|zira|colette|marta|ines|inés|leah|heidi|aria|jenny|susan|linda|sandy|kate|catherine|sonia|female|femme|woman|amethyst)(?![\p{L}])/iu;
  function genreDe(v) {
    const n = String((v && v.name) || '');
    const m = GENRE_MASCU.test(n), f = GENRE_FEMIN.test(n);
    if (m && !f) return 'm';
    if (f && !m) return 'f';
    return '?';
  }
  function noteVoix(v, baseLangue, attendu) {
    const n = String(v.name || '');
    let s = 0;
    if (/natural|neural|neuronal/i.test(n)) s += 25;   // une voix neuronale passe devant une classique
                                                       // DU MÊME genre : un homme ne prend pas une voix de femme
    if (/^(?:Microsoft\s+)?(?:julie|paul|denise|henri|eloise|audrey|michelle|thomas|nicole|vivienne|sylvie|remy|jacques|alfred|serge|colette|marta|leah|conrad|catarina|aria|guy)/i.test(n)) s += 16;
    if (/hortense|zira|david|mark|hector|pablo|linda|carlos/i.test(n)) s -= 6;
    if (v.localService) s += 5;
    if (String(v.lang || '').toLowerCase().indexOf(baseLangue) === 0) s += 14;
    if (/^fr/i.test(String(v.lang || ''))) s += 2;
    if (v.default) s += 3;
    if (attendu && attendu !== '?') {
      const g = genreDe(v);
      if (g === attendu) s += 22;
      else if (g !== '?') s -= 18;
    }
    return s;
  }

  function voixNavigateur(p, langue) {
    if (!('speechSynthesis' in window)) return null;
    let liste = [];
    try { liste = window.speechSynthesis.getVoices() || []; } catch (e) { liste = []; }
    if (!liste.length) return null;
    if (p.voixNavigateur) {
      const choisie = liste.filter(function (v) { return (v.voiceURI || v.name) === p.voixNavigateur; })[0];
      if (choisie) return choisie;   // la voix choisie a peut-être disparu : on retombe sur l'automatique
    }
    const base = String(langue || 'fr').toLowerCase().slice(0, 2);
    const dansLaLangue = liste.filter(function (v) { return String(v.lang || '').toLowerCase().indexOf(base) === 0; });
    const repli = dansLaLangue.length ? dansLaLangue : liste.filter(function (v) { return String(v.lang || '').toLowerCase().indexOf('fr') === 0; });
    const pool = repli.length ? repli : liste;
    if (!pool.length) return null;
    const attendu = GENRE_ATTENDU[p.agent] || '?';
    return pool.slice().sort(function (a, b) { return noteVoix(b, base, attendu) - noteVoix(a, base, attendu); })[0] || null;
  }

  function parlerNavigateur(morceau, p, langue, maSession) {
    return new Promise(function (resolve) {
      if (!('speechSynthesis' in window)) {
        derniereRaison = 'ce navigateur n expose aucune synthese vocale : le texte s affiche, rien n est lu';
        return resolve('erreur');
      }
      const v = voixNavigateur(p, langue);
      if (!v) {
        derniereRaison = 'aucune voix installee dans ce navigateur pour ' + langue + ' : repli impossible, le texte s affiche seulement';
        return resolve('erreur');
      }
      const u = new SpeechSynthesisUtterance(morceau);
      u.voice = v; u.lang = v.lang || langue;
      u.rate = Math.max(0.5, Math.min(2, Number(p.debit) || 1));
      u.pitch = Math.max(0, Math.min(2, Number(p.hauteur) || 1));
      u.volume = Math.max(0, Math.min(1, Number(p.volume) || 1));
      let fini = false;
      const terminer = function (pourquoi) { if (fini) return; fini = true; clearTimeout(chien); clearInterval(gardien); resolve(pourquoi); };
      const chien = setTimeout(function () { terminer('erreur'); }, 60000);
      // Chromium peut endormir une longue lecture sans raison : un resume
      // périodique la tient éveillée. Porté de app.js (2026-10-02), où son
      // absence faisait taire les rapports au bout de quinze secondes.
      const gardien = setInterval(function () {
        try { if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) window.speechSynthesis.resume(); } catch (e) {}
      }, 8000);
      u.onend = function () { terminer('fini'); };
      u.onerror = function () { terminer('erreur'); };
      try { window.speechSynthesis.speak(u); } catch (e) { terminer('erreur'); }
    });
  }

  // Ce que CETTE PAGE a réellement joué : le panneau 🗣 d'index.html et celui
  // du Command Center lisent les mêmes chiffres, aucun des deux ne les invente.
  const STATS = { phrases: 0, replis: 0, echecs: 0, dernierRepli: '', dernierModele: '' };

  // --------------------- Le catalogue du navigateur ------------------------
  // Rien n'est inventé : la liste vient de speechSynthesis.getVoices() du
  // navigateur OUVERT. Ce que la page voit est ce que la machine peut faire —
  // et ce qu'elle ne peut pas (aucune voix neuronale exposée sur ce PC).
  let voices = [];
  function rafraichirVoix() {
    try { voices = (window.speechSynthesis ? window.speechSynthesis.getVoices() : []) || []; } catch (e) { voices = []; }
    return voices;
  }
  rafraichirVoix();
  if ('speechSynthesis' in window) { try { window.speechSynthesis.onvoiceschanged = rafraichirVoix; } catch (e) {} }
  function estNeuronale(v) { return /natural|neural|neuronal/i.test(String((v && v.name) || '')); }
  function languesDisponibles() {
    rafraichirVoix();
    const set = {};
    for (const v of voices) { const c = String(v.lang || '').slice(0, 5); if (c) set[c] = (set[c] || 0) + 1; }
    return Object.keys(set).sort().map(function (c) { return { code: c, nb: set[c] }; });
  }
  function voixPour(langue, agent) {
    rafraichirVoix();
    return voixNavigateur(profilEffectif(agent), langue);
  }

  // ------------------------------ L'API publique ---------------------------
  async function parler(texte, opts) {
    const o = opts || {};
    const agent = AGENTS.indexOf(String(o.agent || '').toLowerCase()) >= 0 ? String(o.agent).toLowerCase() : 'aelyra';
    const p = profilEffectif(agent);
    if (o.silencieux === true) return { lu: false, raison: 'lecture demandee silencieuse' };

    // Interruptible : une nouvelle prise de parole coupe la précédente. Sinon on
    // attend — et on le dit, au lieu de faire semblant d'avoir tout lu.
    if (enTrain) {
      if (!p.interruptible) return { lu: false, raison: 'une parole est deja en cours et cette agente est reglee non interruptible' };
      couper();
    }

    const maSession = ++session;
    await moteurEtat(false);

    let neurOk = neuronalDispo();
    const taille = neurOk ? 130 : 210;
    // Le texte est PRONONÇABLE avant d'être découpé : une IP, un port, une
    // empreinte ne se lisent pas comme ils s'écrivent. opts.dejaPrononce pour
    // un appelant qui a déjà fait le travail lui-même.
    const brut = o.dejaPrononce ? String(texte || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : textePrononçable(texte);
    const liste = decouper(brut, taille);
    if (!liste.length) return { lu: false, raison: 'rien a lire' };

    enTrain = true; agentEnTrain = agent; publierParole();

    let neuronal = 0, repli = 0, echoue = 0;
    let prochaine = neurOk ? demanderNeuronal(liste[0], agent, p).catch(function (e) { derniereRaison = 'requete vocale en echec : ' + (e && e.message || e); return null; }) : Promise.resolve(null);

    for (let i = 0; i < liste.length; i++) {
      if (maSession !== session) { enTrain = false; agentEnTrain = null; publierParole(); return { lu: false, raison: 'coupe par une nouvelle demande', morceaux: i }; }
      const rep = await prochaine;
      // Prépare le morsceau suivant PENDANT que celui-ci joue : c'est ce qui a
      // fait passer l'attente de 8 s à 1,3 s.
      if (i + 1 < liste.length) {
        prochaine = neurOk
          ? demanderNeuronal(liste[i + 1], agent, p).catch(function (e) { derniereRaison = 'requete vocale en echec : ' + (e && e.message || e); return null; })
          : Promise.resolve(null);
      }
      const langue = (p.langue && p.langue !== 'auto') ? p.langue : detecterLangue(liste[i]);
      if (rep && rep.moteur === 'neuronal') {
        const r = await jouerWav(rep, p, maSession);
        if (r === 'fini') {
          neuronal++; echecs = 0; derniereRaison = null;
          STATS.phrases++; STATS.dernierModele = String(rep.modele || rep.fournisseur || '');
          continue;
        }
        if (r === 'coupe') { enTrain = false; agentEnTrain = null; publierParole(); return { lu: false, raison: 'coupe', morceaux: i }; }
        echecs++; STATS.echecs++; derniereRaison = 'le WAV neuronal n a pas pu etre joue (' + r + ') — repli sur la voix du navigateur';
      } else if (rep && rep.moteur === 'repli') {
        echecs++;
        derniereRaison = String(rep.raison || 'le moteur neuronal a laisse la place a Windows');
        STATS.replis++; STATS.dernierRepli = derniereRaison;
      } else if (neurOk) {
        echecs++;
        STATS.replis++; STATS.dernierRepli = derniereRaison || 'requete vocale sans reponse';
      }
      if (echecs >= 3) { neurOk = false; }
      const r2 = await parlerNavigateur(liste[i], p, langue, maSession);
      if (r2 === 'fini') repli++; else { echoue++; STATS.echecs++; }
    }

    enTrain = false; agentEnTrain = null; publierParole();
    publierEtat();
    return {
      lu: (neuronal + repli) > 0,
      neuronal: neuronal,
      repli: repli,
      echoue: echoue,
      agent: agent,
      raisonRepli: derniereRaison,
      moteur: neuronal > 0 ? 'Piper (neuronal local)' : (repli > 0 ? 'voix du navigateur (repli)' : 'aucun')
    };
  }

  window.VoiceClient = {
    AGENTS: AGENTS,
    PROFIL_DEFAUT: PROFIL_DEFAUT,
    profils: function () { return JSON.parse(JSON.stringify(profils)); },
    profil: profilEffectif,
    setProfil: function (agent, patch) {
      if (!profils[agent]) return null;
      profils[agent] = Object.assign({}, profils[agent], patch || {});
      sauverProfils();
      return JSON.parse(JSON.stringify(profils[agent]));
    },
    resetProfil: function (agent) {
      if (!PROFIL_DEFAUT[agent]) return null;
      profils[agent] = Object.assign({}, PROFIL_DEFAUT[agent]);
      sauverProfils();
      return JSON.parse(JSON.stringify(profils[agent]));
    },
    moteurEtat: moteurEtat,
    moteurBrut: function () { return MOTEUR; },
    // La liste CLOSE des noms que le serveur accepte, et celle qu il declare allumes.
    fournisseursConnus: function () { return FOURNISSEURS_CLIENT.slice(); },
    fournisseursDeclare: function (nom) {
      const l = (MOTEUR && MOTEUR.fournisseurs) || [];
      for (let i = 0; i < l.length; i++) if (l[i] && l[i].nom === nom) return l[i];
      return null;
    },
    neuronalDispo: neuronalDispo,
    stats: function () { return Object.assign({}, STATS); },
    textePrononçable: textePrononçable,
    detecterLangue: detecterLangue,
    decouper: decouper,
    voixPour: voixPour,
    genreDe: genreDe,
    noteVoix: noteVoix,
    estNeuronale: estNeuronale,
    languesDisponibles: languesDisponibles,
    rafraichirVoix: rafraichirVoix,
    parler: parler,
    couper: couper,
    parle: function () { return enTrain; },
    onMoteur: function (f) { if (typeof f === 'function') { abonnesEtat.push(f); f(); } },
    onParole: function (f) { if (typeof f === 'function') { abonnesParole.push(f); f({ parle: enTrain, agent: agentEnTrain }); } }
  };

  // L'état du moteur est lu au chargement : la page sait tout de suite si elle
  // parle en neuronal local ou en repli, et elle le dit au lieu de le deviner.
  moteurEtat(true);
})();

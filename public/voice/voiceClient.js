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
  const PROFIL_DEFAUT = {
    aelyra:   { volume: 1, hauteur: 1.05, debit: 1.04, langue: 'auto', interruptible: true, autoParle: true, moteur: 'auto', voixNavigateur: '' },
    jeanette: { volume: 1, hauteur: 0.95, debit: 0.99, langue: 'auto', interruptible: true, autoParle: true, moteur: 'auto', voixNavigateur: '' },
    onyx:     { volume: 1, hauteur: 0.85, debit: 0.90, langue: 'auto', interruptible: true, autoParle: true, moteur: 'auto', voixNavigateur: '' },
    aegis:    { volume: 1, hauteur: 0.95, debit: 0.98, langue: 'auto', interruptible: true, autoParle: true, moteur: 'auto', voixNavigateur: '' },
    business: { volume: 1, hauteur: 1.00, debit: 1.06, langue: 'auto', interruptible: true, autoParle: true, moteur: 'auto', voixNavigateur: '' },
    autre:    { volume: 1, hauteur: 1.18, debit: 1.08, langue: 'auto', interruptible: true, autoParle: true, moteur: 'auto', voixNavigateur: '' }
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
      cache: (MOTEUR && MOTEUR.cache && MOTEUR.cache.nb) || 0
    };
    abonnesEtat.forEach(function (f) { try { f(snap); } catch (e) {} });
  }

  // --------------------------------- Découpe -------------------------------
  function morceaux(texte, taille) {
    const brut = String(texte || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!brut) return [];
    const out = [];
    let reste = brut;
    while (reste.length > taille) {
      let coupe = reste.lastIndexOf(' ', taille);
      if (coupe < taille * 0.55) {
        coupe = Math.max(reste.lastIndexOf('. ', taille), reste.lastIndexOf('! ', taille), reste.lastIndexOf('? ', taille), reste.lastIndexOf('; ', taille), reste.lastIndexOf(', ', taille));
      }
      if (coupe < taille * 0.4) coupe = taille;
      out.push(reste.slice(0, coupe).trim());
      reste = reste.slice(coupe).trim();
    }
    if (reste) out.push(reste);
    return out;
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
        qualite: p.moteur === 'qualite' ? 'qualite' : 'rapide'
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

  function voixNavigateur(p, langue) {
    if (!('speechSynthesis' in window)) return null;
    let liste = [];
    try { liste = window.speechSynthesis.getVoices() || []; } catch (e) { liste = []; }
    if (!liste.length) return null;
    if (p.voixNavigateur) {
      const choisie = liste.filter(function (v) { return (v.voiceURI || v.name) === p.voixNavigateur; })[0];
      if (choisie) return choisie;
    }
    const base = String(langue || 'fr-FR').slice(0, 2).toLowerCase();
    const attendu = GENRE_ATTENDU[p.agent] || '?';
    const GENRE_M = /paul|henri|thomas|antoine|claude|bernard|marc|jean|nicolas|david|mark|james|daniel|georges|fred|conrad|erwan|matteo|diego|carlos|michel|pablo|remy|male|homme|man|guy|tom|gilles/i;
    const GENRE_F = /julie|denise|audrey|amelie|virginie|celine|marie|vivienne|charline|eloise|suzette|chantal|nadia|hortense|zira|colette|marta|ines|leah|heidi|aria|jenny|susan|linda|sandy|kate|catherine|sonia|female|femme|woman|siwis/i;
    function genre(v) {
      const n = String(v.name || '');
      const m = GENRE_M.test(n), f = GENRE_F.test(n);
      return (m && !f) ? 'm' : (f && !m) ? 'f' : '?';
    }
    function note(v) {
      let s = 0;
      if (String(v.lang || '').toLowerCase().indexOf(base) === 0) s += 100;
      if (attendu !== '?' && genre(v) === attendu) s += 50;
      if (/natural|neural|neuronal/i.test(String(v.name || ''))) s += 30;
      if (v.localService) s += 10;
      return s;
    }
    return liste.slice().sort(function (a, b) { return note(b) - note(a); })[0] || null;
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
      const terminer = function (pourquoi) { if (fini) return; fini = true; clearTimeout(chien); resolve(pourquoi); };
      const chien = setTimeout(function () { terminer('erreur'); }, 60000);
      u.onend = function () { terminer('fini'); };
      u.onerror = function () { terminer('erreur'); };
      try { window.speechSynthesis.speak(u); } catch (e) { terminer('erreur'); }
    });
  }

  function langueDe(morceau, p) {
    if (p.langue && p.langue !== 'auto') return p.langue;
    // Détection PAR PHRASE : un rapport peut mêler français et anglais.
    const t = String(morceau || '').toLowerCase();
    if (/[a-z]{3,}/.test(t) === false) return 'fr-FR';
    const fr = (t.match(/\b(le|la|les|des|une|est|dans|pour|avec|sur|mon|votre|je|vous|c'est|mais|donc|scan|reseau)\b/g) || []).length;
    const en = (t.match(/\b(the|and|for|with|this|that|have|from|your|are|was|not|scan|network)\b/g) || []).length;
    return en > fr ? 'en-US' : 'fr-FR';
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
    const liste = morceaux(texte, taille);
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
      const langue = langueDe(liste[i], p);
      if (rep && rep.moteur === 'neuronal') {
        const r = await jouerWav(rep, p, maSession);
        if (r === 'fini') { neuronal++; echecs = 0; derniereRaison = null; continue; }
        if (r === 'coupe') { enTrain = false; agentEnTrain = null; publierParole(); return { lu: false, raison: 'coupe', morceaux: i }; }
        echecs++; derniereRaison = 'le WAV neuronal n a pas pu etre joue (' + r + ') — repli sur la voix du navigateur';
      } else if (rep && rep.moteur === 'repli') {
        echecs++;
        derniereRaison = String(rep.raison || 'le moteur neuronal a laisse la place a Windows');
      } else if (neurOk) {
        echecs++;
      }
      if (echecs >= 3) { neurOk = false; }
      const r2 = await parlerNavigateur(liste[i], p, langue, maSession);
      if (r2 === 'fini') repli++; else echoue++;
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
    neuronalDispo: neuronalDispo,
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

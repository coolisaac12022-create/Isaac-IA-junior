// ============================================================================
//  HUD KIT — l outillage partage de toute la page command-center.html
// ----------------------------------------------------------------------------
//  Phase 2 (decoupage) : ce fichier ne contient PLUS les panneaux. Il ne porte
//  que ce dont tous les modules ont besoin, et rien d autre :
//    - el      : les elements DOM de la coquille (lus une seule fois, par id)
//    - ETAT    : l etat partage de la page (serveur, agente, dernieres lectures)
//    - api()   : fetch avec delai — un ecran qui attend indefiniment ment par silence
//    - esc/go/mo/ko/duree/non/jauge/ligne : l ecriture honnete des valeurs
//    - msg()   : le journal de conversation (tout le monde y ecrit, personne ne le possede)
//    - setCore / rafraichirLegende : les 8 etats du noyau holographique
//    - ouvrirModale / fermerModale : l unique modale de la page
//    - rafraichirPastilleVoix : ce que le Voice Manager mesure vraiment
//
//  Deux regles non negociables, heritees de la Phase 1 :
//    1. AUCUNE valeur inventee. Un champ absent ou nul s affiche « non mesure ».
//    2. Cette page ne consomme JAMAIS /api/rappel : cette route VIDE la file des
//       rapports differes, et c est l interface de conversation qui les parle.
//
//  Les modules qui s appuient sur ce kit : ui/systeme.js, ui/flux.js,
//  ui/conversation.js, ui/agents.js, ui/missions.js, ui/outils.js,
//  ui/reglages.js, et ui/command-center.js (le demarrage).
// ============================================================================
(function () {
  'use strict';

  const $ = function (s) { return document.querySelector(s); };
  const el = {
    bandeau: $('#bandeau'), sousTitre: $('#sousTitre'), ptServeur: $('#ptServeur'), txtServeur: $('#txtServeur'),
    voie: $('#pastilleVoie'), voix: $('#pastilleVoix'), heure: $('#heure'),
    systeme: $('#panneauSysteme'), noteSysteme: $('#noteSysteme'), fraicheur: $('#badgeFraicheur'),
    agent: $('#panneauAgent'), noteAgent: $('#noteAgent'),
    coreEtat: $('#coreEtat'), coreAgent: $('#coreAgent'), coreDetail: $('#coreDetail'),
    log: $('#log'), flux: $('#flux'), badgeFlux: $('#badgeFlux'),
    voile: $('#voile'), modaleTitre: $('#modaleTitre'), modaleCorps: $('#modaleCorps'),
    saisie: $('#saisie')
  };

  const ETAT = {
    serveur: 'inconnu',        // 'vivant' | 'lent' | 'mort'
    raisonMort: null,
    systeme: null, ai: null, droits: null, cerveau: null, voie: null,
    agent: 'aelyra',
    fluxFige: false,
    derniereAction: null,
    derniereSource: null,
    echecsSuite: 0,
    dernierPing: 0             // dernier instant ou une mesure REELLE est arrivee
  };

  // L'agente active est partagee avec l'interface historique : une seule verite.
  try {
    const lu = localStorage.getItem('ij-agent');
    if (lu && window.IsaacCore && IsaacCore.AGENTS[lu]) ETAT.agent = lu;
    else if (lu && ['aelyra', 'jeanette', 'onyx', 'aegis', 'business'].indexOf(lu) >= 0) ETAT.agent = lu;
  } catch (e) {}

  // --------------------------------- Utils ---------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function go(o) { return (typeof o === 'number' && isFinite(o)) ? (o / 1073741824).toFixed(o / 1073741824 < 10 ? 2 : 0) + ' Go' : null; }
  function mo(o) { return (typeof o === 'number' && isFinite(o)) ? Math.round(o / 1048576) + ' Mo' : null; }
  function ko(o) { return (typeof o === 'number' && isFinite(o)) ? Math.round(o / 1024) + ' Ko' : null; }
  function duree(s) {
    if (typeof s !== 'number' || !isFinite(s)) return null;
    const j = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (j > 0) return j + ' j ' + h + ' h';
    if (h > 0) return h + ' h ' + m + ' min';
    if (m > 0) return m + ' min ' + (s % 60) + ' s';
    return s + ' s';
  }
  function non(texte) { return '<span class="non">' + esc(texte || 'non mesuré') + '</span>'; }

  // Les deux briques d affichage du panneau SYSTEME, partagees parce que le
  // panneau AGENTE et les modales ecrivent avec exactement la meme honnetete :
  // une barre seulement si un pourcentage reel existe, sinon le mot « non mesure ».
  function jauge(nom, valeur, texte, pied, absente) {
    const pct = (typeof valeur === 'number' && isFinite(valeur)) ? Math.max(0, Math.min(100, valeur)) : 0;
    const chaude = pct >= 88;
    return '<div class="cc-jauge">'
      + '<div class="cc-jauge-tete"><span class="cc-jauge-nom">' + esc(nom) + '</span>'
      + '<span class="cc-jauge-val' + (absente ? ' absente' : '') + '">' + (absente ? esc(texte || 'non mesuré') : esc(texte)) + '</span></div>'
      + (absente ? '' : '<div class="cc-barre' + (chaude ? ' chaud' : '') + '"><i style="width:' + pct + '%"></i></div>')
      + (pied ? '<div class="cc-jauge-pied">' + esc(pied) + '</div>' : '')
      + '</div>';
  }
  function ligne(nom, valeur, manquante) {
    return '<div class="cc-ligne"><b>' + esc(nom) + '</b>' + (manquante || valeur == null || valeur === ''
      ? non(typeof valeur === 'string' && valeur ? valeur : 'non mesuré')
      : '<span>' + esc(valeur) + '</span>') + '</div>';
  }

  // Requete avec delai : un ecran qui attend indefiniment finit par mentir par silence.
  async function api(chemin, opts) {
    const o = opts || {};
    const controleur = ('AbortController' in window) ? new AbortController() : null;
    const minuteur = controleur ? setTimeout(function () { controleur.abort(); }, o.timeout || 9000) : null;
    try {
      const r = await fetch(chemin, Object.assign({ cache: 'no-store' }, o.fetch || {}, controleur ? { signal: controleur.signal } : {}));
      const txt = await r.text();
      let data = null;
      try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
      return { ok: r.ok, status: r.status, data: data, brut: txt.slice(0, 300) };
    } catch (e) {
      return { ok: false, status: 0, data: null, erreur: (e && e.name === 'AbortError') ? 'delai depasse' : String((e && e.message) || e) };
    } finally { if (minuteur) clearTimeout(minuteur); }
  }

  // --------------------------- Le bandeau d'erreur --------------------------
  function bandeau(msg) {
    if (!el.bandeau) return;
    if (!msg) { el.bandeau.classList.remove('visible'); el.bandeau.textContent = ''; return; }
    el.bandeau.textContent = msg;
    el.bandeau.classList.add('visible');
  }

  // ------------------------------- Le noyau ---------------------------------
  function setCore(etat, detail) {
    if (window.IsaacCore) IsaacCore.setEtat(etat);
    if (detail !== undefined && el.coreDetail) el.coreDetail.textContent = detail;
  }
  function rafraichirLegende() {
    const e = window.IsaacCore ? IsaacCore.etat() : { etat: 'IDLE', label: 'EN ATTENTE' };
    if (el.coreEtat) el.coreEtat.textContent = e.label || e.etat;
    const A = (window.IsaacCore && IsaacCore.AGENTS[ETAT.agent]) || { nom: String(ETAT.agent).toUpperCase() };
    if (el.coreAgent) el.coreAgent.textContent = A.nom || '';
  }

  // ------------------------------- Horloge ----------------------------------
  function horloge() {
    if (!el.heure) return;
    const d = new Date();
    el.heure.textContent = d.toLocaleTimeString('fr-FR');
  }
  setInterval(horloge, 1000); horloge();

  // --------------------------- Journal de conversation ----------------------
  // Tout module qui veut parler a Isaac ecrit ici : une seule colonne, un seul
  // style, et la source de chaque reponse ecrite en pied (local / ai / erreur).
  function msg(qui, texte, cls, pied) {
    if (!el.log) return;
    const d = document.createElement('div');
    d.className = 'cc-msg ' + (cls || 'agent');
    d.innerHTML = (qui ? '<div class="cc-msg-qui">' + esc(qui) + '</div>' : '')
      + '<div>' + esc(texte) + '</div>'
      + (pied ? '<div class="cc-msg-source">' + esc(pied) + '</div>' : '');
    el.log.appendChild(d);
    while (el.log.children.length > 120) el.log.removeChild(el.log.firstChild);
    el.log.scrollTop = el.log.scrollHeight;
    return d;
  }

  // ================================ MODALES =================================
  // Une seule modale pour toute la page : chaque module y ecrit son contenu,
  // jamais une deuxieme fenetre ne s empile par-dessus.
  function ouvrirModale(titre, html) {
    if (!el.voile) return;
    el.modaleTitre.textContent = titre;
    el.modaleCorps.innerHTML = html;
    el.voile.classList.add('ouvert');
  }
  function fermerModale() { if (el.voile) el.voile.classList.remove('ouvert'); }
  if (el.voile) {
    el.voile.addEventListener('click', function (e) { if (e.target === el.voile) fermerModale(); });
    const x = $('#modaleFermer'); if (x) x.onclick = fermerModale;
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fermerModale(); });

  // ============================== PASTILLE VOIX =============================
  // Ce que le Voice Manager mesure, pas ce que la page espererait.
  function rafraichirPastilleVoix() {
    if (!el.voix || !window.VoiceClient) return;
    VoiceClient.moteurEtat(false).then(function (m) {
      const neur = !!(m && m.installe);
      el.voix.textContent = 'VOIX ' + (neur ? 'NEURONALE' : 'NAVIGATEUR');
      el.voix.title = neur
        ? ('Moteur neuronal local (Piper) : ' + ((m.modeles_installes || []).join(', ') || 'modèles inconnus'))
        : ('Repli sur les voix du navigateur. Raison : ' + ((m && (m.raison || m.moteur)) || 'inconnue'));
      el.voix.className = 'cc-pastille' + (neur ? '' : ' slow');
    });
  }

  window.HudKit = {
    $: $, el: el, ETAT: ETAT,
    esc: esc, go: go, mo: mo, ko: ko, duree: duree, non: non, jauge: jauge, ligne: ligne,
    api: api, bandeau: bandeau,
    setCore: setCore, rafraichirLegende: rafraichirLegende,
    msg: msg, ouvrirModale: ouvrirModale, fermerModale: fermerModale,
    rafraichirPastilleVoix: rafraichirPastilleVoix
  };
})();

// ============================================================================
//  HUD — le poste de commande branché sur le cerveau réel
// ----------------------------------------------------------------------------
//  Chaque case de cet écran sort d'une route du serveur :
//    /api/ping        le cerveau répond-il ?
//    /api/systeme     CPU, RAM, GPU, disque, réseau, uptime MESURÉS sur ce PC
//    /api/ai/etat     quels fournisseurs d'IA existent vraiment (booléens, jamais la clé)
//    /api/evenements  le flux d'activité réel (journaux gravés + HTTP)
//    /api/droits      la table des droits écrite dans le serveur
//    /api/cerveau     les compteurs de mémoire (le CONTENU reste sur /cerveau.html)
//    /api/taches      le registre des missions
//    /api/orchestrateur  qui tient la voie
//
//  Deux règles non négociables :
//    1. AUCUNE valeur inventée. Un champ absent ou nul s'affiche « non mesuré ».
//       Le noyau ne prend un état que quand quelque chose se passe VRAIMENT.
//    2. Cette page ne consomme JAMAIS /api/rappel : cette route VIDÉ la file des
//       rapports différés, et c'est l'interface de conversation qui les parle.
//       Deux pages qui piochent dans la même file, c'est un rapport perdu.
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
    echecsSuite: 0
  };

  // L'agente active est partagée avec l'interface historique : une seule vérité.
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

  // Requête avec délai : un écran qui attend indéfiniment finit par mentir par silence.
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

  // ================================ SYSTÈME =================================
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

  function rendreSysteme(s) {
    if (!el.systeme) return;
    if (!s) {
      el.systeme.innerHTML = '<div class="cc-ligne"><b>ÉTAT</b>' + non('aucune mesure reçue du cerveau') + '</div>';
      return;
    }
    let h = '';

    // --- CPU ---
    const cpu = s.cpu || {};
    h += jauge('CPU', cpu.charge_pct,
      (typeof cpu.charge_pct === 'number') ? cpu.charge_pct + ' %' : (cpu.etat || 'non mesuré'),
      (typeof cpu.charge_pct === 'number')
        ? ((cpu.coeurs || '?') + ' cœur(s) · ' + (cpu.modele || 'modèle inconnu') + ' · ' + (cpu.methode || 'méthode non précisée'))
        : (cpu.note || cpu.etat || 'aucune lecture disponible'),
      typeof cpu.charge_pct !== 'number');

    // --- RAM ---
    const ram = s.ram || {};
    h += jauge('RAM', ram.utilisee_pct,
      (typeof ram.utilisee_pct === 'number') ? ram.utilisee_pct + ' %' : 'non mesuré',
      (typeof ram.libre_octets === 'number')
        ? (mo(ram.libre_octets) + ' libre sur ' + go(ram.totale_octets) + ' · ' + (ram.methode || 'lecture Node'))
        : (ram.methode || 'lecture indisponible'),
      typeof ram.utilisee_pct !== 'number');

    // --- GPU : le nom et le pilote sont réels, la charge ne se mesure pas ici ---
    const gpu = s.gpu || {};
    const cartes = (gpu.cartes || []);
    if (cartes.length) {
      h += '<div class="cc-jauge"><div class="cc-jauge-tete"><span class="cc-jauge-nom">GPU</span>'
        + '<span class="cc-jauge-val absente">charge non mesurée</span></div>'
        + '<div class="cc-jauge-pied">' + esc(cartes.map(function (c) {
            return c.nom + (c.pilote ? ' · pilote ' + c.pilote : '') + (c.memoire_vram_octets ? ' · ' + go(c.memoire_vram_octets) + ' annoncés' : '');
          }).join(' — ')) + '</div>'
        + '<div class="cc-jauge-pied">' + esc(gpu.note || 'la charge GPU exige un compteur de performance dédié : ce PC ne l expose pas, je ne l invente pas') + '</div></div>';
    } else {
      h += jauge('GPU', null, 'non mesuré', gpu.note || 'aucune carte lue', true);
    }

    // --- STOCKAGE ---
    const d = s.disque || {};
    if (typeof d.libre_octets === 'number') {
      const occ = (typeof d.libre_pct === 'number') ? (100 - d.libre_pct) : null;
      h += jauge('STORAGE', occ, (typeof d.libre_pct === 'number' ? d.libre_pct + ' % libre' : go(d.libre_octets) + ' libre'),
        (d.lettre || 'C:') + ' · ' + go(d.libre_octets) + ' libre sur ' + go(d.total_octets),
        false);
    } else {
      h += jauge('STORAGE', null, 'non mesuré', d.note || d.etat || 'aucune lecture du disque', true);
    }

    // --- RÉSEAU ---
    const r = s.reseau || {};
    if (r.debit) {
      h += jauge('NETWORK', null, r.debit.descendant_ko_s + ' ↓ / ' + r.debit.montant_ko_s + ' ↑ Ko/s',
        'débit réel entre deux relevés · ' + ((r.interfaces || []).join(', ') || 'interfaces inconnues')
        + ' · total ' + (ko(r.total_recu_octets) || '?') + ' reçus / ' + (ko(r.total_emis_octets) || '?') + ' émis', false);
      // la barre n'a pas de sens ici : on garde les chiffres seuls.
    } else {
      h += jauge('NETWORK', null, r.etat || 'débit non mesuré',
        ((r.interfaces || []).length ? (r.interfaces.join(', ') + ' · ') : '') + (r.etat || 'le débit demande deux relevés espacés'), true);
    }

    // --- UPTIME ---
    const u = s.uptime || {};
    h += ligne('UPTIME PC', duree(u.machine_s));
    h += ligne('CERVEAU', duree(u.cerveau_s), false);
    h += ligne('INSTANCE', (s.instance || '?') + ' · port ' + (s.port || '?'));
    h += ligne('PLATEFORME', u.plateforme ? (u.plateforme + ' · ' + (u.hostname || '')) : null);
    h += ligne('IP LOCALE', (s.ips || []).filter(function (i) { return /réseau local/.test(i.portee || ''); })
      .map(function (i) { return i.ip + ' (' + i.interface + ')'; }).join(', '));
    const api_pa = (s.ips || []).filter(function (i) { return /lien local/.test(i.portee || ''); });
    if (api_pa.length) h += ligne('APIPA', api_pa.map(function (i) { return i.ip; }).join(', ') + ' — lien local, hors périmètre');

    el.systeme.innerHTML = h;
    if (el.fraicheur) {
      el.fraicheur.textContent = s.voie_occupee ? 'CACHE — VOIE OCCUPÉE' : 'MESURES FRAÎCHES';
      el.fraicheur.className = 'cc-badge ' + (s.voie_occupee ? 'wait' : 'ok');
      el.fraicheur.title = s.fraicheur || '';
    }
    if (el.noteSysteme) {
      el.noteSysteme.textContent = (s.fraicheur || '') + ' · échantillonneur : '
        + ((s.echantillonneur && s.echantillonneur.cycles) || 0) + ' cycle(s) de mesure depuis le démarrage du cerveau.';
    }
  }

  // ============================ AGENTE ACTIVE ===============================
  function rendreAgent() {
    if (!el.agent) return;
    const A = (window.IsaacCore && IsaacCore.AGENTS[ETAT.agent]) || { nom: String(ETAT.agent).toUpperCase(), role: '—', couleur: 0x4fd8ff };
    const ai = ETAT.ai || {};
    const droit = (ETAT.droits || {});
    const fiche = ((droit.agents || []).filter(function (a) { return a.agent === ETAT.agent; })[0]) || null;
    const caps = droit.capacites || {};

    // Le MODÈLE affiché est celui que le cerveau déclare vraiment, et on dit si un
    // fournisseur a répondu depuis le démarrage — jamais un nom de modèle décoratif.
    const f = (ai.fournisseurs || []).filter(function (x) { return x.nom === ai.dernier_fournisseur; })[0] || null;
    const modele = f ? (ai.dernier_fournisseur + ' a répondu en dernier · ' + (f.modele || 'modèle non précisé'))
      : ('ordre réel : ' + (ai.ordre_reel || 'inconnu') + ' · aucun fournisseur n a encore répondu depuis le démarrage');

    // La VOIX : ce que le Voice Manager mesure + le profil de cette agente.
    const p = window.VoiceClient ? VoiceClient.profil(ETAT.agent) : null;
    const voixEtat = window.VoiceClient ? VoiceClient.neuronalDispo() : false;
    const voixTxt = voixEtat
      ? 'neuronal local (Piper) · timbre ' + (p ? Number(p.hauteur).toFixed(2) : '?') + ' · débit ' + (p ? Number(p.debit).toFixed(2) : '?')
      : 'repli sur les voix du navigateur · timbre ' + (p ? Number(p.hauteur).toFixed(2) : '?');

    let h = '';
    h += '<div class="cc-carte-tete" style="margin-bottom:10px">'
      + '<div><div class="cc-carte-nom" style="color:var(--core-couleur)">' + esc(A.nom) + '</div>'
      + '<div class="cc-carte-role">' + esc(A.role || '—') + '</div></div>'
      + '<span class="cc-badge ' + (ETAT.serveur === 'vivant' ? 'ok' : 'non') + '" style="margin-left:auto">'
      + (ETAT.serveur === 'vivant' ? 'EN LIGNE' : 'HORS LIGNE') + '</span></div>';

    h += ligne('AGENT', A.nom);
    h += ligne('MODÈLE', modele);
    h += ligne('MÉMOIRE', (ETAT.cerveau && ETAT.cerveau.stats)
      ? (ETAT.cerveau.stats.faits + ' fait(s) · ' + ETAT.cerveau.stats.echanges + ' échange(s) · ' + ETAT.cerveau.stats.lecons + ' leçon(s)')
      : 'compteurs non lus');
    h += ligne('VOIX', voixTxt);

    // PERMISSIONS : la table du serveur, case par case. Un droit absent n'existe pas.
    h += '<div class="cc-ligne"><b>DROITS</b><span>' + (fiche
      ? Object.keys(caps).map(function (k) {
          const oui = !!(fiche.droits && fiche.droits[k]);
          return '<span class="cc-droit ' + (oui ? 'oui' : '') + '" title="' + esc(caps[k] || k) + '">' + esc(k) + (oui ? ' ✓' : ' ✕') + '</span>';
        }).join(' ')
      : 'cette agente n est pas dans la table des droits du serveur') + '</span></div>';

    h += ligne('DERNIÈRE ACTION', ETAT.derniereAction ? ETAT.derniereAction.texte : 'aucune depuis l ouverture de cette page');
    h += ligne('DERNIÈRE SOURCE', ETAT.derniereSource ? ETAT.derniereSource : '—');

    el.agent.innerHTML = h;
    if (el.noteAgent) {
      el.noteAgent.textContent = fiche
        ? 'Droits lus dans la table du serveur (/api/droits). Contenu de la mémoire : page /cerveau.html — rien de sensible n est affiché ici.'
        : 'Cette agente n a aucune ligne dans la table des droits : elle ne peut rien exécuter. Contenu de la mémoire : /cerveau.html.';
    }
  }

  // ================================= FLUX ===================================
  function rendreFlux(d) {
    if (!el.flux || ETAT.fluxFige) return;
    const ev = (d && d.evenements) || [];
    if (!ev.length) {
      el.flux.innerHTML = '<div class="cc-ev"><span class="cc-ev-txt">Aucun événement gravé pour l instant — ce flux est vide parce que les journaux le sont, pas parce qu il est cassé.</span></div>';
    } else {
      el.flux.innerHTML = ev.map(function (e) {
        return '<div class="cc-ev"><span class="cc-ev-heure">' + esc(e.heure) + '</span>'
          + '<span class="cc-ev-cat" data-c="' + esc(e.categorie) + '">' + esc(e.categorie) + '</span>'
          + '<span class="cc-ev-txt">' + esc(e.texte) + '</span></div>';
      }).join('');
    }
    if (el.badgeFlux) {
      el.badgeFlux.textContent = ev.length + ' événement(s) · anneau ' + ((d && d.anneau_ram) || 0);
      el.badgeFlux.className = 'cc-badge ' + ((d && d.journaux || []).some(function (j) { return !j.present; }) ? 'wait' : 'info');
    }
  }

  // ============================== CONVERSATION ==============================
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

  // ================================ COMMANDES ===============================
  async function envoyer(texte, depuisMic) {
    const t = String(texte || '').trim();
    if (!t) return;
    const A = (window.IsaacCore && IsaacCore.AGENTS[ETAT.agent]) || { nom: ETAT.agent };
    msg('ISAAC' + (depuisMic ? ' · micro' : ''), t, 'moi');
    if (el.saisie) el.saisie.value = '';
    setCore('THINKING', 'requete partie vers le cerveau — ' + new Date().toLocaleTimeString('fr-FR'));

    const r = await api('api/command', {
      timeout: 90000,
      fetch: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t })
      }
    });

    if (!r.ok || !r.data) {
      setCore('ERROR', 'le cerveau n a pas repondu correctement');
      msg(null, 'Le cerveau n a pas répondu : ' + (r.status ? 'HTTP ' + r.status : (r.erreur || 'pas de réponse')) + '. Rien n a été exécuté.', 'erreur');
      return;
    }
    const d = r.data;
    const rep = String(d.reply || '').trim();

    // Une agente a réellement pris la main : le noyau prend SA couleur.
    if (d.agent && window.IsaacCore && IsaacCore.AGENTS[String(d.agent).toLowerCase()]) {
      ETAT.agent = String(d.agent).toLowerCase();
      if (IsaacCore.setAgent) IsaacCore.setAgent(ETAT.agent);
      try { localStorage.setItem('ij-agent', ETAT.agent); } catch (e) {}
      rafraichirLegende();
    }

    // La source est la vérité de ce qui s'est passé : 'local' = la machine a agi,
    // 'ai' = un cerveau a répondu avec des mots, rien n'a été exécuté. On l'écrit.
    const src = d.source === 'local' ? 'exécuté sur la machine (source: local)'
      : d.source === 'ai' ? 'réponse d un modèle IA (source: ai) — rien n a été exécuté sur la machine'
      : 'source: ' + (d.source || 'inconnue');
    ETAT.derniereSource = src;

    setCore(d.source === 'local' ? 'PROCESSING' : 'SEARCHING', src);
    msg(A.nom, rep || '(réponse vide)', 'agent', src);

    // Navigation réelle : si le cerveau renvoie une page, on l'ouvre vraiment.
    if (d.open) {
      const cible = /^https?:\/\//.test(d.open) ? d.open : d.open;
      msg(null, 'Le cerveau demande l ouverture de ' + cible + ' — ouverture dans un nouvel onglet.', 'systeme');
      try { window.open(cible, '_blank', 'noopener'); } catch (e) { msg(null, 'Ouverture impossible : ' + e.message, 'erreur'); }
    }

    // La voix : moteur neuronal local d'abord, repli navigateur sinon, raison réelle affichée.
    const p = window.VoiceClient ? VoiceClient.profil(ETAT.agent) : null;
    if (window.VoiceClient && (!p || p.autoParle !== false) && rep) {
      setCore('SPEAKING', 'voix en cours — ' + (window.VoiceClient.neuronalDispo() ? 'neuronal local' : 'repli navigateur'));
      const res = await VoiceClient.parler(rep, { agent: (d.agent || ETAT.agent) });
      if (res && res.raisonRepli) {
        msg(null, 'Voix : ' + res.raisonRepli, 'systeme');
      }
      rafraichirPastilleVoix();
    }
    ETAT.derniereAction = { texte: t.slice(0, 90), t: Date.now() };
    setCore('IDLE', 'en attente — dernière commande : ' + new Date().toLocaleTimeString('fr-FR'));
    rendreAgent();
  }

  // ================================== MICRO =================================
  let rec = null;
  function initMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btn = $('#btnParler');
    if (!btn) return;
    if (!SR) {
      btn.disabled = true;
      btn.title = 'Ce navigateur n expose aucune reconnaissance vocale : utilise le champ COMMAND. Chrome ou Edge, eux, l ont.';
      return;
    }
    let langue = 'fr-FR';
    try { langue = localStorage.getItem('ij-dictee') || 'fr-FR'; } catch (e) {}

    btn.onclick = function () {
      if (rec) { try { rec.stop(); } catch (e) {} return; }
      rec = new SR();
      rec.lang = langue; rec.interimResults = false; rec.maxAlternatives = 1; rec.continuous = false;
      btn.classList.add('ecoute');
      setCore('LISTENING', 'micro ouvert — langue ' + langue);
      msg(null, 'Micro ouvert (' + langue + '). Parle, Isaac — le texte brut du micro est envoyé tel quel au cerveau.', 'systeme');
      let recu = '';
      rec.onresult = function (e) {
        try { recu = e.results[0][0].transcript; } catch (x) { recu = ''; }
      };
      rec.onerror = function (e) {
        msg(null, 'Micro en erreur : ' + (e.error || 'raison inconnue') + '. Rien n a été écouté.', 'erreur');
        setCore('ERROR', 'micro en erreur : ' + (e.error || '?'));
      };
      rec.onend = function () {
        btn.classList.remove('ecoute');
        const r = rec; rec = null;
        if (recu.trim()) envoyer(recu, true);
        else { setCore('IDLE', 'rien n a été entendu'); msg(null, 'Rien n a été entendu — le micro s est refermé sans transcription.', 'systeme'); }
        if (r) { try { r.abort(); } catch (e) {} }
      };
      try { rec.start(); } catch (e) {
        btn.classList.remove('ecoute'); rec = null;
        msg(null, 'Le micro n a pas pu démarrer : ' + e.message, 'erreur');
        setCore('IDLE', 'micro refusé');
      }
    };
  }

  // ================================ MODALES =================================
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

  async function modaleAgents() {
    ouvrirModale('Agents — la table réelle du serveur', '<div class="cc-note">Lecture de /api/droits…</div>');
    const r = await api('api/droits');
    if (!r.ok || !r.data || !r.data.agents) {
      ouvrirModale('Agents', '<div class="cc-note">La table des droits n a pas pu être lue : ' + esc(r.status ? 'HTTP ' + r.status : (r.erreur || 'réponse illisible')) + '. Je n invente pas de droits.</div>');
      return;
    }
    ETAT.droits = r.data;
    const caps = r.data.capacites || {};
    const h = '<div class="cc-note" style="margin-bottom:12px">' + esc(r.data.contrat || '') + '</div>'
      + '<div class="cc-grille">' + r.data.agents.map(function (a) {
        const A = (window.IsaacCore && IsaacCore.AGENTS[a.agent]) || { nom: String(a.agent).toUpperCase(), role: '' };
        return '<div class="cc-carte' + (a.agent === ETAT.agent ? ' active' : '') + '">'
          + '<div class="cc-carte-tete"><div><div class="cc-carte-nom">' + esc(A.nom) + '</div>'
          + '<div class="cc-carte-role">' + esc(A.role || '') + '</div></div>'
          + '<span class="cc-badge ' + (a.agent === ETAT.agent ? 'ok' : '') + '" style="margin-left:auto">' + (a.agent === ETAT.agent ? 'ACTIVE' : 'au repos') + '</span></div>'
          + '<div class="cc-droits">' + Object.keys(caps).map(function (k) {
              const oui = !!(a.droits && a.droits[k]);
              return '<span class="cc-droit ' + (oui ? 'oui' : '') + '" title="' + esc(caps[k]) + '">' + esc(k) + (oui ? ' ✓' : ' ✕') + '</span>';
            }).join('') + '</div>'
          + '<div class="cc-carte-actions"><button class="cc-petit" data-activer="' + esc(a.agent) + '">ACTIVER</button></div>'
          + '</div>';
      }).join('') + '</div>'
      + ((r.data.refus_recent && r.data.refus_recent.length)
        ? '<h4 style="margin:16px 0 8px;font-size:10px;letter-spacing:.2em;color:var(--cyan-fort)">DERNIERS REFUS GRAVÉS</h4>'
          + r.data.refus_recent.slice(0, 8).map(function (l) { return '<div class="cc-ev"><span class="cc-ev-txt">' + esc(l) + '</span></div>'; }).join('')
        : '<div class="cc-note" style="margin-top:14px">Aucun refus gravé récemment.</div>');
    ouvrirModale('Agents — la table réelle du serveur', h);
    el.modaleCorps.querySelectorAll('[data-activer]').forEach(function (b) {
      b.onclick = function () {
        ETAT.agent = b.getAttribute('data-activer');
        if (window.IsaacCore) IsaacCore.setAgent(ETAT.agent);
        try { localStorage.setItem('ij-agent', ETAT.agent); } catch (e) {}
        rafraichirLegende(); rendreAgent(); fermerModale();
        msg(null, 'Agente active : ' + ETAT.agent.toUpperCase() + '. Les commandes suivantes partent sous son nom et ses droits.', 'systeme');
      };
    });
  }

  async function modaleMissions() {
    ouvrirModale('Missions — le registre réel des tâches', '<div class="cc-note">Lecture de /api/taches…</div>');
    const r = await api('api/taches');
    if (!r.ok || !r.data) {
      ouvrirModale('Missions', '<div class="cc-note">Le registre n a pas pu être lu : ' + esc(r.status ? 'HTTP ' + r.status : (r.erreur || 'réponse illisible')) + '.</div>');
      return;
    }
    const t = (r.data.taches || []);
    const COULEUR = { finie: 'ok', terminee: 'ok', 'en cours': 'info', en_cours: 'info', file: 'wait', refusee: 'non', echouee: 'non', interrompue: 'wait', annulee: 'non' };
    const h = '<div class="cc-note" style="margin-bottom:10px">' + esc(r.data.resume || '') + '</div>'
      + (t.length ? '<table class="cc-table"><thead><tr><th>Réf</th><th>Mission</th><th>État</th><th>Agent</th><th>Progression</th><th>Mise à jour</th></tr></thead><tbody>'
        + t.slice(0, 60).map(function (x) {
          const et = String(x.etat || x.status || '?');
          const prog = (typeof x.progression === 'number') ? x.progression : (typeof x.pct === 'number' ? x.pct : null);
          return '<tr><td>' + esc(x.ref || '—') + '</td>'
            + '<td>' + esc(x.titre || x.intitule || x.etape || '—') + '</td>'
            + '<td><span class="cc-badge ' + (COULEUR[et.toLowerCase()] || '') + '">' + esc(et) + '</span></td>'
            + '<td>' + esc(x.agent || '—') + '</td>'
            + '<td>' + (prog === null ? '<span class="non">non mesurée</span>'
                : '<div class="cc-prog"><i style="width:' + Math.max(0, Math.min(100, prog)) + '%"></i></div>') + '</td>'
            + '<td>' + esc(x.maj ? new Date(x.maj).toLocaleString('fr-FR') : (x.quand || '—')) + '</td></tr>';
        }).join('') + '</tbody></table>'
        : '<div class="cc-note">Aucune mission au registre. Ce n est pas une erreur : le fichier est vide.</div>')
      + '<div class="cc-note" style="margin-top:12px">Une mission ne se crée PAS ici : elle naît d un ordre réel (« scan complet … », « inventaire ») et le cerveau l inscrit au registre. Cette page ne fait que LIRE — annuler ou taire se fait à la voix ou sur /taches.html.</div>';
    ouvrirModale('Missions — le registre réel des tâches', h);
  }

  async function modaleOutils() {
    ouvrirModale('Tools — ce qui existe vraiment', '<div class="cc-note">Lecture de /api/politique…</div>');
    const [pol, ai] = await Promise.all([api('api/politique'), api('api/ai/etat')]);
    const routes = (pol.data && pol.data.routes_ecriture) || [];
    const pages = [
      ['/taches.html', 'Console des tâches et de la voie'],
      ['/engagements.html', 'Fiches d engagement (périmètre légal)'],
      ['/analyse-mail.html', 'Analyseur de mail suspect, lecture seule'],
      ['/business.html', 'Carnet de prospection Digital Business'],
      ['/evolution.html', 'Atelier d auto-correction (blocs appris)'],
      ['/cerveau.html', 'Le cerveau de l équipe : prompts, mémoire, leçons'],
      ['/personnalites.html', 'Personnalités des agentes'],
      ['/repartition.html', 'Répartition des avatars 3D'],
      ['/labo.html', 'Atelier cyber (Documents\\cyber_training)'],
      ['/index.html', 'Interface de conversation historique']
    ];
    const f = (ai.data && ai.data.fournisseurs) || [];
    const h = '<div class="cc-grille">'
      + '<div class="cc-carte"><div class="cc-carte-tete"><div class="cc-carte-nom">PAGES DU CERVEAU</div></div>'
      + '<div class="cc-droits">' + pages.map(function (p) {
          return '<a class="cc-droit oui" href="' + esc(p[0]) + '" title="' + esc(p[1]) + '" style="text-decoration:none">' + esc(p[0]) + '</a>';
        }).join('') + '</div>'
      + '<div class="cc-note">Ces pages sont servies par le cerveau sur 127.0.0.1 — elles existent dans public/.</div></div>'
      + '<div class="cc-carte"><div class="cc-carte-tete"><div class="cc-carte-nom">ROUTES D ÉCRITURE</div></div>'
      + '<div class="cc-droits">' + (routes.length ? routes.map(function (x) { return '<span class="cc-droit">' + esc(x) + '</span>'; }).join('') : '<span class="cc-droit">non lues</span>') + '</div>'
      + '<div class="cc-note">Liste FERMÉE : un POST hors de cette liste est refusé avant même d atteindre le traitement. ' + esc((pol.data && pol.data.regles && pol.data.regles[1]) || '') + '</div></div>'
      + '<div class="cc-carte"><div class="cc-carte-tete"><div class="cc-carte-nom">FOURNISSEURS D IA</div></div>'
      + f.map(function (x) {
          return '<div class="cc-ligne"><b>' + esc(x.nom.toUpperCase()) + '</b>'
            + (x.configure ? '<span>' + esc(x.modele || 'modèle non précisé') + '</span>' : non('aucune clé côté serveur'))
            + '</div>'
            + (x.compteurs ? '<div class="cc-jauge-pied" style="padding-left:0">' + x.compteurs.appels + ' appel(s) · ' + x.compteurs.succes + ' succès · ' + x.compteurs.echecs + ' échec(s)'
              + (x.compteurs.ms_moyen ? ' · ' + x.compteurs.ms_moyen + ' ms en moyenne' : '') + '</div>' : '');
        }).join('')
      + '<div class="cc-note">' + esc((ai.data && ai.data.note_nvidia) || '') + '</div></div>'
      + '</div>';
    ouvrirModale('Tools — ce qui existe vraiment', h);
  }

  function modaleReglages() {
    const P = window.VoiceClient ? window.VoiceClient.profils() : {};
    const ai = ETAT.ai || {};
    const lignesAgents = Object.keys(P).map(function (a) {
      const p = P[a];
      const A = (window.IsaacCore && IsaacCore.AGENTS[a]) || { nom: a.toUpperCase() };
      return '<div class="cc-bloc"><h4>' + esc(A.nom || a) + '</h4>'
        + '<div class="cc-champ"><label>Volume</label><input type="range" min="0" max="1" step="0.05" value="' + p.volume + '" data-a="' + a + '" data-k="volume"><span class="val">' + Number(p.volume).toFixed(2) + '</span></div>'
        + '<div class="cc-champ"><label>Timbre</label><input type="range" min="0.6" max="1.6" step="0.01" value="' + p.hauteur + '" data-a="' + a + '" data-k="hauteur"><span class="val">' + Number(p.hauteur).toFixed(2) + '</span></div>'
        + '<div class="cc-champ"><label>Débit</label><input type="range" min="0.6" max="1.6" step="0.01" value="' + p.debit + '" data-a="' + a + '" data-k="debit"><span class="val">' + Number(p.debit).toFixed(2) + '</span></div>'
        + '<div class="cc-champ"><label>Langue</label><select data-a="' + a + '" data-k="langue">'
        + ['auto', 'fr-FR', 'en-US', 'es-ES', 'de-DE', 'it-IT', 'pt-BR'].map(function (l) {
            return '<option value="' + l + '"' + (p.langue === l ? ' selected' : '') + '>' + (l === 'auto' ? 'auto (par phrase)' : l) + '</option>';
          }).join('') + '</select></div>'
        + '<div class="cc-champ"><label>Interruptible</label><select data-a="' + a + '" data-k="interruptible">'
        + '<option value="1"' + (p.interruptible ? ' selected' : '') + '>oui — une nouvelle parole coupe</option>'
        + '<option value="0"' + (!p.interruptible ? ' selected' : '') + '>non — elle finit sa phrase</option></select></div>'
        + '<div class="cc-champ"><label>Parle auto</label><select data-a="' + a + '" data-k="autoParle">'
        + '<option value="1"' + (p.autoParle ? ' selected' : '') + '>oui</option><option value="0"' + (!p.autoParle ? ' selected' : '') + '>non — texte seulement</option></select></div>'
        + '<div class="cc-carte-actions"><button class="cc-petit" data-test="' + a + '">ÉCOUTER</button>'
        + '<button class="cc-petit" data-reset="' + a + '">RÉINITIALISER</button></div></div>';
    }).join('');

    const h = '<div class="cc-note" style="margin-bottom:12px">Ces réglages sont les tiens, dans ce navigateur. Ils ne changent rien au cerveau : '
      + 'la voix reste produite par le moteur neuronal local quand il est installé.</div>'
      + '<div class="cc-reglages">'
      + '<div class="cc-bloc"><h4>Interface</h4>'
      + '<div class="cc-ligne"><b>THÈME</b><span>holographique bleu nuit (propre au Command Center)</span></div>'
      + '<div class="cc-ligne"><b>NOYAU</b><span>' + esc(window.IsaacCore ? (IsaacCore.etat().moteur3d ? 'WebGL — Three.js servi en local' : 'repli CSS — Three.js absent') : 'module non chargé') + '</span></div>'
      + '<div class="cc-ligne"><b>ÉTATS</b><span>' + esc(window.IsaacCore ? IsaacCore.ETATS.join(', ') : '—') + '</span></div>'
      + '<div class="cc-champ"><label>Dictée</label><select id="regDictee">'
      + ['fr-FR', 'en-US', 'es-ES', 'de-DE', 'it-IT', 'pt-BR'].map(function (l) {
          let sel = ''; try { sel = (localStorage.getItem('ij-dictee') || 'fr-FR') === l ? ' selected' : ''; } catch (e) {}
          return '<option value="' + l + '"' + sel + '>' + l + '</option>';
        }).join('') + '</select></div>'
      + '<div class="cc-note">Le micro peut écouter dans une autre langue ; les ORDRES, eux, ne sont compris qu en français par le cerveau.</div></div>'
      + '<div class="cc-bloc"><h4>IA</h4>'
      + '<div class="cc-ligne"><b>MODE</b><span>' + esc(ai.mode || 'non lu') + ' (variable ISAAC_AI_PROVIDER côté serveur)</span></div>'
      + '<div class="cc-ligne"><b>ORDRE</b><span>' + esc(ai.ordre_reel || 'non lu') + '</span></div>'
      + (ai.fournisseurs || []).map(function (x) {
          return '<div class="cc-ligne"><b>' + esc(x.nom.toUpperCase()) + '</b>' + (x.configure ? '<span>configuré — ' + esc(x.modele || '') + '</span>' : non('sans clé')) + '</div>';
        }).join('')
      + '<div class="cc-note">Aucune clé n est affichée ni envoyée au navigateur : seule sa présence est visible. '
      + 'NVIDIA NIM est une couche préparée — sans clé côté serveur, tout continue sur ce qui est déjà prouvé ici.</div></div>'
      + '<div class="cc-bloc"><h4>Voix — moteur</h4><div id="regVoix"><div class="cc-note">Lecture de l état du moteur…</div></div></div>'
      + '</div>'
      + '<h4 style="margin:18px 0 10px;font-size:10px;letter-spacing:.2em;color:var(--cyan-fort)">PROFILS VOCAUX PAR AGENTE</h4>'
      + '<div class="cc-reglages">' + lignesAgents + '</div>';
    ouvrirModale('Settings — JARVIS', h);

    // Les réglages branchés pour de vrai.
    el.modaleCorps.querySelectorAll('[data-k]').forEach(function (inp) {
      const applique = function () {
        const a = inp.getAttribute('data-a'), k = inp.getAttribute('data-k');
        let v = inp.value;
        if (k === 'volume' || k === 'hauteur' || k === 'debit') v = Number(v);
        if (k === 'interruptible' || k === 'autoParle') v = (v === '1' || v === true);
        if (window.VoiceClient) VoiceClient.setProfil(a, (function () { const o = {}; o[k] = v; return o; })());
        const lbl = inp.parentNode.querySelector('.val');
        if (lbl && typeof v === 'number') lbl.textContent = v.toFixed(2);
      };
      inp.addEventListener('input', applique);
      inp.addEventListener('change', applique);
    });
    el.modaleCorps.querySelectorAll('[data-test]').forEach(function (b) {
      b.onclick = async function () {
        const a = b.getAttribute('data-test');
        const A = (window.IsaacCore && IsaacCore.AGENTS[a]) || { nom: a };
        setCore('SPEAKING', 'essai de la voix de ' + A.nom);
        const res = await VoiceClient.parler('Essai de voix : je suis ' + (A.nom || a) + '. Cette phrase est produite par le moteur reel de ce PC.', { agent: a });
        msg(null, 'Essai de voix ' + (A.nom || a) + ' : ' + (res.lu ? 'lu par ' + res.moteur : 'non lu — ' + (res.raison || res.raisonRepli || 'raison inconnue'))
          + (res.repli ? ' · ' + res.repli + ' morsceau(x) en repli navigateur' : ''), 'systeme');
        setCore('IDLE', 'essai de voix terminé');
      };
    });
    el.modaleCorps.querySelectorAll('[data-reset]').forEach(function (b) {
      b.onclick = function () { modaleReglages(); msg(null, 'Profil vocal réinitialisé pour ' + b.getAttribute('data-reset') + '.', 'systeme'); };
    });
    const dd = el.modaleCorps.querySelector('#regDictee');
    if (dd) dd.onchange = function () { try { localStorage.setItem('ij-dictee', dd.value); } catch (e) {} initMic(); msg(null, 'Le micro écoute désormais en ' + dd.value + '.', 'systeme'); };

    // L'état du moteur, tel que le Voice Manager le mesure.
    VoiceClient.moteurEtat(true).then(function (m) {
      const z = el.modaleCorps && el.modaleCorps.querySelector('#regVoix');
      if (!z) return;
      if (m && m.installe) {
        z.innerHTML = '<div class="cc-ligne"><b>MOTEUR</b><span>' + esc(m.moteur || 'Piper') + '</span></div>'
          + '<div class="cc-ligne"><b>MODÈLES</b><span>' + esc((m.modeles_installes || []).join(', ') || 'aucun') + '</span></div>'
          + '<div class="cc-ligne"><b>CACHE</b><span>' + esc((m.cache && m.cache.nb) || 0) + ' phrase(s) déjà synthétisées</span></div>'
          + '<div class="cc-ligne"><b>RAM LIBRE</b><span>' + esc(mo(m.ram_libre_mo ? m.ram_libre_mo * 1048576 : null) || 'non mesurée') + '</span></div>'
          + '<div class="cc-note">Le neuronal LOCAL est le moteur principal. S il s efface (mémoire basse, voie occupée, modèle absent), '
          + 'la voix du navigateur prend le relais et la raison réelle est écrite ici — jamais cachée.</div>';
      } else {
        z.innerHTML = '<div class="cc-ligne"><b>MOTEUR</b>' + non('neuronal non installé') + '</div>'
          + '<div class="cc-ligne"><b>RAISON</b><span>' + esc((m && (m.raison || m.moteur)) || 'inconnue') + '</span></div>'
          + '<div class="cc-note">Installateur : VOIX-NEURONALE.bat dans jarvis\\ (Piper + 4 modèles français, ~250 Mo). '
          + 'En attendant, c est la voix de Windows qui parle — et cette page le dit au lieu de faire semblant.</div>';
      }
    });
  }

  // ============================== PASTILLES =================================
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

  // ================================ BOUCLES =================================
  let dernierPing = 0;
  async function sondeSysteme() {
    const r = await api('api/systeme', { timeout: 8000 });
    if (r.ok && r.data && r.data.ok) {
      ETAT.systeme = r.data; ETAT.echecsSuite = 0; dernierPing = Date.now();
      if (ETAT.serveur !== 'vivant') { bandeau(null); msg(null, 'Le cerveau répond de nouveau.', 'systeme'); }
      ETAT.serveur = 'vivant'; ETAT.raisonMort = null;
      rendreSysteme(r.data);
      if (el.ptServeur) el.ptServeur.className = 'cc-point';
      if (el.txtServeur) el.txtServeur.textContent = 'SERVEUR EN LIGNE · ' + (r.data.instance || '?').toUpperCase() + ':' + (r.data.port || '?');
      if (el.sousTitre) el.sousTitre.textContent = 'cerveau local ' + (r.data.instance === 'essai' ? 'ESSAI ' : '') + '· 127.0.0.1:' + (r.data.port || '?') + ' · ' + ((r.data.uptime && r.data.uptime.plateforme) || '');
      // La voie occupe le CPU ? Le noyau le montre — c'est une activité RÉELLE.
      if (!window.VoiceClient || !VoiceClient.parle()) {
        if (r.data.voie_occupee) setCore('PROCESSING', 'la voie tient un job lourd : ' + r.data.voie_occupee);
        else if (IsaacCore.etat().etat === 'PROCESSING' || IsaacCore.etat().etat === 'SEARCHING') setCore('IDLE', 'en attente');
      }
      rafraichirLegende();
      return;
    }
    // Échec : on ne devine pas la cause, on cite ce qu'on a vraiment reçu.
    ETAT.echecsSuite++;
    const raison = r.status ? ('HTTP ' + r.status) : (r.erreur || 'aucune réponse');
    if (ETAT.echecsSuite >= 2) {
      ETAT.serveur = 'mort'; ETAT.raisonMort = raison;
      if (el.ptServeur) el.ptServeur.className = 'cc-point mort';
      if (el.txtServeur) el.txtServeur.textContent = 'SERVEUR INJOIGNABLE';
      setCore('OFFLINE', 'cerveau injoignable : ' + raison);
      bandeau('Le cerveau ne répond plus (' + raison + '). Vérifie la fenêtre du cerveau — le chien de garde cerveau.bat la relance 5 s après un arrêt. Cette page ne montre plus de mesures, elle ne les invente pas.');
      rendreSysteme(null);
    } else {
      ETAT.serveur = 'lent';
      if (el.ptServeur) el.ptServeur.className = 'cc-point lent';
      if (el.txtServeur) el.txtServeur.textContent = 'SERVEUR LENT';
    }
  }

  async function sondeEvenements() {
    const r = await api('api/evenements?limite=40', { timeout: 8000 });
    if (r.ok && r.data) rendreFlux(r.data);
  }

  async function sondeAI() {
    // /api/droits est lu des le premier tour : sans lui le panneau ACTIVE AGENT
    // dirait d une agente qu elle n est pas dans la table alors qu elle y est.
    const [ai, cerv, voie, dr] = await Promise.all([api('api/ai/etat', { timeout: 8000 }), api('api/cerveau', { timeout: 8000 }), api('api/orchestrateur', { timeout: 8000 }), api('api/droits', { timeout: 8000 })]);
    if (ai.ok && ai.data) ETAT.ai = ai.data;
    if (cerv.ok && cerv.data && cerv.data.stats) ETAT.cerveau = cerv.data;
    if (dr.ok && dr.data && Array.isArray(dr.data.agents)) ETAT.droits = dr.data;
    if (voie.ok && voie.data) {
      ETAT.voie = voie.data;
      const ec = voie.data.en_cours || (voie.data.voie && voie.data.voie.enCours) || null;
      if (el.voie) {
        el.voie.textContent = 'VOIE ' + (ec ? 'OCCUPÉE' : 'LIBRE');
        el.voie.className = 'cc-pastille' + (ec ? ' slow' : '');
        el.voie.title = ec ? ('Job lourd en cours : ' + JSON.stringify(ec).slice(0, 200)) : 'Aucun job lourd : la voie est libre.';
      }
    }
    rendreAgent();
  }

  // ------------------------------- Démarrage --------------------------------
  function brancher() {
    if (window.IsaacCore) {
      IsaacCore.init('#core');
      IsaacCore.setAgent(ETAT.agent);
      IsaacCore.abonner(function (snap) {
        if (el.coreEtat) el.coreEtat.textContent = snap.label;
        if (el.coreDetail && !snap.moteur) el.coreDetail.textContent = snap.moteur;
        rafraichirLegende();
      });
      rafraichirLegende();
    } else if (el.coreDetail) {
      el.coreDetail.textContent = 'le module core.js n a pas pu etre charge';
    }

    if (window.VoiceClient) {
      VoiceClient.onParole(function (s) {
        if (s.parle) setCore('SPEAKING', 'voix de ' + String(s.agent || ETAT.agent).toUpperCase());
        else if (IsaacCore.etat().etat === 'SPEAKING') setCore('IDLE', 'en attente');
      });
      VoiceClient.onMoteur(function () { rafraichirPastilleVoix(); });
    }

    const envoi = $('#btnEnvoyer');
    if (envoi) envoi.onclick = function () { envoyer(el.saisie.value); };
    if (el.saisie) el.saisie.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); envoyer(el.saisie.value); } });

    const bc = $('#btnCouper'); if (bc) bc.onclick = function () { if (window.VoiceClient) VoiceClient.couper(); setCore('IDLE', 'voix coupee par Isaac'); msg(null, 'Voix coupée.', 'systeme'); };
    const bv = $('#btnVider'); if (bv) bv.onclick = function () { el.log.innerHTML = ''; msg(null, 'Affichage vidé. Le journal du serveur, lui, reste gravé — une preuve ne s efface pas d un clic.', 'systeme'); };
    const ba = $('#btnAgents'); if (ba) ba.onclick = modaleAgents;
    const bm = $('#btnMissions'); if (bm) bm.onclick = modaleMissions;
    const bo = $('#btnOutils'); if (bo) bo.onclick = modaleOutils;
    const br = $('#btnReglages'); if (br) br.onclick = modaleReglages;
    const bch = $('#btnChanger'); if (bch) bch.onclick = modaleAgents;
    const bp = $('#btnFluxPause');
    if (bp) bp.onclick = function () {
      ETAT.fluxFige = !ETAT.fluxFige;
      bp.textContent = ETAT.fluxFige ? 'REPRENDRE' : 'FIGER';
      bp.className = 'cc-petit' + (ETAT.fluxFige ? ' actif' : '');
    };
    initMic();
  }

  function boucles() {
    sondeSysteme(); sondeAI(); sondeEvenements(); rafraichirPastilleVoix();
    setInterval(sondeSysteme, 3000);
    setInterval(sondeEvenements, 4000);
    setInterval(sondeAI, 20000);
    // Chien de garde de la page : si aucune réponse n'est arrivée depuis 25 s,
    // on le dit franchement au lieu de laisser un écran figé faire croire que tout va bien.
    setInterval(function () {
      if (dernierPing && (Date.now() - dernierPing) > 25000 && ETAT.serveur !== 'mort') {
        ETAT.serveur = 'mort';
        setCore('OFFLINE', 'aucune mesure recue depuis 25 s');
        bandeau('Aucune mesure reçue depuis 25 secondes. Le cerveau tourne peut-être encore, mais cette page ne reçoit plus rien — elle ne complète pas les trous avec des chiffres inventés.');
        if (el.ptServeur) el.ptServeur.className = 'cc-point mort';
        if (el.txtServeur) el.txtServeur.textContent = 'SERVEUR MUET';
      }
    }, 5000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { brancher(); boucles(); });
  else { brancher(); boucles(); }

  msg(null, 'JARVIS COMMAND CENTER ouvert. Tout ce qui est affiché ici est lu du cerveau (127.0.0.1) : mesures de la machine, table des droits, journaux gravés. Rien n est simulé.', 'systeme');
})();

// ============================================================================
//  HUD DEMARRAGE — assemble les modules de command-center.html
// ----------------------------------------------------------------------------
//  Responsabilite UNIQUE : demarrer la page. Ce fichier ne contient AUCUN
//  panneau et AUCUNE modale : il branche les boutons sur les modules, lance
//  leurs sondes, lit /api/ai/etat + /api/cerveau + /api/orchestrateur (ce que
//  personne d autre ne lit), et tient le chien de garde de fraicheur.
//  Ordre de chargement exige dans le HTML : core.js, voiceClient.js, hud.js
//  (le kit), systeme.js, flux.js, conversation.js, agents.js, missions.js,
//  permissions.js, memoire.js, outils.js, reglages.js, puis celui-ci.
//  Chien de garde : si aucune mesure n arrive pendant 25 s, la page le DIT au
//  lieu de laisser un ecran fige faire croire que tout va bien.
// ============================================================================
(function () {
  'use strict';
  const K = window.HudKit;
  if (!K) { console.warn('command-center : kit absent — la page ne demarre pas'); return; }
  const el = K.el, ETAT = K.ETAT;

  // --------------------- Ce que seul le demarrage lit -----------------------
  // ai/etat  -> le modele reel de l agente active (panneau AGENTS)
  // cerveau  -> les compteurs de memoire (panneau AGENTS)
  // orchestrateur -> la pastille VOIE (qui tient la voie maintenant)
  async function sondeAI() {
    const [ai, cerv, voie] = await Promise.all([
      K.api('api/ai/etat', { timeout: 8000 }),
      K.api('api/cerveau', { timeout: 8000 }),
      K.api('api/orchestrateur', { timeout: 8000 })
    ]);
    if (ai.ok && ai.data) ETAT.ai = ai.data;
    if (cerv.ok && cerv.data && cerv.data.stats) {
      ETAT.cerveau = cerv.data;
      // La pastille MÉMOIRE est la Phase 6 du temps réel : les compteurs viennent du
      // FICHIER de mémoire (lus a chaque tour de sonde), et le survol dit ou c est ecrit
      // et quand le cerveau y a écrit pour la derniere fois. Un compteur non lu s affiche
      // « memoire non lue », jamais un zero.
      const st = cerv.data.stats || {};
      const ac = cerv.data.academie || null;
      const nb = function (n) { return (typeof n === 'number' ? n : '?'); };
      if (el.memoire) {
        el.memoire.textContent = 'MÉMOIRE ' + nb(st.faits) + ' FAITS · ' + nb(st.lecons) + ' LEÇONS';
        el.memoire.className = 'cc-pastille' + (ac && ac.auto ? ' slow' : '');
        el.memoire.title = 'Mémoire gravée dans ' + (cerv.data.ou_c_est_grave || 'le fichier du cerveau')
          + ' · ' + nb(st.echanges) + ' échange(s) au journal, ' + nb(st.scans) + ' scan(s) enregistré(s)'
          + (ac ? ' · régime auto ' + (ac.auto ? 'ACTIF' : 'EN VEILLE') + ', dernière séance ' + (ac.derniere || 'non gravée') : '')
          + (cerv.data.fichier ? ' · dernière écriture il y a ' + Math.round((Date.now() - new Date(cerv.data.fichier.modifie).getTime()) / 1000) + ' s' : '')
          + '. Cliquer pour ouvrir le Memory Center.';
      }
    }
    if (voie.ok && voie.data) {
      ETAT.voie = voie.data;
      const v = voie.data;
      // etatVoie() met le job lui-meme dans `voie` (null = voie libre) : lire ici
      // `voie.data.voie.enCours` ne trouvait jamais rien et la pastille restait
      // bloquee sur LIBRE même sous scan complet. Le titre dit le job reel.
      const ec = v.voie || v.en_cours || null;
      const enFile = Array.isArray(v.file) ? v.file.filter(function (x) { return !x.annulee; }).length : 0;
      if (el.voie) {
        el.voie.textContent = 'VOIE ' + (ec ? 'OCCUPÉE' : (v.pause ? 'EN PAUSE' : 'LIBRE')) + (enFile ? ' · ' + enFile + ' EN FILE' : '');
        el.voie.className = 'cc-pastille' + ((ec || v.pause) ? ' slow' : '');
        el.voie.title = ec
          ? ('Job lourd en cours : ' + (ec.type || '?') + ' sur ' + (ec.cible || '?') + ' par ' + (ec.agent || '?')
            + (ec.progression != null ? ' — ' + ec.progression + '%' : ' — progression non mesurée')
            + (ec.reste_s != null ? ', reste ' + Math.round(ec.reste_s) + ' s' : '') + '. ' + enFile + ' en file.')
          : (v.pause
            ? ('Départs en pause : aucun nouveau job ne part, la file attend. ' + enFile + ' en file.')
            : ('Aucun job lourd : la voie est libre. ' + enFile + ' en file.'));
      }
    }
    if (window.HudAgents) HudAgents.rendre();
  }

  // ------------------------------- Boutons ----------------------------------
  function brancher() {
    if (window.IsaacCore) {
      IsaacCore.init('#core');
      IsaacCore.setAgent(ETAT.agent);
      IsaacCore.abonner(function (snap) {
        if (el.coreEtat) el.coreEtat.textContent = snap.label;
        if (el.coreDetail && !snap.moteur) el.coreDetail.textContent = snap.moteur;
        K.rafraichirLegende();
      });
      K.rafraichirLegende();
    } else if (el.coreDetail) {
      el.coreDetail.textContent = 'le module core.js n a pas pu etre charge';
    }

    if (window.VoiceClient) {
      VoiceClient.onParole(function (s) {
        if (s.parle) K.setCore('SPEAKING', 'voix de ' + String(s.agent || ETAT.agent).toUpperCase());
        else if (window.IsaacCore && IsaacCore.etat().etat === 'SPEAKING') K.setCore('IDLE', 'en attente');
      });
      VoiceClient.onMoteur(function () { K.rafraichirPastilleVoix(); });
    }

    if (window.HudConversation) HudConversation.brancher();
    if (window.HudFlux) HudFlux.brancher();

    const ba = K.$('#btnAgents'); if (ba) ba.onclick = function () { if (window.HudAgents) HudAgents.modale(); };
    const bm = K.$('#btnMissions'); if (bm) bm.onclick = function () { if (window.HudMissions) HudMissions.modale(); };
    const bp = K.$('#btnPermissions'); if (bp) bp.onclick = function () { if (window.HudPermissions) HudPermissions.modale(); };
    const bme = K.$('#btnMemoire'); if (bme) bme.onclick = function () { if (window.HudMemoire) HudMemoire.modale(); };
    // La pastille du bandeau ouvre le meme Memory Center : un chiffre affiche doit
    // toujours mener a la source qui le produit.
    if (el.memoire) el.memoire.onclick = function () { if (window.HudMemoire) HudMemoire.modale(); };
    const bo = K.$('#btnOutils'); if (bo) bo.onclick = function () { if (window.HudOutils) HudOutils.modale(); };
    const br = K.$('#btnReglages'); if (br) br.onclick = function () { if (window.HudReglages) HudReglages.modale(); };
    const bch = K.$('#btnChanger'); if (bch) bch.onclick = function () { if (window.HudAgents) HudAgents.modale(); };
  }

  function boucles() {
    if (window.HudSysteme) HudSysteme.demarrer();
    if (window.HudFlux) HudFlux.demarrer();
    if (window.HudAgents) HudAgents.demarrer();
    sondeAI();
    setInterval(sondeAI, 20000);
    K.rafraichirPastilleVoix();

    // Chien de garde de la page : si aucune mesure n'est arrivee depuis 25 s,
    // on le dit franchement au lieu de laisser un ecran fige mentir par silence.
    setInterval(function () {
      if (ETAT.dernierPing && (Date.now() - ETAT.dernierPing) > 25000 && ETAT.serveur !== 'mort') {
        ETAT.serveur = 'mort';
        K.setCore('OFFLINE', 'aucune mesure recue depuis 25 s');
        K.bandeau('Aucune mesure reçue depuis 25 secondes. Le cerveau tourne peut-être encore, mais cette page ne reçoit plus rien — elle ne complète pas les trous avec des chiffres inventés.');
        if (el.ptServeur) el.ptServeur.className = 'cc-point mort';
        if (el.txtServeur) el.txtServeur.textContent = 'SERVEUR MUET';
      }
    }, 5000);
  }

  function demarrer() {
    brancher();
    boucles();
    K.msg(null, 'JARVIS COMMAND CENTER ouvert. Tout ce qui est affiché ici est lu du cerveau (127.0.0.1) : mesures de la machine, table des droits, journaux gravés. Rien n est simulé.', 'systeme');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();

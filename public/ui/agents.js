// ============================================================================
//  HUD AGENTS — le panneau de droite + la modale des quatre (cinq) agentes
// ----------------------------------------------------------------------------
//  Responsabilite UNIQUE : dire QUI est active, avec quels DROITS reels, quelle
//  voix, quelle memoire — et permettre de changer d agente.
//  Les droits viennent de /api/droits, lu des le PREMIER tour de sonde : sans
//  lui le panneau dirait d une agente qu elle n est pas dans la table alors
//  qu elle y est, et un affichage faux est un mensonge autant qu un chiffre invente.
//  Le modele affiche est celui que le cerveau declare (/api/ai/etat via ETAT.ai),
//  la memoire est les compteurs de /api/cerveau (ETAT.cerveau) — jamais un decor.
// ============================================================================
(function () {
  'use strict';
  const K = window.HudKit;
  if (!K) { console.warn('hud agents : kit absent'); return; }
  const el = K.el, ETAT = K.ETAT, esc = K.esc, ligne = K.ligne, msg = K.msg;

  function rendre() {
    if (!el.agent) return;
    const A = (window.IsaacCore && IsaacCore.AGENTS[ETAT.agent]) || { nom: String(ETAT.agent).toUpperCase(), role: '—', couleur: 0x4fd8ff };
    const ai = ETAT.ai || {};
    const droit = (ETAT.droits || {});
    const fiche = ((droit.agents || []).filter(function (a) { return a.agent === ETAT.agent; })[0]) || null;
    const caps = droit.capacites || {};

    // Le MODELE affiche est celui que le cerveau declare vraiment, et on dit si un
    // fournisseur a repondu depuis le demarrage — jamais un nom de modele decoratif.
    // Depuis la Phase 4, le gateway rend aussi le MODÈLE et le TEMPS mesuré de la
    // dernière réponse : la ligne devient une preuve, pas une étiquette.
    const dr = ai.derniere_reponse || null;
    const f = (ai.fournisseurs || []).filter(function (x) { return x.nom === ai.dernier_fournisseur; })[0] || null;
    const modele = dr
      ? (dr.fournisseur + ' a répondu en dernier · ' + (dr.modele || 'modèle non précisé') + ' · ' + (dr.ms || 0) + ' ms'
         + (dr.pour ? ' (' + dr.pour + ')' : ''))
      : (f ? (ai.dernier_fournisseur + ' a répondu en dernier · ' + (f.modele || 'modèle non précisé'))
        : ('ordre réel : ' + (ai.ordre_reel || 'inconnu') + ' · aucun fournisseur n a encore répondu depuis le démarrage'));

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

    // Phase 5 : ce que cette agente A FAIT depuis le boot, mesuré par /api/command
    // lui-même (le compteur suit l agente qui a RENDU la réponse). Zéro = « aucun
    // ordre traité », pas un tiret décoratif.
    const act = ((ETAT.droits || {}).activite || {})[ETAT.agent] || null;
    h += ligne('ACTIVITÉ', act
      ? (act.commandes + ' ordre(s) traité(s) sous son nom depuis le boot' + (act.refus ? ' · ' + act.refus + ' refus de droit' : '')
        + (act.derniere_phrase ? ' · dernier : « ' + act.derniere_phrase + ' » (' + (act.derniere_source || '?') + ')' : ''))
      : 'aucun ordre traité sous son nom depuis le démarrage de ce cerveau', !act);

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

  // La table des droits a sa propre sonde : elle ne depend ni de l IA ni de la voie.
  async function sondeDroits() {
    const r = await K.api('api/droits', { timeout: 8000 });
    if (r.ok && r.data && Array.isArray(r.data.agents)) {
      ETAT.droits = r.data;
      rendre();
    }
  }

  async function modale() {
    K.ouvrirModale('Agents — la table réelle du serveur', '<div class="cc-note">Lecture de /api/droits…</div>');
    const r = await K.api('api/droits');
    if (!r.ok || !r.data || !r.data.agents) {
      K.ouvrirModale('Agents', '<div class="cc-note">La table des droits n a pas pu être lue : ' + esc(r.status ? 'HTTP ' + r.status : (r.erreur || 'réponse illisible')) + '. Je n invente pas de droits.</div>');
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
          // Phase 5 : les droits disent ce qu'elle PEUT, cette ligne dit ce qu'elle
          // A FAIT depuis le boot — mesuré par /api/command, pas estimé.
          + '<div class="cc-note" style="padding-left:0;margin-top:8px">' + (function () {
              const act = (r.data.activite || {})[a.agent] || null;
              if (!act) return 'aucun ordre traité sous son nom depuis le démarrage de ce cerveau';
              return act.commandes + ' ordre(s) traité(s) sous son nom'
                + (act.derniere_phrase ? ' · dernier : « ' + esc(act.derniere_phrase) + ' » (' + esc(act.derniere_source || '?') + ')' : '')
                + (act.refus ? ' · ' + act.refus + ' refus de droit, dernier : ' + esc(act.dernier_refus || '?') : ' · aucun refus de droit');
            })() + '</div>'
          + '<div class="cc-carte-actions"><button class="cc-petit" data-activer="' + esc(a.agent) + '">ACTIVER</button></div>'
          + '</div>';
      }).join('') + '</div>'
      + '<div class="cc-note" style="margin-top:12px">Compteurs d activité mesurés par /api/command depuis le démarrage de ce cerveau — le compteur suit l agente qui a RENDU la réponse'
      + (typeof r.data.depuis_s === 'number' ? ' (il y a ' + esc(K.duree(r.data.depuis_s) || '?') + ')' : '')
      + ' — un zéro ici est un zéro vrai. Une agente inconnue de la table n a AUCUN droit : le serveur la refuse et le grave.</div>'
      + ((r.data.refus_recent && r.data.refus_recent.length)
        ? '<h4 style="margin:16px 0 8px;font-size:10px;letter-spacing:.2em;color:var(--cyan-fort)">DERNIERS REFUS GRAVÉS</h4>'
          + r.data.refus_recent.slice(0, 8).map(function (l) { return '<div class="cc-ev"><span class="cc-ev-txt">' + esc(l) + '</span></div>'; }).join('')
        : '<div class="cc-note" style="margin-top:14px">Aucun refus gravé récemment.</div>');
    K.ouvrirModale('Agents — la table réelle du serveur', h);
    el.modaleCorps.querySelectorAll('[data-activer]').forEach(function (b) {
      b.onclick = function () {
        ETAT.agent = b.getAttribute('data-activer');
        if (window.IsaacCore) IsaacCore.setAgent(ETAT.agent);
        try { localStorage.setItem('ij-agent', ETAT.agent); } catch (e) {}
        K.rafraichirLegende(); rendre(); K.fermerModale();
        msg(null, 'Agente active : ' + ETAT.agent.toUpperCase() + '. Les commandes suivantes partent sous son nom et ses droits.', 'systeme');
      };
    });
  }

  function demarrer() {
    sondeDroits();
    setInterval(sondeDroits, 20000);
  }

  window.HudAgents = { rendre: rendre, sonde: sondeDroits, modale: modale, demarrer: demarrer };
})();

// ============================================================================
//  HUD CONVERSATION — la barre du bas : parler, ecrire, ecouter
// ----------------------------------------------------------------------------
//  Responsabilite UNIQUE : faire partir un ordre vers /api/command, ecrire la
//  reponse dans le journal de conversation, ouvrir la page que le cerveau
//  demande, et faire parler la reponse par le VoiceClient (neuronal d abord).
//  Le micro vit ici aussi : le texte BRUT du micro part tel quel au cerveau,
//  sans nettoyage — c est la regle de test d Isaac.
//  Ce module ne decide JAMAIS a la place du cerveau : il affiche la source
//  ('local' = la machine a agi, 'ai' = des mots seulement) telle qu elle arrive.
// ============================================================================
(function () {
  'use strict';
  const K = window.HudKit;
  if (!K) { console.warn('hud conversation : kit absent'); return; }
  const el = K.el, ETAT = K.ETAT, msg = K.msg;

  async function envoyer(texte, depuisMic) {
    const t = String(texte || '').trim();
    if (!t) return;
    const A = (window.IsaacCore && IsaacCore.AGENTS[ETAT.agent]) || { nom: ETAT.agent };
    msg('ISAAC' + (depuisMic ? ' · micro' : ''), t, 'moi');
    if (el.saisie) el.saisie.value = '';
    K.setCore('THINKING', 'requete partie vers le cerveau — ' + new Date().toLocaleTimeString('fr-FR'));

    const r = await K.api('api/command', {
      timeout: 90000,
      fetch: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t })
      }
    });

    if (!r.ok || !r.data) {
      K.setCore('ERROR', 'le cerveau n a pas repondu correctement');
      msg(null, 'Le cerveau n a pas répondu : ' + (r.status ? 'HTTP ' + r.status : (r.erreur || 'pas de réponse')) + '. Rien n a été exécuté.', 'erreur');
      return;
    }
    const d = r.data;
    const rep = String(d.reply || '').trim();

    // Une agente a reellement pris la main : le noyau prend SA couleur.
    if (d.agent && window.IsaacCore && IsaacCore.AGENTS[String(d.agent).toLowerCase()]) {
      ETAT.agent = String(d.agent).toLowerCase();
      if (IsaacCore.setAgent) IsaacCore.setAgent(ETAT.agent);
      try { localStorage.setItem('ij-agent', ETAT.agent); } catch (e) {}
      K.rafraichirLegende();
    }

    // La source est la verite de ce qui s'est passe : 'local' = la machine a agi,
    // 'ai' = un cerveau a repondu avec des mots, rien n'a ete execute. On l'ecrit.
    const src = d.source === 'local' ? 'exécuté sur la machine (source: local)'
      : d.source === 'ai' ? 'réponse d un modèle IA (source: ai) — rien n a été exécuté sur la machine'
      : 'source: ' + (d.source || 'inconnue');
    ETAT.derniereSource = src;

    K.setCore(d.source === 'local' ? 'PROCESSING' : 'SEARCHING', src);
    msg(A.nom, rep || '(réponse vide)', 'agent', src);

    // Navigation reelle : si le cerveau renvoie une page, on l'ouvre vraiment.
    if (d.open) {
      const cible = d.open;
      msg(null, 'Le cerveau demande l ouverture de ' + cible + ' — ouverture dans un nouvel onglet.', 'systeme');
      try { window.open(cible, '_blank', 'noopener'); } catch (e) { msg(null, 'Ouverture impossible : ' + e.message, 'erreur'); }
    }

    // La voix : moteur neuronal local d'abord, repli navigateur sinon, raison reelle affichee.
    const p = window.VoiceClient ? VoiceClient.profil(ETAT.agent) : null;
    if (window.VoiceClient && (!p || p.autoParle !== false) && rep) {
      K.setCore('SPEAKING', 'voix en cours — ' + (window.VoiceClient.neuronalDispo() ? 'neuronal local' : 'repli navigateur'));
      const res = await VoiceClient.parler(rep, { agent: (d.agent || ETAT.agent) });
      if (res && res.raisonRepli) {
        msg(null, 'Voix : ' + res.raisonRepli, 'systeme');
      }
      K.rafraichirPastilleVoix();
    }
    ETAT.derniereAction = { texte: t.slice(0, 90), t: Date.now() };
    K.setCore('IDLE', 'en attente — dernière commande : ' + new Date().toLocaleTimeString('fr-FR'));
    if (window.HudAgents) HudAgents.rendre();
  }

  // ================================== MICRO =================================
  let rec = null;
  function initMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btn = K.$('#btnParler');
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
      K.setCore('LISTENING', 'micro ouvert — langue ' + langue);
      msg(null, 'Micro ouvert (' + langue + '). Parle, Isaac — le texte brut du micro est envoyé tel quel au cerveau.', 'systeme');
      let recu = '';
      rec.onresult = function (e) {
        try { recu = e.results[0][0].transcript; } catch (x) { recu = ''; }
      };
      rec.onerror = function (e) {
        msg(null, 'Micro en erreur : ' + (e.error || 'raison inconnue') + '. Rien n a été écouté.', 'erreur');
        K.setCore('ERROR', 'micro en erreur : ' + (e.error || '?'));
      };
      rec.onend = function () {
        btn.classList.remove('ecoute');
        const r = rec; rec = null;
        if (recu.trim()) envoyer(recu, true);
        else { K.setCore('IDLE', 'rien n a été entendu'); msg(null, 'Rien n a été entendu — le micro s est refermé sans transcription.', 'systeme'); }
        if (r) { try { r.abort(); } catch (e) {} }
      };
      try { rec.start(); } catch (e) {
        btn.classList.remove('ecoute'); rec = null;
        msg(null, 'Le micro n a pas pu démarrer : ' + e.message, 'erreur');
        K.setCore('IDLE', 'micro refusé');
      }
    };
  }

  function brancher() {
    const envoi = K.$('#btnEnvoyer');
    if (envoi) envoi.onclick = function () { envoyer(el.saisie.value); };
    if (el.saisie) el.saisie.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); envoyer(el.saisie.value); } });

    const bc = K.$('#btnCouper');
    if (bc) bc.onclick = function () { if (window.VoiceClient) VoiceClient.couper(); K.setCore('IDLE', 'voix coupee par Isaac'); msg(null, 'Voix coupée.', 'systeme'); };
    const bv = K.$('#btnVider');
    if (bv) bv.onclick = function () { el.log.innerHTML = ''; msg(null, 'Affichage vidé. Le journal du serveur, lui, reste gravé — une preuve ne s efface pas d un clic.', 'systeme'); };
    initMic();
  }

  window.HudConversation = { envoyer: envoyer, initMic: initMic, brancher: brancher };
})();

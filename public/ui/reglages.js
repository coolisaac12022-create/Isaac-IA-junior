// ============================================================================
//  HUD REGLAGES — la modale Settings du JARVIS (Phase 6 : réglages COMPLETS)
// ----------------------------------------------------------------------------
//  Responsabilite UNIQUE : les reglages de CE NAVIGATEUR (profils vocaux par
//  agente, langue de dictee) et ce que le cerveau accepte qu on change CHEZ LUI
//  par les DEUX SEULES routes gardees qui existent deja :
//    1. POST /api/ai/mode  — quel cerveau IA est essaye en premier ;
//    2. POST /api/command  — le regime automatique de l Academie, qui est une
//        commande dictee, pas un champ cache.
//  Ce n est plus « rien n ecrit ici » : c est ecrit, par la porte du serveur, avec
//  le prenom de l agente active, et la table des droits repond « non » quand ce
//  n est pas son droit — le refus s affiche tel quel. AUCUNE cle, AUCUN chemin de
//  fichier, AUCUNE permission ne transite par cette page : isaac-keys.json n est
//  jamais lu ici, et un profil vocal modifie reste dans localStorage['ij-voix-profil'].
//  Regle d honnetete : chaque interrupteur commande un mecanisme REEL et la page
//  RELIT l etat apres l écriture pour le verifier. Un reglage qui ne change rien
//  n a pas le droit d exister dans cette modale — ce qui n est pas commandable
//  est affiche en LECTURE SEULE, avec la phrase qui le dit.
// ============================================================================
(function () {
  'use strict';
  const K = window.HudKit;
  if (!K) { console.warn('hud reglages : kit absent'); return; }
  const el = K.el, ETAT = K.ETAT, esc = K.esc, mo = K.mo, non = K.non, msg = K.msg;

  const QUALITES = ['rapide', 'qualite'];
  const NOMS_FOURNISSEURS = { auto: 'auto — le cerveau arbitre', piper_local: 'piper_local — neuronal installé chez Isaac', nvidia_nim: 'nvidia_nim — pont NVIDIA NIM' };

  // La liste des fournisseurs est celle que LE CERVEAU declare (GET /api/voix/etat).
  // Une page ne peut pas inventer un moteur : si rien n est lu, seul « auto » est propose.
  function listeFournisseurs() {
    const brut = (window.VoiceClient && VoiceClient.moteurBrut && VoiceClient.moteurBrut()) || {};
    const f = Array.isArray(brut.fournisseurs) ? brut.fournisseurs : [];
    return { declare: f, actifs: brut.moteur_actif || null };
  }

  function optionsFournisseur(valeur) {
    const l = listeFournisseurs();
    const connue = (window.VoiceClient && VoiceClient.fournisseursConnus()) || ['auto'];
    const items = ['auto'].concat(l.declare.map(function (x) { return x && x.nom; }).filter(function (n) { return n && connue.indexOf(n) >= 0 && n !== 'auto'; }));
    // Un profil enregistre sur un fournisseur que le cerveau ne declare plus (cle retiree,
    // pont eteint) reste VISIBLE tel quel : la page ne remet pas silencieusement le curseur
    // sur « auto » en faisant croire que c est ce qu Isaac avait choisi.
    if (valeur && items.indexOf(valeur) < 0) items.push(valeur);
    return items.map(function (n) {
      const d = n === 'auto' ? null : l.declare.filter(function (x) { return x && x.nom === n; })[0];
      const etat = n === 'auto' ? '' : (d && d.dispo ? ' — allumé'
        : ' — éteint ' + (d && d.raison ? '(' + String(d.raison).split(' — ')[0].slice(0, 34) + ')'
          : (d ? '' : '(plus déclaré par ce cerveau)')));
      return '<option value="' + n + '"' + (valeur === n ? ' selected' : '') + '>' + esc((NOMS_FOURNISSEURS[n] || n) + etat) + '</option>';
    }).join('');
  }

  function modale() {
    const P = window.VoiceClient ? VoiceClient.profils() : {};
    const ai = ETAT.ai || {};
    const cerv = ETAT.cerveau || {};
    const ac = cerv.academie || null;
    const lf = listeFournisseurs();

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
        + '<div class="cc-champ"><label>Fournisseur de voix</label><select data-a="' + a + '" data-k="fournisseur">' + optionsFournisseur(p.fournisseur || 'auto') + '</select></div>'
        + '<div class="cc-champ"><label>Modèle neuronal</label><select data-a="' + a + '" data-k="qualite">'
        + QUALITES.map(function (q) {
            return '<option value="' + q + '"' + ((p.qualite || 'rapide') === q ? ' selected' : '') + '>' + (q === 'rapide' ? 'rapide — petit modèle (~1 s par phrase)' : 'qualite — grand modèle (plus lent, plus de mémoire)') + '</option>';
          }).join('') + '</select></div>'
        + '<div class="cc-champ"><label>Interruptible</label><select data-a="' + a + '" data-k="interruptible">'
        + '<option value="1"' + (p.interruptible ? ' selected' : '') + '>oui — une nouvelle parole coupe</option>'
        + '<option value="0"' + (!p.interruptible ? ' selected' : '') + '>non — elle finit sa phrase</option></select>'
        + '<div class="cc-champ"><label>Parle auto</label><select data-a="' + a + '" data-k="autoParle">'
        + '<option value="1"' + (p.autoParle ? ' selected' : '') + '>oui</option><option value="0"' + (!p.autoParle ? ' selected' : '') + '>non — texte seulement</option></select>'
        + '<div class="cc-carte-actions"><button class="cc-petit" data-test="' + a + '">ÉCOUTER</button>'
        + '<button class="cc-petit" data-reset="' + a + '">RÉINITIALISER</button></div></div>';
    }).join('');

    // ------------------------- LE CERVEAU IA (ecrit) -------------------------
    const modes = ai.modes_possibles || [];
    const carteMode = '<div class="cc-ligne"><b>MODE ACTUEL</b><span>' + esc(ai.mode || 'non lu')
      + ' · moteur qui a parlé : ' + esc(ai.moteur_actif || 'non lu')
      + ' · instance ' + esc(ai.instance || '?') + '</span></div>'
      + '<div class="cc-ligne"><b>ORDRE AUTO</b><span>' + esc(ai.ordre_reel || 'non lu') + '</span></div>'
      + (modes.length
        ? '<div style="margin:8px 0 10px">' + modes.map(function (m) {
            return '<button class="cc-petit" data-mode="' + esc(m) + '"' + (m === ai.mode ? ' style="border-color:var(--cyan-fort);color:var(--cyan-fort)"' : '') + '>' + esc(String(m).toUpperCase()) + '</button>';
          }).join(' ') + '</div>'
        : '<div class="cc-note">La liste des modes n a pas pu être lue : aucun bouton n est proposé, au lieu d en afficher qui ne changeraient rien.</div>')
      + ((ai.fournisseurs || []).map(function (x) {
          return '<div class="cc-ligne"><b>' + esc(x.nom.toUpperCase()) + '</b>' + (x.configure ? '<span>configuré — ' + esc(x.modele || '') + '</span>' : non('sans clé')) + '</div>';
        }).join(''))
      + '<div class="cc-note">Le choix part en POST /api/ai/mode avec le prénom de l’agente active (' + esc(ETAT.agent || '?') + ') : la capacité « code » est exigée côté serveur, et un refus nomme celle qui peut. '
      + 'Aucune clé n est affichée ni envoyée au navigateur : seule sa présence est lisible. '
      + 'NVIDIA NIM est une couche préparée — sans clé ni pont HTTP côté serveur, tout continue sur ce qui est déjà prouvé ici.</div>';

    // ------------------------ L'ACADÉMIE (ecrit, vérifié) ------------------------
    const carteAc = ac
      ? '<div class="cc-ligne"><b>RÉGIME AUTO</b><span>' + esc(ac.auto ? 'ACTIF — une séance spontanée environ toutes les 24 h' : 'EN VEILLE — les séances partent sur demande') + '</span></div>'
        + '<div class="cc-ligne"><b>DERNIÈRE SÉANCE</b><span>' + esc(ac.derniere || 'non gravée') + '</span></div>'
        + '<div class="cc-ligne"><b>LEÇONS GRAVÉES</b><span>' + esc(String(ac.lecons_gravees != null ? ac.lecons_gravees : '?')) + ' · ' + esc(ac.attente || 'attente non lue') + '</span></div>'
        + '<div style="margin:8px 0 10px"><button class="cc-petit" data-ac="' + (ac.auto ? 'off' : 'on') + '">' + (ac.auto ? 'ÉTEINDRE LE RÉGIME AUTO' : 'ALLUMER LE RÉGIME AUTO') + '</button>'
        + '<button class="cc-petit" data-ac="relire">RELIRE L ÉTAT</button></div>'
        + '<div class="cc-note">Ce bouton dicte la commande au cerveau (« ' + esc(ETAT.agent || 'aelyra') + ', ' + (ac.auto ? 'désactive' : 'active') + ' l académie automatique ») : c est le même chemin que le micro, et la mémoire est relue après pour vérifier que le fichier a vraiment changé — la page n affiche pas un état qu elle n a pas relu.</div>'
      : '<div class="cc-note">L état de l Académie n a pas pu être lu (/api/cerveau n a pas répondu sur ce champ) : aucun bouton n est proposé tant que l état n est pas connu.</div>';

    const h = '<div class="cc-note" style="margin-bottom:12px">Deux réglages écrivent chez le cerveau — le mode du cerveau IA et le régime de l Académie — par les deux routes que le serveur garde déjà, avec le prénom de l’agente active. '
      + 'Tout le reste est local à ce navigateur (profils vocaux, langue de dictee) ou en LECTURE SEULE, et c est écrit comme tel.</div>'
      + '<div class="cc-reglages">'
      + '<div class="cc-bloc"><h4>Cerveau IA — mode (écrit sur le serveur)</h4>' + carteMode + '</div>'
      + '<div class="cc-bloc"><h4>Académie — régime automatique (écrit dans la mémoire)</h4>' + carteAc + '</div>'
      + '<div class="cc-bloc"><h4>Interface (lecture seule)</h4>'
      + '<div class="cc-ligne"><b>THÈME</b><span>holographique bleu nuit (propre au Command Center — un seul thème, aucun interrupteur décoratif)</span></div>'
      + '<div class="cc-ligne"><b>NOYAU</b><span>' + esc(window.IsaacCore ? (IsaacCore.etat().moteur3d ? 'WebGL — Three.js servi en local' : 'repli CSS — Three.js absent') : 'module non chargé') + '</span></div>'
      + '<div class="cc-ligne"><b>ÉTATS DU CORE</b><span>' + esc(window.IsaacCore ? IsaacCore.ETATS.join(', ') : '—') + '</span></div>'
      + '<div class="cc-ligne"><b>SONDES</b><span>système 5 s · flux 4 s · droits et mémoire 20 s — la pastille FRAÎCHEUR du bandeau dit l âge réel de la dernière mesure</span></div>'
      + '<div class="cc-champ"><label>Dictée</label><select id="regDictee">'
      + ['fr-FR', 'en-US', 'es-ES', 'de-DE', 'it-IT', 'pt-BR'].map(function (l) {
          let sel = ''; try { sel = (localStorage.getItem('ij-dictee') || 'fr-FR') === l ? ' selected' : ''; } catch (e) {}
          return '<option value="' + l + '"' + sel + '>' + l + '</option>';
        }).join('') + '</select></div>'
      + '<div class="cc-note">Le micro peut écouter dans une autre langue ; les ORDRES, eux, ne sont compris qu en français par le cerveau.</div></div>'
      + '<div class="cc-bloc"><h4>Voix — moteur (lecture du serveur)</h4>'
      + '<div class="cc-ligne"><b>FOURNISSEURS DÉCLARÉS</b><span>' + (lf.declare.length
          ? lf.declare.map(function (x) { return esc(x.nom + (x.dispo ? ' ✓' : ' ✕')); }).join(' · ') + (lf.actifs ? ' · actif : ' + esc(lf.actifs) : '')
          : non('liste non lue — seul « auto » est proposé ci-dessous')) + '</span></div>'
      + '<div id="regVoix"><div class="cc-note">Lecture de l état du moteur…</div></div></div>'
      + '</div>'
      + '<h4 style="margin:18px 0 10px;font-size:10px;letter-spacing:.2em;color:var(--cyan-fort)">PROFILS VOCAUX PAR AGENTE (localStorage de ce navigateur)</h4>'
      + '<div class="cc-reglages">' + lignesAgents + '</div>'
      + '<div class="cc-note" style="margin-top:12px">Les autres interrupteurs de la maison sont sur leurs pages : le registre des tâches et la voie sur /taches.html, les fiches d engagement et leurs preuves sur /engagements.html, '
      + 'le carnet de prospection sur /business.html, le code que l équipe s écrit sur /evolution.html. Cette modale ne duplique pas ce qui existe — et ne promet pas ce qui nexiste pas.</div>';
    K.ouvrirModale('Settings — JARVIS', h);

    // Les reglages branches pour de vrai.
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
        const pf = (window.VoiceClient && VoiceClient.profil(a)) || {};
        K.setCore('SPEAKING', 'essai de la voix de ' + A.nom);
        const res = await VoiceClient.parler('Essai de voix : je suis ' + (A.nom || a) + '. Cette phrase est produite par le moteur reel de ce PC.', { agent: a });
        msg(null, 'Essai de voix ' + (A.nom || a) + ' (' + (pf.fournisseur || 'auto') + ' · ' + (pf.qualite || 'rapide') + ') : '
          + (res.lu ? 'lu par ' + res.moteur : 'non lu — ' + (res.raison || res.raisonRepli || 'raison inconnue'))
          + (res.repli ? ' · ' + res.repli + ' morsceau(x) en repli navigateur' : ''), 'systeme');
        K.setCore('IDLE', 'essai de voix terminé');
      };
    });
    el.modaleCorps.querySelectorAll('[data-reset]').forEach(function (b) {
      b.onclick = function () {
        if (window.VoiceClient) VoiceClient.resetProfil(b.getAttribute('data-reset'));
        modale(); msg(null, 'Profil vocal réinitialisé pour ' + b.getAttribute('data-reset') + '.', 'systeme');
      };
    });

    // ---- Le mode du cerveau IA : POST /api/ai/mode, et la reponse VRAIE s affiche.
    el.modaleCorps.querySelectorAll('[data-mode]').forEach(function (b) {
      b.onclick = async function () {
        const cible = b.getAttribute('data-mode');
        b.disabled = true;
        const r = await K.api('api/ai/mode', {
          timeout: 9000,
          fetch: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: cible, par: ETAT.agent || 'aelyra' }) }
        });
        b.disabled = false;
        const d = r.data || {};
        msg(null, d.reply || ('Le cerveau n a pas répondu : ' + (r.status ? 'HTTP ' + r.status : (r.erreur || 'pas de réponse')) + ' — rien n est change.'), d.ok ? 'systeme' : 'erreur');
        if (d.ok) { const a = await K.api('api/ai/etat', { timeout: 8000 }); if (a.ok && a.data) ETAT.ai = a.data; modale(); }
      };
    });

    // ---- Le regime de l Academie : une COMMANDE dictee, puis la memoire RELUE.
    Array.prototype.forEach.call(el.modaleCorps.querySelectorAll('[data-ac]'), function (b) {
      b.onclick = async function () {
        const geste = b.getAttribute('data-ac');
        if (geste === 'relire') { await relireAcademie(); modale(); msg(null, 'État de l Académie relu dans le fichier de mémoire.', 'systeme'); return; }
        b.disabled = true;
        const qui = ETAT.agent || 'aelyra';
        const phrase = qui + ', ' + (geste === 'on' ? 'active' : 'désactive') + ' l académie automatique';
        const r = await K.api('api/command', {
          timeout: 30000,
          fetch: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: phrase }) }
        });
        b.disabled = false;
        const d = r.data || {};
        if (!d.reply) {
          msg(null, 'Le cerveau n a pas répondu (' + (r.status ? 'HTTP ' + r.status : (r.erreur || 'pas de réponse')) + ') : le régime de l Académie n a pas été changé.', 'erreur');
          return;
        }
        // La verification n est pas la reponse polie : on relit le fichier.
        const apres = await relireAcademie();
        msg(null, d.reply + (apres === null ? ' — (état relu : lecture impossible)' : ' — et le fichier de mémoire dit maintenant : régime ' + (apres ? 'ACTIF' : 'EN VEILLE') + '.'),
          d.refus ? 'erreur' : 'systeme');
        modale();
      };
    });

    const dd = el.modaleCorps.querySelector('#regDictee');
    if (dd) dd.onchange = function () {
      try { localStorage.setItem('ij-dictee', dd.value); } catch (e) {}
      if (window.HudConversation) HudConversation.initMic();
      msg(null, 'Le micro écoute désormais en ' + dd.value + '.', 'systeme');
    };

    // L'etat du moteur, tel que le Voice Manager le mesure.
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

  // Relit /api/cerveau et remet le cache du kit a jour. Rend l etat REEL, ou null.
  async function relireAcademie() {
    const r = await K.api('api/cerveau', { timeout: 9000 });
    if (r.ok && r.data && r.data.academie) { ETAT.cerveau = r.data; return !!r.data.academie.auto; }
    return null;
  }

  window.HudReglages = { modale: modale };
})();

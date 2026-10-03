// ============================================================================
//  HUD REGLAGES — la modale Settings du JARVIS
// ----------------------------------------------------------------------------
//  Responsabilite UNIQUE : les reglages QUI APPARTIENNENT A CE NAVIGUEUR
//  (profils vocaux par agente, langue de dictee) et la LECTURE honnete de ce
//  que le cerveau declare (mode IA, ordre des fournisseurs, etat du moteur de
//  voix). Rien ici n ecrit sur le serveur : aucune cle, aucune permission.
//  Un profil vocal modifie est sauvegarde par le VoiceClient dans
//  localStorage['ij-voix-profil'] — partage avec toute page qui parlera.
// ============================================================================
(function () {
  'use strict';
  const K = window.HudKit;
  if (!K) { console.warn('hud reglages : kit absent'); return; }
  const el = K.el, ETAT = K.ETAT, esc = K.esc, mo = K.mo, non = K.non, msg = K.msg;

  function modale() {
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
        + '<option value="0"' + (!p.interruptible ? ' selected' : '') + '>non — elle finit sa phrase</option></select>'
        + '<div class="cc-champ"><label>Parle auto</label><select data-a="' + a + '" data-k="autoParle">'
        + '<option value="1"' + (p.autoParle ? ' selected' : '') + '>oui</option><option value="0"' + (!p.autoParle ? ' selected' : '') + '>non — texte seulement</option></select>'
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
        K.setCore('SPEAKING', 'essai de la voix de ' + A.nom);
        const res = await VoiceClient.parler('Essai de voix : je suis ' + (A.nom || a) + '. Cette phrase est produite par le moteur reel de ce PC.', { agent: a });
        msg(null, 'Essai de voix ' + (A.nom || a) + ' : ' + (res.lu ? 'lu par ' + res.moteur : 'non lu — ' + (res.raison || res.raisonRepli || 'raison inconnue'))
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

  window.HudReglages = { modale: modale };
})();

// ============================================================================
//  HUD MISSIONS — la modale du registre reel des taches + LA VOIE qui les arbitre
// ----------------------------------------------------------------------------
//  Responsabilite UNIQUE : lire /api/taches ET /api/orchestrateur, et montrer les
//  deux tels qu'ils sont. Une mission ne se cree PAS ici : elle nait d un ordre
//  reel (« scan complet … », « inventaire ») et le cerveau l inscrit au registre.
//  Phase 5 (2026-10-04) : la modale montre aussi QUI TIENT LA VOIE (le job lourd
//  en cours, sa progression MESUREE, son echeance), la file d attente avec ses
//  positions, les compteurs de l orchestrateur et ses derniers mouvements — et
//  elle porte les VRAIS boutons d action : passer en 1er, reculer, pause/reprise
//  de la voie, annuler, taire. Chaque bouton POSTe vers la route existante avec
//  le prenom de l agente active (par), et le serveur repond : un refus de droit
//  s affiche comme un refus, pas comme un silence.
//  Il n y a PAS de bouton « tuer le job en cours » : un balayage dont les paquets
//  sont partis ne se rappelle pas, et le simuler serait un mensonge. « pause »
//  arrete les DEPARTS, et la modale le dit tel quel.
//  Une progression absente s affiche « non mesuree », jamais 0 % decoratif.
// ============================================================================
(function () {
  'use strict';
  const K = window.HudKit;
  if (!K) { console.warn('hud missions : kit absent'); return; }
  const esc = K.esc, non = K.non, duree = K.duree;

  const COULEUR = { finie: 'ok', terminee: 'ok', 'en cours': 'info', en_cours: 'info', file: 'wait', refusee: 'non', echouee: 'non', interrompue: 'wait', annulee: 'non' };

  function barreVoie(v) {
    if (!v) return '<div class="cc-note">La voie est libre : aucun job lourd en cours. Ce n est pas une panne, c est l etat reel.</div>';
    const prog = (typeof v.progression === 'number') ? v.progression : null;
    return '<div class="cc-ligne"><b>EN COURS</b><span>' + esc(v.ref) + ' · ' + esc(v.type || '?') + ' · ' + esc(v.cible || 'cible non dite') + ' · ' + esc(v.agent || '?') + '</span></div>'
      + '<div class="cc-ligne"><b>DURÉE</b><span>depuis ' + esc(duree(v.depuis_s) || '?') + ' · échéance de sécurité dans ' + esc(duree(v.reste_s) || '?') + ' (limite ' + esc(String(v.limite_min)) + ' min)</span></div>'
      + '<div class="cc-ligne"><b>PROGRESSION</b><span>' + (prog === null ? non('non mesurée')
        : '<span class="cc-prog" style="display:inline-block;width:120px;vertical-align:middle"><i style="width:' + Math.max(0, Math.min(100, prog)) + '%"></i></span> ' + prog + ' %') + '</span></div>'
      + (v.etape ? '<div class="cc-ligne"><b>ÉTAPE</b><span>' + esc(v.etape) + '</span></div>' : '');
  }

  async function modale() {
    K.ouvrirModale('Missions — registre réel + la voie', '<div class="cc-note">Lecture de /api/taches et /api/orchestrateur…</div>');
    const [rt, rv] = await Promise.all([K.api('api/taches'), K.api('api/orchestrateur')]);
    if (!rt.ok || !rt.data) {
      K.ouvrirModale('Missions', '<div class="cc-note">Le registre n a pas pu être lu : ' + esc(rt.status ? 'HTTP ' + rt.status : (rt.erreur || 'réponse illisible')) + '.</div>');
      return;
    }
    const t = (rt.data.taches || []);
    const o = (rv.ok && rv.data) ? rv.data : null;
    let h = '';

    // ------------------------------- LA VOIE -------------------------------
    h += '<h4 style="margin:0 0 8px;font-size:10px;letter-spacing:.2em;color:var(--cyan-fort)">LA VOIE — UN SEUL JOB LOURD À LA FOIS</h4>';
    if (!o) {
      h += '<div class="cc-note">L orchestrateur n a pas pu être lu (' + esc(rv.status ? 'HTTP ' + rv.status : (rv.erreur || 'réponse illisible')) + ') : rien n est affiché à sa place.</div>';
    } else {
      h += barreVoie(o.voie || null);
      h += '<div class="cc-ligne"><b>DÉPARTS</b><span>' + (o.pause ? 'EN PAUSE — les jobs en file attendent, aucun nouveau départ' : 'ouverts — le prochain job de la file part dès que la voie se libère') + '</span></div>';      h += '<div style="margin:8px 0 10px">'
        + '<button class="cc-petit" data-voie="' + (o.pause ? 'reprendre' : 'pause') + '">' + (o.pause ? 'REPRENDRE LES DÉPARTS' : 'METTRE LES DÉPARTS EN PAUSE') + '</button>'
        + '</div>';
      h += '<div class="cc-ligne"><b>FILE</b><span>' + (o.file && o.file.length ? o.file.length + ' en attente' : 'vide') + '</span></div>';
      if (o.file && o.file.length) {
        h += '<table class="cc-table"><thead><tr><th>#</th><th>Réf</th><th>Type</th><th>Cible</th><th>Agent</th><th>Attend depuis</th><th></th></tr></thead><tbody>'
          + o.file.map(function (x) {
            return '<tr><td>' + esc(String(x.position)) + '</td><td>' + esc(x.ref) + '</td><td>' + esc(x.type || '?') + '</td>'
              + '<td>' + esc(x.cible || '—') + '</td><td>' + esc(x.agent || '—') + '</td>'
              + '<td>' + esc(duree(x.attend_s) || '?') + '</td>'
              + '<td>' + (x.annulee ? '<span class="cc-badge non">annulée</span>'
                : '<button class="cc-petit" data-orch="priorite" data-ref="' + esc(x.ref) + '">1er</button> '
                + '<button class="cc-petit" data-orch="reculer" data-ref="' + esc(x.ref) + '">reculer</button>') + '</td></tr>';
          }).join('') + '</tbody></table>';
      }
      const c = o.compteurs || {};
      h += '<div class="cc-note" style="margin-top:8px">Compteurs de l orchestrateur : '
        + esc(String(c.jobs_lances != null ? c.jobs_lances : '?')) + ' job(s) lancé(s), '
        + esc(String(c.jobs_en_file != null ? c.jobs_en_file : '?')) + ' mis en file, '
        + esc(String(c.jobs_coupes != null ? c.jobs_coupes : '?')) + ' coupé(s) à l échéance, '
        + esc(String(c.refus_de_la_voie != null ? c.refus_de_la_voie : '?')) + ' refus de la voie · '
        + esc(String(c.taches_au_registre != null ? c.taches_au_registre : '?')) + ' tâche(s) au registre.</div>';
      // La liste FERMEE des jobs lourds : ce qui a le droit de tenir la voie, avec
      // son echeance reelle et les agentes autorisees (derivee de la table DROITS).
      if (o.politique && Array.isArray(o.politique.jobs) && o.politique.jobs.length) {
        h += '<div class="cc-droits" style="margin-top:6px">' + o.politique.jobs.map(function (j) {
          return '<span class="cc-droit" title="' + esc(j.titre || '') + ' — échéance ' + esc(String(j.limite_min)) + ' min — agentes : ' + esc((j.agents || []).join(', ') || 'aucune') + '">'
            + esc(j.type) + ' · ' + esc(String(j.limite_min)) + ' min · ' + esc((j.agents || []).join('/')) + '</span>';
        }).join('') + '</div>';
      }
      if (o.mouvements && o.mouvements.length) {
        h += '<div class="cc-note" style="margin-top:6px">Derniers mouvements : ' + o.mouvements.slice(0, 6).map(esc).join(' · ') + '</div>';
      }
    }

    // ------------------------------ LE REGISTRE -----------------------------
    h += '<h4 style="margin:16px 0 8px;font-size:10px;letter-spacing:.2em;color:var(--cyan-fort)">REGISTRE DES TÂCHES</h4>';
    h += '<div class="cc-note" style="margin-bottom:10px">' + esc(rt.data.resume || '') + '</div>';
    h += (t.length ? '<table class="cc-table"><thead><tr><th>Réf</th><th>Mission</th><th>État</th><th>Agent</th><th>Progression</th><th>Quand</th><th></th></tr></thead><tbody>'
      + t.slice(0, 60).map(function (x) {
        const et = String(x.etat || x.status || '?');
        // La progression vient du registre (creerTache l ecrit toujours en nombre :
        // 0 au depart, valeur mesuree pendant, 100 a la fin). Si un jour le champ
        // manque, on ecrit « non mesuree » au lieu d'un 0 % decoratif.
        const prog = (typeof x.progression === 'number') ? x.progression : (typeof x.pct === 'number' ? x.pct : null);
        // Ce sont les drapeaux DU SERVEUR qui decident des boutons (annulable =
        // en attente, ou en cours hors scan ; taissable = en cours ou en attente) :
        // la page n invente pas un droit d annuler un balayage deja parti.
        const peutAnnuler = !!x.annulable;
        const peutTaire = !!x.taissable;
        const quand = x.depuis ? ('lancée ' + esc(x.depuis) + (x.fin ? ' · finie ' + esc(x.fin) : ''))
          : (x.maj ? esc(new Date(x.maj).toLocaleString('fr-FR')) : (x.quand || '—'));
        return '<tr><td>' + esc(x.ref || '—') + '</td>'
          + '<td>' + esc(x.titre || x.intitule || x.etape || '—') + (x.cible ? ' <span class="cc-ev-heure">→ ' + esc(x.cible) + '</span>' : '') + '</td>'
          + '<td><span class="cc-badge ' + (COULEUR[et.toLowerCase()] || '') + '">' + esc(et) + '</span>' + (x.silence ? ' <span class="cc-badge wait" title="Le rapport reste écrit, la voix est tenue">voix tue</span>' : '') + '</td>'
          + '<td>' + esc(x.agent || '—') + '</td>'
          + '<td>' + (prog === null ? non('non mesurée')
              : '<div class="cc-prog" style="min-width:70px"><i style="width:' + Math.max(0, Math.min(100, prog)) + '%"></i></div><span class="cc-ev-heure">' + prog + ' %</span>') + '</td>'
          + '<td>' + quand + '</td>'
          + '<td>' + ((peutAnnuler || peutTaire)
            ? (peutAnnuler ? '<button class="cc-petit" data-tache="annuler" data-ref="' + esc(x.ref || '') + '">annuler</button> ' : '')
              + (peutTaire ? '<button class="cc-petit" data-tache="taire" data-ref="' + esc(x.ref || '') + '">taire</button>' : '')
            : '<span class="cc-ev-heure">—</span>') + '</td></tr>';
      }).join('') + '</tbody></table>'
      : '<div class="cc-note">Aucune mission au registre. Ce n est pas une erreur : le fichier est vide.</div>');

    h += '<div class="cc-note" style="margin-top:12px">Une mission ne se crée PAS ici : elle naît d un ordre réel (« scan complet … », « inventaire ») et le cerveau l inscrit au registre. '
      + '« Annuler » empêche un départ ou demande l arrêt ; « taire » coupe seulement la VOIX du rapport, qui reste écrit. '
      + 'Il n existe aucun bouton pour effacer l historique : un registre qui sert de preuve ne se vide pas. '
      + (o && o.politique && o.politique.regles ? 'Règle de la voie : ' + esc(o.politique.regles[4] || o.politique.regles[0] || '') : '')
      + '</div>';

    K.ouvrirModale('Missions — registre réel + la voie', h);
    brancher();
  }

  // Chaque bouton envoie le prenom de l agente active : le serveur applique SA
  // table des droits (capacite « scan ») et repond ; la reponse VRAIE s affiche.
  function poste(chemin, corps) {
    corps.par = K.ETAT.agent || 'aelyra';
    return K.api(chemin, {
      timeout: 9000,
      fetch: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }
    });
  }
  async function agir(chemin, corps) {
    const r = await poste(chemin, corps);
    const d = r.data || {};
    K.msg(null, d.reply || ('Le cerveau n a pas répondu : ' + (r.status ? 'HTTP ' + r.status : (r.erreur || 'pas de réponse')) + ' — rien n a été fait.'),
      d.ok ? 'systeme' : 'erreur');
    // Recharger même sur un refus : pendant l aller-retour la tache a pu finir (le
    // serveur vient de nous le dire), et garder l ancienne ligne a l ecran ferait
    // mentir la modale. L affichage doit coller au registre, pas a nos intentions.
    modale();
  }

  function brancher() {
    const corps = K.el && K.el.modaleCorps;
    if (!corps) return;
    Array.prototype.forEach.call(corps.querySelectorAll('[data-voie]'), function (b) {
      b.onclick = function () { agir('api/orchestrateur', { action: b.getAttribute('data-voie') }); };
    });
    Array.prototype.forEach.call(corps.querySelectorAll('[data-orch]'), function (b) {
      b.onclick = function () { agir('api/orchestrateur', { action: b.getAttribute('data-orch'), ref: b.getAttribute('data-ref') }); };
    });
    Array.prototype.forEach.call(corps.querySelectorAll('[data-tache]'), function (b) {
      b.onclick = function () { agir('api/taches', { action: b.getAttribute('data-tache'), ref: b.getAttribute('data-ref') }); };
    });
  }

  window.HudMissions = { modale: modale };
})();

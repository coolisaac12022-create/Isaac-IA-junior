// ============================================================================
//  HUD MISSIONS — la modale du registre reel des taches
// ----------------------------------------------------------------------------
//  Responsabilite UNIQUE : lire /api/taches et montrer le registre tel qu il est.
//  Une mission ne se cree PAS ici : elle nait d un ordre reel (« scan complet … »,
//  « inventaire ») et le cerveau l inscrit au registre. Cette page ne fait que LIRE.
//  Annuler ou taire se fait a la voix ou sur /taches.html — pas de bouton magique.
//  Une progression absente s affiche « non mesuree », jamais 0 % decoratif.
// ============================================================================
(function () {
  'use strict';
  const K = window.HudKit;
  if (!K) { console.warn('hud missions : kit absent'); return; }
  const esc = K.esc, non = K.non;

  async function modale() {
    K.ouvrirModale('Missions — le registre réel des tâches', '<div class="cc-note">Lecture de /api/taches…</div>');
    const r = await K.api('api/taches');
    if (!r.ok || !r.data) {
      K.ouvrirModale('Missions', '<div class="cc-note">Le registre n a pas pu être lu : ' + esc(r.status ? 'HTTP ' + r.status : (r.erreur || 'réponse illisible')) + '.</div>');
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
            + '<td>' + (prog === null ? non('non mesurée')
                : '<div class="cc-prog"><i style="width:' + Math.max(0, Math.min(100, prog)) + '%"></i></div>') + '</td>'
            + '<td>' + esc(x.maj ? new Date(x.maj).toLocaleString('fr-FR') : (x.quand || '—')) + '</td></tr>';
        }).join('') + '</tbody></table>'
        : '<div class="cc-note">Aucune mission au registre. Ce n est pas une erreur : le fichier est vide.</div>')
      + '<div class="cc-note" style="margin-top:12px">Une mission ne se crée PAS ici : elle naît d un ordre réel (« scan complet … », « inventaire ») et le cerveau l inscrit au registre. Cette page ne fait que LIRE — annuler ou taire se fait à la voix ou sur /taches.html.</div>';
    K.ouvrirModale('Missions — le registre réel des tâches', h);
  }

  window.HudMissions = { modale: modale };
})();

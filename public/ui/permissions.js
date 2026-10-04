// ============================================================================
//  HUD PERMISSIONS — la matrice réelle des droits + les refus gravés
// ----------------------------------------------------------------------------
//  Phase 5 (2026-10-04). Responsabilite UNIQUE : montrer QUI peut QUOI tel que
//  le serveur l'écrit (/api/droits), ce que la politique d'accès refuse avant
//  même le traitement (/api/politique), et les refus GRAVES des deux journaux
//  (journal-droits.log + journal-politique.log, lus via /api/evenements).
//  Ce panneau ne change RIEN : aucun bouton d'écriture ici. Changer un droit,
//  c'est éditer le bloc DROITS de server.js sous les yeux d'Isaac — et le
//  panneau le dit tel quel au lieu de faire semblant d'offrir un interrupteur.
//  Une case vide s'affiche ✕ : un droit absent n'existe pas, il ne se devine pas.
// ============================================================================
(function () {
  'use strict';
  const K = window.HudKit;
  if (!K) { console.warn('hud permissions : kit absent'); return; }
  const esc = K.esc;

  async function modale() {
    K.ouvrirModale('Permissions — la table et les refus gravés', '<div class="cc-note">Lecture de /api/droits, /api/politique et /api/evenements…</div>');
    const [d, pol, ev] = await Promise.all([
      K.api('api/droits', { timeout: 9000 }),
      K.api('api/politique', { timeout: 9000 }),
      K.api('api/evenements?categories=POLITIQUE,DROITS&limite=14', { timeout: 9000 })
    ]);
    if (!d.ok || !d.data || !d.data.agents) {
      K.ouvrirModale('Permissions', '<div class="cc-note">La table des droits n a pas pu être lue : ' + esc(d.status ? 'HTTP ' + d.status : (d.erreur || 'réponse illisible')) + '. Je n invente pas de permissions.</div>');
      return;
    }
    const caps = d.data.capacites || {};
    const nomsCaps = Object.keys(caps);

    // La matrice : une ligne par agente, une colonne par capacité. La cellule vient
    // de la table, pas d'une impression : true = ✓, tout le reste = ✕.
    let h = '<div class="cc-note" style="margin-bottom:12px">' + esc(d.data.contrat || '') + '</div>';
    h += '<table class="cc-table"><thead><tr><th>AGENTE</th>' + nomsCaps.map(function (c) {
      return '<th title="' + esc(caps[c]) + '">' + esc(c.toUpperCase()) + '</th>';
    }).join('') + '</tr></thead><tbody>'
      + d.data.agents.map(function (a) {
        return '<tr><td><b>' + esc(a.agent.toUpperCase()) + '</b>' + (a.agent === K.ETAT.agent ? ' <span class="cc-badge ok">active</span>' : '') + '</td>'
          + nomsCaps.map(function (c) {
            const oui = !!(a.droits && a.droits[c]);
            return '<td title="' + esc(caps[c]) + '"><span class="cc-droit' + (oui ? ' oui' : '') + '" style="margin:0">' + (oui ? '✓' : '✕') + '</span></td>';
          }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
    h += '<div class="cc-note" style="margin-top:8px">Une agente ABSENTE de cette table n a aucun droit, pas même un : le serveur la refuse et grave le refus. '
      + 'Cette table bloque des ACTIONS, jamais une question. La modifier = éditer le ' + esc(d.data.ou_c_est_grave || 'bloc DROITS de server.js')
      + ' — ce panneau ne prétend pas offrir un interrupteur.</div>';

    // Les refus de droit gravés (le journal, pas la mémoire de la page).
    h += '<h4 style="margin:16px 0 8px;font-size:10px;letter-spacing:.2em;color:var(--cyan-fort)">REFUS DE DROIT GRAVÉS (' + esc(d.data.journal || 'journal-droits.log') + ')</h4>';
    h += (d.data.refus_recent && d.data.refus_recent.length)
      ? d.data.refus_recent.slice(0, 8).map(function (l) { return '<div class="cc-ev"><span class="cc-ev-txt">' + esc(l) + '</span></div>'; }).join('')
      : '<div class="cc-note">Aucun refus de droit gravé depuis le démarrage de ce cerveau.</div>';

    // La politique d'accès : ce qui est refusé AVANT le traitement, et la liste
    // fermée des routes d'écriture.
    if (pol.ok && pol.data) {
      h += '<h4 style="margin:16px 0 8px;font-size:10px;letter-spacing:.2em;color:var(--cyan-fort)">POLITIQUE D ACCÈS DU CERVEAU</h4>';
      h += '<div class="cc-note">' + (pol.data.regles || []).map(esc).join('<br>') + '</div>';
      h += '<div class="cc-droits" style="margin-top:8px">' + ((pol.data.routes_ecriture || []).map(function (x) {
        return '<span class="cc-droit">' + esc(x) + '</span>';
      }).join('') || '<span class="cc-droit">non lues</span>') + '</div>';
    } else {
      h += '<div class="cc-note" style="margin-top:14px">La politique d accès n a pas pu être lue (' + esc(pol.status ? 'HTTP ' + pol.status : (pol.erreur || 'réponse illisible')) + ') — rien n est affiché à sa place.</div>';
    }

    // Les derniers refus vus par les journaux (politique + droits), horodatés.
    const liste = (ev.ok && ev.data && Array.isArray(ev.data.evenements)) ? ev.data.evenements : null;
    h += '<h4 style="margin:16px 0 8px;font-size:10px;letter-spacing:.2em;color:var(--cyan-fort)">DERNIÈRES LIGNES DES JOURNAUX POLITIQUE + DROITS</h4>';
    h += '<div class="cc-note" style="margin-bottom:6px">Lues par /api/evenements, qui ne montre qu une fois un même fait répété (le journal, lui, garde chaque ligne) — la liste ci-dessus vient directement du fichier.</div>';
    h += (liste && liste.length)
      ? liste.slice(0, 10).map(function (e) {
        return '<div class="cc-ev"><span class="cc-ev-heure">' + (e.t ? esc(new Date(e.t).toLocaleTimeString('fr-FR')) : '—') + '</span>'
          + '<span class="cc-ev-cat">' + esc(e.categorie || '') + '</span>'
          + '<span class="cc-ev-txt">' + esc(e.texte || '') + '</span></div>';
      }).join('')
      : '<div class="cc-note">Aucune ligne récente dans ces deux journaux' + (ev.ok ? ' : personne n a frappé à une porte fermée.' : ' (lecture impossible : ' + esc(ev.status ? 'HTTP ' + ev.status : (ev.erreur || 'réponse illisible')) + ').') + '</div>';

    K.ouvrirModale('Permissions — la table et les refus gravés', h);
  }

  window.HudPermissions = { modale: modale };
})();

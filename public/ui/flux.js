// ============================================================================
//  HUD FLUX — le journal d activite en bas de page
// ----------------------------------------------------------------------------
//  Responsabilite UNIQUE : lire /api/evenements toutes les 4 s et l ecrire dans
//  #flux. Ce flux est la fusion REELLE des journaux graves par le cerveau
//  (VOIE, POLITIQUE, ENGAGEMENT, DROITS, VOIX, EVOLUTION…) et des requetes HTTP
//  de cette session ; les jetons longs sont masques cote serveur.
//  Le bouton FIGER appartient a ce module : figer, c est laisser Isaac lire sans
//  que le flux ne bouge sous ses yeux — ce n est pas arreter la lecture serveur.
// ============================================================================
(function () {
  'use strict';
  const K = window.HudKit;
  if (!K) { console.warn('hud flux : kit absent'); return; }
  const el = K.el, ETAT = K.ETAT, esc = K.esc;

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

  async function sondeEvenements() {
    const r = await K.api('api/evenements?limite=40', { timeout: 8000 });
    if (r.ok && r.data) rendreFlux(r.data);
  }

  function brancherPause() {
    const bp = K.$('#btnFluxPause');
    if (!bp) return;
    bp.onclick = function () {
      ETAT.fluxFige = !ETAT.fluxFige;
      bp.textContent = ETAT.fluxFige ? 'REPRENDRE' : 'FIGER';
      bp.className = 'cc-petit' + (ETAT.fluxFige ? ' actif' : '');
    };
  }

  function demarrer() {
    sondeEvenements();
    setInterval(sondeEvenements, 4000);
  }

  window.HudFlux = { rendre: rendreFlux, sonde: sondeEvenements, brancher: brancherPause, demarrer: demarrer };
})();

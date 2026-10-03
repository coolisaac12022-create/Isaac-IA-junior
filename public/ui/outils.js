// ============================================================================
//  HUD OUTILS — la modale « ce qui existe vraiment »
// ----------------------------------------------------------------------------
//  Responsabilite UNIQUE : montrer l inventaire REEL du cerveau : les pages
//  servies par public/, la liste FERMEE des routes d ecriture (/api/politique),
//  et les fournisseurs d IA avec leurs compteurs (/api/ai/etat).
//  Aucune cle n est affichee : seule sa presence cote serveur est visible.
//  Un fournisseur sans cle s affiche « aucune clé côté serveur », pas « offline ».
// ============================================================================
(function () {
  'use strict';
  const K = window.HudKit;
  if (!K) { console.warn('hud outils : kit absent'); return; }
  const esc = K.esc, non = K.non;

  async function modale() {
    K.ouvrirModale('Tools — ce qui existe vraiment', '<div class="cc-note">Lecture de /api/politique…</div>');
    const [pol, ai] = await Promise.all([K.api('api/politique'), K.api('api/ai/etat')]);
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
    K.ouvrirModale('Tools — ce qui existe vraiment', h);
  }

  window.HudOutils = { modale: modale };
})();

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
      + carteCerveau(ai.data || {})
      + '</div>'
      + '</div>';
    K.ouvrirModale('Tools — ce qui existe vraiment', h);
    brancherModes();
  }

  // ------------------------------------------------------------------
  //  LA CARTE CERVEAU (Phase 4) : l AI Gateway du serveur, pas un décor.
  //  Elle dit QUEL cerveau a vraiment répondu (fournisseur, modèle, ms),
  //  l ordre AUTO réel, l état de chaque clé (« présente / absente », jamais sa
  //  valeur), et elle laisse Isaac régler le mode — le réglage part en POST
  //  /api/ai/mode avec le prénom de l agente active, donc la table des droits
  //  du serveur répond « non » si ce n est pas son droit.
  //  Rien n est affiché si rien n est lu : pas de zéro inventé, pas de vert.
  // ------------------------------------------------------------------
  function carteCerveau(d) {
    const f = d.fournisseurs || [];
    const dr = d.derniere_reponse || null;
    const t = d.total || null;
    let h = '';
    h += '<div class="cc-ligne"><b>MOTEUR</b><span>' + esc(d.engine || 'non lu') + '</span></div>';
    h += '<div class="cc-ligne"><b>MODE</b><span>' + esc(d.mode || '?') + ' · actif : ' + esc(d.moteur_actif || '?') + ' · instance ' + esc(d.instance || '?') + '</span></div>';
    h += '<div class="cc-ligne"><b>ORDRE AUTO</b><span>' + esc(d.ordre_reel || 'inconnu') + '</span></div>';
    h += '<div class="cc-ligne"><b>QUI A PARLÉ</b><span>' + (dr
      ? esc(dr.fournisseur) + ' · ' + esc(dr.modele || 'modèle non précisé') + ' · ' + esc(String(dr.ms || 0)) + ' ms · pour ' + esc(dr.pour || 'demande') + ' · ' + esc(new Date(dr.quand).toLocaleTimeString('fr-FR'))
      : non('aucune réponse depuis le démarrage')) + '</span></div>';
    if (t) h += '<div class="cc-ligne"><b>DEPUIS LE BOOT</b><span>' + esc(String(t.appels)) + ' appel(s) · ' + esc(String(t.succes)) + ' réponse(s) · ' + esc(String(t.echecs)) + ' échec(s) — journal ' + esc(d.journal || '?') + '</span></div>';
    if (d.derniere_raison) h += '<div class="cc-ligne"><b>DERNIER REFUS</b><span>' + esc(String(d.derniere_raison).slice(0, 180)) + '</span></div>';
    h += '<div style="margin:10px 0 12px">' + (d.modes_possibles || []).map(function (m) {
      return '<button class="cc-petit" data-mode="' + esc(m) + '"' + (m === d.mode ? ' style="border-color:var(--cyan-fort);color:var(--cyan-fort)"' : '') + '>' + esc(m.toUpperCase()) + '</button>';
    }).join(' ') + '</div>';
    h += f.map(function (x) {
      // Trois états distincts : vivant · clé présente mais service retiré chez eux ·
      // aucune clé. Le HUD ne peut pas dire « aucune clé » à une clé qui est là.
      const hors = x.retire ? 'service retiré chez eux'
        : (x.cle_serveur === 'presente' ? 'clé présente, cerveau hors course' : 'aucune clé côté serveur');
      return '<div class="cc-ligne"><b>' + esc(String(x.nom).toUpperCase() + ' · P' + (x.priorite || '?')) + '</b>'
        + (x.configure ? '<span>' + esc(x.modele || 'modèle non précisé') + '</span>' : non(hors))
        + '</div>'
        + '<div class="cc-jauge-pied" style="padding-left:0">'
        + esc(x.protocole || 'protocole non déclaré')
        + ' · vision ' + (x.vision ? 'oui' : 'non')
        + (x.compteurs ? ' · ' + x.compteurs.appels + ' appel(s) · ' + x.compteurs.succes + ' succès · ' + x.compteurs.echecs + ' échec(s)'
          + (x.compteurs.ms_moyen ? ' · ' + x.compteurs.ms_moyen + ' ms en moyenne' : '') : '')
        + '</div>'
        + (x.note ? '<div class="cc-note" style="padding-left:0">' + esc(String(x.note)) + '</div>' : '');
    }).join('');
    h += '<div class="cc-note">' + esc(d.note_nvidia || '') + '</div>';
    return h;
  }

  // Le réglage du mode : un POST, le prénom de l'agente active, et la réponse
  // VRAIE du serveur (200 ou 403). Un refus de droit s'affiche comme un refus.
  function brancherModes() {
    const corps = K.el && K.el.modaleCorps;
    if (!corps) return;
    const boutons = corps.querySelectorAll('[data-mode]');
    Array.prototype.forEach.call(boutons, function (b) {
      b.onclick = async function () {
        const cible = b.getAttribute('data-mode');
        b.disabled = true;
        const r = await K.api('api/ai/mode', {
          timeout: 9000,
          fetch: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: cible, par: K.ETAT.agent || 'aelyra' }) }
        });
        b.disabled = false;
        const d = r.data || {};
        K.msg(null, d.reply || ('Le cerveau n a pas répondu : ' + (r.status ? 'HTTP ' + r.status : (r.erreur || 'pas de réponse')) + ' — rien n est change.'),
          d.ok ? 'systeme' : 'erreur');
        if (d.ok) modale();
      };
    });
  }

  window.HudOutils = { modale: modale };
})();

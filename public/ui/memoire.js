// ============================================================================
//  HUD MEMOIRE — le Memory Center du JARVIS (Phase 6)
// ----------------------------------------------------------------------------
//  Responsabilite UNIQUE : afficher la MEMOIRE REELLE de la maison, telle que
//  le cerveau la lit dans son fichier au moment ou la page l ouvre. Une seule
//  source : /api/cerveau (sur-ensemble Phase 6 — stats, profil, faits masques,
//  lecons, scans graves, academie, taille et date du fichier, etat du .gitignore).
//  CE PANNEAU N ECRIT RIEN. Il n y a volontairement aucun bouton « effacer la
//  memoire » ni « oublier ce fait » : les souvenirs d Isaac servent aussi de
//  preuve (qui a ete scanne, quand, par qui) — une page ne vide pas une preuve.
//  Regles d honnetete appliquees ici :
//   - une valeur absente s affiche « non mesure », jamais un 0 decoratif ;
//   - une liste vide dit « la liste est vide », ce qui est un etat reel ;
//   - les COORDONNEES D AUTRUI (numero, mail) sont masquees par le SERVEUR avant
//     l envoi : la page affiche la version masquee, et le disque reste intact ;
//   - aucune cle, aucun jeton ne passe par cette route (isaac-keys.json n y est
//     jamais lu) — le cerveau ne renvoie que ce qui est sa memoire a lui.
//  La recherche est faite par le cerveau sur le texte normalise (accents et
//  ponctuation ignores) : elle trouve « nadege » meme grave « Nadege  Chou ».
// ============================================================================
(function () {
  'use strict';
  const K = window.HudKit;
  if (!K) { console.warn('hud memoire : kit absent'); return; }
  const esc = K.esc, non = K.non, ligne = K.ligne, duree = K.duree, ko = K.ko;

  let DERNIER = null;   // derniere reponse lue, gardee pour repeindre apres une recherche

  function titre() { return 'Memory Center — la mémoire réelle de la maison'; }

  // Le badge du dépôt : mesuré en relisant .gitignore, pas en le promettant.
  function badgeDepot(h) {
    if (!h || h.verifie !== true) {
      return '<div class="cc-ligne"><b>DÉPÔT PUBLIC</b>' + non('vérification impossible — ' + (h && h.motif || '.gitignore non lu')) + '</div>';
    }
    if (h.mentionne === true) {
      return '<div class="cc-ligne"><b>DÉPÔT PUBLIC</b><span>hors du dépôt — <i>' + esc(h.motif) + '</i> : ce fichier n est jamais poussé sur GitHub</span></div>';
    }
    return '<div class="cc-ligne"><b>DÉPÔT PUBLIC</b><span class="non">' + esc(h.motif) + ' n a PAS été trouvé dans .gitignore — à vérifier maintenant</span></div>';
  }

  function rend(d, motif) {
    const m = d.memoire || {};
    const s = d.stats || {};
    const f = d.fichier || null;
    const ac = d.academie || null;
    const sc = d.scans || null;
    const fa = m.facts || [];
    const le = m.lecons || [];
    const jo = m.log || [];

    let h = '<div class="cc-note" style="margin-bottom:12px">' + esc(d.contrat || '') + '</div>';

    // ----------------------------- OÙ C EST ÉCRIT ----------------------------
    h += '<h4 style="margin:0 0 8px;font-size:10px;letter-spacing:.2em;color:var(--cyan-fort)">LA SOURCE</h4><div class="cc-reglages">';
    h += ligne('FICHIER', d.ou_c_est_grave);
    h += ligne('POIDS DU FICHIER', f ? (ko(f.octets) || (f.octets + ' octets')) : null);
    h += ligne('DERNIÈRE ÉCRITURE', f ? (f.modifie_lisible + ' — il y a ' + (duree(f.echanges_par_seconde) || '?')) : null, !f);
    h += badgeDepot(d.hors_depot);
    h += '</div>';

    // -------------------------------- COMPTEURS -------------------------------
    h += '<h4 style="margin:16px 0 8px;font-size:10px;letter-spacing:.2em;color:var(--cyan-fort)">CE QUE LA MAISON SAIT — COMPTEURS DU FICHIER</h4><div class="cc-reglages">';
    h += ligne('FAITS MÉMORISÉS', (typeof s.faits === 'number' ? String(s.faits) : 'non comptés'));
    h += ligne('ÉCHANGES AU JOURNAL', (typeof s.echanges === 'number' ? s.echanges + ' (les ' + jo.length + ' derniers s affichent ici)' : 'non comptés'));
    h += ligne('LEÇONS GRAVÉES', (typeof s.lecons === 'number' ? s.lecons : 'non comptées'));
    h += ligne('SCANS ENREGISTRÉS', (typeof s.scans === 'number' ? s.scans : 'non comptés'));
    h += '</div>';

    // --------------------------------- PROFIL ---------------------------------
    h += '<h4 style="margin:16px 0 8px;font-size:10px;letter-spacing:.2em;color:var(--cyan-fort)">PROFIL DE LA MAISON</h4>';
    h += '<div class="cc-bloc">' + (m.profile
      ? '<div class="cc-ligne"><b>PROFIL</b><span>' + esc(m.profile) + '</span></div>'
      : non('aucun profil gravé dans le fichier')) + '</div>';

    // ---------------------------------- FAITS ---------------------------------
    h += '<h4 style="margin:16px 0 8px;font-size:10px;letter-spacing:.2em;color:var(--cyan-fort)">FAITS MÉMORISÉS (' + fa.length + ')</h4>';
    h += '<div class="cc-note" style="margin-bottom:8px">Un fait, c est ce qu Isaac a dicté avec « retiens que… », ce qu une agente a retenu d un scan, ou la note d humeur de l atelier du cœur. '
      + 'Les numéros de téléphone et les adresses mail d un tiers sont masqués par le cerveau avant l envoi — le fichier sur le disque, lui, garde la valeur complète.</div>';
    h += (fa.length ? '<div class="cc-bloc">' + fa.map(function (x, i) {
      return '<div class="cc-ligne"><b>' + esc(String(i + 1)) + '</b><span>' + esc(String(x)) + '</span></div>';
    }).join('') + '</div>' : '<div class="cc-note">Aucun fait mémorisé. Ce n est pas une panne : la liste du fichier est vide.</div>');

    // --------------------------------- LEÇONS ---------------------------------
    h += '<h4 style="margin:16px 0 8px;font-size:10px;letter-spacing:.2em;color:var(--cyan-fort)">LEÇONS DE L ACADEMIE (' + le.length + ' dernières)</h4>';
    h += (le.length ? '<div class="cc-bloc">' + le.slice(-12).reverse().map(function (x) {
      return '<div class="cc-ligne"><b>' + esc(x.date || 'date non gravée') + '</b><span>' + esc(String(x.texte || '')) + '</span></div>';
    }).join('') + '</div>' : '<div class="cc-note">Aucune leçon gravée : les séances d Académie n ont encore rien écrit.</div>');

    // ---------------------------------- SCANS ---------------------------------
    h += '<h4 style="margin:16px 0 8px;font-size:10px;letter-spacing:.2em;color:var(--cyan-fort)">DERNIERS SCANS ENREGISTRÉS</h4>';
    if (sc && sc.derniers && sc.derniers.length) {
      h += '<table class="cc-table"><thead><tr><th>Quand</th><th>Cible</th><th>Agente</th><th>Ports retenus</th></tr></thead><tbody>'
        + sc.derniers.map(function (x) {
          return '<tr><td>' + esc(x.quand || '—') + '</td><td>' + esc(x.cible || '—') + '</td><td>' + esc(x.agent || '—') + '</td>'
            + '<td>' + (typeof x.ports === 'number' ? esc(String(x.ports)) : non('non mesuré')) + '</td></tr>';
        }).join('') + '</tbody></table>';
    } else {
      h += '<div class="cc-note">Aucun scan n est gravé dans la mémoire. Un « scan complet » ou un inventaire du WiFi écrira sa ligne ici même, avec sa cible et son agente.</div>';
    }

    // -------------------------------- ACADÉMIE --------------------------------
    if (ac) {
      h += '<h4 style="margin:16px 0 8px;font-size:10px;letter-spacing:.2em;color:var(--cyan-fort)">RÉGIME DE L ACADEMIE</h4><div class="cc-reglages">';
      h += '<div class="cc-ligne"><b>RÉGIME AUTO</b><span>' + esc(ac.auto ? 'ACTIF — une séance spontanée environ toutes les 24 h' : 'EN VEILLE — elles travaillent seulement sur demande') + '</span></div>';
      h += ligne('DERNIÈRE SÉANCE', ac.derniere + (typeof ac.il_y_a_s === 'number' ? ' (il y a ' + (duree(ac.il_y_a_s) || '?') + ')' : ''));
      h += ligne('LEÇONS GRAVÉES', String(ac.lecons_gravees));
      h += ligne('EN ATTENTE DE LECTURE', ac.attente);
      h += '<div class="cc-note">L interrupteur de ce régime est dans Settings — il dicte la commande au cerveau et vérifie ensuite que le fichier a changé. Ici, c est la lecture seule.</div>';
      h += '</div>';
    }

    // ------------------------------ LES ÉCHANGES ------------------------------
    h += '<h4 style="margin:16px 0 8px;font-size:10px;letter-spacing:.2em;color:var(--cyan-fort)">JOURNAL DES ÉCHANGES (' + jo.length + ' derniers)</h4>';
    h += (jo.length ? '<div class="cc-bloc">' + jo.slice(-6).reverse().map(function (x) {
      const q = String(x.q || '').slice(0, 120);
      const a = K.esc(String(x.a || '')).slice(0, 260);
      return '<div class="cc-bloc"><h4>' + esc(x.t ? new Date(x.t).toLocaleString('fr-FR') : 'date non gravée') + '</h4>'
        + '<div class="cc-ligne"><b>DICTÉE</b><span>' + esc(q) + '</span></div>'
        + '<div class="cc-ligne"><b>RÉPONSE</b><span>' + a + (String(x.a || '').length > 260 ? '…' : '') + '</span></div></div>';
    }).join('') + '</div>' : '<div class="cc-note">Aucun échange au journal : le fichier n a encore rien enregistré.</div>');

    // -------------------------------- RECHERCHE -------------------------------
    h += '<h4 style="margin:18px 0 8px;font-size:10px;letter-spacing:.2em;color:var(--cyan-fort)">CHERCHER DANS LA MÉMOIRE</h4>';
    h += '<div class="cc-champ"><label>Motif</label><input type="search" id="memQ" placeholder="nadege, telephone, 192.168, labo…" value="' + esc(motif || '') + '">'
      + '<button class="cc-petit" id="memChercher">CHERCHER</button>'
      + '<button class="cc-petit" id="memTout">TOUT RECHARGER</button></div>';
    const r = d.recherche;
    if (r) {
      h += '<div class="cc-note" style="margin-bottom:6px">Recherche de « ' + esc(r.motif) + ' » (accents et ponctuation ignorés) : '
        + esc(String(r.total)) + ' ligne(s) trouvée(s) dans les faits, leçons, échanges, scans et le profil.</div>';
      h += (r.lignes && r.lignes.length
        ? '<div class="cc-bloc">' + r.lignes.map(function (x) {
            return '<div class="cc-ligne"><b>' + esc(x.sur) + (x.quand ? ' · ' + esc(x.quand) : '') + '</b><span>' + esc(x.texte) + '</span></div>';
          }).join('') + '</div>'
        : '<div class="cc-note">Aucune ligne de la mémoire ne contient ce motif. La recherche est un filtre sur ce qui est gravé : elle ne complète pas avec une réponse inventée.</div>');
    }

    h += '<div class="cc-note" style="margin-top:14px">Les prompts réels des quatre agentes se lisent sur /cerveau.html ; les journaux gravés (voix, droits, voie, politique) sur /taches.html et dans le panneau FLUX de cette page. '
      + 'Ce Memory Center ne lit qu une route, /api/cerveau, et n écrit rien nulle part : la mémoire d Isaac ne se vide pas depuis un navigateur.</div>';

    K.ouvrirModale(titre(), h);
    brancher();
  }

  async function charger(motif) {
    K.ouvrirModale(titre(), '<div class="cc-note">Lecture de la mémoire du cerveau…</div>');
    const chemin = 'api/cerveau' + (motif ? ('?q=' + encodeURIComponent(motif)) : '');
    const r = await K.api(chemin, { timeout: 9000 });
    if (!r.ok || !r.data || !r.data.ok) {
      K.ouvrirModale(titre(), '<div class="cc-note">La mémoire n a pas pu être lue : '
        + esc(r.status ? 'HTTP ' + r.status : (r.erreur || 'réponse illisible'))
        + '. Je n invente aucun souvenir à la place.</div>');
      return;
    }
    DERNIER = r.data;
    rend(r.data, motif);
  }

  function brancher() {
    const corps = K.el && K.el.modaleCorps;
    if (!corps) return;
    const champ = corps.querySelector('#memQ');
    const bc = corps.querySelector('#memChercher');
    const bt = corps.querySelector('#memTout');
    const lancer = function () { charger((champ && champ.value || '').trim()); };
    if (bc) bc.onclick = lancer;
    if (bt) bt.onclick = function () { charger(''); };
    if (champ) champ.addEventListener('keydown', function (e) { if (e.key === 'Enter') lancer(); });
  }

  window.HudMemoire = {
    modale: function () { charger(''); },
    charger: charger,
    // Le panneau AGENTE et la pastille du pied lisent ces compteurs sans ouvrir la modale.
    compteurs: function () { return DERNIER ? (DERNIER.stats || null) : null; }
  };
})();

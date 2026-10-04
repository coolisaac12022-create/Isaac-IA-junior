// ============================================================================
//  HUD SYSTEME — le panneau de gauche : ce que ce PC mesure vraiment
// ----------------------------------------------------------------------------
//  Responsabilite UNIQUE : lire /api/systeme toutes les 3 s et l ecrire dans
//  #panneauSysteme. Rien d autre ne vit ici.
//  Regle de la maison : un champ absent ou nul s affiche « non mesure », avec
//  la raison donnee par le cerveau. Le GPU de ce PC n a pas de compteur de
//  charge : on affiche son nom et son pilote reels, et on le dit.
//  Ce module annonce aussi si le cerveau est vivant / lent / mort, et pose
//  ETAT.dernierPing pour le chien de garde du demarrage.
// ============================================================================
(function () {
  'use strict';
  const K = window.HudKit;
  if (!K) { console.warn('hud systeme : kit absent'); return; }
  const el = K.el, ETAT = K.ETAT, esc = K.esc, go = K.go, mo = K.mo, ko = K.ko, duree = K.duree, non = K.non;
  const jauge = K.jauge, ligne = K.ligne;

  function rendreSysteme(s) {
    if (!el.systeme) return;
    if (!s) {
      el.systeme.innerHTML = '<div class="cc-ligne"><b>ÉTAT</b>' + non('aucune mesure reçue du cerveau') + '</div>';
      return;
    }
    let h = '';

    // --- CPU ---
    const cpu = s.cpu || {};
    h += jauge('CPU', cpu.charge_pct,
      (typeof cpu.charge_pct === 'number') ? cpu.charge_pct + ' %' : (cpu.etat || 'non mesuré'),
      (typeof cpu.charge_pct === 'number')
        ? ((cpu.coeurs || '?') + ' cœur(s) · ' + (cpu.modele || 'modèle inconnu') + ' · ' + (cpu.methode || 'méthode non précisée'))
        : (cpu.note || cpu.etat || 'aucune lecture disponible'),
      typeof cpu.charge_pct !== 'number');

    // --- RAM ---
    const ram = s.ram || {};
    h += jauge('RAM', ram.utilisee_pct,
      (typeof ram.utilisee_pct === 'number') ? ram.utilisee_pct + ' %' : 'non mesuré',
      (typeof ram.libre_octets === 'number')
        ? (mo(ram.libre_octets) + ' libre sur ' + go(ram.totale_octets) + ' · ' + (ram.methode || 'lecture Node'))
        : (ram.methode || 'lecture indisponible'),
      typeof ram.utilisee_pct !== 'number');

    // --- GPU : le nom et le pilote sont reels, la charge ne se mesure pas ici ---
    const gpu = s.gpu || {};
    const cartes = (gpu.cartes || []);
    if (cartes.length) {
      h += '<div class="cc-jauge"><div class="cc-jauge-tete"><span class="cc-jauge-nom">GPU</span>'
        + '<span class="cc-jauge-val absente">charge non mesurée</span></div>'
        + '<div class="cc-jauge-pied">' + esc(cartes.map(function (c) {
            return c.nom + (c.pilote ? ' · pilote ' + c.pilote : '') + (c.memoire_vram_octets ? ' · ' + go(c.memoire_vram_octets) + ' annoncés' : '');
          }).join(' — ')) + '</div>'
        + '<div class="cc-jauge-pied">' + esc(gpu.note || 'la charge GPU exige un compteur de performance dédié : ce PC ne l expose pas, je ne l invente pas') + '</div></div>';
    } else {
      h += jauge('GPU', null, 'non mesuré', gpu.note || 'aucune carte lue', true);
    }

    // --- STOCKAGE ---
    const d = s.disque || {};
    if (typeof d.libre_octets === 'number') {
      const occ = (typeof d.libre_pct === 'number') ? (100 - d.libre_pct) : null;
      h += jauge('STORAGE', occ, (typeof d.libre_pct === 'number' ? d.libre_pct + ' % libre' : go(d.libre_octets) + ' libre'),
        (d.lettre || 'C:') + ' · ' + go(d.libre_octets) + ' libre sur ' + go(d.total_octets),
        false);
    } else {
      h += jauge('STORAGE', null, 'non mesuré', d.note || d.etat || 'aucune lecture du disque', true);
    }

    // --- RESEAU ---
    const r = s.reseau || {};
    if (r.debit) {
      h += jauge('NETWORK', null, r.debit.descendant_ko_s + ' ↓ / ' + r.debit.montant_ko_s + ' ↑ Ko/s',
        'débit réel entre deux relevés · ' + ((r.interfaces || []).join(', ') || 'interfaces inconnues')
        + ' · total ' + (ko(r.total_recu_octets) || '?') + ' reçus / ' + (ko(r.total_emis_octets) || '?') + ' émis', false);
      // la barre n'a pas de sens ici : on garde les chiffres seuls.
    } else {
      h += jauge('NETWORK', null, r.etat || 'débit non mesuré',
        ((r.interfaces || []).length ? (r.interfaces.join(', ') + ' · ') : '') + (r.etat || 'le débit demande deux relevés espacés'), true);
    }

    // --- UPTIME ---
    const u = s.uptime || {};
    h += ligne('UPTIME PC', duree(u.machine_s));
    h += ligne('CERVEAU', duree(u.cerveau_s), false);
    h += ligne('INSTANCE', (s.instance || '?') + ' · port ' + (s.port || '?'));
    h += ligne('PLATEFORME', u.plateforme ? (u.plateforme + ' · ' + (u.hostname || '')) : null);
    h += ligne('IP LOCALE', (s.ips || []).filter(function (i) { return /réseau local/.test(i.portee || ''); })
      .map(function (i) { return i.ip + ' (' + i.interface + ')'; }).join(', '));
    const api_pa = (s.ips || []).filter(function (i) { return /lien local/.test(i.portee || ''); });
    if (api_pa.length) h += ligne('APIPA', api_pa.map(function (i) { return i.ip; }).join(', ') + ' — lien local, hors périmètre');

    el.systeme.innerHTML = h;
    if (el.fraicheur) {
      el.fraicheur.textContent = s.voie_occupee ? 'CACHE — VOIE OCCUPÉE' : 'MESURES FRAÎCHES';
      el.fraicheur.className = 'cc-badge ' + (s.voie_occupee ? 'wait' : 'ok');
      el.fraicheur.title = s.fraicheur || '';
    }
    if (el.noteSysteme) {
      el.noteSysteme.textContent = (s.fraicheur || '') + ' · échantillonneur : '
        + ((s.echantillonneur && s.echantillonneur.cycles) || 0) + ' cycle(s) de mesure depuis le démarrage du cerveau.';
    }
  }

  async function sondeSysteme() {
    // Onglet cache : on ne sonde pas. Le PC (2 coeurs) respire, et surtout on ne
    // nourrit pas le chien de garde avec des mesures qu'il ne verrait pas a temps.
    if (K.visible && !K.visible()) return;
    const r = await K.api('api/systeme', { timeout: 8000 });
    if (r.ok && r.data && r.data.ok) {
      ETAT.systeme = r.data; ETAT.echecsSuite = 0; ETAT.dernierPing = Date.now();
      if (ETAT.serveur !== 'vivant') { K.bandeau(null); K.msg(null, 'Le cerveau répond de nouveau.', 'systeme'); }
      ETAT.serveur = 'vivant'; ETAT.raisonMort = null;
      rendreSysteme(r.data);
      if (el.ptServeur) el.ptServeur.className = 'cc-point';
      if (el.txtServeur) el.txtServeur.textContent = 'SERVEUR EN LIGNE · ' + (r.data.instance || '?').toUpperCase() + ':' + (r.data.port || '?');
      if (el.sousTitre) el.sousTitre.textContent = 'cerveau local ' + (r.data.instance === 'essai' ? 'ESSAI ' : '') + '· 127.0.0.1:' + (r.data.port || '?') + ' · ' + ((r.data.uptime && r.data.uptime.plateforme) || '');
      // La voie occupe le CPU ? Le noyau le montre — c'est une activite REELLE.
      if (!window.VoiceClient || !VoiceClient.parle()) {
        if (r.data.voie_occupee) K.setCore('PROCESSING', 'la voie tient un job lourd : ' + r.data.voie_occupee);
        else if (window.IsaacCore && (IsaacCore.etat().etat === 'PROCESSING' || IsaacCore.etat().etat === 'SEARCHING')) K.setCore('IDLE', 'en attente');
      }
      K.rafraichirLegende();
      return;
    }
    // Echec : on ne devine pas la cause, on cite ce qu'on a vraiment recu.
    ETAT.echecsSuite++;
    const raison = r.status ? ('HTTP ' + r.status) : (r.erreur || 'aucune réponse');
    if (ETAT.echecsSuite >= 2) {
      ETAT.serveur = 'mort'; ETAT.raisonMort = raison;
      if (el.ptServeur) el.ptServeur.className = 'cc-point mort';
      if (el.txtServeur) el.txtServeur.textContent = 'SERVEUR INJOIGNABLE';
      K.setCore('OFFLINE', 'cerveau injoignable : ' + raison);
      K.bandeau('Le cerveau ne répond plus (' + raison + '). Vérifie la fenêtre du cerveau — le chien de garde cerveau.bat la relance 5 s après un arrêt. Cette page ne montre plus de mesures, elle ne les invente pas.');
      rendreSysteme(null);
    } else {
      ETAT.serveur = 'lent';
      if (el.ptServeur) el.ptServeur.className = 'cc-point lent';
      if (el.txtServeur) el.txtServeur.textContent = 'SERVEUR LENT';
    }
  }

  function demarrer() {
    sondeSysteme();
    setInterval(sondeSysteme, 3000);
  }

  window.HudSysteme = { rendre: rendreSysteme, sonde: sondeSysteme, demarrer: demarrer };
})();

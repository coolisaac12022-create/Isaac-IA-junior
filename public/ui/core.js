// ============================================================================
//  ISAAC CORE — le noyau holographique du JARVIS COMMAND CENTER
// ----------------------------------------------------------------------------
//  Huit états RÉELS, chacun avec sa couleur, son mouvement et son souffle :
//  IDLE, LISTENING, THINKING, SEARCHING, PROCESSING, SPEAKING, ERROR, OFFLINE.
//  Un état ne se déclenche jamais tout seul : c'est la page qui l'appelle quand
//  le cerveau fait vraiment quelque chose (micro ouvert, requête partie, voix
//  en train de sortir, erreur HTTP, serveur injoignable). Pas d'animation
//  décorative qui prétendrait à une activité inexistante.
//
//  Three.js est servi en LOCAL par le cerveau (three.min.js). S'il manque, le
//  noyau retombe sur des anneaux CSS — l'écran n'est jamais vide, jamais cassé.
// ============================================================================
(function () {
  'use strict';

  // ---- La table des états : ce que l'écran dit et ce que le noyau fait ----
  const ETATS = {
    IDLE:       { label: 'EN ATTENTE',   couleur: 0x4fd8ff, spin: 0.22, souffle: 0.030, jitter: 0.010, anneau: 0.30, halo: 0.42 },
    LISTENING:  { label: 'A L ECOUTE',   couleur: 0x35e6a8, spin: 0.55, souffle: 0.070, jitter: 0.030, anneau: 0.75, halo: 0.60 },
    THINKING:   { label: 'REFLEXION',    couleur: 0xb276ff, spin: 1.35, souffle: 0.055, jitter: 0.055, anneau: 1.60, halo: 0.66 },
    SEARCHING:  { label: 'RECHERCHE',    couleur: 0x59c2ff, spin: 1.90, souffle: 0.048, jitter: 0.075, anneau: 2.40, halo: 0.58 },
    PROCESSING: { label: 'TRAITEMENT',   couleur: 0xffc247, spin: 2.60, souffle: 0.060, jitter: 0.095, anneau: 3.10, halo: 0.70 },
    SPEAKING:   { label: 'ELLE PARLE',   couleur: 0x4fd8ff, spin: 0.85, souffle: 0.150, jitter: 0.045, anneau: 0.95, halo: 0.90 },
    ERROR:      { label: 'ERREUR',       couleur: 0xff5468, spin: 3.10, souffle: 0.120, jitter: 0.160, anneau: 3.60, halo: 0.85 },
    OFFLINE:    { label: 'HORS LIGNE',   couleur: 0x8a94a6, spin: 0.03, souffle: 0.006, jitter: 0.002, anneau: 0.05, halo: 0.18 }
  };

  // ---- Couleurs d'agentes : le noyau prend la teinte de celle qui répond ----
  const AGENTS = {
    aelyra:   { nom: 'AELYRA',   couleur: 0x4fd8ff, role: 'PC, maison, labo cyber' },
    jeanette: { nom: 'JEANETTE', couleur: 0xb276ff, role: 'developpement, code, sites' },
    onyx:     { nom: 'ONYX',     couleur: 0xff5468, role: 'offensif, sous fiche d engagement' },
    aegis:    { nom: 'AEGIS',    couleur: 0x35e6a8, role: 'audit, defense, hacker ethique' },
    business: { nom: 'BUSINESS', couleur: 0xffc247, role: 'prospection Digital Business' }
  };

  const state = { etat: 'IDLE', agent: 'aelyra', moteur3d: false, depuis: Date.now() };
  const abonnes = [];

  function publier() {
    const snap = { etat: state.etat, label: (ETATS[state.etat] || ETATS.IDLE).label, agent: state.agent, agentNom: (AGENTS[state.agent] || AGENTS.aelyra).nom, depuis: state.depuis, moteur: state.moteur3d ? 'WebGL (Three.js local)' : 'repli CSS — Three.js absent' };
    for (const f of abonnes) { try { f(snap); } catch (e) {} }
  }

  // ============================== LE NOYAU 3D ==============================
  function construire3D(hote) {
    if (!window.THREE) return false;
    const canvas = document.createElement('canvas');
    canvas.className = 'core-canvas';
    hote.appendChild(canvas);

    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true }); }
    catch (e) { canvas.remove(); return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
    camera.position.set(0, 0, 6.1);

    const groupe = new THREE.Group();
    scene.add(groupe);

    const teinte = new THREE.Color(ETATS.IDLE.couleur);
    const cible = new THREE.Color(ETATS.IDLE.couleur);

    // ---- Le cœur facetté (icosaèdre en fil de lumière) ----
    const coeurGeo = new THREE.IcosahedronGeometry(1.02, 1);
    const coeur = new THREE.LineSegments(
      new THREE.EdgesGeometry(coeurGeo),
      new THREE.LineBasicMaterial({ color: teinte, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    groupe.add(coeur);

    // ---- Le noyau plein, très discret, pour donner du corps ----
    const noyau = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.86, 2),
      new THREE.MeshBasicMaterial({ color: teinte, transparent: true, opacity: 0.10, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true })
    );
    groupe.add(noyau);

    // ---- La coque de particules : chaque point respire selon l'état ----
    const shellGeo = new THREE.SphereGeometry(1.62, 56, 40);
    const base = shellGeo.attributes.position.array.slice();
    const shell = new THREE.Points(shellGeo, new THREE.PointsMaterial({
      color: teinte, size: 0.026, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    groupe.add(shell);

    // ---- Trois anneaux en orbite, inclinés différemment ----
    const anneaux = [];
    [[2.05, 0.012, 0.30], [2.42, 0.009, -0.55], [2.86, 0.007, 0.95]].forEach((r, i) => {
      const a = new THREE.Mesh(
        new THREE.TorusGeometry(r[0], r[1], 8, 140),
        new THREE.MeshBasicMaterial({ color: teinte, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      a.rotation.x = Math.PI / 2 + r[2];
      a.rotation.y = r[2] * 0.6;
      a.userData.vitesse = (i % 2 === 0 ? 1 : -1) * (0.6 + i * 0.35);
      groupe.add(a);
      anneaux.push(a);
    });

    // ---- Le halo : un disque de lumière douce derrière le noyau ----
    function textureHalo() {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      grd.addColorStop(0, 'rgba(255,255,255,0.85)');
      grd.addColorStop(0.35, 'rgba(255,255,255,0.22)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(c);
      return t;
    }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: textureHalo(), color: teinte, transparent: true, opacity: 0.42,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    halo.scale.set(5.4, 5.4, 1);
    scene.add(halo);

    // ---- Poussière d'arrière-plan : 500 points fixes, très discrets ----
    const poussiereGeo = new THREE.BufferGeometry();
    const nb = 500, pos = new Float32Array(nb * 3);
    for (let i = 0; i < nb; i++) {
      const r = 7 + Math.random() * 9, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.5;
      pos[i * 3 + 2] = r * Math.cos(ph) - 6;
    }
    poussiereGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const poussiere = new THREE.Points(poussiereGeo, new THREE.PointsMaterial({
      color: 0x8fd8ff, size: 0.035, transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    scene.add(poussiere);

    // ---- La souris fait pivoter le noyau : il regarde Isaac ----
    let px = 0, py = 0;
    window.addEventListener('pointermove', function (e) {
      px = e.clientX / window.innerWidth - 0.5;
      py = e.clientY / window.innerHeight - 0.5;
    }, { passive: true });

    function dimensionner() {
      const w = hote.clientWidth || 420;
      const h = hote.clientHeight || 420;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', dimensionner);
    if (window.ResizeObserver) { try { new ResizeObserver(dimensionner).observe(hote); } catch (e) {} }
    dimensionner();

    function lerp(a, b, t) { return a + (b - a) * t; }
    let t0 = performance.now() / 1000;
    let spinCourant = ETATS.IDLE.spin, jitterCourant = ETATS.IDLE.jitter, haloCourant = ETATS.IDLE.halo;

    function boucle() {
      requestAnimationFrame(boucle);
      if (document.hidden) return;
      const t = performance.now() / 1000 - t0;
      const E = ETATS[state.etat] || ETATS.IDLE;
      const A = AGENTS[state.agent] || AGENTS.aelyra;

      // La couleur visée = celle de l'état, tirée vers celle de l'agente active.
      cible.setHex(E.couleur);
      if (state.etat === 'IDLE' || state.etat === 'SPEAKING') cible.setHex(A.couleur);
      teinte.lerp(cible, 0.06);

      spinCourant = lerp(spinCourant, E.spin, 0.06);
      jitterCourant = lerp(jitterCourant, E.jitter, 0.06);
      haloCourant = lerp(haloCourant, E.halo, 0.06);

      const souffle = 1 + E.souffle * Math.sin(t * (state.etat === 'SPEAKING' ? 7.5 : 1.6)) * (state.etat === 'SPEAKING' ? (0.6 + 0.4 * Math.abs(Math.sin(t * 13))) : 1);
      groupe.scale.setScalar(souffle);

      coeur.rotation.y += 0.004 * spinCourant;
      coeur.rotation.x += 0.0016 * spinCourant;
      noyau.rotation.y -= 0.006 * spinCourant;
      noyau.rotation.z += 0.002 * spinCourant;
      anneaux.forEach(function (a, i) {
        a.rotation.z += 0.0022 * spinCourant * a.userData.vitesse;
        a.rotation.x += 0.0006 * spinCourant * (i + 1);
      });
      poussiere.rotation.y += 0.00016;

      // La coque de particules vibre : plus l'état est actif, plus elle bouge.
      const arr = shellGeo.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        const bx = base[i], by = base[i + 1], bz = base[i + 2];
        const n = Math.sin(t * 2.1 + bx * 3.4) * Math.cos(t * 1.7 + by * 3.1) * Math.sin(t * 1.3 + bz * 2.8);
        const k = 1 + n * jitterCourant;
        arr[i] = bx * k; arr[i + 1] = by * k; arr[i + 2] = bz * k;
      }
      shellGeo.attributes.position.needsUpdate = true;
      shell.rotation.y -= 0.0012 * spinCourant;

      coeur.material.color.copy(teinte);
      noyau.material.color.copy(teinte);
      shell.material.color.copy(teinte);
      halo.material.color.copy(teinte);
      anneaux.forEach(function (a) { a.material.color.copy(teinte); });

      coeur.material.opacity = 0.55 + 0.35 * Math.abs(Math.sin(t * 0.9));
      halo.material.opacity = haloCourant * (0.75 + 0.25 * Math.sin(t * 1.4));

      groupe.rotation.y = lerp(groupe.rotation.y, px * 0.55, 0.05);
      groupe.rotation.x = lerp(groupe.rotation.x, -py * 0.35, 0.05);

      renderer.render(scene, camera);
    }
    boucle();

    return {
      detruire: function () {
        try { renderer.dispose(); } catch (e) {}
        canvas.remove();
      }
    };
  }

  // ============================ LE REPLI CSS ===============================
  // Three.js absent ou WebGL refusé : des anneaux CSS animés prennent la suite,
  // avec les MÊMES huit états. L'information passe, la machine ne casse pas.
  function construireCSS(hote) {
    hote.classList.add('core-repli');
    hote.innerHTML =
      '<div class="css-core">' +
      '<div class="css-ring r1"></div><div class="css-ring r2"></div><div class="css-ring r3"></div>' +
      '<div class="css-heart"></div>' +
      '</div>';
    return { detruire: function () { hote.innerHTML = ''; } };
  }

  let moteur = null;

  function init(hoteOuSel) {
    const hote = typeof hoteOuSel === 'string' ? document.querySelector(hoteOuSel) : hoteOuSel;
    if (!hote) return false;
    moteur = construire3D(hote);
    state.moteur3d = !!moteur;
    if (!moteur) moteur = construireCSS(hote);
    appliquerEtat();
    publier();
    return true;
  }

  function appliquerEtat() {
    const E = ETATS[state.etat] || ETATS.IDLE;
    const A = AGENTS[state.agent] || AGENTS.aelyra;
    const c = '#' + ((state.etat === 'IDLE' || state.etat === 'SPEAKING') ? A.couleur : E.couleur).toString(16).padStart(6, '0');
    document.documentElement.style.setProperty('--core-couleur', c);
    document.body.setAttribute('data-core-etat', state.etat);
    document.body.setAttribute('data-core-agent', state.agent);
  }

  const IsaacCore = {
    ETATS: Object.keys(ETATS),
    AGENTS: AGENTS,
    init: init,
    // setEtat accepte n'importe quelle casse et ignore un état inconnu : mieux vaut
    // rester dans l'état vrai que d'afficher un état qui n'existe pas.
    setEtat: function (e) {
      const k = String(e || '').toUpperCase();
      if (!ETATS[k] || k === state.etat) return state.etat;
      state.etat = k; state.depuis = Date.now(); appliquerEtat(); publier(); return state.etat;
    },
    setAgent: function (a) {
      const k = String(a || '').toLowerCase();
      if (!AGENTS[k] || k === state.agent) return state.agent;
      state.agent = k; appliquerEtat(); publier(); return state.agent;
    },
    etat: function () { return { etat: state.etat, label: (ETATS[state.etat] || ETATS.IDLE).label, agent: state.agent, depuis: state.depuis, moteur3d: state.moteur3d }; },
    // Une erreur réseau ne doit pas rester affichée pour toujours : la page rappelle
    // l'état réel dès que le cerveau répond de nouveau.
    abonner: function (f) { if (typeof f === 'function') { abonnes.push(f); f(IsaacCore.etat()); } },
    detruire: function () { if (moteur && moteur.detruire) moteur.detruire(); moteur = null; }
  };

  window.IsaacCore = IsaacCore;
})();
